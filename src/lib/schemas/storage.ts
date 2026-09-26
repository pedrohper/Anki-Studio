import { z } from "zod";
import { cardTypeSchema, tabSchema } from "./tab";

/** Estruturas guardadas no navegador (IndexedDB) e no arquivo de backup. */

export const contextEntrySchema = z.object({
  id: z.string(),
  tabId: z.string(),
  title: z.string(),
  content: z.string(),
  fingerprint: z.string(),
  createdAt: z.string(),
});

export const historyEntrySchema = z.object({
  id: z.string(),
  tabId: z.string(),
  tabName: z.string(),
  deckName: z.string(),
  subject: z.string(),
  type: cardTypeSchema,
  front: z.string(),
  back: z.string(),
  destination: z.enum(["anki", "apkg", "legacy"]),
  createdAt: z.string(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

const cardSnapshotSchema = z.object({ type: cardTypeSchema, front: z.string(), back: z.string() });
export type CardSnapshot = z.infer<typeof cardSnapshotSchema>;

export const feedbackEventSchema = z.object({
  id: z.string(),
  tabId: z.string(),
  kind: z.enum(["edited", "discarded", "kept"]),
  before: cardSnapshotSchema.optional(),
  after: cardSnapshotSchema.optional(),
  createdAt: z.string(),
});
export type FeedbackEvent = z.infer<typeof feedbackEventSchema>;

export const backupSchema = z.object({
  kind: z.literal("anki-studio/backup"),
  version: z.literal(1),
  exportedAt: z.string(),
  tabs: z.array(tabSchema).default([]),
  contexts: z.array(contextEntrySchema).default([]),
  history: z.array(historyEntrySchema).default([]),
  knownWords: z.array(z.string()).default([]),
});
export type Backup = z.infer<typeof backupSchema>;
