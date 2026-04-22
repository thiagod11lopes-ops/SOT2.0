import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList, Signature } from "lucide-react";
import { DepartureOcorrenciasModal } from "../components/departure-ocorrencias-modal";
import { Button } from "../components/ui/button";
import { isRubricaImageDataUrl } from "../lib/rubricaDrawing";
import { mergeViaturasCatalog, useCatalogItems } from "../context/catalog-items-context";
import type { DepartureKmFieldsPatch } from "../context/departures-context";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { normalize24hTime } from "../lib/timeInput";
import { formatTipoSaidaAmbulancia, type DepartureRecord } from "../types/departure";
import { listRowFromRecord } from "../types/departure";
import {
  getRdvPlacasNaOficinaFromLatestPersistedRdv,
  RDV_STORAGE_EVENT,
} from "../lib/relatorioDiarioViaturasStorage";
import { cn } from "../lib/utils";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { RubricaSignaturePad, type RubricaSignaturePadHandle } from "./rubrica-signature-pad";
import { MobileEditableSelectField, MobileEditableTextField } from "./mobile-field-edit-modal";
import { useMobileLoadingOverlay } from "./mobile-loading-overlay";

export function DepartureCard({
  record,
  onPatchKm,
  updateDeparture,
  isSelectedForExcluir,
  onSelectForExcluir,
  allowMobileEdit = true,
  mergedDestinoDisplay,
  mergedSetorDisplay,
}: {
  record: DepartureRecord;
  onPatchKm: (patch: DepartureKmFieldsPatch) => void;
  updateDeparture?: (id: string, data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  /** Ambulância: destaque da saída escolhida para poder usar «Excluir Saída». */
  isSelectedForExcluir?: boolean;
  /** Ambulância: chamado ao tocar no cabeçalho do cartão (junto com expandir). */
  onSelectForExcluir?: () => void;
  /** No separador mobile, só o dia atual pode ser alterado; outros dias são só leitura. */
  allowMobileEdit?: boolean;
  /** Quando vários registos são fundidos num cartão (mesma hora, viatura e motorista): destino combinado. */
  mergedDestinoDisplay?: string;
  /** Idem: setores combinados (vista administrativa). */
  mergedSetorDisplay?: string;
}) {
  const { runWithProgress } = useMobileLoadingOverlay();
  const [open, setOpen] = useState(false);
  const [rubricaModalOpen, setRubricaModalOpen] = useState(false);
  const [ocorrenciasModalOpen, setOcorrenciasModalOpen] = useState(false);
  const rubricaPadRef = useRef<RubricaSignaturePadHandle>(null);
  const rubricaTitleId = useId();
  const row = listRowFromRecord(record);
  const { items: catalogItems } = useCatalogItems();
  const [rdvOficinaTick, setRdvOficinaTick] = useState(0);
  useEffect(() => {
    const on = () => setRdvOficinaTick((t) => t + 1);
    window.addEventListener(RDV_STORAGE_EVENT, on);
    return () => window.removeEventListener(RDV_STORAGE_EVENT, on);
  }, []);
  const rdvPlacasNaOficinaLower = useMemo(() => {
    void rdvOficinaTick;
    return new Set(
      getRdvPlacasNaOficinaFromLatestPersistedRdv()
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
    );
  }, [rdvOficinaTick]);
  /** Ambulância: só placas de «Ambulâncias» em Frota e Pessoal e fora da oficina (RDV col. Oficina, igual ao cadastro principal). */
  const viaturasAmbDisponiveis = useMemo(
    () => catalogItems.ambulancias.filter((p) => !rdvPlacasNaOficinaLower.has(p.trim().toLowerCase())),
    [catalogItems.ambulancias, rdvPlacasNaOficinaLower],
  );
  const viaturasOpcoes = useMemo(() => {
    if (record.tipo !== "Ambulância") return mergeViaturasCatalog(catalogItems);
    return viaturasAmbDisponiveis;
  }, [record.tipo, catalogItems, viaturasAmbDisponiveis]);
  const motoristasFrota = catalogItems.motoristas;

  const isAmbulancia = record.tipo === "Ambulância";
  const cancelada = record.cancelada === true;
  const editavel = allowMobileEdit && !cancelada;
  const hospitalResumo = record.hospitalDestino.trim();
  const hospitalAoLadoDestino = isAmbulancia && hospitalResumo.length > 0;
  const tipoSaidaResumo = isAmbulancia ? formatTipoSaidaAmbulancia(record) : "";
  const destinoCabecalho = mergedDestinoDisplay ?? row.destino;
  const destinoCabecalhoLongo = Boolean(mergedDestinoDisplay);

  const kmSaidaPreenchido = record.kmSaida.trim().length > 0;
  const kmChegadaPreenchido = record.kmChegada.trim().length > 0;
  const chegadaPreenchido = record.chegada.trim().length > 0;
  const saidaFinalizada = kmSaidaPreenchido && kmChegadaPreenchido && chegadaPreenchido;

  function commitChegada(raw: string) {
    if (!editavel) return;
    onPatchKm({ chegada: normalize24hTime(raw) });
  }

  function applyAmbPatch(partial: Partial<DepartureRecord>) {
    if (!editavel || !updateDeparture) return;
    updateDeparture(record.id, {
      ...record,
      ...partial,
    });
  }

  function commitRubrica() {
    if (!updateDeparture) return;
    void runWithProgress(
      async () => {
        const { id, createdAt, ...rest } = record;
        void id;
        void createdAt;
        const drawn = rubricaPadRef.current?.getDataUrl() ?? "";
        updateDeparture(record.id, { ...rest, rubrica: drawn });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
        setRubricaModalOpen(false);
      },
      { label: "Confirmando e guardando rubrica...", minDurationMs: 900 },
    );
  }

  function handleSalvarOcorrencias(departureId: string, texto: string) {
    if (!updateDeparture) return;
    const { id, createdAt, ...rest } = record;
    void id;
    void createdAt;
    updateDeparture(departureId, { ...rest, ocorrencias: texto });
  }

  function applyAdminCadastroPatch(partial: Partial<DepartureRecord>) {
    if (!editavel || !updateDeparture) return;
    updateDeparture(record.id, {
      ...record,
      ...partial,
    });
  }

  /** Rubrica não depende de `editavel`: em dias só leitura ainda se pode rubricar se já houver chegada registada. */
  const mostrarRubricar =
    chegadaPreenchido && Boolean(updateDeparture) && !cancelada;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-[hsl(var(--border))]/90 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--card))]/70 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] transition",
        cancelada && "opacity-50",
        open && !isSelectedForExcluir && "ring-1 ring-[hsl(var(--primary))]/35",
        isSelectedForExcluir && "ring-2 ring-[hsl(var(--primary))]/70",
      )}
    >
      {cancelada ? (
        <div
          role="status"
          aria-label="Saída cancelada — rubrica"
          className="relative w-full overflow-hidden border-b border-red-600/25 bg-[hsl(var(--muted))]/15 px-3 py-2.5"
        >
          <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Rubrica
          </p>
          <div className="relative mt-1 flex min-h-[3.25rem] items-center justify-center overflow-hidden rounded-md border border-[hsl(var(--border))]/50 bg-[hsl(var(--background))]/40 px-2 py-2">
            {isRubricaImageDataUrl(record.rubrica) ? (
              <img
                src={record.rubrica}
                alt=""
                className="max-h-10 w-full object-contain opacity-45"
              />
            ) : (
              <p className="w-full break-words text-center text-xs leading-snug text-[hsl(var(--foreground))]/90">
                {(record.rubrica ?? "").trim() || "—"}
              </p>
            )}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <span className="-rotate-[35deg] select-none whitespace-nowrap text-[0.72rem] font-black uppercase tracking-[0.2em] text-red-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]">
                CANCELADA
              </span>
            </span>
          </div>
        </div>
      ) : kmSaidaPreenchido ? (
        <div
          role="status"
          aria-label={saidaFinalizada ? "Saída finalizada" : "Saída iniciada"}
          className={cn(
            "w-full border-b border-black/10 py-1.5 text-center text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white",
            saidaFinalizada ? "bg-[hsl(217_75%_42%)]" : "bg-[hsl(152_65%_32%)]",
          )}
        >
          {saidaFinalizada ? "Finalizada" : "Iniciada"}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          onSelectForExcluir?.();
          setOpen((v) => !v);
        }}
        style={{ touchAction: "manipulation" }}
        aria-pressed={isSelectedForExcluir === true ? true : undefined}
        className="flex min-h-[4.5rem] w-full items-stretch gap-3 p-4 text-left active:bg-[hsl(var(--muted))]/20"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-bold tabular-nums text-[hsl(var(--primary))]">{row.saida}</span>
            <span className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{row.viatura}</span>
          </div>
          <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{row.motorista}</p>
          {tipoSaidaResumo ? (
            <p className="min-w-0 break-words text-sm leading-snug line-clamp-2">
              <span className="text-[hsl(var(--muted-foreground))]">Tipo saída </span>
              <span className="font-medium text-[hsl(var(--foreground))]">{tipoSaidaResumo}</span>
            </p>
          ) : null}
          <p
            className={cn(
              "text-sm",
              hospitalAoLadoDestino || destinoCabecalhoLongo
                ? "min-w-0 break-words text-balance leading-snug line-clamp-3"
                : "truncate",
            )}
          >
            <span className="text-[hsl(var(--muted-foreground))]">Dest. </span>
            <span className="font-medium text-[hsl(var(--foreground))]">{destinoCabecalho}</span>
            {hospitalAoLadoDestino ? (
              <>
                <span className="text-[hsl(var(--muted-foreground))]"> · </span>
                <span className="text-[hsl(var(--muted-foreground))]">Hosp. </span>
                <span className="font-medium text-[hsl(var(--foreground))]">{hospitalResumo}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 self-stretch">
          {!hospitalAoLadoDestino ? (
            <span
              className="max-w-[40%] truncate rounded-lg bg-[hsl(var(--muted))]/60 px-2 py-0.5 text-[0.65rem] font-bold text-[hsl(var(--foreground))]"
              title={row.hospital}
            >
              {row.hospital}
            </span>
          ) : null}
          <div className="mt-auto">
            {open ? (
              <ChevronUp className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
            ) : (
              <ChevronDown className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
            )}
          </div>
        </div>
      </button>

      {open && isAmbulancia && (updateDeparture || !allowMobileEdit) ? (
        <div className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4">
          {cancelada ? (
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Esta saída foi cancelada.</p>
          ) : null}
          {!allowMobileEdit ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Apenas saídas do dia de hoje podem ser editadas neste separador.
            </p>
          ) : null}
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            {editavel ? "Edição rápida (mesma ordem)" : "Dados (só leitura)"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MobileEditableSelectField
              label="Viatura"
              value={record.viaturas}
              onChange={(v) => applyAmbPatch({ viaturas: v })}
              options={viaturasOpcoes}
              disabled={!editavel}
              emptyCatalogHint
            />
            <MobileEditableSelectField
              label="Motorista"
              value={record.motoristas}
              onChange={(v) => applyAmbPatch({ motoristas: v })}
              options={motoristasFrota}
              disabled={!editavel}
              emptyCatalogHint
            />
            <MobileEditableTextField
              label="Hospital"
              value={record.hospitalDestino}
              onCommit={(v) => applyAmbPatch({ hospitalDestino: v })}
              disabled={!editavel}
            />
            <div className="col-span-1 flex flex-col gap-2 sm:col-span-2">
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Tipo de saída (ambulância)
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]",
                    !editavel && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={record.tipoSaidaInterHospitalar === true}
                    disabled={!editavel}
                    onChange={(e) =>
                      applyAmbPatch({ tipoSaidaInterHospitalar: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-[hsl(var(--border))]"
                  />
                  Inter-Hospitalar
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]",
                    !editavel && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={record.tipoSaidaAlta === true}
                    disabled={!editavel}
                    onChange={(e) => applyAmbPatch({ tipoSaidaAlta: e.target.checked })}
                    className="h-4 w-4 rounded border-[hsl(var(--border))]"
                  />
                  Alta
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]",
                    !editavel && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={record.tipoSaidaOutros === true}
                    disabled={!editavel}
                    onChange={(e) => applyAmbPatch({ tipoSaidaOutros: e.target.checked })}
                    className="h-4 w-4 rounded border-[hsl(var(--border))]"
                  />
                  Outros
                </label>
              </div>
            </div>
            <MobileEditableTextField
              label="Hora da saída"
              value={record.horaSaida}
              onCommit={(v) => applyAmbPatch({ horaSaida: v })}
              transform={normalize24hTime}
              time24h
              disabled={!editavel}
            />
            <MobileEditableTextField
              label="Destino"
              value={record.bairro}
              onCommit={(v) => applyAmbPatch({ bairro: v })}
              disabled={!editavel}
            />
            <MobileEditableTextField
              label="KM saída"
              value={formatKmThousandsPtBr(record.kmSaida)}
              onCommit={(v) => applyAmbPatch({ kmSaida: v })}
              transform={formatKmThousandsPtBr}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <MobileEditableTextField
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onCommit={(v) => applyAmbPatch({ kmChegada: v })}
              transform={formatKmThousandsPtBr}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <MobileEditableTextField
              label="Hora da chegada"
              value={record.chegada}
              onCommit={(v) => applyAmbPatch({ chegada: v })}
              transform={normalize24hTime}
              time24h
              disabled={!editavel}
            />
            {updateDeparture ? (
              <div className="col-span-1 sm:col-span-2 flex flex-col gap-2 pt-0.5">
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 p-0 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55",
                        record.ocorrencias?.trim() && "border-[hsl(var(--primary))]/40 text-[hsl(var(--primary))]",
                      )}
                      aria-label="Ocorrências"
                      title="Ocorrências"
                      onClick={() => setOcorrenciasModalOpen(true)}
                    >
                      <ClipboardList className="h-5 w-5" />
                    </Button>
                    <span className="text-[0.75rem] font-medium text-[hsl(var(--foreground))]">
                      {record.ocorrencias?.trim() ? "Ocorrências registadas" : "Ocorrências"}
                    </span>
                  </div>
                  {mostrarRubricar ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-3 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55"
                        aria-label="Rubricar"
                        title="Rubricar"
                        onClick={() => setRubricaModalOpen(true)}
                      >
                        <Signature className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Rubricar</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
                {mostrarRubricar && (record.rubrica ?? "").trim().length > 0 ? (
                  <p className="text-[0.7rem] leading-snug text-[hsl(var(--muted-foreground))]">
                    Rubrica registada — aparece no PDF (Gerar PDF / Enviar / Assinar).
                    {isRubricaImageDataUrl(record.rubrica) ? " (desenho)" : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {open && !isAmbulancia ? (
        <div className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4">
          {cancelada ? (
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Esta saída foi cancelada.</p>
          ) : null}
          {!allowMobileEdit ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Apenas saídas do dia de hoje podem ser editadas neste separador.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Setor / ramal
              </p>
              <p className="text-sm text-[hsl(var(--foreground))]">
                {mergedSetorDisplay ?? (record.setor.trim() || "—")} · {record.ramal.trim() || "—"}
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
            <div className="col-span-1 sm:col-span-3">
              <MobileEditableTextField
                label="Destino"
                value={record.bairro}
                onCommit={(v) => applyAdminCadastroPatch({ bairro: v })}
                disabled={!editavel || !updateDeparture}
              />
            </div>
            <MobileEditableTextField
              label="KM saída"
              value={formatKmThousandsPtBr(record.kmSaida)}
              onCommit={(v) => onPatchKm({ kmSaida: v })}
              transform={formatKmThousandsPtBr}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <MobileEditableTextField
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onCommit={(v) => onPatchKm({ kmChegada: v })}
              transform={formatKmThousandsPtBr}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <MobileEditableTextField
              label="Hora da chegada"
              value={record.chegada}
              onCommit={(v) => commitChegada(v)}
              time24h
              disabled={!editavel}
            />
            {updateDeparture ? (
              <div className="col-span-1 sm:col-span-3 flex flex-col gap-2 pt-0.5">
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 p-0 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55",
                        record.ocorrencias?.trim() && "border-[hsl(var(--primary))]/40 text-[hsl(var(--primary))]",
                      )}
                      aria-label="Ocorrências"
                      title="Ocorrências"
                      onClick={() => setOcorrenciasModalOpen(true)}
                    >
                      <ClipboardList className="h-5 w-5" />
                    </Button>
                    <span className="text-[0.75rem] font-medium text-[hsl(var(--foreground))]">
                      {record.ocorrencias?.trim() ? "Ocorrências registadas" : "Ocorrências"}
                    </span>
                  </div>
                  {mostrarRubricar ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-3 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55"
                        aria-label="Rubricar"
                        title="Rubricar"
                        onClick={() => setRubricaModalOpen(true)}
                      >
                        <Signature className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Rubricar</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
                {mostrarRubricar && (record.rubrica ?? "").trim().length > 0 ? (
                  <p className="text-[0.7rem] leading-snug text-[hsl(var(--muted-foreground))]">
                    Rubrica registada — aparece no PDF (Gerar PDF / Enviar / Assinar).
                    {isRubricaImageDataUrl(record.rubrica) ? " (desenho)" : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {updateDeparture ? (
        <DepartureOcorrenciasModal
          open={ocorrenciasModalOpen}
          onOpenChange={setOcorrenciasModalOpen}
          record={record}
          onSave={handleSalvarOcorrencias}
          confirmFirst
          alignTop
        />
      ) : null}

      {rubricaModalOpen ? (
        <div
          className={cn(MOBILE_MODAL_OVERLAY_CLASS, "z-[500]")}
          role="dialog"
          aria-modal="true"
          aria-labelledby={rubricaTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRubricaModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={rubricaTitleId} className="mb-3 text-lg font-semibold text-[hsl(var(--foreground))]">
              Rubrica
            </h2>
            <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">
              Desenhe a rubrica com o dedo ou o rato — sem teclado. Aparece na coluna Rubrica do PDF (aba Saídas).
            </p>
            <RubricaSignaturePad
              key={record.id}
              ref={rubricaPadRef}
              initialDataUrl={isRubricaImageDataUrl(record.rubrica) ? record.rubrica : null}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                className="min-h-11 rounded-xl font-medium text-black"
                onClick={() => rubricaPadRef.current?.clearPad()}
              >
                Limpar
              </Button>
              <Button
                type="button"
                className="min-h-11 rounded-xl font-medium text-black"
                onClick={() => setRubricaModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="button" className="min-h-11 rounded-xl font-semibold text-black" onClick={commitRubrica}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
