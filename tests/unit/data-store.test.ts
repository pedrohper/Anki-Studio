import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as store } from "@/app/api/store/route";
import { resetDataStoreCache, runStoreOp } from "@/lib/server/data-store";

describe("dados guardados no PC", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "anki-store-"));
    process.env.ANKI_STUDIO_DATA_DIR = dir;
    resetDataStoreCache();
  });
  afterEach(() => {
    delete process.env.ANKI_STUDIO_DATA_DIR;
    delete process.env.VERCEL;
    rmSync(dir, { recursive: true, force: true });
  });

  it("grava, lê, apaga e sobrevive a reiniciar o app", async () => {
    await runStoreOp({
      op: "putMany",
      store: "tabs",
      values: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
    });
    await runStoreOp({ op: "put", store: "kv", key: "userName", value: "Pedro" });
    await runStoreOp({ op: "delete", store: "tabs", key: "b" });
    resetDataStoreCache(); // como se o servidor tivesse reiniciado
    expect(await runStoreOp({ op: "getAll", store: "tabs" })).toEqual([{ id: "a", name: "A" }]);
    expect(await runStoreOp({ op: "get", store: "kv", key: "userName" })).toBe("Pedro");
    expect(JSON.parse(readFileSync(path.join(dir, "estudio", "tabs.json"), "utf8"))).toHaveProperty("a");
  });

  it("juntar os dados de um aparelho não sobrescreve o que o PC já tem", async () => {
    await runStoreOp({ op: "put", store: "history", value: { id: "1", front: "do PC" } });
    const added = await runStoreOp({
      op: "mergeMany",
      store: "history",
      values: [
        { id: "1", front: "do celular" },
        { id: "2", front: "só no celular" },
      ],
    });
    expect(added).toBe(1);
    expect(await runStoreOp({ op: "get", store: "history", key: "1" })).toEqual({ id: "1", front: "do PC" });
  });

  it("apaga os sinais de revisão de uma aba", async () => {
    await runStoreOp({
      op: "putMany",
      store: "feedback",
      values: [
        { id: "f1", tabId: "x" },
        { id: "f2", tabId: "y" },
      ],
    });
    expect(await runStoreOp({ op: "deleteWhere", store: "feedback", field: "tabId", equals: "x" })).toBe(1);
    expect(await runStoreOp({ op: "getAll", store: "feedback" })).toEqual([{ id: "f2", tabId: "y" }]);
  });

  it("gravações ao mesmo tempo não se perdem", async () => {
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => runStoreOp({ op: "put", store: "history", value: { id: String(i) } })),
    );
    resetDataStoreCache();
    expect((await runStoreOp({ op: "getAll", store: "history" })) as unknown[]).toHaveLength(30);
  });

  it("a rota recusa loja desconhecida e fica desligada na Vercel", async () => {
    const call = (body: unknown) =>
      store(new Request("http://localhost/api/store", { method: "POST", body: JSON.stringify(body) }));
    expect((await call({ op: "getAll", store: "segredos" })).status).toBe(400);
    expect((await call({ op: "getAll", store: "tabs" })).status).toBe(200);
    process.env.VERCEL = "1";
    expect((await call({ op: "getAll", store: "tabs" })).status).toBe(404);
  });
});
