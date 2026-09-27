import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "./access-store";

/**
 * Preferências do acesso fora de casa, salvas em data/tunel.json no PC.
 * O token do ngrok fica só aqui: nunca volta para o navegador.
 */
export const tunnelProviderSchema = z.enum(["cloudflare", "ngrok"]);
export type TunnelProvider = z.infer<typeof tunnelProviderSchema>;

const configSchema = z.object({
  provider: tunnelProviderSchema.default("cloudflare"),
  /** Estava ligado da última vez: ao abrir o app, liga de novo sozinho. */
  enabled: z.boolean().default(false),
  ngrokToken: z.string().default(""),
  /** Domínio fixo do ngrok (vazio = o domínio grátis da sua conta). */
  ngrokDomain: z.string().default(""),
});
export type TunnelConfig = z.infer<typeof configSchema>;

const configPath = () => path.join(dataDir(), "tunel.json");

export function readTunnelConfig(): TunnelConfig {
  try {
    return configSchema.parse(JSON.parse(readFileSync(configPath(), "utf8")));
  } catch {
    return configSchema.parse({});
  }
}

export function writeTunnelConfig(patch: Partial<TunnelConfig>): TunnelConfig {
  const next = configSchema.parse({ ...readTunnelConfig(), ...patch });
  mkdirSync(dataDir(), { recursive: true });
  const temp = `${configPath()}.tmp`;
  writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(temp, configPath());
  return next;
}

/** Aceita "meu-app.ngrok-free.app" ou "https://meu-app.ngrok-free.app/" e guarda só o domínio. */
export function normalizeDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}
