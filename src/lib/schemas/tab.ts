import { z } from "zod";
import { tabLlmSchema } from "@/lib/llm/providers";

/**
 * Uma "aba" é um estúdio de estudo criado pela pessoa: ela descreve o objetivo,
 * a IA escreve o system prompt e a aba guarda as preferências de geração.
 * Tudo é salvo no navegador (IndexedDB), então o schema também valida
 * dados antigos e arquivos importados.
 */

export const SOURCE_KINDS = ["text", "pdf", "url", "youtube", "wordlist"] as const;
export const sourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const SOURCE_LABELS: Record<SourceKind, string> = {
  text: "Texto",
  pdf: "PDF / TXT / MD",
  url: "Link",
  youtube: "YouTube",
  wordlist: "Lista de palavras",
};

export const CARD_TYPES = ["basic", "cloze"] as const;
export const cardTypeSchema = z.enum(CARD_TYPES);
export type CardType = z.infer<typeof cardTypeSchema>;

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  basic: "Pergunta e resposta",
  cloze: "Lacunas (cloze)",
};

export const tabFeaturesSchema = z.object({
  /** Gera áudio (TTS) com a frase do card. */
  audio: z.boolean(),
  /** Usa o vocabulário conhecido para frases i+1. */
  knownVocabulary: z.boolean(),
  /** Destaca fórmulas e definições em caixas. */
  formulas: z.boolean(),
  /** Formata trechos de código em blocos. */
  code: z.boolean(),
});
export type TabFeatures = z.infer<typeof tabFeaturesSchema>;

export const FEATURE_LABELS: Record<keyof TabFeatures, { label: string; hint: string }> = {
  audio: { label: "Áudio", hint: "Gera a pronúncia da frase do card." },
  knownVocabulary: {
    label: "Vocabulário conhecido (i+1)",
    hint: "Frases em que só a palavra nova é desconhecida.",
  },
  formulas: { label: "Fórmulas", hint: "Destaca fórmulas e definições em caixas." },
  code: { label: "Código", hint: "Formata trechos de código em blocos." },
};

export const promptOriginSchema = z.enum(["template", "generated", "manual", "refined", "imported"]);
export type PromptOrigin = z.infer<typeof promptOriginSchema>;

export const promptVersionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().trim().min(1).max(12_000),
  origin: promptOriginSchema,
  note: z.string().max(1_000).optional(),
  createdAt: z.string(),
});
export type PromptVersion = z.infer<typeof promptVersionSchema>;

/** Configurações que a pessoa escolhe ao criar ou editar a aba. */
export const tabSettingsSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome para a aba.").max(60),
  emoji: z.string().trim().min(1).max(16),
  goal: z.string().trim().min(10, "Descreva o objetivo com um pouco mais de detalhe.").max(2_000),
  deckName: z.string().trim().min(1, "Informe o baralho padrão.").max(200),
  cardTypes: z.array(cardTypeSchema).min(1, "Escolha pelo menos um tipo de card."),
  cardLanguage: z.string().trim().min(2).max(40),
  features: tabFeaturesSchema,
  sources: z.array(sourceKindSchema).min(1, "Escolha pelo menos uma fonte."),
  ttsVoice: z.string().trim().max(80).optional(),
  /** Modelos desta aba; vazio herda o padrão das Configurações. */
  llm: tabLlmSchema.optional(),
});
export type TabSettings = z.infer<typeof tabSettingsSchema>;

export const tabSchema = tabSettingsSchema.extend({
  id: z.string().min(1),
  systemPrompt: z.string().trim().min(1).max(12_000),
  promptVersions: z.array(promptVersionSchema).max(50),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Tab = z.infer<typeof tabSchema>;

/** O que o servidor precisa saber da aba para gerar cards. */
export const tabForGenerationSchema = tabSettingsSchema.extend({
  systemPrompt: z.string().trim().min(1).max(12_000),
});
export type TabForGeneration = z.infer<typeof tabForGenerationSchema>;

/** Arquivo de compartilhamento de aba (exportar/importar). */
export const tabExportSchema = z.object({
  kind: z.literal("anki-studio/tab"),
  version: z.literal(1),
  exportedAt: z.string(),
  tab: tabSettingsSchema.extend({
    systemPrompt: z.string().trim().min(1).max(12_000),
  }),
});
export type TabExport = z.infer<typeof tabExportSchema>;
