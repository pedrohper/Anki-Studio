import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isPublicPath, isValidSession } from "@/lib/server/auth";

/**
 * Proteção por senha (Next 16 chama o antigo middleware de "proxy").
 * Só entra em ação quando APP_PASSWORD está definida: aí nenhuma página ou
 * rota da API responde sem o cookie de sessão. Isso impede que alguém com o
 * link do túnel gaste as suas chaves de IA ou mexa no seu Anki.
 */
export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (await isValidSession(request.cookies.get(AUTH_COOKIE)?.value, password)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { message: "Entre com a senha do Anki Studio para continuar.", code: "unauthorized" } },
      { status: 401 },
    );
  }
  const back = pathname === "/" && !search ? "" : `?voltar=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(new URL(`/entrar${back}`, publicOrigin(request)), 307);
}

/**
 * Origem que o navegador está usando: localhost, o IP do Wi-Fi ou o link https
 * do túnel (que chega aqui como http, com x-forwarded-proto/host).
 */
function publicOrigin(request: NextRequest): string {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
