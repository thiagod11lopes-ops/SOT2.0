/**
 * Hook React que envolve a **Screen Wake Lock API** para impedir que o ecrã
 * do telemóvel apague enquanto o componente que o consome estiver montado.
 *
 * Casos de uso típicos no SOT:
 *  • Mapa de navegação activa (utilizador a olhar para a rota).
 *  • Tela cheia com GPS contínuo (a Geolocation API é fortemente "throttled"
 *    pelo iOS/Android quando a tela apaga ou a app vai para background).
 *
 * Particularidades importantes da API que este hook abstrai:
 *
 *  1. **A wake lock é libertada automaticamente** pelo sistema quando o
 *     documento perde visibilidade (utilizador troca de separador/app, ecrã
 *     trava). Para garantir que a lock volta quando o utilizador regressa,
 *     escutamos `visibilitychange` e re-pedimos.
 *
 *  2. **`navigator.wakeLock.request("screen")` é assíncrono** — entre o
 *     `await` e a chegada do `sentinel` o componente pode ter desmontado.
 *     Usamos uma flag `cancelled` capturada no closure para libertar logo
 *     a lock se isso acontecer (sem isso teríamos ecrãs presos ligados
 *     mesmo depois do mapa fechar).
 *
 *  3. **Disponível só em contextos seguros** (HTTPS ou `localhost`) e em
 *     browsers modernos (Chrome 84+, Edge 84+, Safari iOS 16.4+, Android
 *     WebView recente). Em browsers sem suporte, o hook não rebenta — só
 *     reporta `isSupported: false` e segue a vida.
 *
 *  4. **Não pede permissão ao utilizador** (ao contrário da Geolocation API
 *     ou das notificações). É um pedido implícito ao SO; pode falhar com
 *     `NotAllowedError` em policies restritivas (ex.: iframe sem `allow`
 *     correcto), e nesse caso o erro é exposto via `error`.
 */

import { useEffect, useRef, useState } from "react";

export type UseScreenWakeLockOptions = {
  /**
   * Liga/desliga o pedido de wake lock. Quando `false`, qualquer lock activo
   * é libertado de imediato. Default: `true`.
   */
  enabled?: boolean;
};

export type UseScreenWakeLockResult = {
  /** `true` enquanto temos uma `WakeLockSentinel` activa (e não libertada). */
  isActive: boolean;
  /**
   * `false` em browsers/contextos sem suporte (Safari iOS < 16.4, contexto
   * não-seguro, SSR). Permite ao consumidor mostrar uma dica ao utilizador
   * (ex.: «Para evitar que o ecrã apague, instala como PWA»).
   */
  isSupported: boolean;
  /**
   * Último erro reportado pela API. Limpo automaticamente quando uma nova
   * tentativa for bem sucedida.
   */
  error: Error | null;
};

export function useScreenWakeLock(
  options: UseScreenWakeLockOptions = {},
): UseScreenWakeLockResult {
  const { enabled = true } = options;

  const isSupported =
    typeof navigator !== "undefined" &&
    typeof document !== "undefined" &&
    "wakeLock" in navigator;

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Mantemos a `WakeLockSentinel` numa ref para o cleanup conseguir libertá-la
   * sem depender do ciclo de re-renders do React.
   */
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!isSupported || !enabled) {
      setIsActive(false);
      return;
    }

    /**
     * Flag de "componente já desmontou ou efeito vai ser re-executado". Capturada
     * no closure de todos os `await`s para libertarmos a lock se ela chegar
     * depois do cleanup. Sem isto, em apps com Strict Mode (dev) ou cenários
     * onde o componente desmonta rapidamente, ficaríamos com uma lock "órfã".
     */
    let cancelled = false;

    const requestLock = async () => {
      if (cancelled) return;
      // Wake locks só podem ser adquiridas com o documento visível —
      // pedi-las com tab escondida lança `NotAllowedError`. Esperamos o
      // `visibilitychange` para tentar de novo.
      if (document.visibilityState !== "visible") return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await safeRelease(sentinel);
          return;
        }
        sentinelRef.current = sentinel;
        setIsActive(true);
        setError(null);
        // O sistema pode libertar a lock por sua iniciativa (bateria fraca,
        // troca de app, etc.) — reflectimos isso no estado para o consumidor
        // saber. Tentaremos re-adquirir via `visibilitychange` ou no próximo
        // re-run do effect.
        sentinel.addEventListener("release", () => {
          if (!cancelled) setIsActive(false);
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsActive(false);
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        void requestLock();
      }
    };

    void requestLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) {
        void safeRelease(sentinel);
      }
      setIsActive(false);
    };
  }, [enabled, isSupported]);

  return { isActive, isSupported, error };
}

/** Liberta uma `WakeLockSentinel` ignorando erros (best-effort). */
async function safeRelease(sentinel: WakeLockSentinel): Promise<void> {
  try {
    if (!sentinel.released) {
      await sentinel.release();
    }
  } catch {
    // Releases falhados não são críticos — o SO acabará por libertar a lock
    // quando o documento descarregar.
  }
}
