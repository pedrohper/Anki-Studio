/** Remove tags HTML e marcações de áudio do Anki, mantendo o texto. */
export function stripHtml(html: string): string {
  return html
    .replace(/\[sound:[^\]]+\]/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Forma canônica de um texto para detectar cards repetidos. */
export function normalizeForCompare(text: string): string {
  return stripHtml(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Divide um material longo em partes de até `maxChars`, preferindo quebrar
 * entre parágrafos e depois entre frases, para não cortar ideias no meio.
 */
export function splitMaterial(text: string, maxChars: number): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];

  const parts: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) parts.push(current.trim());
    current = "";
  };

  for (const paragraph of clean.split(/\n{2,}/)) {
    if (paragraph.length > maxChars) {
      pushCurrent();
      // Parágrafo gigante: quebra por frases e, em último caso, por tamanho.
      let buffer = "";
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
        if (sentence.length > maxChars) {
          if (buffer.trim()) parts.push(buffer.trim());
          buffer = "";
          for (let i = 0; i < sentence.length; i += maxChars) parts.push(sentence.slice(i, i + maxChars));
          continue;
        }
        if (buffer.length + sentence.length + 1 > maxChars) {
          parts.push(buffer.trim());
          buffer = "";
        }
        buffer += `${sentence} `;
      }
      if (buffer.trim()) parts.push(buffer.trim());
      continue;
    }
    if (current.length + paragraph.length + 2 > maxChars) pushCurrent();
    current += `${paragraph}\n\n`;
  }
  pushCurrent();
  return parts;
}

/**
 * Lê uma lista de palavras colada em qualquer formato: uma por linha,
 * numerada, com marcadores ou separada por vírgula/ponto e vírgula.
 * Expressões com espaço ("spill the beans") são mantidas.
 */
export function parseWordList(raw: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  const cleaned = raw.replace(/^\s*(?:\d+[.)]|[-*•])\s*/gm, "");
  for (const token of cleaned.split(/[\n\r,;\t]+/)) {
    const word = token
      .trim()
      .replace(/^["'`([{]+|["'`)\]}]+$/g, "")
      .trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

/** Extrai palavras em inglês (2+ letras) de um texto, sem repetição. */
export function extractEnglishWords(text: string): string[] {
  const found =
    stripHtml(text)
      .toLowerCase()
      .match(/\b[a-z]{2,}\b/g) ?? [];
  return [...new Set(found)];
}

/** Converte um texto livre numa tag válida do Anki (sem espaços). */
export function toAnkiTag(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w:-]/g, "")
    .slice(0, 60);
}

/** Nome de arquivo seguro para mídia do Anki. */
export function toMediaFilename(base: string, extension = "mp3"): string {
  const slug = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return `ankistudio_${slug || "audio"}.${extension}`;
}
