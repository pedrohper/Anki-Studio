"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  BrainIcon,
  Loader2Icon,
  PartyPopperIcon,
  RefreshCwIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnkiClient, useAnkiStatus, useEffectiveModels, useHasAiAccess, useTabs } from "@/hooks/use-studio";
import { openDeckInAnki, type StruggleCard, struggleCards } from "@/lib/client/anki-connect";
import { api } from "@/lib/client/api";
import { getKv, setKv } from "@/lib/client/db";
import type { WeakSpotsResponse, WeakTheme } from "@/lib/schemas/api";
import type { Tab } from "@/lib/schemas/tab";
import { groupDecks } from "@/lib/shared/decks";
import { tabForDeck } from "@/lib/tab-match";
import type { GenerationDraft } from "./material-input";

export interface WeakSpotsCache {
  scope: string;
  at: string;
  cards: StruggleCard[];
  analysis: WeakSpotsResponse | null;
}

export const WEAK_SPOTS_KEY = "weakSpots";

export function useWeakSpotsCache() {
  return useQuery({
    queryKey: ["weakSpots"],
    queryFn: () => getKv<WeakSpotsCache>(WEAK_SPOTS_KEY).then((value) => value ?? null),
  });
}

/** Monta o material de reforço a partir dos cards errados de um tema. */
export function reinforcementDraft(theme: WeakTheme, cards: StruggleCard[]): GenerationDraft {
  const list = cards
    .filter((card) => theme.cardIds.includes(String(card.cardId)))
    .map(
      (card) =>
        `- Frente: ${card.front}\n  Verso: ${card.back}\n  (errou ${card.lapses} ${card.lapses === 1 ? "vez" : "vezes"})`,
    )
    .join("\n");
  const material = `TEMA QUE A PESSOA ERRA: ${theme.title}\nPOR QUE: ${theme.why}\nDICAS: ${theme.tips.join(" | ")}\n\nCARDS QUE ELA ERRA:\n${list}`;
  return { mode: "material", material, words: [], sourceLabel: `Reforço: ${theme.title}`, purpose: "reinforcement" };
}

/**
 * "É bom revisar mais isto": lê do Anki os cards com mais erros, a IA agrupa
 * por tema, explica o porquê e oferece gerar cards de reforço.
 */
export function WeakSpotsView({ onReinforce }: { onReinforce: (tabId: string, draft: GenerationDraft) => void }) {
  const { data: anki } = useAnkiStatus();
  const { client } = useAnkiClient();
  const { data: tabs = [] } = useTabs();
  const { generator } = useEffectiveModels();
  const hasAi = useHasAiAccess();
  const queryClient = useQueryClient();
  const { data: cache } = useWeakSpotsCache();
  const [scope, setScope] = useState<string>(cache?.scope ?? "");
  const roots = groupDecks(anki?.decks ?? []).map((group) => group.root);

  const analyze = useMutation({
    mutationFn: async (): Promise<WeakSpotsCache> => {
      const cards = await struggleCards(client, scope || undefined, 60);
      if (cards.length === 0 || !hasAi) return { scope, at: new Date().toISOString(), cards, analysis: null };
      const analysis = await api.weakSpots({
        cards: cards.map((card) => ({
          id: String(card.cardId),
          deckName: card.deckName,
          front: card.front,
          back: card.back,
          lapses: card.lapses,
          ease: card.ease,
        })),
        llm: generator,
      });
      return { scope, at: new Date().toISOString(), cards, analysis };
    },
    onSuccess: async (result) => {
      await setKv(WEAK_SPOTS_KEY, result);
      await queryClient.invalidateQueries({ queryKey: ["weakSpots"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const result = analyze.data ?? cache ?? null;
  const pickTab = (deckName: string): Tab | undefined => tabForDeck(tabs, deckName) ?? tabs[0];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <TargetIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-2xl tracking-tight">Pontos fracos</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            A IA olha os cards que você mais erra no Anki, descobre o que eles têm em comum e sugere como reforçar.
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="weak-scope" className="font-medium text-sm">
              Analisar
            </label>
            <select
              id="weak-scope"
              className="h-9 min-w-56 rounded-lg border bg-background px-2 text-sm"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="">Todos os baralhos</option>
              {roots.map((root) => (
                <option key={root} value={root}>
                  {root}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={() => analyze.mutate()}
            disabled={!anki?.connected || analyze.isPending}
            data-testid="analyze-weak-spots"
          >
            {analyze.isPending ? <Loader2Icon className="animate-spin" /> : result ? <RefreshCwIcon /> : <BrainIcon />}
            {analyze.isPending ? "Analisando seus erros…" : result ? "Analisar de novo" : "Analisar meus erros"}
          </Button>
          {!anki?.connected && <p className="text-muted-foreground text-sm">Abra o Anki para analisar.</p>}
          {result && !analyze.isPending && (
            <p className="ml-auto text-muted-foreground text-xs">
              Última análise: {new Date(result.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {result.scope ? ` · ${result.scope}` : " · todos os baralhos"}
            </p>
          )}
        </CardContent>
      </Card>

      {result && result.cards.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm">
            <PartyPopperIcon className="size-5 text-emerald-600" />
            Nenhum card com muitos erros por aqui. Mandou bem!
          </CardContent>
        </Card>
      )}

      {result?.analysis && (
        <>
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm" data-testid="weak-summary">
            {result.analysis.summary}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            {result.analysis.themes.map((theme) => {
              const themeCards = result.cards.filter((card) => theme.cardIds.includes(String(card.cardId)));
              const target = pickTab(theme.deckName);
              return (
                <Card key={theme.title} data-testid="weak-theme">
                  <CardHeader>
                    <CardTitle className="text-base">{theme.title}</CardTitle>
                    <CardDescription>{theme.why}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {theme.tips.length > 0 && (
                      <ul className="grid list-disc gap-1 pl-5 text-sm">
                        {theme.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    )}
                    <ul className="grid gap-1.5 text-sm">
                      {themeCards.slice(0, 5).map((card) => (
                        <li
                          key={card.cardId}
                          className="flex items-start justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
                        >
                          <span className="min-w-0">{card.front}</span>
                          <Badge variant="outline" className="shrink-0">
                            {card.lapses} {card.lapses === 1 ? "erro" : "erros"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!target || !hasAi}
                        onClick={() => target && onReinforce(target.id, reinforcementDraft(theme, result.cards))}
                      >
                        <SparklesIcon /> Gerar cards de reforço{target ? ` em ${target.name}` : ""}
                      </Button>
                      {theme.deckName && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeckInAnki(client, theme.deckName).catch(() => undefined)}
                        >
                          <BookOpenIcon /> Estudar no Anki
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {result.analysis.words.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Palavras e termos que mais aparecem nos erros</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {result.analysis.words.map((word) => (
                  <Badge key={word} variant="secondary">
                    {word}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {result && result.cards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Os cards que você mais erra</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-1.5 text-sm">
              {result.cards.slice(0, 15).map((card) => (
                <li key={card.cardId} className="grid grid-cols-[1fr_auto] gap-3 border-b pb-1.5 last:border-0">
                  <span className="min-w-0">
                    {card.front}
                    <span className="block text-muted-foreground text-xs">{card.deckName}</span>
                  </span>
                  <span className="text-right text-muted-foreground text-xs tabular-nums">
                    {card.lapses} erros
                    <span className="block">facilidade {card.ease}%</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
