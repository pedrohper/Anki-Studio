import "server-only";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { TTS_PROVIDERS, type TtsVoiceRef, voiceLang } from "@/lib/tts/voices";
import { ApiError } from "./errors";

/** Header com a chave do provedor de voz escolhido (fica só no navegador). */
export const TTS_KEY_HEADER = "x-tts-key";

/** Um pouco mais devagar que o normal: soa mais natural e ajuda quem está aprendendo. */
const EDGE_RATE = "-8%";
const SPEAKING_RATE = 0.95;
const TIMEOUT_MS = 20_000;

/** Gera MP3 com a voz escolhida. Edge é gratuito; os outros usam a chave da pessoa. */
export async function synthesizeSpeech(text: string, voice: TtsVoiceRef, apiKey?: string): Promise<Buffer> {
  const name = TTS_PROVIDERS[voice.provider].name;
  if (voice.provider !== "edge" && !apiKey) {
    throw new ApiError(401, `Informe sua chave de ${name} nas configurações para usar esta voz.`, "missing_key");
  }
  try {
    const audio = await synthesize(text, voice, apiKey ?? "");
    if (audio.length === 0) throw new Error("áudio vazio");
    return audio;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.warn(`[tts:${voice.provider}] falhou:`, error instanceof Error ? error.message : error);
    throw new ApiError(502, `Não foi possível gerar o áudio com ${name} agora.`, "tts_failed");
  }
}

function synthesize(text: string, voice: TtsVoiceRef, apiKey: string): Promise<Buffer> {
  switch (voice.provider) {
    case "edge":
      return synthesizeEdge(text, voice.voice);
    case "google":
      return synthesizeGoogle(text, voice.voice, apiKey);
    case "openai":
      return synthesizeOpenAi(text, voice.voice, apiKey);
    case "elevenlabs":
      return synthesizeElevenLabs(text, voice.voice, apiKey);
  }
}

/** Tenta 96 kbps (mais nítido) e, se o serviço recusar, volta para 48 kbps. */
async function synthesizeEdge(text: string, voice: string): Promise<Buffer> {
  try {
    return await edgeOnce(text, voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  } catch {
    return edgeOnce(text, voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  }
}

async function edgeOnce(text: string, voice: string, format: OUTPUT_FORMAT): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, format);
    const { audioStream } = tts.toStream(escapeXml(text), { rate: EDGE_RATE });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("end", () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const audio = Buffer.concat(chunks);
    if (audio.length === 0) throw new Error("áudio vazio");
    return audio;
  } finally {
    tts.close();
  }
}

async function synthesizeGoogle(text: string, voice: string, apiKey: string): Promise<Buffer> {
  const languageCode = voiceLang({ provider: "google", voice });
  // As vozes Chirp 3 HD já têm ritmo natural; nas outras, um pouco mais devagar.
  const audioConfig = voice.includes("Chirp")
    ? { audioEncoding: "MP3" }
    : { audioEncoding: "MP3", speakingRate: SPEAKING_RATE };
  const response = await call("https://texttospeech.googleapis.com/v1/text:synthesize", "Google Cloud", {
    headers: { "x-goog-api-key": apiKey },
    body: { input: { text }, voice: { languageCode, name: voice }, audioConfig },
  });
  const data = (await response.json()) as { audioContent?: string };
  return Buffer.from(data.audioContent ?? "", "base64");
}

async function synthesizeOpenAi(text: string, voice: string, apiKey: string): Promise<Buffer> {
  const response = await call("https://api.openai.com/v1/audio/speech", "OpenAI", {
    headers: { authorization: `Bearer ${apiKey}` },
    body: {
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
      instructions: "Speak naturally and clearly, at a slightly slower pace, for someone learning the language.",
    },
  });
  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeElevenLabs(text: string, voice: string, apiKey: string): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`;
  const response = await call(url, "ElevenLabs", {
    headers: { "xi-api-key": apiKey },
    body: { text, model_id: "eleven_multilingual_v2", voice_settings: { speed: SPEAKING_RATE } },
  });
  return Buffer.from(await response.arrayBuffer());
}

async function call(
  url: string,
  name: string,
  { headers, body }: { headers: Record<string, string>; body: unknown },
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, `A chave de ${name} foi recusada. Confira nas configurações.`, "invalid_key");
  }
  if (response.status === 429) {
    throw new ApiError(429, `${name} limitou os pedidos (cota ou créditos). Tente mais tarde.`, "rate_limited");
  }
  if (!response.ok) throw new Error(`${name} respondeu ${response.status}`);
  return response;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
