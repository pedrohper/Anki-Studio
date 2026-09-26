"use client";

import { useMutation } from "@tanstack/react-query";
import { CopyIcon, FileDownIcon, MoreHorizontalIcon, PencilIcon, ScrollTextIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAnkiClient,
  useAnkiStatus,
  useContexts,
  useDeleteTab,
  useEffectiveModels,
  useProviderAccess,
  useSaveTab,
} from "@/hooks/use-studio";
import { existingFronts } from "@/lib/client/anki-connect";
import { api } from "@/lib/client/api";
import { exportTab } from "@/lib/client/backup";
import * as db from "@/lib/client/db";
import { downloadJson, slugify } from "@/lib/client/files";
import { getSettings } from "@/lib/client/settings";
import { describeModel, PROVIDERS } from "@/lib/llm/providers";
import { applyReviewResponse, createReview, type ReviewState } from "@/lib/review";
import { CARD_TYPE_LABELS, FEATURE_LABELS, type Tab, type TabFeatures } from "@/lib/schemas/tab";
import { findRelevantContext, fingerprint } from "@/lib/shared/context-search";
import { belongsTo } from "@/lib/shared/decks";
import { createId, nowIso } from "@/lib/shared/id";
import { duplicateTab } from "@/lib/tab-utils";
import { type GenerationDraft, MaterialInput } from "./material-input";
import { PlanReview } from "./plan-review";
import { PromptDialog } from "./prompt-dialog";
import { RefineBanner } from "./refine-banner";
import { TabEditorDialog } from "./tab-editor-dialog";

function sample<T>(items: T[], size: number): T[] {
  if (items.length <= size) return items;
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, size);
}

export function TabWorkspace({
  tab,
  review,
  onReviewChange,
  onTabDeleted,
  onTabCreated,
  autoDraft,
  onAutoDraftConsumed,
}: {
  tab: Tab;
  review: ReviewState | undefined;
  onReviewChange: (updater: (review: ReviewState | undefined) => ReviewState | undefined) => void;
  onTabDeleted: () => void;
  onTabCreated: (tab: Tab) => void;
  /** Material enviado de outra tela (Início ou Pontos fracos) para gerar assim que a aba abrir. */
  autoDraft?: GenerationDraft;
  onAutoDraftConsumed?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const { data: anki } = useAnkiStatus();
  const { data: contexts = [], refetch: refetchContexts } = useContexts(tab.id);
  const saveTab = useSaveTab();
  const deleteTab = useDeleteTab();
  const { generator, reviewer } = useEffectiveModels(tab);
  const { client: ankiClient } = useAnkiClient();
  const hasAccess = useProviderAccess();

  /** Segundo modelo confere os cards ainda não enviados e sugere correções. */
  const runReview = useMutation({
    mutationFn: async (current: ReviewState) => {
      if (!reviewer) throw new Error("Nenhum revisor configurado.");
      if (!hasAccess(reviewer.provider)) {
        throw new Error(`Configure a chave de ${PROVIDERS[reviewer.provider].name} para o revisor funcionar.`);
      }
      const cards = current.items
        .filter((item) => item.status === "pending")
        .map(({ card }) => ({ id: card.id, type: card.type, front: card.front, back: card.back }));
      return api.review({ tab, mode: current.mode, material: current.material, cards, llm: reviewer });
    },
    onMutate: () =>
      onReviewChange((current) =>
        current && reviewer ? { ...current, reviewer: { status: "running", label: describeModel(reviewer) } } : current,
      ),
    onSuccess: (response) => onReviewChange((current) => (current ? applyReviewResponse(current, response) : current)),
    onError: (error) =>
      onReviewChange((current) =>
        current
          ? {
              ...current,
              reviewer: { status: "error", label: reviewer ? describeModel(reviewer) : "", error: error.message },
            }
          : current,
      ),
  });

  const generate = useMutation({
    mutationFn: async (draft: GenerationDraft) => {
      const materialFingerprint = draft.material ? await fingerprint(draft.material) : "";
      const referenceContext =
        draft.mode === "material"
          ? findRelevantContext(draft.material, contexts, { excludeFingerprint: materialFingerprint })
          : "";
      const knownWords = tab.features.knownVocabulary ? sample(await db.getKnownWords(), 300) : [];
      // A IA olha o que já existe no baralho para não repetir e cobrir lacunas.
      const existingCards = anki?.connected ? await existingFronts(ankiClient, tab.deckName, 150).catch(() => []) : [];
      const plan = await api.generate({
        tab,
        mode: draft.mode,
        material: draft.material,
        words: draft.words,
        sourceLabel: draft.sourceLabel,
        availableDecks: anki?.decks ?? [],
        referenceContext,
        knownWords,
        llm: generator,
        existingCards,
        purpose: draft.purpose ?? "study",
      });
      if (draft.mode === "material" && getSettings().saveContext && draft.material.length >= 80) {
        await db.addContext({
          id: createId(),
          tabId: tab.id,
          title: draft.sourceLabel,
          content: draft.material,
          fingerprint: materialFingerprint,
          createdAt: nowIso(),
        });
        void refetchContexts();
      }
      return { plan, draft };
    },
    onSuccess: ({ plan, draft }) => {
      const fallbackDeck = anki?.decks.includes(tab.deckName) || !anki?.connected ? tab.deckName : "";
      const created = createReview(plan, {
        sourceLabel: draft.sourceLabel,
        mode: draft.mode,
        words: draft.words,
        fallbackDeck,
        material: draft.material,
      });
      onReviewChange(() => created);
      if (reviewer && created.items.length > 0) runReview.mutate(created);
      toast.success(`${plan.cards.length} cards prontos para revisar.`);
      requestAnimationFrame(() =>
        document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    },
    onError: (error) => toast.error(error.message),
  });

  // Material que veio da tela Início ou de Pontos fracos: gera assim que a aba abre.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara uma vez por rascunho recebido
  useEffect(() => {
    if (!autoDraft || generate.isPending) return;
    onAutoDraftConsumed?.();
    generate.mutate(autoDraft);
  }, [autoDraft]);

  const subdecks = (anki?.decks ?? []).filter((deck) => deck !== tab.deckName && belongsTo(deck, tab.deckName));
  const activeFeatures = (Object.keys(tab.features) as Array<keyof TabFeatures>).filter((key) => tab.features[key]);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <span className="grid size-12 place-items-center rounded-xl bg-muted text-2xl" aria-hidden>
          {tab.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-2xl tracking-tight">{tab.name}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">{tab.goal}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline" title={subdecks.join("\n") || undefined}>
              📦 {tab.deckName}
              {subdecks.length > 0 && ` + ${subdecks.length} sub-baralho${subdecks.length > 1 ? "s" : ""}`}
            </Badge>
            {tab.cardTypes.map((type) => (
              <Badge key={type} variant="secondary">
                {CARD_TYPE_LABELS[type]}
              </Badge>
            ))}
            {activeFeatures.map((key) => (
              <Badge key={key} variant="secondary">
                {FEATURE_LABELS[key].label}
              </Badge>
            ))}
            <Badge variant="outline">🗂️ {contexts.length} na biblioteca</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPromptOpen(true)}>
            <ScrollTextIcon /> Prompt da aba
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Mais opções da aba" />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <PencilIcon /> Editar configurações
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadJson(exportTab(tab), `aba-${slugify(tab.name)}.json`)}>
                <FileDownIcon /> Exportar aba
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const copy = duplicateTab(tab);
                  await saveTab.mutateAsync(copy);
                  onTabCreated(copy);
                }}
              >
                <CopyIcon /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm(`Excluir a aba "${tab.name}"? Os cards já enviados ao Anki continuam lá.`))
                    return;
                  await deleteTab.mutateAsync(tab.id);
                  toast.success("Aba excluída.");
                  onTabDeleted();
                }}
              >
                <Trash2Icon /> Excluir aba
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <RefineBanner tab={tab} />

      <MaterialInput
        key={tab.id}
        tab={tab}
        isGenerating={generate.isPending}
        onGenerate={(draft) => generate.mutate(draft)}
      />

      {review && (
        <section id="review" className="scroll-mt-20">
          <PlanReview
            tab={tab}
            review={review}
            onChange={(updater) => onReviewChange((current) => (current ? updater(current) : current))}
          />
        </section>
      )}

      <TabEditorDialog open={editing} onOpenChange={setEditing} tab={tab} />
      <PromptDialog open={promptOpen} onOpenChange={setPromptOpen} tab={tab} />
    </div>
  );
}
