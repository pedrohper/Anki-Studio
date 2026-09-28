import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ApiError } from "./errors";

/**
 * A rota de links busca páginas a pedido de qualquer visitante. Sem cuidado,
 * alguém poderia usar o servidor para acessar endereços internos (SSRF).
 * Aqui só passam http/https apontando para IPs públicos.
 */

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const value = ipv4ToNumber(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToNumber(base) & mask);
    });
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower);
  }
  return true;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) {
    throw new ApiError(400, "Só links http ou https são aceitos.", "invalid_url");
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ApiError(400, "Link inválido.", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(400, "Só links http ou https são aceitos.", "invalid_url");
  }
  if (url.username || url.password)
    throw new ApiError(400, "Links com usuário e senha não são aceitos.", "invalid_url");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new ApiError(400, "Não encontrei esse site.", "dns_failed");
  if (addresses.some(isPrivateIp)) throw new ApiError(400, "Esse endereço não é permitido.", "blocked_host");
  return url;
}

/** fetch que revalida cada redirecionamento e limita tamanho e tempo. */
export async function safeFetchText(raw: string, { maxBytes = 3_000_000, timeoutMs = 12_000 } = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AnkiStudio/1.0; +https://github.com/pedrohper/Anki-Studio)",
        accept: "text/html,text/plain;q=0.9,*/*;q=0.5",
      },
    }).catch(() => {
      throw new ApiError(502, "Não consegui acessar o link.", "fetch_failed");
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new ApiError(502, `O site respondeu com erro ${response.status}.`, "fetch_failed");

    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) {
      throw new ApiError(
        415,
        "Esse link não é uma página de texto. Para PDF, baixe e anexe o arquivo.",
        "unsupported_type",
      );
    }

    const reader = response.body?.getReader();
    if (!reader) return { url, html: "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { url, html: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new ApiError(502, "Redirecionamentos demais.", "too_many_redirects");
}
