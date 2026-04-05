import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { isRubricaImageDataUrl } from "./rubricaDrawing";
import { listRowFromRecord, type DepartureRecord, type DepartureType } from "../types/departure";

export interface DeparturesPdfSignatures {
  /** Nome do assinante (Divisão de Transporte). */
  assinanteDivisao: string | null;
}

type JsPDFWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

/** Soma das larguras das colunas da tabela (mm) — usada para centrar a tabela na página. */
const TABLE_TOTAL_WIDTH_MM =
  26 + 28 + 16 + 42 + 22 + 18 + 18 + 16 + 28 + 30;

/** No PDF, rubrica de saída cancelada (texto) — antecede o nome; evita duplicar se já existir no registo. */
const PDF_RUBRICA_CANCEL_PREFIX = "Cancelado por: ";

function rubricaJaTemPrefixoCancelado(text: string): boolean {
  return /^\s*cancelado\s+por\s*:/i.test(text.trim());
}

/** Conteúdo textual da coluna Rubrica na tabela do PDF (não inclui desenho; imagem usa célula vazia + didDrawCell). */
function rubricaColunaPdf(r: DepartureRecord): string {
  const raw = (r.rubrica ?? "").trim();
  if (raw.length === 0) return "—";
  if (isRubricaImageDataUrl(raw)) return " ";
  let t = raw;
  if (r.cancelada === true && !rubricaJaTemPrefixoCancelado(t)) {
    t = PDF_RUBRICA_CANCEL_PREFIX + t;
  }
  return t;
}

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

  const head = [
    ["Viatura", "Motorista", "Saída", "Destino", "OM", "KM saída", "KM chegada", "Chegada", "Setor", "Rubrica"],
  ];

  /** Índice da linha da tabela → índice em `params.rows`, ou `occ` para linha de ocorrências. */
  const rowMap: Array<number | "occ"> = [];
  const tableBody: (
    | [string, string, string, string, string, string, string, string, string, string]
    | [{ content: string; colSpan: number; styles: Record<string, unknown> }]
  )[] = [];

  if (params.rows.length === 0) {
    tableBody.push(["—", "—", "—", "—", "—", "—", "—", "—", "—", "Nenhum registro"]);
  } else {
    for (let i = 0; i < params.rows.length; i++) {
      const r = params.rows[i];
      const lr = listRowFromRecord(r);
      const rubricaCol = rubricaColunaPdf(r);
      tableBody.push([
        lr.viatura,
        lr.motorista,
        lr.saida,
        lr.destino,
        lr.om,
        lr.kmSaida,
        lr.kmChegada,
        lr.chegada,
        lr.setor,
        rubricaCol,
      ]);
      rowMap.push(i);
      const occ = (r.ocorrencias ?? "").trim();
      if (occ) {
        tableBody.push([
          {
            content: `Ocorrências: ${occ}`,
            colSpan: 10,
            styles: {
              fontSize: 6.2,
              fontStyle: "italic",
              textColor: [55, 55, 55],
              cellPadding: { top: 1.2, bottom: 1.6, left: 2, right: 2 },
            },
          },
        ]);
        rowMap.push("occ");
      }
    }
  }

  autoTable(doc, {
    startY: y,
    head,
    body: tableBody,
    styles: {
      fontSize: 7,
      cellPadding: { top: 1.35, bottom: 1.35, left: 1.2, right: 1.2 },
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [230, 230, 235],
      textColor: [20, 20, 20],
      fontStyle: "bold",
      valign: "middle",
    },
    bodyStyles: { valign: "middle" },
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
      9: { cellWidth: 30 },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 9) return;
      const m = rowMap[data.row.index];
      if (m === "occ" || m === undefined) return;
      const row = params.rows[m];
      if (!row) return;
      const raw = (row.rubrica ?? "").trim();
      if (isRubricaImageDataUrl(raw)) {
        data.cell.text = [];
        data.cell.styles.minCellHeight = 20;
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 9) return;
      const m = rowMap[data.row.index];
      if (m === "occ" || m === undefined) return;
      const row = params.rows[m];
      if (!row) return;
      const raw = (row.rubrica ?? "").trim();
      if (!isRubricaImageDataUrl(raw)) return;
      /** Área útil da célula; a rubrica usa 64% da área (≈ 20% menor que os 80% anteriores) e fica centrada. */
      const pad = 0.25;
      const innerW = Math.max(0.5, data.cell.width - pad * 2);
      const innerH = Math.max(0.5, data.cell.height - pad * 2);
      const scale = 0.8 * 0.8;
      const iw = innerW * scale;
      const ih = innerH * scale;
      const ix = data.cell.x + pad + (innerW - iw) / 2;
      const iy = data.cell.y + pad + (innerH - ih) / 2;
      try {
        data.doc.addImage(raw, "PNG", ix, iy, iw, ih);
      } catch {
        /* ignore */
      }
    },
  });

  const finalY = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 40;
  y = finalY + 12;

  if (y > pageH - 55) {
    doc.addPage();
    y = margin;
  }

  const { assinanteDivisao } = params.signatures;
  const hasAny = Boolean(assinanteDivisao);

  /** Largura do bloco de assinatura (Divisão de Transporte), centrada na página. */
  const signGroupW = Math.min(usableW, 168);

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
