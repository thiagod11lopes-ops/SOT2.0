/** Compara rótulos de aba de forma tolerante a NFC/NFD (ex.: ç vs c+combining). */
function foldTabLabel(s: string) {
  return s
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Mesma aba (ex.: Configurações com codificações diferentes). */
export function tabsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return foldTabLabel(a) === foldTabLabel(b);
}

export function isSettingsTab(tab: string | null | undefined): boolean {
  if (!tab) return false;
  return foldTabLabel(tab) === "configuracoes";
}
