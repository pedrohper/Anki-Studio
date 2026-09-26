import { describe, expect, it } from "vitest";
import {
  extractEnglishWords,
  normalizeForCompare,
  parseWordList,
  splitMaterial,
  stripHtml,
  toAnkiTag,
  toMediaFilename,
} from "@/lib/shared/text";

describe("splitMaterial", () => {
  it("mantém material curto em uma parte só", () => {
    expect(splitMaterial("texto curto", 100)).toEqual(["texto curto"]);
  });

  it("divide entre parágrafos sem perder conteúdo", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Parágrafo ${i} ${"x".repeat(80)}`);
    const parts = splitMaterial(paragraphs.join("\n\n"), 300);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 300)).toBe(true);
    for (const paragraph of paragraphs) expect(parts.join("\n\n")).toContain(paragraph);
  });

  it("quebra parágrafos gigantes por frase", () => {
    const giant = Array.from({ length: 30 }, (_, i) => `Frase número ${i} sobre integrais.`).join(" ");
    const parts = splitMaterial(giant, 200);
    expect(parts.every((part) => part.length <= 200)).toBe(true);
    expect(parts.join(" ")).toContain("Frase número 29");
  });

  it("devolve vazio para texto vazio", () => {
    expect(splitMaterial("   ", 100)).toEqual([]);
  });
});

describe("parseWordList", () => {
  it("entende listas numeradas, marcadores, vírgulas e expressões", () => {
    const raw = `1. throughput\n- deadlock\n• latency\nmiddleware, scalability; concurrency\n"spill the beans"\nThroughput`;
    expect(parseWordList(raw)).toEqual([
      "throughput",
      "deadlock",
      "latency",
      "middleware",
      "scalability",
      "concurrency",
      "spill the beans",
    ]);
  });
});

describe("helpers de texto", () => {
  it("stripHtml remove tags, som e entidades", () => {
    expect(stripHtml("<b>Olá</b>&nbsp;mundo [sound:a.mp3]<br>fim")).toBe("Olá mundo fim");
  });

  it("normalizeForCompare ignora acentos, caixa e pontuação", () => {
    expect(normalizeForCompare("<b>O que é Derivada?</b>")).toBe(normalizeForCompare("o que e derivada"));
  });

  it("toAnkiTag gera tags sem espaço nem acento", () => {
    expect(toAnkiTag("Cálculo II: aula 3")).toBe("Calculo_II:_aula_3");
  });

  it("toMediaFilename gera nome seguro", () => {
    expect(toMediaFilename("I actually like it!")).toBe("ankistudio_i_actually_like_it.mp3");
  });

  it("extractEnglishWords pega palavras únicas", () => {
    expect(extractEnglishWords("<b>Run</b> the run, RUN! a")).toEqual(["run", "the"]);
  });
});
