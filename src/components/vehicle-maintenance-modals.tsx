import { useVehicleMaintenance } from "../context/vehicle-maintenance-context";
import { getRegistroTrocaOleo } from "../lib/oilMaintenance";
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
      registroAtual={trocaOleoPlaca ? getRegistroTrocaOleo(mapa, trocaOleoPlaca) : undefined}
      onConfirm={(km, dataIso) => {
        if (!trocaOleoPlaca) return;
        bumpLocalOleoMutation();
        setMapa((prev) => {
          // Grava na chave já existente (casing) se houver; senão usa a do catálogo.
          const existingKey =
            Object.keys(prev).find((k) => k.trim().toLowerCase() === trocaOleoPlaca.trim().toLowerCase()) ??
            trocaOleoPlaca;
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (k !== existingKey && k.trim().toLowerCase() === existingKey.trim().toLowerCase()) {
              delete next[k];
            }
          }
          next[existingKey] = { ultimaTrocaKm: km, ultimaTrocaData: dataIso };
          return next;
        });
        setTrocaOleoPlaca(null);
      }}
      onClose={() => setTrocaOleoPlaca(null)}
    />
  );
}
