import { useEffect, useRef } from "react";

/** Sem eventos de utilização neste intervalo → callback (ex.: voltar à página inicial). */
const IDLE_MS = 60_000;

/**
 * Reinicia um temporizador em cada interação comum (teclado, rato, scroll, toque).
 * Não usa `mousemove` contínuo para não impedir o timeout por movimento involuntário.
 */
export function useIdleResetToHome(enabled: boolean, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const schedule = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        onIdleRef.current();
      }, IDLE_MS);
    };

    schedule();

    const events = ["mousedown", "keydown", "scroll", "touchstart", "pointerdown", "wheel"] as const;
    const onActivity = () => schedule();
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    return () => {
      clearTimeout(timeoutId);
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [enabled]);
}
