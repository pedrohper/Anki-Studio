"use client";

import { type Backup, backupSchema } from "@/lib/schemas/storage";
import { type Tab, type TabExport, tabExportSchema } from "@/lib/schemas/tab";
import { createId, nowIso } from "@/lib/shared/id";
import {
  addContext,
  addHistory,
  addKnownWords,
  getKnownWords,
  listContexts,
  listHistory,
  listTabs,
  saveTab,
} from "./db";

export async function exportBackup(): Promise<Backup> {
  return {
    kind: "anki-studio/backup",
    version: 1,
    exportedAt: nowIso(),
    tabs: await listTabs(),
    contexts: await listContexts(),
    history: await listHistory(100_000),
    knownWords: await getKnownWords(),
  };
}

export interface ImportSummary {
  tabs: number;
  contexts: number;
  history: number;
  knownWords: number;
}

/** Importa um backup, mesclando com o que já existe (nada é apagado). */
export async function importBackup(raw: unknown): Promise<ImportSummary> {
  const backup = backupSchema.parse(raw);
  for (const tab of backup.tabs) await saveTab(tab);
  let contexts = 0;
  for (const entry of backup.contexts) if (await addContext(entry)) contexts++;
  await addHistory(backup.history);
  const knownWords = await addKnownWords(backup.knownWords);
  return { tabs: backup.tabs.length, contexts, history: backup.history.length, knownWords };
}

export function exportTab(tab: Tab): TabExport {
  const { id: _id, createdAt: _c, updatedAt: _u, promptVersions: _v, ...settings } = tab;
  return { kind: "anki-studio/tab", version: 1, exportedAt: nowIso(), tab: settings };
}

/** Cria uma aba nova a partir de um arquivo compartilhado. */
export function tabFromExport(raw: unknown): Tab {
  const { tab } = tabExportSchema.parse(raw);
  const now = nowIso();
  return {
    ...tab,
    id: createId(),
    createdAt: now,
    updatedAt: now,
    promptVersions: [{ id: createId(), prompt: tab.systemPrompt, origin: "imported", createdAt: now }],
  };
}
