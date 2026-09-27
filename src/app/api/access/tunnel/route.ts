import { NextResponse } from "next/server";
import { z } from "zod";
import { pinIsSet } from "@/lib/server/access-store";
import { ApiError, errorResponse, readJson } from "@/lib/server/errors";
import { portFromRequest } from "@/lib/server/network";
import { startTunnel, stopTunnel } from "@/lib/server/tunnel";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ on: z.boolean() });

/** Liga ou desliga o link https de fora de casa. Ligar exige um PIN criado. */
export async function POST(request: Request) {
  try {
    if (process.env.VERCEL) throw new ApiError(404, "Isto só funciona com o app rodando no seu PC.", "not_available");
    const { on } = await readJson(request, bodySchema);
    if (!on) return NextResponse.json({ tunnel: stopTunnel() });
    if (!pinIsSet()) {
      throw new ApiError(400, "Crie um PIN antes de ligar o acesso fora de casa.", "pin_required");
    }
    // O túnel aponta para a porta local deste servidor (não para o host do link).
    const port = process.env.PORT ?? portFromRequest(request);
    return NextResponse.json({ tunnel: startTunnel(port) });
  } catch (error) {
    return errorResponse(error);
  }
}
