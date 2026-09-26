import { z } from "zod";

/**
 * Provedores de IA suportados. Todos falam o formato da API da OpenAI, então
 * um único cliente atende todos: muda só o endereço, a chave e o modelo.
 * A lista é fechada de propósito: no site público o servidor só chama estes
 * endereços (nada de URL arbitrária, que abriria brecha para SSRF).
 */

export const PROVIDER_IDS = ["deepseek", "openai", "gemini", "openrouter", "groq", "mistral", "ollama"] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Uma frase para ajudar a escolher. */
  tagline: string;
  baseURL: string;
  /** Modelo sugerido quando a pessoa ainda não escolheu (a lista real vem da API). */
  defaultModel: string;
  /** Onde criar a chave. */
  keyUrl: string;
  /** Variável de ambiente com a chave do servidor (uso local). */
  envKey: string;
  /** Só existe rodando localmente (ex.: Ollama no próprio PC). */
  localOnly?: boolean;
  /** Não precisa de chave. */
  keyless?: boolean;
  /** Como validar a chave sem gastar crédito. */
  keyCheck: "deepseek-balance" | "openrouter-key" | "models";
  /** Para que ele é melhor, em poucas palavras (aparece no onboarding). */
  bestFor: string[];
  /** Custo aproximado: 0 = grátis, 1 = muito barato, 2 = barato, 3 = médio. */
  costTier: 0 | 1 | 2 | 3;
  /** Estimativa com o modelo padrão, para ~100 materiais de estudo. */
  costPer100: string;
  /** Preço do modelo padrão por milhão de tokens (entrada / saída). */
  priceDetail: string;
  /** Plano gratuito, se houver. */
  freeTier?: string;
  pricingUrl: string;
}

/**
 * Preços consultados em setembro de 2026 nas páginas oficiais e em
 * agregadores. Mudam com frequência: a interface sempre mostra o link
 * oficial e a data. A estimativa considera ~6 mil tokens de entrada e
 * ~2,5 mil de saída por material (uma aula de algumas páginas).
 */
export const PRICES_CHECKED_AT = "setembro de 2026";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    tagline: "Barato e bom no dia a dia. Padrão do Anki Studio.",
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
    keyUrl: "https://platform.deepseek.com/api_keys",
    envKey: "DEEPSEEK_API_KEY",
    keyCheck: "deepseek-balance",
    bestFor: ["Uso diário com ótimo custo-benefício", "Português e exatas", "Gerar cards (padrão do app)"],
    costTier: 1,
    costPer100: "≈ US$ 0,50",
    priceDetail: "deepseek-flash: US$ 0,30 / 1,20 por milhão de tokens (metade fora do horário de pico)",
    pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    tagline: "Modelos GPT. Qualidade alta e estável.",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-5-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    envKey: "OPENAI_API_KEY",
    keyCheck: "models",
    bestFor: ["Qualidade consistente", "Bom revisor", "Seguir instruções à risca"],
    costTier: 2,
    costPer100: "≈ US$ 1",
    priceDetail: "gpt-5-mini: US$ 0,25 / 2,00 por milhão de tokens",
    pricingUrl: "https://openai.com/api/pricing",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    tagline: "Tem plano gratuito no Google AI Studio.",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    envKey: "GEMINI_API_KEY",
    keyCheck: "models",
    bestFor: ["Materiais longos (PDFs grandes)", "Testar de graça", "Vídeos e conteúdo variado"],
    costTier: 2,
    costPer100: "≈ US$ 1,40",
    priceDetail: "gemini-3.8-flash: US$ 0,75 / 3,75 por milhão de tokens (preço promocional até dez/2026)",
    freeTier: "Plano gratuito com limite de uso no Google AI Studio",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "Uma chave para centenas de modelos (Claude, Llama, Qwen…).",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    keyUrl: "https://openrouter.ai/settings/keys",
    envKey: "OPENROUTER_API_KEY",
    keyCheck: "openrouter-key",
    bestFor: ["Experimentar muitos modelos com uma chave", "Usar Claude, Llama, Qwen e outros", "Comparar qualidade"],
    costTier: 2,
    costPer100: "depende do modelo",
    priceDetail:
      "Cobra o preço do modelo escolhido + uma taxa pequena na compra de créditos; o “auto” escolhe o modelo por você",
    freeTier: "Alguns modelos gratuitos (com limite), marcados com :free",
    pricingUrl: "https://openrouter.ai/models",
  },
  groq: {
    id: "groq",
    name: "Groq",
    tagline: "Respostas muito rápidas com modelos abertos.",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    keyUrl: "https://console.groq.com/keys",
    envKey: "GROQ_API_KEY",
    keyCheck: "models",
    bestFor: ["Velocidade (respostas em 2 a 3 segundos)", "Revisor rápido e barato", "Listas de palavras"],
    costTier: 1,
    costPer100: "≈ US$ 0,25",
    priceDetail: "gpt-oss-120b: US$ 0,15 / 0,60 por milhão de tokens",
    freeTier: "Plano gratuito sem cartão, com limite por minuto e por dia",
    pricingUrl: "https://groq.com/pricing",
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    tagline: "Modelos europeus, baratos e bons em português.",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    keyUrl: "https://console.mistral.ai/api-keys",
    envKey: "MISTRAL_API_KEY",
    keyCheck: "models",
    bestFor: ["Barato e bom em línguas europeias", "Dados na Europa (LGPD/GDPR)", "Revisor alternativo"],
    costTier: 1,
    costPer100: "≈ US$ 0,25",
    priceDetail: "mistral-small: US$ 0,15 / 0,60 por milhão de tokens",
    pricingUrl: "https://mistral.ai/pricing",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (no seu PC)",
    tagline: "Modelos rodando no seu computador, de graça. Só quando o app roda local.",
    baseURL: "http://127.0.0.1:11434/v1",
    defaultModel: "",
    keyUrl: "https://ollama.com/download",
    envKey: "OLLAMA_API_KEY",
    localOnly: true,
    keyless: true,
    keyCheck: "models",
    bestFor: ["Privacidade total: nada sai do seu PC", "Uso sem custo", "Funciona offline"],
    costTier: 0,
    costPer100: "grátis",
    priceDetail: "Roda no seu computador; a qualidade e a velocidade dependem da sua placa de vídeo e memória",
    pricingUrl: "https://ollama.com/library",
  },
};

export const PROVIDER_LIST = PROVIDER_IDS.map((id) => PROVIDERS[id]);

/** Combinação sugerida para quem não sabe o que escolher (testada: gera bem e o revisor pega erros). */
export const RECOMMENDED_COMBO = {
  generator: { provider: "deepseek", model: "" } as ModelRef,
  reviewer: { provider: "groq", model: "" } as ModelRef,
  costPer100: "≈ US$ 0,75",
};

/** Qual provedor e qual modelo. Modelo vazio = o padrão do provedor. */
export const modelRefSchema = z.object({
  provider: providerIdSchema,
  model: z.string().trim().max(200).default(""),
});
export type ModelRef = z.infer<typeof modelRefSchema>;

export const DEFAULT_GENERATOR: ModelRef = { provider: "deepseek", model: "" };

export function modelOf(ref: ModelRef): string {
  return ref.model.trim() || PROVIDERS[ref.provider].defaultModel;
}

/** "DeepSeek · deepseek-flash" */
export function describeModel(ref: ModelRef): string {
  const model = modelOf(ref);
  return model ? `${PROVIDERS[ref.provider].name} · ${model}` : PROVIDERS[ref.provider].name;
}

/** Configuração de modelos da aba: vazio herda o padrão global; reviewer null = sem revisão. */
export const tabLlmSchema = z.object({
  generator: modelRefSchema.optional(),
  reviewer: modelRefSchema.nullable().optional(),
});
export type TabLlm = z.infer<typeof tabLlmSchema>;

/**
 * Escolhe, entre os modelos que a API devolveu, um bom padrão: prefere o
 * padrão conhecido e depois nomes de modelos rápidos/baratos.
 */
export function suggestModel(provider: ProviderId, available: string[]): string {
  const known = PROVIDERS[provider].defaultModel;
  if (known && available.includes(known)) return known;
  const preferences = [
    /flash(?!.*(image|tts|audio|live))/i,
    /mini(?!.*(audio|realtime|tts|transcribe))/i,
    /medium-latest/,
    /chat/i,
    /70b|120b/i,
  ];
  for (const pattern of preferences) {
    const match = available.find(
      (model) => pattern.test(model) && !/embed|vision|whisper|guard|moderation/i.test(model),
    );
    if (match) return match;
  }
  const chatModels = available.filter((model) => !/embed|vision|whisper|guard|moderation/i.test(model));
  return known || chatModels[0] || available[0] || "";
}
