import { NextResponse } from "next/server";
import { deckAnalysisRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { analyzeDeck } from "@/lib/server/insights";
import { completeJson, resolveLlm } from "@/lib/server/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A IA lê um baralho existente e sugere a configuração da aba (com prompt). */
export async function POST(request: Request) {
  try {
    guard(request, "ai");
    const input = await readJson(request, deckAnalysisRequestSchema);
    return NextResponse.json(await analyzeDeck(input, resolveLlm(request, input.llm), completeJson));
  } catch (error) {
    return errorResponse(error);
  }
}
