import "server-only";
import { z } from "zod";
import {
  type DeckAnalysisRequest,
  type DeckAnalysisResponse,
  deckAnalysisResponseSchema,
  type RouteRequest,
  type RouteResponse,
  type WeakSpotsRequest,
  type WeakSpotsResponse,
} from "@/lib/schemas/api";
import { llmText, llmTextList } from "@/lib/shared/llm-zod";
import { ApiError } from "./errors";
import type { CompleteJson, ResolvedLlm } from "./llm";
import {
  buildDeckAnalysisUser,
  buildRouteUser,
  buildWeakSpotsUser,
  DECK_ANALYSIS_SYSTEM,
  ROUTE_SYSTEM,
  WEAK_SPOTS_SYSTEM,
} from "./prompts/insights";
import { toPlainText } from "./sanitize";

/** Lê um baralho existente e devolve a configuração sugerida para a aba. */
export async function analyzeDeck(
  input: DeckAnalysisRequest,
  llm: ResolvedLlm,
  complete: CompleteJson,
): Promise<DeckAnalysisResponse> {
  const lenient = deckAnalysisResponseSchema.extend({
    name: llmText(input.deckName),
    emoji: llmText("📚"),
    cardTypes: deckAnalysisResponseSchema.shape.cardTypes.catch(["basic"]),
    sources: deckAnalysisResponseSchema.shape.sources.catch(["text", "pdf", "url", "youtube"]),
    features: deckAnalysisResponseSchema.shape.features.catch({
      audio: false,
      knownVocabulary: false,
      formulas: false,
      code: false,
    }),
  });
  const result = await complete({
    llm,
    system: DECK_ANALYSIS_SYSTEM,
    user: buildDeckAnalysisUser(input),
    schema: lenient,
    temperature: 0.4,
    maxTokens: 3_000,
  });
  return {
    ...result,
    name: toPlainText(result.name).slice(0, 60) || input.deckName,
    emoji: [...result.emoji].slice(0, 2).join("") || "📚",
  };
}

const llmRouteSchema = z.object({
  tabId: llmText(),
  reason: llmText(""),
  confidence: z.coerce.number().catch(0.5),
  sourceLabel: llmText("Material"),
});

/** Escolhe a aba certa para um material solto. Nunca devolve uma aba que não existe. */
export async function routeMaterial(
  input: RouteRequest,
  llm: ResolvedLlm,
  complete: CompleteJson,
): Promise<RouteResponse> {
  const result = await complete({
    llm,
    system: ROUTE_SYSTEM,
    user: buildRouteUser(input),
    schema: llmRouteSchema,
    temperature: 0.1,
    maxTokens: 600,
  });
  const valid = input.tabs.some((tab) => tab.id === result.tabId);
  const fallback = input.tabs[0];
  if (!valid && !fallback) throw new ApiError(400, "Nenhuma aba disponível.", "no_tabs");
  return {
    tabId: valid ? result.tabId : (fallback?.id ?? ""),
    reason: valid ? toPlainText(result.reason) : "Não achei uma aba específica; usei a primeira.",
    confidence: valid
      ? Math.max(0, Math.min(1, result.confidence > 1 ? result.confidence / 100 : result.confidence))
      : 0,
    sourceLabel: toPlainText(result.sourceLabel).slice(0, 120) || "Material",
  };
}

const llmWeakSchema = z.object({
  summary: llmText(""),
  themes: z
    .array(
      z.object({
        title: llmText(),
        why: llmText(""),
        tips: llmTextList(),
        cardIds: llmTextList(),
        deckName: llmText(""),
      }),
    )
    .catch([]),
  words: llmTextList(),
});

/** Agrupa os cards mais errados em temas, com explicação e dicas. */
export async function analyzeWeakSpots(
  input: WeakSpotsRequest,
  llm: ResolvedLlm,
  complete: CompleteJson,
): Promise<WeakSpotsResponse> {
  const result = await complete({
    llm,
    system: WEAK_SPOTS_SYSTEM,
    user: buildWeakSpotsUser(input),
    schema: llmWeakSchema,
    temperature: 0.3,
    maxTokens: 4_000,
  });
  const ids = new Set(input.cards.map((card) => card.id));
  const decks = new Map(input.cards.map((card) => [card.id, card.deckName]));
  const themes = result.themes
    .map((theme) => {
      const cardIds = theme.cardIds.filter((id) => ids.has(id));
      return {
        title: toPlainText(theme.title).slice(0, 120),
        why: toPlainText(theme.why).slice(0, 600),
        tips: theme.tips
          .map((tip) => toPlainText(tip).slice(0, 300))
          .filter(Boolean)
          .slice(0, 4),
        cardIds,
        deckName: theme.deckName || decks.get(cardIds[0] ?? "") || "",
      };
    })
    .filter((theme) => theme.title && theme.cardIds.length > 0)
    .slice(0, 6);
  return {
    summary: toPlainText(result.summary).slice(0, 600),
    themes,
    words: [...new Set(result.words.map((word) => toPlainText(word).slice(0, 60)).filter(Boolean))].slice(0, 20),
  };
}
