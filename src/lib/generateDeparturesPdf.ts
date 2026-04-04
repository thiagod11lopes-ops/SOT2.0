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

/** Soma das larguras das colunas da tabela (mm) — usada para centrar a tabela na página. */
const TABLE_TOTAL_WIDTH_MM =
  26 + 28 + 16 + 42 + 22 + 18 + 18 + 16 + 28;

/** Margem extra de cada lado da linha relativamente à largura máxima do nome (mm). */
const SIGNATURE_LINE_PAD_MM = 2.8;

function drawSignatureBlock(
  doc: jsPDF,
  blockX: number,
  topY: number,
  blockWidth: number,
  name: string,
  label: string,
): number {
  const centerX = blockX + blockWidth / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const innerPad = 2;
  const maxTextW = Math.max(16, blockWidth - innerPad * 2);
  const nameLines = doc.splitTextToSize(name.trim(), maxTextW);
  let maxLineW = 0;
  for (const line of nameLines) {
    maxLineW = Math.max(maxLineW, doc.getTextWidth(line));
  }
  const lineW = Math.min(blockWidth, maxLineW + SIGNATURE_LINE_PAD_MM * 2);

  let y = topY + 4;
  doc.setDrawColor(40);
  doc.setLineWidth(0.35);
  doc.line(centerX - lineW / 2, y, centerX + lineW / 2, y);
  y += 6;
  let ty = y;
  for (const line of nameLines) {
    doc.text(line, centerX, ty, { align: "center" });
    ty += 4.8;
  }
  y = ty;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text(label, centerX, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  return y + 5;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "documento";
}

export interface DeparturesListPdfParams {
  listTitle: string;
  tipo: DepartureType;
  filterDate: string;
  rows: DepartureRecord[];
  signatures: DeparturesPdfSignatures;
}

/**
 * Monta o PDF em paisagem com a tabela de saídas e blocos de assinatura (quando houver).
 */
export function buildDeparturesListPdf(params: DeparturesListPdfParams): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - 2 * margin;
  const tableSideOffset = Math.max(0, (usableW - TABLE_TOTAL_WIDTH_MM) / 2);
  const centerX = pageW / 2;

  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(params.listTitle, centerX, y, { align: "center" });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const dateLabel = params.filterDate.trim() ? params.filterDate : "(data incompleta)";
  doc.text(`Data: ${dateLabel}`, centerX, y, { align: "center" });
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
    margin: { left: margin + tableSideOffset, right: margin + tableSideOffset },
    tableWidth: TABLE_TOTAL_WIDTH_MM,
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
  y = finalY + 12;

  if (y > pageH - 55) {
    doc.addPage();
    y = margin;
  }

  const { motorista1, motorista2, assinanteDivisao } = params.signatures;
  const hasAny = Boolean(motorista1 || motorista2 || assinanteDivisao);

  /** Largura do grupo de assinaturas (motoristas em par, ou bloco único), centrada na página. */
  const signGroupW = Math.min(usableW, 168);

  if (params.tipo === "Ambulância" && (motorista1 || motorista2)) {
    const gap = 8;
    const pairLeft = margin + (usableW - signGroupW) / 2;
    const half = (signGroupW - gap) / 2;
    const leftX = pairLeft;
    const rightX = pairLeft + half + gap;
    const startY = y;
    let bottom = startY;
    if (motorista1) {
      bottom = Math.max(bottom, drawSignatureBlock(doc, leftX, startY, half, motorista1, "Motorista 1"));
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
    const blockLeft = margin + (usableW - signGroupW) / 2;
    y = drawSignatureBlock(doc, blockLeft, y, signGroupW, assinanteDivisao, "Divisão de Transporte");
  }

  if (!hasAny) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("(Nenhuma assinatura confirmada no painel Assinar.)", margin + usableW / 2, y, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const slugTipo = params.tipo === "Ambulância" ? "ambulancia" : "administrativas";
  const slugData = safeFileSegment(params.filterDate.trim() || "sem-data");
  const filename = `saidas-${slugTipo}-${slugData}.pdf`;
  return { doc, filename };
}

export function downloadDeparturesListPdf(params: DeparturesListPdfParams): void {
  const { doc, filename } = buildDeparturesListPdf(params);
  doc.save(filename);
}

export function getDeparturesListPdfBlob(params: DeparturesListPdfParams): { blob: Blob; filename: string } {
  const { doc, filename } = buildDeparturesListPdf(params);
  return { blob: doc.output("blob"), filename };
}
