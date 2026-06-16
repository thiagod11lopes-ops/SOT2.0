/** Legenda amarelo-laranja: peso normal e sombra leve para não “borrar” em tamanho reduzido. */
const movieSubtitleClass =
  "font-normal leading-snug text-[#FFE566] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.92),0_0_1px_rgba(0,0,0,0.75)]";

/**
 * Crédito fixo no desktop — canto inferior direito, sobre o telão de avisos (z-index acima).
 */
export function DeveloperCreditBadge() {
  return (
    <p
      className={`pointer-events-none fixed bottom-3 right-4 z-[120] max-w-[min(calc(100vw-2rem),20rem)] origin-bottom-right scale-50 select-none text-right text-xs sm:text-sm ${movieSubtitleClass}`}
    >
      Desenvolvido por: 1SG EF Thiago Lopes
    </p>
  );
}
