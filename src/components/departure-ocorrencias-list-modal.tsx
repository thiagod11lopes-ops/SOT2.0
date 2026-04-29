import { useMemo, useState } from "react";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: DepartureRecord[];
};

function hasOcorrencia(row: DepartureRecord): boolean {
  return String(row.ocorrencias ?? "").trim().length > 0;
}

export function DepartureOcorrenciasListModal({ open, onOpenChange, rows }: Props) {
  const [filtroViatura, setFiltroViatura] = useState("");
  const [filtroMotorista, setFiltroMotorista] = useState("");

  const ocorrencias = useMemo(() => {
    const v = filtroViatura.trim().toLowerCase();
    const m = filtroMotorista.trim().toLowerCase();
    return rows
      .filter(hasOcorrencia)
      .filter((r) => (v ? r.viaturas.trim().toLowerCase().includes(v) : true))
      .filter((r) => (m ? r.motoristas.trim().toLowerCase().includes(m) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rows, filtroViatura, filtroMotorista]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocorrencias-list-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ocorrencias-list-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Ocorrências
          </h2>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>

        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Lista de ocorrências cadastradas com filtros por viatura e motorista.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ocorrencias-filter-viatura">
              Viatura
            </label>
            <input
              id="ocorrencias-filter-viatura"
              type="text"
              autoComplete="off"
              value={filtroViatura}
              onChange={(e) => setFiltroViatura(e.target.value)}
              placeholder="Filtrar por viatura..."
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ocorrencias-filter-motorista">
              Motorista
            </label>
            <input
              id="ocorrencias-filter-motorista"
              type="text"
              autoComplete="off"
              value={filtroMotorista}
              onChange={(e) => setFiltroMotorista(e.target.value)}
              placeholder="Filtrar por motorista..."
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>

        <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          {ocorrencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
              Nenhuma ocorrência encontrada com os filtros atuais.
            </p>
          ) : (
            ocorrencias.map((r) => (
              <article
                key={r.id}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2"
              >
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {r.tipo} - {r.dataSaida || "—"} {r.horaSaida || ""}
                </p>
                <p className="mt-1 text-sm">
                  <strong>Viatura:</strong> {r.viaturas || "—"} | <strong>Motorista:</strong> {r.motoristas || "—"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]">
                  {String(r.ocorrencias).trim()}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
