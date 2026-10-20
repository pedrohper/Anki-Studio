import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabSettingsSchema } from "@/lib/schemas/tab";
import {
  availableTtsProviders,
  DEFAULT_TTS_VOICE,
  previewText,
  tabVoice,
  usableVoice,
  voiceLang,
} from "@/lib/tts/voices";
import { makeTab } from "../support/factories";

const edge = vi.hoisted(() => ({ formats: [] as string[], rates: [] as unknown[], failFormat: "" }));

vi.mock("msedge-tts", async () => {
  const { PassThrough } = await import("node:stream");
  class MsEdgeTTS {
    format = "";
    async setMetadata(_voice: string, format: string) {
      edge.formats.push(format);
      if (format === edge.failFormat || edge.failFormat === "*") throw new Error("formato recusado");
      this.format = format;
    }
    toStream(_text: string, options?: { rate?: unknown }) {
      edge.rates.push(options?.rate);
      const audioStream = new PassThrough();
      queueMicrotask(() => audioStream.end(Buffer.from("mp3")));
      return { audioStream };
    }
    close() {}
  }
  return {
    MsEdgeTTS,
    OUTPUT_FORMAT: {
      AUDIO_24KHZ_48KBITRATE_MONO_MP3: "audio-24khz-48kbitrate-mono-mp3",
      AUDIO_24KHZ_96KBITRATE_MONO_MP3: "audio-24khz-96kbitrate-mono-mp3",
    },
  };
});

const { POST: tts } = await import("@/app/api/tts/route");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("vozes (catálogo e migração)", () => {
  it("migra a voz antiga (texto) para o Edge e usa a padrão quando não há nada", () => {
    expect(tabVoice({ ttsVoice: "en-US-ChristopherNeural" })).toEqual({
      provider: "edge",
      voice: "en-US-ChristopherNeural",
    });
    expect(tabVoice({})).toEqual(DEFAULT_TTS_VOICE);
    expect(tabVoice({ ttsVoice: "x", tts: { provider: "openai", voice: "nova" } })).toEqual({
      provider: "openai",
      voice: "nova",
    });
  });

  it("a voz padrão é uma das novas e mais naturais do Edge", () => {
    expect(DEFAULT_TTS_VOICE).toEqual({ provider: "edge", voice: "en-US-AvaMultilingualNeural" });
  });

  it("esconde provedores sem chave e cai no Edge quando a chave sumiu", () => {
    const onlyGoogle = (provider: string) => provider === "google";
    expect(availableTtsProviders(onlyGoogle).map((provider) => provider.id)).toEqual(["edge", "google"]);
    expect(usableVoice({ provider: "openai", voice: "nova" }, onlyGoogle)).toEqual(DEFAULT_TTS_VOICE);
    expect(usableVoice({ provider: "google", voice: "en-US-Neural2-F" }, onlyGoogle)).toEqual({
      provider: "google",
      voice: "en-US-Neural2-F",
    });
  });

  it("escolhe a frase de prévia pelo idioma da voz", () => {
    expect(voiceLang({ provider: "edge", voice: "pt-BR-AntonioNeural" })).toBe("pt-BR");
    expect(voiceLang({ provider: "google", voice: "de-DE-Neural2-B" })).toBe("de-DE");
    expect(previewText({ provider: "edge", voice: "es-ES-AlvaroNeural" })).toMatch(/Hola/);
    expect(previewText({ provider: "openai", voice: "nova" })).toMatch(/Hi/);
  });

  it("o schema da aba aceita o formato antigo e o novo", () => {
    expect(tabSettingsSchema.safeParse({ ...makeTab(), ttsVoice: "en-US-JennyNeural" }).success).toBe(true);
    expect(tabSettingsSchema.safeParse({ ...makeTab(), tts: { provider: "elevenlabs", voice: "abc" } }).success).toBe(
      true,
    );
    expect(tabSettingsSchema.safeParse({ ...makeTab(), tts: { provider: "azure", voice: "abc" } }).success).toBe(false);
  });
});

describe("rota /api/tts", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    edge.formats = [];
    edge.rates = [];
    edge.failFormat = "";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("aceita o formato antigo (nome da voz do Edge) e gera em 96 kbps, um pouco mais devagar", async () => {
    const response = await tts(post({ text: "Hello", voice: "en-US-ChristopherNeural" }));
    expect(response.status).toBe(200);
    expect((await response.json()).audioBase64).toBe(Buffer.from("mp3").toString("base64"));
    expect(edge.formats).toEqual(["audio-24khz-96kbitrate-mono-mp3"]);
    expect(edge.rates).toEqual(["-8%"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("volta para 48 kbps se o Edge recusar 96 kbps", async () => {
    edge.failFormat = "audio-24khz-96kbitrate-mono-mp3";
    const response = await tts(
      post({ text: "Hello", voice: { provider: "edge", voice: "en-US-AvaMultilingualNeural" } }),
    );
    expect(response.status).toBe(200);
    expect(edge.formats).toEqual(["audio-24khz-96kbitrate-mono-mp3", "audio-24khz-48kbitrate-mono-mp3"]);
  });

  it("exige a chave para provedores pagos", async () => {
    const response = await tts(post({ text: "Hello", voice: { provider: "openai", voice: "nova" } }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("missing_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chama a OpenAI com a chave do header", async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from("openai-mp3")));
    const response = await tts(
      post({ text: "Hello", voice: { provider: "openai", voice: "nova" } }, { "x-tts-key": "sk-test" }),
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(init.headers.authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body)).toMatchObject({ model: "gpt-4o-mini-tts", voice: "nova", input: "Hello" });
    expect((await response.json()).audioBase64).toBe(Buffer.from("openai-mp3").toString("base64"));
  });

  it("chama o Google Cloud com o idioma da voz", async () => {
    fetchMock.mockResolvedValue(Response.json({ audioContent: Buffer.from("g").toString("base64") }));
    const response = await tts(
      post({ text: "Olá", voice: { provider: "google", voice: "pt-BR-Chirp3-HD-Aoede" } }, { "x-tts-key": "g-key" }),
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(init.headers["x-goog-api-key"]).toBe("g-key");
    expect(JSON.parse(init.body).voice).toEqual({ languageCode: "pt-BR", name: "pt-BR-Chirp3-HD-Aoede" });
  });

  it("chama a ElevenLabs com o id da voz na URL", async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from("el")));
    await tts(
      post({ text: "Hi", voice: { provider: "elevenlabs", voice: "21m00Tcm4TlvDq8ikWAM" } }, { "x-tts-key": "el" }),
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/21m00Tcm4TlvDq8ikWAM\?/);
    expect(init.headers["xi-api-key"]).toBe("el");
  });

  it("avisa quando o provedor recusa a chave", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 401 }));
    const response = await tts(
      post({ text: "Hi", voice: { provider: "openai", voice: "nova" } }, { "x-tts-key": "errada" }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_key");
  });

  it("recusa provedor desconhecido", async () => {
    const response = await tts(post({ text: "Hi", voice: { provider: "azure", voice: "x" } }));
    expect(response.status).toBe(400);
  });
});

describe("voz reserva", () => {
  it("tenta os outros provedores com chave e por fim o Edge", async () => {
    const { fallbackVoices } = await import("@/lib/tts/voices");
    const keys = (provider: string) => provider === "google" || provider === "openai";
    expect(fallbackVoices({ provider: "edge", voice: "en-US-JennyNeural" }, keys).map((v) => v.provider)).toEqual([
      "edge",
      "google",
      "openai",
    ]);
    expect(fallbackVoices({ provider: "openai", voice: "nova" }, keys)).toEqual([
      { provider: "openai", voice: "nova" },
      { provider: "google", voice: "en-US-Chirp3-HD-Aoede" },
      DEFAULT_TTS_VOICE,
    ]);
    expect(fallbackVoices({ provider: "edge", voice: "x" }, () => false)).toEqual([{ provider: "edge", voice: "x" }]);
  });

  it("explica que o Edge está indisponível em vez de um erro genérico", async () => {
    edge.failFormat = "*";
    const response = await tts(post({ text: "Hi", voice: DEFAULT_TTS_VOICE }));
    edge.failFormat = "";
    expect(response.status).toBe(502);
    const { error } = await response.json();
    expect(error.code).toBe("tts_failed");
    expect(error.message).toMatch(/Edge está indisponível/);
  });
});
