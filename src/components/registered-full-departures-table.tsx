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
}

const COLS = 8;

function FieldLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="break-words [word-break:break-word]">
      <span className="text-[hsl(var(--muted-foreground))]">{label}</span> {value}
    </p>
  );
}

export function RegisteredFullDeparturesTable({ rows, emptyLabel, onTrashClick, onEdit }: Props) {
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
                  <TableCell className="p-1.5 font-medium sm:p-2">{c.tipo}</TableCell>
                  <TableCell className="p-1.5 font-mono sm:p-2">
                    <FieldLine label="Ped.:" value={`${c.dataPedido} ${c.horaPedido}`.trim()} />
                    <FieldLine label="Saí.:" value={`${c.dataSaida} ${c.horaSaida}`.trim()} />
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Setor:" value={c.setor} />
                    <FieldLine label="Ramal:" value={c.ramal} />
                    <FieldLine label="Obj.:" value={c.objetivoSaida} />
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Pass.:" value={c.numeroPassageiros} />
                    <FieldLine label="Resp.:" value={c.responsavelPedido} />
                    {row.tipo === "Ambulância" ? (
                      <FieldLine label="Hospital:" value={c.hospitalDestino} />
                    ) : (
                      <FieldLine label="OM:" value={c.om} />
                    )}
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Viaturas:" value={c.viaturas} />
                    <FieldLine label="Mot.:" value={c.motoristas} />
                  </TableCell>
                  <TableCell className="p-1.5 font-mono sm:p-2">
                    {row.tipo === "Administrativa" ? (
                      <FieldLine label="Hosp.:" value={c.hospitalDestino} />
                    ) : null}
                    <FieldLine label="KM s/c:" value={`${c.kmSaida} / ${c.kmChegada}`} />
                    <FieldLine label="Cheg.:" value={c.chegada} />
                  </TableCell>
                  <TableCell className="p-1.5 sm:p-2">
                    <FieldLine label="Cid.:" value={c.cidade} />
                    <FieldLine label="Bairro:" value={c.bairro} />
                    {cancelada ? (
                      <div className="relative mt-1.5 min-h-[2.75rem] overflow-hidden rounded border border-red-600/25 bg-[hsl(var(--muted))]/10 px-1 py-1">
                        <p className="break-words [word-break:break-word]">
                          <span className="text-[hsl(var(--muted-foreground))]">Rubrica: </span>
                          <span className="opacity-80">{c.rubrica}</span>
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
