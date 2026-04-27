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
  const url = String(payload.url || "/mobile.html#/saidas/administrativas");
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons.svg",
      badge: "/icons.svg",
      tag: String(payload.tag || "sot-alarm-push"),
      data: { url },
      renotify: true,
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/mobile.html#/saidas/administrativas";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
