import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_COOKIE, isHttps, passwordMatches, SESSION_MAX_AGE, sessionToken } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { checkRateLimit, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().max(200) });

export async function POST(request: Request) {
  try {
    const password = process.env.APP_PASSWORD?.trim();
    if (!password) throw new ApiError(404, "Este servidor não usa senha.", "no_password");

    // Poucas tentativas por minuto, por IP e no total, contra quem tenta adivinhar.
    checkRateLimit(`login:${clientIp(request)}`, 5);
    checkRateLimit("login:all", 30);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !(await passwordMatches(parsed.data.password, password))) {
      throw new ApiError(401, "Senha incorreta.", "wrong_password");
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE, await sessionToken(password), {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(request),
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
