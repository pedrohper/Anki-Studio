import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "./access-store";

/**
 * Dados do estúdio guardados no PC (data/estudio/*.json) quando o app roda em
 * casa. Assim o PC e o celular (pelo Wi-Fi ou pelo link de fora de casa) veem
 * as mesmas abas, histórico e conquistas. Na Vercel isto fica desligado e cada
 * navegador guarda os próprios dados no IndexedDB.
 */

export const STORES = ["tabs", "contexts", "history", "feedback", "kv"] as const;
export const storeNameSchema = z.enum(STORES);
export type StoreName = z.infer<typeof storeNameSchema>;

type Records = Record<string, unknown>;

export function sharedDataEnabled(): boolean {
  return !process.env.VERCEL && process.env.SHARED_DATA !== "false";
}

const storeDir = () => path.join(dataDir(), "estudio");
const storePath = (store: StoreName) => path.join(storeDir(), `${store}.json`);

// Uma cópia em memória por pasta de dados; o disco é a fonte de verdade ao ligar.
const memory = globalThis as typeof globalThis & {
  __ankiStores?: { dir: string; data: Partial<Record<StoreName, Records>>; queue: Promise<void> };
};
function cache() {
  if (!memory.__ankiStores || memory.__ankiStores.dir !== storeDir()) {
    memory.__ankiStores = { dir: storeDir(), data: {}, queue: Promise.resolve() };
  }
  return memory.__ankiStores;
}

function load(store: StoreName): Records {
  const current = cache();
  if (!current.data[store]) {
    try {
      current.data[store] = JSON.parse(readFileSync(storePath(store), "utf8")) as Records;
    } catch {
      current.data[store] = {};
    }
  }
  return current.data[store] as Records;
}

function persist(store: StoreName) {
  mkdirSync(storeDir(), { recursive: true });
  const temp = `${storePath(store)}.tmp`;
  writeFileSync(temp, JSON.stringify(load(store)));
  renameSync(temp, storePath(store));
}

/** Uma alteração por vez, para duas requisições não se atropelarem ao gravar. */
async function mutate<T>(store: StoreName, change: (records: Records) => T): Promise<T> {
  const current = cache();
  let result!: T;
  const run = current.queue.then(() => {
    result = change(load(store));
    persist(store);
  });
  current.queue = run.catch(() => undefined);
  await run;
  return result;
}

const keyOf = (value: unknown): string => {
  const id = (value as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) throw new Error("Registro sem id.");
  return id;
};

export const storeOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("getAll"), store: storeNameSchema }),
  z.object({ op: z.literal("get"), store: storeNameSchema, key: z.string() }),
  z.object({ op: z.literal("put"), store: storeNameSchema, value: z.unknown(), key: z.string().optional() }),
  z.object({ op: z.literal("putMany"), store: storeNameSchema, values: z.array(z.unknown()).max(20_000) }),
  /** Só grava o que ainda não existe (usado ao juntar os dados de um aparelho). */
  z.object({ op: z.literal("mergeMany"), store: storeNameSchema, values: z.array(z.unknown()).max(20_000) }),
  z.object({ op: z.literal("delete"), store: storeNameSchema, key: z.string() }),
  z.object({ op: z.literal("deleteWhere"), store: storeNameSchema, field: z.string(), equals: z.string() }),
]);
export type StoreOp = z.infer<typeof storeOpSchema>;

export async function runStoreOp(op: StoreOp): Promise<unknown> {
  switch (op.op) {
    case "getAll":
      return Object.values(load(op.store));
    case "get":
      return load(op.store)[op.key] ?? null;
    case "put":
      return mutate(op.store, (records) => {
        records[op.store === "kv" ? (op.key ?? "") : keyOf(op.value)] = op.value;
        return true;
      });
    case "putMany":
      return mutate(op.store, (records) => {
        for (const value of op.values) records[keyOf(value)] = value;
        return op.values.length;
      });
    case "mergeMany":
      return mutate(op.store, (records) => {
        let added = 0;
        for (const value of op.values) {
          const key = keyOf(value);
          if (!(key in records)) {
            records[key] = value;
            added++;
          }
        }
        return added;
      });
    case "delete":
      return mutate(op.store, (records) => {
        delete records[op.key];
        return true;
      });
    case "deleteWhere":
      return mutate(op.store, (records) => {
        let removed = 0;
        for (const [key, value] of Object.entries(records)) {
          if ((value as Record<string, unknown> | null)?.[op.field] === op.equals) {
            delete records[key];
            removed++;
          }
        }
        return removed;
      });
  }
}

/** Usado nos testes. */
export function resetDataStoreCache() {
  memory.__ankiStores = undefined;
}
