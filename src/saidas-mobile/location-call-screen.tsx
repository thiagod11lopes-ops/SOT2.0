import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Phone, PhoneOff } from "lucide-react";

type LocationCallScreenProps = {
  busy: boolean;
  error: string;
  onEnviar: () => void;
  onRecusar: () => void;
};

/** Tela cheia no formato de uma ligação recebida, para o motorista enviar a posição. */
export function LocationCallScreen({ busy, error, onEnviar, onRecusar }: LocationCallScreenProps) {
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const pulse = () => {
      navigator.vibrate([180, 120, 180]);
    };
    pulse();
    const timer = window.setInterval(pulse, 2200);
    return () => {
      window.clearInterval(timer);
      navigator.vibrate(0);
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sot-location-call-title"
      className="fixed inset-0 z-[640] flex flex-col bg-black text-white"
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <style>{`
        @keyframes sot-call-ring {
          0% { transform: scale(0.72); opacity: 0.55; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sot-call-ring { animation: none !important; opacity: 0.25; }
        }
      `}</style>

      <p className="pt-6 text-center text-sm font-medium tracking-wide text-white/70">Ligação do SOT</p>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative flex h-40 w-40 items-center justify-center">
          <span className="sot-call-ring absolute inset-0 rounded-full border border-white/40" style={{ animation: "sot-call-ring 2.2s ease-out infinite" }} />
          <span className="sot-call-ring absolute inset-0 rounded-full border border-white/30" style={{ animation: "sot-call-ring 2.2s ease-out 0.7s infinite" }} />
          <span className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/10">
            <Phone className="h-12 w-12" aria-hidden />
          </span>
        </div>
        <h2 id="sot-location-call-title" className="mt-10 max-w-xs text-center text-2xl font-semibold leading-snug">
          Enviar localização para HNMD
        </h2>
        {error ? <p className="mt-4 max-w-xs text-center text-sm text-red-300">{error}</p> : null}
        {busy ? <p className="mt-4 text-sm text-white/70">A obter a localização...</p> : null}
      </div>

      <div className="flex items-end justify-center gap-16 px-8 pb-8">
        <button
          type="button"
          onClick={onRecusar}
          disabled={busy}
          className="flex flex-col items-center gap-2 disabled:opacity-50"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg active:bg-red-700">
            <PhoneOff className="h-7 w-7" aria-hidden />
          </span>
          <span className="text-sm font-medium">Recusar</span>
        </button>
        <button
          type="button"
          onClick={onEnviar}
          disabled={busy}
          className="flex flex-col items-center gap-2 disabled:opacity-50"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 shadow-lg active:bg-green-700">
            <Phone className="h-7 w-7" aria-hidden />
          </span>
          <span className="text-sm font-medium">Enviar</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
