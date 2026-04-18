import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * html2canvas (1.4.x) não interpreta `oklch()` (Tailwind v4 / tema). No clone usado
 * para rasterizar, forçamos cores em rgb/hex para evitar o erro de parse.
 */
function injectRdvPdfSafeColors(clonedDoc: Document): void {
  const style = clonedDoc.createElement("style");
  style.setAttribute("data-rdv-pdf-fix", "1");
  style.textContent = `
    #rdv-conteudo-pdf, #rdv-conteudo-pdf * {
      box-shadow: none !important;
      outline-color: #0f172a !important;
    }
    #rdv-conteudo-pdf {
      background-color: #ffffff !important;
      color: #0f172a !important;
    }
    #rdv-conteudo-pdf table {
      border-color: #0f172a !important;
    }
    #rdv-conteudo-pdf thead {
      background-color: transparent !important;
      border-color: #0f172a !important;
    }
    #rdv-conteudo-pdf thead th {
      background-color: rgba(226, 240, 217, 0.9) !important;
      border-color: #0f172a !important;
      color: #334155 !important;
    }
    #rdv-conteudo-pdf tbody tr:nth-child(odd) td {
      background-color: #ffffff !important;
    }
    #rdv-conteudo-pdf tbody tr:nth-child(even) td {
      background-color: #f1f5f9 !important;
    }
    #rdv-conteudo-pdf .rdv-section-bar {
      background-color: #e2f0d9 !important;
      border-color: #0f172a !important;
      color: #0f172a !important;
    }
    #rdv-conteudo-pdf .rdv-summary-merged {
      background-color: #f1f5f9 !important;
    }
    #rdv-conteudo-pdf input, #rdv-conteudo-pdf select, #rdv-conteudo-pdf textarea {
      color: #0f172a !important;
      background-color: transparent !important;
      border-color: #0f172a !important;
    }
    #rdv-conteudo-pdf [data-rdv-sit="Operando"],
    #rdv-conteudo-pdf [data-rdv-sit="Operando"] select {
      color: #15803d !important;
    }
    #rdv-conteudo-pdf [data-rdv-sit="Inoperante"],
    #rdv-conteudo-pdf [data-rdv-sit="Inoperante"] select {
      color: #dc2626 !important;
    }
    #rdv-conteudo-pdf [data-rdv-sit="Destacada"],
    #rdv-conteudo-pdf [data-rdv-sit="Destacada"] select {
      color: #ea580c !important;
    }
  `;
  clonedDoc.head.appendChild(style);
}

/**
 * Captura o bloco do RDV como imagem e gera PDF (A4, várias páginas se necessário).
 * Remove temporariamente `colspan` nas células de observação administrativa — mesmo
 * workaround do HTML legado para o html2canvas.
 */
export async function downloadRelatorioDiarioViaturasPdf(
  element: HTMLElement,
  filenameDate: string,
): Promise<void> {
  const obsAdm = element.querySelectorAll<HTMLTableCellElement>(
    "#rdv-tabela-administrativas tbody td[colspan=\"2\"]",
  );
  const saved: { el: HTMLTableCellElement; colspan: string | null }[] = [];
  obsAdm.forEach((td) => {
    saved.push({ el: td, colspan: td.getAttribute("colspan") });
    td.removeAttribute("colspan");
  });

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: "#ffffff",
      foreignObjectRendering: false,
      ignoreElements: (node) =>
        node instanceof HTMLElement && node.classList.contains("rdv-no-pdf"),
      onclone: (clonedDoc) => {
        injectRdvPdfSafeColors(clonedDoc);
      },
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    const safe = filenameDate.trim() || "SemData";
    pdf.save(`Relatorio_Viaturas_${safe}.pdf`);
  } finally {
    saved.forEach(({ el, colspan }) => {
      if (colspan) el.setAttribute("colspan", colspan);
    });
  }
}
