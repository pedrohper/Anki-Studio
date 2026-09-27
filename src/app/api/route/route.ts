import { NextResponse } from "next/server";
import { routeRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { routeMaterial } from "@/lib/server/insights";
import { completeJson, resolveLlm } from "@/lib/server/llm";
import { withUsage } from "@/lib/server/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Material solto na tela Início: a IA escolhe em qual aba ele entra. */
export const POST = withUsage(async (request: Request) => {
  try {
    guard(request, "ai");
    const input = await readJson(request, routeRequestSchema);
    return NextResponse.json(await routeMaterial(input, resolveLlm(request, input.llm), completeJson));
  } catch (error) {
    return errorResponse(error);
  }
});
