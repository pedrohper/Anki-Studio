import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * PIN do Anki Studio, criado pelo próprio site (Configurações › Abrir no celular).
 * Fica em data/acesso.json no PC (pasta fora do git), só com o hash (scrypt) do PIN
 * e um segredo aleatório que assina os cookies de sessão. Trocar ou remover o PIN
 * gera outro segredo, o que desconecta todos os aparelhos.
 */

export const PIN_PATTERN = /^\d{4,12}$/;
export const PIN_RULE = "O PIN precisa ter de 4 a 12 números.";

const fileSchema = z.object({
  version: z.literal(1),
  salt: z.string(),
  hash: z.string(),
  secret: z.string(),
  updatedAt: z.string(),
});
type AccessFile = z.infer<typeof fileSchema>;

export function dataDir(): string {
  return process.env.ANKI_STUDIO_DATA_DIR || path.join(process.cwd(), "data");
}

const accessPath = () => path.join(dataDir(), "acesso.json");

// Lê o arquivo só quando ele muda (o proxy consulta isto em toda requisição).
let cache: { path: string; mtimeMs: number; value: AccessFile | null } | undefined;

function readAccess(): AccessFile | null {
  const file = accessPath();
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = { path: file, mtimeMs: -1, value: null };
    return null;
  }
  if (cache && cache.path === file && cache.mtimeMs === mtimeMs) return cache.value;
  let value: AccessFile | null = null;
  try {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    value = parsed.success ? parsed.data : null;
  } catch {
    value = null;
  }
  cache = { path: file, mtimeMs, value };
  return value;
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, Buffer.from(salt, "base64url"), 32).toString("base64url");
}

/** Segredo que assina os cookies, ou null quando não há PIN (app aberto). */
export function authSecret(): string | null {
  return readAccess()?.secret ?? null;
}

export function pinIsSet(): boolean {
  return authSecret() !== null;
}

export function verifyPin(attempt: string): boolean {
  const access = readAccess();
  if (!access || !PIN_PATTERN.test(attempt)) return false;
  const expected = Buffer.from(access.hash, "base64url");
  const actual = Buffer.from(hashPin(attempt, access.salt), "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Cria ou troca o PIN. Devolve o novo segredo de sessão. */
export function savePin(pin: string): string {
  if (!PIN_PATTERN.test(pin)) throw new Error(PIN_RULE);
  const salt = randomBytes(16).toString("base64url");
  const data: AccessFile = {
    version: 1,
    salt,
    hash: hashPin(pin, salt),
    secret: randomBytes(32).toString("base64url"),
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(dataDir(), { recursive: true });
  // Escreve num arquivo temporário e troca de uma vez, para nunca ficar meio salvo.
  const temp = `${accessPath()}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(temp, accessPath());
  cache = undefined;
  return data.secret;
}

export function removePin(): void {
  try {
    unlinkSync(accessPath());
  } catch {
    // já não existia
  }
  cache = undefined;
}
