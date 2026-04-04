import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DepartureKmFieldsPatch } from "../context/departures-context";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { normalize24hTime } from "../lib/timeInput";
import type { DepartureRecord } from "../types/departure";
import { listRowFromRecord } from "../types/departure";
import { cn } from "../lib/utils";
import { AmbulanciaSequenceModal } from "./ambulancia-sequence-modal";
import { KmSequenceModal, type KmWizardStep } from "./km-sequence-modal";

function Field({
  label,
  value,
  onChange,
  inputMode,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete="off"
        className={cn(
          "min-h-[2.75rem] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-sm text-[hsl(var(--foreground))] outline-none ring-0 transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/40",
          mono && "font-mono tabular-nums",
        )}
      />
    </label>
  );
}

type AmbDraft = {
  viaturas: string;
  motoristas: string;
  horaSaida: string;
  bairro: string;
  kmSaida: string;
  kmChegada: string;
  chegada: string;
};

function draftFromRecord(r: DepartureRecord): AmbDraft {
  return {
    viaturas: r.viaturas,
    motoristas: r.motoristas,
    horaSaida: r.horaSaida,
    bairro: r.bairro,
    kmSaida: formatKmThousandsPtBr(r.kmSaida),
    kmChegada: formatKmThousandsPtBr(r.kmChegada),
    chegada: r.chegada,
  };
}

export function DepartureCard({
  record,
  onPatchKm,
  updateDeparture,
  enableKmDoubleClickWizard = false,
  enableAmbulanciaWizard = false,
}: {
  record: DepartureRecord;
  onPatchKm: (patch: DepartureKmFieldsPatch) => void;
  updateDeparture?: (id: string, data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  enableKmDoubleClickWizard?: boolean;
  enableAmbulanciaWizard?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<0 | KmWizardStep>(0);
  const [draftKmSaida, setDraftKmSaida] = useState(() => formatKmThousandsPtBr(record.kmSaida));
  const [draftKmChegada, setDraftKmChegada] = useState(() => formatKmThousandsPtBr(record.kmChegada));
  const [draftChegada, setDraftChegada] = useState(record.chegada);
  const [ambStep, setAmbStep] = useState(0);
  const [ambDraft, setAmbDraft] = useState<AmbDraft>(() => draftFromRecord(record));
  const lastTouchRef = useRef(0);
  const row = listRowFromRecord(record);

  const kmSaidaPreenchido = record.kmSaida.trim().length > 0;
  const kmChegadaPreenchido = record.kmChegada.trim().length > 0;
  const chegadaPreenchido = record.chegada.trim().length > 0;
  const saidaFinalizada = kmSaidaPreenchido && kmChegadaPreenchido && chegadaPreenchido;

  useEffect(() => {
    setDraftKmSaida(formatKmThousandsPtBr(record.kmSaida));
    setDraftKmChegada(formatKmThousandsPtBr(record.kmChegada));
    setDraftChegada(record.chegada);
  }, [record.kmSaida, record.kmChegada, record.chegada]);

  useEffect(() => {
    if (ambStep === 0) setAmbDraft(draftFromRecord(record));
  }, [record, ambStep]);

  useEffect(() => {
    if (wizardStep === 0 && ambStep === 0) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [wizardStep, ambStep]);

  function commitChegada(raw: string) {
    onPatchKm({ chegada: normalize24hTime(raw) });
  }

  function openKmWizard() {
    if (!enableKmDoubleClickWizard) return;
    setDraftKmSaida(formatKmThousandsPtBr(record.kmSaida));
    setDraftKmChegada(formatKmThousandsPtBr(record.kmChegada));
    setDraftChegada(record.chegada);
    setWizardStep(1);
  }

  function openAmbWizard() {
    if (!enableAmbulanciaWizard || !updateDeparture) return;
    setAmbDraft(draftFromRecord(record));
    setAmbStep(1);
  }

  function handleCardDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (enableKmDoubleClickWizard) openKmWizard();
    else if (enableAmbulanciaWizard) openAmbWizard();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!enableKmDoubleClickWizard && !enableAmbulanciaWizard) return;
    const now = Date.now();
    if (now - lastTouchRef.current < 400) {
      e.preventDefault();
      if (enableKmDoubleClickWizard) openKmWizard();
      else if (enableAmbulanciaWizard) openAmbWizard();
      lastTouchRef.current = 0;
    } else {
      lastTouchRef.current = now;
    }
  }

  function handleAdminWizardOk() {
    if (wizardStep === 1) {
      onPatchKm({ kmSaida: draftKmSaida.trim() });
      setWizardStep(2);
      return;
    }
    if (wizardStep === 2) {
      onPatchKm({ kmChegada: draftKmChegada.trim() });
      setWizardStep(3);
      return;
    }
    onPatchKm({ chegada: draftChegada.trim() });
    setWizardStep(0);
  }

  function handleAdminWizardCancel() {
    setWizardStep(0);
  }

  function applyAmbPatch(partial: Partial<AmbDraft>) {
    if (!updateDeparture) return;
    updateDeparture(record.id, {
      ...record,
      ...partial,
    });
  }

  function handleAmbWizardOk() {
    if (!updateDeparture) return;
    const d = ambDraft;
    if (ambStep === 7) {
      updateDeparture(record.id, { ...record, chegada: d.chegada.trim() });
      setAmbStep(0);
      return;
    }
    switch (ambStep) {
      case 1:
        updateDeparture(record.id, { ...record, viaturas: d.viaturas.trim() });
        break;
      case 2:
        updateDeparture(record.id, { ...record, motoristas: d.motoristas.trim() });
        break;
      case 3:
        updateDeparture(record.id, { ...record, horaSaida: d.horaSaida.trim() });
        break;
      case 4:
        updateDeparture(record.id, { ...record, bairro: d.bairro.trim() });
        break;
      case 5:
        updateDeparture(record.id, { ...record, kmSaida: d.kmSaida.trim() });
        break;
      case 6:
        updateDeparture(record.id, { ...record, kmChegada: d.kmChegada.trim() });
        break;
      default:
        break;
    }
    setAmbStep((s) => s + 1);
  }

  function handleAmbWizardCancel() {
    setAmbStep(0);
  }

  function setAmbWizardValue(v: string) {
    switch (ambStep) {
      case 1:
        setAmbDraft((x) => ({ ...x, viaturas: v }));
        break;
      case 2:
        setAmbDraft((x) => ({ ...x, motoristas: v }));
        break;
      case 3:
        setAmbDraft((x) => ({ ...x, horaSaida: normalize24hTime(v) }));
        break;
      case 4:
        setAmbDraft((x) => ({ ...x, bairro: v }));
        break;
      case 5:
        setAmbDraft((x) => ({ ...x, kmSaida: formatKmThousandsPtBr(v) }));
        break;
      case 6:
        setAmbDraft((x) => ({ ...x, kmChegada: formatKmThousandsPtBr(v) }));
        break;
      case 7:
        setAmbDraft((x) => ({ ...x, chegada: normalize24hTime(v) }));
        break;
      default:
        break;
    }
  }

  const ambWizardValue =
    ambStep === 1
      ? ambDraft.viaturas
      : ambStep === 2
        ? ambDraft.motoristas
        : ambStep === 3
          ? ambDraft.horaSaida
          : ambStep === 4
            ? ambDraft.bairro
            : ambStep === 5
              ? ambDraft.kmSaida
              : ambStep === 6
                ? ambDraft.kmChegada
                : ambDraft.chegada;

  const adminWizardValue =
    wizardStep === 1 ? draftKmSaida : wizardStep === 2 ? draftKmChegada : draftChegada;

  function setAdminWizardValue(v: string) {
    if (wizardStep === 1) setDraftKmSaida(formatKmThousandsPtBr(v));
    else if (wizardStep === 2) setDraftKmChegada(formatKmThousandsPtBr(v));
    else setDraftChegada(normalize24hTime(v));
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-[hsl(var(--border))]/90 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--card))]/70 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] transition",
        open && "ring-1 ring-[hsl(var(--primary))]/35",
      )}
    >
      {kmSaidaPreenchido ? (
        <div
          role="status"
          aria-label={saidaFinalizada ? "Saída finalizada" : "Saída iniciada"}
          className={cn(
            "w-full border-b border-black/10 py-1.5 text-center text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white",
            saidaFinalizada
              ? "bg-[hsl(217_75%_42%)]"
              : "bg-[hsl(152_65%_32%)]",
          )}
        >
          {saidaFinalizada ? "Finalizada" : "Iniciada"}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={handleCardDoubleClick}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "manipulation" }}
        className="flex min-h-[4.5rem] w-full items-stretch gap-3 p-4 text-left active:bg-[hsl(var(--muted))]/20"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-bold tabular-nums text-[hsl(var(--primary))]">{row.saida}</span>
            <span className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{row.viatura}</span>
          </div>
          <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{row.motorista}</p>
          <p className="truncate text-sm">
            <span className="text-[hsl(var(--muted-foreground))]">Dest. </span>
            <span className="font-medium text-[hsl(var(--foreground))]">{row.destino}</span>
          </p>
          {enableKmDoubleClickWizard ? (
            <p className="text-[0.65rem] text-[hsl(var(--muted-foreground))]">
              Duplo clique ou duplo toque: KM saída → KM chegada → chegada
            </p>
          ) : null}
          {enableAmbulanciaWizard ? (
            <p className="text-[0.65rem] text-[hsl(var(--muted-foreground))]">
              Duplo clique ou duplo toque: Viatura → Motorista → Saída → Destino → KM saída → KM chegada → Chegada
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-1">
          <span className="rounded-lg bg-[hsl(var(--muted))]/60 px-2 py-0.5 text-[0.65rem] font-bold text-[hsl(var(--foreground))]">
            {row.om}
          </span>
          {open ? (
            <ChevronUp className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
          ) : (
            <ChevronDown className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
          )}
        </div>
      </button>

      {open && enableAmbulanciaWizard && updateDeparture ? (
        <div className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4">
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Edição rápida (mesma ordem)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Viatura" value={record.viaturas} onChange={(v) => applyAmbPatch({ viaturas: v })} />
            <Field label="Motorista" value={record.motoristas} onChange={(v) => applyAmbPatch({ motoristas: v })} />
            <Field
              label="Saída (hora)"
              value={record.horaSaida}
              onChange={(v) => applyAmbPatch({ horaSaida: normalize24hTime(v) })}
              inputMode="numeric"
              mono
            />
            <Field label="Destino (bairro)" value={record.bairro} onChange={(v) => applyAmbPatch({ bairro: v })} />
            <Field
              label="KM saída"
              value={formatKmThousandsPtBr(record.kmSaida)}
              onChange={(v) => applyAmbPatch({ kmSaida: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
            />
            <Field
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onChange={(v) => applyAmbPatch({ kmChegada: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
            />
            <Field
              label="Chegada (hora)"
              value={record.chegada}
              onChange={(v) => applyAmbPatch({ chegada: normalize24hTime(v) })}
              inputMode="numeric"
              mono
            />
          </div>
        </div>
      ) : null}

      {open && !enableAmbulanciaWizard ? (
        <div className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Setor / ramal
              </p>
              <p className="text-sm text-[hsl(var(--foreground))]">
                {record.setor.trim() || "—"} · {record.ramal.trim() || "—"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Objetivo
              </p>
              <p className="text-sm leading-snug text-[hsl(var(--foreground))]">
                {record.objetivoSaida.trim() || "—"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label="KM saída"
              value={formatKmThousandsPtBr(record.kmSaida)}
              onChange={(v) => onPatchKm({ kmSaida: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
            />
            <Field
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onChange={(v) => onPatchKm({ kmChegada: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
            />
            <Field
              label="Chegada (hora)"
              value={record.chegada}
              onChange={(v) => commitChegada(v)}
              inputMode="numeric"
              mono
            />
          </div>
        </div>
      ) : null}

      {wizardStep !== 0 ? (
        <KmSequenceModal
          step={wizardStep as KmWizardStep}
          value={adminWizardValue}
          onChangeValue={setAdminWizardValue}
          onOk={handleAdminWizardOk}
          onCancel={handleAdminWizardCancel}
        />
      ) : null}

      {ambStep !== 0 ? (
        <AmbulanciaSequenceModal
          step={ambStep}
          value={ambWizardValue}
          onChangeValue={setAmbWizardValue}
          onOk={handleAmbWizardOk}
          onCancel={handleAmbWizardCancel}
        />
      ) : null}
    </article>
  );
}
