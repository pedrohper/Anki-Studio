"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useImportBackup, useImportWords } from "@/hooks/use-data-import";
import { useAnkiClient, useAnkiStatus, useAppConfig, useKnownWords } from "@/hooks/use-studio";
import { exportBackup } from "@/lib/client/backup";
import * as db from "@/lib/client/db";
import { downloadJson } from "@/lib/client/files";
import { setProviderKey, updateSettings, useSettings } from "@/lib/client/settings";
import { PROVIDER_LIST } from "@/lib/llm/providers";
import { AnkiSetupGuide } from "./anki-setup-guide";
import { KeyField } from "./llm/key-field";
import { ModelPicker } from "./llm/model-picker";
import { CostMeter, ProviderFacts } from "./llm/provider-facts";
import { PhoneAccess } from "./phone-access";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h3 className="font-medium">{title}</h3>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const id = useId();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const { data: config } = useAppConfig();
  const { data: anki, refetch: refetchAnki, isFetching } = useAnkiStatus();
  const { mode } = useAnkiClient();
  const { data: knownWords = [] } = useKnownWords();
  const [deckForWords, setDeckForWords] = useState("Inglês");
  const wordsFile = useRef<HTMLInputElement>(null);
  const backupFile = useRef<HTMLInputElement>(null);

  const invalidateAll = () => queryClient.invalidateQueries();

  const importWords = useImportWords();
  const restore = useImportBackup();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            Tudo fica salvo só neste navegador. Não existe conta nem banco de dados no servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <Section title="Seu nome" description="Usado no cumprimento da tela Início.">
            <Input
              aria-label="Seu nome"
              className="max-w-xs"
              maxLength={40}
              placeholder="Como você quer ser chamado?"
              value={settings.userName}
              onChange={(event) => updateSettings({ userName: event.target.value })}
            />
          </Section>

          <Separator />

          <Section
            title="Modelos de IA"
            description="Escolha quem gera os cards e, se quiser, um segundo modelo que revisa o trabalho do primeiro. Cada aba pode trocar isso."
          >
            <ModelPicker
              value={settings.generator}
              onChange={(generator) => updateSettings({ generator })}
              label="Gera com"
            />
            <Label className="flex items-center gap-2 font-normal text-sm">
              <Switch
                checked={Boolean(settings.reviewer)}
                onCheckedChange={(checked) =>
                  updateSettings({
                    reviewer: checked
                      ? { provider: settings.generator.provider === "openai" ? "gemini" : "openai", model: "" }
                      : null,
                  })
                }
              />
              Revisar os cards com um segundo modelo
            </Label>
            {settings.reviewer && (
              <ModelPicker
                value={settings.reviewer}
                onChange={(reviewer) => updateSettings({ reviewer })}
                label="Revisa com"
              />
            )}
          </Section>

          <Separator />

          <Section
            title="Chaves dos provedores"
            description="Ficam só neste navegador e vão direto para o provedor a cada pedido; o servidor não guarda nenhuma."
          >
            <div className="grid gap-2">
              {PROVIDER_LIST.filter((provider) => !provider.keyless).map((provider) => {
                const serverKey = config?.providers.find((item) => item.id === provider.id)?.serverKey;
                const saved = Boolean(settings.providerKeys[provider.id]);
                return (
                  <details key={provider.id} className="group rounded-lg border px-3 py-2">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm">
                      <span className="font-medium">{provider.name}</span>
                      <CostMeter tier={provider.costTier} />
                      <span className="text-muted-foreground text-xs">
                        {saved ? "· chave salva" : serverKey ? "· chave do servidor" : "· sem chave"}
                      </span>
                    </summary>
                    <div className="grid gap-2 pt-3">
                      <ProviderFacts provider={provider.id} />
                      <KeyField provider={provider.id} />
                      {saved && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="justify-self-start"
                          onClick={() => setProviderKey(provider.id, "")}
                        >
                          Remover chave
                        </Button>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
            <Label className="flex items-center gap-2 font-normal text-sm">
              <Switch
                checked={settings.rememberKey}
                onCheckedChange={(checked) => updateSettings({ rememberKey: checked })}
              />
              Lembrar as chaves neste navegador
            </Label>
          </Section>

          <Separator />

          <Section
            title="Conexão com o Anki"
            description="Precisa do Anki Desktop aberto com o add-on AnkiConnect (código 2055492159). Sem ele, use o botão “Baixar .apkg”."
          >
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={anki?.connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                {anki?.connected ? `Conectado · ${anki.decks.length} baralhos` : (anki?.error ?? "Desconectado")}
              </span>
              <span className="text-muted-foreground">
                · modo {mode === "proxy" ? "local (via servidor)" : "direto do navegador"}
              </span>
              <Button size="sm" variant="outline" onClick={() => refetchAnki()} disabled={isFetching}>
                {isFetching ? <Loader2Icon className="animate-spin" /> : null} Testar
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-anki-url`}>Endereço do AnkiConnect</Label>
                <Input
                  id={`${id}-anki-url`}
                  value={settings.ankiUrl}
                  onChange={(event) => updateSettings({ ankiUrl: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-anki-key`}>Chave do AnkiConnect (opcional)</Label>
                <Input
                  id={`${id}-anki-key`}
                  type="password"
                  value={settings.ankiKey}
                  onChange={(event) => updateSettings({ ankiKey: event.target.value })}
                />
              </div>
            </div>
            {!anki?.connected && (
              <details className="rounded-lg bg-muted/60 p-3 text-sm" open={mode === "direct"}>
                <summary className="cursor-pointer font-medium">Como conectar</summary>
                <AnkiSetupGuide mode={mode} className="mt-4" />
              </details>
            )}
          </Section>

          <Separator />

          <Section
            title="Vocabulário conhecido"
            description={`${knownWords.length.toLocaleString("pt-BR")} palavras. As abas com i+1 usam essa lista para montar frases em que só a palavra nova é desconhecida.`}
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => wordsFile.current?.click()}
                disabled={importWords.isPending}
              >
                Importar de um .txt
              </Button>
              <div className="flex gap-2">
                <Input
                  aria-label="Baralho de onde importar palavras"
                  className="h-7 w-40"
                  list={`${id}-word-decks`}
                  value={deckForWords}
                  onChange={(event) => setDeckForWords(event.target.value)}
                />
                <datalist id={`${id}-word-decks`}>
                  {anki?.decks.map((deck) => (
                    <option key={deck} value={deck} />
                  ))}
                </datalist>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!anki?.connected || importWords.isPending}
                  onClick={() => importWords.mutate({ kind: "deck", deckName: deckForWords })}
                >
                  {importWords.isPending ? <Loader2Icon className="animate-spin" /> : null} Importar do baralho
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={knownWords.length === 0}
                onClick={async () => {
                  if (!window.confirm("Apagar todo o vocabulário conhecido?")) return;
                  await db.clearKnownWords();
                  await invalidateAll();
                }}
              >
                Limpar
              </Button>
            </div>
            <input
              ref={wordsFile}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importWords.mutate({ kind: "file", file });
                event.target.value = "";
              }}
            />
          </Section>

          <Separator />

          <Section
            title="Backup"
            description="Abas, biblioteca de contexto, histórico e vocabulário num arquivo só, para trocar de navegador ou computador."
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () =>
                  downloadJson(await exportBackup(), `anki-studio-backup-${new Date().toISOString().slice(0, 10)}.json`)
                }
              >
                Exportar backup
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => backupFile.current?.click()}
                disabled={restore.isPending}
              >
                Importar backup
              </Button>
            </div>
            <input
              ref={backupFile}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) restore.mutate(file);
                event.target.value = "";
              }}
            />
          </Section>

          <Separator />

          <Section
            title="Abrir no celular"
            description="Use o Anki Studio no celular: pelo Wi-Fi de casa ou, com senha, de qualquer lugar."
          >
            <PhoneAccess open={open} />
          </Section>

          <Separator />

          <Section
            title="Configuração inicial"
            description="Reveja o passo a passo de chave, Anki, dados e primeira aba."
          >
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  updateSettings({ onboardingDone: false });
                }}
              >
                Abrir o guia de configuração
              </Button>
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
