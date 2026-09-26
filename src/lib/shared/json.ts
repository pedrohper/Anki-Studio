/**
 * Faz o parse de JSON vindo de um LLM de forma tolerante: remove cercas de
 * código Markdown e, se ainda falhar, tenta o maior trecho entre chaves.
 */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // segue para o fallback abaixo
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // cai no erro abaixo
    }
  }
  throw new Error("Não foi possível interpretar a resposta da IA como JSON.");
}
