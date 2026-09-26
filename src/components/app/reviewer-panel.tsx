"use client";

import { AlertTriangleIcon, Loader2Icon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { applySuggestion, countReviews, type ReviewState } from "@/lib/review";

/** Situação da revisão feita pelo segundo modelo, no topo do plano. */
export function ReviewerPanel({
  review,
  onChange,
  onRunReview,
}: {
  review: ReviewState;
  onChange: (updater: (review: ReviewState) => ReviewState) => void;
  onRunReview?: () => void;
}) {
  const reviewer = review.reviewer;
  if (!reviewer) return null;

  if (reviewer.status === "running") {
    return (
      <Alert data-testid="reviewer-panel">
        <Loader2Icon className="animate-spin" />
        <AlertTitle>Revisando com {reviewer.label}…</AlertTitle>
        <AlertDescription>
          Um segundo modelo está conferindo cada card. Você já pode ir olhando a lista.
        </AlertDescription>
      </Alert>
    );
  }

  if (reviewer.status === "error") {
    return (
      <Alert variant="destructive" data-testid="reviewer-panel">
        <AlertTriangleIcon />
        <AlertTitle>A revisão não rodou</AlertTitle>
        <AlertDescription>{reviewer.error}</AlertDescription>
        {onRunReview && (
          <AlertAction>
            <Button size="sm" variant="outline" onClick={onRunReview}>
              Tentar de novo
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  }

  const counts = countReviews(review.items);
  const fixable = review.items.filter(
    (item) => item.review?.verdict === "fix" && item.review.suggestion && !item.reviewResolved,
  );

  return (
    <Alert className="border-emerald-500/30 bg-emerald-500/5" data-testid="reviewer-panel">
      <ShieldCheckIcon className="text-emerald-600 dark:text-emerald-400" />
      <AlertTitle>Revisado por {reviewer.label}</AlertTitle>
      <AlertDescription className="grid gap-1">
        <span>
          {counts.ok} {counts.ok === 1 ? "card aprovado" : "cards aprovados"}
          {counts.fix > 0 && ` · ${counts.fix} com sugestão de ajuste`}
          {counts.remove > 0 && ` · ${counts.remove} para descartar`}
          {counts.pending === 0 && counts.ok > 0 && " · nada pendente"}
        </span>
        {reviewer.summary && <span className="text-muted-foreground">{reviewer.summary}</span>}
      </AlertDescription>
      <AlertAction className="flex flex-wrap gap-2">
        {fixable.length > 1 && (
          <Button
            size="sm"
            onClick={() =>
              onChange((current) => ({
                ...current,
                items: current.items.map((item) =>
                  item.review?.verdict === "fix" && item.review.suggestion && !item.reviewResolved
                    ? applySuggestion(item)
                    : item,
                ),
              }))
            }
          >
            Aplicar as {fixable.length} correções
          </Button>
        )}
        {onRunReview && (
          <Button size="sm" variant="ghost" onClick={onRunReview}>
            <RefreshCwIcon /> Revisar de novo
          </Button>
        )}
      </AlertAction>
    </Alert>
  );
}
