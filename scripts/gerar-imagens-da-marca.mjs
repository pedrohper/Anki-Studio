/**
 * Gera as imagens da marca a partir do SVG do ícone:
 * - src/app/apple-icon.png (180x180, ícone da tela inicial no iPhone)
 * - src/app/opengraph-image.png (1200x630, prévia do link no LinkedIn/WhatsApp)
 * - public/pwa/icon-192.png, icon-512.png e icon-maskable-512.png (app instalável)
 *
 * Uso: node scripts/gerar-imagens-da-marca.mjs   (precisa do Playwright instalado)
 */
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const icon = await readFile("src/app/icon.svg", "utf8");
const iconUri = `data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`;
const shot = await readFile("docs/screenshots/revisor.png");
const shotUri = `data:image/png;base64,${shot.toString("base64")}`;

const providers = ["DeepSeek", "OpenAI", "Gemini", "OpenRouter", "Groq", "Mistral", "Ollama"];

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: "Geist", "Inter", "Segoe UI", sans-serif;
    background: radial-gradient(circle at 15% 10%, #818cf8 0, transparent 45%), linear-gradient(135deg, #4f46e5 0%, #5b21b6 100%); color: white; }
  .wrap { position: relative; height: 100%; padding: 72px 64px; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
  .brand img { width: 72px; height: 72px; border-radius: 18px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
  h1 { margin-top: 44px; font-size: 58px; line-height: 1.04; letter-spacing: -0.035em; max-width: 500px; }
  p { margin-top: 22px; font-size: 24px; line-height: 1.35; color: rgba(255,255,255,.82); max-width: 480px; }
  .chips { position: absolute; left: 64px; bottom: 60px; display: flex; flex-wrap: wrap; gap: 8px; max-width: 520px; }
  .chip { padding: 7px 14px; border-radius: 999px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25); font-size: 17px; }
  .shot { position: absolute; right: -170px; top: 80px; width: 680px; border-radius: 18px; transform: rotate(-4deg);
    box-shadow: 0 30px 80px rgba(20,10,60,.55); border: 1px solid rgba(255,255,255,.35); }
</style></head><body><div class="wrap">
  <div class="brand"><img src="${iconUri}">Anki Studio</div>
  <h1>Flashcards com IA do seu jeito</h1>
  <p>Abas de estudo com prompts escritos pela IA, um modelo revisando o outro e envio direto para o Anki.</p>
  <div class="chips">${providers.map((name) => `<span class="chip">${name}</span>`).join("")}</div>
  <img class="shot" src="${shotUri}">
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og, { waitUntil: "load" });
await page.screenshot({ path: "src/app/opengraph-image.png" });

await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(
  `<html><body style="margin:0;background:#4f46e5"><img src="${iconUri}" width="180" height="180" style="display:block;border-radius:0"></body></html>`,
);
await page.screenshot({ path: "src/app/apple-icon.png" });

// Ícones do PWA. O "maskable" deixa margem de segurança: o Android recorta em círculo/gota.
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${iconUri}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.screenshot({ path: `public/pwa/icon-${size}.png`, omitBackground: true });
}
await page.setContent(
  `<html><body style="margin:0;background:linear-gradient(135deg,#6366f1,#4f46e5 55%,#7c3aed);display:grid;place-items:center;height:512px"><img src="${iconUri}" width="360" height="360" style="display:block"></body></html>`,
);
await page.screenshot({ path: "public/pwa/icon-maskable-512.png" });
await browser.close();
console.log("Imagens geradas: opengraph-image, apple-icon e os ícones do PWA em public/pwa/");
