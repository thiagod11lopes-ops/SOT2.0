import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "../lib/utils";

const MIN_READABLE_ZOOM = 0.76;

function supportsCssZoom(): boolean {
  if (typeof document === "undefined") return false;
  return "zoom" in document.documentElement.style;
}

type HomeViewportScaleProps = {
  children: ReactNode;
};

/**
 * Encaixa o conteúdo da página inicial na altura útil do `main` (evita scroll da janela).
 * Chromium: `zoom` no conteúdo. Firefox: `transform: scale` + wrapper com altura escalada.
 */
export function HomeViewportScale({ children }: HomeViewportScaleProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const zoomMode = supportsCssZoom();

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!outer || !clip || !inner) return;

    const apply = () => {
      const avail = outer.clientHeight;
      if (avail <= 8) return;

      if (zoomMode) {
        const el = inner as HTMLElement & { style: CSSStyleDeclaration & { zoom?: string } };
        el.style.zoom = "1";
        void inner.offsetHeight;
        const natural = inner.scrollHeight;
        if (natural <= 0) return;

        let z = Math.min(1, avail / natural);
        if (z < MIN_READABLE_ZOOM) z = MIN_READABLE_ZOOM;
        el.style.zoom = String(z);
        void inner.offsetHeight;

        outer.style.overflowY = inner.scrollHeight > avail + 2 ? "auto" : "hidden";
        outer.style.overflowX = "hidden";
        clip.style.height = "";
        clip.style.overflow = "";
        inner.style.transform = "";
        inner.style.willChange = "";
        return;
      }

      inner.style.transform = "none";
      inner.style.willChange = "";
      void inner.offsetHeight;
      const natural = inner.scrollHeight;
      if (natural <= 0) return;

      let s = Math.min(1, avail / natural);
      if (s < MIN_READABLE_ZOOM) s = MIN_READABLE_ZOOM;

      const clipH = natural * s;
      clip.style.height = `${clipH}px`;
      clip.style.overflow = "hidden";
      inner.style.transform = `scale(${s})`;
      inner.style.transformOrigin = "top center";
      inner.style.willChange = "transform";

      outer.style.overflowY = natural * s > avail + 2 ? "auto" : "hidden";
      outer.style.overflowX = "hidden";
    };

    apply();

    const ro = new ResizeObserver(() => apply());
    ro.observe(outer);
    ro.observe(inner);
    window.addEventListener("resize", apply);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      vv?.removeEventListener("resize", apply);
      inner.style.transform = "";
      inner.style.willChange = "";
      clip.style.height = "";
      clip.style.overflow = "";
      if (zoomMode) {
        (inner as HTMLElement & { style: { zoom?: string } }).style.zoom = "";
      }
      outer.style.overflowY = "";
      outer.style.overflowX = "";
    };
  }, []);

  return (
    <div ref={outerRef} className={cn("flex min-h-0 w-full flex-1 flex-col")}>
      <div
        ref={clipRef}
        className={cn("w-full shrink-0", !zoomMode && "relative overflow-hidden")}
      >
        <div ref={innerRef} className="w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
