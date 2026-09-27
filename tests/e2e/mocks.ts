import type { Page } from "@playwright/test";

export const plan = {
  subject: "Cálculo II · derivadas parciais",
  level: "intermediário",
  deckName: "Faculdade::Cálculo II",
  suggestedDeckName: "",
  routingReason: "O material é de Cálculo II.",
  confidence: 0.92,
  studyNote: "A derivada parcial mede a variação em uma direção, com as outras variáveis fixas.",
  coverageSummary: "Definição, interpretação geométrica e Clairaut.",
  tags: ["derivadas"],
  warnings: [],
  parts: 1,
  cards: [
    {
      id: "c1",
      type: "basic",
      front: "Na derivada parcial ∂f/∂x, o que acontece com y?",
      back: "y é tratado como <b>constante</b>.",
    },
    { id: "c2", type: "cloze", front: "O gradiente é {{c1::(fx, fy)}}.", back: "" },
    {
      id: "c3",
      type: "basic",
      front: "O que diz o Teorema de Clairaut?",
      back: "Se fxy e fyx são contínuas, fxy = fyx.",
    },
  ],
};

/** Simula o servidor (config e IA) e o AnkiConnect via proxy local. */
const PROVIDERS = ["deepseek", "openai", "gemini", "openrouter", "groq", "mistral", "ollama"];

export async function mockBackend(
  page: Page,
  { onboarding = false, serverKey = true, settings = {} as Record<string, unknown> } = {},
) {
  const added: unknown[] = [];
  const actions: string[] = [];
  if (!onboarding || Object.keys(settings).length > 0) {
    // Pula a configuração inicial nos testes que não são sobre ela.
    await page.addInitScript((extra) => {
      window.localStorage.setItem("anki-studio:settings", JSON.stringify({ onboardingDone: true, ...extra }));
    }, settings);
  }
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        serverKeyAvailable: serverKey,
        ankiProxyEnabled: true,
        model: "deepseek-chat",
        providers: PROVIDERS.map((id) => ({ id, serverKey: serverKey && id === "deepseek", enabled: id !== "ollama" })),
        defaultGenerator: { provider: "deepseek", model: "" },
        passwordProtected: false,
        lanAccess: true,
      },
    }),
  );
  await page.route("**/api/access", (route) =>
    route.fulfill({ json: { pinSet: false, manageable: true, tunnel: { status: "off", url: null, error: null } } }),
  );
  await page.route("**/api/reminder", (route) =>
    route.fulfill({ json: { enabled: true, time: "19:00", publicKey: "BExemplo", endpoints: [] } }),
  );
  await page.route("**/api/network", (route) =>
    route.fulfill({
      json: { addresses: [{ ip: "192.168.100.10", url: "http://192.168.100.10:3000", label: "Wi-Fi" }] },
    }),
  );
  await page.route("**/api/models", (route) => route.fulfill({ json: { models: ["modelo-a", "modelo-b"] } }));
  await page.route("**/api/check-key", (route) =>
    route.fulfill({ json: { valid: true, balance: { currency: "USD", total: "4.20" }, message: "Chave válida." } }),
  );
  await page.route("**/api/tab-prompt", (route) =>
    route.fulfill({
      json: {
        systemPrompt: "## Papel\nVocê cria cards de Direito Penal focados em diferenciar institutos parecidos.",
        summary: "Diferenciar institutos do Direito Penal.",
      },
    }),
  );
  const generateBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/generate", async (route) => {
    generateBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: plan,
      headers: {
        "x-llm-usage": JSON.stringify([
          { provider: "deepseek", model: "deepseek-flash", input: 12_000, output: 3_000 },
        ]),
      },
    });
  });
  await page.route("**/api/route", (route) =>
    route.fulfill({
      json: {
        tabId: "ingles-i1",
        reason: "O material é vocabulário de inglês.",
        confidence: 0.9,
        sourceLabel: "Palavras novas",
      },
    }),
  );
  await page.route("**/api/deck-analysis", (route) =>
    route.fulfill({
      json: {
        name: "Faculdade",
        emoji: "🎓",
        goal: "Revisar as matérias da faculdade, com foco em Cálculo II.",
        cardLanguage: "português",
        cardTypes: ["basic", "cloze"],
        features: { audio: false, knownVocabulary: false, formulas: true, code: false },
        sources: ["text", "pdf"],
        systemPrompt: "## Papel\nVocê cria cards das matérias da faculdade, priorizando interpretação de fórmulas.",
        summary: "Baralho de faculdade com Cálculo II.",
      },
    }),
  );
  await page.route("**/api/weak-spots", (route) =>
    route.fulfill({
      json: {
        summary: "Você tropeça em falsos cognatos e na regra da cadeia.",
        themes: [
          {
            title: "Falsos cognatos",
            why: "Palavras parecidas com o português enganam na hora.",
            tips: ["Leia a frase inteira antes de responder", "Associe cada palavra a um exemplo"],
            cardIds: ["11", "12"],
            deckName: "Inglês",
          },
        ],
        words: ["actually", "pretend"],
      },
    }),
  );

  await page.route("**/api/anki", async (route) => {
    const { action, params } = route.request().postDataJSON() as { action: string; params?: { notes?: unknown[] } };
    const today = new Date();
    const iso = (offset: number) => {
      const day = new Date(today);
      day.setDate(today.getDate() - offset);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    };
    const results: Record<string, unknown> = {
      deckNames: ["Default", "Faculdade::Cálculo II", "Inglês"],
      modelNames: ["Básico", "Omissão de Palavras"],
      modelFieldNames: ["Frente", "Verso"],
      createDeck: 1,
      canAddNotesWithErrorDetail: (params?.notes ?? []).map(() => ({ canAdd: true })),
      addNotes: (params?.notes ?? []).map((_, index) => 1000 + index),
      guiDeckBrowser: null,
      guiDeckOverview: true,
      getDeckStats: {
        1: { deck_id: 1, name: "Faculdade", new_count: 5, learn_count: 1, review_count: 7, total_in_deck: 120 },
        2: { deck_id: 2, name: "Inglês", new_count: 0, learn_count: 2, review_count: 3, total_in_deck: 800 },
      },
      getNumCardsReviewedByDay: Array.from({ length: 30 }, (_, offset) => [
        iso(offset),
        offset === 0 ? 12 : (offset * 7) % 40,
      ]),
      findNotes: [1, 2],
      notesInfo: [
        { fields: { Frente: { value: "Card que já existe", order: 0 }, Verso: { value: "Resposta", order: 1 } } },
        { fields: { Frente: { value: "Outro card", order: 0 }, Verso: { value: "Outra", order: 1 } } },
      ],
      findCards: [11, 12],
      cardsInfo: [
        {
          cardId: 11,
          deckName: "Inglês",
          lapses: 6,
          reps: 20,
          factor: 1800,
          fields: {
            Frente: { value: "I <b>actually</b> like it", order: 0 },
            Verso: { value: "na verdade", order: 1 },
          },
        },
        {
          cardId: 12,
          deckName: "Inglês",
          lapses: 4,
          reps: 15,
          factor: 2100,
          fields: { Frente: { value: "She <b>pretends</b> to sleep", order: 0 }, Verso: { value: "fingir", order: 1 } },
        },
      ],
    };
    if (action === "addNotes") added.push(...(params?.notes ?? []));
    actions.push(action);
    await route.fulfill({ json: { result: results[action] ?? null, error: null } });
  });
  return { added, generateBodies, actions };
}

/** Revisor simulado: aprova o 1º card, corrige o 2º e sugere descartar o 3º. */
export async function mockReviewer(page: Page) {
  await page.route("**/api/review", (route) =>
    route.fulfill({
      json: {
        reviewer: "Groq · openai/gpt-oss-120b",
        summary: "Bons cards; um tinha lacuna fraca e outro repetia o material sem pergunta clara.",
        reviews: [
          { id: "c1", verdict: "ok", issues: [], suggestion: null },
          {
            id: "c2",
            verdict: "fix",
            issues: ["A lacuna esconde a fórmula inteira; melhor esconder só a ideia central."],
            suggestion: {
              front: "O gradiente ∇f = (fx, fy) aponta na direção de {{c1::maior crescimento}} de f.",
              back: "",
            },
          },
          { id: "c3", verdict: "remove", issues: ["Resposta não aparece no material."], suggestion: null },
        ],
      },
    }),
  );
}

/** Abre uma aba pela barra lateral (a tela inicial agora é o Início). */
export async function openTab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Abas de estudo" }).getByRole("button", { name }).click();
}
