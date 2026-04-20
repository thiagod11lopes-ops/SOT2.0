import { useVehicleMaintenance } from "../context/vehicle-maintenance-context";
import { TrocaOleoModal } from "./troca-oleo-modal";

/** Uma única instância no app (evita duplicar com dois `<VehicleMaintenancePanel />`). */
export function VehicleMaintenanceModals() {
  const {
    mapa,
    setMapa,
    trocaOleoPlaca,
    setTrocaOleoPlaca,
    kmSugeridoTrocaOleo,
    bumpLocalOleoMutation,
  } = useVehicleMaintenance();

  return (
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
  );
}
