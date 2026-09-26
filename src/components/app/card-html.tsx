"use client";

import DOMPurify from "dompurify";
import { useMemo } from "react";
import { renderClozePreview } from "@/lib/shared/cloze";
import { cn } from "@/lib/utils";

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "b",
    "strong",
    "i",
    "em",
    "u",
    "br",
    "p",
    "ul",
    "ol",
    "li",
    "code",
    "pre",
    "div",
    "span",
    "small",
    "sub",
    "sup",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "mark",
    "blockquote",
  ],
  ALLOWED_ATTR: ["style", "class", "colspan"],
};

/**
 * Mostra o HTML de um card. O servidor já sanitiza o que vem da IA, mas a
 * pessoa pode editar o card, então o navegador sanitiza de novo antes de exibir.
 */
export function CardHtml({
  html,
  cloze = false,
  reveal = false,
  className,
}: {
  html: string;
  cloze?: boolean;
  reveal?: boolean;
  className?: string;
}) {
  const safe = useMemo(() => {
    const source = cloze ? renderClozePreview(html, reveal) : html;
    return typeof window === "undefined"
      ? ""
      : DOMPurify.sanitize(source.replace(/\[sound:[^\]]+\]/g, ""), PURIFY_CONFIG);
  }, [html, cloze, reveal]);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: conteúdo sanitizado com DOMPurify logo acima
  return <div className={cn("card-html", className)} dangerouslySetInnerHTML={{ __html: safe }} />;
}
