import "server-only";
import * as cheerio from "cheerio";
import { fetchTranscript } from "youtube-transcript-plus";
import { ApiError } from "./errors";
import { safeFetchText } from "./ssrf";

export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [/youtu\.be\/([\w-]{11})/, /youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)([\w-]{11})/];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Extrai o texto principal de uma página HTML (artigo, main ou corpo). */
export function extractReadableText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  $(
    "script, style, noscript, nav, footer, header, aside, form, svg, iframe, [role=navigation], [aria-hidden=true], .mw-editsection, .reference, .ambox, .navbox, .metadata, .noprint",
  ).remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");

  const lines: string[] = [];
  root.find("h1, h2, h3, h4, p, li, pre, blockquote, td").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length > 1) lines.push(text);
  });
  const text = (lines.length ? lines : [root.text().replace(/\s+/g, " ")]).join("\n").trim();
  return { title, text };
}

export async function extractFromUrl(url: string): Promise<{ title: string; text: string }> {
  const { html, url: finalUrl } = await safeFetchText(url);
  const { title, text } = extractReadableText(html);
  if (text.length < 50) throw new ApiError(422, "Não encontrei texto suficiente nessa página.", "empty_page");
  return { title: title || finalUrl.hostname, text };
}

export async function extractFromYoutube(input: string): Promise<{ title: string; text: string }> {
  const videoId = extractYoutubeId(input);
  if (!videoId) throw new ApiError(400, "Link do YouTube inválido.", "invalid_youtube");

  const errors: unknown[] = [];
  for (const lang of ["pt", "pt-BR", "en", undefined]) {
    try {
      const { videoDetails, segments } = await fetchTranscript(videoId, {
        ...(lang ? { lang } : {}),
        videoDetails: true,
        retries: 1,
      });
      const text = segments
        .map((segment) => segment.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return { title: videoDetails.title || `YouTube ${videoId}`, text };
    } catch (error) {
      errors.push(error);
    }
  }
  console.warn("[youtube] sem transcrição:", videoId, errors.length, "tentativas");
  throw new ApiError(
    422,
    "Não consegui a transcrição desse vídeo. Ele precisa ter legendas; em servidores na nuvem o YouTube às vezes bloqueia o acesso.",
    "no_transcript",
  );
}
