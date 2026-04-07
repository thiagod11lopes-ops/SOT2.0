import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type CloudSyncIndicatorProps = {
  compact?: boolean;
};

export function CloudSyncIndicator({ compact = false }: CloudSyncIndicatorProps) {
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
        className:
          "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 text-[hsl(var(--muted-foreground))]",
      };
    }
    if (!isOnline) {
      return {
        label: "Offline",
        detail: "Sem internet",
        icon: CloudOff,
        className:
          "border-amber-500/30 bg-amber-500/12 text-amber-200",
      };
    }
    if (cloudDeparturesSync.status === "error") {
      return {
        label: "Erro nuvem",
        detail: cloudDeparturesSync.message || "Falha na sincronização",
        icon: TriangleAlert,
        className:
          "border-red-500/35 bg-red-500/12 text-red-200",
      };
    }
    if (cloudDeparturesSync.status === "connecting") {
      return {
        label: "Sincronizando",
        detail: "Ligando ao Firebase",
        icon: RefreshCw,
        className:
          "border-blue-500/30 bg-blue-500/12 text-blue-200",
      };
    }
    return {
      label: "Nuvem ativa",
      detail: "Firestore online",
      icon: Cloud,
      className:
        "border-emerald-500/30 bg-emerald-500/12 text-emerald-200",
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold",
            view.className,
          )}
          title={view.detail}
          aria-live="polite"
        >
          <Icon className={cn("h-3.5 w-3.5", view.label === "Sincronizando" && "animate-spin")} />
          <span>{compact ? view.label : `${view.label} - ${view.detail}`}</span>
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
