"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAnkiClient } from "@/hooks/use-studio";
import { AnkiSetupGuide } from "./anki-setup-guide";

/** Janela "Conectar o Anki": o passo a passo completo, com teste ao vivo no fim. */
export function AnkiConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mode } = useAnkiClient();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conectar o Anki em 2 minutos</DialogTitle>
          <DialogDescription>
            O Anki Studio fala com o seu Anki por um complemento gratuito chamado AnkiConnect. Você instala uma vez só.
          </DialogDescription>
        </DialogHeader>
        {open && <AnkiSetupGuide mode={mode} liveCheck />}
      </DialogContent>
    </Dialog>
  );
}
