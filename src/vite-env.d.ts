/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absoluta da app principal quando o mobile está noutro domínio (opcional). */
  readonly VITE_PRIMARY_APP_URL?: string;
  /** Firebase Web App (Console → Configuração do projeto). Obrigatórios para sincronizar saídas na nuvem. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Opcional — URL HTTPS que recebe POST de localização da viatura. Por omissão: Cloud Function «postDriverLocation» na região southamerica-east1. */
  readonly VITE_DRIVER_LOCATION_POST_URL?: string;
  /** Opcional — Chave da Google Maps JavaScript API (consumida pelo `GoogleMapComponent`). */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /**
   * Opcional mas recomendado — Map ID (Cloud-based Maps Styling).
   * Necessário para `AdvancedMarkerElement` (marcadores HTML modernos no
   * modal de navegação). Criar em Cloud Console → Maps Platform → Map
   * Styles → Criar novo mapa (tipo Vector).
   */
  readonly VITE_GOOGLE_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
