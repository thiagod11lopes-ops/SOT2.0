import { useMemo } from "react";
import { useAvisos } from "../context/avisos-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useLimpezaPendente } from "../context/limpeza-pendente-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import type { TrocaOleoRegistro } from "../lib/oilMaintenance";
import { buildHomeTickerSegments, joinTickerSegments } from "../lib/buildHomeTickerSegments";
import { cn } from "../lib/utils";

/** Faixa fixa inferior na página inicial: aviso opcional + telão estilo TV. */
export function HomeNewsTicker({ mapaOleo }: { mapaOleo: Record<string, TrocaOleoRegistro> }) {
  const { departures } = useDepartures();
  const { items } = useCatalogItems();
  const { placas: placasLimpeza } = useLimpezaPendente();
  const { mapaOficina } = useOficinaVisitas();
  const { avisoPrincipal, fainasLinhas, avisosGeraisLinhas } = useAvisos();

  const marqueeText = useMemo(() => {
    const segments = buildHomeTickerSegments({
      mapaOficina,
      departures,
      mapaOleo,
      viaturasAdministrativas: items.viaturasAdministrativas,
      ambulancias: items.ambulancias,
      placasLimpeza,
      fainasLinhas,
      avisosGeraisLinhas,
    });
    return joinTickerSegments(segments);
  }, [
    mapaOficina,
    departures,
    mapaOleo,
    items.viaturasAdministrativas,
    items.ambulancias,
    placasLimpeza,
    fainasLinhas,
    avisosGeraisLinhas,
  ]);

  const showBreaking = Boolean(avisoPrincipal.trim());

  const marqueeDurationSec = useMemo(
    () => Math.min(100, Math.max(28, Math.round(marqueeText.length * 0.055))),
    [marqueeText],
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] w-full min-w-0 shadow-[0_-8px_40px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-auto w-full min-w-0 border-t border-slate-600/80">
        <div
          className={cn(
            "flex w-full min-w-0 items-stretch",
            showBreaking ? "min-h-[5rem]" : "min-h-[3rem]",
          )}
        >
          {/* Frame à esquerda — brasão em public/brasao.ico (BASE_URL para GitHub Pages) */}
          <div
            className={cn(
              "flex shrink-0 flex-col items-center justify-center border-r border-[hsl(var(--border))]/60 bg-[hsl(var(--primary))] shadow-[inset_0_1px_0_hsla(0,0%,100%,0.14)]",
              showBreaking
                ? "w-[6.5rem] px-2 py-2 sm:w-32 sm:px-3 sm:py-3"
                : "w-[3.5rem] px-1.5 py-1.5 sm:w-16 sm:px-2 sm:py-2",
            )}
          >
            <img
              src={`${import.meta.env.BASE_URL}brasao.ico`}
              alt=""
              aria-hidden
              className={cn(
                "max-h-full max-w-full object-contain",
                showBreaking
                  ? "h-[4.5rem] w-[4.5rem] sm:h-[5.5rem] sm:w-[5.5rem]"
                  : "h-[2.25rem] w-[2.25rem] sm:h-[2.75rem] sm:w-[2.75rem]",
              )}
              loading="lazy"
              decoding="async"
            />
          </div>

          <div className="flex min-w-0 min-h-0 flex-1 flex-col">
            {showBreaking ? (
              <div
                className="border-b border-amber-500/35 bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 px-4 py-3 sm:py-4"
                role="status"
              >
                <p className="text-left text-[26px] font-semibold leading-snug tracking-wide text-white md:text-[28px]">
                  {avisoPrincipal.trim()}
                </p>
              </div>
            ) : null}

            <div className="flex min-h-[2.75rem] flex-1 items-center bg-gradient-to-b from-[#0f172a] via-[#0c1322] to-[#020617] sm:min-h-[2.75rem]">
              <div className="home-marquee-viewport relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="flex h-full min-h-[2.75rem] items-center overflow-hidden">
                  <div
                    className="home-marquee-track flex w-max max-w-none items-center"
                    style={{ animationDuration: `${marqueeDurationSec}s` }}
                  >
                    <span className="inline-block shrink-0 px-5 py-1.5 text-xs font-medium leading-snug text-slate-100 md:text-[13px]">
                      {marqueeText}
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
