/*
 * Service worker do Anki Studio.
 * Faz duas coisas: recebe o que você compartilha pelo celular (texto, link ou
 * PDF) para a tela Início, e mostra o lembrete diário. Não faz cache do app,
 * então você sempre usa a versão mais nova do servidor.
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

// ---------- lembrete diário (Web Push) ----------

self.addEventListener("push", (event) => {
  let data = { title: "Anki Studio", body: "Hora de revisar!", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // mensagem sem JSON: usa o texto padrão
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      tag: "lembrete-diario",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => "focus" in client);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
