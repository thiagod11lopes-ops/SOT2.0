import { useState } from "react";
import { useVehicleMaintenance } from "../context/vehicle-maintenance-context";
import { isoDateToPtBr } from "../lib/dateFormat";
import { downloadVehicleMaintenancePdf } from "../lib/generateVehicleMaintenancePdf";
import { maiorKmChegadaPorViatura, statusTrocaOleo } from "../lib/oilMaintenance";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

export function VehicleMaintenancePanel() {
  const { mapa, departures, placas, setTrocaOleoPlaca } = useVehicleMaintenance();
  const [pdfBusy, setPdfBusy] = useState(false);

  if (placas.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Cadastre viaturas na aba <strong>Cadastrar Viatura</strong> para acompanhar a troca de óleo.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        O KM atual é o maior valor de <strong>KM chegada</strong> registrado nas abas Saídas Administrativas e
        Saídas de Ambulância. A troca de óleo é considerada devida a cada{" "}
        <strong>10.000 km</strong> ou a cada <strong>6 meses</strong>, o que ocorrer primeiro após a última
        troca registrada.
      </p>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="shrink-0"
          disabled={pdfBusy}
          onClick={() => {
            if (pdfBusy) return;
            setPdfBusy(true);
            void downloadVehicleMaintenancePdf({
              placas,
              departures,
              mapaTrocaOleo: mapa,
            })
              .catch(() => {
                window.alert("Não foi possível gerar o PDF. Tente novamente.");
              })
              .finally(() => setPdfBusy(false));
          }}
        >
          {pdfBusy ? "Gerando…" : "Gerar PDF"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Viatura</TableHead>
              <TableHead className="whitespace-nowrap">KM atual</TableHead>
              <TableHead>Última troca</TableHead>
              <TableHead className="whitespace-nowrap">PRÓXIMA TROCA</TableHead>
              <TableHead className="whitespace-nowrap">TROCA POR TEMPO</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[12rem] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {placas.map((placa) => {
              const kmAtual = maiorKmChegadaPorViatura(departures, placa);
              const reg = mapa[placa];
              const st = statusTrocaOleo(kmAtual, reg);
              let statusLabel = "—";
              let statusClass = "text-[hsl(var(--muted-foreground))]";
              if (!st.temRegistro) {
                statusLabel = "Sem registro de troca";
              } else if (st.atrasado) {
                statusLabel = st.porKm && st.porPrazo ? "Atrasado (km e prazo)" : st.porKm ? "Atrasado (km)" : "Atrasado (prazo)";
                // Atraso por prazo (6 meses): laranja; só por km: vermelho.
                statusClass = st.porPrazo
                  ? "font-medium text-orange-600 dark:text-orange-400"
                  : "font-medium text-red-600";
              } else {
                statusLabel = "Em dia";
                statusClass = "text-emerald-700";
              }

              const limiteKm =
                st.kmLimite !== null ? `${st.kmLimite.toLocaleString("pt-BR")} km` : "—";
              const limiteData =
                st.dataLimiteOleoIso !== null ? isoDateToPtBr(st.dataLimiteOleoIso) : "—";

              const ultima =
                reg && st.temRegistro
                  ? `${reg.ultimaTrocaKm.toLocaleString("pt-BR")} km · ${isoDateToPtBr(reg.ultimaTrocaData)}`
                  : "—";

              return (
                <TableRow key={placa}>
                  <TableCell className="font-medium">{placa}</TableCell>
                  <TableCell className="tabular-nums">
                    {kmAtual !== null ? `${kmAtual.toLocaleString("pt-BR")} km` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{ultima}</TableCell>
                  <TableCell className="text-sm tabular-nums">{limiteKm}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{limiteData}</TableCell>
                  <TableCell className={`text-sm ${statusClass}`}>{statusLabel}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setTrocaOleoPlaca(placa)}>
                        Troca de Óleo
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
