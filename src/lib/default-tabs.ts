import type { Tab, TabSettings } from "@/lib/schemas/tab";

/**
 * Abas que já vêm prontas no primeiro acesso. Os prompts foram escritos à mão
 * (origem "template") para a plataforma funcionar mesmo antes de a pessoa
 * pedir para a IA gerar um prompt personalizado.
 */

const GENERAL_PROMPT = `## Papel
Você é um professor particular criterioso que transforma materiais de estudo em uma revisão que também ensina.

## Quem estuda e para quê
Estudante universitário que quer entender e lembrar o conteúdo a longo prazo, não só decorar para a prova.

## O que priorizar
- Primeiro identifique o assunto, o nível e as ideias centrais que valem revisão.
- Conceitos, definições, relações de causa e efeito, diferenças entre ideias parecidas e passos de procedimentos.
- Em Exatas: fórmulas, interpretação de cada termo e quando usar cada método. Nada de exercícios longos que exijam caderno.

## Como escrever os cards
- Uma pergunta precisa por ideia; evite perguntas vagas ("fale sobre...").
- No verso, explique a ideia primeiro e depois dê um exemplo, consequência ou comparação curta.
- Una detalhes que só fazem sentido juntos, mas não esconda várias ideias soltas no mesmo card.

## O que evitar
- Listas enormes para decorar, cards óbvios e perguntas cuja resposta aparece na própria frente.

## Exemplos (ilustrativos)
- Frente: "Por que a média é sensível a outliers, e a mediana não?" — Verso: "A média usa o valor de todos os dados... Ex.: salários com um CEO no grupo."`;

const ENGLISH_PROMPT = `## Papel
Você é um tutor de inglês que usa a metodologia Comprehensible Input (i+1) para brasileiros.

## Quem estuda e para quê
Brasileiro de nível intermediário que quer ampliar vocabulário para ler documentação técnica, conversar no trabalho e se preparar para morar no exterior.

## O que priorizar
- Para cada palavra, crie uma frase natural e útil do dia a dia ou do trabalho em que só a palavra-alvo seja nova.
- Se a palavra tiver mais de um significado comum e importante (ex.: run = correr / administrar / executar um programa), crie até 3 cards, um por sentido.
- Detecte falsos cognatos (actually, pretend, attend, push, eventually, fabric...) e alerte no verso.

## Como escrever os cards
- Frente: a frase em inglês com a palavra-alvo em <b>negrito</b>.
- Verso: "<b>palavra</b> = tradução (contexto)", seguida de uma explicação curta de uso. Para falso cognato, inclua uma caixa: <div style='background:#fee2e2; color:#7f1d1d; padding:6px; border-radius:4px'>⚠️ Falso amigo: ...</div>
- audioText: a frase em inglês da frente, sem HTML.

## O que evitar
- Frases artificiais, vocabulário raro ao redor da palavra-alvo e traduções sem contexto.

## Exemplos (ilustrativos)
- Frente: "I <b>actually</b> like working early." — Verso: "<b>actually</b> = na verdade (reforça o que é real)."`;

type TemplateTab = Omit<Tab, "createdAt" | "updatedAt" | "promptVersions">;

const templates: TemplateTab[] = [
  {
    id: "estudo-geral",
    name: "Estudo geral",
    emoji: "🎓",
    goal: "Transformar aulas, PDFs, artigos e vídeos em cards de revisão ativa que ensinam o conteúdo, para qualquer matéria da faculdade.",
    deckName: "Estudos",
    cardTypes: ["basic", "cloze"],
    cardLanguage: "português",
    features: { audio: false, knownVocabulary: false, formulas: true, code: true },
    sources: ["text", "pdf", "url", "youtube"],
    systemPrompt: GENERAL_PROMPT,
  },
  {
    id: "ingles-i1",
    name: "Inglês i+1",
    emoji: "🇺🇸",
    goal: "Aprender vocabulário em inglês com frases i+1, áudio nativo, vários sentidos por palavra e alerta de falsos cognatos.",
    deckName: "Inglês",
    cardTypes: ["basic"],
    cardLanguage: "inglês (frente) e português (verso)",
    features: { audio: true, knownVocabulary: true, formulas: false, code: false },
    sources: ["wordlist", "text"],
    ttsVoice: "en-US-ChristopherNeural",
    systemPrompt: ENGLISH_PROMPT,
  },
];

export function createDefaultTabs(now = new Date().toISOString()): Tab[] {
  return templates.map((template) => ({
    ...template,
    createdAt: now,
    updatedAt: now,
    promptVersions: [{ id: `${template.id}-v1`, prompt: template.systemPrompt, origin: "template", createdAt: now }],
  }));
}

/** Valores iniciais do formulário de nova aba. */
export const EMPTY_TAB_SETTINGS: TabSettings = {
  name: "",
  emoji: "📚",
  goal: "",
  deckName: "",
  cardTypes: ["basic"],
  cardLanguage: "português",
  features: { audio: false, knownVocabulary: false, formulas: false, code: false },
  sources: ["text", "pdf"],
};

/** Prompt mínimo para quem cria a aba sem usar a IA (ex.: ainda sem chave). */
export function manualPromptFor(settings: TabSettings): string {
  return `## Papel
Você cria flashcards de revisão ativa para a aba "${settings.name}".

## Objetivo
${settings.goal}

## Como escrever os cards
- Uma ideia por card, com pergunta precisa.
- No verso, explique primeiro e depois dê um exemplo curto.

## O que evitar
- Cards vagos, listas longas e respostas que aparecem na frente.`;
}

export const LANGUAGE_OPTIONS = [
  "português",
  "inglês",
  "espanhol",
  "inglês (frente) e português (verso)",
  "espanhol (frente) e português (verso)",
];

export const VOICE_OPTIONS = [
  { value: "en-US-ChristopherNeural", label: "Inglês (EUA) · Christopher" },
  { value: "en-US-JennyNeural", label: "Inglês (EUA) · Jenny" },
  { value: "en-GB-RyanNeural", label: "Inglês (Reino Unido) · Ryan" },
  { value: "en-CA-LiamNeural", label: "Inglês (Canadá) · Liam" },
  { value: "es-ES-AlvaroNeural", label: "Espanhol (Espanha) · Álvaro" },
  { value: "pt-BR-AntonioNeural", label: "Português (Brasil) · Antônio" },
  { value: "fr-FR-HenriNeural", label: "Francês · Henri" },
];
