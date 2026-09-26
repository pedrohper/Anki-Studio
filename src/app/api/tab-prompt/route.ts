import { NextResponse } from "next/server";
import { promptRequestSchema, promptResponseSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { completeJson, resolveLlm } from "@/lib/server/llm";
import { buildTabPromptUserMessage, TAB_PROMPT_WRITER_SYSTEM } from "@/lib/server/prompts/tab-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A IA escreve o system prompt de uma aba a partir do objetivo descrito. */
export async function POST(request: Request) {
  try {
    guard(request, "ai");
    const { settings, llm: ref } = await readJson(request, promptRequestSchema);
    const llm = resolveLlm(request, ref);
    const result = await completeJson({
      llm,
      system: TAB_PROMPT_WRITER_SYSTEM,
      user: buildTabPromptUserMessage(settings),
      schema: promptResponseSchema,
      temperature: 0.5,
      maxTokens: 2_500,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
