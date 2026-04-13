import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";

export type VistoriaSituacaoImprimirPdfRow = {
  inspectionDate: string;
  viatura: string;
  motorista: string;
  itemLabel: string;
  observacao: string;
};

/**
 * PDF com as linhas da Situação das VTR em que a coluna Imprimir está marcada.
 */
export function buildVistoriaSituacaoImprimirPdf(rows: VistoriaSituacaoImprimirPdfRow[]): {
  doc: jsPDF;
  filename: string;
} {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 10;
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Situação das VTR — itens com Imprimir marcado", margin, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  const generated = new Date().toLocaleString("pt-BR");
  doc.text(`Gerado em: ${generated}`, margin, margin + 6);
  doc.setTextColor(0, 0, 0);

  const head = [
    ["Data da Vistoria", "Viatura", "Motorista", "Item com Anotação", "Anotação"],
  ];

  const body = rows.map((r) => [
    r.inspectionDate,
    r.viatura,
    r.motorista,
    r.itemLabel,
    r.observacao.trim() ? r.observacao : "—",
  ]);

  autoTable(doc, {
    startY: margin + 10,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [30, 64, 90], textColor: 255, fontStyle: "bold" },
    margin: { left: margin, right: margin },
    tableWidth: pageW - 2 * margin,
    columnStyles: {
      4: { cellWidth: 62 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `Situacao_VTR_Imprimir_${stamp}.pdf`;
  return { doc, filename };
}
