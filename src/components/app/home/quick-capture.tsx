"use client";

import { useMutation } from "@tanstack/react-query";
import { FileTextIcon, Loader2Icon, SendIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffectiveModels, useHasAiAccess } from "@/hooks/use-studio";
import { api } from "@/lib/client/api";
import { readStudyFile } from "@/lib/client/files";
import { takeSharedItem } from "@/lib/client/share";
import type { Tab } from "@/lib/schemas/tab";
import { cn } from "@/lib/utils";
import type { GenerationDraft } from "../material-input";

const YOUTUBE = /youtu\.?be/i;
const ONLY_URL = /^https?:\/\/\S+$/i;

/** Evita ler duas vezes o que foi compartilhado (o React monta duas vezes em dev). */
let sharedTaken = false;

/**
 * "Joga aqui o que você aprendeu": texto, arquivo ou link. A IA escolhe a aba
 * certa e já começa a gerar os cards lá.
 */
export function QuickCapture({
  tabs,
  onRouted,
}: {
  tabs: Tab[];
  onRouted: (tabId: string, draft: GenerationDraft) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { generator } = useEffectiveModels();
  const hasAi = useHasAiAccess();

  const readFile = useMutation({
    mutationFn: async (selected: File) => ({ name: selected.name, text: await readStudyFile(selected) }),
    onSuccess: setFile,
    onError: (error) => toast.error(error.message),
  });

  const section = useRef<HTMLElement>(null);
  const { mutate: readShared } = readFile;

  // Chegou algo pelo "Compartilhar" do celular? Preenche a captura e espera o seu ok.
  useEffect(() => {
    if (sharedTaken) return;
    sharedTaken = true;
    takeSharedItem()
      .then((shared) => {
        if (!shared) return;
        if (shared.text) setText(shared.text);
        if (shared.file) readShared(shared.file);
        section.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        toast.info("Recebi o que você compartilhou", { description: "Confira e toque em “Mandar para a aba certa”." });
      })
      .catch(() => toast.error("Não consegui ler o que foi compartilhado."));
  }, [readShared]);

  const send = useMutation({
    mutationFn: async () => {
      let material = file ? `${file.text}${text.trim() ? `\n\n--- Observações ---\n${text.trim()}` : ""}` : text.trim();
      let sourceLabel = file?.name ?? "";
      const trimmed = text.trim();
      if (!file && ONLY_URL.test(trimmed)) {
        const extracted = await api.extract(trimmed, YOUTUBE.test(trimmed) ? "youtube" : "url");
        material = extracted.text;
        sourceLabel = extracted.title;
      }
      if (material.length < 20) throw new Error("Escreva, cole ou arraste um pouco mais de conteúdo.");
      if (tabs.length === 1 && tabs[0]) {
        return {
          tabId: tabs[0].id,
          reason: "",
          draft: {
            mode: "material",
            material,
            words: [],
            sourceLabel: sourceLabel || "Anotação rápida",
          } as GenerationDraft,
        };
      }
      const route = await api.route({
        material,
        tabs: tabs.map((tab) => ({ id: tab.id, name: tab.name, goal: tab.goal, deckName: tab.deckName })),
        llm: generator,
      });
      const draft: GenerationDraft = {
        mode: "material",
        material,
        words: [],
        sourceLabel: sourceLabel || route.sourceLabel,
      };
      return { tabId: route.tabId, reason: route.reason, draft };
    },
    onSuccess: ({ tabId, reason, draft }) => {
      const tab = tabs.find((item) => item.id === tabId);
      toast.success(`Mandei para a aba ${tab?.emoji ?? ""} ${tab?.name ?? ""}`.trim(), {
        description: reason || undefined,
      });
      setText("");
      setFile(null);
      onRouted(tabId, draft);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section
      ref={section}
      aria-label="Captura rápida"
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
        else {
          const dropText = event.dataTransfer.getData("text");
          if (dropText) setText(dropText);
        }
      }}
      className={cn(
        "grid gap-3 rounded-2xl border-2 border-dashed bg-card p-4 transition-colors sm:p-5",
        dragging ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="grid gap-0.5">
        <h2 className="font-semibold">O que você aprendeu hoje?</h2>
        <p className="text-muted-foreground text-sm">
          Cole um texto ou link, ou arraste um PDF. A IA descobre a aba certa e já monta os cards.
        </p>
      </div>
      {file && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <FileTextIcon className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Remover arquivo" onClick={() => setFile(null)}>
            <XIcon />
          </Button>
        </div>
      )}
      <Textarea
        aria-label="O que você aprendeu"
        rows={3}
        value={text}
        placeholder={file ? "Observações opcionais…" : "Ex.: anotações da aula de hoje, um link de artigo ou vídeo…"}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !send.isPending) send.mutate();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={readFile.isPending}>
          {readFile.isPending ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />} Escolher arquivo
        </Button>
        <Button
          onClick={() => send.mutate()}
          disabled={send.isPending || (!text.trim() && !file) || !hasAi}
          title={hasAi ? undefined : "Configure a sua IA primeiro"}
          data-testid="quick-capture-send"
        >
          {send.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {send.isPending ? "Descobrindo a aba…" : "Mandar para a aba certa"}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".pdf,.txt,.md,text/plain,application/pdf"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) readFile.mutate(selected);
          event.target.value = "";
        }}
      />
    </section>
  );
}
