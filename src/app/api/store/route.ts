import { NextResponse } from "next/server";
import { runStoreOp, sharedDataEnabled, storeOpSchema } from "@/lib/server/data-store";
import { ApiError, errorResponse, readJson } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/**
 * Leitura e gravação dos dados do estúdio guardados no PC.
 * Fica atrás do PIN (src/proxy.ts) quando ele existe.
 */
export async function POST(request: Request) {
  try {
    if (!sharedDataEnabled()) throw new ApiError(404, "Os dados ficam no navegador neste site.", "not_available");
    const op = await readJson(request, storeOpSchema);
    return NextResponse.json({ result: await runStoreOp(op) });
  } catch (error) {
    return errorResponse(error);
  }
}
