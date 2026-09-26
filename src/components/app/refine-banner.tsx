"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { queryKeys, useEffectiveModels, useFeedback, useHasAiAccess, useSaveTab } from "@/hooks/use-studio";
import { api } from "@/lib/client/api";
import { clearFeedback } from "@/lib/client/db";
import { summarizeFeedback } from "@/lib/review";
import type { RefineResponse } from "@/lib/schemas/api";
import type { Tab } from "@/lib/schemas/tab";
import { REFINE_THRESHOLD, withNewPromptVersion } from "@/lib/tab-utils";

/**
 * "A aba aprende com o uso": depois de alguns cards editados ou descartados,
 * oferece pedir à IA uma versão melhor do prompt. Nada muda sem aceite.
 */
export function RefineBanner({ tab }: { tab: Tab }) {
  const { data: events = [] } = useFeedback(tab.id);
  const hasAi = useHasAiAccess(tab);
  const { generator } = useEffectiveModels(tab);
  const saveTab = useSaveTab();
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState<RefineResponse | null>(null);
  const summary = summarizeFeedback(events);

  const reset = async () => {
    await clearFeedback(tab.id);
    await queryClient.invalidateQueries({ queryKey: queryKeys.feedback(tab.id) });
  };

  const refine = useMutation({
    mutationFn: () =>
      api.refine({
        tab,
        signals: { edited: summary.edited, discarded: summary.discarded, kept: summary.kept },
        llm: generator,
      }),
    onSuccess: async (result) => {
      if (!result.shouldChange) {
        toast.info("A IA não viu um padrão claro nos seus ajustes. O prompt continua como está.");
        await reset();
        return;
      }
      setProposal(result);
    },
    onError: (error) => toast.error(error.message),
  });

  if (!hasAi || summary.adjustments < REFINE_THRESHOLD) return null;

  return (
    <>
      <Alert className="border-primary/30 bg-primary/5">
        <SparklesIcon />
        <AlertTitle>Esta aba pode aprender com seus ajustes</AlertTitle>
        <AlertDescription>
          Você editou ou descartou {summary.adjustments} cards aqui. A IA pode analisar esses ajustes e sugerir uma
          versão melhor do prompt.
        </AlertDescription>
        <AlertAction className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            Agora não
          </Button>
          <Button size="sm" onClick={() => refine.mutate()} disabled={refine.isPending}>
            {refine.isPending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Sugerir melhoria
          </Button>
        </AlertAction>
      </Alert>

      <Dialog open={Boolean(proposal)} onOpenChange={(open) => !open && setProposal(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sugestão de prompt para “{tab.name}”</DialogTitle>
            <DialogDescription>Com base nos cards que você editou e descartou.</DialogDescription>
          </DialogHeader>
          {proposal && (
            <div className="grid gap-4">
              <ul className="grid list-disc gap-1 pl-5 text-sm">
                {proposal.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <span className="font-medium text-muted-foreground text-xs">Atual</span>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                    {tab.systemPrompt}
                  </pre>
                </div>
                <div className="grid gap-1">
                  <span className="font-medium text-primary text-xs">Sugerido</span>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                    {proposal.proposedPrompt}
                  </pre>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={async () => {
                setProposal(null);
                await reset();
              }}
            >
              Recusar
            </Button>
            <Button
              onClick={async () => {
                if (!proposal) return;
                await saveTab.mutateAsync(
                  withNewPromptVersion(
                    tab,
                    proposal.proposedPrompt,
                    "refined",
                    proposal.changes.join(" · ").slice(0, 900),
                  ),
                );
                setProposal(null);
                await reset();
                toast.success("Prompt atualizado. A versão anterior ficou no histórico.");
              }}
            >
              Aceitar nova versão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
