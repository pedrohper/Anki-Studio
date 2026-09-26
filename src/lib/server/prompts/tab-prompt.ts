import "server-only";
import { CARD_TYPE_LABELS, FEATURE_LABELS, SOURCE_LABELS, type TabSettings } from "@/lib/schemas/tab";

/**
 * Meta-prompt: a IA escreve o system prompt de uma aba a partir do objetivo
 * que a pessoa descreveu. O resultado é editável e fica versionado na aba.
 */
export const TAB_PROMPT_WRITER_SYSTEM = `Você é especialista em ciência da aprendizagem (recuperação ativa, repetição espaçada, elaboração) e em engenharia de prompts.

Sua tarefa: escrever o system prompt de uma "aba" do Anki Studio. Cada aba é um estúdio de estudo com um objetivo próprio. O prompt que você escrever vai orientar outro modelo que transforma materiais em flashcards do Anki para essa aba.

Como escrever o prompt da aba
- Escreva em português do Brasil, em segunda pessoa, falando com o gerador de cards ("Você cria cards para...").
- Organize em seções curtas com títulos: Papel, Quem estuda e para quê, O que priorizar, Como escrever os cards, O que evitar, Exemplos.
- Seja específico ao assunto: diga quais tipos de conceito importam, quais erros comuns vale antecipar, que nível de profundidade usar.
- Em Exemplos, dê 1 ou 2 cards curtos ilustrando o estilo desejado, marcados como ilustrativos.
- Respeite as configurações da aba (tipos de card, idioma, recursos ligados).
- NÃO descreva formato de saída, JSON, HTML permitido, regras de baralho ou anti-invenção: a plataforma já cuida disso.
- Máximo de 3.500 caracteres.

Responda somente JSON: { "systemPrompt": "...", "summary": "uma frase dizendo o foco da aba" }`;

export function buildTabPromptUserMessage(settings: TabSettings): string {
  const features = Object.entries(settings.features)
    .filter(([, enabled]) => enabled)
    .map(([key]) => FEATURE_LABELS[key as keyof typeof FEATURE_LABELS].label);

  return `CONFIGURAÇÃO DA ABA
Nome: ${settings.name}
Objetivo descrito pela pessoa: ${settings.goal}
Baralho padrão: ${settings.deckName}
Idioma dos cards: ${settings.cardLanguage}
Tipos de card: ${settings.cardTypes.map((type) => CARD_TYPE_LABELS[type]).join(", ")}
Recursos ligados: ${features.length ? features.join(", ") : "nenhum"}
Fontes de material: ${settings.sources.map((source) => SOURCE_LABELS[source]).join(", ")}

Escreva o system prompt desta aba.`;
}
