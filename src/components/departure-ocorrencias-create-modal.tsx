import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Ambulance, Building2 } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import { useUnlinkedOccurrences } from "../context/unlinked-occurrences-context";
import { findDeparturesForOccurrenceLink } from "../lib/findDeparturesForOccurrenceLink";
import type { DepartureRecord, DepartureType } from "../types/departure";
import { NAO_VINCULAR_PLACA_VALUE } from "../types/unlinkedOccurrence";
import { MergedDeparturePickRecordModal } from "./merged-departure-pick-record-modal";
import { OccurrenceRubricaCapturePanel } from "./occurrence-rubrica-capture-panel";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type Step = "tipo" | "form" | "rubrica";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDatePtBr: string;
  viaturasAdministrativas: string[];
  ambulancias: string[];
  /** Mobile: modal no topo. */
  alignTop?: boolean;
};

export function DepartureOcorrenciasCreateModal({
  open,
  onOpenChange,
  defaultDatePtBr,
  viaturasAdministrativas,
  ambulancias,
  alignTop = false,
}: Props) {
  const titleId = useId();
  const textId = useId();
  const placaId = useId();
  const { departures, updateDeparture } = useDepartures();
  const { addUnlinkedOccurrence } = useUnlinkedOccurrences();

  const [step, setStep] = useState<Step>("tipo");
  const [tipo, setTipo] = useState<DepartureType | null>(null);
  const [dataSaida, setDataSaida] = useState(defaultDatePtBr);
  const [placa, setPlaca] = useState(NAO_VINCULAR_PLACA_VALUE);
  const [texto, setTexto] = useState("");
  const [pickRecords, setPickRecords] = useState<DepartureRecord[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const pendingRecordRef = useRef<DepartureRecord | null>(null);
  const [rubricaPadKey, setRubricaPadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep("tipo");
    setTipo(null);
    setDataSaida(defaultDatePtBr);
    setPlaca(NAO_VINCULAR_PLACA_VALUE);
    setTexto("");
    setPickRecords([]);
    setPickOpen(false);
    pendingRecordRef.current = null;
    setRubricaPadKey((k) => k + 1);
  }, [open, defaultDatePtBr]);

  const placaOptions = useMemo(() => {
    const base = tipo === "Ambulância" ? ambulancias : viaturasAdministrativas;
    return [...base].filter((v) => v.trim().length > 0);
  }, [tipo, ambulancias, viaturasAdministrativas]);

  if (!open) return null;

  function fechar() {
    onOpenChange(false);
  }

  function escolherTipo(next: DepartureType) {
    setTipo(next);
    setPlaca(NAO_VINCULAR_PLACA_VALUE);
    setStep("form");
  }

  function salvarComRubrica(rubricaDataUrl: string) {
    const textoFinal = texto.trim();
    const data = dataSaida.trim();
    if (!tipo || !textoFinal) return;

    if (placa === NAO_VINCULAR_PLACA_VALUE) {
      addUnlinkedOccurrence({ dataSaida: data, tipo, texto: textoFinal, rubrica: rubricaDataUrl });
      fechar();
      return;
    }

    const record = pendingRecordRef.current;
    if (!record) return;
    const { id, createdAt, ...rest } = record;
    void createdAt;
    updateDeparture(id, {
      ...rest,
      ocorrencias: textoFinal,
      ocorrenciasRubrica: rubricaDataUrl,
    });
    pendingRecordRef.current = null;
    fechar();
  }

  function iniciarRubricaParaRegisto(record: DepartureRecord) {
    pendingRecordRef.current = record;
    setRubricaPadKey((k) => k + 1);
    setStep("rubrica");
  }

  function concluirGuardar() {
    const textoFinal = texto.trim();
    const data = dataSaida.trim();
    if (!tipo) return;
    if (!textoFinal) {
      window.alert("Descreva a ocorrência antes de guardar.");
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
      window.alert("Indique a data da saída no formato dd/mm/aaaa.");
      return;
    }

    if (placa === NAO_VINCULAR_PLACA_VALUE) {
      // Para ocorrências desvinculadas, não precisamos de assinatura.
      // O campo 'rubrica' aqui deve ser texto, então passamos undefined.
      addUnlinkedOccurrence({ dataSaida: data, tipo, texto: textoFinal, rubrica: undefined });
      fechar();
      return;
    }

    const matches = findDeparturesForOccurrenceLink({
      departures,
      dataSaidaPtBr: data,
      tipo,
      placa,
    });

    if (matches.length === 0) {
      window.alert(
        `Nenhuma saída ${tipo.toLowerCase()} encontrada para a viatura «${placa}» em ${data}. Escolha «Não vincular placa» ou cadastre a saída.`,
      );
      return;
    }

    if (matches.length === 1) {
      iniciarRubricaParaRegisto(matches[0]!);
      return;
    }

    setPickRecords(matches);
    setPickOpen(true);
  }

  return (
    <>
      <div
        className={cn(
          "pointer-events-auto fixed inset-0 flex justify-center bg-black/55 p-4",
          alignTop
            ? "z-[500] items-start pt-[max(1rem,env(safe-area-inset-top,0px))]"
            : "z-[320] items-end sm:items-center",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) fechar();
        }}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Ocorrências
          </h2>

          {step === "tipo" ? (
            <>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                A ocorrência é para saídas de ambulância ou administrativas?
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-14 flex-col gap-1 border-sky-400/55 bg-white py-3 font-extrabold text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
                  onClick={() => escolherTipo("Ambulância")}
                >
                  <Ambulance className="h-5 w-5 text-sky-500" aria-hidden />
                  <span>Serviço</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-14 flex-col gap-1 border-amber-400/55 bg-white py-3 font-extrabold text-amber-600 hover:bg-amber-500/10 hover:text-amber-500"
                  onClick={() => escolherTipo("Administrativa")}
                >
                  <Building2 className="h-5 w-5 text-amber-600" aria-hidden />
                  <span>Administrativo</span>
                </Button>
              </div>
              <div className="mt-6 flex justify-end">
                <Button type="button" onClick={fechar}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : step === "form" ? (
            <>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {tipo === "Ambulância" ? "Serviço" : "Administrativo"} — vincule a uma placa ou registe sem viatura
                (aparece no PDF entre a tabela e a assinatura, alinhada à esquerda).
              </p>

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ocorrencia-data-saida">
                    Data da saída
                  </label>
                  <input
                    id="ocorrencia-data-saida"
                    value={dataSaida}
                    onChange={(e) => setDataSaida(e.target.value)}
                    placeholder="dd/mm/aaaa"
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor={placaId}>
                    Viatura
                  </label>
                  <select
                    id={placaId}
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value)}
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
                  >
                    <option value={NAO_VINCULAR_PLACA_VALUE}>Não vincular placa</option>
                    {placaOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor={textId}>
                    Descrição da ocorrência
                  </label>
                  <textarea
                    id={textId}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={5}
                    className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                    placeholder="Descreva a ocorrência…"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button type="button" onClick={() => setStep("tipo")}>
                  Voltar
                </Button>
                <Button type="button" onClick={fechar}>
                  Cancelar
                </Button>
                <Button type="button" variant="default" onClick={concluirGuardar}>
                  Guardar
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-3">
              <OccurrenceRubricaCapturePanel
                padKey={rubricaPadKey}
                onCancel={() => setStep("form")}
                onConfirm={salvarComRubrica}
              />
            </div>
          )}
        </div>
      </div>

      <MergedDeparturePickRecordModal
        open={pickOpen}
        onOpenChange={setPickOpen}
        records={pickRecords}
        action="ocorrencias"
        onSelect={(record) => {
          setPickOpen(false);
          iniciarRubricaParaRegisto(record);
        }}
      />
    </>
  );
}
