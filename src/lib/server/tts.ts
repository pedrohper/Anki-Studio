import "server-only";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { ApiError } from "./errors";

/** Gera MP3 com as vozes neurais do Edge (gratuito, sem chave). */
export async function synthesizeSpeech(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text));
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 20_000);
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
  } catch (error) {
    console.warn("[tts] falhou:", error instanceof Error ? error.message : error);
    throw new ApiError(502, "Não foi possível gerar o áudio agora.", "tts_failed");
  } finally {
    tts.close();
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
