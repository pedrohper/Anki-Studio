import { NextResponse } from "next/server";
import { generateRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { generatePlan } from "@/lib/server/generate";
import { guard } from "@/lib/server/guard";
import { completeJson, resolveLlm } from "@/lib/server/llm";
import { withUsage } from "@/lib/server/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = withUsage(async (request: Request) => {
  try {
    guard(request, "ai");
    const input = await readJson(request, generateRequestSchema);
    const llm = resolveLlm(request, input.llm);
    const plan = await generatePlan(input, llm, completeJson);
    return NextResponse.json(plan);
  } catch (error) {
    return errorResponse(error);
  }
});
