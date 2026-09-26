import { z } from "zod";

/**
 * Texto vindo de um LLM. Diferente de `z.coerce.string()`, não transforma um
 * campo ausente em "undefined" nem `null` em "null": aceita string, número ou
 * booleano e, se vier outra coisa (ou nada), usa o valor padrão.
 */
export function llmText(fallback?: string) {
  const base = z.union([z.string(), z.number(), z.boolean()]).transform(String);
  return fallback === undefined ? base : base.catch(fallback);
}

/** Lista de textos vinda de um LLM; ignora itens que não são texto. */
export function llmTextList() {
  return z
    .array(z.unknown())
    .transform((items) =>
      items
        .filter((item) => typeof item === "string" || typeof item === "number")
        .map((item) => String(item).trim())
        .filter(Boolean),
    )
    .catch([]);
}
