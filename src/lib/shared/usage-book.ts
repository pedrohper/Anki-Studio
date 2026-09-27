import { estimateCost } from "@/lib/llm/prices";
import type { ProviderId } from "@/lib/llm/providers";

/** Gasto somado por mês e por modelo: { "2026-09": { "deepseek/deepseek-flash": {...} } }. */
export interface UsageLine {
  provider: ProviderId;
  model: string;
  calls: number;
  input: number;
  output: number;
}
export type UsageBook = Record<string, Record<string, UsageLine>>;

export interface UsageRecordLike {
  provider: ProviderId;
  model: string;
  input: number;
  output: number;
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Soma as chamadas novas no livro (sem alterar o original). */
export function addToBook(book: UsageBook, records: UsageRecordLike[], month = monthKey()): UsageBook {
  const next: UsageBook = { ...book, [month]: { ...(book[month] ?? {}) } };
  const lines = next[month] as Record<string, UsageLine>;
  for (const record of records) {
    const key = `${record.provider}/${record.model}`;
    const line = lines[key] ?? { provider: record.provider, model: record.model, calls: 0, input: 0, output: 0 };
    lines[key] = {
      ...line,
      calls: line.calls + 1,
      input: line.input + Math.max(0, record.input),
      output: line.output + Math.max(0, record.output),
    };
  }
  return next;
}

export interface MonthSummary {
  month: string;
  lines: Array<UsageLine & { cost: number | null }>;
  /** Soma só do que tem preço conhecido. */
  cost: number;
  hasUnknown: boolean;
  calls: number;
}

export function summarizeMonth(book: UsageBook, month = monthKey()): MonthSummary {
  const lines = Object.values(book[month] ?? {})
    .map((line) => ({ ...line, cost: estimateCost(line.provider, line.model, line.input, line.output) }))
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.calls - a.calls);
  return {
    month,
    lines,
    cost: lines.reduce((sum, line) => sum + (line.cost ?? 0), 0),
    hasUnknown: lines.some((line) => line.cost === null),
    calls: lines.reduce((sum, line) => sum + line.calls, 0),
  };
}
