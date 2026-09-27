import { NextResponse } from "next/server";
import { pinIsSet } from "@/lib/server/access-store";
import { tunnelSnapshot } from "@/lib/server/tunnel";
import { readTunnelConfig } from "@/lib/server/tunnel-config";

export const dynamic = "force-dynamic";

/** Estado do PIN e do acesso fora de casa (a tela de Configurações consulta isto). */
export function GET() {
  const config = readTunnelConfig();
  return NextResponse.json({
    pinSet: pinIsSet(),
    // Na Vercel não existe "PC de casa" nem disco para guardar o PIN.
    manageable: !process.env.VERCEL,
    tunnel: tunnelSnapshot(),
    // O token do ngrok nunca sai do PC: o navegador só sabe se ele existe.
    config: {
      provider: config.provider,
      hasNgrokToken: Boolean(config.ngrokToken),
      ngrokDomain: config.ngrokDomain,
    },
  });
}
