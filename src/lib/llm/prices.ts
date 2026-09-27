import type { ProviderId } from "./providers";

/**
 * Preço por milhão de tokens (entrada / saída), em dólar, dos modelos padrão.
 * Conferidos em setembro de 2026 (os mesmos do guia de configuração).
 * Modelo fora da lista = custo desconhecido (o painel mostra só os tokens).
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "deepseek/deepseek-flash": { input: 0.3, output: 1.2 },
  "openai/gpt-5-mini": { input: 0.25, output: 2 },
  "gemini/gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "openrouter/google/gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "groq/openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "openrouter/openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "mistral/mistral-small-latest": { input: 0.15, output: 0.6 },
};

/** Custo em dólar, ou null se não sabemos o preço do modelo. */
export function estimateCost(provider: ProviderId, model: string, input: number, output: number): number | null {
  if (provider === "ollama") return 0;
  const price = PRICES[`${provider}/${model}`];
  if (!price) return null;
  return (input * price.input + output * price.output) / 1_000_000;
}
