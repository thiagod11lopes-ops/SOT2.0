/** Marca d'água do brasão em todas as páginas desktop (`public/brasao.png`). */
export function DesktopBrasaoWatermark() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1] flex items-center justify-center overflow-hidden"
      aria-hidden
    >
      <img
        src={`${import.meta.env.BASE_URL}brasao.png`}
        alt=""
        draggable={false}
        className="max-h-[min(75vh,42rem)] max-w-[min(75vw,42rem)] select-none object-contain opacity-[0.09]"
      />
    </div>
  );
}
