"use client";

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { createDefaultTabs } from "@/lib/default-tabs";
import type { FeedbackEvent, HistoryEntry } from "@/lib/schemas/storage";
import type { Tab } from "@/lib/schemas/tab";
import type { ContextEntry } from "@/lib/shared/context-search";

/**
 * Tudo que é da pessoa fica no navegador dela (IndexedDB): abas, biblioteca
 * de contexto, histórico, sinais de revisão e vocabulário conhecido.
 * Não existe conta nem banco no servidor.
 */

interface StudioDB extends DBSchema {
  tabs: { key: string; value: Tab };
  contexts: { key: string; value: ContextEntry; indexes: { byTab: string; byFingerprint: string } };
  history: { key: string; value: HistoryEntry; indexes: { byCreatedAt: string } };
  feedback: { key: string; value: FeedbackEvent; indexes: { byTab: string } };
  kv: { key: string; value: unknown };
}

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

/** Usado nos testes para começar do zero. */
export function resetDbConnection() {
  dbPromise = undefined;
}

// ---------- abas ----------

export async function listTabs(): Promise<Tab[]> {
  const db = await getDb();
  let tabs = await db.getAll("tabs");
  if (tabs.length === 0 && !(await db.get("kv", "seeded"))) {
    const tx = db.transaction(["tabs", "kv"], "readwrite");
    for (const tab of createDefaultTabs()) await tx.objectStore("tabs").put(tab);
    await tx.objectStore("kv").put(true, "seeded");
    await tx.done;
    tabs = await db.getAll("tabs");
  }
  const order = ((await db.get("kv", "tabOrder")) as string[] | undefined) ?? [];
  return tabs.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function saveTab(tab: Tab) {
  const db = await getDb();
  await db.put("tabs", tab);
}

export async function deleteTab(id: string) {
  const db = await getDb();
  await db.delete("tabs", id);
  const tx = db.transaction("feedback", "readwrite");
  for (const key of await tx.store.index("byTab").getAllKeys(id)) await tx.store.delete(key);
  await tx.done;
}

export async function saveTabOrder(ids: string[]) {
  const db = await getDb();
  await db.put("kv", ids, "tabOrder");
}

// ---------- biblioteca de contexto ----------

export async function listContexts(tabId?: string): Promise<ContextEntry[]> {
  const db = await getDb();
  return tabId ? db.getAllFromIndex("contexts", "byTab", tabId) : db.getAll("contexts");
}

/** Salva o material uma única vez (pelo fingerprint). Devolve true se salvou. */
export async function addContext(entry: ContextEntry): Promise<boolean> {
  const db = await getDb();
  const existing = await db.getFromIndex("contexts", "byFingerprint", entry.fingerprint);
  if (existing) return false;
  await db.put("contexts", entry);
  return true;
}

export async function deleteContext(id: string) {
  const db = await getDb();
  await db.delete("contexts", id);
}

// ---------- histórico ----------

export async function addHistory(entries: HistoryEntry[]) {
  const db = await getDb();
  const tx = db.transaction("history", "readwrite");
  for (const entry of entries) await tx.store.put(entry);
  await tx.done;
}

export async function listHistory(limit = 300): Promise<HistoryEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("history", "byCreatedAt");
  return all.reverse().slice(0, limit);
}

// ---------- sinais de revisão (aprender com o uso) ----------

export async function addFeedback(events: FeedbackEvent[]) {
  const db = await getDb();
  const tx = db.transaction("feedback", "readwrite");
  for (const event of events) await tx.store.put(event);
  await tx.done;
}

export async function listFeedback(tabId: string): Promise<FeedbackEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex("feedback", "byTab", tabId);
}

export async function clearFeedback(tabId: string) {
  const db = await getDb();
  const tx = db.transaction("feedback", "readwrite");
  for (const key of await tx.store.index("byTab").getAllKeys(tabId)) await tx.store.delete(key);
  await tx.done;
}

// ---------- vocabulário conhecido ----------

export async function getKnownWords(): Promise<string[]> {
  const db = await getDb();
  return ((await db.get("kv", "knownWords")) as string[] | undefined) ?? [];
}

/** Junta palavras novas ao vocabulário. Devolve quantas eram inéditas. */
export async function addKnownWords(words: string[]): Promise<number> {
  const db = await getDb();
  const current = new Set(((await db.get("kv", "knownWords")) as string[] | undefined) ?? []);
  const before = current.size;
  for (const word of words) {
    const clean = word.trim().toLowerCase();
    if (clean) current.add(clean);
  }
  await db.put("kv", [...current].sort(), "knownWords");
  return current.size - before;
}

export async function clearKnownWords() {
  const db = await getDb();
  await db.put("kv", [], "knownWords");
}

// ---------- valores soltos (cache de análises etc.) ----------

export async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get("kv", key)) as T | undefined;
}

export async function setKv(key: string, value: unknown) {
  const db = await getDb();
  await db.put("kv", value, key);
}
