import { z } from "zod";
import { modelRefSchema, providerIdSchema } from "@/lib/llm/providers";
import { cardTypeSchema, tabForGenerationSchema, tabSettingsSchema } from "./tab";

export const MAX_MATERIAL_CHARS = 160_000;
export const MAX_WORDS_PER_REQUEST = 40;

export const generateRequestSchema = z
  .object({
    tab: tabForGenerationSchema,
    mode: z.enum(["material", "wordlist"]),
    material: z.string().max(MAX_MATERIAL_CHARS, "Material grande demais. Divida em partes menores."),
    words: z.array(z.string().trim().min(1).max(80)).max(MAX_WORDS_PER_REQUEST).default([]),
    sourceLabel: z.string().trim().max(200).default("Material colado"),
    availableDecks: z.array(z.string().max(200)).max(3_000).default([]),
    referenceContext: z.string().max(9_000).default(""),
    knownWords: z.array(z.string().max(60)).max(400).default([]),
    maxCards: z.number().int().min(1).max(80).default(40),
    /** Provedor e modelo que geram os cards (vazio = padrão do servidor). */
    llm: modelRefSchema.optional(),
    /** Frentes de cards que já existem no baralho, para a IA não repetir e completar lacunas. */
    existingCards: z.array(z.string().max(300)).max(200).default([]),
    /** "reinforcement": o material são cards que a pessoa erra; a IA cria reforço de outro ângulo. */
    purpose: z.enum(["study", "reinforcement"]).default("study"),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "material" && value.material.trim().length < 20) {
      ctx.addIssue({ code: "custom", path: ["material"], message: "Envie um material com pelo menos algumas frases." });
    }
    if (value.mode === "wordlist" && value.words.length === 0) {
      ctx.addIssue({ code: "custom", path: ["words"], message: "Informe pelo menos uma palavra." });
    }
  });
export type GenerateRequest = z.input<typeof generateRequestSchema>;
export type GenerateInput = z.output<typeof generateRequestSchema>;

export const promptRequestSchema = z.object({ settings: tabSettingsSchema, llm: modelRefSchema.optional() });
export type PromptRequest = z.infer<typeof promptRequestSchema>;

export const promptResponseSchema = z.object({
  systemPrompt: z.string().trim().min(50).max(12_000),
  summary: z.string().trim().max(600).default(""),
});
export type PromptResponse = z.infer<typeof promptResponseSchema>;

const cardSnapshotSchema = z.object({
  type: cardTypeSchema.default("basic"),
  front: z.string().max(6_000),
  back: z.string().max(10_000),
});

export const refineRequestSchema = z.object({
  tab: tabForGenerationSchema,
  signals: z.object({
    edited: z.array(z.object({ before: cardSnapshotSchema, after: cardSnapshotSchema })).max(30),
    discarded: z.array(cardSnapshotSchema).max(30),
    kept: z.number().int().min(0),
  }),
  llm: modelRefSchema.optional(),
});
export type RefineRequest = z.infer<typeof refineRequestSchema>;

export const refineResponseSchema = z.object({
  shouldChange: z.boolean(),
  proposedPrompt: z.string().trim().max(12_000).default(""),
  changes: z.array(z.string().trim().max(400)).max(10).default([]),
});
export type RefineResponse = z.infer<typeof refineResponseSchema>;

export const extractUrlRequestSchema = z.object({
  url: z.string().trim().min(4).max(2_000),
  kind: z.enum(["url", "youtube"]),
});
export const extractUrlResponseSchema = z.object({ title: z.string(), text: z.string() });
export type ExtractUrlResponse = z.infer<typeof extractUrlResponseSchema>;

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(600),
  voice: z.string().trim().max(80).optional(),
});
export const ttsResponseSchema = z.object({ audioBase64: z.string(), mimeType: z.string() });

export const apkgRequestSchema = z.object({
  deckName: z.string().trim().min(1).max(200),
  cards: z
    .array(
      z.object({
        type: cardTypeSchema,
        front: z.string().min(1).max(6_000),
        back: z.string().max(10_000),
        tags: z.array(z.string().max(80)).max(20).default([]),
      }),
    )
    .min(1)
    .max(500),
  media: z
    .array(z.object({ filename: z.string().regex(/^[\w.-]{1,120}$/), dataBase64: z.string().max(2_000_000) }))
    .max(500)
    .default([]),
});
export type ApkgRequest = z.input<typeof apkgRequestSchema>;

export const ankiProxyRequestSchema = z.object({
  action: z.string().regex(/^[a-zA-Z]{2,60}$/),
  version: z.literal(6),
  params: z.record(z.string(), z.unknown()).optional(),
  key: z.string().max(200).optional(),
});

export const providerStatusSchema = z.object({
  id: providerIdSchema,
  /** O servidor tem chave própria para este provedor (uso local). */
  serverKey: z.boolean(),
  /** Pode ser usado neste servidor (Ollama só localmente). */
  enabled: z.boolean(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const appConfigSchema = z.object({
  serverKeyAvailable: z.boolean(),
  ankiProxyEnabled: z.boolean(),
  model: z.string(),
  providers: z.array(providerStatusSchema).default([]),
  defaultGenerator: modelRefSchema.default({ provider: "deepseek", model: "" }),
  passwordProtected: z.boolean().default(false),
  lanAccess: z.boolean().default(false),
});

export const tunnelSnapshotSchema = z.object({
  status: z.enum(["off", "installing", "starting", "on", "error"]),
  url: z.string().nullable(),
  error: z.string().nullable(),
});
export type TunnelSnapshot = z.infer<typeof tunnelSnapshotSchema>;

export const accessStatusSchema = z.object({
  pinSet: z.boolean(),
  manageable: z.boolean(),
  tunnel: tunnelSnapshotSchema,
});
export type AccessStatus = z.infer<typeof accessStatusSchema>;

export const lanAddressesSchema = z.object({
  addresses: z.array(z.object({ ip: z.string(), url: z.string(), label: z.string() })),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});

export const keyCheckResponseSchema = z.object({
  valid: z.boolean(),
  balance: z.object({ currency: z.string(), total: z.string() }).nullable(),
  message: z.string(),
});
export type KeyCheckResponse = z.infer<typeof keyCheckResponseSchema>;

export const providerRequestSchema = z.object({ provider: providerIdSchema.default("deepseek") });

export const modelsResponseSchema = z.object({ models: z.array(z.string()) });

// ---------- revisão por um segundo modelo ----------

export const reviewVerdictSchema = z.enum(["ok", "fix", "remove"]);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export const cardReviewSchema = z.object({
  id: z.string(),
  verdict: reviewVerdictSchema,
  issues: z.array(z.string()).default([]),
  suggestion: z.object({ front: z.string(), back: z.string() }).nullable().default(null),
});
export type CardReview = z.infer<typeof cardReviewSchema>;

export const reviewRequestSchema = z.object({
  tab: tabForGenerationSchema,
  mode: z.enum(["material", "wordlist"]).default("material"),
  material: z.string().max(MAX_MATERIAL_CHARS).default(""),
  cards: z
    .array(
      z.object({ id: z.string(), type: cardTypeSchema, front: z.string().max(6_000), back: z.string().max(10_000) }),
    )
    .min(1)
    .max(80),
  llm: modelRefSchema.optional(),
});
export type ReviewRequest = z.input<typeof reviewRequestSchema>;

export const reviewResponseSchema = z.object({
  reviews: z.array(cardReviewSchema),
  summary: z.string(),
  reviewer: z.string(),
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

// ---------- baralhos do Anki viram abas ----------

const sampleSchema = z.object({ front: z.string().max(400), back: z.string().max(400) });

export const deckAnalysisRequestSchema = z.object({
  deckName: z.string().trim().min(1).max(200),
  subdecks: z.array(z.string().max(200)).max(200).default([]),
  noteCount: z.number().int().min(0),
  samples: z.array(sampleSchema).max(40),
  llm: modelRefSchema.optional(),
});
export type DeckAnalysisRequest = z.input<typeof deckAnalysisRequestSchema>;

export const deckAnalysisResponseSchema = z.object({
  name: z.string().trim().min(1).max(60),
  emoji: z.string().trim().min(1).max(16),
  goal: z.string().trim().min(10).max(2_000),
  cardLanguage: z.string().trim().min(2).max(40),
  cardTypes: z.array(cardTypeSchema).min(1),
  features: z.object({ audio: z.boolean(), knownVocabulary: z.boolean(), formulas: z.boolean(), code: z.boolean() }),
  sources: z.array(z.enum(["text", "pdf", "url", "youtube", "wordlist"])).min(1),
  systemPrompt: z.string().trim().min(50).max(12_000),
  summary: z.string().trim().max(600).default(""),
});
export type DeckAnalysisResponse = z.infer<typeof deckAnalysisResponseSchema>;

// ---------- material solto na tela Início: a IA escolhe a aba ----------

export const routeRequestSchema = z.object({
  material: z.string().trim().min(10).max(MAX_MATERIAL_CHARS),
  tabs: z
    .array(z.object({ id: z.string(), name: z.string(), goal: z.string(), deckName: z.string() }))
    .min(1)
    .max(100),
  llm: modelRefSchema.optional(),
});
export type RouteRequest = z.input<typeof routeRequestSchema>;

export const routeResponseSchema = z.object({
  tabId: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  sourceLabel: z.string(),
});
export type RouteResponse = z.infer<typeof routeResponseSchema>;

// ---------- pontos fracos ----------

export const weakSpotsRequestSchema = z.object({
  cards: z
    .array(
      z.object({
        id: z.string(),
        deckName: z.string().max(200),
        front: z.string().max(400),
        back: z.string().max(400),
        lapses: z.number().int().min(0),
        ease: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(80),
  llm: modelRefSchema.optional(),
});
export type WeakSpotsRequest = z.input<typeof weakSpotsRequestSchema>;

export const weakThemeSchema = z.object({
  title: z.string(),
  why: z.string(),
  tips: z.array(z.string()),
  cardIds: z.array(z.string()),
  deckName: z.string(),
});
export type WeakTheme = z.infer<typeof weakThemeSchema>;

export const weakSpotsResponseSchema = z.object({
  summary: z.string(),
  themes: z.array(weakThemeSchema),
  words: z.array(z.string()),
});
export type WeakSpotsResponse = z.infer<typeof weakSpotsResponseSchema>;
