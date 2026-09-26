import { describe, expect, it } from "vitest";
import { clozeToBasic, createAnkiClient, resolveModels, sendCards, wordsFromDeck } from "@/lib/client/anki-connect";

type Handler = (params: Record<string, unknown>) => { result: unknown; error: unknown };

/** Simula o AnkiConnect: cada ação responde com um handler. */
function fakeAnki(handlers: Record<string, Handler>) {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { action: string; params?: Record<string, unknown> };
    calls.push({ action: body.action, params: body.params ?? {} });
    const handler = handlers[body.action];
    const payload = handler ? handler(body.params ?? {}) : { result: null, error: "unsupported action" };
    return new Response(JSON.stringify(payload));
  }) as typeof fetch;
  return { client: createAnkiClient({ mode: "direct", url: "http://127.0.0.1:8765", fetchImpl }), calls };
}

const ok = (result: unknown) => () => ({ result, error: null });

const ptBrModels = {
  modelNames: ok(["Básico", "Básico (e cartão invertido)", "Omissão de Palavras"]),
  modelFieldNames: (params: Record<string, unknown>) => ({
    result: params.modelName === "Omissão de Palavras" ? ["Texto", "Verso Extra"] : ["Frente", "Verso"],
    error: null,
  }),
};

describe("resolveModels", () => {
  it("encontra Básico e Omissão no Anki em português", async () => {
    const { client } = fakeAnki(ptBrModels);
    const models = await resolveModels(client);
    expect(models.basic).toEqual({ name: "Básico", fields: ["Frente", "Verso"] });
    expect(models.cloze).toEqual({ name: "Omissão de Palavras", fields: ["Texto", "Verso Extra"] });
  });
});

describe("sendCards", () => {
  it("pula duplicadas, envia mídia e adiciona tudo num lote só", async () => {
    const { client, calls } = fakeAnki({
      ...ptBrModels,
      createDeck: ok(1),
      canAddNotesWithErrorDetail: (params) => ({
        result: (params.notes as unknown[]).map((_, index) =>
          index === 1 ? { canAdd: false, error: "cannot create note because it is a duplicate" } : { canAdd: true },
        ),
        error: null,
      }),
      storeMediaFile: ok("a.mp3"),
      addNotes: (params) => ({ result: (params.notes as unknown[]).map((_, i) => 100 + i), error: null }),
      guiDeckBrowser: ok(null),
    });

    const result = await sendCards(client, {
      deckName: "Inglês",
      tags: ["anki-studio"],
      cards: [
        { id: "a", type: "basic", front: "I <b>run</b>", back: "correr", audio: { filename: "a.mp3", base64: "AAA" } },
        { id: "b", type: "basic", front: "Duplicado", back: "x" },
        { id: "c", type: "cloze", front: "A {{c1::derivada}}", back: "" },
      ],
    });

    expect(result).toEqual({ added: ["a", "c"], duplicates: ["b"], failed: [] });
    expect(calls.filter((call) => call.action === "addNotes")).toHaveLength(1);
    const added = calls.find((call) => call.action === "addNotes")?.params.notes as Array<Record<string, unknown>>;
    expect(added[0]?.fields).toEqual({ Frente: "I <b>run</b> [sound:a.mp3]", Verso: "correr" });
    expect(added[1]?.modelName).toBe("Omissão de Palavras");
    expect(calls.some((call) => call.action === "storeMediaFile")).toBe(true);
  });

  it("usa canAddNotes em versões antigas e trata erros do addNotes", async () => {
    const { client } = fakeAnki({
      modelNames: ok(["Basic"]),
      modelFieldNames: ok(["Front", "Back"]),
      createDeck: ok(1),
      canAddNotes: ok([true, true]),
      addNotes: () => ({ result: [55, null], error: [null, "field is empty"] }),
      guiDeckBrowser: ok(null),
    });
    const result = await sendCards(client, {
      deckName: "D",
      tags: [],
      cards: [
        { id: "a", type: "basic", front: "Q1", back: "A1" },
        { id: "b", type: "cloze", front: "sem {{c1::cloze}} model", back: "extra" },
      ],
    });
    expect(result.added).toEqual(["a"]);
    expect(result.failed).toEqual([{ id: "b", reason: "field is empty" }]);
  });

  it("avisa quando o Anki está fechado", async () => {
    const client = createAnkiClient({
      mode: "direct",
      url: "http://127.0.0.1:8765",
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
    });
    await expect(client.invoke("version")).rejects.toMatchObject({ kind: "offline" });
  });
});

describe("helpers", () => {
  it("clozeToBasic esconde as lacunas e põe as respostas no verso", () => {
    expect(clozeToBasic("A {{c1::derivada::conceito}} e {{c2::limite}}", "extra")).toEqual({
      front: "A [conceito] e [...]",
      back: "<b>derivada</b>, <b>limite</b><br>extra",
    });
  });

  it("wordsFromDeck lê as notas do baralho", async () => {
    const { client } = fakeAnki({
      findNotes: ok([1, 2]),
      notesInfo: ok([
        { fields: { Front: { value: "I <b>run</b> fast" } } },
        { fields: { Front: { value: "Run again [sound:x.mp3]" } } },
      ]),
    });
    expect((await wordsFromDeck(client, "Inglês")).sort()).toEqual(["again", "fast", "run"]);
  });
});
