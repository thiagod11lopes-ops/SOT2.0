/**
 * Modelos 3D de viatura no estilo Google Maps (vista de cima com volume).
 * Usados no navegador in-app, no mapa desktop e na pré-visualização de tipo.
 *
 * Variantes:
 *  - "car"       — sedan branco/prata (padrão Maps)
 *  - "ambulance" — ambulância branca com cruz vermelha
 *  - "truck"     — utilitário/caminhão com baú
 *
 * A profundidade vem de laterais, teto elevado, vidros e sombra — não de
 * silhueta plana. A rotação (heading) é aplicada pelo contentor externo.
 */

import { useId } from "react";
import type { VehicleType } from "../lib/vehicleTypeByPlaca";

export type VehicleIconProps = {
  variant: VehicleType;
  /** Largura em pixels (altura deriva da proporção do viewBox). */
  size: number;
};

const VB_W = 48;
const VB_H = 72;

export function VehicleIcon({ variant, size }: VehicleIconProps) {
  const uid = useId().replace(/:/g, "");
  const height = (size * VB_H) / VB_W;
  const gradId = `veh-${uid}-grad`;
  const glassId = `veh-${uid}-glass`;
  const shadowId = `veh-${uid}-shadow`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={size}
      height={height}
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#000" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#d1d5db" />
          <stop offset="18%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="82%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#d1d5db" />
        </linearGradient>
        <linearGradient id={glassId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#64748b" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#334155" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#1e293b" stopOpacity="0.88" />
        </linearGradient>
      </defs>

      {/* Sombra suave no asfalto (estilo Maps). */}
      <ellipse cx="24" cy="66" rx="16" ry="5.5" fill={`url(#${shadowId})`} />

      {variant === "ambulance" ? (
        <AmbulanceBody bodyGrad={gradId} glassGrad={glassId} />
      ) : null}
      {variant === "car" ? <CarBody bodyGrad={gradId} glassGrad={glassId} /> : null}
      {variant === "truck" ? <TruckBody bodyGrad={gradId} glassGrad={glassId} /> : null}
    </svg>
  );
}

type BodyProps = { bodyGrad: string; glassGrad: string };

// ─── Sedan branco 3D (Google Maps) ─────────────────────────────────────────
function CarBody({ bodyGrad, glassGrad }: BodyProps) {
  return (
    <g>
      {/* Laterais / volume (paredes do chassis). */}
      <path
        d="M10 18 C9 22 8.5 30 8.5 36 C8.5 44 9 52 10 56 L12 58 L36 58 L38 56 C39 52 39.5 44 39.5 36 C39.5 30 39 22 38 18 Z"
        fill="#94a3b8"
        opacity="0.55"
      />

      {/* Corpo principal com gradiente lateral (volume). */}
      <path
        d="M15 8.5
           C18 5.5 30 5.5 33 8.5
           L36.5 14
           C38 18 38.5 24 38.5 34
           C38.5 46 38 54 36 58.5
           C34.5 61 13.5 61 12 58.5
           C10 54 9.5 46 9.5 34
           C9.5 24 10 18 11.5 14 Z"
        fill={`url(#${bodyGrad})`}
        stroke="#64748b"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* Capô (frente) — leve rebaixo. */}
      <path
        d="M14.5 14 C16 10.5 32 10.5 33.5 14 L35 18.5 L13 18.5 Z"
        fill="#e2e8f0"
        opacity="0.9"
      />

      {/* Para-brisas frontal. */}
      <path
        d="M13.5 19.5 L34.5 19.5 L32 28.5 L16 28.5 Z"
        fill={`url(#${glassGrad})`}
        stroke="#475569"
        strokeWidth="0.4"
      />
      {/* Reflexo no para-brisas. */}
      <path d="M16.5 20.5 L22 20.5 L20.5 27 L15.5 27 Z" fill="#fff" opacity="0.22" />

      {/* Teto elevado (placa superior). */}
      <path
        d="M16.5 29.5 L31.5 29.5 L31 42.5 L17 42.5 Z"
        fill="#f1f5f9"
        stroke="#94a3b8"
        strokeWidth="0.6"
      />
      {/* Destaque do teto (volume). */}
      <path d="M17.5 30.5 L30.5 30.5 L30.2 33 L17.8 33 Z" fill="#fff" opacity="0.65" />

      {/* Vidro traseiro. */}
      <path
        d="M17 43.5 L31 43.5 L33.5 52.5 L14.5 52.5 Z"
        fill={`url(#${glassGrad})`}
        stroke="#475569"
        strokeWidth="0.4"
      />
      <path d="M18 44.5 L23 44.5 L21.5 51 L16.5 51 Z" fill="#fff" opacity="0.18" />

      {/* Para-choque traseiro. */}
      <path
        d="M13.5 54.5 L34.5 54.5 C35.5 56.5 35 58.5 33.5 59.2 L14.5 59.2 C13 58.5 12.5 56.5 13.5 54.5 Z"
        fill="#cbd5e1"
        stroke="#64748b"
        strokeWidth="0.5"
      />

      {/* Espelhos laterais. */}
      <ellipse cx="9.2" cy="24" rx="2.2" ry="1.6" fill="#e2e8f0" stroke="#64748b" strokeWidth="0.6" />
      <ellipse cx="38.8" cy="24" rx="2.2" ry="1.6" fill="#e2e8f0" stroke="#64748b" strokeWidth="0.6" />

      {/* Faróis dianteiros. */}
      <ellipse cx="14.5" cy="11.2" rx="2.4" ry="1.5" fill="#fef9c3" stroke="#f59e0b" strokeWidth="0.45" />
      <ellipse cx="33.5" cy="11.2" rx="2.4" ry="1.5" fill="#fef9c3" stroke="#f59e0b" strokeWidth="0.45" />

      {/* Lanternas traseiras. */}
      <rect x="13.2" y="55.2" width="4.2" height="2.2" rx="0.6" fill="#ef4444" opacity="0.9" />
      <rect x="30.6" y="55.2" width="4.2" height="2.2" rx="0.6" fill="#ef4444" opacity="0.9" />

      {/* Contorno interno suave (chanfro). */}
      <path
        d="M15.5 12.5 C18 9.5 30 9.5 32.5 12.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.2"
        opacity="0.55"
      />
    </g>
  );
}

// ─── Ambulância 3D ─────────────────────────────────────────────────────────
function AmbulanceBody({ bodyGrad, glassGrad }: BodyProps) {
  return (
    <g>
      <path
        d="M10 18 C9 22 8.5 30 8.5 36 C8.5 44 9 52 10 56 L12 58 L36 58 L38 56 C39 52 39.5 44 39.5 36 C39.5 30 39 22 38 18 Z"
        fill="#94a3b8"
        opacity="0.45"
      />

      <path
        d="M15 8
           C18 5 30 5 33 8
           L36.5 14
           C38 18 38.5 24 38.5 34
           C38.5 46 38 54 36 58.5
           C34.5 61.2 13.5 61.2 12 58.5
           C10 54 9.5 46 9.5 34
           C9.5 24 10 18 11.5 14 Z"
        fill="#ffffff"
        stroke="#dc2626"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Capô. */}
      <path
        d="M14.5 13.5 C16 10 32 10 33.5 13.5 L35 18 L13 18 Z"
        fill={`url(#${bodyGrad})`}
        opacity="0.85"
      />

      {/* Para-brisas. */}
      <path
        d="M13.5 19 L34.5 19 L32 27.5 L16 27.5 Z"
        fill={`url(#${glassGrad})`}
        stroke="#475569"
        strokeWidth="0.4"
      />
      <path d="M16.5 20 L22 20 L20.5 26.5 L15.5 26.5 Z" fill="#fff" opacity="0.22" />

      {/* Caixa / teto da ambulância. */}
      <rect
        x="13.5"
        y="28.5"
        width="21"
        height="22"
        rx="2"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth="0.7"
      />
      <rect x="15" y="30" width="18" height="3" rx="0.5" fill="#fff" opacity="0.7" />

      {/* Cruz médica. */}
      <g className="ambulance-siren-flash">
        <rect x="21.5" y="34" width="5" height="13" rx="0.8" fill="#dc2626" />
        <rect x="16.5" y="37.5" width="15" height="5" rx="0.8" fill="#dc2626" />
      </g>

      {/* Faixa lateral vermelha (volume). */}
      <path d="M11.2 30 L12.8 30 L12.8 48 L11.2 48 Z" fill="#dc2626" opacity="0.85" />
      <path d="M35.2 30 L36.8 30 L36.8 48 L35.2 48 Z" fill="#dc2626" opacity="0.85" />

      {/* Vidro / porta traseira. */}
      <path
        d="M15.5 51 L32.5 51 L34 56.5 L14 56.5 Z"
        fill={`url(#${glassGrad})`}
        opacity="0.75"
      />

      <ellipse cx="9.2" cy="23.5" rx="2.2" ry="1.6" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.7" />
      <ellipse cx="38.8" cy="23.5" rx="2.2" ry="1.6" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.7" />

      <ellipse cx="14.5" cy="10.8" rx="2.4" ry="1.5" fill="#fef9c3" stroke="#f59e0b" strokeWidth="0.45" />
      <ellipse cx="33.5" cy="10.8" rx="2.4" ry="1.5" fill="#fef9c3" stroke="#f59e0b" strokeWidth="0.45" />

      <rect x="13.2" y="55.5" width="4.2" height="2.2" rx="0.6" fill="#ef4444" />
      <rect x="30.6" y="55.5" width="4.2" height="2.2" rx="0.6" fill="#ef4444" />
    </g>
  );
}

// ─── Caminhão / utilitário 3D ──────────────────────────────────────────────
function TruckBody({ bodyGrad, glassGrad }: BodyProps) {
  return (
    <g>
      <path
        d="M9.5 16 C8.5 22 8 30 8 38 C8 48 8.8 56 10.5 60 L12 62 L36 62 L37.5 60 C39.2 56 40 48 40 38 C40 30 39.5 22 38.5 16 Z"
        fill="#64748b"
        opacity="0.5"
      />

      {/* Cabine. */}
      <path
        d="M14 7
           C17 4.5 31 4.5 34 7
           L37 13
           C38 16 38.2 20 38 24
           L10 24
           C9.8 20 10 16 11 13 Z"
        fill={`url(#${bodyGrad})`}
        stroke="#475569"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* Para-brisas cabine. */}
      <path
        d="M13 12.5 L35 12.5 L34 20.5 L14 20.5 Z"
        fill={`url(#${glassGrad})`}
        stroke="#334155"
        strokeWidth="0.4"
      />
      <path d="M15.5 13.5 L21 13.5 L20 19.5 L14.8 19.5 Z" fill="#fff" opacity="0.22" />

      {/* Baú 3D. */}
      <path
        d="M9.5 25.5 L38.5 25.5 L39.2 28 L39.2 58.5 C39.2 60.5 37.5 62 35.5 62 L12.5 62 C10.5 62 8.8 60.5 8.8 58.5 L8.8 28 Z"
        fill="#94a3b8"
        stroke="#334155"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      {/* Face superior do baú (mais clara = volume). */}
      <path d="M10.5 26.5 L37.5 26.5 L37.5 30.5 L10.5 30.5 Z" fill="#e2e8f0" />
      <path d="M10.5 26.5 L37.5 26.5 L36.5 28.8 L11.5 28.8 Z" fill="#fff" opacity="0.55" />

      {/* Laterais do baú (sombra de profundidade). */}
      <path d="M9.2 31 L11 31 L11 58 L9.2 57.2 Z" fill="#64748b" opacity="0.65" />
      <path d="M38.8 31 L37 31 L37 58 L38.8 57.2 Z" fill="#64748b" opacity="0.65" />

      {/* Painéis do baú. */}
      <line x1="12" y1="38" x2="36" y2="38" stroke="#64748b" strokeWidth="1" />
      <line x1="12" y1="48" x2="36" y2="48" stroke="#64748b" strokeWidth="1" />
      <line x1="24" y1="32" x2="24" y2="58" stroke="#64748b" strokeWidth="0.8" opacity="0.7" />

      {/* Divisão cabine / baú. */}
      <rect x="9" y="24" width="30" height="2.2" fill="#1e293b" opacity="0.85" />

      <ellipse cx="8.8" cy="16.5" rx="2.3" ry="1.6" fill="#e2e8f0" stroke="#475569" strokeWidth="0.6" />
      <ellipse cx="39.2" cy="16.5" rx="2.3" ry="1.6" fill="#e2e8f0" stroke="#475569" strokeWidth="0.6" />

      <ellipse cx="14.2" cy="9.2" rx="2.5" ry="1.5" fill="#fef9c3" stroke="#f59e0b" strokeWidth="0.45" />
      <ellipse cx="33.8" cy="9.2" rx="2.5" ry="1.5" fill="#fef9c3" stroke="#f59e0b" strokeWidth="0.45" />

      <rect x="12.5" y="58.5" width="5" height="2.4" rx="0.5" fill="#ef4444" />
      <rect x="30.5" y="58.5" width="5" height="2.4" rx="0.5" fill="#ef4444" />
    </g>
  );
}
