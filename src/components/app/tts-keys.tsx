"use client";

import { CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setTtsKey, useSettings } from "@/lib/client/settings";
import { KEYED_TTS_PROVIDERS, type KeyedTtsProviderId, TTS_PROVIDERS } from "@/lib/tts/voices";

/** Chaves dos provedores de voz pagos. Ficam só neste navegador, como as de IA. */
export function TtsKeys() {
  return (
    <div className="grid gap-2">
      {KEYED_TTS_PROVIDERS.map((provider) => (
        <TtsKeyRow key={provider} provider={provider} />
      ))}
    </div>
  );
}

function TtsKeyRow({ provider }: { provider: KeyedTtsProviderId }) {
  const id = useId();
  const info = TTS_PROVIDERS[provider];
  const settings = useSettings();
  const saved = settings.ttsKeys[provider] ?? "";
  const usesAiKey = provider === "openai" && !saved && Boolean(settings.providerKeys.openai);
  const [draft, setDraft] = useState("");

  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-2 text-sm">
        <span className="font-medium">{info.name}</span>
        <span className="text-muted-foreground text-xs">
          {saved ? "· chave salva" : usesAiKey ? "· usa a chave de IA da OpenAI" : "· sem chave"}
        </span>
      </summary>
      <div className="grid gap-2 pt-3">
        <p className="text-muted-foreground text-xs">{info.tagline}</p>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setTtsKey(provider, draft);
            setDraft("");
          }}
        >
          <label htmlFor={`${id}-key`} className="sr-only">
            Chave de voz de {info.name}
          </label>
          <Input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            placeholder={saved ? "Trocar a chave" : `Chave de ${info.name}`}
            className="h-8"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="secondary" className="h-8" disabled={!draft.trim()}>
            Salvar
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {saved ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2Icon className="size-3.5 text-emerald-600" /> Chave salva. Teste no botão “Ouvir” da aba.
              <Button variant="ghost" size="xs" onClick={() => setTtsKey(provider, "")}>
                Remover
              </Button>
            </span>
          ) : (
            <span />
          )}
          {info.keyUrl && (
            <a
              className="inline-flex items-center gap-1 text-primary hover:underline"
              href={info.keyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Criar chave <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      </div>
    </details>
  );
}
