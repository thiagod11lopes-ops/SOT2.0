import type { DeparturesListPdfParams } from "./generateDeparturesPdf";
import { getDeparturesListPdfBlob } from "./generateDeparturesPdf";

/** Assunto fixo pedido para o e-mail de saídas (Gmail não permite definir anexo por URL). */
const GMAIL_SUBJECT = "Saídas";

/**
 * Descarrega o PDF e abre o Gmail (sessão do navegador) em nova aba: destinatário, assunto "Saídas" e texto.
 * O anexo não pode ser pré-preenchido — limitação do Gmail na Web; o utilizador anexa o ficheiro descarregado.
 */
export async function openGmailComposeWithDeparturesPdf(
  pdfParams: DeparturesListPdfParams,
  recipientEmail: string,
): Promise<void> {
  const { blob, filename } = await getDeparturesListPdfBlob(pdfParams);
  const dateLabel = pdfParams.filterDate.trim() || "sem data";

  const body =
    `Segue o relatório em PDF (${pdfParams.listTitle}, data de filtro: ${dateLabel}).\n\n` +
    `O ficheiro "${filename}" foi descarregado para a pasta Transferências. ` +
    `No Gmail, clique no ícone de anexo (clip) ou arraste o ficheiro para esta janela.\n`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);

  const gmailUrl = new URL("https://mail.google.com/mail/");
  gmailUrl.searchParams.set("view", "cm");
  gmailUrl.searchParams.set("fs", "1");
  gmailUrl.searchParams.set("to", recipientEmail.trim());
  gmailUrl.searchParams.set("su", GMAIL_SUBJECT);
  gmailUrl.searchParams.set("body", body);

  window.setTimeout(() => {
    const w = window.open(gmailUrl.toString(), "_blank", "noopener,noreferrer");
    if (!w) {
      window.alert(
        "Permita pop-ups para este site para abrir o Gmail, ou abra manualmente o Gmail e anexe o PDF descarregado.",
      );
    }
  }, 350);
}

/**
 * Descarrega vários PDFs (um por data) e abre o Gmail; o utilizador anexa todos os ficheiros descarregados.
 */
export async function openGmailComposeWithDeparturesPdfList(
  pdfParamsList: DeparturesListPdfParams[],
  recipientEmail: string,
): Promise<void> {
  if (pdfParamsList.length === 0) return;

  const filenames: string[] = [];
  for (let i = 0; i < pdfParamsList.length; i++) {
    const { blob, filename } = await getDeparturesListPdfBlob(pdfParamsList[i]);
    filenames.push(filename);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(url);
    if (i < pdfParamsList.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const listTitle = pdfParamsList[0]?.listTitle ?? "Saídas";
  const datesLabel = pdfParamsList
    .map((p) => p.filterDate.trim() || "sem data")
    .join(", ");

  const body =
    `Segue o relatório em PDF (${listTitle}). Datas: ${datesLabel}.\n\n` +
    `Foram descarregados os ficheiros:\n${filenames.map((n) => `- ${n}`).join("\n")}\n\n` +
    `No Gmail, anexe todos os PDFs descarregados (ícone de clipe ou arrastar para a janela).\n`;

  const gmailUrl = new URL("https://mail.google.com/mail/");
  gmailUrl.searchParams.set("view", "cm");
  gmailUrl.searchParams.set("fs", "1");
  gmailUrl.searchParams.set("to", recipientEmail.trim());
  gmailUrl.searchParams.set("su", GMAIL_SUBJECT);
  gmailUrl.searchParams.set("body", body);

  window.setTimeout(() => {
    const w = window.open(gmailUrl.toString(), "_blank", "noopener,noreferrer");
    if (!w) {
      window.alert(
        "Permita pop-ups para este site para abrir o Gmail, ou abra manualmente o Gmail e anexe os PDFs descarregados.",
      );
    }
  }, 350);
}
