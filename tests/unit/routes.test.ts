import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/llm")>();
  return {
    ...original,
    completeJson: vi.fn(async ({ schema }) =>
      schema.parse({
        subject: "Teste",
        level: "iniciante",
        deckName: "Inglês",
        suggestedDeckName: "",
        routingReason: "ok",
        confidence: 0.8,
        studyNote: "nota",
        coverageSummary: "tudo",
        tags: ["t"],
        cards: [{ type: "basic", front: "Pergunta?", back: "Resposta." }],
        systemPrompt: "## Papel\nVocê cria cards muito bons para esta aba de teste, com foco total no objetivo.",
        summary: "Foco",
      }),
    ),
  };
});

const { POST: generate } = await import("@/app/api/generate/route");
const { POST: tabPrompt } = await import("@/app/api/tab-prompt/route");
const { GET: config } = await import("@/app/api/config/route");
const { POST: anki } = await import("@/app/api/anki/route");
const { makeInput, makeTab } = await import("../support/factories");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("rotas da API", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("ALLOW_SERVER_KEY", "false");
    vi.stubEnv("ANKI_PROXY_ENABLED", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("exige chave quando o servidor não libera a própria", async () => {
    const response = await generate(post(makeInput()));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("missing_key");
  });

  it("valida o corpo com Zod", async () => {
    const response = await generate(post({ tab: {} }, { "x-deepseek-key": "sk" }));
    expect(response.status).toBe(400);
  });

  it("recusa JSON inválido", async () => {
    const response = await generate(post("{nope", { "x-deepseek-key": "sk" }));
    expect(response.status).toBe(400);
  });

  it("gera o plano com a chave do visitante", async () => {
    const response = await generate(post(makeInput(), { "x-deepseek-key": "sk-visitante" }));
    expect(response.status).toBe(200);
    const plan = await response.json();
    expect(plan.cards).toHaveLength(1);
    expect(plan.cards[0].id).toBeTruthy();
  });

  it("usa a chave do servidor só quando liberada", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-servidor");
    vi.stubEnv("ALLOW_SERVER_KEY", "true");
    const response = await generate(post(makeInput()));
    expect(response.status).toBe(200);
    expect((await config().json()).serverKeyAvailable).toBe(true);
  });

  it("limita requisições por IP", async () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "2");
    const headers = { "x-deepseek-key": "sk", "x-forwarded-for": "1.2.3.4" };
    expect((await generate(post(makeInput(), headers))).status).toBe(200);
    expect((await generate(post(makeInput(), headers))).status).toBe(200);
    expect((await generate(post(makeInput(), headers))).status).toBe(429);
  });

  it("gera o prompt de uma aba", async () => {
    const { systemPrompt: _s, ...settings } = makeTab();
    const response = await tabPrompt(post({ settings }, { "x-deepseek-key": "sk" }));
    expect(response.status).toBe(200);
    expect((await response.json()).systemPrompt).toContain("Papel");
  });

  it("proxy do Anki fica desligado por padrão", async () => {
    const response = await anki(post({ action: "version", version: 6 }));
    expect(response.status).toBe(404);
  });

  it("config não expõe a chave", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-secreta");
    const body = JSON.stringify(await config().json());
    expect(body).not.toContain("sk-secreta");
  });
});

const { checkApiKey } = await import("@/lib/server/llm");

describe("checkApiKey", () => {
  const respond = (status: number, body: unknown = {}) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("valida e devolve o saldo", async () => {
    const fetchImpl = respond(200, { is_available: true, balance_infos: [{ currency: "USD", total_balance: "4.20" }] });
    await expect(checkApiKey("sk", fetchImpl)).resolves.toEqual({
      valid: true,
      balance: { currency: "USD", total: "4.20" },
      message: "Chave válida.",
    });
  });

  it("avisa quando a chave é inválida", async () => {
    await expect(checkApiKey("sk", respond(401))).resolves.toMatchObject({ valid: false });
  });

  it("avisa quando não há saldo", async () => {
    const fetchImpl = respond(200, {
      is_available: false,
      balance_infos: [{ currency: "USD", total_balance: "0.00" }],
    });
    await expect(checkApiKey("sk", fetchImpl)).resolves.toMatchObject({
      valid: true,
      message: expect.stringMatching(/sem saldo/),
    });
  });

  it("usa a lista de modelos quando o provedor não tem endpoint de saldo", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response("{}", { status: url.endsWith("/user/balance") ? 404 : 200 });
    }) as unknown as typeof fetch;
    await expect(checkApiKey("sk", fetchImpl)).resolves.toMatchObject({ valid: true, balance: null });
    expect(calls.at(-1)).toMatch(/\/models$/);
  });
});
