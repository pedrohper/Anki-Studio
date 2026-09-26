import { NextResponse } from "next/server";
import { ankiProxyRequestSchema } from "@/lib/schemas/api";
import { getEnv } from "@/lib/server/env";
import { ApiError, errorResponse, readJson } from "@/lib/server/errors";

export const runtime = "nodejs";

/**
 * Só para uso local: repassa chamadas ao AnkiConnect da mesma máquina, sem
 * precisar configurar CORS no add-on. Desligado por padrão no deploy público.
 */
export async function POST(request: Request) {
  try {
    const env = getEnv();
    if (!env.ANKI_PROXY_ENABLED) throw new ApiError(404, "Proxy do Anki desligado neste servidor.", "proxy_disabled");
    const body = await readJson(request, ankiProxyRequestSchema);
    const response = await fetch(env.ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {
      throw new ApiError(503, "Anki fechado ou AnkiConnect não instalado.", "anki_offline");
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return errorResponse(error);
  }
}
