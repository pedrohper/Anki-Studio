import { describe, expect, it } from "vitest";
import { estimateCost } from "@/lib/llm/prices";
import { recordUsage, USAGE_HEADER, withUsage } from "@/lib/server/usage";
import { addToBook, summarizeMonth } from "@/lib/shared/usage-book";

describe("painel de custos", () => {
  it("calcula pelo preço por milhão de tokens", () => {
    expect(estimateCost("deepseek", "deepseek-flash", 1_000_000, 1_000_000)).toBeCloseTo(1.5);
    expect(estimateCost("ollama", "llama3", 5_000, 5_000)).toBe(0);
    expect(estimateCost("openrouter", "modelo/desconhecido", 10, 10)).toBeNull();
  });

  it("soma por mês e por modelo", () => {
    let book = addToBook(
      {},
      [{ provider: "deepseek", model: "deepseek-flash", input: 10_000, output: 2_000 }],
      "2026-09",
    );
    book = addToBook(
      book,
      [
        { provider: "deepseek", model: "deepseek-flash", input: 5_000, output: 1_000 },
        { provider: "groq", model: "openai/gpt-oss-120b", input: 4_000, output: 1_000 },
        { provider: "openrouter", model: "x/y", input: 100, output: 100 },
      ],
      "2026-09",
    );
    const month = summarizeMonth(book, "2026-09");
    expect(month.calls).toBe(4);
    expect(month.lines[0]).toMatchObject({ provider: "deepseek", calls: 2, input: 15_000, output: 3_000 });
    expect(month.cost).toBeCloseTo((15_000 * 0.3 + 3_000 * 1.2 + 4_000 * 0.15 + 1_000 * 0.6) / 1e6);
    expect(month.hasUnknown).toBe(true);
    expect(summarizeMonth(book, "2026-08").lines).toEqual([]);
  });

  it("a rota devolve o que gastou no header", async () => {
    const handler = withUsage(async () => {
      recordUsage({ provider: "groq", model: "m", input: 10, output: 5 });
      recordUsage({ provider: "groq", model: "m", input: 1, output: 1 });
      return Response.json({ ok: true });
    });
    const response = await handler(new Request("http://localhost/api/x"));
    expect(JSON.parse(response.headers.get(USAGE_HEADER) ?? "[]")).toHaveLength(2);
    // fora de uma rota, registrar não quebra nada
    expect(() => recordUsage({ provider: "groq", model: "m", input: 1, output: 1 })).not.toThrow();
  });
});
