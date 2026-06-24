import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { formatMaterialDateTime, materialMovimentoTipoLabel } from "./materialControleFormat";
import type { MaterialControleDoc, MaterialPlanilha } from "./materialControleStorage";

const MARGIN = 12;

type JsPDFWithLastTable = jsPDF & { lastAutoTable?: { finalY: number } };

function safeFileSegment(value: string): string {
  return value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "material";
}

function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(title, MARGIN, y);
  return y + 5;
}

function stockTable(doc: jsPDF, planilha: MaterialPlanilha, startY: number): number {
  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Material", "Qtd.", "Unidade", "Estado", "Obs. item"]],
    body: planilha.items.map((it) => [
      it.nome,
      String(it.quantidade),
      it.unidade || "—",
      it.status === "baixa" ? "Baixa" : "Ativo",
      it.observacao || "—",
    ]),
    styles: { fontSize: 8, cellPadding: 1.6, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  return (doc as JsPDFWithLastTable).lastAutoTable?.finalY ?? startY + 10;
}

function movimentosTable(
  doc: jsPDF,
  planilha: MaterialPlanilha,
  startY: number,
): number {
  const rows = planilha.items.flatMap((it) =>
    it.movimentos.map((m) => [
      formatMaterialDateTime(m.at),
      materialMovimentoTipoLabel(m.tipo),
      it.nome,
      String(m.quantidade),
      m.responsavel,
      m.observacao || "—",
    ]),
  );
  if (rows.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Sem movimentação registada nesta planilha.", MARGIN, startY + 2);
    return startY + 8;
  }
  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Data/hora", "Tipo", "Material", "Qtd.", "Responsável", "Observações"]],
    body: rows,
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  return (doc as JsPDFWithLastTable).lastAutoTable?.finalY ?? startY + 10;
}

export function buildMaterialControleBalancoPdf(docData: MaterialControleDoc): {
  doc: jsPDF;
  filename: string;
} {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toLocaleString("pt-BR");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("Balanço de Material", pageW / 2, 16, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Gerado em ${generatedAt}`, pageW / 2, 22, { align: "center" });

  let y = 30;

  for (const planilha of docData.planilhas) {
    if (y > 250) {
      doc.addPage();
      y = MARGIN;
    }
    y = drawSectionTitle(doc, y, `Planilha: ${planilha.nome}`);
    y = stockTable(doc, planilha, y) + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Movimentação", MARGIN, y);
    y += 4;
    y = movimentosTable(doc, planilha, y) + 8;
  }

  if (docData.planilhas.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Nenhuma planilha registada.", MARGIN, y);
  }

  const stamp = safeFileSegment(generatedAt);
  return { doc, filename: `balanco-material-${stamp}.pdf` };
}

export function downloadMaterialControleBalancoPdf(docData: MaterialControleDoc): void {
  const { doc, filename } = buildMaterialControleBalancoPdf(docData);
  doc.save(filename);
}
