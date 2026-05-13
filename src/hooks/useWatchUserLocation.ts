/**
 * Hook React que envolve `navigator.geolocation.watchPosition` para
 * rastreamento contínuo da posição do utilizador.
 *
 * Opções por defeito (alinhadas com a especificação do projecto):
 *   • enableHighAccuracy: true   → força GPS quando disponível (em vez de
 *                                   wifi/cell-tower). Maior consumo de bateria
 *                                   mas precisão metro-a-metro.
 *   • maximumAge: 0              → nunca devolve uma posição em cache; o
 *                                   browser pede sempre uma medição nova.
 *   • timeout: 5000              → se o GPS demorar > 5 s a responder, o
 *                                   callback de erro dispara.
 *
 * O hook trata automaticamente o ciclo de vida: arranca o watch quando
 * `enabled` é true, e chama `clearWatch` ao desmontar ou quando `enabled`
 * passa a false — evita drenar bateria após o componente desaparecer.
 */

import { useEffect, useRef, useState } from "react";

/** Posição capturada do utilizador (subconjunto útil de `GeolocationPosition`). */
export type WatchedPosition = {
  lat: number;
  lng: number;
  /** Precisão horizontal em metros (raio do círculo de confiança 68 %). */
  accuracy: number;
  /** Rumo em graus (0 = norte). `null` se o dispositivo está parado. */
  heading: number | null;
  /** Velocidade em m/s. `null` quando não disponível. */
  speed: number | null;
  /** Altitude em metros acima do elipsóide WGS-84. `null` se indisponível. */
  altitude: number | null;
  /** `Date.now()` no momento em que o browser entregou a posição. */
  timestamp: number;
};

export type UseWatchUserLocationOptions = {
  /**
   * Liga/desliga o rastreamento. Quando false (ou ausente em ambientes sem
   * `navigator.geolocation`), o hook não chama `watchPosition` e devolve
   * `position: null`. Default: `true`.
   */
  enabled?: boolean;
  /** Default: `true`. */
  enableHighAccuracy?: boolean;
  /** Default: `0` (nunca aceita cache). */
  maximumAge?: number;
  /** Default: `5000` ms. */
  timeout?: number;
};

export type UseWatchUserLocationResult = {
  /** Última posição recebida do browser, ou `null` se ainda não houver fixe. */
  position: WatchedPosition | null;
  /** Último erro reportado pela Geolocation API. */
  error: GeolocationPositionError | null;
  /** `true` enquanto um `watchPosition` activo estiver em curso. */
  isWatching: boolean;
  /** `false` em browsers/contextos sem suporte (ex.: SSR, http inseguro). */
  isSupported: boolean;
};

const DEFAULT_OPTIONS: Required<Omit<UseWatchUserLocationOptions, "enabled">> = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 5000,
};

export function useWatchUserLocation(
  options: UseWatchUserLocationOptions = {},
): UseWatchUserLocationResult {
  const {
    enabled = true,
    enableHighAccuracy = DEFAULT_OPTIONS.enableHighAccuracy,
    maximumAge = DEFAULT_OPTIONS.maximumAge,
    timeout = DEFAULT_OPTIONS.timeout,
  } = options;

  const isSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.geolocation !== "undefined" &&
    typeof navigator.geolocation.watchPosition === "function";

  const [position, setPosition] = useState<WatchedPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isWatching, setIsWatching] = useState(false);

  /**
   * Mantemos o `watchId` numa ref para garantir que o cleanup vê sempre o
   * último ID, mesmo se o componente re-renderizar antes do `useEffect`
   * processar a próxima execução.
   */
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isSupported || !enabled) {
      setIsWatching(false);
      return;
    }

    const handleSuccess: PositionCallback = (pos) => {
      setError(null);
      setPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        altitude: pos.coords.altitude,
        timestamp: pos.timestamp,
      });
    };

    const handleError: PositionErrorCallback = (err) => {
      setError(err);
    };

    const id = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy,
      maximumAge,
      timeout,
    });
    watchIdRef.current = id;
    setIsWatching(true);

    /**
     * Cleanup garantido pelo React em três situações:
     *   1. O componente que usa este hook é desmontado.
     *   2. Uma das dependências do `useEffect` muda (ex.: `enabled` passa a
     *      `false`, `timeout` muda, etc.) — antes de criar um novo watch.
     *   3. Strict Mode em desenvolvimento (effect corre 2× para flush forçado).
     *
     * Em todos os casos, `clearWatch` desliga o GPS, evitando:
     *   • Fuga de memória (callbacks a tentar `setState` num componente
     *     desmontado).
     *   • Consumo desnecessário de bateria (GPS contínuo no telemóvel).
     *   • Permissões "presas" no browser depois da app fechar.
     */
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsWatching(false);
    };
  }, [isSupported, enabled, enableHighAccuracy, maximumAge, timeout]);

  return { position, error, isWatching, isSupported };
}
