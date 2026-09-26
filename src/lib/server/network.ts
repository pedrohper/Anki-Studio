import type { NetworkInterfaceInfo } from "node:os";

export type LanAddress = { ip: string; url: string; label: string };

/** Adaptadores virtuais (WSL, Docker, VMs) que o celular não alcança. */
const VIRTUAL = /vethernet|wsl|virtualbox|vmware|hyper-v|docker|^br-|^veth|loopback|vbox|utun|awdl|llw/i;

function rank(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

/**
 * Escolhe os IPs da rede local em que o celular consegue abrir o app.
 * Recebe o resultado de os.networkInterfaces() para ser fácil de testar.
 */
export function pickLanAddresses(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>, port: number | string): LanAddress[] {
  const found: LanAddress[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || VIRTUAL.test(name)) continue;
    for (const entry of entries) {
      if (entry.internal || entry.family !== "IPv4" || entry.address.startsWith("169.254.")) continue;
      found.push({ ip: entry.address, url: `http://${entry.address}:${port}`, label: name });
    }
  }
  return found
    .filter((item, index, all) => all.findIndex((other) => other.ip === item.ip) === index)
    .sort((a, b) => rank(a.ip) - rank(b.ip));
}

/** Porta em que o servidor está rodando, deduzida do Host quando for um endereço local. */
export function portFromRequest(request: Request, fallback = process.env.PORT ?? "3000"): string {
  const host = request.headers.get("host") ?? "";
  const match = host.match(/^(?:localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}|\[[^\]]+\]):(\d+)$/);
  return match?.[1] ?? fallback;
}
