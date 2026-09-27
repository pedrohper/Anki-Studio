import type { NextResponse } from "next/server";
import { AUTH_COOKIE, isHttps, SESSION_MAX_AGE, sessionToken } from "./auth";

/** Grava o cookie de sessão (este aparelho fica conectado por 90 dias). */
export async function setSessionCookie(response: NextResponse, request: Request, secret: string) {
  response.cookies.set(AUTH_COOKIE, await sessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(request),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}
