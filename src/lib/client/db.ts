"use client";

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { createDefaultTabs } from "@/lib/default-tabs";
import type { FeedbackEvent, HistoryEntry } from "@/lib/schemas/storage";
import type { Tab } from "@/lib/schemas/tab";
import type { ContextEntry } from "@/lib/shared/context-search";

/**
 * Onde ficam os dados da pessoa: abas, biblioteca de contexto, histórico,
 * sinais de revisão, vocabulário e conquistas.
 *
 * - Rodando no PC (executar.bat): no próprio PC, em data/estudio. Assim o PC e o
 *   celular (Wi-Fi ou link de fora de casa) veem exatamente os mesmos dados.
 * - No site público (Vercel): no navegador (IndexedDB). Não existe conta.
 *
 * As funções abaixo não sabem qual dos dois está em uso: falam com um "backend".
 */

interface StudioDB extends DBSchema {
  tabs: { key: string; value: Tab };
  contexts: { key: string; value: ContextEntry; indexes: { byTab: string; byFingerprint: string } };
  history: { key: string; value: HistoryEntry; indexes: { byCreatedAt: string } };
  feedback: { key: string; value: FeedbackEvent; indexes: { byTab: string } };
  kv: { key: string; value: unknown };
}

type StoreName = "tabs" | "contexts" | "history" | "feedback" | "kv";

let dbPromise: Promise<IDBPDatabase<StudioDB>> | undefined;

export function getDb() {
  dbPromise ??= openDB<StudioDB>("anki-studio", 1, {
    upgrade(db) {
      db.createObjectStore("tabs", { keyPath: "id" });
      const contexts = db.createObjectStore("contexts", { keyPath: "id" });
      contexts.createIndex("byTab", "tabId");
      contexts.createIndex("byFingerprint", "fingerprint", { unique: false });
      const history = db.createObjectStore("history", { keyPath: "id" });
      history.createIndex("byCreatedAt", "createdAt");
      const feedback = db.createObjectStore("feedback", { keyPath: "id" });
      feedback.createIndex("byTab", "tabId");
      db.createObjectStore("kv");
    },
  });
  return dbPromise;
}

interface Backend {
  getAll<T>(store: StoreName): Promise<T[]>;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, value: unknown, key?: string): Promise<void>;
  putMany(store: StoreName, values: unknown[]): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  deleteWhere(store: StoreName, field: string, equals: string): Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: o idb tipa cada store; aqui o acesso é genérico
type AnyDb = IDBPDatabase<any>;

const localBackend: Backend = {
  async getAll<T>(store: StoreName) {
    return ((await getDb()) as AnyDb).getAll(store) as Promise<T[]>;
  },
  async get<T>(store: StoreName, key: string) {
    return ((await getDb()) as AnyDb).get(store, key) as Promise<T | undefined>;
  },
  async put(store, value, key) {
    const db = (await getDb()) as AnyDb;
    await (store === "kv" ? db.put(store, value, key) : db.put(store, value));
  },
  async putMany(store, values) {
    const tx = ((await getDb()) as AnyDb).transaction(store, "readwrite");
    for (const value of values) await tx.store.put(value);
    await tx.done;
  },
  async delete(store, key) {
    await ((await getDb()) as AnyDb).delete(store, key);
  },
  async deleteWhere(store, field, equals) {
    const tx = ((await getDb()) as AnyDb).transaction(store, "readwrite");
    for (const value of (await tx.store.getAll()) as Array<Record<string, unknown>>) {
      if (value[field] === equals) await tx.store.delete(value.id as string);
    }
    await tx.done;
  },
};

async function storeOp<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/store", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Não consegui falar com o PC (erro ${response.status}).`);
  return ((await response.json()) as { result: T }).result;
}

const serverBackend: Backend = {
  getAll: (store) => storeOp({ op: "getAll", store }),
  get: async (store, key) => (await storeOp({ op: "get", store, key })) ?? undefined,
  put: (store, value, key) => storeOp({ op: "put", store, value, key }),
  putMany: (store, values) => storeOp({ op: "putMany", store, values }),
  delete: (store, key) => storeOp({ op: "delete", store, key }),
  deleteWhere: (store, field, equals) => storeOp({ op: "deleteWhere", store, field, equals }),
};

let backendPromise: Promise<Backend> | undefined;

/** Pergunta uma vez ao servidor se os dados ficam no PC. Sem resposta, usa o navegador. */
function backend(): Promise<Backend> {
  backendPromise ??= (async () => {
    if (typeof window === "undefined" || typeof fetch === "undefined") return localBackend;
    try {
      const response = await fetch("/api/config");
      const config = (await response.json()) as { sharedData?: boolean };
      if (!config.sharedData) return localBackend;
      await bringLocalDataToPc();
      return serverBackend;
    } catch {
      return localBackend;
    }
  })();
  return backendPromise;
}

/** Os testes usam o navegador (IndexedDB) direto. */
export function resetDbConnection() {
  dbPromise = undefined;
  backendPromise = Promise.resolve(localBackend);
}

export function isSharedStorage(): Promise<boolean> {
  return backend().then((current) => current === serverBackend);
}

const MIGRATED_KEY = "migratedToPc";

/**
 * Na primeira vez que este navegador usa os dados do PC, junta o que ele já
 * tinha (abas, histórico, conquistas...) sem apagar nada de nenhum dos lados.
 */
async function bringLocalDataToPc() {
  let db: AnyDb;
  try {
    db = (await getDb()) as AnyDb;
  } catch {
    return; // navegador sem IndexedDB: nada para trazer
  }
  if (await db.get("kv", MIGRATED_KEY)) return;
  for (const store of ["tabs", "contexts", "history", "feedback"] as const) {
    const values = await db.getAll(store);
    for (let i = 0; i < values.length; i += 2_000) {
      await storeOp({ op: "mergeMany", store, values: values.slice(i, i + 2_000) });
    }
  }
  // Valores soltos: junta vocabulário e conquistas; o resto só entra se o PC ainda não tiver.
  const keys = (await db.getAllKeys("kv")) as string[];
  for (const key of keys) {
    const local = await db.get("kv", key);
    const remote = await storeOp<unknown>({ op: "get", store: "kv", key });
    let value: unknown = remote ?? local;
    if (key === "knownWords" && Array.isArray(local) && Array.isArray(remote)) {
      value = [...new Set([...remote, ...local])].sort();
    } else if (key === "achievements" && local && remote && typeof local === "object" && typeof remote === "object") {
      value = { ...(local as object), ...(remote as object) };
    }
    if (value !== remote) await storeOp({ op: "put", store: "kv", key, value });
  }
  await db.put("kv", true, MIGRATED_KEY);
}

// ---------- abas ----------

export async function listTabs(): Promise<Tab[]> {
  const store = await backend();
  let tabs = await store.getAll<Tab>("tabs");
  if (tabs.length === 0 && !(await store.get("kv", "seeded"))) {
    await store.putMany("tabs", createDefaultTabs());
    await store.put("kv", true, "seeded");
    tabs = await store.getAll<Tab>("tabs");
  }
  const order = (await store.get<string[]>("kv", "tabOrder")) ?? [];
  return tabs.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function saveTab(tab: Tab) {
  await (await backend()).put("tabs", tab);
}

export async function deleteTab(id: string) {
  const store = await backend();
  await store.delete("tabs", id);
  await store.deleteWhere("feedback", "tabId", id);
}

export async function saveTabOrder(ids: string[]) {
  await (await backend()).put("kv", ids, "tabOrder");
}

// ---------- biblioteca de contexto ----------

export async function listContexts(tabId?: string): Promise<ContextEntry[]> {
  const all = await (await backend()).getAll<ContextEntry>("contexts");
  return tabId ? all.filter((entry) => entry.tabId === tabId) : all;
}

/** Salva o material uma única vez (pelo fingerprint). Devolve true se salvou. */
export async function addContext(entry: ContextEntry): Promise<boolean> {
  const store = await backend();
  const existing = (await store.getAll<ContextEntry>("contexts")).find(
    (item) => item.fingerprint === entry.fingerprint,
  );
  if (existing) return false;
  await store.put("contexts", entry);
  return true;
}

export async function deleteContext(id: string) {
  await (await backend()).delete("contexts", id);
}

// ---------- histórico ----------

export async function addHistory(entries: HistoryEntry[]) {
  if (entries.length) await (await backend()).putMany("history", entries);
}

export async function listHistory(limit = 300): Promise<HistoryEntry[]> {
  const all = await (await backend()).getAll<HistoryEntry>("history");
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Quantos cards já foram criados (para o XP e as conquistas). */
export async function countHistory(): Promise<number> {
  return (await (await backend()).getAll("history")).length;
}

// ---------- sinais de revisão (aprender com o uso) ----------

export async function addFeedback(events: FeedbackEvent[]) {
  if (events.length) await (await backend()).putMany("feedback", events);
}

export async function listFeedback(tabId: string): Promise<FeedbackEvent[]> {
  return (await (await backend()).getAll<FeedbackEvent>("feedback")).filter((event) => event.tabId === tabId);
}

export async function clearFeedback(tabId: string) {
  await (await backend()).deleteWhere("feedback", "tabId", tabId);
}

// ---------- vocabulário conhecido ----------

export async function getKnownWords(): Promise<string[]> {
  return (await (await backend()).get<string[]>("kv", "knownWords")) ?? [];
}

/** Junta palavras novas ao vocabulário. Devolve quantas eram inéditas. */
export async function addKnownWords(words: string[]): Promise<number> {
  const store = await backend();
  const current = new Set((await store.get<string[]>("kv", "knownWords")) ?? []);
  const before = current.size;
  for (const word of words) {
    const clean = word.trim().toLowerCase();
    if (clean) current.add(clean);
  }
  await store.put("kv", [...current].sort(), "knownWords");
  return current.size - before;
}

export async function clearKnownWords() {
  await (await backend()).put("kv", [], "knownWords");
}

// ---------- valores soltos (cache de análises, conquistas etc.) ----------

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await backend()).get<T>("kv", key);
}

export async function setKv(key: string, value: unknown) {
  await (await backend()).put("kv", value, key);
}
