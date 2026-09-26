"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAnkiStatus } from "@/hooks/use-studio";
import { cn } from "@/lib/utils";

export function AnkiStatus({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data, isPending, refetch, isFetching } = useAnkiStatus();
  const connected = data?.connected ?? false;
  const label = isPending
    ? "Procurando o Anki…"
    : connected
      ? `Anki conectado · ${data?.decks.length} baralhos`
      : "Anki desconectado";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            onClick={() => (connected ? refetch() : onOpenSettings())}
            aria-label={label}
            data-testid="anki-status"
          />
        }
      >
        <span
          className={cn(
            "size-2 rounded-full",
            isPending || isFetching
              ? "animate-pulse bg-amber-500"
              : connected
                ? "bg-emerald-500"
                : "bg-muted-foreground/50",
          )}
        />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">Anki</span>
      </TooltipTrigger>
      <TooltipContent>
        {connected
          ? "Clique para atualizar a lista de baralhos."
          : "Abra o Anki Desktop com o AnkiConnect. Clique para ver como conectar. Sem Anki, você ainda pode baixar um .apkg."}
      </TooltipContent>
    </Tooltip>
  );
}
