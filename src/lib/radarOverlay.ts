/** Deve coincidir com `animation-duration` de `.sot-radar-sweep` em `index.css`. */
export const RADAR_SWEEP_PERIOD_MS = 5500;

/**
 * Largura angular da listra clara (`.sot-radar-sweep`: 358°–360° no conic-gradient).
 * Só esta faixa dispara o ping — não o rasto nem o feixe largo.
 */
export const RADAR_BRIGHT_SWEEP_WIDTH_DEG = 2;

/** Meio-ângulo da listra clara (graus). */
export const RADAR_SWEEP_HALF_WIDTH_DEG = RADAR_BRIGHT_SWEEP_WIDTH_DEG / 2;

export const RADAR_BLIP_MIN_RADIUS_VMIN = 10;
export const RADAR_BLIP_MAX_RADIUS_VMIN = 44;

export type RadarBlip = {
  id: string;
  /** Posição em % da viewport (centro do alvo). */
  leftPct: number;
  topPct: number;
  /** Ângulo polar a partir do centro do radar (0° = topo, sentido horário). */
  angleDeg: number;
  radiusVmin: number;
  angleVelDegPerSec: number;
  radiusVelVminPerSec: number;
  nextHeadingChangeAt: number;
  /** Probabilidade de «ping» quando a varredura cruza (0–1). */
  detectChance: number;
};

const RADAR_CENTER_LEFT_PCT = 50;
const RADAR_CENTER_TOP_PCT = 48;

export function polarToScreen(angleDeg: number, radiusVmin: number): { leftPct: number; topPct: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const leftPct = RADAR_CENTER_LEFT_PCT + radiusVmin * Math.sin(rad);
  const topPct = RADAR_CENTER_TOP_PCT - radiusVmin * Math.cos(rad);
  return { leftPct, topPct };
}

export function angleFromCenter(leftPct: number, topPct: number): number {
  const dx = leftPct - RADAR_CENTER_LEFT_PCT;
  const dy = topPct - RADAR_CENTER_TOP_PCT;
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}

function syncBlipScreen(blip: RadarBlip): RadarBlip {
  const { leftPct, topPct } = polarToScreen(blip.angleDeg, blip.radiusVmin);
  return {
    ...blip,
    leftPct,
    topPct,
    angleDeg: angleFromCenter(leftPct, topPct),
  };
}

function randomHeadingChangeAt(nowMs: number): number {
  return nowMs + 5000 + Math.random() * 12_000;
}

function randomSlowVelocity(): { angleVelDegPerSec: number; radiusVelVminPerSec: number } {
  return {
    angleVelDegPerSec: (Math.random() - 0.5) * 4.2,
    radiusVelVminPerSec: (Math.random() - 0.5) * 0.55,
  };
}

export function sweepAngleAtTime(nowMs: number): number {
  return ((nowMs % RADAR_SWEEP_PERIOD_MS) / RADAR_SWEEP_PERIOD_MS) * 360;
}

export function angleDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Verdadeiro quando o alvo está sob a listra verde mais clara da varredura. */
export function isHitByBrightSweepLine(sweepDeg: number, targetDeg: number): boolean {
  return angleDifference(sweepDeg, targetDeg) <= RADAR_SWEEP_HALF_WIDTH_DEG;
}

export function createRandomRadarBlips(count = 12): RadarBlip[] {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const blips: RadarBlip[] = [];
  for (let i = 0; i < count; i++) {
    const angleDeg = Math.random() * 360;
    const radiusVmin =
      RADAR_BLIP_MIN_RADIUS_VMIN +
      Math.random() * (RADAR_BLIP_MAX_RADIUS_VMIN - RADAR_BLIP_MIN_RADIUS_VMIN);
    const velocity = randomSlowVelocity();
    blips.push(
      syncBlipScreen({
        id: `radar-blip-${i}-${Math.random().toString(36).slice(2, 7)}`,
        leftPct: 0,
        topPct: 0,
        angleDeg,
        radiusVmin,
        ...velocity,
        nextHeadingChangeAt: randomHeadingChangeAt(now),
        detectChance: 0.5 + Math.random() * 0.45,
      }),
    );
  }
  return blips;
}

/** Avança o alvo com deriva lenta e aleatória, mantendo-o na área do radar. */
export function stepRadarBlip(blip: RadarBlip, nowMs: number, dtSec: number): RadarBlip {
  let { angleDeg, radiusVmin, angleVelDegPerSec, radiusVelVminPerSec, nextHeadingChangeAt } = blip;

  if (nowMs >= nextHeadingChangeAt) {
    const velocity = randomSlowVelocity();
    angleVelDegPerSec = velocity.angleVelDegPerSec;
    radiusVelVminPerSec = velocity.radiusVelVminPerSec;
    nextHeadingChangeAt = randomHeadingChangeAt(nowMs);
  }

  angleDeg = (angleDeg + angleVelDegPerSec * dtSec + 360) % 360;
  radiusVmin += radiusVelVminPerSec * dtSec;

  if (radiusVmin < RADAR_BLIP_MIN_RADIUS_VMIN) {
    radiusVmin = RADAR_BLIP_MIN_RADIUS_VMIN;
    radiusVelVminPerSec = Math.abs(radiusVelVminPerSec) * 0.85;
  } else if (radiusVmin > RADAR_BLIP_MAX_RADIUS_VMIN) {
    radiusVmin = RADAR_BLIP_MAX_RADIUS_VMIN;
    radiusVelVminPerSec = -Math.abs(radiusVelVminPerSec) * 0.85;
  }

  return syncBlipScreen({
    ...blip,
    angleDeg,
    radiusVmin,
    angleVelDegPerSec,
    radiusVelVminPerSec,
    nextHeadingChangeAt,
  });
}
