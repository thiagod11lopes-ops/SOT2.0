import { useVehicleMaintenance } from "../context/vehicle-maintenance-context";
import { getRegistroTrocaOleo } from "../lib/oilMaintenance";
import { TrocaOleoModal } from "./troca-oleo-modal";

/** Uma única instância no app (evita duplicar com dois `<VehicleMaintenancePanel />`). */
export function VehicleMaintenanceModals() {
  const {
    mapa,
    trocaOleoPlaca,
    setTrocaOleoPlaca,
    kmSugeridoTrocaOleo,
    saveRegistroTrocaOleo,
  } = useVehicleMaintenance();

  return (
    <TrocaOleoModal
      placa={trocaOleoPlaca}
      kmSugerido={kmSugeridoTrocaOleo}
      registroAtual={trocaOleoPlaca ? getRegistroTrocaOleo(mapa, trocaOleoPlaca) : undefined}
      onConfirm={(km, dataIso) => {
        if (!trocaOleoPlaca) return;
        saveRegistroTrocaOleo(trocaOleoPlaca, km, dataIso);
        setTrocaOleoPlaca(null);
      }}
      onClose={() => setTrocaOleoPlaca(null)}
    />
  );
}
