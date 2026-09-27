import { NextResponse } from "next/server";
import { z } from "zod";
import { PIN_PATTERN, PIN_RULE, pinIsSet, removePin, savePin, verifyPin } from "@/lib/server/access-store";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { ApiError, errorResponse, readJson } from "@/lib/server/errors";
import { assertPinAttemptAllowed, registerPinFailure, registerPinSuccess } from "@/lib/server/pin-guard";
import { setSessionCookie } from "@/lib/server/session-cookie";
import { stopTunnel } from "@/lib/server/tunnel";

export const dynamic = "force-dynamic";

function assertManageable() {
  if (process.env.VERCEL) throw new ApiError(404, "O PIN só existe quando o app roda no seu PC.", "not_available");
}

/** Para trocar ou remover um PIN que já existe, pede o PIN atual (com a mesma proteção do login). */
function checkCurrentPin(request: Request, currentPin: string | undefined) {
  if (!pinIsSet()) return;
  assertPinAttemptAllowed(request);
  if (!currentPin || !verifyPin(currentPin.trim())) {
    registerPinFailure();
    throw new ApiError(401, "PIN atual incorreto.", "wrong_pin");
  }
  registerPinSuccess();
}

const saveSchema = z.object({
  pin: z.string().trim().regex(PIN_PATTERN, PIN_RULE),
  currentPin: z.string().max(40).optional(),
});

/** Cria ou troca o PIN. Este aparelho já fica conectado; os outros precisam digitar o novo PIN. */
export async function POST(request: Request) {
  try {
    assertManageable();
    const body = await readJson(request, saveSchema);
    checkCurrentPin(request, body.currentPin);
    const secret = savePin(body.pin);
    const response = NextResponse.json({ ok: true });
    await setSessionCookie(response, request, secret);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

const removeSchema = z.object({ currentPin: z.string().max(40) });

/** Remove o PIN: o app volta a abrir sem pedir nada, e o acesso fora de casa é desligado. */
export async function DELETE(request: Request) {
  try {
    assertManageable();
    const body = await readJson(request, removeSchema);
    checkCurrentPin(request, body.currentPin);
    stopTunnel();
    removePin();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
