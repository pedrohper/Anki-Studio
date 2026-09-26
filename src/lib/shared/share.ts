/**
 * Junta o que outro app compartilhou (título, texto, link) num texto só para a
 * captura rápida. Se sobrar só um link, devolve só o link, para a captura
 * rápida extrair o conteúdo da página ou do vídeo.
 */
export function composeSharedText({
  title = "",
  text = "",
  url = "",
}: {
  title?: string;
  text?: string;
  url?: string;
}) {
  const cleanText = text.trim();
  const cleanUrl = url.trim();
  const parts = [cleanText];
  if (cleanUrl && !cleanText.includes(cleanUrl)) parts.push(cleanUrl);
  const body = parts.filter(Boolean).join("\n");
  if (/^https?:\/\/\S+$/i.test(body)) return body;
  const cleanTitle = title.trim();
  if (cleanTitle && !body.startsWith(cleanTitle)) return [cleanTitle, body].filter(Boolean).join("\n\n");
  return body;
}

/** Limite de texto aceito pelo compartilhamento (o resto é cortado). */
export const SHARE_MAX_CHARS = 20_000;
