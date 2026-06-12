/**
 * Marca d'água do brasão em todas as páginas desktop (`public/brasao2.png`).
 * z-[95]: sobre cards, cabeçalho e botão expandir (50–80); abaixo do telão (100), assinatura e modais.
 */
export function DesktopBrasaoWatermark() {
  return (
    <div
      className="desktop-brasao-watermark pointer-events-none fixed inset-0 z-[95] flex items-center justify-center overflow-hidden"
      aria-hidden
    >
      <img
        src={`${import.meta.env.BASE_URL}brasao2.png`}
        alt=""
        draggable={false}
        className="max-h-[min(75vh,42rem)] max-w-[min(75vw,42rem)] select-none object-contain opacity-[0.09]"
      />
    </div>
  );
}
