import { NextResponse } from "next/server";
import { reviewRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { completeJson, resolveLlm } from "@/lib/server/llm";
import { reviewCards } from "@/lib/server/review";
import { withUsage } from "@/lib/server/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Um segundo modelo confere os cards gerados e sugere correções. */
export const POST = withUsage(async (request: Request) => {
  try {
    guard(request, "ai");
    const input = await readJson(request, reviewRequestSchema);
    const llm = resolveLlm(request, input.llm);
    return NextResponse.json(await reviewCards(input, llm, completeJson));
  } catch (error) {
    return errorResponse(error);
  }
});
