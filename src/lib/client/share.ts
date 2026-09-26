"use client";

import { composeSharedText } from "@/lib/shared/share";

export type SharedItem = { text: string; file: File | null };

const SHARE_CACHE = "anki-studio-share";

/**
 * Pega (uma vez) o que chegou pelo "Compartilhar" do celular e limpa a URL.
 * Vem do service worker (?compartilhado=1, com arquivo) ou do plano B da rota
 * /compartilhar (?titulo=&texto=&link=).
 */
export async function takeSharedItem(): Promise<SharedItem | null> {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  let item: SharedItem | null = null;

  if (params.get("compartilhado") === "1" && "caches" in window) {
    const cache = await caches.open(SHARE_CACHE);
    const data = await cache.match("/__compartilhado/dados");
    if (data) {
      const payload = (await data.json()) as {
        title?: string;
        text?: string;
        url?: string;
        fileName?: string | null;
        fileType?: string | null;
      };
      const blob = payload.fileName ? await (await cache.match("/__compartilhado/arquivo"))?.blob() : undefined;
      item = {
        text: composeSharedText(payload),
        file:
          blob && payload.fileName ? new File([blob], payload.fileName, { type: payload.fileType ?? blob.type }) : null,
      };
      await cache.delete("/__compartilhado/dados");
      await cache.delete("/__compartilhado/arquivo");
    }
  } else if (params.has("texto") || params.has("link") || params.has("titulo")) {
    item = {
      text: composeSharedText({
        title: params.get("titulo") ?? "",
        text: params.get("texto") ?? "",
        url: params.get("link") ?? "",
      }),
      file: null,
    };
  }

  for (const key of ["compartilhado", "texto", "link", "titulo"]) params.delete(key);
  const clean = url.pathname + (params.toString() ? `?${params}` : "") + url.hash;
  if (clean !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, "", clean);
  }
  return item && (item.text || item.file) ? item : null;
}
