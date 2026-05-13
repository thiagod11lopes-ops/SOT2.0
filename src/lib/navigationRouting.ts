/**
 * Geocoding (texto → coordenadas) e cálculo de rota gratuito via serviços OpenStreetMap.
 *
 * - **Nominatim** (https://nominatim.org/) — geocoder. Aceita texto livre de morada. Limite
 *   educado: 1 req/s. Em produção intensa, considera self-host.
 * - **OSRM** (https://project-osrm.org/) — motor de roteamento. Devolve distância, duração e
 *   geometria GeoJSON. A instância pública é "fair use" — para vários motoristas em simultâneo
 *   compensa self-host (€5/mês num VPS) ou trocar para OpenRouteService (chave API gratuita
 *   2000 reqs/dia).
 *
 * Não precisamos de chaves API. Tudo gratuito desde que o uso seja razoável.
 */

/** Resultado do geocoding. `displayName` é o endereço canónico devolvido pelo Nominatim. */
export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

/**
 * Pesquisa endereços no Nominatim devolvendo até `limit` candidatos (default 5).
 * Útil quando o texto é ambíguo (vários "Hospital São José" em cidades diferentes).
 */
export async function geocodeAddresses(query: string, limit = 5): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(Math.max(1, Math.min(20, limit))));
    url.searchParams.set("countrycodes", "br,pt"); // restringe para melhor precisão
    url.searchParams.set("addressdetails", "0");
    const resp = await fetch(url.toString(), {
      headers: { "Accept-Language": "pt-PT,pt;q=0.9" },
    });
    if (!resp.ok) return [];
    const arr = (await resp.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!Array.isArray(arr)) return [];
    const out: GeocodeResult[] = [];
    for (const r of arr) {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({ lat, lng, displayName: String(r.display_name || q) });
    }
    return out;
  } catch (e) {
    console.warn("[SOT] geocodeAddresses falhou:", e);
    return [];
  }
}

/**
 * Converte texto livre numa única coordenada (primeiro resultado). Mantida para
 * compatibilidade; chamadores novos devem usar `geocodeAddresses`.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const arr = await geocodeAddresses(query, 1);
  return arr.length > 0 ? arr[0] : null;
}

/** Manobra/instrução individual de uma rota OSRM. */
export type RouteStep = {
  /** Em metros. */
  distance: number;
  /** Em segundos. */
  duration: number;
  /** Nome da rua/via. Pode estar vazio. */
  name: string;
  /** Manobra estruturada do OSRM. Exemplo: `{ type: "turn", modifier: "left" }`. */
  maneuver: {
    type: string;
    modifier?: string;
  };
  /** GeoJSON `LineString` desta etapa. */
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

/** Rota completa devolvida pela OSRM. */
export type DrivingRoute = {
  /** Distância total em **metros**. */
  distance: number;
  /** Duração total em **segundos**. */
  duration: number;
  /** GeoJSON `LineString` do percurso completo. */
  geometry: { type: "LineString"; coordinates: [number, number][] };
  steps: RouteStep[];
};

/**
 * Calcula a rota de condução entre dois pontos. Devolve `null` em erro ou ausência de rota.
 */
export async function fetchDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<DrivingRoute | null> {
  try {
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "true");
    url.searchParams.set("annotations", "false");
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) return null;
    const r = data.routes[0];
    const leg = Array.isArray(r.legs) && r.legs[0] ? r.legs[0] : null;
    const rawSteps = leg && Array.isArray(leg.steps) ? leg.steps : [];
    const steps: RouteStep[] = rawSteps.map((s: Record<string, unknown>) => ({
      distance: Number(s.distance) || 0,
      duration: Number(s.duration) || 0,
      name: typeof s.name === "string" ? s.name : "",
      maneuver: s.maneuver as RouteStep["maneuver"],
      geometry: s.geometry as RouteStep["geometry"],
    }));
    return {
      distance: Number(r.distance) || 0,
      duration: Number(r.duration) || 0,
      geometry: r.geometry as DrivingRoute["geometry"],
      steps,
    };
  } catch (e) {
    console.warn("[SOT] fetchDrivingRoute falhou:", e);
    return null;
  }
}

/** Formata uma duração em segundos como "1h 23min" ou "23min" ou "<1min". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return "<1 min";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Formata uma distância em metros como "12,4 km" ou "850 m". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km`;
}

/**
 * Distância haversine (em metros) entre dois pontos geográficos. Boa o suficiente
 * para ordenar candidatos de geocoding por proximidade (não precisamos da rota
 * real para isso).
 */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Constrói uma frase em português para uma manobra OSRM (usada pelo Text-to-Speech).
 *
 * Cobre os tipos mais comuns (`turn`, `merge`, `roundabout`, `arrive`, `depart`, etc).
 * Tipos não cobertos devolvem string vazia (não falamos).
 */
export function maneuverToPortuguese(step: RouteStep): string {
  const m = step.maneuver;
  if (!m) return "";
  const rua = step.name ? ` na ${step.name}` : "";
  const modifier = m.modifier ?? "";
  const direcao =
    modifier === "left"
      ? "à esquerda"
      : modifier === "right"
        ? "à direita"
        : modifier === "slight left"
          ? "ligeiramente à esquerda"
          : modifier === "slight right"
            ? "ligeiramente à direita"
            : modifier === "sharp left"
              ? "fortemente à esquerda"
              : modifier === "sharp right"
                ? "fortemente à direita"
                : modifier === "straight"
                  ? "em frente"
                  : modifier === "uturn"
                    ? "inverter o sentido"
                    : "";

  switch (m.type) {
    case "depart":
      return "A iniciar a navegação.";
    case "arrive":
      return "Chegou ao destino.";
    case "turn":
    case "end of road":
      return direcao ? `Vire ${direcao}${rua}.` : "";
    case "merge":
      return direcao ? `Entre ${direcao}${rua}.` : `Entre${rua}.`;
    case "fork":
      return direcao ? `Mantenha-se ${direcao}${rua}.` : "";
    case "roundabout":
    case "rotary":
      return "Entre na rotunda.";
    case "exit roundabout":
    case "exit rotary":
      return direcao ? `Saia da rotunda ${direcao}${rua}.` : `Saia da rotunda${rua}.`;
    case "new name":
      return step.name ? `Continue${rua}.` : "";
    case "continue":
      return direcao ? `Continue ${direcao}${rua}.` : `Continue${rua}.`;
    default:
      return "";
  }
}
