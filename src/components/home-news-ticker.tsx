import { useMemo } from "react";
import { useAvisos } from "../context/avisos-context";
import { HOME_AVISOS_GERAIS_SEP, joinMarqueeAvisosGeraisLinhas } from "../lib/buildHomeTickerSegments";
import { cn } from "../lib/utils";

/**
 * Faixa fixa inferior na página inicial: **Aviso principal** (se preenchido) + **Avisos gerais** do dia.
 * Invisível quando ambos estão vazios.
 */
export function HomeNewsTicker() {
  const { avisoPrincipal, avisosGeraisLinhas } = useAvisos();

  const homeMarqueeLinhas = useMemo(() => {
    const p = avisoPrincipal.trim();
    const g = avisosGeraisLinhas;
    if (!p) return g;
    if (g.length === 0) return [p];
    return [p, ...g];
  }, [avisoPrincipal, avisosGeraisLinhas]);

  const marqueeText = useMemo(
    () => joinMarqueeAvisosGeraisLinhas(homeMarqueeLinhas),
    [homeMarqueeLinhas],
  );

  /** Duas cópias para o loop CSS (`translateX`) parecer contínuo. */
  const marqueeLoopText = useMemo(
    () => `${marqueeText}${HOME_AVISOS_GERAIS_SEP}${marqueeText}`,
    [marqueeText],
  );

  const marqueeDurationSec = useMemo(
    () => Math.min(100, Math.max(28, Math.round(marqueeText.length * 0.055))),
    [marqueeText],
  );

  if (homeMarqueeLinhas.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] w-full min-w-0 shadow-[0_-8px_40px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-auto w-full min-w-0 border-t border-slate-600/80">
        <div className={cn("flex w-full min-w-0 items-stretch", "min-h-[3rem]")}>
          {/* Frame à esquerda — brasão em public/brasao.ico (BASE_URL para GitHub Pages) */}
          <div
            className={cn(
              "flex w-[3.5rem] shrink-0 flex-col items-center justify-center border-r border-[hsl(var(--border))]/60 bg-[hsl(var(--primary))] px-1.5 py-1.5 shadow-[inset_0_1px_0_hsla(0,0%,100%,0.14)] sm:w-16 sm:px-2 sm:py-2",
            )}
          >
            <img
              src={`${import.meta.env.BASE_URL}brasao.ico`}
              alt=""
              aria-hidden
              className="h-[2.25rem] w-[2.25rem] max-h-full max-w-full object-contain sm:h-[2.75rem] sm:w-[2.75rem]"
              loading="lazy"
              decoding="async"
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-[2.75rem] flex-1 items-center bg-gradient-to-b from-[#0f172a] via-[#0c1322] to-[#020617] sm:min-h-[2.75rem]">
              <div className="home-marquee-viewport relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="flex h-full min-h-[2.75rem] items-center overflow-hidden">
                  <div
                    className="home-marquee-track flex w-max max-w-none items-center"
                    style={{ animationDuration: `${marqueeDurationSec}s` }}
                  >
                    <span className="inline-block shrink-0 px-5 py-1.5 text-xs font-medium leading-snug text-slate-100 md:text-[13px]">
                      {marqueeLoopText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
