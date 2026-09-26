import { NextResponse } from "next/server";
import { providerRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { checkLlmKey, resolveLlm } from "@/lib/server/llm";

export const runtime = "nodejs";

/** Valida a chave de um provedor (usada no onboarding e nas configurações). Não gasta crédito. */
export async function POST(request: Request) {
  try {
    guard(request, "network");
    const { provider } = await readJson(request, providerRequestSchema);
    const llm = resolveLlm(request, { provider, model: "-" });
    return NextResponse.json(await checkLlmKey(llm));
  } catch (error) {
    return errorResponse(error);
  }
}
