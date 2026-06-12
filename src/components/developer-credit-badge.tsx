import { cn } from "../lib/utils";

/**
 * Crédito fixo no desktop — `bottom` respeita `--sot-home-ticker-offset` (telão de avisos na home).
 */
export function DeveloperCreditBadge() {
  return (
    <div
      className="pointer-events-none fixed right-4 z-[110] max-w-[min(calc(100vw-2rem),26rem)] select-none"
      style={{ bottom: "calc(var(--sot-home-ticker-offset, 0px) + 0.75rem)" }}
    >
      <div
        className={cn(
          "group pointer-events-auto relative overflow-hidden rounded-2xl",
          "border border-[hsl(var(--border))]/50 bg-[hsl(var(--background))]/45",
          "px-3.5 py-2 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]",
          "backdrop-blur-xl backdrop-saturate-150",
          "transition-all duration-300 ease-out",
          "hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--background))]/72",
          "hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1)]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/12 via-transparent to-[hsl(var(--primary))]/5 opacity-60 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-[hsl(var(--primary))]/10 blur-2xl transition-all duration-500 group-hover:bg-[hsl(var(--primary))]/20"
          aria-hidden
        />
        <p className="relative text-right text-[10px] leading-snug tracking-wide text-[hsl(var(--muted-foreground))]/80 transition-colors duration-300 group-hover:text-[hsl(var(--foreground))]/90 sm:text-[11px]">
          <span className="mb-0.5 flex items-center justify-end gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))] shadow-[0_0_10px_hsl(var(--primary)/0.65)]"
              aria-hidden
            />
            <span className="font-semibold uppercase tracking-[0.16em] text-[hsl(var(--primary))]/90">
              Desenvolvido por
            </span>
          </span>
          <span className="mt-0.5 block font-medium text-[hsl(var(--foreground))]/88 sm:text-xs">
            1º SG EF Thiago Lopes de Oliveira
          </span>
        </p>
      </div>
    </div>
  );
}
