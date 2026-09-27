/** Endereço próprio do estoque (`material.html` → `#/controle-material`). */
export function isMaterialControleAddress(): boolean {
  return typeof window !== "undefined" && /^#\/controle-material(\/|$)/.test(window.location.hash);
}
