"use client";

import { addToBook, type UsageBook, type UsageRecordLike } from "@/lib/shared/usage-book";
import { getKv, setKv } from "./db";

export const USAGE_KEY = "usage";

// Uma gravação por vez: geração e revisão podem terminar ao mesmo tempo.
let queue: Promise<void> = Promise.resolve();

/** Soma o que veio no header x-llm-usage de uma resposta da IA. */
export function recordUsageHeader(header: string | null, onSaved?: () => void) {
  if (!header) return;
  let records: UsageRecordLike[];
  try {
    records = JSON.parse(header) as UsageRecordLike[];
  } catch {
    return;
  }
  if (!Array.isArray(records) || records.length === 0) return;
  queue = queue
    .then(async () => {
      const book = (await getKv<UsageBook>(USAGE_KEY)) ?? {};
      await setKv(USAGE_KEY, addToBook(book, records));
      onSaved?.();
    })
    .catch(() => undefined);
}

export async function readUsage(): Promise<UsageBook> {
  return (await getKv<UsageBook>(USAGE_KEY)) ?? {};
}
