"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { wordsFromDeck } from "@/lib/client/anki-connect";
import { importBackup } from "@/lib/client/backup";
import * as db from "@/lib/client/db";
import { extractEnglishWords } from "@/lib/shared/text";
import { useAnkiClient } from "./use-studio";

/** Importa um arquivo de backup (.json) e atualiza tudo que depende dele. */
export function useImportBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => importBackup(JSON.parse(await file.text())),
    onSuccess: async (summary) => {
      toast.success(
        `Backup importado: ${summary.tabs} abas, ${summary.contexts} materiais, ${summary.history} cards no histórico e ${summary.knownWords} palavras novas.`,
      );
      await queryClient.invalidateQueries();
    },
    onError: () => toast.error("Esse arquivo não é um backup válido do Anki Studio."),
  });
}

export type WordSource = { kind: "file"; file: File } | { kind: "deck"; deckName: string };

/** Junta palavras ao vocabulário conhecido a partir de um .txt ou de um baralho do Anki. */
export function useImportWords() {
  const queryClient = useQueryClient();
  const { client } = useAnkiClient();
  return useMutation({
    mutationFn: async (source: WordSource) => {
      const words =
        source.kind === "file"
          ? extractEnglishWords(await source.file.text())
          : await wordsFromDeck(client, source.deckName);
      return db.addKnownWords(words);
    },
    onSuccess: async (added) => {
      toast.success(`${added.toLocaleString("pt-BR")} palavras novas no vocabulário.`);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
}
