import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { buildApkg, checksum, deckIdFor, guidFor } from "@/lib/server/apkg";

async function openCollection(file: Uint8Array) {
  const entries = unzipSync(file);
  const wasm = await readFile(path.join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer });
  return { entries, db: new SQL.Database(entries["collection.anki2"]) };
}

describe("buildApkg", () => {
  it("gera um pacote com notas, cards, baralho e mídia", async () => {
    const file = await buildApkg(
      "Faculdade::Cálculo II",
      [
        {
          type: "basic",
          front: "O que é <b>derivada</b>? [sound:a.mp3]",
          back: "Taxa de variação.",
          tags: ["calculo"],
        },
        { type: "cloze", front: "A {{c1::derivada}} usa {{c2::limites}}.", back: "", tags: [] },
      ],
      [{ filename: "a.mp3", data: new Uint8Array([1, 2, 3]) }],
    );

    const { entries, db } = await openCollection(file);
    expect(JSON.parse(new TextDecoder().decode(entries.media))).toEqual({ "0": "a.mp3" });
    expect([...(entries["0"] ?? [])]).toEqual([1, 2, 3]);

    const notes = db.exec("SELECT flds, tags, csum FROM notes ORDER BY id")[0]?.values ?? [];
    expect(notes).toHaveLength(2);
    expect(notes[0]?.[0]).toBe("O que é <b>derivada</b>? [sound:a.mp3]\u001fTaxa de variação.");
    expect(notes[0]?.[1]).toBe(" calculo ");
    expect(notes[0]?.[2]).toBe(checksum("O que é <b>derivada</b>? [sound:a.mp3]"));

    // cloze com c1 e c2 gera dois cards (ord 0 e 1)
    const cards = db.exec("SELECT ord, did FROM cards ORDER BY id")[0]?.values ?? [];
    expect(cards.map((row) => row[0])).toEqual([0, 0, 1]);
    expect(new Set(cards.map((row) => row[1]))).toEqual(new Set([deckIdFor("Faculdade::Cálculo II")]));

    const col = db.exec("SELECT decks, models FROM col")[0]?.values[0] ?? [];
    const decks = JSON.parse(String(col[0]));
    expect(Object.values(decks).map((deck) => (deck as { name: string }).name)).toContain("Faculdade::Cálculo II");
    const models = JSON.parse(String(col[1]));
    expect(
      Object.values(models)
        .map((model) => (model as { type: number }).type)
        .sort(),
    ).toEqual([0, 1]);
    db.close();
  });

  it("usa IDs estáveis para reimportar sem duplicar", () => {
    expect(deckIdFor("Inglês")).toBe(deckIdFor("Inglês"));
    expect(deckIdFor("Inglês")).not.toBe(deckIdFor("Espanhol"));
    expect(guidFor("Inglês", "run")).toBe(guidFor("Inglês", "run"));
    expect(guidFor("Inglês", "run")).not.toBe(guidFor("Inglês", "walk"));
  });
});
