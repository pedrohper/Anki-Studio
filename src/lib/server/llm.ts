import "server-only";
import OpenAI from "openai";
import { type ZodType, z } from "zod";
import { type ModelRef, PROVIDERS, type ProviderId } from "@/lib/llm/providers";
import { parseJsonLoose } from "@/lib/shared/json";
import { getEnv, providerEnabled, serverKeyFor } from "./env";
import { ApiError } from "./errors";
import { recordUsage } from "./usage";

/** Header com a chave do visitante para o provedor da requisição. */
export const API_KEY_HEADER = "x-llm-key";
/** Header antigo (só DeepSeek), aceito por compatibilidade. */
const LEGACY_KEY_HEADER = "x-deepseek-key";

/** Provedor + modelo + endereço + chave, prontos para a chamada. */
export interface ResolvedLlm {
  provider: ProviderId;
  model: string;
  baseURL: string;
  apiKey: string;
}

function baseUrlFor(provider: ProviderId): string {
  const env = getEnv();
  if (provider === "deepseek") return env.DEEPSEEK_BASE_URL;
  if (provider === "ollama") return env.OLLAMA_BASE_URL;
  return PROVIDERS[provider].baseURL;
}

function defaultModelFor(provider: ProviderId): string {
  return provider === "deepseek" ? getEnv().DEEPSEEK_MODEL : PROVIDERS[provider].defaultModel;
}

/**
 * Resolve qual chave e modelo usar: a chave vem do header (visitante) ou, só
 * quando o servidor permite (uso local), do .env. A chave nunca vai para log.
 */
export function resolveLlm(request: Request, ref: ModelRef | undefined): ResolvedLlm {
  const env = getEnv();
  const provider = ref?.provider ?? env.LLM_DEFAULT_PROVIDER;
  const info = PROVIDERS[provider];
  if (!providerEnabled(provider, env)) {
    throw new ApiError(
      400,
      `${info.name} só está disponível quando o app roda no seu computador.`,
      "provider_disabled",
    );
  }

  const fromHeader =
    request.headers.get(API_KEY_HEADER)?.trim() ||
    (provider === "deepseek" ? request.headers.get(LEGACY_KEY_HEADER)?.trim() : undefined);
  const apiKey = fromHeader || serverKeyFor(provider, env) || (info.keyless ? "ollama" : undefined);
  if (!apiKey) {
    throw new ApiError(401, `Informe sua chave de ${info.name} nas configurações para usar a IA.`, "missing_key");
  }

  const model = ref
    ? ref.model.trim() || defaultModelFor(provider)
    : env.LLM_DEFAULT_MODEL || defaultModelFor(provider);
  if (!model) throw new ApiError(400, `Escolha um modelo de ${info.name} nas configurações.`, "missing_model");

  return { provider, model, baseURL: baseUrlFor(provider), apiKey };
}

/** Mantido para rotas que só precisam da chave (DeepSeek). */
export function resolveApiKey(request: Request): string {
  return resolveLlm(request, { provider: "deepseek", model: "" }).apiKey;
}

export interface CompleteJsonOptions<T extends ZodType> {
  llm: ResolvedLlm;
  system: string;
  user: string;
  schema: T;
  temperature?: number;
  maxTokens?: number;
}

/** Assinatura usada pelas funções de alto nível; nos testes vira um mock. */
export type CompleteJson = <T extends ZodType>(options: CompleteJsonOptions<T>) => Promise<z.output<T>>;

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type ChatClient = {
  chat: { completions: { create: (params: ChatParams) => Promise<OpenAI.Chat.Completions.ChatCompletion> } };
};

function isGeminiModel(llm: Pick<ResolvedLlm, "provider" | "model">): boolean {
  return llm.provider === "gemini" || (llm.provider === "openrouter" && /gemini/i.test(llm.model));
}

/** Modelos de raciocínio da OpenAI não aceitam temperature nem max_tokens. */
function isReasoningModel(llm: Pick<ResolvedLlm, "provider" | "model">): boolean {
  const model = llm.model.replace(/^openai\//, "");
  return (llm.provider === "openai" || llm.provider === "openrouter") && /^(gpt-5|o\d)/i.test(model);
}

export function buildChatParams(
  llm: Pick<ResolvedLlm, "provider" | "model">,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
): ChatParams {
  const params: ChatParams = {
    model: llm.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
  if (isReasoningModel(llm)) {
    params.max_completion_tokens = maxTokens * 2;
  } else {
    params.temperature = temperature;
    params.max_tokens = maxTokens;
  }
  // Gemini "pensa" antes de responder e esse raciocínio gasta o mesmo limite de
  // tokens da resposta: sem isto, o JSON pode sair cortado no meio.
  if (isGeminiModel(llm)) {
    params.max_tokens = maxTokens * 2;
    if (llm.provider === "gemini") params.reasoning_effort = "low";
    else Object.assign(params, { reasoning: { effort: "low" } });
  }
  // Os modelos novos da DeepSeek (ex.: deepseek-flash) "pensam" por padrão, e o
  // raciocínio gasta o mesmo limite da resposta: com limites curtos (ex.: escolher
  // a aba) sobrava 0 caractere de JSON. Para gerar JSON, pensar não compensa.
  if (llm.provider === "deepseek") Object.assign(params, { thinking: { type: "disabled" } });
  return params;
}

/**
 * Cada provedor aceita um conjunto um pouco diferente de parâmetros. Se o
 * provedor recusar algum (erro 400 citando o parâmetro), tenta de novo sem ele.
 */
export async function createWithFallbacks(client: ChatClient, initial: ChatParams) {
  let params = { ...initial };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (error) {
      if (!(error instanceof OpenAI.APIError) || error.status !== 400) throw error;
      const message = String(error.message).toLowerCase();
      const next = { ...params };
      if (message.includes("thinking") && "thinking" in next) {
        delete (next as Record<string, unknown>).thinking;
      } else if (message.includes("reasoning") && (next.reasoning_effort !== undefined || "reasoning" in next)) {
        delete next.reasoning_effort;
        delete (next as Record<string, unknown>).reasoning;
      } else if (message.includes("response_format") || message.includes("json")) delete next.response_format;
      else if (message.includes("max_tokens") && next.max_tokens !== undefined) {
        next.max_completion_tokens = next.max_tokens;
        delete next.max_tokens;
      } else if (message.includes("temperature") && next.temperature !== undefined) delete next.temperature;
      else throw error;
      params = next;
    }
  }
  return client.chat.completions.create(params);
}

/** Chama o modelo em modo JSON e valida a resposta com Zod. */
export const completeJson: CompleteJson = async ({
  llm,
  system,
  user,
  schema,
  temperature = 0.3,
  maxTokens = 8_000,
}) => {
  const client = new OpenAI({ apiKey: llm.apiKey, baseURL: llm.baseURL, timeout: 180_000, maxRetries: 2 });
  const badOutput = () =>
    new ApiError(
      502,
      `A IA (${PROVIDERS[llm.provider].name}) respondeu fora do formato esperado. Tente de novo ou use outro modelo.`,
      "bad_llm_output",
    );

  // Às vezes o modelo devolve JSON cortado ou fora do formato: tenta uma segunda vez antes de desistir.
  let spentOnThinking = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let content: string;
    try {
      // Na segunda tentativa, aumenta o limite: a causa mais comum de JSON inválido é resposta cortada.
      // Se o modelo gastou tudo "pensando" (resposta vazia), aumenta bem mais.
      const limit = attempt === 1 ? maxTokens : Math.max(maxTokens * 2, spentOnThinking ? 8_000 : 0);
      const response = await createWithFallbacks(client, buildChatParams(llm, system, user, temperature, limit));
      content = response.choices[0]?.message?.content ?? "";
      recordUsage({
        provider: llm.provider,
        model: llm.model,
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
      });
      if (response.choices[0]?.finish_reason === "length") {
        spentOnThinking = content.trim().length === 0;
        console.warn(
          `[llm] ${llm.provider}/${llm.model} atingiu o limite de tokens (tentativa ${attempt})${spentOnThinking ? ", gasto todo no raciocínio" : ""}`,
        );
      }
    } catch (error) {
      throw toApiError(error, llm.provider);
    }

    let parsed: unknown;
    try {
      parsed = parseJsonLoose(content);
    } catch {
      console.warn(
        `[llm] ${llm.provider}/${llm.model} devolveu JSON inválido (${content.length} caracteres), tentativa ${attempt}`,
      );
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    // Só os caminhos dos campos, sem conteúdo (pode ter material da pessoa).
    console.warn(
      `[llm] ${llm.provider}/${llm.model} respondeu fora do schema (tentativa ${attempt}):`,
      result.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.code}`),
    );
    if (process.env.DEBUG_LLM === "1") console.warn("[llm:debug]", JSON.stringify(parsed).slice(0, 600));
  }
  throw badOutput();
};

export function toApiError(error: unknown, provider: ProviderId): ApiError {
  if (error instanceof ApiError) return error;
  const name = PROVIDERS[provider].name;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new ApiError(504, "A IA demorou demais para responder. Tente um material menor.", "llm_timeout");
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new ApiError(
      502,
      provider === "ollama" ? "Não encontrei o Ollama. Ele está aberto?" : `Não foi possível falar com ${name}.`,
      "llm_unreachable",
    );
  }
  if (error instanceof OpenAI.APIError) {
    switch (error.status) {
      case 401:
      case 403:
        return new ApiError(
          401,
          `Chave de ${name} inválida ou sem permissão. Confira nas configurações.`,
          "invalid_key",
        );
      case 402:
        return new ApiError(402, `A conta de ${name} está sem saldo.`, "no_balance");
      case 404:
        return new ApiError(
          400,
          `${name} não encontrou esse modelo. Escolha outro nas configurações.`,
          "unknown_model",
        );
      case 429: {
        const detail = `${error.code ?? ""} ${error.type ?? ""} ${error.message}`.toLowerCase();
        if (/quota|credit|billing|balance/.test(detail)) {
          return new ApiError(
            402,
            `A conta de ${name} está sem créditos. Adicione saldo no painel de ${name}.`,
            "no_balance",
          );
        }
        return new ApiError(
          429,
          `${name} está limitando as requisições agora. Espere alguns segundos e tente de novo.`,
          "llm_rate_limited",
        );
      }
      default:
        if (error.status && error.status >= 500) {
          return new ApiError(502, `${name} está instável no momento. Tente de novo em instantes.`, "llm_unavailable");
        }
        if (error.status === 400) {
          return new ApiError(
            400,
            `${name} recusou o pedido: ${String(error.message).slice(0, 200)}`,
            "llm_bad_request",
          );
        }
    }
  }
  return new ApiError(502, "Falha ao chamar a IA.", "llm_error");
}

// ---------- chave e lista de modelos ----------

export interface KeyCheck {
  valid: boolean;
  balance: { currency: string; total: string } | null;
  message: string;
}

const deepseekBalanceSchema = z.object({
  is_available: z.boolean().optional(),
  balance_infos: z.array(z.object({ currency: z.string(), total_balance: z.string() })).default([]),
});

const openrouterKeySchema = z.object({
  data: z.object({ limit_remaining: z.number().nullable().optional(), limit: z.number().nullable().optional() }),
});

const INVALID: KeyCheck = {
  valid: false,
  balance: null,
  message: "Chave inválida. Confira se copiou a chave inteira.",
};

/** Confere se a chave funciona sem gastar crédito (saldo, dados da chave ou lista de modelos). */
export async function checkLlmKey(llm: Omit<ResolvedLlm, "model">, fetchImpl: typeof fetch = fetch): Promise<KeyCheck> {
  const info = PROVIDERS[llm.provider];
  const base = llm.baseURL.replace(/\/+$/, "");
  const call = (path: string) =>
    fetchImpl(`${base}${path}`, {
      headers: { authorization: `Bearer ${llm.apiKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw new ApiError(
        502,
        llm.provider === "ollama"
          ? "Não encontrei o Ollama. Ele está aberto?"
          : `Não foi possível falar com ${info.name}.`,
        "llm_unreachable",
      );
    });

  if (info.keyCheck === "deepseek-balance") {
    const response = await call("/user/balance");
    if (response.status === 401 || response.status === 403) return INVALID;
    if (response.ok) {
      const parsed = deepseekBalanceSchema.safeParse(await response.json().catch(() => null));
      const balance = parsed.success ? parsed.data.balance_infos[0] : undefined;
      const available = parsed.success ? parsed.data.is_available !== false : true;
      return {
        valid: true,
        balance: balance ? { currency: balance.currency, total: balance.total_balance } : null,
        message: available ? "Chave válida." : `Chave válida, mas sem saldo. Recarregue no painel de ${info.name}.`,
      };
    }
  }

  if (info.keyCheck === "openrouter-key") {
    const response = await call("/key");
    if (response.status === 401 || response.status === 403) return INVALID;
    if (response.ok) {
      const parsed = openrouterKeySchema.safeParse(await response.json().catch(() => null));
      const remaining = parsed.success ? parsed.data.data.limit_remaining : null;
      return {
        valid: true,
        balance: typeof remaining === "number" ? { currency: "USD", total: remaining.toFixed(2) } : null,
        message: "Chave válida.",
      };
    }
  }

  const models = await call("/models");
  if (models.ok) return { valid: true, balance: null, message: "Chave válida." };
  if (models.status === 401 || models.status === 403 || models.status === 400) return INVALID;
  throw new ApiError(502, `${info.name} está instável no momento. Tente de novo em instantes.`, "llm_unavailable");
}

/** Mantido por compatibilidade com a primeira versão (DeepSeek). */
export function checkApiKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<KeyCheck> {
  return checkLlmKey({ provider: "deepseek", apiKey, baseURL: getEnv().DEEPSEEK_BASE_URL }, fetchImpl);
}

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })).default([]) });

/** Lista os modelos de chat do provedor (sem embeddings, áudio, imagem…). */
export async function listModels(llm: Omit<ResolvedLlm, "model">, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const base = llm.baseURL.replace(/\/+$/, "");
  const response = await fetchImpl(`${base}/models`, {
    headers: { authorization: `Bearer ${llm.apiKey}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new ApiError(502, `Não foi possível falar com ${PROVIDERS[llm.provider].name}.`, "llm_unreachable");
  });
  if (response.status === 401 || response.status === 403) throw new ApiError(401, INVALID.message, "invalid_key");
  if (!response.ok) throw new ApiError(502, "Não consegui a lista de modelos.", "llm_unavailable");
  const parsed = modelsSchema.safeParse(await response.json().catch(() => null));
  const ids = parsed.success ? parsed.data.data.map((model) => model.id.replace(/^models\//, "")) : [];
  const excluded =
    /embed|whisper|tts|audio|transcribe|realtime|image|dall-e|vision-preview|moderation|guard|search|veo|imagen|aqa|ocr|orpheus|voxtral|babbage|davinci|codex/i;
  return [...new Set(ids.filter((id) => !excluded.test(id)))].sort((a, b) => a.localeCompare(b));
}
