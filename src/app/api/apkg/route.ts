import { apkgRequestSchema } from "@/lib/schemas/api";
import { buildApkg } from "@/lib/server/apkg";
import { errorResponse, readJson } from "@/lib/server/errors";
import { guard } from "@/lib/server/guard";
import { sanitizeCardHtml } from "@/lib/server/sanitize";
import { toAnkiTag } from "@/lib/shared/text";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Monta um .apkg para quem não está com o Anki aberto (ou usa o celular). */
export async function POST(request: Request) {
  try {
    guard(request, "files");
    const { deckName, cards, media } = await readJson(request, apkgRequestSchema);
    const file = await buildApkg(
      deckName,
      cards.map((card) => ({
        type: card.type,
        // [sound:arquivo.mp3] é texto puro para o sanitizador, então sobrevive intacto.
        front: sanitizeCardHtml(card.front),
        back: sanitizeCardHtml(card.back),
        tags: card.tags.map(toAnkiTag).filter(Boolean),
      })),
      media.map((item) => ({ filename: item.filename, data: Buffer.from(item.dataBase64, "base64") })),
    );
    const safeName =
      deckName
        .replace(/[^\w\- ]+/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 60) || "baralho";
    return new Response(Buffer.from(file), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${safeName}.apkg"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
