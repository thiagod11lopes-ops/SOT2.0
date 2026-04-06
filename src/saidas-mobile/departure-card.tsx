import { useId, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { ChevronDown, ChevronUp, ClipboardList, Signature } from "lucide-react";
import { DepartureOcorrenciasModal } from "../components/departure-ocorrencias-modal";
import { Button } from "../components/ui/button";
import { isRubricaImageDataUrl } from "../lib/rubricaDrawing";
import { mergeViaturasCatalog, useCatalogItems } from "../context/catalog-items-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import type { DepartureKmFieldsPatch } from "../context/departures-context";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { normalize24hTime } from "../lib/timeInput";
import type { DepartureRecord } from "../types/departure";
import { listRowFromRecord } from "../types/departure";
import { cn } from "../lib/utils";
import { RubricaSignaturePad, type RubricaSignaturePadHandle } from "./rubrica-signature-pad";

function Field({
  label,
  value,
  onChange,
  inputMode,
  mono,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  mono?: boolean;
  disabled?: boolean;
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
        disabled={disabled}
        className={cn(
          "min-h-[2.75rem] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-sm text-[hsl(var(--foreground))] outline-none ring-0 transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/40",
          mono && "font-mono tabular-nums",
          disabled && "cursor-not-allowed opacity-70",
        )}
      />
    </label>
  );
}

/**
 * Apenas `<select>` (sem input de texto): escolha entre itens do catálogo Frota e Pessoal.
 * Se o registo tiver valor que já não está no catálogo, mostra uma opção extra só para esse valor.
 */
function FleetSelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  const selectId = useId();
  const orphan = useMemo(() => {
    if (!value.trim()) return null;
    if (options.some((o) => o === value)) return null;
    return value;
  }, [value, options]);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        value={options.some((o) => o === value) || value === "" || orphan === value ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        disabled={disabled}
        className={cn(
          "min-h-[2.75rem] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-sm text-[hsl(var(--foreground))] outline-none ring-0 transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/40",
          disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        )}
      >
        <option value="">— Selecionar —</option>
        {orphan ? (
          <option value={orphan}>
            {orphan} (fora do catálogo)
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {options.length === 0 ? (
        <span className="text-[0.65rem] text-[hsl(var(--muted-foreground))]">
          Cadastre itens em <strong>Frota e Pessoal</strong> no SOT (ambiente completo).
        </span>
      ) : null}
    </div>
  );
}

export function DepartureCard({
  record,
  onPatchKm,
  updateDeparture,
  isSelectedForExcluir,
  onSelectForExcluir,
  allowMobileEdit = true,
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
}) {
  const [open, setOpen] = useState(false);
  const [rubricaModalOpen, setRubricaModalOpen] = useState(false);
  const [ocorrenciasModalOpen, setOcorrenciasModalOpen] = useState(false);
  const rubricaPadRef = useRef<RubricaSignaturePadHandle>(null);
  const rubricaTitleId = useId();
  const row = listRowFromRecord(record);
  const { items: catalogItems } = useCatalogItems();
  const { estaNaOficina } = useOficinaVisitas();
  /** Ambulância: só placas de «Ambulâncias» em Frota e Pessoal e fora da oficina (igual ao cadastro principal). */
  const viaturasAmbDisponiveis = useMemo(
    () => catalogItems.ambulancias.filter((p) => !estaNaOficina(p)),
    [catalogItems.ambulancias, estaNaOficina],
  );
  const viaturasOpcoes = useMemo(() => {
    if (record.tipo !== "Ambulância") return mergeViaturasCatalog(catalogItems);
    return viaturasAmbDisponiveis;
  }, [record.tipo, catalogItems, viaturasAmbDisponiveis]);
  const motoristasFrota = catalogItems.motoristas;

  const isAmbulancia = record.tipo === "Ambulância";
  const cancelada = record.cancelada === true;
  const editavel = allowMobileEdit && !cancelada;

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
    const { id, createdAt, ...rest } = record;
    void id;
    void createdAt;
    const drawn = rubricaPadRef.current?.getDataUrl() ?? "";
    updateDeparture(record.id, { ...rest, rubrica: drawn });
    setRubricaModalOpen(false);
  }

  function handleSalvarOcorrencias(departureId: string, texto: string) {
    if (!updateDeparture) return;
    const { id, createdAt, ...rest } = record;
    void id;
    void createdAt;
    updateDeparture(departureId, { ...rest, ocorrencias: texto });
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
          <p className="truncate text-sm">
            <span className="text-[hsl(var(--muted-foreground))]">Dest. </span>
            <span className="font-medium text-[hsl(var(--foreground))]">{row.destino}</span>
          </p>
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
            <FleetSelectField
              label="Viatura"
              value={record.viaturas}
              onChange={(v) => applyAmbPatch({ viaturas: v })}
              options={viaturasOpcoes}
              disabled={!editavel}
            />
            <FleetSelectField
              label="Motorista"
              value={record.motoristas}
              onChange={(v) => applyAmbPatch({ motoristas: v })}
              options={motoristasFrota}
              disabled={!editavel}
            />
            <Field
              label="Destino"
              value={record.bairro}
              onChange={(v) => applyAmbPatch({ bairro: v })}
              disabled={!editavel}
            />
            <Field
              label="Hora da saída"
              value={record.horaSaida}
              onChange={(v) => applyAmbPatch({ horaSaida: normalize24hTime(v) })}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <Field
              label="KM saída"
              value={formatKmThousandsPtBr(record.kmSaida)}
              onChange={(v) => applyAmbPatch({ kmSaida: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <Field
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onChange={(v) => applyAmbPatch({ kmChegada: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <Field
              label="Hora da chegada"
              value={record.chegada}
              onChange={(v) => applyAmbPatch({ chegada: normalize24hTime(v) })}
              inputMode="numeric"
              mono
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
              disabled={!editavel}
            />
            <Field
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onChange={(v) => onPatchKm({ kmChegada: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <Field
              label="Hora da chegada"
              value={record.chegada}
              onChange={(v) => commitChegada(v)}
              inputMode="numeric"
              mono
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
        />
      ) : null}

      {rubricaModalOpen ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-4 sm:items-center"
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
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => rubricaPadRef.current?.clearPad()}
              >
                Limpar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => setRubricaModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="button" className="min-h-11 rounded-xl font-semibold" onClick={commitRubrica}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
