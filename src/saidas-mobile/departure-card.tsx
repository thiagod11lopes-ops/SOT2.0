import { useId, useMemo, useState, type HTMLAttributes } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { mergeViaturasCatalog, useCatalogItems } from "../context/catalog-items-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import type { DepartureKmFieldsPatch } from "../context/departures-context";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { normalize24hTime } from "../lib/timeInput";
import type { DepartureRecord } from "../types/departure";
import { listRowFromRecord } from "../types/departure";
import { cn } from "../lib/utils";

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

  const kmSaidaPreenchido = record.kmSaida.trim().length > 0;
  const kmChegadaPreenchido = record.kmChegada.trim().length > 0;
  const chegadaPreenchido = record.chegada.trim().length > 0;
  const saidaFinalizada = kmSaidaPreenchido && kmChegadaPreenchido && chegadaPreenchido;

  function commitChegada(raw: string) {
    if (!allowMobileEdit) return;
    onPatchKm({ chegada: normalize24hTime(raw) });
  }

  function applyAmbPatch(partial: Partial<DepartureRecord>) {
    if (!allowMobileEdit || !updateDeparture) return;
    updateDeparture(record.id, {
      ...record,
      ...partial,
    });
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-[hsl(var(--border))]/90 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--card))]/70 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] transition",
        open && !isSelectedForExcluir && "ring-1 ring-[hsl(var(--primary))]/35",
        isSelectedForExcluir && "ring-2 ring-[hsl(var(--primary))]/70",
      )}
    >
      {kmSaidaPreenchido ? (
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
          {!allowMobileEdit ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Apenas saídas do dia de hoje podem ser editadas neste separador.
            </p>
          ) : null}
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            {allowMobileEdit ? "Edição rápida (mesma ordem)" : "Dados (só leitura)"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FleetSelectField
              label="Viatura"
              value={record.viaturas}
              onChange={(v) => applyAmbPatch({ viaturas: v })}
              options={viaturasOpcoes}
              disabled={!allowMobileEdit}
            />
            <FleetSelectField
              label="Motorista"
              value={record.motoristas}
              onChange={(v) => applyAmbPatch({ motoristas: v })}
              options={motoristasFrota}
              disabled={!allowMobileEdit}
            />
            <Field
              label="Destino"
              value={record.bairro}
              onChange={(v) => applyAmbPatch({ bairro: v })}
              disabled={!allowMobileEdit}
            />
            <Field
              label="Hora da saída"
              value={record.horaSaida}
              onChange={(v) => applyAmbPatch({ horaSaida: normalize24hTime(v) })}
              inputMode="numeric"
              mono
              disabled={!allowMobileEdit}
            />
            <Field
              label="KM saída"
              value={formatKmThousandsPtBr(record.kmSaida)}
              onChange={(v) => applyAmbPatch({ kmSaida: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
              disabled={!allowMobileEdit}
            />
            <Field
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onChange={(v) => applyAmbPatch({ kmChegada: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
              disabled={!allowMobileEdit}
            />
            <Field
              label="Hora da chegada"
              value={record.chegada}
              onChange={(v) => applyAmbPatch({ chegada: normalize24hTime(v) })}
              inputMode="numeric"
              mono
              disabled={!allowMobileEdit}
            />
          </div>
        </div>
      ) : null}

      {open && !isAmbulancia ? (
        <div className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4">
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
              disabled={!allowMobileEdit}
            />
            <Field
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onChange={(v) => onPatchKm({ kmChegada: formatKmThousandsPtBr(v) })}
              inputMode="numeric"
              mono
              disabled={!allowMobileEdit}
            />
            <Field
              label="Hora da chegada"
              value={record.chegada}
              onChange={(v) => commitChegada(v)}
              inputMode="numeric"
              mono
              disabled={!allowMobileEdit}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
