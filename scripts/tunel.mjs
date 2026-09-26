/**
 * Acesso fora de casa: cria um link https temporário (Cloudflare Quick Tunnel,
 * sem conta) apontando para o Anki Studio deste PC e mostra um QR code.
 *
 * Por segurança, só funciona com APP_PASSWORD definida no .env: o link é
 * público e, sem senha, qualquer um poderia gastar as suas chaves de IA.
 *
 * Uso: node scripts/tunel.mjs [porta]   (o executar.bat --fora-de-casa chama isto)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import QRCode from "qrcode";

const port = process.argv[2] ?? "3000";
const local = `http://localhost:${port}`;

function readEnvFile() {
  const values = {};
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

function fail(message) {
  console.error(`\n  [ERRO] ${message}\n`);
  process.exit(1);
}

const password = (process.env.APP_PASSWORD ?? readEnvFile().APP_PASSWORD ?? "").trim();
if (password.length < 8) {
  fail(
    "Defina uma senha com pelo menos 8 caracteres antes de abrir fora de casa.\n" +
      "  Abra o arquivo .env e adicione a linha:  APP_PASSWORD=uma-senha-forte\n" +
      "  Depois feche e rode de novo (o servidor precisa reiniciar para usar a senha).",
  );
}

/** Acha o cloudflared no PATH ou nas pastas padrão do instalador do Windows. */
function findCloudflared() {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["cloudflared"], { encoding: "utf8" });
  const fromPath = which.status === 0 ? which.stdout.split(/\r?\n/)[0]?.trim() : "";
  if (fromPath) return fromPath;
  const candidates = [
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\Microsoft\\WinGet\\Links\\cloudflared.exe`,
  ];
  return candidates.find((path) => existsSync(path)) ?? "";
}

let cloudflared = findCloudflared();
if (!cloudflared && process.platform === "win32") {
  console.log("  Instalando o cloudflared (uma vez só)...");
  spawnSync(
    "winget",
    ["install", "--id", "Cloudflare.cloudflared", "-e", "--accept-source-agreements", "--accept-package-agreements"],
    { stdio: "inherit", shell: true },
  );
  cloudflared = findCloudflared();
}
if (!cloudflared) {
  fail(
    "Não achei o cloudflared. Instale com:  winget install Cloudflare.cloudflared\n" +
      "  (ou baixe em https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)",
  );
}

// Espera o servidor subir e confirma que a senha está ativa (senão o link ficaria aberto).
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${local}/api/config`, { redirect: "manual" });
      return response.status;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return 0;
}

console.log("  Esperando o Anki Studio ligar...");
const status = await waitForServer();
if (status === 0) fail(`O Anki Studio não respondeu em ${local}. Ele está rodando?`);
if (status !== 401) {
  fail(
    "O servidor está rodando sem senha. Coloque APP_PASSWORD no .env e reinicie o executar.bat\n" +
      "  antes de abrir o acesso fora de casa.",
  );
}

console.log("  Abrindo o túnel seguro (https)...");
const child = spawn(cloudflared, ["tunnel", "--no-autoupdate", "--url", local], { windowsHide: true });
let shown = false;
const onOutput = async (chunk) => {
  const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match || shown) return;
  shown = true;
  console.log("");
  console.log(`  Fora de casa:  ${match[0]}`);
  console.log("");
  console.log(await QRCode.toString(match[0], { type: "terminal", small: true }));
  console.log("  Abra no celular e entre com a sua senha (APP_PASSWORD).");
  console.log("  Com https dá para instalar como app e usar o Compartilhar.");
  console.log("  O link muda toda vez que você abre o túnel. Feche esta janela para desligar.");
  console.log("");
};
child.stdout.on("data", onOutput);
child.stderr.on("data", onOutput);
child.on("exit", (code) => {
  console.log(`\n  Túnel encerrado${code ? ` (código ${code})` : ""}.`);
  process.exit(code ?? 0);
});
process.on("SIGINT", () => child.kill());
