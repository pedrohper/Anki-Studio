import { describe, expect, it } from "vitest";
import { createDefaultTabs } from "@/lib/default-tabs";
import { buildFeedbackEvents, createReview, isEdited, summarizeFeedback } from "@/lib/review";
import type { StudyPlan } from "@/lib/schemas/card";
import { tabSchema, tabSettingsSchema } from "@/lib/schemas/tab";
import { duplicateTab, withNewPromptVersion } from "@/lib/tab-utils";

const plan: StudyPlan = {
  subject: "S",
  level: "iniciante",
  deckName: "",
  suggestedDeckName: "Novo",
  routingReason: "",
  confidence: 0.5,
  studyNote: "",
  coverageSummary: "",
  tags: [],
  warnings: [],
  parts: 1,
  generator: "DeepSeek · deepseek-chat",
  cards: [
    { id: "1", type: "basic", front: "Q1", back: "A1" },
    { id: "2", type: "basic", front: "Q2", back: "A2" },
    { id: "3", type: "basic", front: "Q3", back: "A3" },
  ],
};

describe("revisão e aprendizado da aba", () => {
  it("usa o baralho padrão da aba quando a IA não achou um existente", () => {
    const review = createReview(plan, { sourceLabel: "x", mode: "material", words: [], fallbackDeck: "Padrão" });
    expect(review.deckName).toBe("Padrão");
    expect(createReview(plan, { sourceLabel: "x", mode: "material", words: [], fallbackDeck: "" }).deckName).toBe(
      "Novo",
    );
  });

  it("transforma edições e descartes em sinais", () => {
    const review = createReview(plan, { sourceLabel: "x", mode: "material", words: [], fallbackDeck: "D" });
    const [first, second, third] = review.items;
    if (!first || !second || !third) throw new Error("itens");
    const items = [{ ...first, card: { ...first.card, back: "A1 mais curto" } }, { ...second, included: false }, third];
    expect(isEdited(items[0] ?? first)).toBe(true);

    const events = buildFeedbackEvents("tab", items);
    expect(events.map((event) => event.kind)).toEqual(["edited", "discarded", "kept"]);

    const summary = summarizeFeedback(events);
    expect(summary).toMatchObject({ adjustments: 2, kept: 1 });
    expect(summary.edited[0]?.after.back).toBe("A1 mais curto");
  });
});

describe("abas", () => {
  it("abas-modelo passam no schema", () => {
    for (const tab of createDefaultTabs()) expect(() => tabSchema.parse(tab)).not.toThrow();
  });

  it("valida o formulário de nova aba", () => {
    const result = tabSettingsSchema.safeParse({
      name: "",
      emoji: "📚",
      goal: "curto",
      deckName: "",
      cardTypes: [],
      cardLanguage: "português",
      features: { audio: false, knownVocabulary: false, formulas: false, code: false },
      sources: [],
    });
    expect(result.success).toBe(false);
    const fields = new Set(result.error?.issues.map((issue) => issue.path[0]));
    expect(fields).toEqual(new Set(["name", "goal", "deckName", "cardTypes", "sources"]));
  });

  it("guarda versões do prompt e duplica a aba", () => {
    const [tab] = createDefaultTabs();
    if (!tab) throw new Error("sem aba");
    const updated = withNewPromptVersion(tab, "Novo prompt da aba", "refined", "respostas mais curtas");
    expect(updated.systemPrompt).toBe("Novo prompt da aba");
    expect(updated.promptVersions.map((version) => version.origin)).toEqual(["template", "refined"]);

    const copy = duplicateTab(updated);
    expect(copy.id).not.toBe(tab.id);
    expect(copy.name).toContain("(cópia)");
    expect(copy.promptVersions).toHaveLength(1);
  });
});
