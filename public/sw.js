/*
 * Service worker do Anki Studio.
 * Faz só uma coisa: recebe o que você compartilha pelo celular (texto, link ou
 * PDF) e guarda para a tela Início. Não faz cache do app, então você sempre
 * usa a versão mais nova do servidor.
 */
const SHARE_CACHE = "anki-studio-share";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/compartilhar") {
    event.respondWith(receiveShare(event.request));
  }
});

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const text = (key) => (typeof form.get(key) === "string" ? form.get(key) : "");
    const file = form.getAll("file").find((item) => typeof item !== "string");
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      "/__compartilhado/dados",
      new Response(
        JSON.stringify({
          title: text("title"),
          text: text("text"),
          url: text("url"),
          fileName: file ? file.name : null,
          fileType: file ? file.type : null,
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    if (file) await cache.put("/__compartilhado/arquivo", new Response(file));
    else await cache.delete("/__compartilhado/arquivo");
    return Response.redirect("/?compartilhado=1", 303);
  } catch {
    return Response.redirect("/", 303);
  }
}
