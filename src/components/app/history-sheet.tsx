"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHistory } from "@/hooks/use-studio";
import { stripHtml } from "@/lib/shared/text";

export function HistorySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history = [] } = useHistory();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? history.filter((entry) =>
        `${entry.front} ${entry.back} ${entry.deckName} ${entry.subject}`.toLowerCase().includes(normalized),
      )
    : history;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Histórico</SheetTitle>
          <SheetDescription>Últimos {history.length} cards enviados ou exportados neste navegador.</SheetDescription>
          <Input
            aria-label="Buscar no histórico"
            placeholder="Buscar…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </SheetHeader>
        <ol className="grid gap-2 overflow-y-auto px-4 pb-6">
          {filtered.map((entry) => (
            <li key={entry.id} className="grid gap-1 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                <span>
                  {new Date(entry.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <Badge variant="outline">{entry.deckName}</Badge>
                {entry.destination === "apkg" && <Badge variant="secondary">.apkg</Badge>}
              </div>
              <p className="font-medium">{stripHtml(entry.front).slice(0, 160)}</p>
              <p className="text-muted-foreground">{stripHtml(entry.back).slice(0, 200)}</p>
            </li>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-muted-foreground text-sm">Nada por aqui ainda.</p>
          )}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
