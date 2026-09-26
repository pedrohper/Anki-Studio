import "server-only";
import { z } from "zod";
import { PROVIDERS } from "@/lib/llm/providers";
import type { CardReview, ReviewResponse } from "@/lib/schemas/api";
import type { TabForGeneration } from "@/lib/schemas/tab";
import { hasCloze } from "@/lib/shared/cloze";
import { llmText, llmTextList } from "@/lib/shared/llm-zod";
import { mapWithConcurrency } from "./generate";
import type { CompleteJson, ResolvedLlm } from "./llm";
import { buildReviewSystemPrompt, buildReviewUserPrompt } from "./prompts/review";
import { sanitizeCardHtml } from "./sanitize";

const BATCH_SIZE = 20;
/** Material enviado ao revisor para conferir fatos (o suficiente para caber junto com os cards). */
const MATERIAL_FOR_REVIEW = 24_000;

const llmReviewSchema = z.object({
  summary: llmText(""),
  reviews: z
    .array(
      z.object({
        id: llmText(),
        verdict: z.string().catch("ok"),
        issues: llmTextList(),
        suggestion: z
          .object({ front: llmText(""), back: llmText("") })
          .nullable()
          .catch(null),
      }),
    )
    .catch([]),
});

interface ReviewInput {
  tab: TabForGeneration;
  mode: "material" | "wordlist";
  material: string;
  cards: Array<{ id: string; type: "basic" | "cloze"; front: string; back: string }>;
}

/** Normaliza o veredito do revisor e garante uma avaliação por card enviado. */
export function normalizeReviews(
  raw: z.infer<typeof llmReviewSchema>["reviews"],
  cards: ReviewInput["cards"],
): CardReview[] {
  const byId = new Map(raw.map((review) => [review.id, review]));
  return cards.map((card): CardReview => {
    const review = byId.get(card.id);
    if (!review) return { id: card.id, verdict: "ok", issues: [], suggestion: null };

    const verdict = review.verdict === "fix" || review.verdict === "remove" ? review.verdict : "ok";
    const issues = review.issues
      .map((issue) => issue.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (verdict !== "fix") return { id: card.id, verdict, issues, suggestion: null };

    const front = sanitizeCardHtml(review.suggestion?.front ?? "");
    const back = sanitizeCardHtml(review.suggestion?.back ?? "");
    const unchanged = front === card.front.trim() && back === card.back.trim();
    // Cloze precisa continuar com lacunas; sugestão vazia ou idêntica não serve.
    const invalid = !front || (card.type === "cloze" && !hasCloze(front)) || (card.type === "basic" && !back);
    if (unchanged || invalid) {
      return { id: card.id, verdict: issues.length ? "fix" : "ok", issues, suggestion: null };
    }
    return { id: card.id, verdict, issues, suggestion: { front, back } };
  });
}

export async function reviewCards(
  input: ReviewInput,
  llm: ResolvedLlm,
  complete: CompleteJson,
): Promise<ReviewResponse> {
  const system = buildReviewSystemPrompt(input.tab, input.mode);
  const material = input.material.slice(0, MATERIAL_FOR_REVIEW);
  const batches: ReviewInput["cards"][] = [];
  for (let i = 0; i < input.cards.length; i += BATCH_SIZE) batches.push(input.cards.slice(i, i + BATCH_SIZE));

  const results = await mapWithConcurrency(batches, 2, (batch) =>
    complete({
      llm,
      system,
      user: buildReviewUserPrompt(batch, material),
      schema: llmReviewSchema,
      temperature: 0.1,
      maxTokens: 8_000,
    }),
  );

  const reviews = normalizeReviews(
    results.flatMap((result) => result.reviews),
    input.cards,
  );
  const summary = results
    .map((result) => result.summary.trim())
    .filter(Boolean)
    .join(" ");
  return { reviews, summary, reviewer: `${PROVIDERS[llm.provider].name} · ${llm.model}` };
}
