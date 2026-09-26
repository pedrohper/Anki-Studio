"use client";

import {
  HistoryIcon,
  HomeIcon,
  KeyRoundIcon,
  LayersIcon,
  PlusIcon,
  SettingsIcon,
  TargetIcon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffectiveModels, useHasAiAccess, useSaveTab, useTabs } from "@/hooks/use-studio";
import { tabFromExport } from "@/lib/client/backup";
import { updateSettings, useIsClient, useSettings } from "@/lib/client/settings";
import { PROVIDERS } from "@/lib/llm/providers";
import type { ReviewState } from "@/lib/review";
import type { Tab } from "@/lib/schemas/tab";
import { SITE_LINKS } from "@/lib/site";
import { cn } from "@/lib/utils";
import { AnkiStatus } from "./anki-status";
import { DeckImportDialog } from "./deck-import-dialog";
import { HistorySheet } from "./history-sheet";
import { HomeView } from "./home/home-view";
import { Logo } from "./logo";
import type { GenerationDraft } from "./material-input";
import { Onboarding, type OnboardingResult } from "./onboarding/onboarding";
import { SettingsDialog } from "./settings-dialog";
import { TabEditorDialog } from "./tab-editor-dialog";
import { TabWorkspace } from "./tab-workspace";
import { ThemeToggle } from "./theme-toggle";
import { WeakSpotsView } from "./weak-spots-view";

const ACTIVE_TAB_KEY = "anki-studio:active-tab";
/** Telas que não são abas. */
const HOME = "home";
const WEAK = "weak";

function readActiveTab(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY);
  } catch {
    return null;
  }
}

export function Studio() {
  const { data: tabs, isPending } = useTabs();
  const saveTab = useSaveTab();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewState | undefined>>({});
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importingDecks, setImportingDecks] = useState(false);
  /** Material mandado da tela Início/Pontos fracos para gerar numa aba. */
  const [autoDrafts, setAutoDrafts] = useState<Record<string, GenerationDraft | undefined>>({});
  const importInput = useRef<HTMLInputElement>(null);
  const isClient = useIsClient();
  const { onboardingDone } = useSettings();
  // Só decide depois de montar no navegador, para não piscar o onboarding para quem já configurou.
  const showOnboarding = isClient && !onboardingDone;

  function finishOnboarding({ tab }: OnboardingResult) {
    updateSettings({ onboardingDone: true });
    if (tab === "new") setCreating(true);
    else if (tab === "import") setImportingDecks(true);
    else if (tab) selectTab(tab);
    else selectTab(HOME);
  }

  useEffect(() => {
    if (!tabs) return;
    if (activeId === HOME || activeId === WEAK || (activeId && tabs.some((tab) => tab.id === activeId))) return;
    const stored = readActiveTab();
    setActiveId(stored === WEAK || tabs.some((tab) => tab.id === stored) ? stored : HOME);
  }, [tabs, activeId]);

  /** Abre a aba e já gera os cards com o material recebido. */
  const sendToTab = (tabId: string, draft: GenerationDraft) => {
    setAutoDrafts((current) => ({ ...current, [tabId]: draft }));
    selectTab(tabId);
  };

  const selectTab = (id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, id);
    } catch {
      // sem armazenamento: só não lembra a última aba
    }
  };

  const activeTab = tabs?.find((tab) => tab.id === activeId);
  const hasAi = useHasAiAccess(activeTab);
  const { generator } = useEffectiveModels(activeTab);

  async function importTabFile(file: File) {
    try {
      const tab = tabFromExport(JSON.parse(await file.text()));
      await saveTab.mutateAsync(tab);
      selectTab(tab.id);
      toast.success(`Aba "${tab.name}" importada.`);
    } catch {
      toast.error("Esse arquivo não é uma aba válida do Anki Studio.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Logo />
          <div className="ml-auto flex items-center gap-1">
            <AnkiStatus onOpenSettings={() => setSettingsOpen(true)} />
            <Button variant="ghost" size="icon" aria-label="Histórico" onClick={() => setHistoryOpen(true)}>
              <HistoryIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Configurações" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 md:grid-cols-[15rem_1fr]">
        <nav aria-label="Abas de estudo" className="min-w-0 md:sticky md:top-20 md:self-start">
          <ul className="mb-1 flex gap-1 overflow-x-auto md:mb-4 md:flex-col md:overflow-visible">
            {[
              { id: HOME, label: "Início", icon: HomeIcon },
              { id: WEAK, label: "Pontos fracos", icon: TargetIcon },
            ].map((item) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => selectTab(item.id)}
                  aria-current={activeId === item.id ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    activeId === item.id
                      ? "bg-secondary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" /> {item.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="mb-2 hidden items-center justify-between px-2 md:flex">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Suas abas</span>
          </div>
          <ul className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
            {isPending && (
              <li>
                <Skeleton className="h-9 w-40 md:w-full" />
              </li>
            )}
            {tabs?.map((tab) => (
              <li key={tab.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  aria-current={tab.id === activeId ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    tab.id === activeId
                      ? "bg-secondary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span aria-hidden>{tab.emoji}</span>
                  <span className="truncate">{tab.name}</span>
                  {reviews[tab.id] && (
                    <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" title="Revisão em andamento" />
                  )}
                </button>
              </li>
            ))}
            <li className="shrink-0">
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setCreating(true)}
              >
                <PlusIcon /> Nova aba
              </Button>
            </li>
            <li className="shrink-0">
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={() => importInput.current?.click()}
              >
                <UploadIcon /> Importar aba
              </Button>
            </li>
            <li className="shrink-0">
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setImportingDecks(true)}
              >
                <LayersIcon /> Baralhos do Anki
              </Button>
            </li>
          </ul>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importTabFile(file);
              event.target.value = "";
            }}
          />
        </nav>

        <main className="grid min-w-0 content-start gap-6">
          {!hasAi && (
            <Alert>
              <KeyRoundIcon />
              <AlertTitle>Configure a sua IA ({PROVIDERS[generator.provider].name})</AlertTitle>
              <AlertDescription>
                A geração de cards usa a sua própria chave, que fica só no seu navegador. Dá para escolher entre
                DeepSeek, OpenAI, Gemini, OpenRouter, Groq e Mistral.
              </AlertDescription>
              <AlertAction>
                <Button size="sm" onClick={() => setSettingsOpen(true)}>
                  Configurar
                </Button>
              </AlertAction>
            </Alert>
          )}

          {activeId === HOME ? (
            <HomeView
              onOpenTab={selectTab}
              onRouted={sendToTab}
              onOpenWeakSpots={() => selectTab(WEAK)}
              onImportDecks={() => setImportingDecks(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : activeId === WEAK ? (
            <WeakSpotsView onReinforce={sendToTab} />
          ) : activeTab ? (
            <TabWorkspace
              key={activeTab.id}
              tab={activeTab}
              review={reviews[activeTab.id]}
              onReviewChange={(updater) =>
                setReviews((current) => ({ ...current, [activeTab.id]: updater(current[activeTab.id]) }))
              }
              onTabDeleted={() => selectTab(HOME)}
              onTabCreated={(tab: Tab) => selectTab(tab.id)}
              autoDraft={autoDrafts[activeTab.id]}
              onAutoDraftConsumed={() => setAutoDrafts((current) => ({ ...current, [activeTab.id]: undefined }))}
            />
          ) : (
            !isPending && (
              <div className="grid place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
                <p className="font-medium">Nenhuma aba ainda</p>
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon /> Criar a primeira aba
                </Button>
              </div>
            )
          )}
        </main>
      </div>

      <footer className="border-t py-5 text-muted-foreground text-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4">
          <span>
            Anki Studio · feito por <span className="text-foreground">{SITE_LINKS.author}</span> · código aberto (MIT)
          </span>
          <nav aria-label="Links do autor" className="flex items-center gap-4">
            <a
              className="hover:text-foreground hover:underline"
              href={SITE_LINKS.github}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className="hover:text-foreground hover:underline"
              href={SITE_LINKS.linkedin}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              className="hover:text-foreground hover:underline"
              href={SITE_LINKS.repo}
              target="_blank"
              rel="noreferrer"
            >
              Código-fonte
            </a>
          </nav>
        </div>
      </footer>

      {showOnboarding && <Onboarding onFinish={finishOnboarding} />}
      <TabEditorDialog open={creating} onOpenChange={setCreating} onSaved={(tab) => selectTab(tab.id)} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <DeckImportDialog
        open={importingDecks}
        onOpenChange={setImportingDecks}
        onCreated={(created) => created[0] && selectTab(created[0].id)}
      />
    </div>
  );
}
