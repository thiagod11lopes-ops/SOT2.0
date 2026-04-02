import { Pencil, Trash2 } from "lucide-react";
import type { DepartureKmFieldsPatch } from "../context/departures-context";
import type { DepartureRecord } from "../types/departure";
import { listRowFromRecord } from "../types/departure";
import { normalize24hTime } from "../lib/timeInput";
import { cn } from "../lib/utils";
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

interface DeparturesDataTableProps {
  rows: DepartureRecord[];
  showTipoColumn?: boolean;
  emptyLabel: string;
  onRemove: (id: string) => void;
  /** Quando definido, KM saída, KM chegada e Chegada são editáveis inline. */
  onUpdateKmFields?: (id: string, patch: DepartureKmFieldsPatch) => void;
  /** Abre Cadastrar Nova Saída com os dados do registro. */
  onEdit?: (id: string) => void;
}

export function DeparturesDataTable({
  rows,
  showTipoColumn,
  emptyLabel,
  onRemove,
  onUpdateKmFields,
  onEdit,
}: DeparturesDataTableProps) {
  const colSpan = showTipoColumn ? 11 : 10;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showTipoColumn ? <TableHead>Tipo</TableHead> : null}
          <TableHead>Viatura</TableHead>
          <TableHead>Motorista</TableHead>
          <TableHead>Saída</TableHead>
          <TableHead>Destino</TableHead>
          <TableHead>OM</TableHead>
          <TableHead>KM saída</TableHead>
          <TableHead>KM chegada</TableHead>
          <TableHead>Chegada</TableHead>
          <TableHead>Setor</TableHead>
          <TableHead className="min-w-[5.5rem] text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="py-10 text-center text-slate-500">
              {emptyLabel}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const lr = listRowFromRecord(row);
            return (
              <TableRow key={row.id}>
                {showTipoColumn ? (
                  <TableCell className="whitespace-nowrap text-sm font-medium">{lr.tipo}</TableCell>
                ) : null}
                <TableCell>{lr.viatura}</TableCell>
                <TableCell>{lr.motorista}</TableCell>
                <TableCell className="whitespace-nowrap">{lr.saida}</TableCell>
                <TableCell className="max-w-[200px] truncate" title={lr.destino}>
                  {lr.destino}
                </TableCell>
                <TableCell>{lr.om}</TableCell>
                <TableCell className={cn(onUpdateKmFields && "p-1.5 align-middle")}>
                  {onUpdateKmFields ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="KM saída"
                      value={row.kmSaida}
                      onChange={(e) =>
                        onUpdateKmFields(row.id, {
                          kmSaida: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      className={inputClass}
                    />
                  ) : (
                    lr.kmSaida
                  )}
                </TableCell>
                <TableCell className={cn(onUpdateKmFields && "p-1.5 align-middle")}>
                  {onUpdateKmFields ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="KM chegada"
                      value={row.kmChegada}
                      onChange={(e) =>
                        onUpdateKmFields(row.id, {
                          kmChegada: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      className={inputClass}
                    />
                  ) : (
                    lr.kmChegada
                  )}
                </TableCell>
                <TableCell className={cn("whitespace-nowrap", onUpdateKmFields && "p-1.5 align-middle")}>
                  {onUpdateKmFields ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="HH:MM"
                      aria-label="Hora de chegada"
                      value={row.chegada}
                      onChange={(e) =>
                        onUpdateKmFields(row.id, {
                          chegada: normalize24hTime(e.target.value),
                        })
                      }
                      className={cn(inputClass, "max-w-[5rem]")}
                    />
                  ) : (
                    lr.chegada
                  )}
                </TableCell>
                <TableCell>{lr.setor}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center justify-end gap-0.5">
                    {onEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-[hsl(var(--primary))]"
                        aria-label="Editar registro no cadastro"
                        onClick={() => onEdit(row.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-red-600"
                      aria-label="Excluir registro"
                      onClick={() => onRemove(row.id)}
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
  );
}
