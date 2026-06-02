import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { fetchRubricaThiagoAsDataUrl } from "./rubricaAssinanteThiago";
import {
  resolveDeparturesAssinanteDisplay,
  type DeparturesAssinanteTextLine,
} from "./departuresAssinanteDisplay";
import { isRubricaImageDataUrl } from "./rubricaDrawing";
import { addRubricaPngToPdf, prepareRubricaDataUrlForPdf, prepareRubricaDataUrlMapForPdf } from "./rubricaPdfEmbed";
import {
  groupDeparturesForListDisplay,
  listRowFromRecord,
  type DepartureRecord,
  type DepartureType,
} from "../types/departure";
import type { PdfOccurrenceEntry } from "../types/pdfOccurrence";

export interface DeparturesPdfSignatures {
  /** Nome do assinante (Divisão de Transporte). */
  assinanteDivisao: string | null;
}

type JsPDFWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

/** Soma das larguras das colunas da tabela (mm) — usada para centrar a tabela na página. */
const TABLE_TOTAL_WIDTH_MM =
  26 + 28 + 16 + 42 + 22 + 18 + 18 + 16 + 28 + 30;

/** Rubricas PNG no PDF: 1 = tamanho pleno (o dobro do anterior 0,5). */
const PDF_RUBRICA_IMAGE_SCALE = 1;
/** Fração da área útil da célula «Rubrica» ocupada pelo desenho. */
const PDF_RUBRICA_TABLE_FILL = 0.8 * 0.8;
/** Altura mínima (mm) das linhas com rubrica desenhada na tabela. */
const PDF_RUBRICA_CELL_MIN_HEIGHT_MM = 24;
const PDF_OCC_RUBRICA_CELL_MIN_HEIGHT_MM = 20;

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

/** Margem inferior reservada ao bloco de assinatura (mm). */
const PDF_SIGNATURE_BOTTOM_MARGIN_MM = 14;
const PDF_SIGNATURE_PLACEHOLDER_HEIGHT_MM = 8;

/** Estima a altura vertical (mm) do bloco de assinatura — alinhado a `drawSignatureBlock`. */
function estimateSignatureBlockHeightMm(
  doc: jsPDF,
  blockWidth: number,
  textLines: DeparturesAssinanteTextLine[],
  rubricaPngDataUrl: string | null,
): number {
  const innerPad = 2;
  const maxTextW = Math.max(16, blockWidth - innerPad * 2);
  let textHeight = 0;
  for (const entry of textLines) {
    const chunks = doc.splitTextToSize(entry.text.trim(), maxTextW) as string[];
    for (let i = 0; i < chunks.length; i++) {
      textHeight += entry.muted ? 4.2 : 4.8;
    }
  }
  let h = 4 + 6 + textHeight + 5;
  if (rubricaPngDataUrl) {
    h += 10 * PDF_RUBRICA_IMAGE_SCALE + 2;
  }
  return h;
}

function signatureTopYOnPage(pageH: number, sigHeight: number): number {
  return pageH - PDF_SIGNATURE_BOTTOM_MARGIN_MM - sigHeight;
}

function stampSignatureOnEveryPage(
  doc: jsPDF,
  pageH: number,
  margin: number,
  usableW: number,
  blockLeft: number,
  signGroupW: number,
  sigHeight: number,
  assinanteDisplay: ReturnType<typeof resolveDeparturesAssinanteDisplay> | null,
  rubricaAssinanteDataUrl: string | null,
  hasAny: boolean,
): void {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    const topY = signatureTopYOnPage(pageH, sigHeight);
    if (hasAny && assinanteDisplay) {
      drawSignatureBlock(
        doc,
        blockLeft,
        topY,
        signGroupW,
        assinanteDisplay.lines,
        rubricaAssinanteDataUrl,
      );
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(
        "(Nenhuma assinatura confirmada no painel Assinar.)",
        margin + usableW / 2,
        topY + 4,
        { align: "center" },
      );
      doc.setTextColor(0, 0, 0);
    }
  }
}

function drawSignatureBlock(
  doc: jsPDF,
  blockX: number,
  topY: number,
  blockWidth: number,
  textLines: DeparturesAssinanteTextLine[],
  rubricaPngDataUrl: string | null = null,
): number {
  const centerX = blockX + blockWidth / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const innerPad = 2;
  const maxTextW = Math.max(16, blockWidth - innerPad * 2);

  const wrappedLines: DeparturesAssinanteTextLine[] = [];
  for (const entry of textLines) {
    const chunks = doc.splitTextToSize(entry.text.trim(), maxTextW) as string[];
    for (const chunk of chunks) {
      wrappedLines.push({ text: chunk, bold: entry.bold, muted: entry.muted });
    }
  }

  let maxLineW = 0;
  for (const entry of wrappedLines) {
    doc.setFont("helvetica", entry.bold ? "bold" : "normal");
    doc.setFontSize(entry.muted ? 8 : entry.bold ? 10 : 9);
    maxLineW = Math.max(maxLineW, doc.getTextWidth(entry.text));
  }
  const lineW = Math.min(blockWidth, maxLineW + SIGNATURE_LINE_PAD_MM * 2);

  const lineY = topY + 4;
  doc.setDrawColor(40);
  doc.setLineWidth(0.35);
  doc.line(centerX - lineW / 2, lineY, centerX + lineW / 2, lineY);

  let nameStartY = lineY + 6;
  if (rubricaPngDataUrl) {
    const baseW = Math.min(blockWidth - 6, Math.max(38, lineW + 6));
    const imgH = 10 * PDF_RUBRICA_IMAGE_SCALE;
    const imgW = baseW * PDF_RUBRICA_IMAGE_SCALE;
    const ix = centerX - imgW / 2;
    const iy = lineY - imgH;
    try {
      addRubricaPngToPdf(doc, rubricaPngDataUrl, ix, iy, imgW, imgH);
    } catch {
      /* ignore */
    }
    nameStartY = Math.max(lineY + 6, iy + imgH + 2);
  }

  let ty = nameStartY;
  for (const entry of wrappedLines) {
    doc.setFont("helvetica", entry.bold ? "bold" : "normal");
    doc.setFontSize(entry.muted ? 8 : entry.bold ? 10 : 9);
    if (entry.muted) doc.setTextColor(70, 70, 70);
    else doc.setTextColor(0, 0, 0);
    doc.text(entry.text, centerX, ty, { align: "center" });
    ty += entry.muted ? 4.2 : 4.8;
  }
  doc.setTextColor(0, 0, 0);
  return ty + 5;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "documento";
}

const PDF_OCC_RUBRICA_W_MM = 22;
const PDF_OCC_RUBRICA_H_MM = 10;

function drawOccurrenceRubricaBeside(
  doc: jsPDF,
  rubricaRaw: string | undefined,
  x: number,
  y: number,
  maxHeightMm: number,
): void {
  const raw = (rubricaRaw ?? "").trim();
  if (!isRubricaImageDataUrl(raw)) return;
  const imgW = PDF_OCC_RUBRICA_W_MM * PDF_RUBRICA_IMAGE_SCALE;
  const imgH = Math.min(maxHeightMm, PDF_OCC_RUBRICA_H_MM * PDF_RUBRICA_IMAGE_SCALE);
  addRubricaPngToPdf(doc, raw, x, y, imgW, imgH);
}

function drawUnlinkedOccurrenceBlock(
  doc: jsPDF,
  entry: PdfOccurrenceEntry,
  leftX: number,
  y: number,
  blockWidthMm: number,
  pageH: number,
  margin: number,
  resolveRubrica: (raw?: string) => string,
  footerReserveMm: number,
): number {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(55, 55, 55);
  const rubricaW =
    entry.rubrica && isRubricaImageDataUrl(entry.rubrica)
      ? PDF_OCC_RUBRICA_W_MM * PDF_RUBRICA_IMAGE_SCALE + 2
      : 0;
  const textW = Math.max(40, blockWidthMm - rubricaW);
  const lines = doc.splitTextToSize(`Ocorrências: ${entry.texto}`, textW) as string[];
  const lineH = 3.15;
  const textH = lines.length * lineH;
  const imgH =
    entry.rubrica && isRubricaImageDataUrl(entry.rubrica)
      ? PDF_OCC_RUBRICA_H_MM * PDF_RUBRICA_IMAGE_SCALE
      : 0;
  const blockH = Math.max(textH, imgH) + 1.5;
  const maxContentY = pageH - footerReserveMm;
  if (y + blockH > maxContentY) {
    doc.addPage();
    y = margin;
  }
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i]!, leftX, y + i * lineH);
  }
  if (entry.rubrica) {
    drawOccurrenceRubricaBeside(doc, resolveRubrica(entry.rubrica), leftX + textW + 1.5, y, blockH);
  }
  doc.setTextColor(0, 0, 0);
  return y + blockH + 1.5;
}

export interface DeparturesListPdfParams {
  listTitle: string;
  tipo: DepartureType;
  filterDate: string;
  rows: DepartureRecord[];
  signatures: DeparturesPdfSignatures;
  /** Ocorrências sem placa — entre tabela e assinatura, alinhadas à esquerda. */
  unlinkedOccurrences?: PdfOccurrenceEntry[];
}

/**
 * Monta o PDF em paisagem com a tabela de saídas e blocos de assinatura (quando houver).
 */
export async function buildDeparturesListPdf(params: DeparturesListPdfParams): Promise<{ doc: jsPDF; filename: string }> {
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

  const omOrHospitalHead = params.tipo === "Ambulância" ? "Hospital" : "OM";
  const head = [
    ["Viatura", "Motorista", "Saída", "Destino", omOrHospitalHead, "KM saída", "KM chegada", "Chegada", "Setor", "Rubrica"],
  ];

  /** Índice da linha da tabela → índice em `params.rows`, ou `occ` para linha de ocorrências. */
  const rowMap: Array<number | "occ"> = [];
  const occRowMeta: PdfOccurrenceEntry[] = [];
  const tableBody: (
    | [string, string, string, string, string, string, string, string, string, string]
    | [{ content: string; colSpan: number; styles: Record<string, unknown> }]
  )[] = [];

  if (params.rows.length === 0) {
    tableBody.push(["—", "—", "—", "—", "—", "—", "—", "—", "—", "Nenhum registro"]);
  } else {
    const groups = groupDeparturesForListDisplay(params.rows);
    for (const g of groups) {
      const r = g.primary;
      const lr = { ...listRowFromRecord(r), destino: g.destinoDisplay, setor: g.setorDisplay };
      const rubricaCol = rubricaColunaPdf(r);
      const primaryIdx = params.rows.findIndex((x) => x.id === r.id);
      const omOrHospitalCell = params.tipo === "Ambulância" ? lr.hospital : lr.om;
      tableBody.push([
        lr.viatura,
        lr.motorista,
        lr.saida,
        lr.destino,
        omOrHospitalCell,
        lr.kmSaida,
        lr.kmChegada,
        lr.chegada,
        lr.setor,
        rubricaCol,
      ]);
      rowMap.push(primaryIdx >= 0 ? primaryIdx : 0);
      for (const rec of g.records) {
        const occ = (rec.ocorrencias ?? "").trim();
        if (occ) {
          const occRubrica = (rec.ocorrenciasRubrica ?? "").trim() || undefined;
          tableBody.push([
            {
              content: `Ocorrências: ${occ}`,
              colSpan: 10,
              styles: {
                fontSize: 6.2,
                fontStyle: "italic",
                textColor: [55, 55, 55],
                cellPadding: { top: 1.2, bottom: 1.6, left: 2, right: occRubrica ? 48 : 2 },
                halign: "left",
              },
            },
          ]);
          rowMap.push("occ");
          occRowMeta.push({ texto: occ, rubrica: occRubrica });
        }
      }
    }
  }

  const rubricaSources: string[] = [];
  for (const row of params.rows) {
    const raw = (row.rubrica ?? "").trim();
    if (isRubricaImageDataUrl(raw)) rubricaSources.push(raw);
    const occRaw = (row.ocorrenciasRubrica ?? "").trim();
    if (isRubricaImageDataUrl(occRaw)) rubricaSources.push(occRaw);
  }
  for (const entry of params.unlinkedOccurrences ?? []) {
    const raw = (entry.rubrica ?? "").trim();
    if (isRubricaImageDataUrl(raw)) rubricaSources.push(raw);
  }
  const rubricaEmbedBySource = await prepareRubricaDataUrlMapForPdf(rubricaSources);

  const resolveRubricaEmbed = (raw: string | undefined): string => {
    const trimmed = (raw ?? "").trim();
    if (!isRubricaImageDataUrl(trimmed)) return trimmed;
    return rubricaEmbedBySource.get(trimmed) ?? trimmed;
  };

  const { assinanteDivisao } = params.signatures;
  const hasAny = Boolean(assinanteDivisao);
  const assinanteDisplay = assinanteDivisao ? resolveDeparturesAssinanteDisplay(assinanteDivisao) : null;
  let rubricaAssinanteDataUrl: string | null = null;
  if (assinanteDisplay?.rubricaThiagoPng) {
    const thiagoRaw = await fetchRubricaThiagoAsDataUrl();
    rubricaAssinanteDataUrl = thiagoRaw ? await prepareRubricaDataUrlForPdf(thiagoRaw) : null;
  }
  const signGroupW = Math.min(usableW, 168);
  const blockLeft = margin + (usableW - signGroupW) / 2;
  const sigHeight =
    hasAny && assinanteDisplay
      ? estimateSignatureBlockHeightMm(doc, signGroupW, assinanteDisplay.lines, rubricaAssinanteDataUrl)
      : PDF_SIGNATURE_PLACEHOLDER_HEIGHT_MM;
  /** Reserva rodapé em cada folha para a assinatura não sobrepor a tabela. */
  const footerReserveMm = sigHeight + PDF_SIGNATURE_BOTTOM_MARGIN_MM;

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
    showHead: "everyPage",
    margin: {
      left: margin + tableSideOffset,
      right: margin + tableSideOffset,
      bottom: footerReserveMm,
    },
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
      if (data.section !== "body") return;
      if (rowMap[data.row.index] === "occ" && data.column.index === 0) {
        const meta = occRowMeta[data.row.index];
        if (meta?.rubrica && isRubricaImageDataUrl(meta.rubrica)) {
          data.cell.styles.minCellHeight = PDF_OCC_RUBRICA_CELL_MIN_HEIGHT_MM;
        }
        return;
      }
      if (data.column.index !== 9) return;
      const m = rowMap[data.row.index];
      if (m === "occ" || m === undefined) return;
      const row = params.rows[m];
      if (!row) return;
      const raw = (row.rubrica ?? "").trim();
      if (isRubricaImageDataUrl(raw)) {
        data.cell.text = [];
        data.cell.styles.minCellHeight = PDF_RUBRICA_CELL_MIN_HEIGHT_MM;
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (rowMap[data.row.index] === "occ" && data.column.index === 0) {
        const meta = occRowMeta[data.row.index];
        if (meta?.rubrica) {
          const pad = 0.35;
          const imgW = PDF_OCC_RUBRICA_W_MM * PDF_RUBRICA_IMAGE_SCALE;
          const imgH = Math.min(data.cell.height - pad * 2, PDF_OCC_RUBRICA_H_MM * PDF_RUBRICA_IMAGE_SCALE);
          drawOccurrenceRubricaBeside(
            data.doc,
            resolveRubricaEmbed(meta.rubrica),
            data.cell.x + data.cell.width - imgW - pad,
            data.cell.y + pad,
            imgH,
          );
        }
        return;
      }
      if (data.column.index !== 9) return;
      const m = rowMap[data.row.index];
      if (m === "occ" || m === undefined) return;
      const row = params.rows[m];
      if (!row) return;
      const raw = (row.rubrica ?? "").trim();
      if (!isRubricaImageDataUrl(raw)) return;
      const embed = resolveRubricaEmbed(raw);
      /** Área útil da célula; rubrica centrada com escala plena (2× vs. configuração anterior). */
      const pad = 0.25;
      const innerW = Math.max(0.5, data.cell.width - pad * 2);
      const innerH = Math.max(0.5, data.cell.height - pad * 2);
      const scale = PDF_RUBRICA_TABLE_FILL * PDF_RUBRICA_IMAGE_SCALE;
      const iw = innerW * scale;
      const ih = innerH * scale;
      const ix = data.cell.x + pad + (innerW - iw) / 2;
      const iy = data.cell.y + pad + (innerH - ih) / 2;
      addRubricaPngToPdf(data.doc, embed, ix, iy, iw, ih);
    },
  });

  const finalY = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 40;
  y = finalY + 12;

  const unlinked = (params.unlinkedOccurrences ?? []).filter((e) => e.texto.trim().length > 0);
  if (unlinked.length > 0) {
    const leftX = margin + tableSideOffset;
    for (const entry of unlinked) {
      y = drawUnlinkedOccurrenceBlock(
        doc,
        entry,
        leftX,
        y,
        TABLE_TOTAL_WIDTH_MM,
        pageH,
        margin,
        resolveRubricaEmbed,
        footerReserveMm,
      );
    }
    y += 4;
  }

  stampSignatureOnEveryPage(
    doc,
    pageH,
    margin,
    usableW,
    blockLeft,
    signGroupW,
    sigHeight,
    assinanteDisplay,
    rubricaAssinanteDataUrl,
    hasAny,
  );

  const slugTipo = params.tipo === "Ambulância" ? "ambulancia" : "administrativas";
  const slugData = safeFileSegment(params.filterDate.trim() || "sem-data");
  const filename = `saidas-${slugTipo}-${slugData}.pdf`;
  return { doc, filename };
}

export async function downloadDeparturesListPdf(params: DeparturesListPdfParams): Promise<void> {
  const { doc, filename } = await buildDeparturesListPdf(params);
  doc.save(filename);
}

/** Descarrega vários PDFs em sequência (evita bloquear pop-ups do navegador). */
export async function downloadDeparturesListPdfsInSequence(
  paramsList: DeparturesListPdfParams[],
): Promise<void> {
  for (let i = 0; i < paramsList.length; i++) {
    await downloadDeparturesListPdf(paramsList[i]);
    if (i < paramsList.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

export async function getDeparturesListPdfBlob(params: DeparturesListPdfParams): Promise<{ blob: Blob; filename: string }> {
  const { doc, filename } = await buildDeparturesListPdf(params);
  return { blob: doc.output("blob"), filename };
}
