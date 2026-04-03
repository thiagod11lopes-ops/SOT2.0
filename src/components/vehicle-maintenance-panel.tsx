import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import { isoDateToPtBr } from "../lib/dateFormat";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import type { RegistroOficina } from "../lib/oficinaVisits";
import {
  maiorKmChegadaPorViatura,
  OIL_MAINTENANCE_STORAGE_KEY,
  statusTrocaOleo,
  viaturasCatalogoUnicas,
  type TrocaOleoRegistro,
} from "../lib/oilMaintenance";
import { OficinaModal } from "./oficina-modal";
import { TrocaOleoModal } from "./troca-oleo-modal";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

type MapaOleo = Record<string, TrocaOleoRegistro>;

export function VehicleMaintenancePanel() {
  const { items } = useCatalogItems();
  const { departures } = useDepartures();
  const { mapaOficina, setVisitasParaPlaca } = useOficinaVisitas();
  const [mapa, setMapa] = useState<MapaOleo>({});
  const [oficinaPlacaAberta, setOficinaPlacaAberta] = useState<string | null>(null);
  const [trocaOleoPlaca, setTrocaOleoPlaca] = useState<string | null>(null);
  const hidratado = useRef(false);

  useEffect(() => {
    let cancel = false;
    void idbGetJson<MapaOleo>(OIL_MAINTENANCE_STORAGE_KEY).then((raw) => {
      if (cancel) return;
      setMapa(raw && typeof raw === "object" ? raw : {});
      hidratado.current = true;
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!hidratado.current) return;
    void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, mapa);
  }, [mapa]);

  const atualizarVisitasOficina = useCallback(
    (placa: string, visitas: RegistroOficina[]) => {
      setVisitasParaPlaca(placa, visitas);
    },
    [setVisitasParaPlaca],
  );

  const placas = useMemo(
    () => viaturasCatalogoUnicas(items.viaturasAdministrativas, items.ambulancias),
    [items.viaturasAdministrativas, items.ambulancias],
  );

  const kmSugeridoTrocaOleo =
    trocaOleoPlaca !== null ? maiorKmChegadaPorViatura(departures, trocaOleoPlaca) : null;

  if (placas.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Cadastre viaturas na aba <strong>Cadastrar Viatura</strong> para acompanhar a troca de óleo.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        O KM atual é o maior valor de <strong>KM chegada</strong> registrado nas abas Saídas Administrativas e
        Saídas de Ambulância. A troca de óleo é considerada devida a cada{" "}
        <strong>10.000 km</strong> ou a cada <strong>6 meses</strong>, o que ocorrer primeiro após a última
        troca registrada.
      </p>
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
                statusClass = "font-medium text-red-600";
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
                      <Button type="button" size="sm" variant="default" onClick={() => setOficinaPlacaAberta(placa)}>
                        Oficina
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

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
        onConfirm={(km, dataIso) => {
          if (!trocaOleoPlaca) return;
          setMapa((prev) => ({
            ...prev,
            [trocaOleoPlaca]: { ultimaTrocaKm: km, ultimaTrocaData: dataIso },
          }));
          setTrocaOleoPlaca(null);
        }}
        onClose={() => setTrocaOleoPlaca(null)}
      />
    </div>
  );
}
