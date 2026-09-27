import { NextResponse } from "next/server";
import { weakSpotsRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { analyzeWeakSpots } from "@/lib/server/insights";
import { completeJson, resolveLlm } from "@/lib/server/llm";
import { withUsage } from "@/lib/server/usage";

export const runtime = "nodejs";
export const maxDuration = 90;

/** A IA agrupa os cards que a pessoa mais erra em temas, com dicas. */
export const POST = withUsage(async (request: Request) => {
  try {
    guard(request, "ai");
    const input = await readJson(request, weakSpotsRequestSchema);
    return NextResponse.json(await analyzeWeakSpots(input, resolveLlm(request, input.llm), completeJson));
  } catch (error) {
    return errorResponse(error);
  }
});
