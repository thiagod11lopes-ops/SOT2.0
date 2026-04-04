import { useEffect, useRef } from "react";
import { useAppTab } from "../context/app-tab-context";

/** 1 minuto sem interação → volta à página principal; ecrã inteiro no próximo gesto (exigência dos navegadores). */
const IDLE_MS = 60_000;

/**
 * Navegadores só permitem ecrã inteiro após gesto do utilizador (como F11 / clique).
 * Chamadas a partir de `setTimeout` falham; por isso o pedido fica pendente até o próximo toque/clique/tecla.
 */
function tryEnterFullscreen(): void {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) return;

  const el = document.documentElement;
  const legacy = el as HTMLElement & { webkitRequestFullscreen?: () => void };
  const req = el.requestFullscreen?.bind(el) ?? legacy.webkitRequestFullscreen?.bind(el);

  if (!req) return;

  try {
    const result = req() as void | Promise<void>;
    if (result !== undefined && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => {});
    }
  } catch {
    /* recusado */
  }
}

/** Repõem o temporizador de inatividade; não contam como “gesto” para fullscreen. */
const WEAK_ACTIVITY_EVENTS = ["mousemove", "scroll", "wheel"] as const;

/** Gestos que o navegador aceita para `requestFullscreen` (ativação do utilizador). */
const STRONG_GESTURE_EVENTS = ["pointerdown", "click", "keydown", "touchstart"] as const;

export function useIdleReturnToPrincipal() {
  const { setActiveTab } = useAppTab();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFullscreenRef = useRef(false);

  useEffect(() => {
    const schedule = () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setActiveTab(null);
        pendingFullscreenRef.current = true;
      }, IDLE_MS);
    };

    const onWeakActivity = () => {
      schedule();
    };

    const onStrongGesture = () => {
      if (pendingFullscreenRef.current) {
        pendingFullscreenRef.current = false;
        tryEnterFullscreen();
      }
      schedule();
    };

    schedule();

    for (const evt of WEAK_ACTIVITY_EVENTS) {
      window.addEventListener(evt, onWeakActivity, { capture: true, passive: true });
    }
    for (const evt of STRONG_GESTURE_EVENTS) {
      window.addEventListener(evt, onStrongGesture, { capture: true, passive: true });
    }

    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      for (const evt of WEAK_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onWeakActivity, { capture: true });
      }
      for (const evt of STRONG_GESTURE_EVENTS) {
        window.removeEventListener(evt, onStrongGesture, { capture: true });
      }
    };
  }, [setActiveTab]);
}
