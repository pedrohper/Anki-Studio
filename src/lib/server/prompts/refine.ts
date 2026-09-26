import "server-only";
import type { RefineRequest } from "@/lib/schemas/api";
import { stripHtml } from "@/lib/shared/text";

/**
 * A aba "aprende com o uso": a pessoa edita ou descarta cards na revisão e,
 * com esses sinais, a IA propõe uma nova versão do prompt. A mudança só vale
 * depois que a pessoa aceita.
 */
export const REFINE_SYSTEM = `Você melhora system prompts de geração de flashcards com base em como a pessoa revisou os cards gerados.

Sinais que você recebe
- Cards EDITADOS (antes e depois): mostram o estilo que a pessoa prefere.
- Cards DESCARTADOS: mostram o que ela não quer.
- Quantidade de cards MANTIDOS sem alteração: mostram o que já funciona.

Como decidir
- Procure padrões que se repetem (ex.: respostas longas demais, perguntas vagas, excesso de cards sobre detalhes). Não reaja a um caso isolado.
- Se não houver padrão claro, responda shouldChange=false.
- Se houver, faça mudanças mínimas e específicas no prompt atual, mantendo a estrutura e tudo que já funciona.
- Não adicione regras de formato de saída, JSON, HTML ou baralho: a plataforma já cuida disso.
- O prompt final deve ter no máximo 3.500 caracteres, em português do Brasil.

Responda somente JSON:
{ "shouldChange": true, "proposedPrompt": "prompt completo revisado", "changes": ["mudança 1 explicada em linguagem simples", "..."] }`;

const clip = (text: string, max = 400) => {
  const plain = stripHtml(text);
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
};

export function buildRefineUserMessage({ tab, signals }: RefineRequest): string {
  const edited = signals.edited
    .map(
      (edit, index) =>
        `${index + 1}. ANTES — frente: ${clip(edit.before.front)} | verso: ${clip(edit.before.back)}\n   DEPOIS — frente: ${clip(edit.after.front)} | verso: ${clip(edit.after.back)}`,
    )
    .join("\n");
  const discarded = signals.discarded
    .map((card, index) => `${index + 1}. frente: ${clip(card.front)} | verso: ${clip(card.back)}`)
    .join("\n");

  return `ABA: ${tab.name}
OBJETIVO: ${tab.goal}

PROMPT ATUAL:
---
${tab.systemPrompt}
---

CARDS EDITADOS (${signals.edited.length}):
${edited || "(nenhum)"}

CARDS DESCARTADOS (${signals.discarded.length}):
${discarded || "(nenhum)"}

CARDS MANTIDOS SEM ALTERAÇÃO: ${signals.kept}`;
}
