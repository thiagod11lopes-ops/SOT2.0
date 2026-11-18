import { createPortal } from "react-dom";
import { MapPinned, Navigation } from "lucide-react";
import { Button } from "../components/ui/button";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { cn } from "../lib/utils";

type NavigationOfferModalProps = {
  destinoLabel: string;
  onAccept: () => void;
  onDecline: () => void;
};

/** Oferece navegação no mapa interno do SOT após o «Boa viagem». */
export function NavigationOfferModal({ destinoLabel, onAccept, onDecline }: NavigationOfferModalProps) {
  return createPortal(
    <div
      className={cn(MOBILE_MODAL_OVERLAY_CLASS, "z-[585] items-center justify-center pt-8")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sot-nav-offer-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDecline();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]">
            <Navigation className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="sot-nav-offer-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
              Abrir navegação?
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Use o mapa do SOT para seguir a rota. Assim o app fica aberto e a localização continua a ser enviada.
            </p>
          </div>
        </div>

        {destinoLabel ? (
          <div className="mt-4 flex gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 p-3">
            <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Destino
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[hsl(var(--foreground))]">{destinoLabel}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
            Pode definir o destino na barra de endereço do mapa.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={onDecline}>
            Agora não
          </Button>
          <Button type="button" className="min-h-11 rounded-xl font-semibold" onClick={onAccept}>
            Aceitar e navegar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
