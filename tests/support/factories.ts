import type { GenerateInput } from "@/lib/schemas/api";
import type { TabForGeneration } from "@/lib/schemas/tab";

export function makeTab(overrides: Partial<TabForGeneration> = {}): TabForGeneration {
  return {
    name: "Cálculo II",
    emoji: "📐",
    goal: "Entender derivadas parciais e integrais duplas para a prova.",
    deckName: "Faculdade::Cálculo II",
    cardTypes: ["basic", "cloze"],
    cardLanguage: "português",
    features: { audio: false, knownVocabulary: false, formulas: true, code: false },
    sources: ["text", "pdf"],
    systemPrompt: "## Papel\nVocê cria cards de Cálculo II focados em interpretação.",
    ...overrides,
  };
}

export function makeInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    tab: makeTab(),
    mode: "material",
    material:
      "A derivada parcial mede a taxa de variação de uma função em relação a uma variável, mantendo as outras fixas.",
    words: [],
    sourceLabel: "aula-03.pdf",
    availableDecks: ["Faculdade::Cálculo II", "Inglês"],
    referenceContext: "",
    knownWords: [],
    maxCards: 40,
    existingCards: [],
    purpose: "study",
    ...overrides,
  };
}
