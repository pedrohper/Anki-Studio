import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * O HTML dos cards vem da IA, e a IA lê materiais de terceiros. Por isso tudo
 * passa por uma lista de tags e estilos permitidos antes de chegar ao navegador
 * ou ao Anki: nada de scripts, links, imagens ou atributos de evento.
 */
const SAFE_STYLE = {
  color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
  background: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
  "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
  padding: [/^[\d.\s]+(px|em|rem)?(\s+[\d.]+(px|em|rem)?){0,3}$/],
  margin: [/^[\d.\s]+(px|em|rem)?(\s+[\d.]+(px|em|rem)?){0,3}$/],
  "border-left": [/^\d+px\s+solid\s+(#[0-9a-f]{3,8}|[a-z]+)$/i],
  "border-radius": [/^\d+(px|em|rem)$/],
  "font-weight": [/^(bold|normal|\d{3})$/],
  "font-style": [/^(italic|normal)$/],
  "text-align": [/^(left|right|center)$/],
};

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
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
  allowedAttributes: { div: ["style"], span: ["style"], code: ["class"], td: ["colspan"], th: ["colspan"] },
  allowedStyles: { div: SAFE_STYLE, span: SAFE_STYLE },
  allowedClasses: { code: [/^language-[\w-]+$/] },
  disallowedTagsMode: "discard",
};

export function sanitizeCardHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Texto puro, para campos que nunca deveriam ter HTML (ex.: audioText). */
export function toPlainText(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}
