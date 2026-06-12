/** Estilo legenda de filme: amarelo-laranja com contorno escuro para leitura sobre qualquer fundo. */
const movieSubtitleClass =
  "font-bold leading-tight text-[#FFE066] [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000,0_2px_6px_rgba(0,0,0,0.85)]";

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
