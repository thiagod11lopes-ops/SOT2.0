import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { listRowFromRecord, type DepartureRecord, type DepartureType } from "../types/departure";

export interface DeparturesPdfSignatures {
  motorista1: string | null;
  motorista2: string | null;
  /** Nome do assinante (Divisão de Transporte). */
  assinanteDivisao: string | null;
}

type JsPDFWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

function drawSignatureBlock(
  doc: jsPDF,
  x: number,
  topY: number,
  width: number,
  name: string,
  label: string,
): number {
  let y = topY + 4;
  doc.setDrawColor(40);
  doc.setLineWidth(0.35);
  doc.line(x, y, x + width, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const nameLines = doc.splitTextToSize(name, width);
  doc.text(nameLines, x, y);
  y += nameLines.length * 4.8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text(label, x, y);
  doc.setTextColor(0, 0, 0);
  return y + 5;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "documento";
}

/**
 * Gera PDF em paisagem com a tabela de saídas e blocos de assinatura (quando houver).
 */
export function downloadDeparturesListPdf(params: {
  listTitle: string;
  tipo: DepartureType;
  filterDate: string;
  rows: DepartureRecord[];
  signatures: DeparturesPdfSignatures;
}): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(params.listTitle, margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const dateLabel = params.filterDate.trim() ? params.filterDate : "(data incompleta)";
  doc.text(`Filtro por data de saída: ${dateLabel}`, margin, y);
  y += 9;

  const head = [["Viatura", "Motorista", "Saída", "Destino", "OM", "KM saída", "KM chegada", "Chegada", "Setor"]];
  const body: string[][] = params.rows.map((r) => {
    const lr = listRowFromRecord(r);
    return [
      lr.viatura,
      lr.motorista,
      lr.saida,
      lr.destino,
      lr.om,
      lr.kmSaida,
      lr.kmChegada,
      lr.chegada,
      lr.setor,
    ];
  });
  const tableBody = body.length > 0 ? body : [["—", "—", "—", "—", "—", "—", "—", "—", "Nenhum registro"]];

  autoTable(doc, {
    startY: y,
    head,
    body: tableBody,
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [230, 230, 235], textColor: [20, 20, 20], fontStyle: "bold" },
    margin: { left: margin, right: margin },
    tableWidth: "auto",
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 28 },
      2: { cellWidth: 16 },
      3: { cellWidth: 42 },
      4: { cellWidth: 22 },
      5: { cellWidth: 18 },
      6: { cellWidth: 18 },
      7: { cellWidth: 16 },
      8: { cellWidth: 28 },
    },
  });

  const finalY = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 40;
  y = finalY + 10;

  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const usableW = pageW - 2 * margin;

  if (y > pageH - 55) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Assinaturas", margin, y);
  y += 8;

  const { motorista1, motorista2, assinanteDivisao } = params.signatures;
  const hasAny = Boolean(motorista1 || motorista2 || assinanteDivisao);

  if (params.tipo === "Ambulância" && (motorista1 || motorista2)) {
    const gap = 8;
    const half = (usableW - gap) / 2;
    const leftX = margin;
    const rightX = margin + half + gap;
    const startY = y;
    let bottom = startY;
    if (motorista1) {
      bottom = Math.max(bottom, drawSignatureBlock(doc, leftX, startY, half, motorista1, "Motorista1"));
    }
    if (motorista2) {
      bottom = Math.max(bottom, drawSignatureBlock(doc, rightX, startY, half, motorista2, "Motorista 2"));
    }
    y = bottom + 4;
  }

  if (assinanteDivisao) {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }
    y = drawSignatureBlock(doc, margin, y, usableW, assinanteDivisao, "Divisão de Transporte");
  }

  if (!hasAny) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("(Nenhuma assinatura confirmada no painel Assinar.)", margin, y);
    doc.setTextColor(0, 0, 0);
  }

  const slugTipo = params.tipo === "Ambulância" ? "ambulancia" : "administrativas";
  const slugData = safeFileSegment(params.filterDate.trim() || "sem-data");
  doc.save(`saidas-${slugTipo}-${slugData}.pdf`);
}
