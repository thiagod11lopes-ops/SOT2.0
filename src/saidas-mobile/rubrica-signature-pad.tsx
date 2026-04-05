import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../lib/utils";

export type RubricaSignaturePadHandle = {
  /** PNG em data URL, ou string vazia se não houver traço. */
  getDataUrl: () => string;
  /** Limpa o desenho. */
  clearPad: () => void;
};

type Props = {
  /** Ao reabrir o modal, repõe um desenho já guardado (PNG). */
  initialDataUrl?: string | null;
  className?: string;
};

/**
 * Área só com ponteiro/toque — sem entrada de teclado.
 * Desenho livre para rubrica (armazenado como PNG data URL).
 */
export const RubricaSignaturePad = forwardRef<RubricaSignaturePadHandle, Props>(
  function RubricaSignaturePad({ initialDataUrl, className }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef({ x: 0, y: 0 });
    const hasInkRef = useRef(false);

    function fillWhitePhysical(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
    }

    function sizeAndClear() {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
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
    }, [initialDataUrl]);

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

    useImperativeHandle(ref, () => ({
      getDataUrl: () => {
        if (!hasInkRef.current) return "";
        return canvasRef.current?.toDataURL("image/png") ?? "";
      },
      clearPad: () => {
        hasInkRef.current = false;
        sizeAndClear();
      },
    }));

    return (
      <div
        ref={wrapRef}
        className={cn(
          "relative h-[min(40vh,14rem)] w-full rounded-xl border border-[hsl(var(--border))] bg-white",
          className,
        )}
      >
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
          aria-label="Área de rubrica — desenhe com o rato ou o dedo"
        />
      </div>
    );
  },
);
