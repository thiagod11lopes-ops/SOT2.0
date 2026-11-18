import { useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { requestTripPermissions } from "../lib/mobileTripPermissions";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { cn } from "../lib/utils";

type TripPermissionsModalProps = {
  motorista: string;
  placa: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onAuthorized: () => void;
};

/** Autorização profissional: localização + chamadas com o celular bloqueado. */
export function TripPermissionsModal({
  motorista,
  placa,
  busy,
  onBusyChange,
  onCancel,
  onAuthorized,
}: TripPermissionsModalProps) {
  const [erro, setErro] = useState("");

  async function permitir() {
    if (busy) return;
    onBusyChange(true);
    setErro("");
    const falha = await requestTripPermissions(motorista);
    if (falha) {
      setErro(falha);
      onBusyChange(false);
      return;
    }
    onAuthorized();
  }

  return createPortal(
    <div
      className={cn(MOBILE_MODAL_OVERLAY_CLASS, "z-[560] items-center justify-center pt-8")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sot-trip-perm-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="sot-trip-perm-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
              Autorização para a viagem
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Motorista <span className="font-semibold text-[hsl(var(--foreground))]">{motorista}</span>
              {" · "}
              Viatura <span className="font-semibold text-[hsl(var(--foreground))]">{placa}</span>
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--foreground))]">
          Para iniciar a saída, o SOT precisa da sua autorização. Isto é pedido uma vez neste celular. Se permitir
          sempre, as próximas saídas seguem sem perguntar de novo.
        </p>

        <ul className="mt-4 space-y-3">
          <li className="flex gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 p-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Partilhar localização</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                A posição da viatura é enviada ao HNMD durante a viagem para acompanhamento em tempo real.
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 p-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Receber chamadas do HNMD</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                O celular pode receber chamadas do SOT mesmo bloqueado, pedindo o envio da localização. O aviso
                aparece na tela de bloqueio com som e vibração.
              </p>
            </div>
          </li>
        </ul>

        {erro ? <p className="mt-3 text-sm text-red-500">{erro}</p> : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-11 rounded-xl font-semibold" disabled={busy} onClick={() => void permitir()}>
            {busy ? "A autorizar..." : "Permitir e iniciar saída"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
