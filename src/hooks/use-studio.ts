"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { AnkiError, createAnkiClient, deckStats, reviewsByDay } from "@/lib/client/anki-connect";
import { api } from "@/lib/client/api";
import * as db from "@/lib/client/db";
import { useSettings } from "@/lib/client/settings";
import { PROVIDERS, type ProviderId } from "@/lib/llm/providers";
import type { Tab } from "@/lib/schemas/tab";
import { groupDecks } from "@/lib/shared/decks";

export const queryKeys = {
  config: ["config"] as const,
  tabs: ["tabs"] as const,
  anki: (mode: string, url: string) => ["anki", mode, url] as const,
  knownWords: ["knownWords"] as const,
  history: ["history"] as const,
  feedback: (tabId: string) => ["feedback", tabId] as const,
  contexts: (tabId: string) => ["contexts", tabId] as const,
};

export function useAppConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: api.config, staleTime: Number.POSITIVE_INFINITY });
}

/** O provedor pode ser usado? (chave no navegador, chave do servidor local ou Ollama local) */
export function useProviderAccess() {
  const settings = useSettings();
  const { data: config } = useAppConfig();
  return (provider: ProviderId): boolean => {
    const status = config?.providers.find((item) => item.id === provider);
    if (status && !status.enabled) return false;
    if (PROVIDERS[provider].keyless) return Boolean(status?.enabled);
    return Boolean(settings.providerKeys[provider] || status?.serverKey);
  };
}

/** Modelos efetivos: os da aba ou, se a aba não escolheu, os padrões das Configurações. */
export function useEffectiveModels(tab?: Pick<Tab, "llm">) {
  const settings = useSettings();
  const generator = tab?.llm?.generator ?? settings.generator;
  const reviewer = tab?.llm?.reviewer === undefined ? settings.reviewer : tab.llm.reviewer;
  return { generator, reviewer };
}

/** A IA de geração (da aba ou padrão) está pronta para uso? */
export function useHasAiAccess(tab?: Pick<Tab, "llm">) {
  const hasAccess = useProviderAccess();
  const { generator } = useEffectiveModels(tab);
  return hasAccess(generator.provider);
}

/** Lista de modelos do provedor (vem da API dele). */
export function useModelList(provider: ProviderId, enabled: boolean) {
  const settings = useSettings();
  const key = settings.providerKeys[provider] ?? "";
  return useQuery({
    queryKey: ["models", provider, key.slice(-6)],
    queryFn: () => api.models(provider),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useTabs() {
  return useQuery({ queryKey: queryKeys.tabs, queryFn: db.listTabs });
}

export function useSaveTab() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tab: Tab) => {
      await db.saveTab({ ...tab, updatedAt: new Date().toISOString() });
      return tab;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tabs }),
  });
}

export function useDeleteTab() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: db.deleteTab,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tabs }),
  });
}

/** Cliente do AnkiConnect conforme as configurações (direto ou via proxy local). */
export function useAnkiClient() {
  const settings = useSettings();
  const { data: config } = useAppConfig();
  const mode = settings.ankiMode === "auto" ? (config?.ankiProxyEnabled ? "proxy" : "direct") : settings.ankiMode;
  const client = useMemo(
    () => createAnkiClient({ mode, url: settings.ankiUrl, key: settings.ankiKey || undefined }),
    [mode, settings.ankiUrl, settings.ankiKey],
  );
  return { client, mode, ready: config !== undefined };
}

export interface AnkiStatus {
  connected: boolean;
  decks: string[];
  error?: string;
}

export function useAnkiStatus() {
  const { client, mode, ready } = useAnkiClient();
  const settings = useSettings();
  return useQuery({
    queryKey: queryKeys.anki(mode, settings.ankiUrl),
    enabled: ready,
    retry: false,
    refetchInterval: (query) => (query.state.data?.connected ? 30_000 : 10_000),
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AnkiStatus> => {
      try {
        const decks = await client.invoke<string[]>("deckNames");
        return {
          connected: true,
          decks: decks.filter((deck) => deck !== "Default").sort((a, b) => a.localeCompare(b)),
        };
      } catch (error) {
        return { connected: false, decks: [], error: error instanceof AnkiError ? error.message : "Anki indisponível" };
      }
    },
  });
}

export function useKnownWords() {
  return useQuery({ queryKey: queryKeys.knownWords, queryFn: db.getKnownWords });
}

export function useHistory() {
  return useQuery({ queryKey: queryKeys.history, queryFn: () => db.listHistory(300) });
}

export function useFeedback(tabId: string) {
  return useQuery({ queryKey: queryKeys.feedback(tabId), queryFn: () => db.listFeedback(tabId) });
}

export function useContexts(tabId: string) {
  return useQuery({ queryKey: queryKeys.contexts(tabId), queryFn: () => db.listContexts(tabId) });
}

/** Números do painel Início vindos do Anki: o que há para hoje e revisões por dia. */
export function useAnkiDashboard() {
  const { client, ready } = useAnkiClient();
  const { data: status } = useAnkiStatus();
  const decks = status?.decks ?? [];
  return useQuery({
    queryKey: ["dashboard", decks.join("|")],
    enabled: ready && Boolean(status?.connected),
    refetchInterval: 60_000,
    queryFn: async () => {
      const roots = groupDecks(decks).map((group) => group.root);
      const [stats, byDay] = await Promise.all([deckStats(client, roots), reviewsByDay(client).catch(() => [])]);
      return {
        stats: stats.sort(
          (a, b) => b.reviewCount + b.learnCount + b.newCount - (a.reviewCount + a.learnCount + a.newCount),
        ),
        byDay,
      };
    },
  });
}
