import { NextResponse } from "next/server";
import { PROVIDER_IDS } from "@/lib/llm/providers";
import { pinIsSet } from "@/lib/server/access-store";
import { sharedDataEnabled } from "@/lib/server/data-store";
import { getEnv, providerEnabled, serverKeyAvailable, serverKeyFor } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Diz ao navegador o que este servidor oferece (sem expor segredos). */
export function GET() {
  const env = getEnv();
  return NextResponse.json({
    serverKeyAvailable: serverKeyAvailable(env),
    ankiProxyEnabled: env.ANKI_PROXY_ENABLED,
    model: env.DEEPSEEK_MODEL,
    providers: PROVIDER_IDS.map((id) => ({
      id,
      serverKey: Boolean(serverKeyFor(id, env)),
      enabled: providerEnabled(id, env),
    })),
    passwordProtected: pinIsSet(),
    // Na Vercel não há "rede de casa" para mostrar ao celular.
    lanAccess: !process.env.VERCEL,
    // Rodando no PC, os dados ficam no PC e todos os aparelhos veem os mesmos.
    sharedData: sharedDataEnabled(),
    defaultGenerator: { provider: env.LLM_DEFAULT_PROVIDER, model: env.LLM_DEFAULT_MODEL },
  });
}
