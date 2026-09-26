"use client";

import { useMutation } from "@tanstack/react-query";
import { FileTextIcon, LinkIcon, Loader2Icon, SparklesIcon, UploadIcon, XIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/client/api";
import { readStudyFile } from "@/lib/client/files";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { MAX_MATERIAL_CHARS, MAX_WORDS_PER_REQUEST } from "@/lib/schemas/api";
import { SOURCE_LABELS, type SourceKind, type Tab } from "@/lib/schemas/tab";
import { parseWordList } from "@/lib/shared/text";

export interface GenerationDraft {
  mode: "material" | "wordlist";
  material: string;
  words: string[];
  sourceLabel: string;
  /** "reinforcement" = cards de reforço para o que a pessoa erra (vem da tela Pontos fracos). */
  purpose?: "study" | "reinforcement";
}

interface LoadedSource {
  title: string;
  text: string;
}

const formatChars = (count: number) => `${count.toLocaleString("pt-BR")} caracteres`;

export function MaterialInput({
  tab,
  isGenerating,
  onGenerate,
}: {
  tab: Tab;
  isGenerating: boolean;
  onGenerate: (draft: GenerationDraft) => void;
}) {
  const id = useId();
  const settings = useSettings();
  const [source, setSource] = useState<SourceKind>(tab.sources[0] ?? "text");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<LoadedSource | null>(null);
  const [link, setLink] = useState("");
  const [linked, setLinked] = useState<LoadedSource | null>(null);
  const [wordsRaw, setWordsRaw] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const words = parseWordList(wordsRaw);

  const readFile = useMutation({
    mutationFn: async (selected: File) => ({ title: selected.name, text: await readStudyFile(selected) }),
    onSuccess: setFile,
    onError: (error) => toast.error(error.message),
  });

  const fetchLink = useMutation({
    mutationFn: () => api.extract(link, source === "youtube" ? "youtube" : "url"),
    onSuccess: setLinked,
    onError: (error) => toast.error(error.message),
  });

  function buildDraft(): GenerationDraft | string {
    const withNotes = (body: string) =>
      notes.trim() ? `${body}\n\n--- Observações do aluno ---\n${notes.trim()}` : body;
    switch (source) {
      case "text":
        return text.trim().length >= 20
          ? { mode: "material", material: text.trim(), words: [], sourceLabel: "Texto colado" }
          : "Cole um texto com pelo menos algumas frases.";
      case "pdf":
        return file
          ? { mode: "material", material: withNotes(file.text), words: [], sourceLabel: file.title }
          : "Escolha um arquivo.";
      case "url":
      case "youtube":
        return linked
          ? { mode: "material", material: withNotes(linked.text), words: [], sourceLabel: linked.title }
          : "Busque o conteúdo do link primeiro.";
      case "wordlist":
        if (words.length === 0) return "Digite pelo menos uma palavra.";
        if (words.length > MAX_WORDS_PER_REQUEST) return `Máximo de ${MAX_WORDS_PER_REQUEST} palavras por vez.`;
        return { mode: "wordlist", material: notes.trim(), words, sourceLabel: "Lista de palavras" };
    }
  }

  function submit() {
    const draft = buildDraft();
    if (typeof draft === "string") {
      toast.warning(draft);
      return;
    }
    if (draft.material.length > MAX_MATERIAL_CHARS) {
      toast.warning(
        `Material muito grande (${formatChars(draft.material.length)}). Divida em partes de até ${formatChars(MAX_MATERIAL_CHARS)}.`,
      );
      return;
    }
    onGenerate(draft);
  }

  const showNotes = source !== "text";

  return (
    <Card>
      <CardContent className="grid gap-4">
        {tab.sources.length > 1 && (
          <ToggleGroup
            value={[source]}
            onValueChange={(value) => value[0] && setSource(value[0] as SourceKind)}
            variant="outline"
            size="sm"
            aria-label="Fonte do material"
            className="flex-wrap"
          >
            {tab.sources.map((kind) => (
              <ToggleGroupItem key={kind} value={kind}>
                {SOURCE_LABELS[kind]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}

        {source === "text" && (
          <Textarea
            aria-label="Material de estudo"
            rows={9}
            value={text}
            placeholder="Cole aqui suas anotações, um resumo, a transcrição de uma aula ou um trecho de livro."
            onChange={(event) => setText(event.target.value)}
          />
        )}

        {source === "pdf" &&
          (file ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <FileTextIcon className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{file.title}</p>
                <p className="text-muted-foreground text-xs">
                  {formatChars(file.text.length)} extraídos no seu navegador
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Remover arquivo" onClick={() => setFile(null)}>
                <XIcon />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) readFile.mutate(dropped);
              }}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              {readFile.isPending ? (
                <Loader2Icon className="size-6 animate-spin" />
              ) : (
                <UploadIcon className="size-6 text-muted-foreground" />
              )}
              <span className="font-medium text-sm">
                {readFile.isPending ? "Lendo o arquivo…" : "Arraste um PDF, TXT ou MD, ou clique para escolher"}
              </span>
              <span className="text-muted-foreground text-xs">
                O arquivo é lido no seu navegador e não é enviado ao servidor.
              </span>
            </button>
          ))}
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) readFile.mutate(selected);
            event.target.value = "";
          }}
        />

        {(source === "url" || source === "youtube") && (
          <div className="grid gap-2">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (link.trim()) fetchLink.mutate();
              }}
            >
              <Input
                aria-label={source === "youtube" ? "Link do vídeo" : "Link da página"}
                value={link}
                placeholder={source === "youtube" ? "https://youtube.com/watch?v=..." : "https://exemplo.com/artigo"}
                onChange={(event) => {
                  setLink(event.target.value);
                  setLinked(null);
                }}
              />
              <Button type="submit" variant="secondary" disabled={!link.trim() || fetchLink.isPending}>
                {fetchLink.isPending ? <Loader2Icon className="animate-spin" /> : <LinkIcon />} Buscar
              </Button>
            </form>
            {linked && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="font-medium text-sm">{linked.title}</p>
                <p className="line-clamp-3 text-muted-foreground text-xs">{linked.text}</p>
                <p className="mt-1 text-muted-foreground text-xs">{formatChars(linked.text.length)}</p>
              </div>
            )}
          </div>
        )}

        {source === "wordlist" && (
          <div className="grid gap-1.5">
            <Textarea
              aria-label="Lista de palavras"
              rows={6}
              value={wordsRaw}
              placeholder={"Uma por linha ou separadas por vírgula:\nthroughput\nactually, attend\nspill the beans"}
              onChange={(event) => setWordsRaw(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {words.length} {words.length === 1 ? "palavra" : "palavras"} · máximo de {MAX_WORDS_PER_REQUEST} por vez
            </p>
          </div>
        )}

        {showNotes && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-notes`} className="text-muted-foreground text-xs">
              {source === "wordlist"
                ? "Contexto opcional (onde você viu as palavras)"
                : "Observações opcionais para a IA"}
            </Label>
            <Textarea id={`${id}-notes`} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {source !== "wordlist" ? (
            <Label className="flex items-center gap-2 font-normal text-muted-foreground text-sm">
              <Switch
                checked={settings.saveContext}
                onCheckedChange={(checked) => updateSettings({ saveContext: checked })}
              />
              Guardar na biblioteca de contexto da aba
            </Label>
          ) : (
            <span />
          )}
          <Button size="lg" onClick={submit} disabled={isGenerating} data-testid="generate">
            {isGenerating ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {isGenerating ? "Gerando cards…" : "Gerar cards"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
