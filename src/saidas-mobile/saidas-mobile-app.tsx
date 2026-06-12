import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { subscribeMobileDriverTrackingConfig } from "../lib/mobileDriverTracking";
import { ensureMobilePushServiceWorkerRegistered } from "../lib/mobilePushNotifications";
import { cn } from "../lib/utils";
import { SaidasLayout } from "./saidas-layout";
import { SaidasMobileFilterDateProvider } from "./saidas-mobile-filter-date-context";
import { SaidasPage } from "./saidas-page";
import { MobileLoadingOverlayHost, MobileLoadingOverlayProvider } from "./mobile-loading-overlay";
import { useMobileLoadingOverlay } from "./mobile-loading-context";
import { MobileSystemSyncBridge } from "./mobile-system-sync-bridge";

function SaidasMobileRoutes() {
  const { overlayActive } = useMobileLoadingOverlay();

  return (
    <div
      className={cn(
        "saidas-mobile-scope flex h-full min-h-0 w-full flex-col text-[hsl(var(--foreground))]",
        overlayActive && "saidas-mobile-scope--sync-blur",
      )}
    >
      <HashRouter>
        <SaidasMobileFilterDateProvider>
          <Routes>
            <Route path="/saidas" element={<SaidasLayout />}>
              <Route index element={<Navigate to="administrativas" replace />} />
              <Route path="administrativas" element={<SaidasPage tipo="Administrativa" />} />
              <Route path="ambulancia" element={<SaidasPage tipo="Ambulância" />} />
            </Route>
            <Route path="*" element={<Navigate to="/saidas/administrativas" replace />} />
          </Routes>
        </SaidasMobileFilterDateProvider>
      </HashRouter>
    </div>
  );
}

/** Vista mobile das saídas — mesmo IndexedDB que o resto do SOT (usa HashRouter: #/saidas/...). */
export function SaidasMobileApp() {
  useEffect(() => subscribeMobileDriverTrackingConfig(), []);
  useEffect(() => {
    /** Garante que o SW (definido em public/sw-mobile-push.js) é registado mesmo sem push subscription, para que o navegador trate este shell como PWA instalável. */
    void ensureMobilePushServiceWorkerRegistered();
  }, []);
  useEffect(() => {
    /** iOS/Safari: ao voltar ao ecrã, volta a pedir actualização do SW e evita ficar preso a assets antigos quando o servidor já tem build novo. */
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      void ensureMobilePushServiceWorkerRegistered();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("pageshow", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("pageshow", onForeground);
    };
  }, []);

  return (
    <MobileLoadingOverlayProvider>
      <MobileSystemSyncBridge />
      <SaidasMobileRoutes />
      <MobileLoadingOverlayHost />
    </MobileLoadingOverlayProvider>
  );
}
