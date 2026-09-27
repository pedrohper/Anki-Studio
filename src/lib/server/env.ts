import "server-only";
import { z } from "zod";
import { type ProviderId, providerIdSchema } from "@/lib/llm/providers";

const booleanFlag = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");

const optionalKey = z.string().trim().optional();

const envSchema = z.object({
  // Chaves de servidor por provedor (só são usadas com ALLOW_SERVER_KEY=true).
  DEEPSEEK_API_KEY: optionalKey,
  OPENAI_API_KEY: optionalKey,
  GEMINI_API_KEY: optionalKey,
  OPENROUTER_API_KEY: optionalKey,
  GROQ_API_KEY: optionalKey,
  MISTRAL_API_KEY: optionalKey,
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().trim().min(1).default("deepseek-flash"),
  /** Provedor e modelo padrão sugeridos a quem ainda não escolheu. */
  LLM_DEFAULT_PROVIDER: providerIdSchema.default("deepseek"),
  LLM_DEFAULT_MODEL: z.string().trim().default(""),
  /** Só ligue quando rodar localmente: permite usar as chaves do .env sem header. */
  ALLOW_SERVER_KEY: booleanFlag,
  /** Só ligue quando rodar localmente: libera o Ollama do próprio PC. */
  OLLAMA_ENABLED: booleanFlag,
  OLLAMA_BASE_URL: z.url().default("http://127.0.0.1:11434/v1"),
  /** Só ligue quando rodar localmente: a API repassa chamadas ao AnkiConnect. */
  ANKI_PROXY_ENABLED: booleanFlag,
  ANKI_CONNECT_URL: z.url().default("http://127.0.0.1:8765"),
  TTS_VOICE: z.string().trim().default("en-US-ChristopherNeural"),
  /** Requisições por minuto por IP nas rotas que custam dinheiro ou rede. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= envSchema.parse(process.env);
  return cached;
}

/** Usado nos testes para reler as variáveis. */
export function resetEnvCache() {
  cached = undefined;
}

const PLACEHOLDERS = new Set(["", "sua_chave_api_aqui"]);

/** Chave do servidor para o provedor, se estiver liberada (uso local). */
export function serverKeyFor(provider: ProviderId, env = getEnv()): string | undefined {
  if (!env.ALLOW_SERVER_KEY) return undefined;
  const byProvider: Record<ProviderId, string | undefined> = {
    deepseek: env.DEEPSEEK_API_KEY,
    openai: env.OPENAI_API_KEY,
    gemini: env.GEMINI_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
    groq: env.GROQ_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    ollama: env.OLLAMA_ENABLED ? "ollama" : undefined,
  };
  const key = byProvider[provider]?.trim();
  return key && !PLACEHOLDERS.has(key) ? key : undefined;
}

export function providerEnabled(provider: ProviderId, env = getEnv()): boolean {
  return provider === "ollama" ? env.OLLAMA_ENABLED : true;
}

/** Mantido por compatibilidade: existe alguma chave de servidor liberada? */
export function serverKeyAvailable(env = getEnv()): boolean {
  return providerIdSchema.options.some((provider) => provider !== "ollama" && Boolean(serverKeyFor(provider, env)));
}
