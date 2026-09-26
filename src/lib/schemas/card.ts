import { z } from "zod";
import { llmText } from "@/lib/shared/llm-zod";
import { cardTypeSchema } from "./tab";

export const cardSchema = z.object({
  id: z.string().min(1),
  type: cardTypeSchema,
  front: z.string().trim().min(1).max(6_000),
  back: z.string().max(10_000),
  /** Texto que vira áudio (TTS) quando a aba tem áudio ligado. */
  audioText: z.string().trim().max(600).optional(),
});
export type Card = z.infer<typeof cardSchema>;

/** Card como a IA devolve: mais tolerante, normalizado depois no servidor. */
export const llmCardSchema = z.object({
  type: z.string().optional(),
  front: llmText(""),
  back: llmText(""),
  audioText: llmText().optional(),
});
export type LlmCard = z.infer<typeof llmCardSchema>;

export const studyPlanSchema = z.object({
  subject: z.string(),
  level: z.string(),
  /** Baralho existente escolhido pela IA (vazio quando nenhum serve). */
  deckName: z.string(),
  suggestedDeckName: z.string(),
  routingReason: z.string(),
  confidence: z.number().min(0).max(1),
  studyNote: z.string(),
  coverageSummary: z.string(),
  tags: z.array(z.string()),
  cards: z.array(cardSchema),
  /** Avisos para a interface (ex.: material dividido em partes, limite atingido). */
  warnings: z.array(z.string()),
  parts: z.number().int().min(1),
  /** Provedor e modelo que geraram (ex.: "DeepSeek · deepseek-flash"). */
  generator: z.string().default(""),
});
export type StudyPlan = z.infer<typeof studyPlanSchema>;
