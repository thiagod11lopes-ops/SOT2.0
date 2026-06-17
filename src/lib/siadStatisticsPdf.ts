import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import type { SiadStatisticsSnapshot, SiadStatsRankEntry } from "./siadStatistics";

export type SiadStatisticsPdfParams = {
  filterLabel: string;
  generatedAtLabel: string;
  stats: SiadStatisticsSnapshot;
};

const PAGE_MARGIN = 14;
const HEADER_H = 38;

const COLORS = {
  ink: [15, 23, 42] as const,
  inkSoft: [51, 65, 85] as const,
  muted: [100, 116, 139] as const,
  paper: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  primary: [37, 99, 235] as const,
  cyan: [6, 182, 212] as const,
  violet: [139, 92, 246] as const,
  emerald: [16, 185, 129] as const,
  amber: [245, 158, 11] as const,
  rose: [244, 63, 94] as const,
  orange: [249, 115, 22] as const,
};

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "siad";
}

function setFill(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setText(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function drawPageBackground(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  setFill(doc, COLORS.paper);
  doc.rect(0, 0, w, h, "F");
}

function drawHeaderBand(doc: jsPDF, filterLabel: string, generatedAtLabel: string) {
  const w = doc.internal.pageSize.getWidth();
  setFill(doc, COLORS.ink);
  doc.rect(0, 0, w, HEADER_H, "F");
  setFill(doc, COLORS.cyan);
  doc.rect(0, HEADER_H - 1.2, w, 1.2, "F");
  setFill(doc, COLORS.orange);
  doc.rect(0, HEADER_H - 0.35, w * 0.42, 0.35, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, COLORS.cyan);
  doc.text("SIAD · BALANÇO OPERACIONAL", PAGE_MARGIN, 11);

  doc.setFontSize(18);
  setText(doc, COLORS.white);
  doc.text("Estatísticas de Saídas SIAD", PAGE_MARGIN, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, [203, 213, 225]);
  doc.text(`Período: ${filterLabel}`, PAGE_MARGIN, 27);
  doc.text(generatedAtLabel, PAGE_MARGIN, 32.5);
}

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  hint: string,
  accent: readonly [number, number, number],
) {
  setFill(doc, COLORS.white);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  setFill(doc, accent);
  doc.roundedRect(x, y, 2.2, h, 1.2, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setText(doc, COLORS.muted);
  doc.text(label.toUpperCase(), x + 5, y + 7);

  doc.setFontSize(20);
  setText(doc, COLORS.ink);
  doc.text(value, x + 5, y + 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setText(doc, COLORS.inkSoft);
  const hintLines = doc.splitTextToSize(hint, w - 8) as string[];
  doc.text(hintLines, x + 5, y + 23);
}

function drawKpiRow(doc: jsPDF, y: number, stats: SiadStatisticsSnapshot): number {
  const pageW = doc.internal.pageSize.getWidth();
  const gap = 4;
  const cardW = (pageW - PAGE_MARGIN * 2 - gap * 3) / 4;
  const cardH = 28;

  drawKpiCard(doc, PAGE_MARGIN, y, cardW, cardH, "Saídas totais", String(stats.totalSaidas), "Registros no período", COLORS.primary);
  drawKpiCard(
    doc,
    PAGE_MARGIN + cardW + gap,
    y,
    cardW,
    cardH,
    "Passageiros",
    String(stats.totalPassageiros),
    `Média ${stats.mediaPassageirosPorSaida} por saída`,
    COLORS.cyan,
  );
  drawKpiCard(
    doc,
    PAGE_MARGIN + (cardW + gap) * 2,
    y,
    cardW,
    cardH,
    "Bairros distintos",
    String(stats.bairrosUnicos),
    "Destinos únicos",
    COLORS.violet,
  );
  drawKpiCard(
    doc,
    PAGE_MARGIN + (cardW + gap) * 3,
    y,
    cardW,
    cardH,
    "Canceladas",
    String(stats.saidasCanceladas),
    stats.saidasCanceladas === 0 ? "Nenhuma no período" : "Marcadas canceladas",
    COLORS.rose,
  );

  return y + cardH + 8;
}

function drawSectionTitle(doc: jsPDF, y: number, title: string, accent: readonly [number, number, number]): number {
  setFill(doc, accent);
  doc.circle(PAGE_MARGIN + 1.5, y + 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setText(doc, COLORS.ink);
  doc.text(title, PAGE_MARGIN + 6, y + 2.5);
  return y + 8;
}

function drawRankingTable(
  doc: jsPDF,
  startY: number,
  title: string,
  entries: SiadStatsRankEntry[],
  accent: readonly [number, number, number],
  emptyLabel: string,
  marginLeft = PAGE_MARGIN,
  tableWidth?: number,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = tableWidth ?? pageW - PAGE_MARGIN * 2;

  const y = drawSectionTitle(doc, startY, title, accent);

  if (entries.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    setText(doc, COLORS.muted);
    doc.text(emptyLabel, marginLeft, y + 2);
    return y + 10;
  }

  const max = entries[0]?.total ?? 1;
  autoTable(doc, {
    startY: y,
    margin: { left: marginLeft, right: pageW - marginLeft - contentW },
    tableWidth: contentW,
    head: [["#", "Item", "Qtd.", "Part."]],
    body: entries.map((entry, index) => {
      const pct = max > 0 ? Math.round((entry.total / max) * 100) : 0;
      return [String(index + 1), entry.label, String(entry.total), `${pct}%`];
    }),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 2.8, right: 3, bottom: 2.8, left: 3 },
      textColor: COLORS.ink as unknown as [number, number, number],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: accent as unknown as [number, number, number],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      2: { cellWidth: 14, halign: "right" },
      3: { cellWidth: 16, halign: "right" },
    },
  });

  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 10;
}

function drawMonthlyEvolution(doc: jsPDF, startY: number, entries: SiadStatsRankEntry[]): number {
  if (entries.length <= 1) return startY;

  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - PAGE_MARGIN * 2;
  const y = drawSectionTitle(doc, startY, "Evolução mensal no período", COLORS.primary);

  setFill(doc, COLORS.white);
  doc.roundedRect(PAGE_MARGIN, y, contentW, 42, 3, 3, "F");

  const chartX = PAGE_MARGIN + 6;
  const chartY = y + 6;
  const chartW = contentW - 12;
  const chartH = 28;
  const max = entries.reduce((m, e) => Math.max(m, e.total), 1);
  const barGap = 3;
  const barW = Math.min(14, (chartW - barGap * (entries.length - 1)) / entries.length);

  entries.forEach((entry, index) => {
    const barH = Math.max(4, (entry.total / max) * chartH);
    const x = chartX + index * (barW + barGap);
    const yBar = chartY + chartH - barH;

    setFill(doc, COLORS.primary);
    doc.roundedRect(x, yBar, barW, barH, 1.2, 1.2, "F");
    setFill(doc, COLORS.cyan);
    doc.roundedRect(x, yBar, barW, Math.min(3, barH), 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    setText(doc, COLORS.ink);
    doc.text(String(entry.total), x + barW / 2, yBar - 1.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setText(doc, COLORS.muted);
    doc.text(entry.label, x + barW / 2, chartY + chartH + 4, { align: "center" });
  });

  return y + 48;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, COLORS.muted);
    doc.text("SOT 2.0 · Saídas SIAD — documento gerado automaticamente", PAGE_MARGIN, h - 7);
    doc.text(`Página ${page} de ${pageCount}`, w - PAGE_MARGIN, h - 7, { align: "right" });
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 16) {
    doc.addPage();
    drawPageBackground(doc);
    return PAGE_MARGIN;
  }
  return y;
}

export function buildSiadStatisticsPdf(params: SiadStatisticsPdfParams): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawPageBackground(doc);
  drawHeaderBand(doc, params.filterLabel, params.generatedAtLabel);

  let y = HEADER_H + 10;
  y = drawKpiRow(doc, y, params.stats);

  const pageW = doc.internal.pageSize.getWidth();
  const gap = 6;
  const colW = (pageW - PAGE_MARGIN * 2 - gap) / 2;

  const afterPassageiros = drawRankingTable(
    doc,
    y,
    "Ranque de Passageiros",
    params.stats.topPassageiros,
    COLORS.cyan,
    "Nenhum passageiro nomeado no período.",
    PAGE_MARGIN,
    colW,
  );

  const afterBairros = drawRankingTable(
    doc,
    y,
    "Bairros mais visitados",
    params.stats.topBairros,
    COLORS.violet,
    "Nenhum bairro registrado no período.",
    PAGE_MARGIN + colW + gap,
    colW,
  );

  y = Math.max(afterPassageiros, afterBairros) + 6;
  y = ensureSpace(doc, y, 50);

  y = drawRankingTable(
    doc,
    y,
    "Horários mais usados",
    params.stats.topHorarios,
    COLORS.amber,
    "Sem horários válidos.",
  );

  y = ensureSpace(doc, y + 4, 50);
  y = drawRankingTable(
    doc,
    y,
    "Cidades",
    params.stats.topCidades,
    COLORS.emerald,
    "Sem cidade cadastrada.",
  );

  y = ensureSpace(doc, y + 4, 50);
  y = drawRankingTable(
    doc,
    y,
    "Saídas por dia da semana",
    params.stats.porDiaSemana,
    COLORS.primary,
    "Sem dados por dia.",
  );

  y = ensureSpace(doc, y + 4, 55);
  y = drawMonthlyEvolution(doc, y, params.stats.evolucaoMensal);

  addFooter(doc);

  const slug = safeFileSegment(params.filterLabel);
  const filename = `siad-balanco-${slug}.pdf`;
  return { doc, filename };
}

export async function downloadSiadStatisticsPdf(params: SiadStatisticsPdfParams): Promise<void> {
  const { doc, filename } = buildSiadStatisticsPdf(params);
  doc.save(filename);
}
