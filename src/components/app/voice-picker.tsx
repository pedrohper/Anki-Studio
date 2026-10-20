"use client";

import { Loader2Icon, Volume2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client/api";
import { ttsKeyFor, useSettings } from "@/lib/client/settings";
import {
  availableTtsProviders,
  DEFAULT_TTS_VOICE,
  previewText,
  TTS_PROVIDERS,
  type TtsProviderId,
  type TtsVoiceRef,
} from "@/lib/tts/voices";

const selectClass = "h-8 min-w-0 rounded-lg border bg-background px-2 text-sm";

/**
 * Provedor + voz do áudio da aba, com botão para ouvir uma frase de exemplo.
 * Só aparecem o Edge (grátis) e os provedores com chave salva nas Configurações.
 */
export function VoicePicker({ value, onChange }: { value: TtsVoiceRef; onChange: (voice: TtsVoiceRef) => void }) {
  const id = useId();
  const settings = useSettings();
  const hasKey = (provider: Exclude<TtsProviderId, "edge">) => Boolean(ttsKeyFor(provider, settings));
  const providers = availableTtsProviders(hasKey);
  const missingKey = value.provider !== "edge" && !hasKey(value.provider);
  const info = TTS_PROVIDERS[value.provider];
  const knownVoice = info.voices.some((voice) => voice.value === value.voice);
  const [previewing, setPreviewing] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);

  async function preview() {
    setPreviewing(true);
    try {
      const { audioBase64, mimeType } = await api.tts(previewText(value), value);
      player.current?.pause();
      player.current = new Audio(`data:${mimeType};base64,${audioBase64}`);
      await player.current.play();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar a prévia.");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-voice`}>Voz do áudio</Label>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Provedor de voz"
          className={selectClass}
          value={value.provider}
          onChange={(event) => {
            const provider = event.target.value as TtsProviderId;
            onChange({ provider, voice: TTS_PROVIDERS[provider].voices[0]?.value ?? DEFAULT_TTS_VOICE.voice });
          }}
        >
          {missingKey && <option value={value.provider}>{info.name} (sem chave)</option>}
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <select
          id={`${id}-voice`}
          className={`${selectClass} flex-1`}
          value={value.voice}
          onChange={(event) => onChange({ provider: value.provider, voice: event.target.value })}
        >
          {!knownVoice && <option value={value.voice}>{value.voice}</option>}
          {info.voices.map((voice) => (
            <option key={voice.value} value={voice.value}>
              {voice.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={preview} disabled={previewing}>
          {previewing ? <Loader2Icon className="animate-spin" /> : <Volume2Icon />} Ouvir
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {missingKey
          ? `Sem a chave de ${info.name} neste navegador, o áudio sai com a voz grátis do Edge. Adicione a chave em Configurações → IA.`
          : providers.length === 1
            ? "Quer vozes ainda mais naturais? Adicione uma chave de Google, OpenAI ou ElevenLabs em Configurações → IA."
            : info.tagline}
      </p>
    </div>
  );
}
