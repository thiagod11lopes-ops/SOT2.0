self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Padrão de vibração estilo chamada telefónica (Android < 8; em 8+ o canal do site manda). */
const CALL_VIBRATE = [500, 200, 500, 200, 500, 200, 500, 800, 500, 200, 500, 200, 500, 1200];

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

function buildCallUrl(baseUrl, action) {
  const resolved = resolveAppUrl(baseUrl || "mobile.html#/saidas/administrativas");
  try {
    const u = new URL(resolved);
    const hash = u.hash || "#/saidas/administrativas";
    const [pathPart, queryPart = ""] = hash.replace(/^#/, "").split("?");
    const params = new URLSearchParams(queryPart);
    params.set("sotCall", "1");
    if (action) params.set("sotCallAction", action);
    u.hash = `#${pathPart}?${params.toString()}`;
    return u.href;
  } catch {
    return resolved;
  }
}

async function focusOrOpenCall(targetUrl, action) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if (String(client.url).includes("material.html")) continue;
    try {
      client.postMessage({ type: "sot-location-call", action: action || "open" });
    } catch {
      /* ignore */
    }
    if ("focus" in client) {
      try {
        if ("navigate" in client) await client.navigate(targetUrl);
      } catch {
        /* ignore */
      }
      return client.focus();
    }
  }
  return self.clients.openWindow(targetUrl);
}

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
    payload.body ||
      (locationCall
        ? "Toque para atender e enviar a localização"
        : "Você possui um novo alerta."),
  );
  const baseUrl = String(payload.url || "mobile.html#/saidas/administrativas");
  const callUrl = buildCallUrl(baseUrl, "open");
  const icon = new URL("icon-192.png", self.registration.scope).href;
  const badge = new URL("badge-96.png", self.registration.scope).href;
  const tag = String(payload.tag || (locationCall ? "sot-location-call" : "sot-alarm-push"));
  const placa = String(payload.placa || "");
  const pedidoId = String(payload.id || "");

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        icon,
        badge,
        tag,
        data: {
          url: callUrl,
          kind: locationCall ? "location-call" : "alarm",
          placa,
          id: pedidoId,
        },
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: Date.now(),
        vibrate: locationCall ? CALL_VIBRATE : [180, 80, 180],
        actions: locationCall
          ? [
              { action: "enviar", title: "Atender / Enviar" },
              { action: "recusar", title: "Recusar" },
            ]
          : undefined,
      });

      if (!locationCall) return;

      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if (String(client.url).includes("material.html")) continue;
        try {
          client.postMessage({ type: "sot-location-call", action: "ring" });
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const action = event.action || "open";
  const data = event.notification?.data || {};
  event.notification.close();
  const kind = String(data.kind || "");
  const base = String(data.url || "mobile.html#/saidas/administrativas");
  const targetUrl =
    kind === "location-call" ? buildCallUrl(base, action === "enviar" ? "enviar" : action) : resolveAppUrl(base);

  event.waitUntil(
    (async () => {
      if (kind === "location-call" && action === "recusar") {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clients) {
          if (String(client.url).includes("material.html")) continue;
          try {
            client.postMessage({ type: "sot-location-call", action: "recusar" });
          } catch {
            /* ignore */
          }
        }
      }
      await focusOrOpenCall(targetUrl, action === "enviar" ? "enviar" : action === "recusar" ? "recusar" : "open");
    })(),
  );
});
