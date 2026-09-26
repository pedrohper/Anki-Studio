"use client";

import { CheckCircle2Icon, LayersIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { forwardRef, useEffect, useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnkiClient, useAnkiStatus } from "@/hooks/use-studio";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { AnkiSetupGuide } from "../anki-setup-guide";
import { StepHeader } from "./step-header";

export const StepAnki = forwardRef<HTMLHeadingElement>(function StepAnki(_props, ref) {
  const id = useId();
  const settings = useSettings();
  const { mode } = useAnkiClient();
  const { data: anki, refetch, isFetching } = useAnkiStatus();
  const connected = anki?.connected ?? false;

  // Nesta etapa a pessoa está configurando o Anki agora: confere a cada 3s.
  useEffect(() => {
    if (connected) return;
    const timer = setInterval(() => void refetch(), 3_000);
    return () => clearInterval(timer);
  }, [connected, refetch]);

  return (
    <div className="grid gap-8">
      <StepHeader
        ref={ref}
        icon={LayersIcon}
        eyebrow="Anki"
        title="Conecte o seu Anki"
        description="Com o Anki Desktop aberto, os cards vão direto para os seus baralhos. É opcional: sem ele, você baixa um arquivo .apkg e importa quando quiser (até no celular)."
      />

      <output
        aria-live="polite"
        data-testid="onboarding-anki-status"
        className={
          connected
            ? "grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"
            : "grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
        }
      >
        <div className="flex items-center gap-3">
          {connected ? (
            <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Loader2Icon className="size-5 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
          )}
          <p className="flex-1 font-medium text-sm">
            {connected ? `Anki conectado · ${anki?.decks.length ?? 0} baralhos encontrados` : "Procurando o Anki…"}
          </p>
          {!connected && (
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCwIcon className={isFetching ? "animate-spin" : undefined} /> Testar agora
            </Button>
          )}
        </div>
        {connected && anki && anki.decks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {anki.decks.slice(0, 8).map((deck) => (
              <Badge key={deck} variant="secondary">
                {deck}
              </Badge>
            ))}
            {anki.decks.length > 8 && <Badge variant="outline">+{anki.decks.length - 8}</Badge>}
          </div>
        )}
      </output>

      {!connected && <AnkiSetupGuide mode={mode} />}

      <details className="group rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground group-open:mb-3">Opções avançadas</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-url`}>Endereço do AnkiConnect</Label>
            <Input
              id={`${id}-url`}
              value={settings.ankiUrl}
              onChange={(event) => updateSettings({ ankiUrl: event.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-key`}>Chave do AnkiConnect (se configurou uma)</Label>
            <Input
              id={`${id}-key`}
              type="password"
              value={settings.ankiKey}
              onChange={(event) => updateSettings({ ankiKey: event.target.value })}
            />
          </div>
        </div>
      </details>
    </div>
  );
});
