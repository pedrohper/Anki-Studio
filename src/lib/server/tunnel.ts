import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./access-store";

/**
 * Acesso fora de casa: liga um Cloudflare Quick Tunnel (sem conta) que cria um
 * link https público apontando para o Anki Studio deste PC. Na primeira vez o
 * programa "cloudflared" é baixado sozinho para data/bin.
 *
 * Quem liga isto é a rota /api/access/tunnel, que só aceita quando existe PIN.
 */

export type TunnelStatus = "off" | "installing" | "starting" | "on" | "error";
export type TunnelSnapshot = { status: TunnelStatus; url: string | null; error: string | null };

type TunnelState = TunnelSnapshot & { child: ChildProcess | null; stopping: boolean };

// globalThis: as rotas do Next podem carregar este módulo mais de uma vez, mas o túnel é um só.
const store = globalThis as typeof globalThis & { __ankiTunnel?: TunnelState };
const state = (): TunnelState => {
  store.__ankiTunnel ??= { status: "off", url: null, error: null, child: null, stopping: false };
  return store.__ankiTunnel;
};

export function tunnelSnapshot(): TunnelSnapshot {
  const { status, url, error } = state();
  return { status, url, error };
}

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

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export function startTunnel(port: string | number): TunnelSnapshot {
  const current = state();
  if (current.status === "on" || current.status === "starting" || current.status === "installing") {
    return tunnelSnapshot();
  }
  Object.assign(current, { status: "starting", url: null, error: null, stopping: false });
  void launch(port);
  return tunnelSnapshot();
}

async function launch(port: string | number) {
  const current = state();
  const fail = (message: string) => {
    Object.assign(current, { status: "error", url: null, error: message });
    current.child?.kill();
    current.child = null;
  };
  try {
    let binary = findCloudflared();
    if (!binary) {
      current.status = "installing";
      binary = await downloadCloudflared();
      if (current.stopping) return;
      current.status = "starting";
    }
    const child = spawn(
      /* turbopackIgnore: true */ binary,
      ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`],
      {
        windowsHide: true,
      },
    );
    current.child = child;
    const timer = setTimeout(() => {
      if (current.status === "starting") fail("A Cloudflare demorou para responder. Tente ligar de novo.");
    }, 45_000);
    const onOutput = (chunk: Buffer) => {
      const match = chunk.toString().match(URL_PATTERN);
      if (match && current.status === "starting") {
        clearTimeout(timer);
        Object.assign(current, { status: "on", url: match[0], error: null });
      }
    };
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    child.on("error", (error) => fail(`Não consegui abrir o cloudflared: ${error.message}`));
    child.on("exit", () => {
      clearTimeout(timer);
      if (current.child !== child) return;
      current.child = null;
      if (current.stopping) Object.assign(current, { status: "off", url: null, error: null });
      else if (current.status !== "error") fail("O acesso fora de casa caiu. Ligue de novo.");
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Não consegui ligar o acesso fora de casa.");
  }
}

export function stopTunnel(): TunnelSnapshot {
  const current = state();
  current.stopping = true;
  if (current.child) current.child.kill();
  Object.assign(current, { status: "off", url: null, error: null, child: null });
  return tunnelSnapshot();
}

// Se o servidor for encerrado, o túnel vai junto.
process.once("exit", () => store.__ankiTunnel?.child?.kill());
