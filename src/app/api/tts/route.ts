import { NextResponse } from "next/server";
import { ttsRequestSchema } from "@/lib/schemas/api";
import { getEnv } from "@/lib/server/env";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { synthesizeSpeech, TTS_KEY_HEADER } from "@/lib/server/tts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    guard(request, "network");
    const { text, voice } = await readJson(request, ttsRequestSchema);
    // Texto puro é o formato antigo: nome de uma voz do Edge.
    const ref = typeof voice === "object" ? voice : { provider: "edge" as const, voice: voice || getEnv().TTS_VOICE };
    const apiKey = request.headers.get(TTS_KEY_HEADER)?.trim() || undefined;
    const audio = await synthesizeSpeech(text, ref, apiKey);
    return NextResponse.json({ audioBase64: audio.toString("base64"), mimeType: "audio/mpeg" });
  } catch (error) {
    return errorResponse(error);
  }
}
