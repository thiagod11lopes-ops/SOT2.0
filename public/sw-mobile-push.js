self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Padrão de vibração estilo chamada telefónica. */
const CALL_VIBRATE = [400, 180, 400, 180, 400, 900, 400, 180, 400, 180, 400, 1400];

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();
  const locationCall = payload.kind === "location-call";
  const title = String(
    payload.title || (locationCall ? "Chamada do HNMD" : "SOT 2.0 - Alarme"),
  );
  const body = String(
    payload.body || (locationCall ? "Enviar localização para HNMD" : "Você possui um novo alerta."),
  );
  const url = resolveAppUrl(String(payload.url || "mobile.html#/saidas/administrativas"));
  const icon = new URL("icons.svg", self.registration.scope).href;
  const tag = String(payload.tag || (locationCall ? "sot-location-call" : "sot-alarm-push"));

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        icon,
        badge: icon,
        tag,
        data: { url, kind: locationCall ? "location-call" : "alarm" },
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: locationCall ? CALL_VIBRATE : [180, 80, 180],
        actions: locationCall
          ? [
              { action: "enviar", title: "Enviar" },
              { action: "recusar", title: "Recusar" },
            ]
          : undefined,
      });

      if (!locationCall) return;
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if (String(client.url).includes("material.html")) continue;
        client.postMessage({ type: "sot-location-call", url });
      }
    })(),
  );
});

function resolveAppUrl(url) {
  if (!url) return new URL("mobile.html#/saidas/administrativas", self.registration.scope).href;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) {
    const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, "");
    if (scopePath && !url.startsWith(scopePath + "/") && url !== scopePath) {
      return new URL(scopePath + url, self.location.origin).href;
    }
    return new URL(url, self.location.origin).href;
  }
  return new URL(url, self.registration.scope).href;
}

self.addEventListener("notificationclick", (event) => {
  const action = event.action || "open";
  const data = event.notification?.data || {};
  event.notification.close();
  const targetUrl = resolveAppUrl(data.url || "mobile.html#/saidas/administrativas");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (String(client.url).includes("material.html")) continue;
        if ("focus" in client) {
          client.postMessage({ type: "sot-location-call", action });
          if ("navigate" in client) client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
