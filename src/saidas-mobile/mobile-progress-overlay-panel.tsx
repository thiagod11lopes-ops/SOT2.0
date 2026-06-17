import { createPortal } from "react-dom";
import { Cloud } from "lucide-react";
import { cn } from "../lib/utils";
import { clampMobileProgress } from "./mobileProgressUtils";

type MobileProgressOverlayPanelProps = {
  progress: number;
  label: string;
  /** Texto pequeno acima do título (ex.: «Sincronização», «Detalhe de Serviço»). */
  subtitle?: string;
  className?: string;
  /** Por defeito renderiza em `document.body` para cobrir todo o ecrã. */
  portal?: boolean;
};

/** Overlay central com % e fundo desfocado — partilhado pelo sistema. */
export function MobileProgressOverlayPanel({
  progress,
  label,
  subtitle = "Firebase",
  className,
  portal = true,
}: MobileProgressOverlayPanelProps) {
  const pct = clampMobileProgress(progress);

  const panel = (
    <div
      className={cn(
        "firebase-sync-overlay fixed inset-0 z-[980] flex items-center justify-center",
        "bg-[hsl(222_47%_4%/0.62)] backdrop-blur-xl",
        className,
      )}
      role="presentation"
      aria-hidden={false}
    >
      <div className="firebase-sync-overlay-orb firebase-sync-overlay-orb--a" aria-hidden />
      <div className="firebase-sync-overlay-orb firebase-sync-overlay-orb--b" aria-hidden />

      <div
        className="firebase-sync-overlay-card relative w-[min(92vw,24rem)] overflow-hidden rounded-[1.5rem] border border-white/15 bg-[hsl(var(--card)/0.92)] px-5 py-5 shadow-[0_32px_100px_-24px_hsl(222_47%_2%/0.9)] backdrop-blur-2xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.14)] via-transparent to-cyan-400/10" aria-hidden />
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[hsl(var(--primary)/0.2)] blur-3xl" aria-hidden />

        <div className="relative mb-5 flex items-center gap-3">
          <div className="firebase-sync-overlay-ring relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.12)]">
            <div className="firebase-sync-overlay-spinner absolute inset-0 rounded-2xl border-2 border-transparent border-t-cyan-400 border-r-[hsl(var(--primary))]" aria-hidden />
            <Cloud className="relative h-5 w-5 text-[hsl(var(--primary))]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
              {subtitle}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[hsl(var(--foreground))]">{label}</p>
          </div>
          <p className="shrink-0 text-2xl font-bold tabular-nums leading-none text-[hsl(var(--foreground))]">
            {pct}
            <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">%</span>
          </p>
        </div>

        <div
          className="firebase-sync-overlay-track relative h-2.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]/50"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={label}
        >
          <div
            className="firebase-sync-overlay-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] via-sky-400 to-cyan-300 shadow-[0_0_22px_hsl(var(--primary)/0.45)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div className="mobile-sync-overlay-shimmer pointer-events-none absolute inset-0 rounded-full" aria-hidden />
        </div>

        <p className="relative mt-3 text-center text-[0.65rem] font-medium tracking-wide text-[hsl(var(--muted-foreground))]">
          A preparar dados na nuvem…
        </p>
      </div>
    </div>
  );

  if (portal && typeof document !== "undefined") {
    return createPortal(panel, document.body);
  }
  return panel;
}
