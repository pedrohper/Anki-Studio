import { NextResponse } from "next/server";
import { extractUrlRequestSchema } from "@/lib/schemas/api";
import { errorResponse, readJson } from "@/lib/server/errors";
import { extractFromUrl, extractFromYoutube } from "@/lib/server/extract";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    guard(request, "network");
    const { url, kind } = await readJson(request, extractUrlRequestSchema);
    const result = kind === "youtube" ? await extractFromYoutube(url) : await extractFromUrl(url);
    return NextResponse.json({ title: result.title.slice(0, 200), text: result.text.slice(0, 160_000) });
  } catch (error) {
    return errorResponse(error);
  }
}
