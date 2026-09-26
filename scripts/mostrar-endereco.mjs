/**
 * Mostra no terminal o endereço para abrir o Anki Studio no celular (mesmo
 * Wi-Fi), com QR code. Chamado pelo executar.bat.
 *
 * Uso: node scripts/mostrar-endereco.mjs [porta]
 * (A mesma lógica de escolher o IP está em src/lib/server/network.ts.)
 */
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";

const port = process.argv[2] ?? process.env.PORT ?? "3000";
const VIRTUAL = /vethernet|wsl|virtualbox|vmware|hyper-v|docker|^br-|^veth|loopback|vbox|utun|awdl|llw/i;
const rank = (ip) =>
  ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;

const ips = Object.entries(networkInterfaces())
  .filter(([name]) => !VIRTUAL.test(name))
  .flatMap(([, entries]) => entries ?? [])
  .filter((entry) => entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254."))
  .map((entry) => entry.address)
  .filter((ip, index, all) => all.indexOf(ip) === index)
  .sort((a, b) => rank(a) - rank(b));

console.log("");
console.log("  Anki Studio");
console.log(`  Neste PC:     http://localhost:${port}`);
if (ips.length === 0) {
  console.log("  (Sem rede Wi-Fi/cabo ativa: o celular não vai conseguir abrir.)");
} else {
  const [main, ...others] = ips;
  console.log(`  No celular:   http://${main}:${port}   (mesmo Wi-Fi)`);
  for (const ip of others) console.log(`                http://${ip}:${port}`);
  console.log("");
  console.log(await QRCode.toString(`http://${main}:${port}`, { type: "terminal", small: true }));
  console.log("  Aponte a câmera do celular para o QR code acima.");
  console.log("  Não abriu? Deixe a rede do Windows como Privada e permita o Node.js no firewall.");
}
console.log("");
