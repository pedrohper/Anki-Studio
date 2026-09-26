"use client";

import { CheckIcon, EyeIcon, PencilIcon, ShieldAlertIcon, ShieldCheckIcon, Volume2Icon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { applySuggestion, isEdited, type ReviewItem } from "@/lib/review";
import { CARD_TYPE_LABELS } from "@/lib/schemas/tab";
import { cn } from "@/lib/utils";
import { CardHtml } from "./card-html";

const STATUS_LABEL = { sent: "Enviado", duplicate: "Já existia", failed: "Falhou" } as const;

export function CardItem({
  item,
  index,
  onChange,
  onPlayAudio,
  audioLoading,
}: {
  item: ReviewItem;
  index: number;
  onChange: (item: ReviewItem) => void;
  onPlayAudio?: () => void;
  audioLoading?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const { card } = item;
  const locked = item.status === "sent" || item.status === "duplicate";
  const cloze = card.type === "cloze";

  return (
    <li
      className={cn(
        "group grid grid-cols-[auto_1fr] gap-3 rounded-xl border bg-card p-4 transition-opacity",
        !item.included && "opacity-50",
      )}
      data-testid="card-item"
    >
      <Checkbox
        className="mt-1"
        checked={item.included}
        disabled={locked}
        aria-label={`Incluir card ${index + 1}`}
        onCheckedChange={(checked) => onChange({ ...item, included: checked })}
      />
      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-muted-foreground">#{index + 1}</span>
          <Badge variant="outline">{CARD_TYPE_LABELS[card.type]}</Badge>
          {isEdited(item) && (
            <Badge variant="secondary">
              {item.reviewResolved === "applied" ? "Corrigido pelo revisor" : "Editado"}
            </Badge>
          )}
          {item.review?.verdict === "ok" && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
              <ShieldCheckIcon /> Revisado
            </Badge>
          )}
          {item.status !== "pending" && (
            <Badge variant={item.status === "failed" ? "destructive" : "secondary"} title={item.error}>
              {item.status === "sent" && <CheckIcon />}
              {STATUS_LABEL[item.status]}
            </Badge>
          )}
          <div className="ml-auto flex gap-1 opacity-100 sm:opacity-60 sm:group-hover:opacity-100">
            {card.audioText && onPlayAudio && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Ouvir áudio"
                disabled={audioLoading}
                onClick={onPlayAudio}
              >
                <Volume2Icon className={cn(audioLoading && "animate-pulse")} />
              </Button>
            )}
            {cloze && !editing && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Mostrar respostas"
                onClick={() => setReveal((value) => !value)}
              >
                <EyeIcon />
              </Button>
            )}
            {!locked && (
              <Button
                variant={editing ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label={editing ? "Concluir edição" : "Editar card"}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? <CheckIcon /> : <PencilIcon />}
              </Button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="grid gap-2">
            <Textarea
              aria-label="Frente do card"
              rows={3}
              className="font-mono text-xs"
              value={card.front}
              onChange={(event) => onChange({ ...item, card: { ...card, front: event.target.value } })}
            />
            <Textarea
              aria-label="Verso do card"
              rows={4}
              className="font-mono text-xs"
              value={card.back}
              onChange={(event) => onChange({ ...item, card: { ...card, back: event.target.value } })}
            />
            <p className="text-muted-foreground text-xs">
              HTML simples é aceito (&lt;b&gt;, &lt;br&gt;, listas). Em cloze, use {"{{c1::resposta}}"}.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <CardHtml html={card.front} cloze={cloze} reveal={reveal} className="font-medium" />
            {card.back && <CardHtml html={card.back} className="text-muted-foreground sm:border-l sm:pl-4" />}
          </div>
        )}
        {item.review && item.review.verdict !== "ok" && !item.reviewResolved && !locked && (
          <ReviewSuggestion item={item} onChange={onChange} />
        )}
        {item.error && item.status === "failed" && <p className="text-destructive text-xs">{item.error}</p>}
      </div>
    </li>
  );
}

/** O que o revisor achou deste card, com as ações de aplicar ou ignorar. */
function ReviewSuggestion({ item, onChange }: { item: ReviewItem; onChange: (item: ReviewItem) => void }) {
  const review = item.review;
  if (!review) return null;
  const remove = review.verdict === "remove";
  return (
    <div
      data-testid="review-suggestion"
      className={cn(
        "grid gap-3 rounded-lg border p-3 text-sm",
        remove ? "border-destructive/30 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <ShieldAlertIcon className={cn("size-4", remove ? "text-destructive" : "text-amber-600 dark:text-amber-400")} />
        {remove ? "O revisor sugere descartar este card" : "O revisor sugere um ajuste"}
      </p>
      {review.issues.length > 0 && (
        <ul className="grid list-disc gap-0.5 pl-5 text-muted-foreground">
          {review.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {review.suggestion && (
        <div className="grid gap-2 rounded-md bg-background/80 p-3 sm:grid-cols-2 sm:gap-4">
          <CardHtml html={review.suggestion.front} cloze={item.card.type === "cloze"} reveal className="font-medium" />
          {review.suggestion.back && (
            <CardHtml html={review.suggestion.back} className="text-muted-foreground sm:border-l sm:pl-4" />
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {remove ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onChange({ ...item, included: false, reviewResolved: "applied" })}
          >
            Descartar
          </Button>
        ) : (
          review.suggestion && (
            <Button size="sm" onClick={() => onChange(applySuggestion(item))}>
              Aplicar correção
            </Button>
          )
        )}
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...item, reviewResolved: "ignored" })}>
          {remove ? "Manter" : "Ignorar"}
        </Button>
      </div>
    </div>
  );
}
