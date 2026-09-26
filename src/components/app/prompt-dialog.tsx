"use client";

import { useMutation } from "@tanstack/react-query";
import { HistoryIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useEffectiveModels, useHasAiAccess, useSaveTab } from "@/hooks/use-studio";
import { api } from "@/lib/client/api";
import type { Tab } from "@/lib/schemas/tab";
import { ORIGIN_LABELS, withNewPromptVersion } from "@/lib/tab-utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Ver, editar, pedir para a IA reescrever e voltar versões do prompt da aba. */
export function PromptDialog({
  open,
  onOpenChange,
  tab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: Tab;
}) {
  const [draft, setDraft] = useState(tab.systemPrompt);
  const [origin, setOrigin] = useState<"manual" | "generated">("manual");
  const [showVersions, setShowVersions] = useState(false);
  const hasAi = useHasAiAccess(tab);
  const { generator } = useEffectiveModels(tab);
  const saveTab = useSaveTab();

  useEffect(() => {
    if (open) {
      setDraft(tab.systemPrompt);
      setOrigin("manual");
      setShowVersions(false);
    }
  }, [open, tab.systemPrompt]);

  const rewrite = useMutation({
    mutationFn: () => api.tabPrompt(tab, generator),
    onSuccess: (result) => {
      setDraft(result.systemPrompt);
      setOrigin("generated");
      toast.info("A IA escreveu uma nova versão. Revise e salve se gostar.");
    },
    onError: (error) => toast.error(error.message),
  });

  const changed = draft.trim() !== tab.systemPrompt.trim();

  async function save() {
    await saveTab.mutateAsync(withNewPromptVersion(tab, draft, origin));
    toast.success("Prompt salvo. A versão anterior ficou no histórico.");
    onOpenChange(false);
  }

  async function restore(prompt: string, createdAt: string) {
    await saveTab.mutateAsync(
      withNewPromptVersion(tab, prompt, "manual", `Restaurada da versão de ${formatDate(createdAt)}`),
    );
    toast.success("Versão restaurada.");
    setDraft(prompt);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {tab.emoji} Prompt da aba “{tab.name}”
          </DialogTitle>
          <DialogDescription>
            Estas são as instruções que a IA segue ao gerar cards nesta aba. As regras de formato da plataforma
            continuam valendo por cima delas.
          </DialogDescription>
        </DialogHeader>

        {showVersions ? (
          <ol className="grid gap-2" aria-label="Versões do prompt">
            {[...tab.promptVersions].reverse().map((version, index) => (
              <li key={version.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={index === 0 ? "default" : "secondary"}>
                    {index === 0 ? "Atual" : ORIGIN_LABELS[version.origin]}
                  </Badge>
                  <span className="text-muted-foreground">{formatDate(version.createdAt)}</span>
                  {version.note && <span className="text-muted-foreground">· {version.note}</span>}
                  {index > 0 && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => restore(version.prompt, version.createdAt)}
                    >
                      Restaurar
                    </Button>
                  )}
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap font-mono text-muted-foreground text-xs">
                  {version.prompt}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <Textarea
            aria-label="Texto do prompt"
            rows={18}
            className="font-mono text-xs leading-relaxed"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setOrigin("manual");
            }}
          />
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowVersions((value) => !value)}>
              <HistoryIcon /> {showVersions ? "Editar prompt" : `Versões (${tab.promptVersions.length})`}
            </Button>
            {!showVersions && (
              <Button
                variant="outline"
                disabled={!hasAi || rewrite.isPending}
                title={hasAi ? undefined : "Configure sua chave da DeepSeek"}
                onClick={() => rewrite.mutate()}
              >
                {rewrite.isPending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                Pedir para a IA reescrever
              </Button>
            )}
          </div>
          {!showVersions && (
            <Button disabled={!changed || draft.trim().length < 20 || saveTab.isPending} onClick={save}>
              Salvar nova versão
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
