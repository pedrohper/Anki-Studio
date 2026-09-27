"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, InfoIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys, useAnkiClient, useAnkiStatus } from "@/hooks/use-studio";
import { AnkiError, type OutgoingCard, sendCards, syncAnkiWeb } from "@/lib/client/anki-connect";
import { api } from "@/lib/client/api";
import * as db from "@/lib/client/db";
import { downloadBlob, slugify } from "@/lib/client/files";
import { getSettings } from "@/lib/client/settings";
import { buildFeedbackEvents, type ReviewItem, type ReviewState } from "@/lib/review";
import type { HistoryEntry } from "@/lib/schemas/storage";
import type { Tab } from "@/lib/schemas/tab";
import { createId, nowIso } from "@/lib/shared/id";
import { toAnkiTag, toMediaFilename } from "@/lib/shared/text";
import { CardItem } from "./card-item";
import { ReviewerPanel } from "./reviewer-panel";

type Audio = { filename: string; base64: string };

export function PlanReview({
  tab,
  review,
  onChange,
  onRunReview,
  reviewerLabel,
}: {
  tab: Tab;
  review: ReviewState;
  onChange: (updater: (review: ReviewState) => ReviewState) => void;
  onRunReview?: () => void;
  reviewerLabel?: string;
}) {
  const { plan, items } = review;
  const queryClient = useQueryClient();
  const { data: anki } = useAnkiStatus();
  const { client } = useAnkiClient();
  const audioCache = useRef(new Map<string, Audio>());
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);

  const pending = items.filter((item) => item.included && item.status !== "sent" && item.status !== "duplicate");
  const deckOptions = [...new Set([...(anki?.decks ?? []), tab.deckName, plan.suggestedDeckName].filter(Boolean))];

  const updateItem = (index: number, next: ReviewItem) =>
    onChange((current) => ({ ...current, items: current.items.map((item, i) => (i === index ? next : item)) }));

  async function audioFor(item: ReviewItem): Promise<Audio | undefined> {
    const text = item.card.audioText;
    if (!tab.features.audio || !text) return undefined;
    const cached = audioCache.current.get(text);
    if (cached) return cached;
    const { audioBase64 } = await api.tts(text, tab.ttsVoice);
    const audio = {
      filename: toMediaFilename(`${text.slice(0, 30)}_${item.card.id.slice(0, 6)}`),
      base64: audioBase64,
    };
    audioCache.current.set(text, audio);
    return audio;
  }

  async function playAudio(item: ReviewItem) {
    setAudioLoadingId(item.card.id);
    try {
      const audio = await audioFor(item);
      if (audio) await new Audio(`data:audio/mpeg;base64,${audio.base64}`).play();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no áudio.");
    } finally {
      setAudioLoadingId(null);
    }
  }

  /** Gera o áudio dos cards selecionados (3 por vez); card sem áudio segue sem ele. */
  async function collectAudio(selected: ReviewItem[]): Promise<Map<string, Audio>> {
    const result = new Map<string, Audio>();
    if (!tab.features.audio) return result;
    let failures = 0;
    const queue = [...selected];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          try {
            const audio = await audioFor(item);
            if (audio) result.set(item.card.id, audio);
          } catch {
            failures++;
          }
        }
      }),
    );
    if (failures) toast.warning(`${failures} áudio(s) não puderam ser gerados; esses cards vão sem som.`);
    return result;
  }

  const tags = () =>
    ["anki-studio", toAnkiTag(tab.name), `fonte::${toAnkiTag(review.sourceLabel)}`, ...plan.tags.map(toAnkiTag)].filter(
      (tag, index, all) => tag && all.indexOf(tag) === index,
    );

  const withSource = (back: string) =>
    `${back}${back ? "<br>" : ""}<small style='color:#888'>Fonte: ${review.sourceLabel.replace(/[<>]/g, "")}</small>`;

  /** Registra histórico, sinais para a aba aprender e palavras conhecidas. */
  async function afterDelivery(delivered: ReviewItem[], destination: HistoryEntry["destination"]) {
    const createdAt = nowIso();
    await db.addHistory(
      delivered.map((item) => ({
        id: createId(),
        tabId: tab.id,
        tabName: tab.name,
        deckName: review.deckName,
        subject: plan.subject,
        type: item.card.type,
        front: item.card.front,
        back: item.card.back,
        destination,
        createdAt,
      })),
    );
    if (!review.feedbackRecorded) {
      await db.addFeedback(buildFeedbackEvents(tab.id, items));
      onChange((current) => ({ ...current, feedbackRecorded: true }));
    }
    if (tab.features.knownVocabulary && review.mode === "wordlist") await db.addKnownWords(review.words);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.history }),
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback(tab.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.knownWords }),
    ]);
  }

  const send = useMutation({
    mutationFn: async () => {
      const selected = pending;
      const audio = await collectAudio(selected);
      const cards: OutgoingCard[] = selected.map((item) => ({
        id: item.card.id,
        type: item.card.type,
        front: item.card.front,
        back: withSource(item.card.back),
        audio: audio.get(item.card.id),
      }));
      const result = await sendCards(client, { deckName: review.deckName, cards, tags: tags() });
      return { result, selected };
    },
    onSuccess: async ({ result, selected }) => {
      const failed = new Map(result.failed.map((failure) => [failure.id, failure.reason]));
      const duplicates = new Set(result.duplicates);
      const added = new Set(result.added);
      onChange((current) => ({
        ...current,
        items: current.items.map((item) => {
          if (added.has(item.card.id)) return { ...item, status: "sent" };
          if (duplicates.has(item.card.id)) return { ...item, status: "duplicate" };
          if (failed.has(item.card.id)) return { ...item, status: "failed", error: failed.get(item.card.id) };
          return item;
        }),
      }));
      await afterDelivery(
        selected.filter((item) => added.has(item.card.id)),
        "anki",
      );
      queryClient.invalidateQueries({ queryKey: ["anki"] });

      const parts = [`${result.added.length} enviados para ${review.deckName}`];
      if (result.duplicates.length) parts.push(`${result.duplicates.length} já existiam no baralho`);
      if (result.failed.length) parts.push(`${result.failed.length} falharam`);
      (result.failed.length ? toast.warning : toast.success)(parts.join(" · "));
      if (result.added.length > 0 && getSettings().autoSyncAnkiWeb) {
        // Sem esperar: a sincronização pode levar alguns segundos e não deve travar a tela.
        toast.promise(syncAnkiWeb(client), {
          loading: "Sincronizando com o AnkiWeb…",
          success: "Sincronizado: os cards já aparecem no celular.",
          error: "Não deu para sincronizar com o AnkiWeb (entre na sua conta no Anki). Os cards estão no PC.",
        });
      }
    },
    onError: (error) => {
      if (error instanceof AnkiError && error.kind === "offline") {
        toast.error("Não consegui falar com o Anki. Abra o Anki Desktop ou baixe o .apkg.");
      } else toast.error(error.message);
    },
  });

  const exportApkg = useMutation({
    mutationFn: async () => {
      const selected = items.filter((item) => item.included);
      const audio = await collectAudio(selected);
      const blob = await api.apkg({
        deckName: review.deckName,
        cards: selected.map((item) => {
          const sound = audio.get(item.card.id);
          return {
            type: item.card.type,
            front: sound ? `${item.card.front} [sound:${sound.filename}]` : item.card.front,
            back: withSource(item.card.back),
            tags: tags(),
          };
        }),
        media: [...audio.values()].map((item) => ({ filename: item.filename, dataBase64: item.base64 })),
      });
      downloadBlob(blob, `${slugify(review.deckName)}.apkg`);
      return selected;
    },
    onSuccess: async (selected) => {
      await afterDelivery(selected, "apkg");
      toast.success(`${selected.length} cards exportados. Abra o arquivo para importar no Anki.`);
    },
    onError: (error) => toast.error(error.message),
  });

  const busy = send.isPending || exportApkg.isPending;
  const includedCount = items.filter((item) => item.included).length;
  const allIncluded = items.every((item) => item.included || item.status === "sent");

  return (
    <Card data-testid="plan-review">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {plan.subject}
          <Badge variant="secondary">{plan.level}</Badge>
          <Badge variant="outline">roteamento {Math.round(plan.confidence * 100)}%</Badge>
        </CardTitle>
        {plan.studyNote && <CardDescription className="text-sm">{plan.studyNote}</CardDescription>}
        {plan.generator && <p className="text-muted-foreground text-xs">Gerado por {plan.generator}</p>}
      </CardHeader>
      <CardContent className="grid gap-5">
        <ReviewerPanel review={review} onChange={onChange} onRunReview={onRunReview} />
        {!review.reviewer && onRunReview && reviewerLabel && items.length > 0 && (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={onRunReview}>
            Revisar com {reviewerLabel}
          </Button>
        )}
        {(plan.warnings.length > 0 || plan.coverageSummary) && (
          <Alert>
            <InfoIcon />
            <AlertDescription className="grid gap-1">
              {plan.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
              {plan.coverageSummary && <span>Cobertura: {plan.coverageSummary}</span>}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="deck-destination">Baralho de destino</Label>
          <Input
            id="deck-destination"
            list="deck-destination-options"
            value={review.deckName}
            onChange={(event) => onChange((current) => ({ ...current, deckName: event.target.value }))}
          />
          <datalist id="deck-destination-options">
            {deckOptions.map((deck) => (
              <option key={deck} value={deck} />
            ))}
          </datalist>
          <p className="text-muted-foreground text-xs">
            {plan.routingReason || "Escolha o baralho."}
            {!plan.deckName &&
              plan.suggestedDeckName &&
              ` Sugestão da IA: “${plan.suggestedDeckName}” (será criado no Anki).`}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">
            A IA preferiu não inventar: o material não trouxe conteúdo suficiente para cards confiáveis. Acrescente mais
            contexto e tente de novo.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {includedCount} de {items.length} cards selecionados
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    items: current.items.map((item) =>
                      item.status === "sent" ? item : { ...item, included: !allIncluded },
                    ),
                  }))
                }
              >
                {allIncluded ? "Desmarcar todos" : "Selecionar todos"}
              </Button>
            </div>
            <ol className="grid gap-3">
              {items.map((item, index) => (
                <CardItem
                  key={item.card.id}
                  item={item}
                  index={index}
                  onChange={(next) => updateItem(index, next)}
                  onPlayAudio={tab.features.audio ? () => playAudio(item) : undefined}
                  audioLoading={audioLoadingId === item.card.id}
                />
              ))}
            </ol>
          </>
        )}

        {items.length > 0 && (
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-card/95 px-4 pt-4 pb-1 backdrop-blur">
            <Button
              variant="outline"
              disabled={busy || includedCount === 0 || !review.deckName.trim()}
              onClick={() => exportApkg.mutate()}
            >
              {exportApkg.isPending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Baixar .apkg
            </Button>
            <Button
              disabled={busy || pending.length === 0 || !review.deckName.trim() || !anki?.connected}
              title={anki?.connected ? undefined : "Conecte o Anki para enviar direto"}
              onClick={() => send.mutate()}
              data-testid="send-to-anki"
            >
              {send.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              {send.isPending ? "Enviando…" : `Enviar ${pending.length} ao Anki`}
            </Button>
          </div>
        )}
        {items.length > 0 && tab.features.audio && (
          <p className="text-right text-muted-foreground text-xs">
            O áudio de {items.filter((item) => item.card.audioText).length} cards é gerado na hora do envio.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
