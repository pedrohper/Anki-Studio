import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, readJson } from "@/lib/server/errors";
import { portFromRequest } from "@/lib/server/network";
import { startTunnel, tunnelSnapshot } from "@/lib/server/tunnel";
import { normalizeDomain, tunnelProviderSchema, writeTunnelConfig } from "@/lib/server/tunnel-config";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  provider: tunnelProviderSchema,
  /** Só manda quando for trocar; vazio mantém o token salvo. */
  ngrokToken: z.string().trim().max(200).optional(),
  ngrokDomain: z.string().max(200).optional(),
});

/** Escolhe Cloudflare (link muda) ou ngrok (link fixo). Se estiver ligado, religa com a escolha nova. */
export async function POST(request: Request) {
  try {
    if (process.env.VERCEL) throw new ApiError(404, "Isto só funciona com o app rodando no seu PC.", "not_available");
    const body = await readJson(request, bodySchema);
    const domain = body.ngrokDomain === undefined ? undefined : normalizeDomain(body.ngrokDomain);
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new ApiError(400, "Domínio inválido. Ex.: meu-anki.ngrok-free.app", "bad_domain");
    }
    writeTunnelConfig({
      provider: body.provider,
      ...(body.ngrokToken ? { ngrokToken: body.ngrokToken } : {}),
      ...(domain !== undefined ? { ngrokDomain: domain } : {}),
    });
    const current = tunnelSnapshot();
    const tunnel = current.status === "off" ? current : await startTunnel(process.env.PORT ?? portFromRequest(request));
    return NextResponse.json({ tunnel });
  } catch (error) {
    return errorResponse(error);
  }
}
