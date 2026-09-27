import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, readJson } from "@/lib/server/errors";
import { addDevice, removeDevice, subscriptionSchema } from "@/lib/server/reminder";

export const dynamic = "force-dynamic";

const addSchema = z.object({ subscription: subscriptionSchema, label: z.string().max(80).default("") });

/** Este aparelho passa a receber o lembrete. */
export async function POST(request: Request) {
  try {
    if (process.env.VERCEL) throw new ApiError(404, "Indisponível aqui.", "not_available");
    const { subscription, label } = await readJson(request, addSchema);
    addDevice(subscription, label);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Este aparelho para de receber. */
export async function DELETE(request: Request) {
  try {
    const { endpoint } = await readJson(request, z.object({ endpoint: z.string() }));
    removeDevice(endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
