import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { buildReminderMessage, readAnkiSnapshot, sendReminder } from "@/lib/server/reminder";

export const dynamic = "force-dynamic";

/** Manda agora o lembrete de hoje (para testar). */
export async function POST() {
  try {
    if (process.env.VERCEL) throw new ApiError(404, "Indisponível aqui.", "not_available");
    const message = buildReminderMessage(await readAnkiSnapshot()) ?? {
      title: "Tudo em dia! ✅",
      body: "Nada pendente no Anki hoje. Este é só um teste do lembrete.",
    };
    const result = await sendReminder(message);
    if (result.sent === 0)
      throw new ApiError(400, "Nenhum aparelho recebeu. Ative o lembrete neste aparelho primeiro.");
    return NextResponse.json({ ...result, message });
  } catch (error) {
    return errorResponse(error);
  }
}
