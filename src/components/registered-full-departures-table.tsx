import { Pencil, Trash2 } from "lucide-react";
import { fullRowCells, type DepartureRecord } from "../types/departure";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface Props {
  rows: DepartureRecord[];
  emptyLabel: string;
  onTrashClick: (id: string) => void;
  onEdit: (id: string) => void;
  /** Texto digitado na lupa: os termos correspondentes aparecem em negrito na tabela. */
  highlightTerm?: string;
}

const COLS = 8;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  const palavras = highlight.trim().split(/\s+/).filter((w) => w.length > 0);
  if (palavras.length === 0 || !text) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }
  const pattern = palavras.map(escapeRegExp).join("|");
  const re = new RegExp(`(${pattern})`, "gi");
  const partes = text.split(re);
  return (
    <span className="whitespace-pre-wrap">
      {partes.map((parte, i) => {
        const ehTrecho = palavras.some((p) => p.toLowerCase() === parte.toLowerCase());
        return (
          <span key={i}>
            {ehTrecho ? (
              <strong className="font-bold text-[hsl(var(--foreground))]">{parte}</strong>
            ) : (
              parte
            )}
          </span>
        );
      })}
    </span>
  );
}

function FieldLine({
  label,
  value,
  highlightTerm,
}: {
  label: string;
  value: string;
  highlightTerm?: string;
}) {
  return (
    <p className="break-words [word-break:break-word]">
      <span className="text-[hsl(var(--muted-foreground))]">{label}</span>{" "}
      {highlightTerm && highlightTerm.trim().length > 0 ? (
        <HighlightText text={value} highlight={highlightTerm} />
      ) : (
        value
      )}
    </p>
  );
}

export function RegisteredFullDeparturesTable({
  rows,
  emptyLabel,
  onTrashClick,
  onEdit,
  highlightTerm = "",
}: Props) {
  return (
    <div className="max-h-[min(70vh,720px)] w-full max-w-full overflow-y-auto overflow-x-hidden rounded-lg border border-[hsl(var(--border))]">
      <table className="w-full table-fixed border-collapse text-[10px] leading-snug sm:text-[11px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[7%] p-1.5 align-bottom text-[10px] sm:p-2 sm:text-xs">Tipo</TableHead>
            <TableHead className="w-[13%] p-1.5 align-bottom text-[10px] sm:p-2 sm:text-xs">
              Pedido / saída
            </TableHead>
            <TableHead className="w-[17%] p-1.5 align-bottom text-[10px] sm:p-2 sm:text-xs">
              Setor, ramal e objetivo
            </TableHead>
            <TableHead className="w-[13%] p-1.5 align-bottom text-[10px] sm:p-2 sm:text-xs">
              Pass., resp., OM / Hosp.
            </TableHead>
            <TableHead className="w-[15%] p-1.5 align-bottom text-[10px] sm:p-2 sm:text-xs">
              Viaturas e motoristas
            </TableHead>
            <TableHead className="w-[15%] p-1.5 align-bottom text-[10px] sm:p-2 sm:text-xs">
              Hospital e KM
            </TableHead>
            <TableHead className="w-[14%] p-1.5 align-bottom text-[10px] sm:p-2 sm:text-xs">
              Cidade e bairro
            </TableHead>
            <TableHead className="w-[6%] p-1.5 text-right align-bottom text-[10px] sm:p-2 sm:text-xs">
              Ações
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={COLS}
                className="p-6 text-center text-slate-500 sm:p-8 sm:text-sm"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const c = fullRowCells(row);
              const cancelada = row.cancelada === true;
              return (
                <TableRow
                  key={row.id}
                  className={cn("align-top", cancelada && "bg-red-950/[0.08] opacity-50")}
                  title={cancelada ? "Saída cancelada" : undefined}
                >
                  <TableCell className="p-1.5 font-medium sm:p-2">
                    {highlightTerm.trim().length > 0 ? (
                      <HighlightText text={c.tipo} highlight={highlightTerm} />
                    ) : (
                      c.tipo
                    )}
                  </TableCell>
                  <TableCell className="p-1.5 font-mono sm:p-2">
                    <FieldLine
                      label="Ped.:"
                      value={`${c.dataPedido} ${c.horaPedido}`.trim()}
                      highlightTerm={highlightTerm}
                    />
                    <FieldLine
                      label="Saí.:"
                      value={`${c.dataSaida} ${c.horaSaida}`.trim()}
                      highlightTerm={highlightTerm}
                    />
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Setor:" value={c.setor} highlightTerm={highlightTerm} />
                    <FieldLine label="Ramal:" value={c.ramal} highlightTerm={highlightTerm} />
                    <FieldLine label="Obj.:" value={c.objetivoSaida} highlightTerm={highlightTerm} />
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Pass.:" value={c.numeroPassageiros} highlightTerm={highlightTerm} />
                    <FieldLine label="Resp.:" value={c.responsavelPedido} highlightTerm={highlightTerm} />
                    {row.tipo === "Ambulância" ? (
                      <FieldLine label="Hospital:" value={c.hospitalDestino} highlightTerm={highlightTerm} />
                    ) : (
                      <FieldLine label="OM:" value={c.om} highlightTerm={highlightTerm} />
                    )}
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Viaturas:" value={c.viaturas} highlightTerm={highlightTerm} />
                    <FieldLine label="Mot.:" value={c.motoristas} highlightTerm={highlightTerm} />
                  </TableCell>
                  <TableCell className="p-1.5 font-mono sm:p-2">
                    {row.tipo === "Administrativa" ? (
                      <FieldLine label="Hosp.:" value={c.hospitalDestino} highlightTerm={highlightTerm} />
                    ) : null}
                    <FieldLine label="KM s/c:" value={`${c.kmSaida} / ${c.kmChegada}`} highlightTerm={highlightTerm} />
                    <FieldLine label="Cheg.:" value={c.chegada} highlightTerm={highlightTerm} />
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Cid.:" value={c.cidade} highlightTerm={highlightTerm} />
                    <FieldLine label="Bairro:" value={c.bairro} highlightTerm={highlightTerm} />
                    {cancelada ? (
                      <div className="relative mt-1.5 min-h-[2.75rem] overflow-hidden rounded border border-red-600/25 bg-[hsl(var(--muted))]/10 px-1 py-1">
                        <p className="break-words [word-break:break-word]">
                          <span className="text-[hsl(var(--muted-foreground))]">Rubrica: </span>
                          <span className="opacity-80">
                            {highlightTerm && highlightTerm.trim().length > 0 ? (
                              <HighlightText text={c.rubrica} highlight={highlightTerm} />
                            ) : (
                              c.rubrica
                            )}
                          </span>
                        </p>
                        <span
                          className="pointer-events-none absolute inset-0 flex items-center justify-center"
                          aria-hidden
                        >
                          <span className="-rotate-[35deg] select-none whitespace-nowrap text-[0.6rem] font-black uppercase tracking-[0.2em] text-red-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.85)] sm:text-[0.65rem]">
                            CANCELADA
                          </span>
                        </span>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="p-1 text-right sm:p-2">
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-[hsl(var(--primary))] sm:h-8 sm:w-8"
                        aria-label="Editar no cadastro"
                        onClick={() => onEdit(row.id)}
                      >
                        <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-red-600 sm:h-8 sm:w-8"
                        aria-label="Excluir registro"
                        onClick={() => onTrashClick(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </table>
    </div>
  );
}
