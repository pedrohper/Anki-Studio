import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeModel, PROVIDERS, suggestModel } from "@/lib/llm/providers";
import { applyReviewResponse, applySuggestion, countReviews, createReview } from "@/lib/review";
import type { StudyPlan } from "@/lib/schemas/card";
import { resetEnvCache } from "@/lib/server/env";
import { buildChatParams, checkLlmKey, createWithFallbacks, listModels, resolveLlm } from "@/lib/server/llm";
import { normalizeReviews, reviewCards } from "@/lib/server/review";
import { makeTab } from "../support/factories";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api", { method: "POST", headers });

describe("registro de provedores", () => {
  it("descreve e sugere modelos", () => {
    expect(describeModel({ provider: "deepseek", model: "" })).toBe("DeepSeek · deepseek-flash");
    expect(suggestModel("openai", ["gpt-4.1", "gpt-5-mini", "gpt-5"])).toBe("gpt-5-mini");
    expect(suggestModel("ollama", ["nomic-embed-text", "llama3.1:8b", "qwen3:14b"])).toBe("llama3.1:8b");
    expect(suggestModel("gemini", ["gemini-9-pro", "gemini-9-flash-image", "gemini-9-flash"])).toBe("gemini-9-flash");
  });

  it("todo provedor usa https, menos o Ollama local", () => {
    for (const provider of Object.values(PROVIDERS)) {
      expect(provider.baseURL.startsWith(provider.localOnly ? "http://127.0.0.1" : "https://")).toBe(true);
    }
  });
});

describe("resolveLlm", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOW_SERVER_KEY", "false");
    vi.stubEnv("OLLAMA_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "sk-servidor-openai");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("usa a chave do header e o modelo pedido", () => {
    const llm = resolveLlm(req({ "x-llm-key": "sk-visitante" }), { provider: "openai", model: "gpt-5-mini" });
    expect(llm).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-visitante",
    });
  });

  it("modelo vazio usa o padrão do provedor", () => {
    expect(resolveLlm(req({ "x-llm-key": "k" }), { provider: "groq", model: "" }).model).toBe(
      PROVIDERS.groq.defaultModel,
    );
  });

  it("não usa a chave do servidor em deploy público", () => {
    expect(() => resolveLlm(req(), { provider: "openai", model: "" })).toThrow(/Informe sua chave de OpenAI/);
  });

  it("usa a chave do servidor quando liberada (uso local)", () => {
    vi.stubEnv("ALLOW_SERVER_KEY", "true");
    resetEnvCache();
    expect(resolveLlm(req(), { provider: "openai", model: "" }).apiKey).toBe("sk-servidor-openai");
  });

  it("aceita o header antigo só para a DeepSeek", () => {
    expect(resolveLlm(req({ "x-deepseek-key": "sk-ds" }), { provider: "deepseek", model: "" }).apiKey).toBe("sk-ds");
    expect(() => resolveLlm(req({ "x-deepseek-key": "sk-ds" }), { provider: "openai", model: "" })).toThrow();
  });

  it("Ollama só funciona quando liberado localmente", () => {
    expect(() => resolveLlm(req(), { provider: "ollama", model: "llama3.1" })).toThrow(/só está disponível/);
    vi.stubEnv("OLLAMA_ENABLED", "true");
    resetEnvCache();
    expect(resolveLlm(req(), { provider: "ollama", model: "llama3.1" }).baseURL).toBe("http://127.0.0.1:11434/v1");
  });
});

describe("parâmetros de cada provedor", () => {
  it("modelos de raciocínio da OpenAI não recebem temperature", () => {
    const params = buildChatParams({ provider: "openai", model: "gpt-5-mini" }, "s", "u", 0.2, 1000);
    expect(params.temperature).toBeUndefined();
    expect(params.max_completion_tokens).toBe(2000);
    const classic = buildChatParams({ provider: "deepseek", model: "deepseek-chat" }, "s", "u", 0.2, 1000);
    expect(classic).toMatchObject({ temperature: 0.2, max_tokens: 1000, response_format: { type: "json_object" } });
  });

  it("tira o parâmetro que o provedor recusar e tenta de novo", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async (params: Record<string, unknown>) => {
            seen.push(params);
            if (params.response_format) {
              throw new OpenAI.BadRequestError(
                400,
                { message: "response_format is not supported" },
                "response_format is not supported",
                new Headers(),
              );
            }
            if (params.max_tokens !== undefined) {
              throw new OpenAI.BadRequestError(
                400,
                { message: "Use max_completion_tokens instead of max_tokens" },
                "Use max_completion_tokens instead of max_tokens",
                new Headers(),
              );
            }
            return { choices: [{ message: { content: "{}" } }] };
          }),
        },
      },
    };
    const params = buildChatParams({ provider: "mistral", model: "m" }, "s", "u", 0.3, 500);
    // biome-ignore lint/suspicious/noExplicitAny: cliente falso só com o método usado
    await createWithFallbacks(client as any, params);
    expect(seen).toHaveLength(3);
    expect(seen[2]).not.toHaveProperty("response_format");
    expect(seen[2]).toMatchObject({ max_completion_tokens: 500 });
  });
});

describe("chave e modelos", () => {
  const llm = { provider: "openrouter" as const, baseURL: "https://openrouter.ai/api/v1", apiKey: "k" };

  it("OpenRouter mostra o crédito restante", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { limit_remaining: 7.5 } }))) as unknown as typeof fetch;
    await expect(checkLlmKey(llm, fetchImpl)).resolves.toMatchObject({ valid: true, balance: { total: "7.50" } });
  });

  it("lista só modelos de chat", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-5-mini" },
            { id: "text-embedding-3-small" },
            { id: "whisper-1" },
            { id: "models/gemini-x-flash" },
          ],
        }),
      )) as unknown as typeof fetch;
    await expect(listModels({ ...llm, provider: "openai" }, fetchImpl)).resolves.toEqual([
      "gemini-x-flash",
      "gpt-5-mini",
    ]);
  });
});

describe("revisor", () => {
  const cards = [
    { id: "a", type: "basic" as const, front: "O que é derivada?", back: "Taxa de variação." },
    { id: "b", type: "cloze" as const, front: "A {{c1::integral}} soma áreas.", back: "" },
    { id: "c", type: "basic" as const, front: "Quem inventou o cálculo?", back: "Einstein." },
  ];

  it("normaliza vereditos, sanitiza sugestões e cobre todos os cards", () => {
    const reviews = normalizeReviews(
      [
        {
          id: "b",
          verdict: "fix",
          issues: ["Lacuna esconde pouco"],
          suggestion: { front: "A integral <script>x</script>soma áreas", back: "" },
        },
        {
          id: "c",
          verdict: "fix",
          issues: ["Resposta errada"],
          suggestion: { front: "Quem inventou o cálculo?", back: "Newton e Leibniz.<img src=x onerror=1>" },
        },
        { id: "zzz", verdict: "remove", issues: [], suggestion: null },
      ],
      cards,
    );
    expect(reviews.map((review) => review.id)).toEqual(["a", "b", "c"]);
    expect(reviews[0]).toMatchObject({ verdict: "ok" });
    // cloze sem lacuna na sugestão não vale como correção
    expect(reviews[1]).toMatchObject({ verdict: "fix", suggestion: null });
    expect(reviews[2]?.suggestion).toEqual({ front: "Quem inventou o cálculo?", back: "Newton e Leibniz." });
  });

  it("revisa em lotes e identifica o modelo revisor", async () => {
    const complete = vi.fn(async ({ schema }) =>
      schema.parse({
        summary: "Bom no geral.",
        reviews: [{ id: "c", verdict: "remove", issues: ["Fato errado"], suggestion: null }],
      }),
    );
    const result = await reviewCards(
      { tab: makeTab(), mode: "material", material: "O cálculo foi criado por Newton e Leibniz.", cards },
      { provider: "openai", model: "gpt-5-mini", baseURL: "x", apiKey: "k" },
      complete as never,
    );
    expect(result.reviewer).toBe("OpenAI · gpt-5-mini");
    expect(result.reviews.find((review) => review.id === "c")?.verdict).toBe("remove");
    expect(complete.mock.calls[0]?.[0].user).toContain("Newton e Leibniz");
  });

  it("aplica a correção no card e conta o que falta decidir", () => {
    const plan: StudyPlan = {
      subject: "S",
      level: "x",
      deckName: "D",
      suggestedDeckName: "",
      routingReason: "",
      confidence: 1,
      studyNote: "",
      coverageSummary: "",
      tags: [],
      warnings: [],
      parts: 1,
      generator: "",
      cards,
    };
    const state = applyReviewResponse(
      createReview(plan, { sourceLabel: "s", mode: "material", words: [], fallbackDeck: "D" }),
      {
        reviewer: "OpenAI · gpt-5-mini",
        summary: "",
        reviews: [
          { id: "a", verdict: "ok", issues: [], suggestion: null },
          {
            id: "c",
            verdict: "fix",
            issues: ["errado"],
            suggestion: { front: "Quem inventou o cálculo?", back: "Newton e Leibniz." },
          },
        ],
      },
    );
    expect(countReviews(state.items)).toMatchObject({ ok: 1, fix: 1, pending: 1 });
    const fixed = applySuggestion(state.items[2] ?? state.items[0]!);
    expect(fixed.card.back).toBe("Newton e Leibniz.");
    expect(fixed.reviewResolved).toBe("applied");
  });
});

describe("erros dos provedores", () => {
  it("diferencia falta de crédito de limite de requisições", async () => {
    const { toApiError } = await import("@/lib/server/llm");
    const quota = new OpenAI.RateLimitError(
      429,
      { code: "insufficient_quota", message: "You have no credits" },
      "You have no credits remaining",
      new Headers(),
    );
    expect(toApiError(quota, "openai")).toMatchObject({ status: 402, code: "no_balance" });
    const limit = new OpenAI.RateLimitError(
      429,
      { message: "Rate limit exceeded" },
      "Rate limit exceeded",
      new Headers(),
    );
    expect(toApiError(limit, "mistral")).toMatchObject({ status: 429, code: "llm_rate_limited" });
  });
});

describe("informações dos provedores", () => {
  it("todo provedor tem para que serve, custo e link de preços", () => {
    for (const provider of Object.values(PROVIDERS)) {
      expect(provider.bestFor.length).toBeGreaterThan(0);
      expect(provider.costPer100).toBeTruthy();
      expect(provider.pricingUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("Gemini", () => {
  it("pede raciocínio curto e dá mais espaço para a resposta", () => {
    const direct = buildChatParams({ provider: "gemini", model: "gemini-3.8-flash" }, "s", "u", 0.3, 1000);
    expect(direct).toMatchObject({ reasoning_effort: "low", max_tokens: 2000 });
    const viaRouter = buildChatParams(
      { provider: "openrouter", model: "google/gemini-3.8-flash" },
      "s",
      "u",
      0.3,
      1000,
    );
    expect(viaRouter).toMatchObject({ reasoning: { effort: "low" }, max_tokens: 2000 });
    expect(buildChatParams({ provider: "groq", model: "x" }, "s", "u", 0.3, 1000)).not.toHaveProperty(
      "reasoning_effort",
    );
  });
});

describe("DeepSeek", () => {
  it("desliga o raciocínio (senão ele consome o limite e o JSON sai vazio)", () => {
    const params = buildChatParams({ provider: "deepseek", model: "deepseek-flash" }, "s", "u", 0.3, 600);
    expect(params).toMatchObject({ thinking: { type: "disabled" }, max_tokens: 600 });
    expect(buildChatParams({ provider: "groq", model: "x" }, "s", "u", 0.3, 600)).not.toHaveProperty("thinking");
  });

  it("se o modelo não aceitar o parâmetro thinking, tenta de novo sem ele", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async (params: Record<string, unknown>) => {
            seen.push(params);
            if ("thinking" in params) {
              throw new OpenAI.BadRequestError(
                400,
                { message: "unknown field: thinking" },
                "unknown field: thinking",
                new Headers(),
              );
            }
            return { choices: [{ message: { content: "{}" } }] };
          }),
        },
      },
    };
    const params = buildChatParams({ provider: "deepseek", model: "deepseek-chat" }, "s", "u", 0.3, 600);
    // biome-ignore lint/suspicious/noExplicitAny: cliente falso só com o método usado
    await createWithFallbacks(client as any, params);
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toHaveProperty("thinking");
    expect(seen[1]).toHaveProperty("response_format");
  });
});
