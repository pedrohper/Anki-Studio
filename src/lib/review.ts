import type { CardReview, ReviewResponse } from "@/lib/schemas/api";
import type { Card, StudyPlan } from "@/lib/schemas/card";
import type { FeedbackEvent } from "@/lib/schemas/storage";
import { createId, nowIso } from "@/lib/shared/id";

/** Estado da revisão de um plano gerado, antes de ir para o Anki. */
export interface ReviewItem {
  card: Card;
  /** Como a IA gerou (para saber se a pessoa editou). */
  original: Card;
  included: boolean;
  status: "pending" | "sent" | "duplicate" | "failed";
  error?: string;
  /** Avaliação do modelo revisor, quando houver. */
  review?: CardReview;
  /** A pessoa já decidiu sobre a sugestão do revisor (aplicou ou ignorou). */
  reviewResolved?: "applied" | "ignored";
}

export interface ReviewerState {
  status: "running" | "done" | "error";
  /** Ex.: "OpenAI · gpt-5-mini" */
  label: string;
  summary?: string;
  error?: string;
}

export interface ReviewState {
  plan: StudyPlan;
  items: ReviewItem[];
  deckName: string;
  sourceLabel: string;
  mode: "material" | "wordlist";
  words: string[];
  /** Material original, usado pelo revisor para conferir fatos. */
  material: string;
  feedbackRecorded: boolean;
  reviewer?: ReviewerState;
}

export function createReview(
  plan: StudyPlan,
  options: {
    sourceLabel: string;
    mode: "material" | "wordlist";
    words: string[];
    fallbackDeck: string;
    material?: string;
  },
): ReviewState {
  return {
    plan,
    items: plan.cards.map((card) => ({ card, original: card, included: true, status: "pending" })),
    deckName: plan.deckName || options.fallbackDeck || plan.suggestedDeckName,
    sourceLabel: options.sourceLabel,
    mode: options.mode,
    words: options.words,
    material: options.material ?? "",
    feedbackRecorded: false,
  };
}

/** Junta as avaliações do revisor aos cards da revisão. */
export function applyReviewResponse(state: ReviewState, response: ReviewResponse): ReviewState {
  const byId = new Map(response.reviews.map((review) => [review.id, review]));
  return {
    ...state,
    items: state.items.map((item) => {
      const review = byId.get(item.card.id);
      return review ? { ...item, review, reviewResolved: undefined } : item;
    }),
    reviewer: { status: "done", label: response.reviewer, summary: response.summary },
  };
}

export function countReviews(items: ReviewItem[]) {
  const counts = { ok: 0, fix: 0, remove: 0, pending: 0 };
  for (const item of items) {
    if (!item.review) continue;
    if (item.reviewResolved) continue;
    counts[item.review.verdict]++;
  }
  counts.pending = counts.fix + counts.remove;
  return counts;
}

/** Aplica a correção sugerida pelo revisor (conta como edição para a aba aprender). */
export function applySuggestion(item: ReviewItem): ReviewItem {
  const suggestion = item.review?.suggestion;
  if (!suggestion) return item;
  return { ...item, card: { ...item.card, front: suggestion.front, back: suggestion.back }, reviewResolved: "applied" };
}

export function isEdited(item: ReviewItem): boolean {
  return (
    item.card.front.trim() !== item.original.front.trim() ||
    item.card.back.trim() !== item.original.back.trim() ||
    item.card.type !== item.original.type
  );
}

const snapshot = (card: Card) => ({ type: card.type, front: card.front, back: card.back });

/**
 * Transforma a revisão em sinais para a aba aprender: cards editados,
 * descartados e mantidos. Só conta cards ainda não enviados.
 */
export function buildFeedbackEvents(tabId: string, items: ReviewItem[]): FeedbackEvent[] {
  const createdAt = nowIso();
  return items.map((item): FeedbackEvent => {
    if (!item.included) return { id: createId(), tabId, kind: "discarded", before: snapshot(item.original), createdAt };
    if (isEdited(item)) {
      return {
        id: createId(),
        tabId,
        kind: "edited",
        before: snapshot(item.original),
        after: snapshot(item.card),
        createdAt,
      };
    }
    return { id: createId(), tabId, kind: "kept", createdAt };
  });
}

/** Resumo dos sinais acumulados para decidir se vale sugerir um prompt melhor. */
export function summarizeFeedback(events: FeedbackEvent[]) {
  const edited = events.filter((event) => event.kind === "edited" && event.before && event.after);
  const discarded = events.filter((event) => event.kind === "discarded" && event.before);
  return {
    edited: edited.map((event) => ({ before: event.before!, after: event.after! })).slice(-30),
    discarded: discarded.map((event) => event.before!).slice(-30),
    kept: events.filter((event) => event.kind === "kept").length,
    adjustments: edited.length + discarded.length,
  };
}
