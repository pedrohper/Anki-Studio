import { describe, expect, it } from "vitest";
import { clozeNumbers, hasCloze, renderClozePreview } from "@/lib/shared/cloze";
import { parseJsonLoose } from "@/lib/shared/json";

describe("parseJsonLoose", () => {
  it("aceita JSON puro", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("remove cercas de markdown", () => {
    expect(parseJsonLoose('```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
  });

  it("encontra o objeto no meio de texto", () => {
    expect(parseJsonLoose('Claro! Aqui está: {"ok": true} Espero ter ajudado.')).toEqual({ ok: true });
  });

  it("falha com texto sem JSON", () => {
    expect(() => parseJsonLoose("sem json aqui")).toThrow();
  });
});

describe("cloze", () => {
  const text = "A {{c1::derivada}} mede a {{c2::taxa de variação::conceito}}; {{c1::derivada}} de novo.";

  it("detecta lacunas", () => {
    expect(hasCloze(text)).toBe(true);
    expect(hasCloze("sem lacunas")).toBe(false);
  });

  it("lista os números sem repetir", () => {
    expect(clozeNumbers(text)).toEqual([1, 2]);
  });

  it("esconde ou revela na prévia", () => {
    expect(renderClozePreview(text, false)).toContain("[conceito]");
    expect(renderClozePreview(text, true)).toContain("taxa de variação");
  });
});

describe("llmText", async () => {
  const { llmText, llmTextList } = await import("@/lib/shared/llm-zod");
  const { z } = await import("zod");
  it("não vira 'undefined' nem 'null'", () => {
    const schema = z.object({ a: llmText("x"), b: llmText("y"), c: llmText("z"), list: llmTextList() });
    expect(schema.parse({ b: null, c: 3, list: ["a", null, 2, { x: 1 }] })).toEqual({
      a: "x",
      b: "y",
      c: "3",
      list: ["a", "2"],
    });
  });
});
