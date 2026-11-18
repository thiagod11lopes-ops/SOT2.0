import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  queryTripPermissionsStatus,
  requestTripCallsPermission,
  requestTripLocationPermission,
  requestTripPermissions,
} from "../lib/mobileTripPermissions";
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

/** Autorização com checklist: localização + chamadas; só inicia quando as duas estão aceites. */
export function TripPermissionsModal({
  motorista,
  placa,
  busy,
  onBusyChange,
  onCancel,
  onAuthorized,
}: TripPermissionsModalProps) {
  const locId = useId();
  const callsId = useId();
  const [erro, setErro] = useState("");
  const [locationChecked, setLocationChecked] = useState(false);
  const [callsChecked, setCallsChecked] = useState(false);
  const [locationAccepted, setLocationAccepted] = useState(false);
  const [callsAccepted, setCallsAccepted] = useState(false);
  const [itemBusy, setItemBusy] = useState<"location" | "calls" | null>(null);

  const allReady = locationChecked && locationAccepted && callsChecked && callsAccepted;
  const locked = busy || itemBusy !== null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await queryTripPermissionsStatus(motorista);
      if (cancelled) return;
      if (status.locationGranted) {
        setLocationChecked(true);
        setLocationAccepted(true);
      }
      if (status.callsGranted) {
        setCallsChecked(true);
        setCallsAccepted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [motorista]);

  async function toggleLocation(next: boolean) {
    if (locked) return;
    setErro("");
    if (!next) {
      setLocationChecked(false);
      setLocationAccepted(false);
      return;
    }
    setLocationChecked(true);
    setItemBusy("location");
    const falha = await requestTripLocationPermission();
    setItemBusy(null);
    if (falha) {
      setLocationChecked(false);
      setLocationAccepted(false);
      setErro(falha);
      return;
    }
    setLocationAccepted(true);
  }

  async function toggleCalls(next: boolean) {
    if (locked) return;
    setErro("");
    if (!next) {
      setCallsChecked(false);
      setCallsAccepted(false);
      return;
    }
    setCallsChecked(true);
    setItemBusy("calls");
    const falha = await requestTripCallsPermission(motorista);
    setItemBusy(null);
    if (falha) {
      setCallsChecked(false);
      setCallsAccepted(false);
      setErro(falha);
      return;
    }
    setCallsAccepted(true);
  }

  async function iniciar() {
    if (busy || !allReady) return;
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
        if (e.target === e.currentTarget && !locked) onCancel();
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
          Marque e aceite as duas permissões abaixo. O botão de iniciar só fica ativo quando ambas estiverem
          aceites. Isto é pedido uma vez neste celular; nas próximas saídas não volta a perguntar.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          Com o celular bloqueado, a chamada aparece como notificação do sistema (toque / Atender). Nas definições
          do Android, permita notificações deste site na tela de bloqueio e importância Alta/Alertas. No iPhone,
          use o SOT adicionado à tela de início.
        </p>

        <ul className="mt-4 space-y-3">
          <li>
            <label
              htmlFor={locId}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                locationAccepted
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25",
                locked && "cursor-wait opacity-80",
              )}
            >
              <input
                id={locId}
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                checked={locationChecked && locationAccepted}
                disabled={locked}
                onChange={(e) => void toggleLocation(e.target.checked)}
              />
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Partilhar localização</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  A posição da viatura é enviada ao HNMD durante a viagem para acompanhamento em tempo real.
                </p>
                {itemBusy === "location" ? (
                  <p className="mt-1 text-xs font-medium text-[hsl(var(--primary))]">A pedir permissão...</p>
                ) : locationAccepted ? (
                  <p className="mt-1 text-xs font-medium text-emerald-600">Aceite</p>
                ) : null}
              </div>
            </label>
          </li>
          <li>
            <label
              htmlFor={callsId}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                callsAccepted
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25",
                locked && "cursor-wait opacity-80",
              )}
            >
              <input
                id={callsId}
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                checked={callsChecked && callsAccepted}
                disabled={locked}
                onChange={(e) => void toggleCalls(e.target.checked)}
              />
              <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Receber chamadas do HNMD</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  O celular pode receber chamadas do SOT mesmo bloqueado, pedindo o envio da localização. O aviso
                  aparece na tela de bloqueio com vibração (sem som).
                </p>
                {itemBusy === "calls" ? (
                  <p className="mt-1 text-xs font-medium text-[hsl(var(--primary))]">A pedir permissão...</p>
                ) : callsAccepted ? (
                  <p className="mt-1 text-xs font-medium text-emerald-600">Aceite</p>
                ) : null}
              </div>
            </label>
          </li>
        </ul>

        {erro ? <p className="mt-3 text-sm text-red-500">{erro}</p> : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={locked} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-xl font-semibold"
            disabled={locked || !allReady}
            onClick={() => void iniciar()}
          >
            {busy ? "A iniciar..." : "Iniciar saída"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
