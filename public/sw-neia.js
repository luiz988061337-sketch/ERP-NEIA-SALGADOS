/**
 * Service Worker — push notifications da Néia Salgados (sem Firebase, sem vendor).
 * Registrado sob demanda na página de rastreio (/pedido/$id), só após o cliente
 * permitir. Escopo raiz para o clique abrir qualquer rota.
 */
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = {};
  }
  const titulo = typeof dados.titulo === "string" && dados.titulo
    ? dados.titulo
    : "Néia Salgados";
  const corpo = typeof dados.corpo === "string" && dados.corpo
    ? dados.corpo
    : "Atualização do seu pedido.";
  const url = typeof dados.url === "string" && dados.url.startsWith("/")
    ? dados.url
    : "/";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: "/favicon.png",
      badge: "/favicon.png",
      data: { url },
      tag: typeof dados.pedido === "string" ? `pedido-${dados.pedido}` : "neia",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of janelas) {
        if (w.url.includes(new URL(url, self.location.origin).pathname)) {
          await w.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
