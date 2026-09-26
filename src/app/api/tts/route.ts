import { NextResponse } from "next/server";
import { ttsRequestSchema } from "@/lib/schemas/api";
import { getEnv } from "@/lib/server/env";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { synthesizeSpeech } from "@/lib/server/tts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    guard(request, "network");
    const { text, voice } = await readJson(request, ttsRequestSchema);
    const audio = await synthesizeSpeech(text, voice || getEnv().TTS_VOICE);
    return NextResponse.json({ audioBase64: audio.toString("base64"), mimeType: "audio/mpeg" });
  } catch (error) {
    return errorResponse(error);
  }
}
