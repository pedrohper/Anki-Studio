import "server-only";
import { ApiError } from "./errors";

/**
 * Limite simples por IP, em memória (janela deslizante).
 * Em serverless cada instância tem seu próprio contador, então isto é uma
 * proteção básica contra abuso, não uma cota exata.
 */
const hits = new Map<string, number[]>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}

export function checkRateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): void {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    const retryIn = Math.ceil((windowMs - (now - (recent[0] ?? now))) / 1000);
    throw new ApiError(429, `Muitas requisições. Tente de novo em ${retryIn}s.`, "rate_limited");
  }
  recent.push(now);
  hits.set(key, recent);

  // Evita crescer para sempre em instâncias de longa duração.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
  }
}

export function resetRateLimit() {
  hits.clear();
}
