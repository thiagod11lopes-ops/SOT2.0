import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

export function clampMobileProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

type MobileProgressOverlayPanelProps = {
  progress: number;
  label: string;
  /** Texto pequeno acima do título (ex.: «Sincronização», «Detalhe de Serviço»). */
  subtitle?: string;
  className?: string;
  /** Por defeito renderiza em `document.body` para cobrir todo o ecrã. */
  portal?: boolean;
};

/** Overlay central com % e fundo desfocado — partilhado pelo sistema mobile. */
export function MobileProgressOverlayPanel({
  progress,
  label,
  subtitle = "Sincronização",
  className,
  portal = true,
}: MobileProgressOverlayPanelProps) {
  const pct = clampMobileProgress(progress);

  const panel = (
    <div
      className={cn(
        "mobile-sync-overlay fixed inset-0 flex items-center justify-center bg-[hsl(222_47%_4%/0.38)] backdrop-blur-md",
        className ?? "z-[980]",
      )}
      role="presentation"
      aria-hidden={false}
    >
      <div
        className="mobile-sync-overlay-card w-[min(92vw,22rem)] rounded-[1.35rem] border border-white/10 bg-[hsl(var(--card)/0.88)] px-5 py-5 shadow-[0_24px_80px_-20px_hsl(222_47%_2%/0.85)] backdrop-blur-2xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label}
      >
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              {subtitle}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[hsl(var(--foreground))]">{label}</p>
          </div>
          <p className="shrink-0 text-2xl font-bold tabular-nums leading-none text-[hsl(var(--foreground))]">
            {pct}
            <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">%</span>
          </p>
        </div>

        <div
          className="mobile-sync-overlay-track relative h-2.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]/55"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={label}
        >
          <div
            className="mobile-sync-overlay-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-cyan-300 shadow-[0_0_18px_hsl(152_72%_48%/0.45)] transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div className="mobile-sync-overlay-shimmer pointer-events-none absolute inset-0 rounded-full" aria-hidden />
        </div>
      </div>
    </div>
  );

  if (portal && typeof document !== "undefined") {
    return createPortal(panel, document.body);
  }
  return panel;
}
