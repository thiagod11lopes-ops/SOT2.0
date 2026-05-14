/**
 * Silhuetas SVG de viatura vistas de cima — usadas no marcador do motorista
 * no modal de navegação Google Maps e na UI da aba "Mobile — rastreamento
 * GPS" (preview ao escolher o tipo por placa).
 *
 * 3 variantes (encaixam no design da app):
 *  - "car"       — carro cinzento (uso geral, viaturas administrativas).
 *  - "ambulance" — corpo branco com cruz vermelha (SAMU, UTI, USA, USB, …).
 *  - "truck"     — camião cinzento com baú traseiro (viaturas de carga).
 *
 * Características partilhadas:
 *  - viewBox 40×60 (proporção carro vertical visto de cima).
 *  - Sombra elíptica por baixo (oblíqua suave).
 *  - Para-brisas frontal e traseiro azuis-claros.
 *  - Faróis dianteiros pontuais.
 *  - Rotação aplicada externamente via `style.transform` (alinhada ao
 *    heading do GPS).
 */

import type { VehicleType } from "../lib/vehicleTypeByPlaca";

export type VehicleIconProps = {
  variant: VehicleType;
  /** Largura em pixels (altura derivada da proporção 40×60). */
  size: number;
};

export function VehicleIcon({ variant, size }: VehicleIconProps) {
  const height = (size * 60) / 40;
  return (
    <svg viewBox="0 0 40 60" width={size} height={height} aria-hidden="true">
      {/* Sombra suave por baixo (comum às 3 variantes). */}
      <ellipse cx="20" cy="55" rx="14" ry="3" fill="rgba(0,0,0,0.35)" />
      {variant === "ambulance" ? <AmbulanceBody /> : null}
      {variant === "car" ? <CarBody /> : null}
      {variant === "truck" ? <TruckBody /> : null}
    </svg>
  );
}

// ─── Carro cinzento ────────────────────────────────────────────────────────
function CarBody() {
  return (
    <>
      {/* Corpo principal (cinza claro, cantos arredondados). */}
      <rect
        x="6"
        y="6"
        width="28"
        height="46"
        rx="6"
        ry="6"
        fill="#9ca3af"
        stroke="#4b5563"
        strokeWidth="2"
      />
      {/* Para-brisas frontal. */}
      <path d="M9 14 L31 14 L29 22 L11 22 Z" fill="#cbd5e1" opacity="0.95" />
      {/* Para-brisas traseiro. */}
      <path d="M11 38 L29 38 L31 46 L9 46 Z" fill="#cbd5e1" opacity="0.7" />
      {/* Tecto destacado. */}
      <rect x="11" y="22" width="18" height="16" fill="#6b7280" opacity="0.6" />
      {/* Faróis dianteiros. */}
      <circle cx="11" cy="9" r="1.5" fill="#fef3c7" />
      <circle cx="29" cy="9" r="1.5" fill="#fef3c7" />
    </>
  );
}

// ─── Ambulância branca com cruz vermelha ───────────────────────────────────
function AmbulanceBody() {
  return (
    <>
      <rect
        x="6"
        y="6"
        width="28"
        height="46"
        rx="6"
        ry="6"
        fill="#ffffff"
        stroke="#dc2626"
        strokeWidth="2.5"
      />
      {/* Para-brisas frontal. */}
      <path d="M9 14 L31 14 L29 22 L11 22 Z" fill="#bfdbfe" opacity="0.95" />
      {/* Para-brisas traseiro. */}
      <path d="M11 38 L29 38 L31 46 L9 46 Z" fill="#bfdbfe" opacity="0.7" />
      {/* Cruz médica central. */}
      <rect x="17" y="26" width="6" height="10" fill="#dc2626" className="ambulance-siren-flash" />
      <rect x="13" y="28" width="14" height="6" fill="#dc2626" className="ambulance-siren-flash" />
      {/* Faróis dianteiros. */}
      <circle cx="11" cy="9" r="1.5" fill="#fef3c7" />
      <circle cx="29" cy="9" r="1.5" fill="#fef3c7" />
    </>
  );
}

// ─── Camião cinzento (cabine + baú) ────────────────────────────────────────
function TruckBody() {
  return (
    <>
      {/* Cabine (parte da frente). */}
      <rect
        x="7"
        y="6"
        width="26"
        height="18"
        rx="4"
        ry="4"
        fill="#9ca3af"
        stroke="#374151"
        strokeWidth="2"
      />
      {/* Para-brisas frontal. */}
      <path d="M10 12 L30 12 L28 20 L12 20 Z" fill="#cbd5e1" opacity="0.95" />
      {/* Baú traseiro (mais largo / mais escuro). */}
      <rect
        x="5"
        y="24"
        width="30"
        height="28"
        rx="2"
        ry="2"
        fill="#6b7280"
        stroke="#1f2937"
        strokeWidth="2"
      />
      {/* Divisão entre cabine e baú. */}
      <line x1="5" y1="24" x2="35" y2="24" stroke="#1f2937" strokeWidth="2" />
      {/* Linhas horizontais simulando portas/painéis do baú. */}
      <line x1="7" y1="34" x2="33" y2="34" stroke="#374151" strokeWidth="1" />
      <line x1="7" y1="44" x2="33" y2="44" stroke="#374151" strokeWidth="1" />
      {/* Faróis dianteiros. */}
      <circle cx="11" cy="9" r="1.5" fill="#fef3c7" />
      <circle cx="29" cy="9" r="1.5" fill="#fef3c7" />
    </>
  );
}
