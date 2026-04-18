import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

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
      ignoreElements: (node) =>
        node instanceof HTMLElement && node.classList.contains("rdv-no-pdf"),
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
