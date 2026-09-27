import { NextResponse } from "next/server";
import { z } from "zod";
import { authSecret, verifyPin } from "@/lib/server/access-store";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { assertPinAttemptAllowed, registerPinFailure, registerPinSuccess } from "@/lib/server/pin-guard";
import { setSessionCookie } from "@/lib/server/session-cookie";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ pin: z.string().max(40) });

export async function POST(request: Request) {
  try {
    const secret = authSecret();
    if (!secret) throw new ApiError(404, "Este Anki Studio não usa PIN.", "no_pin");
    assertPinAttemptAllowed(request);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !verifyPin(parsed.data.pin.trim())) {
      registerPinFailure();
      throw new ApiError(401, "PIN incorreto.", "wrong_pin");
    }
    registerPinSuccess();

    const response = NextResponse.json({ ok: true });
    await setSessionCookie(response, request, secret);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
