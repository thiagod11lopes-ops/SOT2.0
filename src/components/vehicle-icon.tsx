/**
 * Modelos 3D estilo Google Maps Navigation.
 *
 * Vista em perspectiva (câmara atrás/acima): traseira maior e mais perto,
 * frente menor ao longe — o mesmo ângulo do carro branco do Maps.
 * Desenhado em SVG puro (sem preserve-3d) para funcionar dentro de
 * AdvancedMarker no telemóvel, onde filter/flatten costuma matar CSS 3D.
 */

import type { VehicleType } from "../lib/vehicleTypeByPlaca";

export type VehicleIconProps = {
  variant: VehicleType;
  /** Largura em pixels. */
  size: number;
};

/** Proporção aproximada do viewBox 64×90. */
const VB_W = 64;
const VB_H = 90;

export function VehicleIcon({ variant, size }: VehicleIconProps) {
  const height = (size * VB_H) / VB_W;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={size}
      height={height}
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Sombra no chão — elipse deslocada (sem filter CSS). */}
      <ellipse cx="32" cy="84" rx="22" ry="7" fill="#000" opacity="0.28" />
      <ellipse cx="32" cy="83" rx="16" ry="4.5" fill="#000" opacity="0.18" />

      {variant === "ambulance" ? <Ambulance3D /> : null}
      {variant === "car" ? <Car3D /> : null}
      {variant === "truck" ? <Truck3D /> : null}
    </svg>
  );
}

/**
 * Sedan branco Maps: perspectiva traseira elevada.
 * Coordenadas — Y cresce para baixo; a frente do carro está no TOPO do SVG
 * (aponta para cima no mapa heading-up).
 */
function Car3D() {
  return (
    <g>
      {/* Face traseira vertical (volume) — o que dá o “brinquedo 3D”. */}
      <path
        d="M16 70 L48 70 L50 78 L46 82 L18 82 L14 78 Z"
        fill="#c5cdd6"
        stroke="#6b7280"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* Lanternas na face traseira. */}
      <rect x="18" y="72.5" width="7" height="3.2" rx="1" fill="#ef4444" />
      <rect x="39" y="72.5" width="7" height="3.2" rx="1" fill="#ef4444" />
      <rect x="28.5" y="73.5" width="7" height="1.6" rx="0.5" fill="#f8fafc" opacity="0.9" />

      {/* Laterais em perspectiva (afinando para a frente). */}
      <path d="M16 70 L20 28 L18 26 L12 66 Z" fill="#9aa3af" />
      <path d="M48 70 L44 28 L46 26 L52 66 Z" fill="#8b949e" />

      {/* Corpo / teto em perspectiva (trapézio: base larga = traseira). */}
      <path
        d="M20 28
           C22 14 42 14 44 28
           L48 70
           L16 70
           Z"
        fill="#f4f6f8"
        stroke="#6b7280"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Capô (frente, mais longe — faixa estreita no topo). */}
      <path
        d="M23 16 C26 10 38 10 41 16 L44 28 L20 28 Z"
        fill="#e8edf2"
        stroke="#7b8490"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />

      {/* Faróis. */}
      <ellipse cx="24.5" cy="18" rx="3" ry="1.8" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />
      <ellipse cx="39.5" cy="18" rx="3" ry="1.8" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />

      {/* Para-brisas frontal (menor, longe). */}
      <path
        d="M22.5 29 L41.5 29 L39 38 L25 38 Z"
        fill="#3d4f63"
        stroke="#1e293b"
        strokeWidth="0.5"
      />
      <path d="M24 30.2 L30 30.2 L28.5 36.5 L23.5 36.5 Z" fill="#fff" opacity="0.28" />

      {/* Teto. */}
      <path
        d="M25 39 L39 39 L38.2 52 L25.8 52 Z"
        fill="#ffffff"
        stroke="#94a3b8"
        strokeWidth="0.6"
      />
      <path d="M26 40 L38 40 L37.6 43 L26.4 43 Z" fill="#fff" opacity="0.7" />

      {/* Vidro traseiro (maior, perto — marca registada do Maps). */}
      <path
        d="M25.5 53.5 L38.5 53.5 L46 69 L18 69 Z"
        fill="#2f3f52"
        stroke="#1e293b"
        strokeWidth="0.55"
      />
      <path d="M27 55 L34 55 L31.5 66 L22 66 Z" fill="#fff" opacity="0.2" />

      {/* Espelhos. */}
      <ellipse cx="17" cy="34" rx="3.2" ry="2.1" fill="#e5e7eb" stroke="#6b7280" strokeWidth="0.7" />
      <ellipse cx="47" cy="34" rx="3.2" ry="2.1" fill="#e5e7eb" stroke="#6b7280" strokeWidth="0.7" />

      {/* Filete de luz no topo (volume). */}
      <path
        d="M24 17 C28 12 36 12 40 17"
        fill="none"
        stroke="#fff"
        strokeWidth="1.4"
        opacity="0.75"
      />
    </g>
  );
}

function Ambulance3D() {
  return (
    <g>
      <path
        d="M15 70 L49 70 L51 78 L47 82 L17 82 L13 78 Z"
        fill="#e5e7eb"
        stroke="#b91c1c"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="17.5" y="72.5" width="7" height="3.2" rx="1" fill="#ef4444" />
      <rect x="39.5" y="72.5" width="7" height="3.2" rx="1" fill="#ef4444" />

      <path d="M15 70 L20 26 L18 24 L11 66 Z" fill="#cbd5e1" />
      <path d="M49 70 L44 26 L46 24 L53 66 Z" fill="#94a3b8" />

      {/* Faixas laterais vermelhas. */}
      <path d="M16 48 L19.5 30 L20.5 30 L17.2 48 Z" fill="#dc2626" />
      <path d="M48 48 L44.5 30 L43.5 30 L46.8 48 Z" fill="#dc2626" />

      <path
        d="M20 26
           C22 13 42 13 44 26
           L49 70
           L15 70
           Z"
        fill="#ffffff"
        stroke="#dc2626"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      <path
        d="M23 15 C26 9.5 38 9.5 41 15 L44 26 L20 26 Z"
        fill="#f8fafc"
        stroke="#dc2626"
        strokeWidth="0.8"
      />

      <ellipse cx="24.5" cy="17.5" rx="3" ry="1.8" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />
      <ellipse cx="39.5" cy="17.5" rx="3" ry="1.8" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />

      <path d="M22.5 28 L41.5 28 L39 36.5 L25 36.5 Z" fill="#3d4f63" />
      <path d="M24 29.2 L30 29.2 L28.5 35 L23.5 35 Z" fill="#fff" opacity="0.28" />

      {/* Caixa / teto. */}
      <path
        d="M23 38 L41 38 L40 58 L24 58 Z"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth="0.7"
      />

      {/* Cruz. */}
      <g className="ambulance-siren-flash">
        <rect x="29.5" y="41" width="5" height="14" rx="0.8" fill="#dc2626" />
        <rect x="24.5" y="45" width="15" height="5" rx="0.8" fill="#dc2626" />
      </g>

      <path d="M24.5 59 L39.5 59 L46.5 69.5 L17.5 69.5 Z" fill="#2f3f52" opacity="0.9" />

      <ellipse cx="16.5" cy="33" rx="3.2" ry="2.1" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.8" />
      <ellipse cx="47.5" cy="33" rx="3.2" ry="2.1" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.8" />
    </g>
  );
}

function Truck3D() {
  return (
    <g>
      {/* Face traseira do baú. */}
      <path
        d="M12 68 L52 68 L54 78 L50 83 L14 83 L10 78 Z"
        fill="#6b7280"
        stroke="#1f2937"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="16" y="71" width="8" height="3.5" rx="0.8" fill="#ef4444" />
      <rect x="40" y="71" width="8" height="3.5" rx="0.8" fill="#ef4444" />

      {/* Laterais do baú. */}
      <path d="M12 68 L16 34 L14 32 L8 64 Z" fill="#64748b" />
      <path d="M52 68 L48 34 L50 32 L56 64 Z" fill="#4b5563" />

      {/* Baú (topo em perspectiva). */}
      <path
        d="M16 34 L48 34 L52 68 L12 68 Z"
        fill="#94a3b8"
        stroke="#1f2937"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M17.5 35.5 L46.5 35.5 L45.5 40 L18.5 40 Z" fill="#e2e8f0" />
      <line x1="18" y1="48" x2="46" y2="48" stroke="#4b5563" strokeWidth="1" />
      <line x1="18" y1="58" x2="46" y2="58" stroke="#4b5563" strokeWidth="1" />
      <line x1="32" y1="41" x2="32" y2="66" stroke="#4b5563" strokeWidth="0.9" opacity="0.75" />

      {/* Cabine (mais à frente / topo). */}
      <path
        d="M20 12
           C24 6 40 6 44 12
           L47 22
           L48 33
           L16 33
           L17 22
           Z"
        fill="#f1f5f9"
        stroke="#475569"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M21.5 14 L42.5 14 L44.5 22 L19.5 22 Z" fill="#2f3f52" />
      <path d="M23 15.2 L30 15.2 L28.5 20.5 L22 20.5 Z" fill="#fff" opacity="0.28" />

      <ellipse cx="23" cy="11" rx="3" ry="1.7" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />
      <ellipse cx="41" cy="11" rx="3" ry="1.7" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />

      <ellipse cx="15" cy="24" rx="3" ry="2" fill="#e2e8f0" stroke="#475569" strokeWidth="0.7" />
      <ellipse cx="49" cy="24" rx="3" ry="2" fill="#e2e8f0" stroke="#475569" strokeWidth="0.7" />

      {/* Junta cabine/baú. */}
      <rect x="15.5" y="32" width="33" height="2.4" fill="#111827" opacity="0.85" />
    </g>
  );
}
