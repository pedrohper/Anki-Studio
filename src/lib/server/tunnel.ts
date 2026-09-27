import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./access-store";
import { readTunnelConfig, type TunnelProvider, writeTunnelConfig } from "./tunnel-config";

/**
 * Acesso fora de casa: um link https público apontando para o Anki Studio deste PC.
 *
 * - Cloudflare Quick Tunnel: sem conta, mas o link muda a cada vez.
 * - ngrok: com a conta grátis o link é fixo (o app instalado no celular nunca quebra).
 *
 * Se o link cair, ele religa sozinho; e se estava ligado quando o app fechou,
 * liga de novo ao abrir (ver src/instrumentation.ts). Só funciona com PIN.
 */

export type TunnelStatus = "off" | "installing" | "starting" | "on" | "reconnecting" | "error";
export type TunnelSnapshot = {
  status: TunnelStatus;
  url: string | null;
  error: string | null;
  provider: TunnelProvider;
};

interface Runner {
  url: string;
  stop: () => Promise<void>;
}

type TunnelState = {
  status: TunnelStatus;
  url: string | null;
  error: string | null;
  provider: TunnelProvider;
  runner: Runner | null;
  /** Aumenta a cada liga/desliga: tentativas antigas percebem que ficaram velhas e param. */
  generation: number;
  failures: number;
  watchdog: ReturnType<typeof setInterval> | null;
  port: string;
};

// globalThis: as rotas do Next podem carregar este módulo mais de uma vez, mas o túnel é um só.
const store = globalThis as typeof globalThis & { __ankiTunnel?: TunnelState };
const state = (): TunnelState => {
  store.__ankiTunnel ??= {
    status: "off",
    url: null,
    error: null,
    provider: "cloudflare",
    runner: null,
    generation: 0,
    failures: 0,
    watchdog: null,
    port: "3000",
  };
  return store.__ankiTunnel;
};

export function tunnelSnapshot(): TunnelSnapshot {
  const { status, url, error, provider } = state();
  return { status, url, error, provider };
}

// ---------- Cloudflare ----------

/** Link oficial de download do cloudflared para este sistema (null = instalar à mão). */
export function cloudflaredDownloadUrl(platform = process.platform, arch = process.arch): string | null {
  const base = "https://github.com/cloudflare/cloudflared/releases/latest/download/";
  if (platform === "win32") return `${base}cloudflared-windows-amd64.exe`;
  if (platform === "linux" && arch === "x64") return `${base}cloudflared-linux-amd64`;
  if (platform === "linux" && arch === "arm64") return `${base}cloudflared-linux-arm64`;
  return null;
}

const localBinary = () => path.join(dataDir(), "bin", process.platform === "win32" ? "cloudflared.exe" : "cloudflared");

function findCloudflared(): string | null {
  if (existsSync(localBinary())) return localBinary();
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["cloudflared"], { encoding: "utf8" });
  const fromPath = which.status === 0 ? which.stdout.split(/\r?\n/)[0]?.trim() : "";
  if (fromPath) return fromPath;
  const windows = [
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ];
  return process.platform === "win32" ? (windows.find((file) => existsSync(file)) ?? null) : null;
}

async function downloadCloudflared(): Promise<string> {
  const url = cloudflaredDownloadUrl();
  if (!url) throw new Error("Instale o cloudflared (ex.: brew install cloudflared) e tente de novo.");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não consegui baixar o cloudflared (erro ${response.status}).`);
  const target = localBinary();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(`${target}.download`, Buffer.from(await response.arrayBuffer()));
  renameSync(`${target}.download`, target);
  if (process.platform !== "win32") chmodSync(target, 0o755);
  return target;
}

const CLOUDFLARE_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

async function startCloudflare(port: string, onDown: () => void, onInstalling: () => void): Promise<Runner> {
  let binary = findCloudflared();
  if (!binary) {
    onInstalling();
    binary = await downloadCloudflared();
  }
  const child: ChildProcess = spawn(
    /* turbopackIgnore: true */ binary,
    ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`],
    { windowsHide: true },
  );
  return new Promise<Runner>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("A Cloudflare demorou para responder."));
    }, 45_000);
    const onOutput = (chunk: Buffer) => {
      const match = chunk.toString().match(CLOUDFLARE_URL);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        url: match[0],
        stop: async () => {
          child.removeAllListeners("exit");
          child.kill();
        },
      });
    };
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Não consegui abrir o cloudflared: ${error.message}`));
    });
    child.on("exit", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("O cloudflared fechou antes de criar o link."));
      } else onDown();
    });
  });
}

// ---------- ngrok ----------

async function startNgrok(port: string, token: string, domain: string, onDown: () => void): Promise<Runner> {
  if (!token) throw new Error("Cole o token do ngrok nas Configurações para usar o link fixo.");
  const ngrok = await import("@ngrok/ngrok");
  let listener: Awaited<ReturnType<typeof ngrok.forward>>;
  try {
    listener = await ngrok.forward({
      addr: `127.0.0.1:${port}`,
      authtoken: token,
      ...(domain ? { domain } : {}),
      onStatusChange: (status: string) => {
        if (status === "closed") onDown();
      },
    });
  } catch (error) {
    throw new Error(ngrokErrorMessage(error));
  }
  const url = listener.url();
  if (!url) throw new Error("O ngrok não devolveu um link.");
  return {
    url,
    stop: async () => {
      await listener.close().catch(() => undefined);
    },
  };
}

/** Traduz os erros mais comuns do ngrok. */
export function ngrokErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/ERR_NGROK_10[57]|authtoken|authentication/i.test(text)) {
    return "Token do ngrok inválido. Copie de novo no painel do ngrok.";
  }
  if (/ERR_NGROK_108|simultaneous/i.test(text)) {
    return "Sua conta ngrok já está com um link aberto em outro lugar. Feche o outro e tente de novo.";
  }
  if (/domain|hostname/i.test(text)) {
    return "Esse domínio não é da sua conta ngrok. Deixe o campo vazio para usar o domínio grátis da conta.";
  }
  return `O ngrok recusou: ${text.slice(0, 200)}`;
}

// ---------- ciclo de vida ----------

const RETRY_DELAYS = [3_000, 10_000, 30_000, 60_000];
/** Erros de configuração: repetir não adianta. */
const CONFIG_ERROR = /token|domínio|Instale|outro lugar/i;

async function connect(generation: number) {
  const current = state();
  const config = readTunnelConfig();
  current.provider = config.provider;
  const stale = () => state().generation !== generation;
  const onDown = () => {
    if (stale()) return;
    current.runner = null;
    scheduleReconnect(generation, "O link caiu. Religando…");
  };
  try {
    const runner =
      config.provider === "ngrok"
        ? await startNgrok(current.port, config.ngrokToken, config.ngrokDomain, onDown)
        : await startCloudflare(current.port, onDown, () => {
            if (!stale()) current.status = "installing";
          });
    if (stale()) {
      await runner.stop();
      return;
    }
    Object.assign(current, { runner, url: runner.url, status: "on", error: null, failures: 0 });
    startWatchdog(generation);
  } catch (error) {
    if (stale()) return;
    const message = error instanceof Error ? error.message : "Não consegui ligar o acesso fora de casa.";
    if (CONFIG_ERROR.test(message)) {
      Object.assign(current, { status: "error", error: message, url: null });
      return;
    }
    scheduleReconnect(generation, message);
  }
}

function scheduleReconnect(generation: number, reason: string) {
  const current = state();
  if (current.generation !== generation) return;
  const delay = RETRY_DELAYS[Math.min(current.failures, RETRY_DELAYS.length - 1)] ?? 60_000;
  current.failures += 1;
  Object.assign(current, { status: "reconnecting", error: reason });
  const timer = setTimeout(() => {
    if (state().generation === generation) void connect(generation);
  }, delay);
  timer.unref?.();
}

/**
 * O link grátis da Cloudflare às vezes para de responder sem avisar. A cada
 * minuto conferimos se ele abre; depois de 3 falhas seguidas, religamos.
 */
function startWatchdog(generation: number) {
  const current = state();
  if (current.watchdog) clearInterval(current.watchdog);
  let misses = 0;
  current.watchdog = setInterval(async () => {
    const now = state();
    if (now.generation !== generation || !now.url) return;
    try {
      const response = await fetch(`${now.url}/manifest.webmanifest`, {
        signal: AbortSignal.timeout(15_000),
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      misses = response.ok ? 0 : misses + 1;
    } catch {
      misses += 1;
    }
    if (misses >= 3 && state().generation === generation) {
      misses = 0;
      await now.runner?.stop();
      now.runner = null;
      scheduleReconnect(generation, "O link parou de responder. Religando…");
    }
  }, 60_000);
  current.watchdog.unref?.();
}

async function teardown() {
  const current = state();
  current.generation += 1;
  if (current.watchdog) clearInterval(current.watchdog);
  current.watchdog = null;
  const runner = current.runner;
  current.runner = null;
  await runner?.stop().catch(() => undefined);
}

/** Liga (ou religa, se mudou o provedor) e lembra para ligar sozinho da próxima vez. */
export async function startTunnel(port: string | number, remember = true): Promise<TunnelSnapshot> {
  if (remember) writeTunnelConfig({ enabled: true });
  await teardown();
  const current = state();
  Object.assign(current, {
    status: "starting",
    url: null,
    error: null,
    failures: 0,
    port: String(port),
    provider: readTunnelConfig().provider,
  });
  void connect(current.generation);
  return tunnelSnapshot();
}

export async function stopTunnel(remember = true): Promise<TunnelSnapshot> {
  if (remember) writeTunnelConfig({ enabled: false });
  await teardown();
  Object.assign(state(), { status: "off", url: null, error: null, failures: 0 });
  return tunnelSnapshot();
}

/** Ao abrir o app: se o acesso estava ligado, liga de novo. */
export function resumeTunnelIfEnabled(port: string, pinSet: boolean) {
  if (!pinSet || !readTunnelConfig().enabled) return;
  void startTunnel(port, false);
}

// Se o servidor for encerrado, o túnel vai junto.
process.once("exit", () => void store.__ankiTunnel?.runner?.stop());
