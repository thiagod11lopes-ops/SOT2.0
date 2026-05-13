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

/**
 * Subconjunto do objecto `address` devolvido pelo Nominatim com `addressdetails=1`.
 * Mantemos apenas os campos úteis para apresentar nas sugestões (nome do local,
 * rua, número, bairro). Restantes campos (cidade, estado, CEP, país) são
 * ignorados — o pedido do utilizador é mostrar só estes quatro.
 */
export type NominatimAddress = {
  amenity?: string;
  shop?: string;
  building?: string;
  tourism?: string;
  leisure?: string;
  office?: string;
  healthcare?: string;
  hospital?: string;
  school?: string;
  university?: string;
  attraction?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  residential?: string;
  cycleway?: string;
  path?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  hamlet?: string;
  village?: string;
};

/** Resultado do geocoding. `displayName` é o endereço canónico devolvido pelo Nominatim. */
export type GeocodeResult = {
  lat: number;
  lng: number;
  /** Texto longo devolvido pelo Nominatim (todos os campos hierárquicos). */
  displayName: string;
  /**
   * Versão compacta para apresentar ao motorista: nome do local (se houver) +
   * rua + número + bairro. Construída a partir de `address` quando disponível.
   */
  shortLabel: string;
  /** Estrutura `address` original do Nominatim (quando pedimos `addressdetails=1`). */
  address?: NominatimAddress;
};

/**
 * Constrói o rótulo curto "Nome do local, Rua, Número, Bairro" a partir de uma
 * resposta estruturada do Nominatim. Cada parte é incluída só se existir, e o
 * "nome do local" só é incluído quando representa uma POI clara (hospital,
 * shopping, escola, etc.) — para endereços puramente residenciais ficamos com
 * "Rua, Número, Bairro".
 */
export function buildShortAddressLabel(args: {
  displayName: string;
  address?: NominatimAddress;
}): string {
  const { displayName, address } = args;
  if (!address) {
    // Sem detalhes: pega os 3-4 primeiros segmentos do display_name (heurística
    // razoável já que o Nominatim ordena do mais específico para o mais geral).
    const parts = displayName.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.slice(0, 4).join(", ") || displayName;
  }

  const poiName =
    address.amenity ||
    address.shop ||
    address.tourism ||
    address.leisure ||
    address.office ||
    address.healthcare ||
    address.hospital ||
    address.school ||
    address.university ||
    address.attraction ||
    address.building ||
    "";

  const road =
    address.road ||
    address.pedestrian ||
    address.residential ||
    address.footway ||
    address.cycleway ||
    address.path ||
    "";

  const houseNumber = address.house_number || "";
  const bairro =
    address.suburb ||
    address.neighbourhood ||
    address.quarter ||
    address.city_district ||
    address.village ||
    address.hamlet ||
    "";

  const firstSegment = displayName.split(",")[0]?.trim() ?? "";
  const isPoiFirstSegment =
    Boolean(poiName) &&
    firstSegment.toLowerCase() === poiName.toLowerCase();
  const isRoadFirstSegment =
    Boolean(road) && firstSegment.toLowerCase() === road.toLowerCase();

  const partes: string[] = [];
  // Inclui o nome do local quando o Nominatim coloca-o em primeiro lugar ou
  // quando há um POI explícito (hospital, escola, shopping, etc.) — evita
  // duplicar quando o "nome" é, na verdade, o número de porta ou o bairro.
  if (poiName && (isPoiFirstSegment || (!isRoadFirstSegment && !houseNumber))) {
    partes.push(poiName);
  } else if (!poiName && firstSegment && !isRoadFirstSegment && !/^\d+/.test(firstSegment)) {
    // Sem POI estruturado mas há um "nome" no início do display_name que não é
    // a própria rua e não começa por número — provavelmente é o nome do local.
    partes.push(firstSegment);
  }
  if (road) partes.push(road);
  if (houseNumber) partes.push(houseNumber);
  if (bairro) partes.push(bairro);

  if (partes.length === 0) {
    const parts = displayName.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.slice(0, 4).join(", ") || displayName;
  }
  return partes.join(", ");
}

/**
 * Pesquisa endereços no Nominatim devolvendo até `limit` candidatos (default 5).
 * Útil quando o texto é ambíguo (vários "Hospital São José" em cidades diferentes).
 *
 * Pede `addressdetails=1` para podermos construir um rótulo curto (nome do local,
 * rua, número, bairro) — mais legível que o `display_name` completo.
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
    url.searchParams.set("addressdetails", "1");
    const resp = await fetch(url.toString(), {
      headers: { "Accept-Language": "pt-PT,pt;q=0.9" },
    });
    if (!resp.ok) return [];
    const arr = (await resp.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: NominatimAddress;
    }>;
    if (!Array.isArray(arr)) return [];
    const out: GeocodeResult[] = [];
    for (const r of arr) {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const displayName = String(r.display_name || q);
      const shortLabel = buildShortAddressLabel({ displayName, address: r.address });
      out.push({ lat, lng, displayName, shortLabel, address: r.address });
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

/**
 * Intervalo de trânsito num segmento da polilinha (apenas com Google Routes
 * API). Os índices referem-se à `geometry.coordinates`: o troço entre o
 * ponto `startIndex` e `endIndex` (inclusivos) tem a condição `speed`.
 */
export type SpeedInterval = {
  startIndex: number;
  endIndex: number;
  speed: "NORMAL" | "SLOW" | "TRAFFIC_JAM" | "UNKNOWN";
};

/** Rota completa devolvida pela OSRM ou Google Routes API. */
export type DrivingRoute = {
  /** Distância total em **metros**. */
  distance: number;
  /**
   * Duração total em **segundos**. Quando vem da Google Routes API com
   * `TRAFFIC_AWARE`, já inclui o trânsito actual; com OSRM é a duração
   * estática baseada apenas em limites de velocidade.
   */
  duration: number;
  /**
   * Duração SEM trânsito em **segundos**, apenas disponível com Google
   * Routes API. `null` quando a rota vem do OSRM (que não tem dados de
   * trânsito de todo).
   */
  staticDuration?: number | null;
  /** GeoJSON `LineString` do percurso completo. */
  geometry: { type: "LineString"; coordinates: [number, number][] };
  steps: RouteStep[];
  /**
   * Intervalos de trânsito por segmento da polilinha (apenas Google Routes
   * API com `TRAFFIC_AWARE`). Quando ausente, o motorista vê a polilinha
   * inteira a azul; quando presente, os troços com trânsito ficam laranja
   * (`SLOW`) ou vermelho (`TRAFFIC_JAM`).
   */
  speedIntervals?: SpeedInterval[];
  /** Origem dos dados — útil para badges no UI e para depuração. */
  provider?: "google" | "osrm";
};

/** Timeout por tentativa (ms). 10 s é generoso para 3G/4G e curto o suficiente
 *  para falharmos para o próximo endpoint sem manter o motorista à espera. */
const OSRM_TIMEOUT_MS = 10000;

/** Endpoint da Google Routes API v2. */
const GOOGLE_ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * Field mask enviado no header `X-Goog-FieldMask` — controla quais campos a
 * Routes API devolve (e o que pagamos por eles). Pedimos:
 *  - duração com trânsito + duração estática (para badge "com trânsito");
 *  - polilinha codificada (decodificada depois);
 *  - manobras passo a passo (para a voz e cartão de manobra);
 *  - `travelAdvisory.speedReadingIntervals` (cores do trânsito por troço).
 */
const GOOGLE_ROUTES_FIELD_MASK = [
  "routes.duration",
  "routes.staticDuration",
  "routes.distanceMeters",
  "routes.polyline.encodedPolyline",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.polyline.encodedPolyline",
  "routes.legs.steps.navigationInstruction.instructions",
  "routes.legs.steps.navigationInstruction.maneuver",
  "routes.travelAdvisory.speedReadingIntervals",
].join(",");

/** Timeout do pedido à Routes API (ms). */
const GOOGLE_ROUTES_TIMEOUT_MS = 12000;

/**
 * Descodifica uma polilinha codificada do Google (algoritmo de Polyline
 * Encoding) em pares `[lng, lat]` (formato GeoJSON, compatível com o resto
 * deste módulo).
 *
 * Algoritmo: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 * Cada coordenada é codificada como dois inteiros assinados (lat, lng) em
 * incrementos relativos ao ponto anterior, em escala 1e5.
 */
function decodeGooglePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];
  const result: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;

  while (index < len) {
    let byte: number;
    let shift = 0;
    let acc = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      acc |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLat = acc & 1 ? ~(acc >> 1) : acc >> 1;
    lat += dLat;

    shift = 0;
    acc = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      acc |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLng = acc & 1 ? ~(acc >> 1) : acc >> 1;
    lng += dLng;

    result.push([lng / 1e5, lat / 1e5]);
  }
  return result;
}

/**
 * Converte o enum de manobra da Google Routes API para o formato OSRM
 * `{ type, modifier }` que o resto do código (cartão de manobra, voz)
 * já sabe interpretar. Mapeamento empírico baseado na documentação:
 * https://developers.google.com/maps/documentation/routes/reference/rest/v2/Maneuver
 */
function mapGoogleManeuverToOsrm(
  m: string | undefined,
): RouteStep["maneuver"] {
  if (!m || m === "MANEUVER_UNSPECIFIED") return { type: "continue" };
  switch (m) {
    case "DEPART":
      return { type: "depart" };
    case "DESTINATION":
    case "DESTINATION_LEFT":
    case "DESTINATION_RIGHT":
      return { type: "arrive" };
    case "STRAIGHT":
      return { type: "continue", modifier: "straight" };
    case "TURN_LEFT":
      return { type: "turn", modifier: "left" };
    case "TURN_RIGHT":
      return { type: "turn", modifier: "right" };
    case "TURN_SLIGHT_LEFT":
      return { type: "turn", modifier: "slight left" };
    case "TURN_SLIGHT_RIGHT":
      return { type: "turn", modifier: "slight right" };
    case "TURN_SHARP_LEFT":
      return { type: "turn", modifier: "sharp left" };
    case "TURN_SHARP_RIGHT":
      return { type: "turn", modifier: "sharp right" };
    case "TURN_U_TURN_CLOCKWISE":
    case "TURN_U_TURN_COUNTERCLOCKWISE":
      return { type: "turn", modifier: "uturn" };
    case "FORK_LEFT":
      return { type: "fork", modifier: "left" };
    case "FORK_RIGHT":
      return { type: "fork", modifier: "right" };
    case "MERGE_LEFT":
      return { type: "merge", modifier: "left" };
    case "MERGE_RIGHT":
      return { type: "merge", modifier: "right" };
    case "ROUNDABOUT_CLOCKWISE":
    case "ROUNDABOUT_COUNTERCLOCKWISE":
    case "ROUNDABOUT_LEFT":
    case "ROUNDABOUT_RIGHT":
      return { type: "roundabout" };
    case "ROUNDABOUT_EXIT_CLOCKWISE":
    case "ROUNDABOUT_EXIT_COUNTERCLOCKWISE":
      return { type: "exit roundabout" };
    case "NAME_CHANGE":
      return { type: "new name" };
    case "ON_RAMP_LEFT":
      return { type: "fork", modifier: "left" };
    case "ON_RAMP_RIGHT":
      return { type: "fork", modifier: "right" };
    case "OFF_RAMP_LEFT":
      return { type: "turn", modifier: "slight left" };
    case "OFF_RAMP_RIGHT":
      return { type: "turn", modifier: "slight right" };
    default:
      return { type: "continue" };
  }
}

/** Converte string ISO "215s" (Google duration) para segundos numéricos. */
function parseGoogleDuration(s: string | undefined | null): number {
  if (!s) return 0;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(s);
  return m ? Number(m[1]) : 0;
}

/**
 * Chama a Google Routes API com `routingPreference: TRAFFIC_AWARE`.
 *
 * Pré-requisitos:
 *  - A chave Google Maps (`VITE_GOOGLE_MAPS_API_KEY`) tem de ter a **Routes API**
 *    activada no Cloud Console (separado da Maps JavaScript API).
 *  - O billing tem de estar activo (já está).
 *
 * Custo: ~10 USD por 1 000 chamadas Advanced (com trânsito). Com o crédito
 * gratuito mensal de 200 USD do Google Maps Platform, escalas pequenas/
 * médias ficam praticamente em zero.
 *
 * Devolve `null` quando a chave não está configurada ou quando a API responde
 * com erro — o caller faz fallback para o OSRM nesse caso.
 */
async function fetchGoogleRoute(
  apiKey: string,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<DrivingRoute | null> {
  if (!apiKey) return null;

  const body = {
    origin: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lng },
      },
    },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lng },
      },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    languageCode: "pt-BR",
    units: "METRIC",
    polylineQuality: "HIGH_QUALITY",
    /**
     * `TRAFFIC_ON_POLYLINE` é o que faz o Google devolver os
     * `speedReadingIntervals` por troço (com `NORMAL`/`SLOW`/`TRAFFIC_JAM`).
     * Sem este flag, a duração já vem ajustada ao trânsito mas os
     * segmentos coloridos no mapa não vêm. Implica passar do SKU
     * "Compute Routes Advanced" para "Compute Routes Preferred"
     * (≈15 USD por 1 000 chamadas em vez de 10 USD), o que continua
     * bem dentro do crédito gratuito mensal de 200 USD.
     */
    extraComputations: ["TRAFFIC_ON_POLYLINE"],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_ROUTES_TIMEOUT_MS);

  try {
    const resp = await fetch(GOOGLE_ROUTES_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.warn(
        `[SOT] Google Routes API HTTP ${resp.status}:`,
        text.slice(0, 240),
      );
      return null;
    }
    const data = (await resp.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        staticDuration?: string;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{
          steps?: Array<{
            distanceMeters?: number;
            staticDuration?: string;
            polyline?: { encodedPolyline?: string };
            navigationInstruction?: {
              instructions?: string;
              maneuver?: string;
            };
          }>;
        }>;
        travelAdvisory?: {
          speedReadingIntervals?: Array<{
            startPolylinePointIndex?: number;
            endPolylinePointIndex?: number;
            speed?: SpeedInterval["speed"];
          }>;
        };
      }>;
    };

    const r = data.routes?.[0];
    if (!r) {
      console.warn("[SOT] Google Routes API sem rotas na resposta");
      return null;
    }
    const encoded = r.polyline?.encodedPolyline ?? "";
    const coordinates = decodeGooglePolyline(encoded);
    if (coordinates.length === 0) {
      console.warn("[SOT] Google Routes API rota sem polilinha");
      return null;
    }

    const steps: RouteStep[] = [];
    const legs = r.legs ?? [];
    for (const leg of legs) {
      const rawSteps = leg.steps ?? [];
      for (const s of rawSteps) {
        const stepEnc = s.polyline?.encodedPolyline ?? "";
        const stepCoords = decodeGooglePolyline(stepEnc);
        steps.push({
          distance: Number(s.distanceMeters) || 0,
          duration: parseGoogleDuration(s.staticDuration),
          name: "",
          maneuver: mapGoogleManeuverToOsrm(s.navigationInstruction?.maneuver),
          geometry: { type: "LineString", coordinates: stepCoords },
        });
      }
    }

    const speedIntervals: SpeedInterval[] = [];
    for (const iv of r.travelAdvisory?.speedReadingIntervals ?? []) {
      if (
        typeof iv.startPolylinePointIndex === "number" &&
        typeof iv.endPolylinePointIndex === "number" &&
        iv.speed
      ) {
        speedIntervals.push({
          startIndex: iv.startPolylinePointIndex,
          endIndex: iv.endPolylinePointIndex,
          speed: iv.speed,
        });
      } else if (
        // Quando o primeiro intervalo começa em 0, a Routes API omite
        // `startPolylinePointIndex` (default 0). Tratamos esse caso.
        typeof iv.endPolylinePointIndex === "number" &&
        iv.speed
      ) {
        speedIntervals.push({
          startIndex: 0,
          endIndex: iv.endPolylinePointIndex,
          speed: iv.speed,
        });
      }
    }

    const duration = parseGoogleDuration(r.duration);
    const staticDuration = parseGoogleDuration(r.staticDuration);
    const distance = Number(r.distanceMeters) || 0;

    console.info(
      `[SOT] Google Routes devolveu rota: ${Math.round(distance)} m em ${Math.round(duration)} s (${Math.round(staticDuration)} s sem trânsito, ${speedIntervals.length} intervalos)`,
    );

    return {
      distance,
      duration,
      staticDuration: staticDuration || null,
      geometry: { type: "LineString", coordinates },
      steps,
      speedIntervals: speedIntervals.length > 0 ? speedIntervals : undefined,
      provider: "google",
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      console.warn(`[SOT] Google Routes API timeout (>${GOOGLE_ROUTES_TIMEOUT_MS}ms)`);
    } else {
      console.warn("[SOT] Google Routes API falhou:", e);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lista de servidores OSRM públicos a tentar em sequência. Quando o primeiro
 * não responde (timeout, HTTP 5xx, CORS, etc.) passamos ao seguinte.
 *
 *  1. `router.project-osrm.org` — instância oficial do projecto OSRM.
 *     Servidores na Alemanha. "Fair use", às vezes lento em horário de pico.
 *  2. `routing.openstreetmap.de` (perfil `routed-car`) — usado pelo próprio
 *     openstreetmap.org. Infraestrutura FOSSGIS, mais robusta sob carga,
 *     bem mais tolerante a redes móveis em PT/BR.
 *
 * Ambos os endpoints partilham o mesmo formato de URL/resposta (são instâncias
 * OSRM), por isso a mesma função de parsing serve para os dois.
 */
const OSRM_ENDPOINTS = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
] as const;

/** Fetch único a um endpoint OSRM com `AbortController` para garantir timeout. */
async function fetchOsrmOnce(
  url: string,
  timeoutMs: number,
  label: string,
): Promise<DrivingRoute | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      console.warn(`[SOT] ${label} respondeu HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) {
      console.warn(`[SOT] ${label} sem rota:`, data.code, data.message);
      return null;
    }
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
    console.info(
      `[SOT] ${label} devolveu rota: ${Math.round(r.distance)} m em ${Math.round(r.duration)} s`,
    );
    return {
      distance: Number(r.distance) || 0,
      duration: Number(r.duration) || 0,
      geometry: r.geometry as DrivingRoute["geometry"],
      steps,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      console.warn(`[SOT] ${label} timeout (>${timeoutMs}ms)`);
    } else {
      console.warn(`[SOT] ${label} falhou:`, e);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOsrmRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<DrivingRoute | null> {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const query = `${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;

  for (let i = 0; i < OSRM_ENDPOINTS.length; i++) {
    const base = OSRM_ENDPOINTS[i];
    const label = i === 0 ? "OSRM primário" : "OSRM fallback OSM-DE";
    const result = await fetchOsrmOnce(`${base}/${query}`, OSRM_TIMEOUT_MS, label);
    if (result) return result;
  }
  return null;
}

/** Opções aceites por `fetchDrivingRoute`. */
export type FetchDrivingRouteOptions = {
  /**
   * Chave da Google Maps Platform. Quando presente, tentamos a Routes API
   * primeiro (com `TRAFFIC_AWARE` → tempo de viagem inclui trânsito actual
   * + cores de congestão por troço). Se a Routes API não estiver activada
   * para o projecto ou a chamada falhar, fazemos fallback para OSRM
   * (geometria sem trânsito).
   */
  googleApiKey?: string;
};

/**
 * Calcula a rota de condução entre dois pontos.
 *
 * Estratégia:
 *  1. **Google Routes API** (se `googleApiKey` fornecida) com `TRAFFIC_AWARE`.
 *     Devolve duração com trânsito + intervalos de congestão por segmento.
 *     ~10 USD por 1 000 chamadas; tipicamente coberto pelo crédito grátis
 *     mensal de 200 USD do Google Maps Platform.
 *  2. **OSRM** (fallback gratuito) — failover automático entre
 *     `router.project-osrm.org` e `routing.openstreetmap.de`, cada um com
 *     timeout de 10 s. Sem dados de trânsito.
 *  3. Se tudo falhar, devolve `null` — o UI trata mostrando estimativa em
 *     linha recta + botão "Tentar novamente".
 *
 * Em produção, o caller fornece a chave; em testes/dev sem chave o sistema
 * usa OSRM directamente.
 */
export async function fetchDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  options: FetchDrivingRouteOptions = {},
): Promise<DrivingRoute | null> {
  // 1) Google Routes API com trânsito (se houver chave).
  if (options.googleApiKey) {
    const googleResult = await fetchGoogleRoute(
      options.googleApiKey,
      origin,
      destination,
    );
    if (googleResult) return googleResult;
    console.info(
      "[SOT] Routes API indisponível, a recorrer ao OSRM (sem dados de trânsito).",
    );
  }
  // 2) OSRM público.
  const osrmResult = await fetchOsrmRoute(origin, destination);
  if (osrmResult) {
    return { ...osrmResult, provider: "osrm" };
  }
  return null;
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
