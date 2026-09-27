import { NextResponse } from "next/server";
import { pinIsSet } from "@/lib/server/access-store";
import { tunnelSnapshot } from "@/lib/server/tunnel";

export const dynamic = "force-dynamic";

/** Estado do PIN e do acesso fora de casa (a tela de Configurações consulta isto). */
export function GET() {
  return NextResponse.json({
    pinSet: pinIsSet(),
    // Na Vercel não existe "PC de casa" nem disco para guardar o PIN.
    manageable: !process.env.VERCEL,
    tunnel: tunnelSnapshot(),
  });
}
