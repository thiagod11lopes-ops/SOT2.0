import { useMemo, useState } from "react";
import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: DepartureRecord[];
  viaturasOptions: string[];
  motoristasOptions: string[];
};

function hasOcorrencia(row: DepartureRecord): boolean {
  return String(row.ocorrencias ?? "").trim().length > 0;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "todas";
}

export function DepartureOcorrenciasListModal({
  open,
  onOpenChange,
  rows,
  viaturasOptions,
  motoristasOptions,
}: Props) {
  const [filtroViatura, setFiltroViatura] = useState("");
  const [filtroMotorista, setFiltroMotorista] = useState("");

  const ocorrencias = useMemo(() => {
    const v = filtroViatura.trim().toLowerCase();
    const m = filtroMotorista.trim().toLowerCase();
    return rows
      .filter(hasOcorrencia)
      .filter((r) => (v ? r.viaturas.trim().toLowerCase() === v : true))
      .filter((r) => (m ? r.motoristas.trim().toLowerCase() === m : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rows, filtroViatura, filtroMotorista]);

  function handleGerarPdf() {
    if (ocorrencias.length === 0) {
      window.alert("Não há ocorrências para gerar PDF com os filtros atuais.");
      return;
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const margin = 12;
    let y = margin;
    const centerX = doc.internal.pageSize.getWidth() / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Relatório de Ocorrências", centerX, y, { align: "center" });
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Filtros - Viatura: ${filtroViatura || "Todas"} | Motorista: ${filtroMotorista || "Todos"}`,
      centerX,
      y,
      { align: "center" },
    );
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Tipo", "Data Saída", "Hora", "Viatura", "Motorista", "Ocorrência"]],
      body: ocorrencias.map((r) => [
        r.tipo || "—",
        r.dataSaida || "—",
        r.horaSaida || "—",
        r.viaturas || "—",
        r.motoristas || "—",
        String(r.ocorrencias ?? "").trim() || "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [230, 230, 235], textColor: [20, 20, 20], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 24 },
        2: { cellWidth: 16 },
        3: { cellWidth: 38 },
        4: { cellWidth: 46 },
        5: { cellWidth: "auto" },
      },
    });
    const slugV = safeFileSegment(filtroViatura || "todas_viaturas");
    const slugM = safeFileSegment(filtroMotorista || "todos_motoristas");
    doc.save(`ocorrencias_${slugV}_${slugM}.pdf`);
  }

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
          <div className="flex items-center gap-2">
            <Button type="button" variant="default" onClick={handleGerarPdf}>
              Gerar PDF
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </div>

        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Lista de ocorrências cadastradas com filtros por viatura e motorista.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ocorrencias-filter-viatura">
              Viatura
            </label>
            <select
              id="ocorrencias-filter-viatura"
              value={filtroViatura}
              onChange={(e) => setFiltroViatura(e.target.value)}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <option value="">Todas</option>
              {viaturasOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ocorrencias-filter-motorista">
              Motorista
            </label>
            <select
              id="ocorrencias-filter-motorista"
              value={filtroMotorista}
              onChange={(e) => setFiltroMotorista(e.target.value)}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <option value="">Todos</option>
              {motoristasOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
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
