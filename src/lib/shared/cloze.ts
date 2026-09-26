const CLOZE_PATTERN = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Verdadeiro quando o texto tem pelo menos uma lacuna {{c1::...}}. */
export function hasCloze(text: string): boolean {
  CLOZE_PATTERN.lastIndex = 0;
  return CLOZE_PATTERN.test(text);
}

/** Números de lacuna usados no texto (c1, c2...), em ordem crescente. */
export function clozeNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const match of text.matchAll(CLOZE_PATTERN)) numbers.add(Number(match[1]));
  return [...numbers].sort((a, b) => a - b);
}

/** Troca as lacunas por marcações visíveis na prévia. */
export function renderClozePreview(text: string, reveal: boolean): string {
  return text.replace(CLOZE_PATTERN, (_m, _n, answer: string, hint?: string) =>
    reveal ? `<mark class="cloze">${answer}</mark>` : `<mark class="cloze">[${hint ? hint : "..."}]</mark>`,
  );
}
