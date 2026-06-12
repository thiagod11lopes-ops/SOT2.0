import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, TriangleAlert } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type CloudSyncIndicatorProps = {
  compact?: boolean;
  /** Integrado ao painel compacto do cabeçalho mobile (legado). */
  variant?: "default" | "mobileStatus" | "iconOnly";
  className?: string;
};

export function CloudSyncIndicator({
  compact = false,
  variant = "default",
  className,
}: CloudSyncIndicatorProps) {
  const { cloudDeparturesSync, forceCloudResync } = useDepartures();
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const view = useMemo(() => {
    if (!cloudDeparturesSync.enabled) {
      return {
        label: "Local",
        detail: "Firebase desativado",
        icon: CloudOff,
        tone: "muted" as const,
        className:
          "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 text-[hsl(var(--muted-foreground))]",
      };
    }
    if (!isOnline) {
      return {
        label: "Offline",
        detail: "Sem internet",
        icon: CloudOff,
        tone: "offline" as const,
        className:
          "border-amber-500/30 bg-amber-500/12 text-amber-200",
      };
    }
    if (cloudDeparturesSync.status === "error") {
      return {
        label: "Erro nuvem",
        detail: cloudDeparturesSync.message || "Falha na sincronização",
        icon: TriangleAlert,
        tone: "error" as const,
        className:
          "border-red-500/35 bg-red-500/12 text-red-200",
      };
    }
    if (cloudDeparturesSync.status === "connecting") {
      return {
        label: "Sincronizando",
        detail: "Ligando ao Firebase",
        icon: Cloud,
        tone: "syncing" as const,
        className:
          "border-sky-500/30 bg-sky-500/12 text-sky-300",
      };
    }
    return {
      label: "Nuvem ativa",
      detail: "Firestore (lista de saídas)",
      icon: Cloud,
      tone: "synced" as const,
      className:
        "border-emerald-800/70 bg-emerald-900/95 text-emerald-50 shadow-sm dark:border-emerald-950/80 dark:bg-emerald-950 dark:text-emerald-100",
    };
  }, [cloudDeparturesSync, isOnline]);

  const lastSyncText =
    typeof cloudDeparturesSync.lastSyncAt === "number"
      ? new Date(cloudDeparturesSync.lastSyncAt).toLocaleString("pt-BR")
      : "ainda não sincronizado";
  const lastErrorText =
    typeof cloudDeparturesSync.lastErrorAt === "number"
      ? new Date(cloudDeparturesSync.lastErrorAt).toLocaleString("pt-BR")
      : "-";

  const Icon = view.icon;
  const isMobileStatus = variant === "mobileStatus";
  const isIconOnly = variant === "iconOnly";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            isIconOnly
              ? cn(
                  "saidas-mobile-cloud-sync-btn",
                  `saidas-mobile-cloud-sync-btn--${view.tone}`,
                )
              : isMobileStatus
                ? cn(
                    "saidas-mobile-header-status-sync-trigger",
                    `saidas-mobile-header-status-sync-trigger--${view.tone === "synced" ? "active" : view.tone === "syncing" ? "syncing" : view.tone === "offline" ? "warning" : view.tone}`,
                  )
                : "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold",
            !isIconOnly && !isMobileStatus && view.className,
            className,
          )}
          title={view.detail}
          aria-label={`Sincronização: ${view.label}`}
          aria-live="polite"
        >
          {isIconOnly ? (
            <Icon
              className={cn(
                "h-[1.15rem] w-[1.15rem]",
                view.tone === "syncing" && "saidas-mobile-cloud-sync-btn-icon--pulse",
              )}
              aria-hidden
            />
          ) : isMobileStatus ? (
            <>
              <span className="saidas-mobile-header-status-sync-dot" aria-hidden />
              <Icon className={cn("saidas-mobile-header-status-sync-icon", view.label === "Sincronizando" && "animate-spin")} />
              <span className="saidas-mobile-header-status-sync-label">Sync</span>
              <span className="saidas-mobile-header-status-sync-value">{view.label}</span>
            </>
          ) : (
            <>
              <Icon className={cn("h-3.5 w-3.5", view.label === "Sincronizando" && "animate-spin")} />
              <span>{compact ? view.label : `${view.label} - ${view.detail}`}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-[hsl(var(--foreground))]">Diagnostico de sincronizacao</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Status atual: <span className="font-semibold text-[hsl(var(--foreground))]">{view.label}</span>
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Ultima sincronizacao: <span className="text-[hsl(var(--foreground))]">{lastSyncText}</span>
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Ultimo erro: <span className="text-[hsl(var(--foreground))]">{lastErrorText}</span>
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Conflitos hoje:{" "}
            <span className="text-[hsl(var(--foreground))]">
              {cloudDeparturesSync.conflictCountToday ?? 0}
            </span>
          </p>
          {cloudDeparturesSync.message ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-200">
              {cloudDeparturesSync.message}
            </p>
          ) : null}
          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={forceCloudResync}
              disabled={!cloudDeparturesSync.enabled}
            >
              Forcar ressincronizacao
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
