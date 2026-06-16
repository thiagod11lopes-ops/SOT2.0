import { useEffect } from "react";

const SIAD_MANIFEST_HREF = "./siad-manifest.webmanifest";
const SIAD_THEME_COLOR = "#0c4a6e";
const SIAD_APPLE_TITLE = "Saídas SIAD";

function upsertMeta(name: string, content: string): HTMLMetaElement {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function upsertLink(rel: string, href: string): HTMLLinkElement {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

/**
 * Prepara a rota SIAD para uso como PWA em Android/iOS:
 * viewport fixo, manifest dedicado, theme-color e metas Apple.
 */
export function useSiadPwaShell(active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const html = document.documentElement;
    html.classList.add("siad-mobile-shell");

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const hadManifest = Boolean(manifestLink);
    const prevManifestHref = manifestLink?.getAttribute("href") ?? null;

    const link = manifestLink ?? document.createElement("link");
    if (!manifestLink) {
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = SIAD_MANIFEST_HREF;

    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const prevViewport = viewport?.getAttribute("content") ?? null;
    upsertMeta(
      "viewport",
      "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
    );

    const themeMeta = upsertMeta("theme-color", SIAD_THEME_COLOR);
    const prevTheme = themeMeta.getAttribute("content");

    const appleCapable = upsertMeta("apple-mobile-web-app-capable", "yes");
    const prevAppleCapable = appleCapable.getAttribute("content");

    const appleStatus = upsertMeta("apple-mobile-web-app-status-bar-style", "default");
    const prevAppleStatus = appleStatus.getAttribute("content");

    const appleTitle = upsertMeta("apple-mobile-web-app-title", SIAD_APPLE_TITLE);
    const prevAppleTitle = appleTitle.getAttribute("content");

    const appName = upsertMeta("application-name", SIAD_APPLE_TITLE);
    const prevAppName = appName.getAttribute("content");

    const mobileCapable = upsertMeta("mobile-web-app-capable", "yes");
    const prevMobileCapable = mobileCapable.getAttribute("content");

    upsertLink("apple-touch-icon", "./sot-pwa-icon.svg");

    return () => {
      html.classList.remove("siad-mobile-shell");

      if (hadManifest && manifestLink && prevManifestHref) {
        manifestLink.href = prevManifestHref;
      } else if (!hadManifest && link.parentNode) {
        link.parentNode.removeChild(link);
      }

      if (viewport && prevViewport) viewport.setAttribute("content", prevViewport);
      if (prevTheme) themeMeta.setAttribute("content", prevTheme);
      if (prevAppleCapable) appleCapable.setAttribute("content", prevAppleCapable);
      if (prevAppleStatus) appleStatus.setAttribute("content", prevAppleStatus);
      if (prevAppleTitle) appleTitle.setAttribute("content", prevAppleTitle);
      if (prevAppName) appName.setAttribute("content", prevAppName);
      if (prevMobileCapable) mobileCapable.setAttribute("content", prevMobileCapable);
    };
  }, [active]);
}
