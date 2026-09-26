import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { exportBackup, exportTab, importBackup, tabFromExport } from "@/lib/client/backup";
import * as db from "@/lib/client/db";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  db.resetDbConnection();
});

describe("armazenamento no navegador", () => {
  it("cria as abas-modelo no primeiro acesso, uma vez só", async () => {
    const first = await db.listTabs();
    expect(first.map((tab) => tab.id)).toEqual(["estudo-geral", "ingles-i1"]);
    await db.deleteTab("ingles-i1");
    expect((await db.listTabs()).map((tab) => tab.id)).toEqual(["estudo-geral"]);
  });

  it("não salva o mesmo material duas vezes na biblioteca", async () => {
    const entry = { id: "1", tabId: "t", title: "A", content: "x", fingerprint: "fp", createdAt: "2026-01-01" };
    expect(await db.addContext(entry)).toBe(true);
    expect(await db.addContext({ ...entry, id: "2" })).toBe(false);
    expect(await db.listContexts("t")).toHaveLength(1);
  });

  it("junta vocabulário sem repetir", async () => {
    expect(await db.addKnownWords(["Run", "walk"])).toBe(2);
    expect(await db.addKnownWords(["run", "jump"])).toBe(1);
    expect(await db.getKnownWords()).toEqual(["jump", "run", "walk"]);
  });

  it("backup completo vai e volta", async () => {
    await db.listTabs();
    await db.addKnownWords(["alpha"]);
    await db.addHistory([
      {
        id: "h1",
        tabId: "estudo-geral",
        tabName: "Estudo geral",
        deckName: "D",
        subject: "S",
        type: "basic",
        front: "F",
        back: "B",
        destination: "anki",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const backup = await exportBackup();

    globalThis.indexedDB = new IDBFactory();
    db.resetDbConnection();
    const summary = await importBackup(JSON.parse(JSON.stringify(backup)));
    expect(summary).toMatchObject({ tabs: 2, history: 1, knownWords: 1 });
    expect(await db.listHistory()).toHaveLength(1);
  });

  it("recusa backup inválido", async () => {
    await expect(importBackup({ kind: "outra-coisa" })).rejects.toThrow();
  });
});

describe("compartilhar aba", () => {
  it("exporta sem ids e importa como aba nova", async () => {
    const [tab] = await db.listTabs();
    if (!tab) throw new Error("sem aba");
    const shared = exportTab(tab);
    expect(shared.tab).not.toHaveProperty("id");
    const imported = tabFromExport(JSON.parse(JSON.stringify(shared)));
    expect(imported.id).not.toBe(tab.id);
    expect(imported.systemPrompt).toBe(tab.systemPrompt);
    expect(imported.promptVersions[0]?.origin).toBe("imported");
  });

  it("recusa arquivo de aba adulterado", () => {
    expect(() => tabFromExport({ kind: "anki-studio/tab", version: 1, tab: { name: "" } })).toThrow();
  });
});
