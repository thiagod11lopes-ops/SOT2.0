/** Deve coincidir com `animation-duration` de `.sot-radar-sweep` em `index.css`. */
export const RADAR_SWEEP_PERIOD_MS = 5500;

/** Meio-ângulo do feixe de deteção (graus). */
export const RADAR_SWEEP_HALF_WIDTH_DEG = 11;

export type RadarBlipKind = "ship" | "ambulance";

export type RadarBlip = {
  id: string;
  kind: RadarBlipKind;
  /** Posição em % da viewport (centro do alvo). */
  leftPct: number;
  topPct: number;
  /** Ângulo polar a partir do centro do radar (0° = topo, sentido horário). */
  angleDeg: number;
  /** Probabilidade de «ping» quando a varredura cruza (0–1). */
  detectChance: number;
};

const RADAR_CENTER_LEFT_PCT = 50;
const RADAR_CENTER_TOP_PCT = 48;

function polarToScreen(angleDeg: number, radiusVmin: number): { leftPct: number; topPct: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const leftPct = RADAR_CENTER_LEFT_PCT + radiusVmin * Math.sin(rad);
  const topPct = RADAR_CENTER_TOP_PCT - radiusVmin * Math.cos(rad);
  return { leftPct, topPct };
}

function angleFromCenter(leftPct: number, topPct: number): number {
  const dx = leftPct - RADAR_CENTER_LEFT_PCT;
  const dy = topPct - RADAR_CENTER_TOP_PCT;
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}

export function sweepAngleAtTime(nowMs: number): number {
  return ((nowMs % RADAR_SWEEP_PERIOD_MS) / RADAR_SWEEP_PERIOD_MS) * 360;
}

export function angleDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function createRandomRadarBlips(count = 12): RadarBlip[] {
  const blips: RadarBlip[] = [];
  for (let i = 0; i < count; i++) {
    const angleDeg = Math.random() * 360;
    const radiusVmin = 10 + Math.random() * 34;
    const { leftPct, topPct } = polarToScreen(angleDeg, radiusVmin);
    blips.push({
      id: `radar-blip-${i}-${Math.random().toString(36).slice(2, 7)}`,
      kind: Math.random() < 0.42 ? "ambulance" : "ship",
      leftPct,
      topPct,
      angleDeg: angleFromCenter(leftPct, topPct),
      detectChance: 0.5 + Math.random() * 0.45,
    });
  }
  return blips;
}
