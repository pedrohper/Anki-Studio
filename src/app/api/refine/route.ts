import { NextResponse } from "next/server";
import { refineRequestSchema, refineResponseSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { completeJson, resolveLlm } from "@/lib/server/llm";
import { buildRefineUserMessage, REFINE_SYSTEM } from "@/lib/server/prompts/refine";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Propõe uma nova versão do prompt da aba com base nos cards editados e descartados. */
export async function POST(request: Request) {
  try {
    guard(request, "ai");
    const body = await readJson(request, refineRequestSchema);
    const llm = resolveLlm(request, body.llm);
    const result = await completeJson({
      llm,
      system: REFINE_SYSTEM,
      user: buildRefineUserMessage(body),
      schema: refineResponseSchema,
      temperature: 0.3,
      maxTokens: 3_000,
    });
    if (result.shouldChange && result.proposedPrompt.trim().length < 50) {
      return NextResponse.json({ shouldChange: false, proposedPrompt: "", changes: [] });
    }
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
