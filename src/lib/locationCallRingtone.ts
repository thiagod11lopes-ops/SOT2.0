/**
 * Feedback da chamada de localização: apenas vibração (sem som).
 */

type StopFn = () => void;

/** Padrão de vibração de chamada: toque-toque, pausa. */
export const LOCATION_CALL_VIBRATE_PATTERN = [400, 180, 400, 180, 400, 900];

/**
 * Inicia vibração em loop até `stop` ser chamado. Sem áudio.
 */
export function startLocationCallRingtone(): StopFn {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return () => undefined;
  }
  let stopped = false;
  const pulse = () => {
    if (stopped) return;
    navigator.vibrate(LOCATION_CALL_VIBRATE_PATTERN);
  };
  pulse();
  const timer = window.setInterval(pulse, 4000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    navigator.vibrate(0);
  };
}
