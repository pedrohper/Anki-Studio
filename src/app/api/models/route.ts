import { NextResponse } from "next/server";
import { providerRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { listModels, resolveLlm } from "@/lib/server/llm";

export const runtime = "nodejs";

/** Lista os modelos de chat disponíveis para a chave informada. */
export async function POST(request: Request) {
  try {
    guard(request, "network");
    const { provider } = await readJson(request, providerRequestSchema);
    const llm = resolveLlm(request, { provider, model: "-" });
    return NextResponse.json({ models: await listModels(llm) });
  } catch (error) {
    return errorResponse(error);
  }
}
