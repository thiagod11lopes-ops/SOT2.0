import { ClipboardList, Eye, Pencil, Trash2 } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDepartures, type DepartureKmFieldsPatch } from "../context/departures-context";
import type { DepartureRecord } from "../types/departure";
import { groupDeparturesForListDisplay, listRowFromRecord } from "../types/departure";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { departuresTableShadowClass } from "../lib/uiShadows";
import { normalize24hTimeWithCaret } from "../lib/timeInput";
import { isRubricaImageDataUrl } from "../lib/rubricaDrawing";
import { cn } from "../lib/utils";
import { DepartureDetailModal } from "./departure-detail-modal";
import { DepartureOcorrenciasModal } from "./departure-ocorrencias-modal";
import {
  MergedDeparturePickRecordModal,
  type MergedPickAction,
} from "./merged-departure-pick-record-modal";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const inputClass =
  "h-8 w-full min-w-[3.5rem] max-w-[6.5rem] rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1.5 font-mono text-xs tabular-nums text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

/** Mesma cor das abas ativas (`--primary`) para texto em negrito. */
const inputClassBold =
  "h-8 w-full min-w-[3.5rem] max-w-[6.5rem] rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1.5 font-mono text-xs tabular-nums text-[hsl(var(--primary))] font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

/** KM saída, KM chegada e chegada preenchidos — linha tratada como finalizada (visual). */
function saidaFinalizadaKmEChegada(r: DepartureRecord): boolean {
  return (
    r.kmSaida.trim().length > 0 &&
    r.kmChegada.trim().length > 0 &&
    r.chegada.trim().length > 0
  );
}

function ChegadaTimeInput({
  value,
  onApply,
  className,
}: {
  value: string;
  onApply: (next: string) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const p = pendingCaret.current;
    if (el && p !== null) {
      const clamped = Math.min(Math.max(0, p), el.value.length);
      el.setSelectionRange(clamped, clamped);
    }
    pendingCaret.current = null;
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      aria-label="Hora de chegada"
      value={value}
      onChange={(e) => {
        const el = e.target;
        const start = el.selectionStart ?? el.value.length;
        const { value: v, caret } = normalize24hTimeWithCaret(el.value, start);
        pendingCaret.current = caret;
        onApply(v);
      }}
      className={className}
    />
  );
}

interface DeparturesDataTableProps {
  rows: DepartureRecord[];
  showTipoColumn?: boolean;
  /** Ambulância: coluna «Hospital» em vez de «OM». */
  listColumnOmOrHospital?: "om" | "hospital";
  /** Negrito nos cabeçalhos e células (abas Saídas Administrativas / Ambulância). */
  bodyFontBold?: boolean;
  emptyLabel: string;
  /** Abre o fluxo (modal) de excluir vs cancelar — após escolha, tipicamente um registo. */
  onTrashClick: (group: DepartureRecord[]) => void;
  /** Quando definido, KM saída, KM chegada e Chegada são editáveis inline. */
  onUpdateKmFields?: (id: string, patch: DepartureKmFieldsPatch) => void;
  /** Abre Cadastrar Nova Saída com os dados do registro. */
  onEdit?: (id: string) => void;
}

export function DeparturesDataTable({
  rows,
  showTipoColumn,
  listColumnOmOrHospital = "om",
  bodyFontBold,
  emptyLabel,
  onTrashClick,
  onUpdateKmFields,
  onEdit,
}: DeparturesDataTableProps) {
  const { updateDeparture } = useDepartures();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [ocorrenciasModalId, setOcorrenciasModalId] = useState<string | null>(null);
  const [pickModal, setPickModal] = useState<{
    records: DepartureRecord[];
    action: MergedPickAction;
  } | null>(null);
  const mergedGroups = useMemo(() => groupDeparturesForListDisplay(rows), [rows]);

  function applyPickedAction(record: DepartureRecord, action: MergedPickAction) {
    switch (action) {
      case "detail":
        setDetailId(record.id);
        break;
      case "ocorrencias":
        setOcorrenciasModalId(record.id);
        break;
      case "edit":
        onEdit?.(record.id);
        break;
      case "trash":
        onTrashClick([record]);
        break;
    }
  }

  function openActionOrPick(group: { records: DepartureRecord[] }, action: MergedPickAction) {
    const recs = group.records;
    if (recs.length === 1) {
      applyPickedAction(recs[0]!, action);
      return;
    }
    setPickModal({ records: recs, action });
  }

  const detailRecord = useMemo(
    () => (detailId ? rows.find((r) => r.id === detailId) ?? null : null),
    [rows, detailId],
  );
  const ocorrenciasModalRecord = useMemo(
    () => (ocorrenciasModalId ? rows.find((r) => r.id === ocorrenciasModalId) ?? null : null),
    [rows, ocorrenciasModalId],
  );

  function handleSalvarOcorrencias(departureId: string, texto: string) {
    const d = rows.find((r) => r.id === departureId);
    if (!d) return;
    const { id, createdAt, ...rest } = d;
    void id;
    void createdAt;
    updateDeparture(departureId, { ...rest, ocorrencias: texto });
  }
  const colSpan = showTipoColumn ? 12 : 11;
  const cell = (extra?: string) =>
    cn(bodyFontBold && "font-bold text-[hsl(var(--primary))]", extra);
  const head = (extra?: string) =>
    cn(
      bodyFontBold &&
        "font-bold text-[hsl(var(--primary))] [text-shadow:0_1px_2px_rgba(0,0,0,0.42),0_2px_8px_rgba(0,0,0,0.32)]",
      extra,
    );
  const inputCls = bodyFontBold ? inputClassBold : inputClass;

  return (
    <>
      {pickModal ? (
        <MergedDeparturePickRecordModal
          open
          onOpenChange={(o) => {
            if (!o) setPickModal(null);
          }}
          records={pickModal.records}
          action={pickModal.action}
          onSelect={(record) => {
            applyPickedAction(record, pickModal.action);
            setPickModal(null);
          }}
        />
      ) : null}
      <DepartureDetailModal
        open={detailId !== null && detailRecord !== null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
        record={detailRecord}
      />
      <DepartureOcorrenciasModal
        open={ocorrenciasModalId !== null && ocorrenciasModalRecord !== null}
        onOpenChange={(o) => {
          if (!o) setOcorrenciasModalId(null);
        }}
        record={ocorrenciasModalRecord}
        onSave={handleSalvarOcorrencias}
      />
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]",
        departuresTableShadowClass,
      )}
    >
    <Table>
      <TableHeader>
        <TableRow>
          {showTipoColumn ? <TableHead className={head()}>Tipo</TableHead> : null}
          <TableHead className={head()}>Viatura</TableHead>
          <TableHead className={head()}>Motorista</TableHead>
          <TableHead className={head()}>Saída</TableHead>
          <TableHead className={head()}>Destino</TableHead>
          <TableHead className={head()}>{listColumnOmOrHospital === "hospital" ? "Hospital" : "OM"}</TableHead>
          <TableHead className={head()}>KM saída</TableHead>
          <TableHead className={head()}>KM chegada</TableHead>
          <TableHead className={head()}>Chegada</TableHead>
          <TableHead className={head()}>Setor</TableHead>
          <TableHead className={head("max-w-[10rem]")}>Rubrica</TableHead>
          <TableHead className={head("min-w-[8.5rem] text-right")}>Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className={cn(
                "py-10 text-center",
                bodyFontBold ? "text-[hsl(var(--primary))]" : "text-slate-500",
              )}
            >
              {emptyLabel}
            </TableCell>
          </TableRow>
        ) : (
          mergedGroups.map((group) => {
            const row = group.primary;
            const lr = listRowFromRecord(row);
            const finalizada = saidaFinalizadaKmEChegada(row);
            const cancelada = row.cancelada === true;
            const kmEditavel = Boolean(onUpdateKmFields) && !cancelada;
            const destinoCell = group.destinoDisplay;
            const setorCell = group.setorDisplay;
            const rowKey = group.records.map((r) => r.id).join("|");
            const anyOcorrencias = group.records.some((r) => (r.ocorrencias ?? "").trim().length > 0);
            return (
              <TableRow
                key={rowKey}
                className={cn(
                  cancelada && "bg-red-950/[0.08] opacity-50",
                  !cancelada &&
                    finalizada &&
                    "opacity-[0.55] transition-opacity hover:opacity-[0.88] focus-within:opacity-90",
                )}
                title={
                  cancelada
                    ? "Saída cancelada"
                    : finalizada
                      ? "Saída finalizada — ainda editável"
                      : undefined
                }
              >
                {showTipoColumn ? (
                  <TableCell className={cell("whitespace-nowrap text-sm")}>{lr.tipo}</TableCell>
                ) : null}
                <TableCell className={cell()}>{lr.viatura}</TableCell>
                <TableCell className={cell()}>{lr.motorista}</TableCell>
                <TableCell className={cell("whitespace-nowrap tabular-nums")}>{lr.saida}</TableCell>
                <TableCell className={cell("max-w-[min(280px,42vw)] break-words")} title={destinoCell}>
                  {destinoCell}
                </TableCell>
                <TableCell className={cell()}>
                  {listColumnOmOrHospital === "hospital" ? lr.hospital : lr.om}
                </TableCell>
                <TableCell className={cn(cell(), kmEditavel && "p-1.5 align-middle")}>
                  {kmEditavel ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="KM saída"
                      value={formatKmThousandsPtBr(row.kmSaida)}
                      onChange={(e) =>
                        onUpdateKmFields!(row.id, {
                          kmSaida: formatKmThousandsPtBr(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  ) : (
                    lr.kmSaida
                  )}
                </TableCell>
                <TableCell className={cn(cell(), kmEditavel && "p-1.5 align-middle")}>
                  {kmEditavel ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="KM chegada"
                      value={formatKmThousandsPtBr(row.kmChegada)}
                      onChange={(e) =>
                        onUpdateKmFields!(row.id, {
                          kmChegada: formatKmThousandsPtBr(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  ) : (
                    lr.kmChegada
                  )}
                </TableCell>
                <TableCell className={cn(cell("whitespace-nowrap"), kmEditavel && "p-1.5 align-middle")}>
                  {kmEditavel ? (
                    <ChegadaTimeInput
                      value={row.chegada}
                      onApply={(next) => onUpdateKmFields!(row.id, { chegada: next })}
                      className={cn(inputCls, "max-w-[5rem]")}
                    />
                  ) : (
                    lr.chegada
                  )}
                </TableCell>
                <TableCell className={cell("max-w-[min(240px,36vw)] break-words")} title={setorCell}>
                  {setorCell}
                </TableCell>
                <TableCell
                  className={cell("max-w-[140px] text-xs")}
                  title={isRubricaImageDataUrl(row.rubrica) ? "Rubrica (desenho)" : lr.rubrica !== "—" ? lr.rubrica : undefined}
                >
                  <div className="relative flex min-h-[3rem] items-center overflow-hidden">
                    {isRubricaImageDataUrl(row.rubrica) ? (
                      <img
                        src={row.rubrica}
                        alt=""
                        className={cn(
                          "h-9 max-w-[5.5rem] object-contain object-left",
                          cancelada && "opacity-45",
                        )}
                      />
                    ) : (
                      <span className={cn("line-clamp-3 break-words", cancelada && "text-[hsl(var(--foreground))]/85")}>
                        {lr.rubrica}
                      </span>
                    )}
                    {cancelada ? (
                      <span
                        className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        aria-hidden
                      >
                        <span className="-rotate-[35deg] select-none whitespace-nowrap text-[0.65rem] font-black uppercase tracking-[0.22em] text-red-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
                          CANCELADA
                        </span>
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-[hsl(var(--primary))]"
                      aria-label="Ver dados completos da saída"
                      onClick={() => openActionOrPick(group, "detail")}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 text-slate-500 hover:text-[hsl(var(--primary))]",
                        anyOcorrencias && "text-[hsl(var(--primary))]/90",
                      )}
                      aria-label="Ocorrências"
                      title="Ocorrências"
                      onClick={() => openActionOrPick(group, "ocorrencias")}
                    >
                      <ClipboardList className="h-4 w-4" />
                    </Button>
                    {onEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-[hsl(var(--primary))]"
                        aria-label="Editar registro no cadastro"
                        onClick={() => openActionOrPick(group, "edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-red-600"
                      aria-label="Excluir ou cancelar saída"
                      onClick={() => openActionOrPick(group, "trash")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
    </div>
    </>
  );
}
