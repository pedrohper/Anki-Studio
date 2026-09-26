"use client";

import { CheckCircle2Icon, CircleIcon, Loader2Icon, SparklesIcon, XCircleIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAnkiClient,
  useAnkiStatus,
  useEffectiveModels,
  useHasAiAccess,
  useSaveTab,
  useTabs,
} from "@/hooks/use-studio";
import { sampleDeck } from "@/lib/client/anki-connect";
import { api } from "@/lib/client/api";
import { manualPromptFor } from "@/lib/default-tabs";
import type { Tab, TabSettings } from "@/lib/schemas/tab";
import { belongsTo, groupDecks, subdeckLabel } from "@/lib/shared/decks";
import { createId, nowIso } from "@/lib/shared/id";

type Status = "waiting" | "reading" | "done" | "error";

/**
 * Transforma os baralhos do Anki em abas: cada baralho principal vira uma aba
 * e os sub-baralhos viram destinos dentro dela. A IA lê uma amostra de cada
 * baralho para escrever o objetivo e o prompt da aba.
 */
export function DeckImportDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (tabs: Tab[]) => void;
}) {
  const { data: anki } = useAnkiStatus();
  const { data: tabs = [] } = useTabs();
  const { client } = useAnkiClient();
  const { generator } = useEffectiveModels();
  const hasAi = useHasAiAccess();
  const saveTab = useSaveTab();

  const groups = useMemo(() => groupDecks(anki?.decks ?? []), [anki?.decks]);
  const covered = (root: string) => tabs.some((tab) => belongsTo(tab.deckName, root) || belongsTo(root, tab.deckName));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);

  // Ao abrir, marca os baralhos que ainda não têm aba.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só recalcula ao abrir
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(groups.filter((group) => !covered(group.root)).map((group) => group.root)));
    setStatus({});
  }, [open, groups.length]);

  const toggle = (root: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(root)) next.delete(root);
      else next.add(root);
      return next;
    });

  async function importDecks() {
    setRunning(true);
    const created: Tab[] = [];
    for (const group of groups.filter((item) => selected.has(item.root))) {
      setStatus((current) => ({ ...current, [group.root]: "reading" }));
      try {
        const { total, samples } = await sampleDeck(client, group.root, 25);
        const now = nowIso();
        let settings: TabSettings & { systemPrompt: string };
        let note: string;
        if (hasAi) {
          const analysis = await api.deckAnalysis({
            deckName: group.root,
            subdecks: group.subdecks,
            noteCount: total,
            samples,
            llm: generator,
          });
          settings = { ...analysis, deckName: group.root };
          note = analysis.summary || `Criada a partir do baralho ${group.root}`;
        } else {
          const base: TabSettings = {
            name: group.root.slice(0, 60),
            emoji: "📚",
            goal: `Revisar o conteúdo do baralho ${group.root} do Anki.`,
            deckName: group.root,
            cardTypes: ["basic"],
            cardLanguage: "português",
            features: { audio: false, knownVocabulary: false, formulas: false, code: false },
            sources: ["text", "pdf", "url", "youtube"],
          };
          settings = { ...base, systemPrompt: manualPromptFor(base) };
          note = `Criada a partir do baralho ${group.root} (sem IA)`;
        }
        const tab: Tab = {
          ...settings,
          ...(settings.features.audio ? { ttsVoice: "en-US-ChristopherNeural" } : {}),
          id: createId(),
          createdAt: now,
          updatedAt: now,
          promptVersions: [
            {
              id: createId(),
              prompt: settings.systemPrompt,
              origin: hasAi ? "generated" : "manual",
              createdAt: now,
              note,
            },
          ],
        };
        await saveTab.mutateAsync(tab);
        created.push(tab);
        setStatus((current) => ({ ...current, [group.root]: "done" }));
      } catch (error) {
        setStatus((current) => ({ ...current, [group.root]: "error" }));
        toast.error(`${group.root}: ${error instanceof Error ? error.message : "falhou"}`);
      }
    }
    setRunning(false);
    if (created.length) {
      toast.success(
        `${created.length} ${created.length === 1 ? "aba criada" : "abas criadas"} a partir dos seus baralhos.`,
      );
      onCreated?.(created);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !running && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transformar baralhos em abas</DialogTitle>
          <DialogDescription>
            Cada baralho principal vira uma aba, e os sub-baralhos viram destinos dentro dela: a IA escolhe o
            sub-baralho certo para cada material.{" "}
            {hasAi ? "A IA lê uma amostra de cada baralho para escrever o objetivo e o prompt da aba." : ""}
          </DialogDescription>
        </DialogHeader>

        {!anki?.connected ? (
          <p className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">
            Abra o Anki Desktop com o AnkiConnect para ver os seus baralhos.
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">Não encontrei baralhos no seu Anki.</p>
        ) : (
          <ul className="grid gap-2" data-testid="deck-import-list">
            {groups.map((group) => {
              const state = status[group.root];
              const already = covered(group.root);
              return (
                <li key={group.root} className="rounded-lg border p-3">
                  {/* biome-ignore lint/a11y/noLabelWithoutControl: o Checkbox do Base UI renderiza o controle dentro do label */}
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(group.root)}
                      disabled={running}
                      onCheckedChange={() => toggle(group.root)}
                    />
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-sm">
                        {group.root}
                        {already && <Badge variant="outline">já tem aba</Badge>}
                      </span>
                      {group.subdecks.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {group.subdecks.slice(0, 8).map((deck) => (
                            <Badge key={deck} variant="secondary" className="font-normal">
                              {subdeckLabel(deck)}
                            </Badge>
                          ))}
                          {group.subdecks.length > 8 && <Badge variant="outline">+{group.subdecks.length - 8}</Badge>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Sem sub-baralhos</span>
                      )}
                    </span>
                    <span className="mt-0.5" aria-live="polite">
                      {state === "reading" && (
                        <Loader2Icon className="size-4 animate-spin text-primary" aria-label="Lendo" />
                      )}
                      {state === "done" && <CheckCircle2Icon className="size-4 text-emerald-600" aria-label="Pronto" />}
                      {state === "error" && <XCircleIcon className="size-4 text-destructive" aria-label="Falhou" />}
                      {state === "waiting" && <CircleIcon className="size-4 text-muted-foreground" />}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
            Cancelar
          </Button>
          <Button onClick={importDecks} disabled={running || selected.size === 0 || !anki?.connected}>
            {running ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {running ? "Lendo os baralhos…" : `Criar ${selected.size} ${selected.size === 1 ? "aba" : "abas"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
