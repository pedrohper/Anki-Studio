import "server-only";
import { z } from "zod";
import { PROVIDERS } from "@/lib/llm/providers";
import type { GenerateInput } from "@/lib/schemas/api";
import { type Card, llmCardSchema, type StudyPlan } from "@/lib/schemas/card";
import type { CardType } from "@/lib/schemas/tab";
import { hasCloze } from "@/lib/shared/cloze";
import { createId } from "@/lib/shared/id";
import { llmText, llmTextList } from "@/lib/shared/llm-zod";
import { normalizeForCompare, splitMaterial } from "@/lib/shared/text";
import { ApiError } from "./errors";
import type { CompleteJson, ResolvedLlm } from "./llm";
import { buildGenerationSystemPrompt, buildGenerationUserPrompt } from "./prompts/generation";
import { sanitizeCardHtml, toPlainText } from "./sanitize";

/** Tamanho de cada parte enviada ao modelo (cabe folgado no contexto). */
export const PART_MAX_CHARS = 18_000;
/** Acima disso a requisição fica cara e lenta demais para uma rodada só. */
export const MAX_PARTS = 8;
const WORDS_PER_PART = 12;
const CONCURRENCY = 3;

/** Resposta crua do modelo: tolerante, porque LLMs variam. */
const llmPlanSchema = z.object({
  subject: llmText("Assunto a revisar"),
  level: llmText("não identificado"),
  deckName: llmText(""),
  suggestedDeckName: llmText(""),
  routingReason: llmText(""),
  confidence: z.coerce.number().catch(0),
  studyNote: llmText(""),
  coverageSummary: llmText(""),
  tags: llmTextList(),
  cards: z.array(z.unknown()).catch([]),
});
type LlmPlan = z.infer<typeof llmPlanSchema>;

interface Part {
  index: number;
  total: number;
  content: string;
  words: string[];
}

function buildParts(input: GenerateInput): Part[] {
  if (input.mode === "wordlist") {
    const groups: string[][] = [];
    for (let i = 0; i < input.words.length; i += WORDS_PER_PART) groups.push(input.words.slice(i, i + WORDS_PER_PART));
    // Em lista de palavras, o material é só contexto opcional e vai inteiro (cortado) em cada parte.
    const context = input.material.slice(0, 6_000);
    return groups.map((words, index) => ({ index, total: groups.length, content: context, words }));
  }
  const chunks = splitMaterial(input.material, PART_MAX_CHARS);
  return chunks.map((content, index) => ({ index, total: chunks.length, content, words: [] }));
}

/** Roda tarefas assíncronas com no máximo `limit` ao mesmo tempo, mantendo a ordem. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const current = next++;
      results[current] = await fn(items[current] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Limpa e valida um card vindo da IA; devolve null quando não dá pra aproveitar. */
export function normalizeCard(raw: unknown, allowed: CardType[], withAudio: boolean): Card | null {
  const parsed = llmCardSchema.safeParse(raw);
  if (!parsed.success) return null;

  const front = sanitizeCardHtml(parsed.data.front);
  const back = sanitizeCardHtml(parsed.data.back);
  if (!front) return null;

  const wantsCloze = parsed.data.type === "cloze" || hasCloze(front);
  let type: CardType = wantsCloze && hasCloze(front) ? "cloze" : "basic";

  // Se a aba não permite o tipo escolhido, tenta adaptar em vez de descartar.
  if (!allowed.includes(type)) {
    if (type === "cloze" && allowed.includes("basic")) {
      type = "basic";
    } else {
      return null;
    }
  }
  if (type === "basic" && !back) return null;

  const frontText = type === "basic" ? front.replace(/\{\{c\d+::([\s\S]*?)(::[\s\S]*?)?\}\}/g, "$1") : front;
  const audioText = withAudio ? toPlainText(parsed.data.audioText ?? "") : "";

  return {
    id: createId(),
    type,
    front: frontText.slice(0, 6_000),
    back: back.slice(0, 10_000),
    ...(audioText ? { audioText: audioText.slice(0, 600) } : {}),
  };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

export async function generatePlan(input: GenerateInput, llm: ResolvedLlm, complete: CompleteJson): Promise<StudyPlan> {
  const parts = buildParts(input);
  if (parts.length === 0) throw new ApiError(400, "O material está vazio.", "empty_material");
  if (parts.length > MAX_PARTS) {
    throw new ApiError(
      413,
      `Material grande demais para uma rodada (${parts.length} partes; o limite é ${MAX_PARTS}). Divida em capítulos.`,
      "material_too_large",
    );
  }

  const system = buildGenerationSystemPrompt(input.tab, input.mode, input.purpose);
  const perPart =
    input.mode === "wordlist"
      ? Math.min(input.maxCards, 36)
      : Math.max(4, Math.min(30, Math.ceil(input.maxCards / parts.length)));

  const results: LlmPlan[] = await mapWithConcurrency(parts, CONCURRENCY, (part) =>
    complete({
      llm,
      system,
      user: buildGenerationUserPrompt({ input, part, maxCards: perPart }),
      schema: llmPlanSchema,
      temperature: 0.2,
    }),
  );

  const [first] = results;
  if (!first) throw new ApiError(502, "A IA não retornou um plano.", "bad_llm_output");

  // Junta os cards de todas as partes, sem repetir perguntas nem o que já existe no baralho.
  const existing = new Set(input.existingCards.map(normalizeForCompare));
  const seen = new Set<string>();
  const cards: Card[] = [];
  let alreadyInDeck = 0;
  for (const result of results) {
    for (const raw of result.cards) {
      const card = normalizeCard(raw, input.tab.cardTypes, input.tab.features.audio);
      if (!card) continue;
      const key = normalizeForCompare(card.front);
      if (existing.has(key)) {
        alreadyInDeck++;
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
  }

  const warnings: string[] = [];
  const cap = input.mode === "wordlist" ? Math.max(input.maxCards, input.words.length * 3) : input.maxCards;
  if (parts.length > 1) {
    warnings.push(`O material foi dividido em ${parts.length} partes para caber na IA; nada foi cortado.`);
  }
  if (alreadyInDeck > 0) {
    warnings.push(
      `${alreadyInDeck} ${alreadyInDeck === 1 ? "card foi descartado porque já existe" : "cards foram descartados porque já existem"} no baralho.`,
    );
  }
  if (cards.length > cap) {
    warnings.push(`A IA gerou ${cards.length} cards; mostrando os ${cap} primeiros.`);
    cards.length = cap;
  }

  // O baralho escolhido precisa existir de verdade (ou ser o padrão da aba).
  const validDecks = new Set([...input.availableDecks, input.tab.deckName]);
  const chosen = first.deckName.trim();
  const deckName = validDecks.has(chosen) ? chosen : "";
  const suggested = first.suggestedDeckName.trim() || (deckName ? "" : input.tab.deckName);

  const tags = [...new Set(results.flatMap((result) => result.tags))]
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    subject: first.subject.trim() || "Assunto a revisar",
    level: first.level.trim() || "não identificado",
    deckName,
    suggestedDeckName: suggested,
    routingReason: first.routingReason.trim(),
    confidence: clampConfidence(first.confidence),
    studyNote: first.studyNote.trim(),
    coverageSummary: results
      .map((result) => result.coverageSummary.trim())
      .filter(Boolean)
      .join(" "),
    tags,
    cards,
    warnings,
    parts: parts.length,
    generator: `${PROVIDERS[llm.provider].name} · ${llm.model}`,
  };
}
