import { NextResponse } from "next/server";
import { SHARE_MAX_CHARS } from "@/lib/shared/share";

/**
 * Destino do "Compartilhar" do celular (Web Share Target).
 * Normalmente o service worker (public/sw.js) intercepta o POST e guarda até
 * arquivos. Esta rota é o plano B quando ele ainda não está ativo: repassa
 * título, texto e link pela URL da tela Início (arquivos são ignorados aqui).
 */
function redirectWith(fields: { title: string; text: string; url: string }) {
  const params = new URLSearchParams();
  if (fields.title) params.set("titulo", fields.title.slice(0, 300));
  if (fields.text) params.set("texto", fields.text.slice(0, SHARE_MAX_CHARS));
  if (fields.url) params.set("link", fields.url.slice(0, 2_000));
  const query = params.toString();
  return new NextResponse(null, { status: 303, headers: { Location: query ? `/?${query}` : "/" } });
}

const field = (value: FormDataEntryValue | string | null) => (typeof value === "string" ? value : "");

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  return redirectWith({
    title: field(form?.get("title") ?? null),
    text: field(form?.get("text") ?? null),
    url: field(form?.get("url") ?? null),
  });
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return redirectWith({
    title: params.get("title") ?? "",
    text: params.get("text") ?? "",
    url: params.get("url") ?? "",
  });
}
