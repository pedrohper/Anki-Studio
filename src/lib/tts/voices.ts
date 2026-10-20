import { z } from "zod";

/**
 * Provedores de voz (TTS). O Edge é gratuito e não pede chave; os outros
 * usam a chave da própria pessoa, guardada só no navegador. Provedor sem
 * chave não aparece no seletor.
 */

export const TTS_PROVIDER_IDS = ["edge", "google", "openai", "elevenlabs"] as const;
export const ttsProviderIdSchema = z.enum(TTS_PROVIDER_IDS);
export type TtsProviderId = z.infer<typeof ttsProviderIdSchema>;

/** Provedores que precisam de chave. */
export type KeyedTtsProviderId = Exclude<TtsProviderId, "edge">;
export const KEYED_TTS_PROVIDERS: KeyedTtsProviderId[] = ["google", "openai", "elevenlabs"];

export const ttsVoiceRefSchema = z.object({
  provider: ttsProviderIdSchema,
  voice: z.string().trim().min(1).max(80),
});
export type TtsVoiceRef = z.infer<typeof ttsVoiceRefSchema>;

export interface TtsVoiceOption {
  value: string;
  label: string;
  /** Idioma da voz (BCP-47), usado na frase de prévia. */
  lang: string;
}

export interface TtsProviderInfo {
  id: TtsProviderId;
  name: string;
  tagline: string;
  keyUrl?: string;
  voices: TtsVoiceOption[];
}

export const TTS_PROVIDERS: Record<TtsProviderId, TtsProviderInfo> = {
  edge: {
    id: "edge",
    name: "Edge (grátis)",
    tagline: "Vozes neurais da Microsoft, sem chave. As “Multilingual” são as mais naturais.",
    voices: [
      { value: "en-US-AvaMultilingualNeural", label: "Inglês (EUA) · Ava (natural)", lang: "en-US" },
      { value: "en-US-AndrewMultilingualNeural", label: "Inglês (EUA) · Andrew (natural)", lang: "en-US" },
      { value: "en-US-EmmaMultilingualNeural", label: "Inglês (EUA) · Emma (natural)", lang: "en-US" },
      { value: "en-US-BrianMultilingualNeural", label: "Inglês (EUA) · Brian (natural)", lang: "en-US" },
      { value: "en-US-ChristopherNeural", label: "Inglês (EUA) · Christopher", lang: "en-US" },
      { value: "en-US-JennyNeural", label: "Inglês (EUA) · Jenny", lang: "en-US" },
      { value: "en-GB-SoniaNeural", label: "Inglês (Reino Unido) · Sonia", lang: "en-GB" },
      { value: "en-GB-RyanNeural", label: "Inglês (Reino Unido) · Ryan", lang: "en-GB" },
      { value: "en-CA-LiamNeural", label: "Inglês (Canadá) · Liam", lang: "en-CA" },
      { value: "es-ES-AlvaroNeural", label: "Espanhol (Espanha) · Álvaro", lang: "es-ES" },
      { value: "es-MX-DaliaNeural", label: "Espanhol (México) · Dalia", lang: "es-MX" },
      { value: "pt-BR-ThalitaMultilingualNeural", label: "Português (Brasil) · Thalita (natural)", lang: "pt-BR" },
      { value: "pt-BR-AntonioNeural", label: "Português (Brasil) · Antônio", lang: "pt-BR" },
      { value: "fr-FR-VivienneMultilingualNeural", label: "Francês · Vivienne (natural)", lang: "fr-FR" },
      { value: "fr-FR-HenriNeural", label: "Francês · Henri", lang: "fr-FR" },
    ],
  },
  google: {
    id: "google",
    name: "Google Cloud",
    tagline: "Vozes Chirp 3 HD, muito naturais. Plano gratuito mensal generoso.",
    keyUrl: "https://console.cloud.google.com/apis/library/texttospeech.googleapis.com",
    voices: [
      { value: "en-US-Chirp3-HD-Aoede", label: "Inglês (EUA) · Aoede (Chirp 3 HD)", lang: "en-US" },
      { value: "en-US-Chirp3-HD-Charon", label: "Inglês (EUA) · Charon (Chirp 3 HD)", lang: "en-US" },
      { value: "en-US-Chirp3-HD-Kore", label: "Inglês (EUA) · Kore (Chirp 3 HD)", lang: "en-US" },
      { value: "en-US-Chirp3-HD-Puck", label: "Inglês (EUA) · Puck (Chirp 3 HD)", lang: "en-US" },
      { value: "en-GB-Chirp3-HD-Leda", label: "Inglês (Reino Unido) · Leda (Chirp 3 HD)", lang: "en-GB" },
      { value: "en-US-Neural2-F", label: "Inglês (EUA) · Neural2 F", lang: "en-US" },
      { value: "en-US-Neural2-D", label: "Inglês (EUA) · Neural2 D", lang: "en-US" },
      { value: "es-ES-Chirp3-HD-Aoede", label: "Espanhol (Espanha) · Aoede (Chirp 3 HD)", lang: "es-ES" },
      { value: "pt-BR-Chirp3-HD-Aoede", label: "Português (Brasil) · Aoede (Chirp 3 HD)", lang: "pt-BR" },
      { value: "fr-FR-Chirp3-HD-Charon", label: "Francês · Charon (Chirp 3 HD)", lang: "fr-FR" },
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    tagline: "gpt-4o-mini-tts: fala com entonação natural em qualquer idioma.",
    keyUrl: "https://platform.openai.com/api-keys",
    voices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"].map(
      (voice) => ({ value: voice, label: voice[0]?.toUpperCase() + voice.slice(1), lang: "en-US" }),
    ),
  },
  elevenlabs: {
    id: "elevenlabs",
    name: "ElevenLabs",
    tagline: "As vozes mais realistas; plano gratuito pequeno.",
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    voices: [
      { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", lang: "en-US" },
      { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", lang: "en-US" },
      { value: "pNInz6obpgDQGcFmaJgB", label: "Adam", lang: "en-US" },
      { value: "ErXwobaYiN019PkySvjV", label: "Antoni", lang: "en-US" },
      { value: "TxGEqnHWrfWFTfGW9XVX", label: "Josh", lang: "en-US" },
      { value: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", lang: "en-US" },
    ],
  },
};

export const TTS_PROVIDER_LIST = TTS_PROVIDER_IDS.map((id) => TTS_PROVIDERS[id]);

/** Voz padrão: gratuita e bem mais natural que as antigas do Edge. */
export const DEFAULT_TTS_VOICE: TtsVoiceRef = { provider: "edge", voice: "en-US-AvaMultilingualNeural" };

/**
 * Voz da aba. Abas antigas só têm `ttsVoice` (nome de voz do Edge); as novas
 * guardam `tts` com provedor e voz.
 */
export function tabVoice(tab: { tts?: TtsVoiceRef; ttsVoice?: string }): TtsVoiceRef {
  if (tab.tts) return tab.tts;
  if (tab.ttsVoice?.trim()) return { provider: "edge", voice: tab.ttsVoice.trim() };
  return DEFAULT_TTS_VOICE;
}

/**
 * Voz que de fato será usada: se o provedor precisa de chave e ela não está
 * salva neste navegador, cai na voz gratuita padrão em vez de falhar.
 */
export function usableVoice(voice: TtsVoiceRef, hasKey: (provider: KeyedTtsProviderId) => boolean): TtsVoiceRef {
  if (voice.provider === "edge" || hasKey(voice.provider)) return voice;
  return DEFAULT_TTS_VOICE;
}

/** Provedores que aparecem no seletor: o Edge e os que têm chave. */
export function availableTtsProviders(hasKey: (provider: KeyedTtsProviderId) => boolean): TtsProviderInfo[] {
  return TTS_PROVIDER_LIST.filter((provider) => provider.id === "edge" || hasKey(provider.id));
}

export function voiceLang(voice: TtsVoiceRef): string {
  const known = TTS_PROVIDERS[voice.provider].voices.find((option) => option.value === voice.voice);
  if (known) return known.lang;
  const match = /^([a-z]{2,3}-[A-Z]{2})-/.exec(voice.voice);
  return match?.[1] ?? "en-US";
}

const PREVIEW_TEXTS: Record<string, string> = {
  en: "Hi! This is how your flashcards will sound. Practice makes perfect.",
  pt: "Olá! É assim que os seus flashcards vão soar. A prática leva à perfeição.",
  es: "¡Hola! Así es como sonarán tus tarjetas. La práctica hace al maestro.",
  fr: "Bonjour ! Voici comment vos cartes vont sonner. C'est en forgeant qu'on devient forgeron.",
};

/** Frase curta no idioma da voz, para o botão de prévia. */
export function previewText(voice: TtsVoiceRef): string {
  const lang = voiceLang(voice).slice(0, 2);
  return PREVIEW_TEXTS[lang] ?? PREVIEW_TEXTS.en ?? "";
}
