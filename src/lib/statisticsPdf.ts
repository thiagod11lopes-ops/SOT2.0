import { jsPDF } from "jspdf";

export type StatisticsPdfChartImage = { title: string; dataUrl: string };

/** PDF resumido: páginas em paisagem com os gráficos capturados do painel; última página em retrato com filtros e indicadores. */
export interface StatisticsPdfParams {
  filterSummaryLines: string[];
  generatedAtLabel: string;
  totals: { total: number; admin: number; ambulance: number };
  lateFora: number;
  lateNoPrazo: number;
  latePercent: number;
  chartImages: StatisticsPdfChartImage[];
}

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "estatisticas";
}

function addChartImagePageLandscape(
  doc: jsPDF,
  title: string,
  dataUrl: string,
  marginMm: number,
  addPageBefore: boolean,
) {
  if (addPageBefore) {
    doc.addPage("a4", "l");
  }
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(25, 25, 25);
  doc.text(title, marginMm, marginMm + 4);
  const titleBottom = marginMm + 11;
  const props = doc.getImageProperties(dataUrl);
  const maxW = pageW - 2 * marginMm;
  const maxH = pageH - titleBottom - marginMm;
  const ratio = Math.min(maxW / props.width, maxH / props.height);
  const w = props.width * ratio;
  const h = props.height * ratio;
  const x = marginMm + (maxW - w) / 2;
  const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
  doc.addImage(dataUrl, format, x, titleBottom, w, h);
  doc.setTextColor(0, 0, 0);
}

/** Página final em retrato: filtros, indicadores e nota (após as páginas de gráficos em paisagem). */
function renderStatisticsSummaryPage(doc: jsPDF, params: StatisticsPdfParams, margin: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const centerX = pageW / 2;

  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Estatísticas — resumo para apresentação", centerX, y, { align: "center" });
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(75, 75, 75);
  doc.text(params.generatedAtLabel, centerX, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 11;

  const filtrosLinha = params.filterSummaryLines.join("  ·  ");
  doc.setFontSize(9);
  const filtrosWrapped = doc.splitTextToSize(`Filtros: ${filtrosLinha}`, pageW - 2 * margin);
  doc.text(filtrosWrapped, margin, y);
  y += filtrosWrapped.length * 4.2 + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Indicadores-chave", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = [
    `Saídas totais: ${params.totals.total}`,
    `Administrativas: ${params.totals.admin}  ·  Ambulância: ${params.totals.ambulance}`,
    `Fora do prazo: ${params.lateFora}  ·  No prazo: ${params.lateNoPrazo}  ·  Percentagem fora do prazo: ${params.latePercent}%`,
  ];
  for (const line of lines) {
    doc.text(line, margin, y);
    y += 5.5;
  }
  y += 4;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(95, 95, 95);
  const nota = doc.splitTextToSize(
    "As páginas anteriores mostram os gráficos do painel (composição por tipo, pódios e demais visualizações). Excluídos registos com «ASD» nos campos de cadastro e, nas métricas de fora do prazo, os setores SIAD, SECOM e Emergência.",
    pageW - 2 * margin,
  );
  doc.text(nota, margin, y);
  doc.setTextColor(0, 0, 0);
}

export function buildStatisticsPdf(params: StatisticsPdfParams): { doc: jsPDF; filename: string } {
  const margin = 14;
  const imgs = params.chartImages ?? [];

  let doc: jsPDF;

  if (imgs.length > 0) {
    doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    imgs.forEach((img, index) => {
      try {
        addChartImagePageLandscape(doc, img.title, img.dataUrl, margin, index > 0);
      } catch {
        /* ignora imagem inválida */
      }
    });
    doc.addPage("a4", "p");
    renderStatisticsSummaryPage(doc, params, margin);
  } else {
    doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    renderStatisticsSummaryPage(doc, params, margin);
  }

  const slug = safeFileSegment(params.generatedAtLabel.replace(/[/\\:]/g, "-"));
  const filename = `estatisticas-apresentacao-${slug}.pdf`;
  return { doc, filename };
}

export async function downloadStatisticsPdf(params: StatisticsPdfParams): Promise<void> {
  const { doc, filename } = buildStatisticsPdf(params);
  doc.save(filename);
}
