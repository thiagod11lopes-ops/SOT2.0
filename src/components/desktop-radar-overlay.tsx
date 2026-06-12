import { useAppearance } from "../context/appearance-context";

/**
 * Efeito de varredura estilo radar — visível apenas no tema «Radar».
 * z-[94]: sobre o fundo, abaixo do brasão (95) e da UI interativa.
 */
export function DesktopRadarOverlay() {
  const { appearance } = useAppearance();
  if (appearance !== "radar") return null;

  return (
    <div className="sot-radar-overlay pointer-events-none fixed inset-0 z-[94] overflow-hidden" aria-hidden>
      <div className="sot-radar-grid" />
      <div className="sot-radar-rings" />
      <div className="sot-radar-sweep" />
      <div className="sot-radar-sweep-trail" />
    </div>
  );
}
