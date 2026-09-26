/**
 * Senha do app (APP_PASSWORD) para quando ele fica acessível fora de casa.
 * Sem banco de dados: o cookie guarda um HMAC derivado da senha. Trocar a
 * senha no .env derruba todas as sessões antigas.
 *
 * Usa só Web Crypto, então funciona tanto no proxy quanto nas rotas.
 */

export const AUTH_COOKIE = "anki_studio_sessao";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

const encoder = new TextEncoder();

async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
  return Buffer.from(signature).toString("base64url");
}

/** Comparação em tempo constante (para strings do mesmo tamanho). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function sessionToken(password: string): Promise<string> {
  return hmac(password, "anki-studio:sessao:v1");
}

export async function isValidSession(cookie: string | undefined, password: string): Promise<boolean> {
  if (!cookie) return false;
  return safeEqual(cookie, await sessionToken(password));
}

/** Compara as senhas via HMAC para não vazar o tamanho nem o conteúdo pelo tempo de resposta. */
export async function passwordMatches(attempt: string, password: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac("anki-studio:login", attempt), hmac("anki-studio:login", password)]);
  return safeEqual(a, b);
}

/** Caminhos liberados sem login: a tela de entrar, a API de login e os arquivos do ícone/PWA. */
const PUBLIC_PATHS = [
  /^\/entrar\/?$/,
  /^\/api\/auth\//,
  /^\/_next\//,
  /^\/(icon|apple-icon|opengraph-image)[^/]*$/,
  /^\/favicon\.ico$/,
  /^\/manifest\.webmanifest$/,
  /^\/sw\.js$/,
  /^\/pwa\//,
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

/** Só aceita voltar para um caminho do próprio site (evita redirecionamento aberto). */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/** Cookie Secure só quando o acesso é por https (túnel ou deploy); no Wi-Fi local é http. */
export function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwarded === "https" || new URL(request.url).protocol === "https:";
}
