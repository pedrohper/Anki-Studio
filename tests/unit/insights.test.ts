import { describe, expect, it, vi } from "vitest";
import { analyzeDeck, analyzeWeakSpots, routeMaterial } from "@/lib/server/insights";
import { belongsTo, groupDecks, rootOf, subdeckLabel } from "@/lib/shared/decks";

const LLM = { provider: "deepseek" as const, model: "deepseek-flash", baseURL: "x", apiKey: "k" };
const fake = (response: unknown) => vi.fn(async ({ schema }) => schema.parse(response)) as never;

describe("árvore de baralhos", () => {
  it("agrupa sub-baralhos sob o principal e ignora o Default", () => {
    expect(
      groupDecks(["Default", "ESAMC", "ESAMC::Exatas::Cálculo II", "ESAMC::Exatas", "Inglês", "Cargill::EHS"]),
    ).toEqual([
      { root: "Cargill", subdecks: ["Cargill::EHS"] },
      { root: "ESAMC", subdecks: ["ESAMC::Exatas", "ESAMC::Exatas::Cálculo II"] },
      { root: "Inglês", subdecks: [] },
    ]);
  });

  it("helpers de nome", () => {
    expect(rootOf("ESAMC::Exatas")).toBe("ESAMC");
    expect(subdeckLabel("ESAMC::Exatas::Cálculo II")).toBe("Exatas › Cálculo II");
    expect(belongsTo("ESAMC::Exatas", "ESAMC")).toBe(true);
    expect(belongsTo("ESAMCX", "ESAMC")).toBe(false);
  });
});

describe("IA sobre os dados do Anki", () => {
  it("análise de baralho tolera campos faltando", async () => {
    const result = await analyzeDeck(
      { deckName: "Inglês", subdecks: [], noteCount: 10, samples: [{ front: "I run", back: "correr" }] },
      LLM,
      fake({
        goal: "Aprender vocabulário de inglês do trabalho.",
        cardLanguage: "inglês",
        systemPrompt: "## Papel\nVocê cria cards de vocabulário de inglês com frases do dia a dia e áudio.",
      }),
    );
    expect(result).toMatchObject({ name: "Inglês", emoji: "📚", cardTypes: ["basic"] });
  });

  it("roteamento nunca devolve aba inexistente", async () => {
    const tabs = [
      { id: "a", name: "Cálculo", goal: "g", deckName: "ESAMC" },
      { id: "b", name: "Inglês", goal: "g", deckName: "Inglês" },
    ];
    const ok = await routeMaterial(
      { material: "derivadas parciais e gradiente", tabs },
      LLM,
      fake({ tabId: "a", reason: "Cálculo", confidence: 90, sourceLabel: "Derivadas" }),
    );
    expect(ok).toMatchObject({ tabId: "a", confidence: 0.9 });
    const invented = await routeMaterial(
      { material: "derivadas parciais e gradiente", tabs },
      LLM,
      fake({ tabId: "zzz", reason: "?", confidence: 1 }),
    );
    expect(invented).toMatchObject({ tabId: "a", confidence: 0 });
  });

  it("pontos fracos só citam cards enviados", async () => {
    const result = await analyzeWeakSpots(
      { cards: [{ id: "1", deckName: "Inglês", front: "actually", back: "na verdade", lapses: 5, ease: 180 }] },
      LLM,
      fake({
        summary: "Falsos cognatos pegam você.",
        themes: [
          {
            title: "Falsos cognatos",
            why: "Parecem português.",
            tips: ["Associe a frases"],
            cardIds: ["1", "999"],
            deckName: "",
          },
          { title: "Tema sem cards", why: "", tips: [], cardIds: ["404"], deckName: "" },
        ],
        words: ["actually", "actually", "<b>pretend</b>"],
      }),
    );
    expect(result.themes).toEqual([
      {
        title: "Falsos cognatos",
        why: "Parecem português.",
        tips: ["Associe a frases"],
        cardIds: ["1"],
        deckName: "Inglês",
      },
    ]);
    expect(result.words).toEqual(["actually", "pretend"]);
  });
});

describe("contas do painel", async () => {
  const { lastNDays, studyStreak, sumDue, greetingFor } = await import("@/lib/shared/stats");
  const today = new Date(2026, 8, 26, 10);

  it("preenche os dias sem revisão", () => {
    const days = lastNDays([{ date: "2026-09-25", count: 7 }], 3, today);
    expect(days).toEqual([
      { date: "2026-09-24", count: 0 },
      { date: "2026-09-25", count: 7 },
      { date: "2026-09-26", count: 0 },
    ]);
  });

  it("sequência não quebra se hoje ainda não estudou", () => {
    const byDay = [
      { date: "2026-09-25", count: 3 },
      { date: "2026-09-24", count: 5 },
      { date: "2026-09-22", count: 1 },
    ];
    expect(studyStreak(byDay, today)).toBe(2);
    expect(studyStreak([...byDay, { date: "2026-09-26", count: 2 }], today)).toBe(3);
    expect(studyStreak([], today)).toBe(0);
  });

  it("soma o que tem para hoje", () => {
    expect(
      sumDue([
        { newCount: 5, learnCount: 1, reviewCount: 10 },
        { newCount: 0, learnCount: 2, reviewCount: 3 },
      ]),
    ).toEqual({ newCount: 5, learnCount: 3, reviewCount: 13, total: 21 });
  });

  it("cumprimenta pela hora", () => {
    expect(greetingFor(new Date(2026, 0, 1, 9))).toBe("Bom dia");
    expect(greetingFor(new Date(2026, 0, 1, 15))).toBe("Boa tarde");
    expect(greetingFor(new Date(2026, 0, 1, 21))).toBe("Boa noite");
  });
});
