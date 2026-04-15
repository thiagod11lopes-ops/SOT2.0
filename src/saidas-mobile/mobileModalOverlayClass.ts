/**
 * Overlay em tela cheia para modais mobile: ancorado no topo, acima de todo o conteúdo
 * (inclui respeito à safe area em dispositivos com notch).
 */
/** Sem `z-index` aqui — cada modal deve acrescentar `z-[…]` para ficar acima do resto e evitar conflito com outro `z-[500]`. */
export const MOBILE_MODAL_OVERLAY_CLASS =
  "pointer-events-auto fixed inset-0 flex items-start justify-center bg-black/55 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))]";
