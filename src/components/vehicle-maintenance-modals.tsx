import { useVehicleMaintenance } from "../context/vehicle-maintenance-context";
import { OficinaModal } from "./oficina-modal";
import { TrocaOleoModal } from "./troca-oleo-modal";

/** Uma única instância no app (evita duplicar com dois `<VehicleMaintenancePanel />`). */
export function VehicleMaintenanceModals() {
  const {
    mapa,
    setMapa,
    oficinaPlacaAberta,
    setOficinaPlacaAberta,
    trocaOleoPlaca,
    setTrocaOleoPlaca,
    kmSugeridoTrocaOleo,
    mapaOficina,
    atualizarVisitasOficina,
    bumpLocalOleoMutation,
  } = useVehicleMaintenance();

  return (
    <>
      <OficinaModal
        placa={oficinaPlacaAberta}
        visitas={oficinaPlacaAberta ? mapaOficina[oficinaPlacaAberta] ?? [] : []}
        onChange={(next) => {
          if (oficinaPlacaAberta) atualizarVisitasOficina(oficinaPlacaAberta, next);
        }}
        onClose={() => setOficinaPlacaAberta(null)}
      />

      <TrocaOleoModal
        placa={trocaOleoPlaca}
        kmSugerido={kmSugeridoTrocaOleo}
        registroAtual={trocaOleoPlaca ? mapa[trocaOleoPlaca] : undefined}
        onConfirm={(km, dataIso) => {
          if (!trocaOleoPlaca) return;
          bumpLocalOleoMutation();
          setMapa((prev) => ({
            ...prev,
            [trocaOleoPlaca]: { ultimaTrocaKm: km, ultimaTrocaData: dataIso },
          }));
          setTrocaOleoPlaca(null);
        }}
        onClose={() => setTrocaOleoPlaca(null)}
      />
    </>
  );
}
