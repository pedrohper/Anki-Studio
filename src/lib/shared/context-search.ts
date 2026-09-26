import { stripHtml } from "./text";

/**
 * Biblioteca de contexto: materiais antigos ficam no navegador e, a cada nova
 * geração, só os trechos mais parecidos com o material atual são enviados
 * para a IA. Busca simples por sobreposição de termos, sem embeddings.
 */

export interface ContextEntry {
  id: string;
  tabId: string;
  title: string;
  content: string;
  fingerprint: string;
  createdAt: string;
}

const STOPWORDS = new Set([
  "para",
  "como",
  "uma",
  "com",
  "por",
  "que",
  "dos",
  "das",
  "não",
  "sobre",
  "mais",
  "isso",
  "esse",
  "essa",
  "está",
  "são",
  "pela",
  "pelo",
  "entre",
  "quando",
  "também",
  "the",
  "and",
  "this",
  "from",
  "that",
  "with",
  "have",
  "your",
  "what",
  "will",
  "there",
]);

export function extractTerms(text: string): Set<string> {
  const terms = new Set<string>();
  for (const word of stripHtml(text)
    .toLowerCase()
    .match(/[\p{L}\p{N}]{4,}/gu) ?? []) {
    if (!STOPWORDS.has(word)) terms.add(word);
  }
  return terms;
}

export function chunkText(text: string, size = 1_800, step = 1_400): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return chunks;
}

export interface FindContextOptions {
  maxChars?: number;
  maxChunks?: number;
  /** Ignora a entrada com este fingerprint (o próprio material atual). */
  excludeFingerprint?: string;
}

export function findRelevantContext(
  query: string,
  entries: ContextEntry[],
  { maxChars = 9_000, maxChunks = 8, excludeFingerprint }: FindContextOptions = {},
): string {
  const queryTerms = extractTerms(query);
  if (queryTerms.size === 0) return "";

  const ranked: Array<{ score: number; title: string; chunk: string }> = [];
  for (const entry of entries) {
    if (excludeFingerprint && entry.fingerprint === excludeFingerprint) continue;
    for (const chunk of chunkText(entry.content)) {
      let score = 0;
      for (const term of extractTerms(chunk)) if (queryTerms.has(term)) score++;
      if (score >= 2) ranked.push({ score, title: entry.title, chunk });
    }
  }
  ranked.sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  let used = 0;
  for (const { title, chunk } of ranked.slice(0, maxChunks)) {
    const item = `[Biblioteca: ${title}]\n${chunk.trim()}`;
    if (used + item.length > maxChars) break;
    selected.push(item);
    used += item.length;
  }
  return selected.join("\n\n---\n\n");
}

/** Hash estável (SHA-256) do conteúdo normalizado, para não salvar duplicado. */
export async function fingerprint(text: string): Promise<string> {
  const normalized = text.replace(/\s+/g, " ").trim();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
