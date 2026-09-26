import { NextResponse } from "next/server";
import { PROVIDER_IDS } from "@/lib/llm/providers";
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
    passwordProtected: Boolean(env.APP_PASSWORD),
    // Na Vercel não há "rede de casa" para mostrar ao celular.
    lanAccess: !process.env.VERCEL,
    defaultGenerator: { provider: env.LLM_DEFAULT_PROVIDER, model: env.LLM_DEFAULT_MODEL },
  });
}
