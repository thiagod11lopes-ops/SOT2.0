import { type ReactNode } from "react";
import { MobileLoadingOverlayHost, MobileLoadingOverlayProvider } from "../saidas-mobile/mobile-loading-overlay";
import { useMobileLoadingOverlay } from "../saidas-mobile/mobile-loading-context";
import { cn } from "../lib/utils";
import { SystemFirebaseSyncBridge } from "./system-firebase-sync-bridge";

function AppFirebaseLoadingContent({ children }: { children: ReactNode }) {
  const { overlayActive } = useMobileLoadingOverlay();

  return (
    <div
      className={cn(
        "sot-app-root min-h-dvh w-full",
        overlayActive && "sot-app-root--firebase-loading",
      )}
      aria-busy={overlayActive}
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
