/**
 * Toque de chamada (dois tons, estilo telefone / WhatsApp) enquanto a tela de ligação está aberta.
 * No celular bloqueado o sistema só toca o som da notificação; este áudio entra ao abrir o SOT.
 */

type StopFn = () => void;

function createRingContext(): AudioContext | null {
  const Ctx =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}

/** Padrão de vibração de chamada: toque-toque, pausa. */
export const LOCATION_CALL_VIBRATE_PATTERN = [400, 180, 400, 180, 400, 900];

/**
 * Inicia toque em loop até `stop` ser chamado.
 * Usa dois osciladores (440 Hz + 480 Hz), como o ring clássico de telefone.
 */
export function startLocationCallRingtone(): StopFn {
  const ctx = createRingContext();
  if (!ctx) return () => undefined;

  let stopped = false;
  const active: Array<OscillatorNode | GainNode> = [];

  const stopNodes = () => {
    for (const node of active) {
      try {
        if ("stop" in node) (node as OscillatorNode).stop();
      } catch {
        /* ignore */
      }
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    active.length = 0;
  };

  const playBurst = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
    master.gain.setValueAtTime(0.22, now + 0.95);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    master.connect(ctx.destination);
    active.push(master);

    for (const freq of [440, 480]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(master);
      osc.start(now);
      osc.stop(now + 1.2);
      active.push(osc);
    }

    window.setTimeout(() => {
      if (stopped) return;
      const now2 = ctx.currentTime;
      const master2 = ctx.createGain();
      master2.gain.setValueAtTime(0.0001, now2);
      master2.gain.exponentialRampToValueAtTime(0.22, now2 + 0.04);
      master2.gain.setValueAtTime(0.22, now2 + 0.95);
      master2.gain.exponentialRampToValueAtTime(0.0001, now2 + 1.15);
      master2.connect(ctx.destination);
      active.push(master2);
      for (const freq of [440, 480]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(master2);
        osc.start(now2);
        osc.stop(now2 + 1.2);
        active.push(osc);
      }
    }, 1300);
  };

  const kick = () => {
    if (stopped) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    playBurst();
  };

  kick();
  const cycleTimer = window.setInterval(kick, 4000);

  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    const vibratePulse = () => {
      if (stopped) return;
      navigator.vibrate(LOCATION_CALL_VIBRATE_PATTERN);
    };
    vibratePulse();
    const vibrateTimer = window.setInterval(vibratePulse, 4000);
    return () => {
      stopped = true;
      window.clearInterval(cycleTimer);
      window.clearInterval(vibrateTimer);
      stopNodes();
      navigator.vibrate(0);
      void ctx.close().catch(() => undefined);
    };
  }

  return () => {
    stopped = true;
    window.clearInterval(cycleTimer);
    stopNodes();
    void ctx.close().catch(() => undefined);
  };
}
