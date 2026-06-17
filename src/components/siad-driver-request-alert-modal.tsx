import { CarFront, CheckCircle2, Radio, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useDepartures } from "../context/departures-context";
import { usePendingSiadDriverRequests } from "../hooks/useSiadDriverRequest";
import { confirmSiadDriverSlot } from "../lib/siadDriverRequest";
import { resolveSiadEscalatedMotorista } from "../lib/siadDayDepartures";
import {
  buildSiadDriverRequestSpeechText,
  primeSiadDriverRequestSpeech,
  startSiadDriverRequestSpeechLoop,
  stopSiadDriverRequestSpeech,
  type SiadDriverRequestSpeechHandle,
} from "../lib/siadDriverRequestSpeech";
import { Button } from "./ui/button";

export function SiadDriverRequestAlertModal() {
  const { departures } = useDepartures();
  const pending = usePendingSiadDriverRequests();
  const active = pending[0] ?? null;
  const open = Boolean(active);

  const motoristaEscalado = useMemo(() => {
    if (!active) return null;
    return resolveSiadEscalatedMotorista(departures, active.dateSaida, active.horaSaida);
  }, [departures, active]);

  const speechText = useMemo(
    () => buildSiadDriverRequestSpeechText(motoristaEscalado),
    [motoristaEscalado],
  );

  const speechSlotKey = active ? `${active.dateSaida}|${active.horaSaida ?? ""}` : "";
  const speechHandleRef = useRef<SiadDriverRequestSpeechHandle | null>(null);
  const speechTextRef = useRef(speechText);
  speechTextRef.current = speechText;

  useEffect(() => {
    if (!open) {
      speechHandleRef.current?.stop();
      speechHandleRef.current = null;
      stopSiadDriverRequestSpeech();
      return;
    }
    primeSiadDriverRequestSpeech();
    speechHandleRef.current?.stop();
    speechHandleRef.current = startSiadDriverRequestSpeechLoop(speechTextRef.current);
    return () => {
      speechHandleRef.current?.stop();
      speechHandleRef.current = null;
      stopSiadDriverRequestSpeech();
    };
  }, [open, speechSlotKey]);

  useEffect(() => {
    if (!open) return;
    speechHandleRef.current?.setText(speechText);
  }, [open, speechText]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !active) return null;

  const activeSlot = active;

  function handleConfirm() {
    stopSiadDriverRequestSpeech();
    speechHandleRef.current?.stop();
    speechHandleRef.current = null;
    confirmSiadDriverSlot(activeSlot);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex min-h-dvh w-full flex-col overflow-hidden bg-gradient-to-br from-white via-orange-50 to-amber-100 text-center dark:from-slate-900 dark:via-slate-900 dark:to-orange-950/50"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="siad-driver-alert-title"
      aria-describedby="siad-driver-alert-desc"
      aria-live="assertive"
      onPointerDown={() => primeSiadDriverRequestSpeech()}
    >
      <div className="pointer-events-none absolute -right-[18vw] -top-[18vw] h-[55vmin] w-[55vmin] rounded-full bg-orange-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-[16vw] -left-[14vw] h-[50vmin] w-[50vmin] rounded-full bg-amber-400/20 blur-3xl" />

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[4vmin] px-[5vw] py-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <div className="relative flex h-[22vmin] w-[22vmin] min-h-28 min-w-28 max-h-80 max-w-80 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-orange-400/25" />
          <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/40">
            <Radio className="h-[45%] w-[45%] text-white" strokeWidth={2.1} aria-hidden />
          </div>
        </div>

        <div className="flex w-full max-w-6xl flex-col items-center gap-[2.5vmin]">
          <div className="flex items-center justify-center gap-3 text-orange-600 dark:text-orange-400">
            <Sparkles className="h-[4vmin] w-[4vmin] min-h-5 min-w-5" aria-hidden />
            <span className="text-[clamp(0.7rem,1.6vmin,1rem)] font-semibold uppercase tracking-[0.22em]">
              Alerta operacional
            </span>
            <Sparkles className="h-[4vmin] w-[4vmin] min-h-5 min-w-5" aria-hidden />
          </div>
          <h2
            id="siad-driver-alert-title"
            className="text-[clamp(2.5rem,9vmin,7.5rem)] font-black leading-none tracking-tight text-slate-900 dark:text-white"
          >
            SIAD SOLICITADO
          </h2>
          <p
            id="siad-driver-alert-desc"
            className="max-w-5xl text-[clamp(1rem,2.4vmin,1.75rem)] leading-relaxed text-slate-600 dark:text-slate-300"
          >
            Saída de{" "}
            <strong className="font-semibold text-slate-900 dark:text-white">{active.dateSaida}</strong>
            {active.horaSaida ? (
              <>
                {" "}
                às <strong className="font-semibold text-slate-900 dark:text-white">{active.horaSaida}</strong>
              </>
            ) : null}
            {motoristaEscalado ? (
              <>
                {" "}
                — motorista <strong className="font-semibold text-slate-900 dark:text-white">{motoristaEscalado}</strong>
              </>
            ) : null}
            . Confirme para avisar o formulário de Saídas SIAD.
          </p>
          <p className="flex w-full max-w-5xl items-start justify-center gap-4 rounded-2xl border border-orange-200/80 bg-orange-50/90 px-[4vmin] py-[3vmin] text-left text-[clamp(1rem,2.2vmin,1.75rem)] font-medium leading-snug text-orange-900 dark:border-orange-500/25 dark:bg-orange-950/40 dark:text-orange-100">
            <Volume2
              className="mt-1 h-[4vmin] w-[4vmin] min-h-6 min-w-6 shrink-0 text-orange-600 dark:text-orange-300"
              aria-hidden
            />
            <span>{speechText}</span>
          </p>
        </div>

        <Button
          type="button"
          className="h-[clamp(3.5rem,10vmin,8rem)] w-full max-w-3xl rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 text-[clamp(1.1rem,2.8vmin,2rem)] font-semibold text-white shadow-md shadow-orange-500/35 hover:brightness-105"
          onClick={handleConfirm}
        >
          <CheckCircle2 className="mr-3 h-[clamp(1.25rem,4vmin,3rem)] w-[clamp(1.25rem,4vmin,3rem)]" aria-hidden />
          Confirmar motorista
        </Button>

        <p className="inline-flex items-center justify-center gap-3 text-[clamp(0.75rem,1.6vmin,1rem)] text-slate-500 dark:text-slate-400">
          <CarFront className="h-[clamp(1rem,3.5vmin,2.5rem)] w-[clamp(1rem,3.5vmin,2.5rem)]" aria-hidden />
          Integração Saídas SIAD ↔ SOT 2.0
        </p>
      </div>
    </div>,
    document.body,
  );
}
