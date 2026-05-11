import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  getActiveTrackingInfo,
  getCachedRastreamentoMotoristasPayload,
  subscribeActiveTrackingChange,
  type ActiveTrackingInfo,
} from "../lib/mobileDriverTracking";
import {
  DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS,
  intervaloRastreamentoMilliseconds,
} from "../lib/driverTrackingConfig";

function intervalLabelMinutos(): number {
  const cached = getCachedRastreamentoMotoristasPayload();
  const ms = intervaloRastreamentoMilliseconds(cached);
  if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 60_000);
  return DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS;
}

/** Mostra um aviso fixo no topo enquanto há rastreamento ativo, para o motorista não fechar a app. */
export function ActiveTrackingBanner() {
  const [info, setInfo] = useState<ActiveTrackingInfo>(() => getActiveTrackingInfo());

  useEffect(() => {
    return subscribeActiveTrackingChange(() => {
      setInfo(getActiveTrackingInfo());
    });
  }, []);

  if (!info) return null;

  const minutos = intervalLabelMinutos();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[540] flex justify-center px-3"
      style={{ top: "calc(var(--safe-top) + 0.5rem)" }}
    >
      <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-emerald-300/80 bg-emerald-50/95 px-3 py-2 text-emerald-900 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="relative flex h-2.5 w-2.5"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
          </span>
          <MapPin className="h-4 w-4 text-emerald-700" aria-hidden />
          <p className="text-[0.78rem] font-semibold leading-tight">
            Rastreamento ativo · {info.placa}
          </p>
        </div>
        <p className="mt-0.5 text-[0.7rem] leading-tight text-emerald-900/90">
          A localização é enviada a cada {minutos} min. Não feche a aplicação durante a viagem.
        </p>
      </div>
    </div>
  );
}
