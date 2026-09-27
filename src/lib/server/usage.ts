import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ProviderId } from "@/lib/llm/providers";

/**
 * Conta os tokens gastos em cada requisição e devolve no header x-llm-usage.
 * O navegador soma isso no painel de custos (nada fica guardado no servidor,
 * então funciona igual no PC e na Vercel).
 */
export interface UsageRecord {
  provider: ProviderId;
  model: string;
  input: number;
  output: number;
}

export const USAGE_HEADER = "x-llm-usage";

const storage = new AsyncLocalStorage<UsageRecord[]>();

/** Chamado pelo completeJson a cada resposta da IA. */
export function recordUsage(record: UsageRecord) {
  storage.getStore()?.push(record);
}

/** Envolve uma rota de IA: tudo o que ela gastar vai no header da resposta. */
export function withUsage(handler: (request: Request) => Promise<Response>) {
  return (request: Request) =>
    storage.run([], async () => {
      const response = await handler(request);
      const usage = storage.getStore();
      if (usage?.length) response.headers.set(USAGE_HEADER, JSON.stringify(usage));
      return response;
    });
}
