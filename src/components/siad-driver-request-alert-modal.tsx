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
      className="fixed inset-0 z-[320] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="siad-driver-alert-title"
      aria-describedby="siad-driver-alert-desc"
      aria-live="assertive"
      onPointerDown={() => primeSiadDriverRequestSpeech()}
    >
      <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-md" aria-hidden />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-orange-300/30 bg-gradient-to-br from-white via-orange-50 to-amber-100 p-8 text-center shadow-[0_40px_100px_-24px_rgba(249,115,22,0.65)] dark:from-slate-900 dark:via-slate-900 dark:to-orange-950/50">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-amber-400/20 blur-3xl" />

        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-orange-400/25" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/40">
            <Radio className="h-10 w-10 text-white" strokeWidth={2.1} aria-hidden />
          </div>
        </div>

        <div className="relative mt-6 space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-orange-600 dark:text-orange-400">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.22em]">Alerta operacional</span>
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <h2
            id="siad-driver-alert-title"
            className="text-3xl font-black tracking-tight text-slate-900 dark:text-white"
          >
            SIAD SOLICITADO
          </h2>
          <p id="siad-driver-alert-desc" className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
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
          <p className="mx-auto mt-3 flex max-w-sm items-start justify-center gap-2 rounded-xl border border-orange-200/80 bg-orange-50/90 px-3 py-2.5 text-left text-sm font-medium leading-snug text-orange-900 dark:border-orange-500/25 dark:bg-orange-950/40 dark:text-orange-100">
            <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-300" aria-hidden />
            <span>{speechText}</span>
          </p>
        </div>

        <div className="relative mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            className="h-12 min-w-[11rem] rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-base font-semibold text-white shadow-md shadow-orange-500/35 hover:brightness-105"
            onClick={handleConfirm}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden />
            Confirmar saída
          </Button>
        </div>

        <p className="relative mt-4 inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <CarFront className="h-3.5 w-3.5" aria-hidden />
          Integração Saídas SIAD ↔ SOT 2.0
        </p>
      </div>
    </div>,
    document.body,
  );
}
