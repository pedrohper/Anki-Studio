import type { CardType } from "@/lib/schemas/tab";
import { clozeNumbers } from "@/lib/shared/cloze";
import { extractEnglishWords, stripHtml } from "@/lib/shared/text";

/**
 * Cliente do AnkiConnect (add-on 2055492159). Funciona de dois jeitos:
 * - "direct": o navegador chama o Anki em 127.0.0.1:8765. Exige liberar a
 *   origem do site em `webCorsOriginList` na configuração do add-on.
 * - "proxy": o navegador chama /api/anki e o servidor local repassa. Só existe
 *   quando o app roda na mesma máquina do Anki.
 */

export class AnkiError extends Error {
  constructor(
    message: string,
    public readonly kind: "offline" | "anki" | "unsupported" = "anki",
  ) {
    super(message);
    this.name = "AnkiError";
  }
}

export interface AnkiClientOptions {
  mode: "direct" | "proxy";
  url: string;
  key?: string;
  fetchImpl?: typeof fetch;
}

interface RawResponse {
  result: unknown;
  error: unknown;
}

export function createAnkiClient({ mode, url, key, fetchImpl = fetch }: AnkiClientOptions) {
  async function raw(action: string, params?: Record<string, unknown>): Promise<RawResponse> {
    const body = JSON.stringify({ action, version: 6, ...(params ? { params } : {}), ...(key ? { key } : {}) });
    let response: Response;
    try {
      response = await fetchImpl(mode === "proxy" ? "/api/anki" : url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch {
      throw new AnkiError("Não consegui falar com o Anki.", "offline");
    }
    const data = (await response.json().catch(() => null)) as RawResponse | null;
    if (!response.ok || !data) {
      // O proxy local devolve { error: { message } } quando o Anki está fechado.
      const proxyError = data?.error as { message?: unknown } | null | undefined;
      const message = typeof proxyError?.message === "string" ? proxyError.message : "O Anki não respondeu.";
      throw new AnkiError(message, "offline");
    }
    return data;
  }

  async function invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    const { result, error } = await raw(action, params);
    if (error) {
      const message = String(error);
      if (/unsupported action/i.test(message)) throw new AnkiError(message, "unsupported");
      throw new AnkiError(message);
    }
    return result as T;
  }

  return { raw, invoke };
}

export type AnkiClient = ReturnType<typeof createAnkiClient>;

// ---------- modelos de nota ----------

export interface NoteModel {
  name: string;
  fields: [string, string];
}

export interface ResolvedModels {
  basic: NoteModel;
  cloze: NoteModel | null;
}

const BASIC_HINT = /^(basic|básico|basico)$/i;
const CLOZE_HINT = /cloze|omiss|lacuna/i;

/** Descobre os tipos de nota certos na instalação (Basic, Básico, Cloze, Omissão...). */
export async function resolveModels(client: AnkiClient): Promise<ResolvedModels> {
  const names = await client.invoke<string[]>("modelNames");
  const fieldsOf = async (name: string): Promise<[string, string] | null> => {
    const fields = await client.invoke<string[]>("modelFieldNames", { modelName: name });
    if (fields.length === 0) return null;
    return [fields[0] as string, (fields[1] ?? fields[0]) as string];
  };

  const basicName =
    names.find((name) => BASIC_HINT.test(name)) ??
    names.find((name) => /basic|básico/i.test(name) && !/revers|invert|opcional|optional|type|digit/i.test(name));
  if (!basicName) throw new AnkiError("Não encontrei o tipo de nota Básico no seu Anki.");
  const basicFields = await fieldsOf(basicName);
  if (!basicFields) throw new AnkiError(`O tipo de nota "${basicName}" não tem campos.`);

  const clozeName = names.find((name) => CLOZE_HINT.test(name));
  const clozeFields = clozeName ? await fieldsOf(clozeName) : null;

  return {
    basic: { name: basicName, fields: basicFields },
    cloze: clozeName && clozeFields ? { name: clozeName, fields: clozeFields } : null,
  };
}

// ---------- envio em lote ----------

export interface OutgoingCard {
  id: string;
  type: CardType;
  front: string;
  back: string;
  audio?: { filename: string; base64: string };
}

export interface SendResult {
  added: string[];
  duplicates: string[];
  failed: Array<{ id: string; reason: string }>;
}

/** Sem tipo cloze no Anki: vira pergunta/resposta com as lacunas escondidas. */
export function clozeToBasic(front: string, back: string): { front: string; back: string } {
  const answers: string[] = [];
  const question = front.replace(/\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_m, answer: string, hint?: string) => {
    answers.push(answer);
    return `[${hint ?? "..."}]`;
  });
  const answerHtml = answers.map((answer) => `<b>${answer}</b>`).join(", ");
  return { front: question, back: back ? `${answerHtml}<br>${back}` : answerHtml };
}

/**
 * Pede ao Anki Desktop para sincronizar com o AnkiWeb (igual ao botão Sincronizar).
 * Assim os cards novos aparecem no AnkiDroid/AnkiMobile sem voltar ao PC.
 */
export async function syncAnkiWeb(client: AnkiClient): Promise<void> {
  await client.invoke("sync");
}

export async function sendCards(
  client: AnkiClient,
  { deckName, cards, tags }: { deckName: string; cards: OutgoingCard[]; tags: string[] },
): Promise<SendResult> {
  const models = await resolveModels(client);
  await client.invoke("createDeck", { deck: deckName });

  const notes = cards.map((card) => {
    const useCloze = card.type === "cloze" && models.cloze && clozeNumbers(card.front).length > 0;
    const model = useCloze && models.cloze ? models.cloze : models.basic;
    const content = card.type === "cloze" && !useCloze ? clozeToBasic(card.front, card.back) : card;
    const front = card.audio ? `${content.front} [sound:${card.audio.filename}]` : content.front;
    return {
      deckName,
      modelName: model.name,
      fields: { [model.fields[0]]: front, [model.fields[1]]: content.back },
      tags,
      options: { allowDuplicate: false, duplicateScope: "deck" },
    };
  });

  // 1) Descobre quais notas podem entrar (duplicadas no baralho ficam de fora).
  let canAdd: Array<{ ok: boolean; reason?: string }>;
  try {
    const detail = await client.invoke<Array<{ canAdd: boolean; error?: string }>>("canAddNotesWithErrorDetail", {
      notes,
    });
    canAdd = detail.map((item) => ({ ok: item.canAdd, reason: item.error }));
  } catch (error) {
    if (!(error instanceof AnkiError && error.kind === "unsupported")) throw error;
    const simple = await client.invoke<boolean[]>("canAddNotes", { notes });
    canAdd = simple.map((ok) => ({ ok, reason: ok ? undefined : "duplicate" }));
  }

  const result: SendResult = { added: [], duplicates: [], failed: [] };
  const toAdd: number[] = [];
  canAdd.forEach((check, index) => {
    const card = cards[index] as OutgoingCard;
    if (check.ok) toAdd.push(index);
    else if (!check.reason || /duplicate/i.test(check.reason)) result.duplicates.push(card.id);
    else result.failed.push({ id: card.id, reason: check.reason });
  });
  if (toAdd.length === 0) return result;

  // 2) Mídias primeiro, para o [sound:...] já apontar para um arquivo existente.
  for (const index of toAdd) {
    const audio = cards[index]?.audio;
    if (audio) await client.invoke("storeMediaFile", { filename: audio.filename, data: audio.base64 });
  }

  // 3) Um único addNotes com tudo.
  const response = await client.raw("addNotes", { notes: toAdd.map((index) => notes[index]) });
  const ids = Array.isArray(response.result) ? (response.result as Array<number | null>) : [];
  const errors = Array.isArray(response.error) ? (response.error as Array<string | null>) : [];
  if (!Array.isArray(response.result) && response.error) throw new AnkiError(String(response.error));

  toAdd.forEach((cardIndex, position) => {
    const card = cards[cardIndex] as OutgoingCard;
    if (ids[position]) result.added.push(card.id);
    else result.failed.push({ id: card.id, reason: errors[position] ?? "O Anki recusou esta nota." });
  });

  // 4) Atualiza a tela do Anki (sem importância se falhar).
  await client.invoke("guiDeckBrowser").catch(() => undefined);
  return result;
}

/** Lê as notas de um baralho e devolve as palavras em inglês encontradas. */
export async function wordsFromDeck(client: AnkiClient, deckName: string): Promise<string[]> {
  const ids = await client.invoke<number[]>("findNotes", { query: `deck:"${deckName.replace(/"/g, '\\"')}"` });
  if (ids.length === 0) return [];
  const words = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const notes = await client.invoke<Array<{ fields: Record<string, { value: string }> }>>("notesInfo", {
      notes: ids.slice(i, i + 500),
    });
    for (const note of notes) {
      for (const field of Object.values(note.fields))
        for (const word of extractEnglishWords(field.value)) words.add(word);
    }
  }
  return [...words];
}

// ---------- leitura de baralhos, estatísticas e pontos fracos ----------

export interface DeckStat {
  name: string;
  newCount: number;
  learnCount: number;
  reviewCount: number;
  total: number;
}

/** Contagens do dia por baralho (as mesmas da tela inicial do Anki). */
export async function deckStats(client: AnkiClient, decks: string[]): Promise<DeckStat[]> {
  if (decks.length === 0) return [];
  const raw = await client.invoke<
    Record<
      string,
      { name: string; new_count: number; learn_count: number; review_count: number; total_in_deck: number }
    >
  >("getDeckStats", { decks });
  return Object.values(raw).map((stat) => ({
    name: stat.name,
    newCount: stat.new_count,
    learnCount: stat.learn_count,
    reviewCount: stat.review_count,
    total: stat.total_in_deck,
  }));
}

/** Revisões por dia (data ISO, quantidade), do mais recente para o mais antigo. */
export async function reviewsByDay(client: AnkiClient): Promise<Array<{ date: string; count: number }>> {
  const raw = await client.invoke<Array<[string, number]>>("getNumCardsReviewedByDay");
  return raw.map(([date, count]) => ({ date, count }));
}

export interface NoteSample {
  front: string;
  back: string;
}

const escapeDeck = (deck: string) => deck.replace(/"/g, '\\"');

/** Amostra de notas de um baralho (inclui sub-baralhos), já sem HTML. */
export async function sampleDeck(
  client: AnkiClient,
  deckName: string,
  limit = 25,
): Promise<{ total: number; samples: NoteSample[] }> {
  const ids = await client.invoke<number[]>("findNotes", { query: `deck:"${escapeDeck(deckName)}"` });
  if (ids.length === 0) return { total: 0, samples: [] };
  // Espalha a amostra pelo baralho inteiro em vez de pegar só as primeiras notas.
  const step = Math.max(1, Math.floor(ids.length / limit));
  const picked = ids.filter((_, index) => index % step === 0).slice(0, limit);
  const notes = await client.invoke<Array<{ fields: Record<string, { value: string; order: number }> }>>("notesInfo", {
    notes: picked,
  });
  const samples = notes.map((note) => {
    const fields = Object.values(note.fields).sort((a, b) => a.order - b.order);
    return {
      front: stripHtml(fields[0]?.value ?? "").slice(0, 300),
      back: stripHtml(fields[1]?.value ?? "").slice(0, 300),
    };
  });
  return { total: ids.length, samples: samples.filter((sample) => sample.front) };
}

/** Frentes dos cards que já existem no baralho (para a IA não repetir). */
export async function existingFronts(client: AnkiClient, deckName: string, limit = 150): Promise<string[]> {
  const ids = await client.invoke<number[]>("findNotes", { query: `deck:"${escapeDeck(deckName)}"` });
  if (ids.length === 0) return [];
  const recent = ids.slice(-limit);
  const notes = await client.invoke<Array<{ fields: Record<string, { value: string; order: number }> }>>("notesInfo", {
    notes: recent,
  });
  return notes
    .map((note) => {
      const first = Object.values(note.fields).sort((a, b) => a.order - b.order)[0];
      return stripHtml(first?.value ?? "").slice(0, 200);
    })
    .filter(Boolean);
}

export interface StruggleCard {
  cardId: number;
  deckName: string;
  front: string;
  back: string;
  lapses: number;
  reps: number;
  /** Facilidade em % (250 = padrão do Anki). */
  ease: number;
}

/**
 * Cards que a pessoa mais erra: muitos lapsos, ou respondidos com "Errei"
 * nos últimos 30 dias. Ordenados pelos piores.
 */
export async function struggleCards(client: AnkiClient, deckName?: string, limit = 60): Promise<StruggleCard[]> {
  const scope = deckName ? `deck:"${escapeDeck(deckName)}" ` : "";
  const ids = await client.invoke<number[]>("findCards", { query: `${scope}(prop:lapses>=2 OR rated:30:1)` });
  if (ids.length === 0) return [];
  const infos: Array<{
    cardId: number;
    deckName: string;
    lapses: number;
    reps: number;
    factor: number;
    fields: Record<string, { value: string; order: number }>;
  }> = [];
  for (let i = 0; i < ids.length && i < 600; i += 200) {
    infos.push(...(await client.invoke<typeof infos>("cardsInfo", { cards: ids.slice(i, i + 200) })));
  }
  return infos
    .map((info) => {
      const fields = Object.values(info.fields).sort((a, b) => a.order - b.order);
      return {
        cardId: info.cardId,
        deckName: info.deckName,
        front: stripHtml(fields[0]?.value ?? "").slice(0, 300),
        back: stripHtml(fields[1]?.value ?? "").slice(0, 300),
        lapses: info.lapses,
        reps: info.reps,
        ease: Math.round(info.factor / 10),
      };
    })
    .filter((card) => card.front)
    .sort((a, b) => b.lapses - a.lapses || a.ease - b.ease)
    .slice(0, limit);
}

/** Abre o baralho no Anki Desktop (tela de estudo). */
export async function openDeckInAnki(client: AnkiClient, deckName: string) {
  await client.invoke("guiDeckOverview", { name: deckName });
}
