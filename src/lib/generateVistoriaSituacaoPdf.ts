import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { isRubricaImageDataUrl } from "./rubricaDrawing";

export type VistoriaSituacaoImprimirPdfRow = {
  inspectionDate: string;
  inspectionDateSecondary?: string;
  viatura: string;
  itemLabel: string;
  observacaoPlain: string;
  observacaoItalic?: string;
  /** PNG data URL ou texto — rubrica da vistoria comum (quando existir). */
  rubricaComum?: string;
  /** PNG data URL ou texto — rubrica da vistoria administrativa (quando existir). */
  rubricaAdministrativa?: string;
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

  const head = [["Data da Vistoria", "Viatura", "Item com Anotação", "Anotação", "Rubricas"]];

  const body = rows.map((r) => [
    r.inspectionDateSecondary?.trim() ? `${r.inspectionDate}\n(${r.inspectionDateSecondary})` : r.inspectionDate,
    r.viatura,
    r.itemLabel,
    `${r.observacaoPlain ?? ""}${r.observacaoItalic ?? ""}`.trim() || "—",
    " ",
  ]);

  autoTable(doc, {
    startY: margin + 10,
    head,
    body,
    styles: {
      fontSize: 7,
      cellPadding: 1.6,
      overflow: "linebreak",
      valign: "top",
      minCellHeight: 8.4,
      lineColor: [170, 170, 170],
      lineWidth: 0.1,
      textColor: [20, 20, 20],
    },
    headStyles: {
      fillColor: [35, 35, 35],
      textColor: 255,
      fontStyle: "bold",
      lineColor: [80, 80, 80],
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    margin: { left: margin, right: margin },
    tableWidth: pageW - 2 * margin,
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 32 },
      2: { cellWidth: 46 },
      3: { cellWidth: 94 },
      4: { cellWidth: 73 },
    },
    didParseCell: (data) => {
      if (data.section === "head") {
        data.cell.styles.halign = "left";
        data.cell.styles.valign = "middle";
      }
      if (data.section === "body") {
        data.cell.styles.halign = "left";
        data.cell.styles.valign = "top";
        if (data.column.index === 4) {
          const r = rows[data.row.index];
          if (r) {
            const c = String(r.rubricaComum ?? "").trim();
            const a = String(r.rubricaAdministrativa ?? "").trim();
            if (isRubricaImageDataUrl(c) || isRubricaImageDataUrl(a)) {
              data.cell.styles.minCellHeight = 28;
            }
          }
        }
      }
    },
    willDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 0 || data.column.index === 3 || data.column.index === 4) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const row = rows[data.row.index];
      if (!row) return;
      const left = data.cell.x + 1.6;
      const top = data.cell.y + 3.4;
      const maxWidth = Math.max(5, data.cell.width - 3.2);
      const lineGap = 2.75;

      if (data.column.index === 0) {
        doc.setFont("helvetica", "normal");
        const primary = doc.splitTextToSize(row.inspectionDate || "—", maxWidth) as string[];
        doc.text(primary, left, top, { maxWidth });
        const primaryHeight = Math.max(1, primary.length) * lineGap;
        if (row.inspectionDateSecondary?.trim()) {
          doc.setFont("helvetica", "bolditalic");
          const secondary = doc.splitTextToSize(`(${row.inspectionDateSecondary})`, maxWidth) as string[];
          doc.text(secondary, left, top + primaryHeight, { maxWidth });
        }
        return;
      }

      if (data.column.index === 3) {
        let y = top;
        const plain = (row.observacaoPlain ?? "").trim();
        const italic = (row.observacaoItalic ?? "").trim();
        if (!plain && !italic) {
          doc.setFont("helvetica", "normal");
          doc.text("—", left, y, { maxWidth });
          return;
        }
        if (plain) {
          doc.setFont("helvetica", "normal");
          const plainLines = doc.splitTextToSize(plain, maxWidth) as string[];
          for (const line of plainLines) {
            doc.text(line, left, y, { maxWidth });
            y += lineGap;
          }
        }
        if (italic) {
          doc.setFont("helvetica", "bolditalic");
          const italicLines = doc.splitTextToSize(italic, maxWidth) as string[];
          for (const line of italicLines) {
            doc.text(line, left, y, { maxWidth });
            y += lineGap;
          }
        }
        return;
      }

      if (data.column.index === 4) {
        const gapMm = 2;
        const halfW = Math.max(10, (maxWidth - gapMm) / 2);
        const leftX = left;
        const rightX = left + halfW + gapMm;

        const drawBlock = (
          raw: string,
          startX: number,
          startY: number,
          blockMaxW: number,
        ): number => {
          let yy = startY;
          const content = String(raw ?? "").trim();
          if (!content) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.text("—", startX, yy);
            return yy + lineGap;
          }
          if (isRubricaImageDataUrl(content)) {
            const imgMaxW = Math.min(blockMaxW - 0.5, 34);
            const imgH = Math.min(14, Math.max(9, imgMaxW * 0.52));
            try {
              doc.addImage(content, "PNG", startX, yy, imgMaxW, imgH);
            } catch {
              doc.setFont("helvetica", "italic");
              doc.setFontSize(6);
              doc.text("(imagem)", startX, yy);
            }
            return yy + imgH + 1.2;
          }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          const lines = doc.splitTextToSize(content, blockMaxW) as string[];
          for (const line of lines) {
            doc.text(line, startX, yy, { maxWidth: blockMaxW });
            yy += lineGap;
          }
          return yy;
        };

        const yLabel = top;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.text("Comum", leftX, yLabel);
        doc.text("Administrativa", rightX, yLabel);
        const yContent = yLabel + 3.2;
        drawBlock(row.rubricaComum ?? "", leftX, yContent, halfW);
        drawBlock(row.rubricaAdministrativa ?? "", rightX, yContent, halfW);
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `Situacao_VTR_Imprimir_${stamp}.pdf`;
  return { doc, filename };
}
