import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";

type JsPDFWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export type StatisticsPdfRankRow = { label: string; total: number };

export type StatisticsPdfMonthlyLate = { monthLabel: string; total: number };

export type StatisticsPdfEvolutionRow = {
  label: string;
  admin: number;
  ambulance: number;
  total: number;
  late: number;
  pctLate: number;
};

export type StatisticsPdfChartImage = { title: string; dataUrl: string };

export interface StatisticsPdfParams {
  filterSummaryLines: string[];
  generatedAtLabel: string;
  totals: { total: number; admin: number; ambulance: number };
  rankingViaturas: StatisticsPdfRankRow[];
  rankingMotoristas: StatisticsPdfRankRow[];
  lateFora: number;
  lateNoPrazo: number;
  latePercent: number;
  requestedDestinations: StatisticsPdfRankRow[];
  requestedDestinationsTotal: number;
  lateSectors: StatisticsPdfRankRow[];
  lateSectorsTotal: number;
  monthlyLateStats: StatisticsPdfMonthlyLate[];
  monthlyEvolution: StatisticsPdfEvolutionRow[];
  chartImages?: StatisticsPdfChartImage[];
}

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "estatisticas";
}

function addChartImagePage(doc: jsPDF, title: string, dataUrl: string, margin: number, pageW: number, pageH: number) {
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, margin, margin + 4);
  let y = margin + 12;
  const props = doc.getImageProperties(dataUrl);
  const iw = props.width;
  const ih = props.height;
  const maxW = pageW - 2 * margin;
  const maxH = pageH - y - margin;
  const ratio = Math.min(maxW / iw, maxH / ih, 1);
  const w = iw * ratio;
  const h = ih * ratio;
  doc.addImage(dataUrl, "JPEG", margin, y, w, h);
}

export function buildStatisticsPdf(params: StatisticsPdfParams): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;

  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Estatística geral do sistema", centerX, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  doc.text(`Gerado em: ${params.generatedAtLabel}`, centerX, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Filtros aplicados", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const line of params.filterSummaryLines) {
    doc.text(line, margin, y);
    y += 4.2;
  }
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Totais (período filtrado)", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Saídas totais: ${params.totals.total}`, margin, y);
  y += 4;
  doc.text(`Administrativas: ${params.totals.admin}`, margin, y);
  y += 4;
  doc.text(`Ambulância: ${params.totals.ambulance}`, margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Ranking completo — viaturas", margin, y);
  y += 6;

  const tableCommon = {
    styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" as const, valign: "middle" as const },
    headStyles: {
      fillColor: [230, 230, 235] as [number, number, number],
      textColor: [20, 20, 20] as [number, number, number],
      fontStyle: "bold" as const,
    },
    margin: { left: margin, right: margin },
  };

  autoTable(doc, {
    startY: y,
    head: [["Viatura", "Saídas"]],
    body:
      params.rankingViaturas.length === 0
        ? [["—", "0"]]
        : params.rankingViaturas.map((r) => [r.label, String(r.total)]),
    ...tableCommon,
    theme: "striped",
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 20;
  y += 6;

  if (y > pageH - 40) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Pódio / ranking completo — motoristas", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Motorista", "Saídas"]],
    body:
      params.rankingMotoristas.length === 0
        ? [["—", "0"]]
        : params.rankingMotoristas.map((r) => [r.label, String(r.total)]),
    ...tableCommon,
    theme: "striped",
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 20;
  y += 8;

  if (y > pageH - 50) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Solicitações fora do prazo (regra: pedido antes da saída e hora do pedido após 09:59)", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Fora do prazo: ${params.lateFora}  |  No prazo: ${params.lateNoPrazo}  |  Percentagem fora do prazo: ${params.latePercent}%`, margin, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Destinos mais solicitados (todas as saídas no período)", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Destino", "Quantidade", "Participação"]],
    body:
      params.requestedDestinations.length === 0
        ? [["—", "0", "0%"]]
        : params.requestedDestinations.map((r) => {
            const pct =
              params.requestedDestinationsTotal > 0
                ? Math.round((r.total / params.requestedDestinationsTotal) * 100)
                : 0;
            return [r.label, String(r.total), `${pct}%`];
          }),
    ...tableCommon,
    theme: "striped",
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 20;
  y += 8;

  if (y > pageH - 40) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Setores com pedidos fora do prazo", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Setor", "Quantidade", "Participação"]],
    body:
      params.lateSectors.length === 0
        ? [["—", "0", "0%"]]
        : params.lateSectors.map((r) => {
            const pct =
              params.lateSectorsTotal > 0 ? Math.round((r.total / params.lateSectorsTotal) * 100) : 0;
            return [r.label, String(r.total), `${pct}%`];
          }),
    ...tableCommon,
    theme: "striped",
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 20;
  y += 8;

  if (y > pageH - 40) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Gráfico mensal de saídas fora do prazo (valores por mês)", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Mês", "Quantidade fora do prazo"]],
    body:
      params.monthlyLateStats.length === 0
        ? [["—", "0"]]
        : params.monthlyLateStats.map((r) => [r.monthLabel, String(r.total)]),
    ...tableCommon,
    theme: "striped",
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 20;
  y += 8;

  if (y > pageH - 40) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Evolução mensal — dados tabulares (equivalente aos gráficos de linhas)", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Mês", "Adm.", "Amb.", "Total saídas", "Fora prazo", "% fora"]],
    body:
      params.monthlyEvolution.length === 0
        ? [["—", "0", "0", "0", "0", "0%"]]
        : params.monthlyEvolution.map((r) => [
            r.label,
            String(r.admin),
            String(r.ambulance),
            String(r.total),
            String(r.late),
            `${r.pctLate}%`,
          ]),
    ...tableCommon,
    theme: "striped",
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 20;
  y += 6;

  let footY = y + 4;
  if (footY > pageH - 28) {
    doc.addPage();
    footY = margin;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  const note =
    "Notas: excluídos registos com ASD em motorista ou viatura; nas métricas de fora do prazo excluídos setores SIAD, SECOM e Emergência.";
  doc.text(doc.splitTextToSize(note, pageW - 2 * margin), margin, footY);
  doc.setTextColor(0, 0, 0);

  const imgs = params.chartImages ?? [];
  for (const img of imgs) {
    try {
      addChartImagePage(doc, img.title, img.dataUrl, margin, pageW, pageH);
    } catch {
      /* ignora imagem inválida */
    }
  }

  const slug = safeFileSegment(params.generatedAtLabel.replace(/[/\\:]/g, "-"));
  const filename = `estatisticas-${slug}.pdf`;
  return { doc, filename };
}

export async function downloadStatisticsPdf(params: StatisticsPdfParams): Promise<void> {
  const { doc, filename } = buildStatisticsPdf(params);
  doc.save(filename);
}
