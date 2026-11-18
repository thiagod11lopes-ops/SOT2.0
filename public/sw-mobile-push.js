self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();
  const title = String(payload.title || "SOT 2.0 - Alarme");
  const body = String(payload.body || "Você possui um novo alerta.");
  const url = resolveAppUrl(String(payload.url || "mobile.html#/saidas/administrativas"));
  const locationCall = payload.kind === "location-call";
  const icon = new URL("icons.svg", self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      tag: String(payload.tag || "sot-alarm-push"),
      data: { url },
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: locationCall ? [300, 120, 300, 120, 300, 400, 300, 120, 300] : [180, 80, 180],
    }),
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
  event.notification.close();
  const targetUrl = resolveAppUrl(event.notification?.data?.url || "mobile.html#/saidas/administrativas");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (String(client.url).includes("material.html")) continue;
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
