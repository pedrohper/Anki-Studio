import "server-only";
import { getEnv } from "./env";
import { checkRateLimit, clientIp } from "./rate-limit";

/** Limite por IP e por grupo de rota (IA, rede, arquivos). */
export function guard(request: Request, bucket: "ai" | "network" | "files") {
  const perMinute = getEnv().RATE_LIMIT_PER_MINUTE;
  const limit = bucket === "ai" ? perMinute : perMinute * 3;
  checkRateLimit(`${bucket}:${clientIp(request)}`, limit);
}
