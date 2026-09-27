import { useEffect, useState, type ReactNode } from "react";
import { MobileLoadingOverlayHost, MobileLoadingOverlayProvider } from "../saidas-mobile/mobile-loading-overlay";
import { useMobileLoadingOverlay } from "../saidas-mobile/mobile-loading-context";
import { isMaterialControleAddress } from "../lib/materialControleRoute";
import { cn } from "../lib/utils";
import { SystemFirebaseSyncBridge } from "./system-firebase-sync-bridge";

function useMaterialControleAddress(): boolean {
  const [active, setActive] = useState(isMaterialControleAddress);
  useEffect(() => {
    const sync = () => setActive(isMaterialControleAddress());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return active;
}

function AppFirebaseLoadingContent({ children }: { children: ReactNode }) {
  const { overlayActive } = useMobileLoadingOverlay();
  const materialAddress = useMaterialControleAddress();

  return (
    <div
      className={cn(
        "sot-app-root min-h-dvh w-full",
        overlayActive && !materialAddress && "sot-app-root--firebase-loading",
      )}
      aria-busy={overlayActive && !materialAddress}
    >
      {children}
    </div>
  );
}

/** Provider global: overlay opaco + modal de progresso durante carga/sincronização Firebase. */
export function AppFirebaseLoadingShell({ children }: { children: ReactNode }) {
  return (
    <MobileLoadingOverlayProvider>
      <SystemFirebaseSyncBridge />
      <AppFirebaseLoadingContent>{children}</AppFirebaseLoadingContent>
      <MobileLoadingOverlayHost />
    </MobileLoadingOverlayProvider>
  );
}
