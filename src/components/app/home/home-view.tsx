"use client";

import { BookOpenIcon, FlameIcon, LayersIcon, PlusIcon, RotateCcwIcon, SparklesIcon, TargetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnkiClient, useAnkiDashboard, useAnkiStatus, useHistory, useTabs } from "@/hooks/use-studio";
import { openDeckInAnki } from "@/lib/client/anki-connect";
import { useSettings } from "@/lib/client/settings";
import { belongsTo, groupDecks } from "@/lib/shared/decks";
import { greetingFor, lastNDays, studyStreak, sumDue, toIsoDay } from "@/lib/shared/stats";
import { tabForDeck } from "@/lib/tab-match";
import type { GenerationDraft } from "../material-input";
import { useWeakSpotsCache } from "../weak-spots-view";
import { QuickCapture } from "./quick-capture";
import { ReviewsChart } from "./reviews-chart";

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof FlameIcon;
}) {
  return (
    <div className="grid gap-1 rounded-xl border bg-card p-4">
      <span className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className="size-4" /> {label}
      </span>
      <span className="font-semibold text-2xl tabular-nums tracking-tight">{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}

/**
 * Tela Início: cumprimento, quanto tem para revisar hoje, captura rápida,
 * revisões dos últimos 30 dias, o que há em cada baralho e os pontos fracos.
 */
export function HomeView({
  onOpenTab,
  onRouted,
  onOpenWeakSpots,
  onImportDecks,
  onOpenSettings,
}: {
  onOpenTab: (tabId: string) => void;
  onRouted: (tabId: string, draft: GenerationDraft) => void;
  onOpenWeakSpots: () => void;
  onImportDecks: () => void;
  onOpenSettings: () => void;
}) {
  const { userName } = useSettings();
  const { data: anki } = useAnkiStatus();
  const { client } = useAnkiClient();
  const { data: dashboard, isPending } = useAnkiDashboard();
  const { data: tabs = [] } = useTabs();
  const { data: history = [] } = useHistory();
  const { data: weak } = useWeakSpotsCache();

  const connected = Boolean(anki?.connected);
  const due = sumDue(dashboard?.stats ?? []);
  const days = lastNDays(dashboard?.byDay ?? [], 30);
  const today = days.at(-1)?.count ?? 0;
  const streak = studyStreak(dashboard?.byDay ?? []);
  const weekAgo = toIsoDay(new Date(Date.now() - 6 * 86_400_000));
  const createdThisWeek = history.filter((entry) => entry.createdAt.slice(0, 10) >= weekAgo).length;
  const decksWithoutTab = groupDecks(anki?.decks ?? []).filter(
    (group) => !tabs.some((tab) => belongsTo(tab.deckName, group.root) || belongsTo(group.root, tab.deckName)),
  );

  const name = userName.trim();

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="font-semibold text-3xl tracking-tight" data-testid="greeting">
          {greetingFor()}
          {name ? `, ${name}` : ""}!
        </h1>
        {connected ? (
          isPending ? (
            <Skeleton className="h-6 w-72" />
          ) : due.total > 0 ? (
            <p className="text-lg">
              Você tem{" "}
              <span className="font-semibold text-primary tabular-nums">{due.total.toLocaleString("pt-BR")}</span>{" "}
              {due.total === 1 ? "flashcard" : "flashcards"} para revisar hoje
              <span className="block text-muted-foreground text-sm">
                {due.reviewCount} revisões · {due.learnCount} aprendendo · {due.newCount} novos
              </span>
            </p>
          ) : (
            <p className="text-lg">Nada pendente no Anki hoje. Que tal aprender algo novo?</p>
          )
        ) : (
          <p className="text-muted-foreground">
            Abra o Anki Desktop para ver quantos cards você tem para revisar hoje.
          </p>
        )}
        {!name && (
          <button
            type="button"
            className="justify-self-start text-primary text-sm hover:underline"
            onClick={onOpenSettings}
          >
            Como você quer ser chamado?
          </button>
        )}
        {connected && due.total > 0 && (
          <div>
            <Button size="sm" variant="outline" onClick={() => client.invoke("guiDeckBrowser").catch(() => undefined)}>
              <BookOpenIcon /> Abrir o Anki para estudar
            </Button>
          </div>
        )}
      </header>

      {tabs.length > 0 && <QuickCapture tabs={tabs} onRouted={onRouted} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={RotateCcwIcon} label="Revisões hoje" value={connected ? today.toLocaleString("pt-BR") : "–"} />
        <StatTile
          icon={FlameIcon}
          label="Sequência"
          value={connected ? `${streak} ${streak === 1 ? "dia" : "dias"}` : "–"}
          hint={connected ? (streak > 0 ? "dias seguidos estudando" : "revise hoje para começar") : undefined}
        />
        <StatTile
          icon={SparklesIcon}
          label="Cards criados"
          value={createdThisWeek.toLocaleString("pt-BR")}
          hint="nos últimos 7 dias"
        />
      </div>

      {decksWithoutTab.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
          <LayersIcon className="size-5 text-primary" />
          <p className="min-w-0 flex-1">
            {decksWithoutTab.length === 1
              ? `O baralho ${decksWithoutTab[0]?.root} ainda não tem aba.`
              : `${decksWithoutTab.length} baralhos do seu Anki ainda não têm aba.`}{" "}
            A IA lê cada um e cria a aba com o prompt certo.
          </p>
          <Button size="sm" onClick={onImportDecks}>
            Transformar em abas
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revisões nos últimos 30 dias</CardTitle>
            <CardDescription>Contadas pelo próprio Anki.</CardDescription>
          </CardHeader>
          <CardContent>
            {connected ? (
              isPending ? (
                <Skeleton className="h-44 w-full" />
              ) : (
                <ReviewsChart days={days} />
              )
            ) : (
              <p className="py-10 text-center text-muted-foreground text-sm">Conecte o Anki para ver o gráfico.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Para hoje, por baralho</CardTitle>
          </CardHeader>
          <CardContent>
            {!connected ? (
              <p className="text-muted-foreground text-sm">Sem conexão com o Anki.</p>
            ) : (
              <ul className="grid gap-2" data-testid="deck-due-list">
                {(dashboard?.stats ?? []).slice(0, 8).map((stat) => {
                  const tab = tabForDeck(tabs, stat.name);
                  const total = stat.newCount + stat.learnCount + stat.reviewCount;
                  return (
                    <li key={stat.name} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{stat.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {stat.reviewCount} revisões · {stat.learnCount} aprendendo · {stat.newCount} novos
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{total}</span>
                      <span className="flex gap-1">
                        {tab && (
                          <Button size="xs" variant="ghost" onClick={() => onOpenTab(tab.id)}>
                            Aba
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => openDeckInAnki(client, stat.name).catch(() => undefined)}
                        >
                          Estudar
                        </Button>
                      </span>
                    </li>
                  );
                })}
                {dashboard?.stats.length === 0 && (
                  <li className="text-muted-foreground text-sm">Nenhum baralho encontrado.</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <TargetIcon className="size-4 text-amber-600" /> É bom revisar mais isto
            </CardTitle>
            <CardDescription>
              {weak?.analysis
                ? weak.analysis.summary
                : "A IA analisa os cards que você mais erra e mostra os temas que pedem atenção."}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onOpenWeakSpots}>
            {weak?.analysis ? "Ver tudo" : "Descobrir"}
          </Button>
        </CardHeader>
        {weak?.analysis && weak.analysis.themes.length > 0 && (
          <CardContent className="flex flex-wrap gap-2">
            {weak.analysis.themes.slice(0, 4).map((theme) => (
              <span key={theme.title} className="rounded-lg border bg-amber-500/5 px-3 py-1.5 text-sm">
                {theme.title}
              </span>
            ))}
          </CardContent>
        )}
      </Card>

      {tabs.length === 0 && (
        <Button className="justify-self-start" onClick={onImportDecks}>
          <PlusIcon /> Criar abas
        </Button>
      )}
    </div>
  );
}
