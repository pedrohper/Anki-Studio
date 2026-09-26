"use client";

import { BookOpenIcon, DatabaseIcon, FileUpIcon, Loader2Icon } from "lucide-react";
import { forwardRef, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useImportBackup, useImportWords } from "@/hooks/use-data-import";
import { useAnkiStatus, useKnownWords } from "@/hooks/use-studio";
import { StepHeader } from "./step-header";

function OptionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof DatabaseIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid content-start gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
          <Icon className="size-4.5" />
        </span>
        <div className="grid gap-0.5">
          <h3 className="font-medium">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export const StepData = forwardRef<HTMLHeadingElement>(function StepData(_props, ref) {
  const backupInput = useRef<HTMLInputElement>(null);
  const wordsInput = useRef<HTMLInputElement>(null);
  const [deckName, setDeckName] = useState("Inglês");
  const restore = useImportBackup();
  const importWords = useImportWords();
  const { data: anki } = useAnkiStatus();
  const { data: knownWords = [] } = useKnownWords();

  return (
    <div className="grid gap-8">
      <StepHeader
        ref={ref}
        icon={DatabaseIcon}
        eyebrow="Seus dados"
        title="Traga o que você já tem"
        description="Opcional. Se você usou o Anki Studio em outro navegador ou na versão antiga, restaure o backup. Se estuda inglês, importe as palavras que já conhece para as frases i+1 ficarem no seu nível."
      />

      <div className="grid gap-4">
        <OptionCard
          icon={FileUpIcon}
          title="Restaurar um backup"
          description="Arquivo .json exportado nas Configurações (abas, biblioteca, histórico e vocabulário)."
        >
          <Button variant="outline" onClick={() => backupInput.current?.click()} disabled={restore.isPending}>
            {restore.isPending ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Escolher arquivo de backup
          </Button>
          {restore.data && (
            <output className="block text-emerald-700 text-sm dark:text-emerald-400">
              ✓ {restore.data.tabs} abas, {restore.data.contexts} materiais, {restore.data.history} cards e{" "}
              {restore.data.knownWords.toLocaleString("pt-BR")} palavras importados.
            </output>
          )}
          <input
            ref={backupInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Arquivo de backup"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) restore.mutate(file);
              event.target.value = "";
            }}
          />
        </OptionCard>

        <OptionCard
          icon={BookOpenIcon}
          title="Vocabulário conhecido"
          description={`${knownWords.length.toLocaleString("pt-BR")} palavras hoje. Usado pelas abas com o método i+1.`}
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => wordsInput.current?.click()} disabled={importWords.isPending}>
              Importar de um .txt
            </Button>
            {anki?.connected && (
              <div className="flex min-w-0 flex-1 gap-2">
                <Input
                  aria-label="Baralho de onde importar palavras"
                  list="onboarding-word-decks"
                  className="min-w-0"
                  value={deckName}
                  onChange={(event) => setDeckName(event.target.value)}
                />
                <datalist id="onboarding-word-decks">
                  {anki.decks.map((deck) => (
                    <option key={deck} value={deck} />
                  ))}
                </datalist>
                <Button
                  variant="outline"
                  disabled={!deckName.trim() || importWords.isPending}
                  onClick={() => importWords.mutate({ kind: "deck", deckName })}
                >
                  {importWords.isPending && <Loader2Icon className="animate-spin" />} Ler do baralho
                </Button>
              </div>
            )}
          </div>
          <input
            ref={wordsInput}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            aria-label="Arquivo de palavras"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importWords.mutate({ kind: "file", file });
              event.target.value = "";
            }}
          />
        </OptionCard>
      </div>
    </div>
  );
});
