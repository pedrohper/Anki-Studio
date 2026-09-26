import { describe, expect, it } from "vitest";
import { type ContextEntry, extractTerms, findRelevantContext, fingerprint } from "@/lib/shared/context-search";

const entry = (id: string, title: string, content: string, fp = id): ContextEntry => ({
  id,
  tabId: "t",
  title,
  content,
  fingerprint: fp,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("biblioteca de contexto", () => {
  const entries = [
    entry(
      "1",
      "Derivadas",
      "A derivada parcial mede variação mantendo variáveis fixas. Regra da cadeia para derivada parcial.",
    ),
    entry("2", "Receitas", "Bolo de cenoura com cobertura de chocolate e farinha."),
  ];

  it("ignora palavras curtas e stopwords", () => {
    expect(extractTerms("para como uma derivada")).toEqual(new Set(["derivada"]));
  });

  it("traz só os trechos parecidos com o material", () => {
    const context = findRelevantContext("Exercícios de derivada parcial e regra da cadeia", entries);
    expect(context).toContain("[Biblioteca: Derivadas]");
    expect(context).not.toContain("Bolo");
  });

  it("não devolve o próprio material como contexto", () => {
    const context = findRelevantContext("derivada parcial regra cadeia", entries, { excludeFingerprint: "1" });
    expect(context).toBe("");
  });

  it("respeita o limite de caracteres", () => {
    const big = Array.from({ length: 20 }, (_, i) => entry(String(i), `M${i}`, "derivada parcial cadeia ".repeat(100)));
    expect(findRelevantContext("derivada parcial cadeia", big, { maxChars: 3_000 }).length).toBeLessThanOrEqual(3_000);
  });

  it("fingerprint ignora diferenças de espaço", async () => {
    expect(await fingerprint("a  b\n c")).toBe(await fingerprint("a b c"));
  });
});
