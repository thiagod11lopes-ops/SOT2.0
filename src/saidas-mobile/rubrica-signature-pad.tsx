import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../lib/utils";

export type RubricaSignaturePadHandle = {
  /** PNG em data URL, ou string vazia se não houver traço (sem nome obrigatório). Com nome, exporta sempre o PNG (área + linha + nome). */
  getDataUrl: () => string;
  /** Limpa o desenho. */
  clearPad: () => void;
};

type Props = {
  /** Ao reabrir o modal, repõe um desenho já guardado (PNG). */
  initialDataUrl?: string | null;
  className?: string;
  /**
   * Nome do motorista impresso abaixo de uma linha — espaço livre por cima para o traço da rubrica.
   * O PNG gravado inclui desenho + linha + nome.
   */
  motoristaLabel?: string | null;
};

function drawFooterBand(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  zoneTopPx: number,
  zoneHeightPx: number,
  nome: string,
  dpr: number,
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, zoneTopPx, widthPx, zoneHeightPx);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, zoneTopPx + 0.5 * dpr);
  ctx.lineTo(widthPx, zoneTopPx + 0.5 * dpr);
  ctx.stroke();
  const padX = 10 * dpr;
  const lineY = zoneTopPx + 10 * dpr;
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(padX, lineY);
  ctx.lineTo(widthPx - padX, lineY);
  ctx.stroke();
  ctx.fillStyle = "#111827";
  ctx.font = `600 ${Math.round(14 * dpr)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(nome, widthPx / 2, lineY + 8 * dpr);
}

/**
 * Área só com ponteiro/toque — sem entrada de teclado.
 * Desenho livre para rubrica (armazenado como PNG data URL).
 * Com `motoristaLabel`, a parte inferior mostra linha + nome e entra no PNG exportado.
 */
export const RubricaSignaturePad = forwardRef<RubricaSignaturePadHandle, Props>(
  function RubricaSignaturePad({ initialDataUrl, className, motoristaLabel = null }, ref) {
    const canvasHostRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef({ x: 0, y: 0 });
    const hasInkRef = useRef(false);

    const nomeTrim = motoristaLabel?.trim() ?? "";
    const showFooter = nomeTrim.length > 0;

    function fillWhitePhysical(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
    }

    function sizeAndClear() {
      const host = canvasHostRef.current;
      const canvas = canvasRef.current;
      if (!host || !canvas) return;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 8 || h < 8) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      fillWhitePhysical(ctx, canvas.width, canvas.height);
    }

    function canvasXY(e: ReactPointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      return { x, y };
    }

    function paintInitial(dataUrl: string) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        fillWhitePhysical(ctx, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        hasInkRef.current = true;
      };
      img.src = dataUrl;
    }

    useEffect(() => {
      let cancelled = false;
      const run = () => {
        if (cancelled) return;
        sizeAndClear();
        const init = initialDataUrl?.trim();
        if (init && init.startsWith("data:image")) {
          paintInitial(init);
        } else {
          hasInkRef.current = false;
        }
      };
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(run);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }, [initialDataUrl, showFooter]);

    function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastRef.current = canvasXY(e);
    }

    function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const p = canvasXY(e);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = Math.max(2, 2 * dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastRef.current = p;
      hasInkRef.current = true;
    }

    function endStroke(e: ReactPointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      e.preventDefault();
      drawingRef.current = false;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    useImperativeHandle(
      ref,
      () => ({
        getDataUrl: () => {
          const canvas = canvasRef.current;
          if (!canvas) return "";
          const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

          if (!nomeTrim) {
            if (!hasInkRef.current) return "";
            return canvas.toDataURL("image/png");
          }

          const footCss = footerRef.current?.getBoundingClientRect().height ?? 48;
          const footPx = Math.max(Math.floor(footCss * dpr), Math.floor(36 * dpr));

          const out = document.createElement("canvas");
          out.width = canvas.width;
          out.height = canvas.height + footPx;
          const ctx = out.getContext("2d");
          if (!ctx) return "";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, out.width, out.height);
          ctx.drawImage(canvas, 0, 0);
          drawFooterBand(ctx, out.width, canvas.height, footPx, nomeTrim, dpr);
          return out.toDataURL("image/png");
        },
        clearPad: () => {
          hasInkRef.current = false;
          sizeAndClear();
        },
      }),
      [nomeTrim],
    );

    return (
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-white",
          !(className?.includes("h-") || className?.includes("min-h")) ? "h-[min(40vh,14rem)]" : "min-h-0",
          className,
        )}
      >
        <div ref={canvasHostRef} className="relative min-h-0 flex-1">
          <canvas
            ref={canvasRef}
            className={cn(
              "absolute inset-0 block h-full w-full touch-none cursor-crosshair",
              showFooter ? "rounded-t-xl" : "rounded-xl",
            )}
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={(e) => {
              if (drawingRef.current) endStroke(e);
            }}
            tabIndex={-1}
            role="img"
            aria-label={
              showFooter
                ? `Área de rubrica por cima da linha; abaixo: ${nomeTrim}`
                : "Área de rubrica — desenhe com o rato ou o dedo"
            }
          />
        </div>
        {showFooter ? (
          <div
            ref={footerRef}
            className="shrink-0 border-t border-[hsl(var(--border))] bg-white px-3 pb-2.5 pt-2"
          >
            <div className="mx-auto mb-2 h-px w-[92%] bg-neutral-400" aria-hidden />
            <p className="text-center text-sm font-semibold leading-tight text-[hsl(var(--foreground))]">
              {nomeTrim}
            </p>
          </div>
        ) : null}
      </div>
    );
  },
);
