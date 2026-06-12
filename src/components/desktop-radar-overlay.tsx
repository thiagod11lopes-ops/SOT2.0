import { Ambulance } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppearance } from "../context/appearance-context";
import {
  createRandomRadarBlips,
  isHitByBrightSweepLine,
  sweepAngleAtTime,
  type RadarBlip,
} from "../lib/radarOverlay";
import { cn } from "../lib/utils";

/**
 * Efeito de varredura estilo radar — visível apenas no tema «Radar».
 * z-[94]: sobre o fundo, abaixo do brasão (95) e da UI interativa.
 */
export function DesktopRadarOverlay() {
  const { appearance } = useAppearance();
  const blips = useMemo(() => (appearance === "radar" ? createRandomRadarBlips() : []), [appearance]);
  const [pingingIds, setPingingIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (appearance !== "radar" || blips.length === 0) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    let frame = 0;
    const wasInSweep: Record<string, boolean> = {};

    const tick = () => {
      const sweep = sweepAngleAtTime(performance.now());

      for (const blip of blips) {
        const onBrightLine = isHitByBrightSweepLine(sweep, blip.angleDeg);
        const was = wasInSweep[blip.id] ?? false;

        if (onBrightLine && !was && Math.random() < blip.detectChance) {
          setPingingIds((prev) => {
            const next = new Set(prev);
            next.add(blip.id);
            return next;
          });
          window.setTimeout(() => {
            setPingingIds((prev) => {
              if (!prev.has(blip.id)) return prev;
              const next = new Set(prev);
              next.delete(blip.id);
              return next;
            });
          }, 480 + Math.random() * 320);
        }

        wasInSweep[blip.id] = onBrightLine;
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [appearance, blips]);

  if (appearance !== "radar") return null;

  return (
    <div className="sot-radar-overlay pointer-events-none fixed inset-0 z-[94] overflow-hidden" aria-hidden>
      <div className="sot-radar-grid" />
      <div className="sot-radar-rings" />
      <div className="sot-radar-sweep" />
      <div className="sot-radar-sweep-trail" />
      <div className="sot-radar-blips">
        {blips.map((blip) => (
          <RadarBlipMarker key={blip.id} blip={blip} pinging={pingingIds.has(blip.id)} />
        ))}
      </div>
    </div>
  );
}

function RadarBlipMarker({ blip, pinging }: { blip: RadarBlip; pinging: boolean }) {
  return (
    <div
      className={cn("sot-radar-blip", pinging && "sot-radar-blip--ping")}
      style={{ left: `${blip.leftPct}%`, top: `${blip.topPct}%` }}
    >
      <Ambulance className="sot-radar-blip-icon" strokeWidth={2} aria-hidden />
      {pinging ? <span className="sot-radar-blip-ring" /> : null}
    </div>
  );
}
