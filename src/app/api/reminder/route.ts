import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, readJson } from "@/lib/server/errors";
import { readReminder, updateReminder, vapidPublicKey } from "@/lib/server/reminder";

export const dynamic = "force-dynamic";

function assertLocal() {
  if (process.env.VERCEL) throw new ApiError(404, "O lembrete funciona com o app rodando no seu PC.", "not_available");
}

/** Horário, se está ligado, quantos aparelhos recebem e a chave pública para se inscrever. */
export function GET() {
  try {
    assertLocal();
    const current = readReminder();
    return NextResponse.json({
      enabled: current.enabled,
      time: current.time,
      publicKey: vapidPublicKey(),
      endpoints: current.devices.map((device) => device.subscription.endpoint),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Horário inválido.")
    .optional(),
});

export async function POST(request: Request) {
  try {
    assertLocal();
    const body = await readJson(request, settingsSchema);
    // Mudou o horário para mais tarde hoje? Deixa mandar de novo hoje.
    const current = updateReminder({ ...body, ...(body.time ? { lastSentDay: "" } : {}) });
    return NextResponse.json({ enabled: current.enabled, time: current.time });
  } catch (error) {
    return errorResponse(error);
  }
}
