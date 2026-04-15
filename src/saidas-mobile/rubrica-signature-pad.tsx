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
   * Nome do motorista — incluído na faixa inferior do PNG gravado (linha + nome), não duplicado na UI.
   */
  motoristaLabel?: string | null;
};

/**
 * Tamanho do texto do nome (px em coordenadas do canvas = dispositivo).
 * Proporcional à largura do PNG para o nome não ficar irreconhecível quando a área de desenho é alta
 * (faixa inferior fixa em px causava nome minúsculo na miniatura da Situação das VTR).
 */
function nomeMotoristaFontDevicePx(widthDevicePx: number, dpr: number): number {
  const min = Math.round(40 * dpr);
  const max = Math.round(160 * dpr);
  const fromWidth = Math.round(widthDevicePx * 0.055);
  return Math.min(max, Math.max(min, fromWidth));
}

/** Altura da faixa inferior (px dispositivo) para linha + nome + margens. */
function footerBandHeightDevicePx(widthDevicePx: number, dpr: number): number {
  const f = nomeMotoristaFontDevicePx(widthDevicePx, dpr);
  return Math.ceil(f * 1.42 + 28 * dpr);
}

function drawFooterBand(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  zoneTopPx: number,
  zoneHeightPx: number,
  nome: string,
  dpr: number,
): void {
  const fontPx = nomeMotoristaFontDevicePx(widthPx, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, zoneTopPx, widthPx, zoneHeightPx);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, zoneTopPx + 0.5 * dpr);
  ctx.lineTo(widthPx, zoneTopPx + 0.5 * dpr);
  ctx.stroke();
  const padX = 10 * dpr;
  const lineY = zoneTopPx + 12 * dpr;
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(padX, lineY);
  ctx.lineTo(widthPx - padX, lineY);
  ctx.stroke();
  ctx.fillStyle = "#111827";
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(nome, widthPx / 2, lineY + Math.round(0.12 * fontPx));
}

/**
 * Área só com ponteiro/toque — sem entrada de teclado.
 * Desenho livre para rubrica (armazenado como PNG data URL).
 * Com `motoristaLabel`, a linha + nome entram só no PNG exportado (não é repetido texto na interface).
 */
export const RubricaSignaturePad = forwardRef<RubricaSignaturePadHandle, Props>(
  function RubricaSignaturePad({ initialDataUrl, className, motoristaLabel = null }, ref) {
    const canvasHostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef({ x: 0, y: 0 });
    const hasInkRef = useRef(false);

    const nomeTrim = motoristaLabel?.trim() ?? "";

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
    }, [initialDataUrl, nomeTrim]);

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

          const footPx = footerBandHeightDevicePx(canvas.width, dpr);

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
            className="absolute inset-0 block h-full w-full touch-none cursor-crosshair rounded-xl"
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
              nomeTrim
                ? `Área de rubrica — desenhe acima da área visível; o nome do motorista será incluído na imagem guardada (${nomeTrim})`
                : "Área de rubrica — desenhe com o rato ou o dedo"
            }
          />
        </div>
      </div>
    );
  },
);
