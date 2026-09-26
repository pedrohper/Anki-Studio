import { networkInterfaces } from "node:os";
import { NextResponse } from "next/server";
import { pickLanAddresses, portFromRequest } from "@/lib/server/network";

export const dynamic = "force-dynamic";

/**
 * Endereços da rede local (Wi-Fi) para abrir o app no celular.
 * Na Vercel não faz sentido (e não expomos nada): devolve lista vazia.
 */
export function GET(request: Request) {
  if (process.env.VERCEL) return NextResponse.json({ addresses: [] });
  return NextResponse.json({ addresses: pickLanAddresses(networkInterfaces(), portFromRequest(request)) });
}
