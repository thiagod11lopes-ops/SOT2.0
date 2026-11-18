import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import type { DriverActivePin } from "../hooks/useDriverActiveLocations";
import { getCurrentDatePtBr } from "../lib/dateFormat";
import { departureMatchesHomeEmAndamentoCard } from "../lib/homeSaidasEmAndamento";
import { normalizePlacaKeyDriverMap } from "../lib/departureDriverMapFilter";
import { solicitarLocalizacao } from "../lib/solicitacaoLocalizacao";
import { primaryPlacaFromViaturasField } from "../lib/viaturaPlaca";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

function saidaDaViatura(departures: readonly DepartureRecord[], placa: string): DepartureRecord | null {
  const hoje = getCurrentDatePtBr();
  const key = normalizePlacaKeyDriverMap(placa);
  return (
    departures.find(
      (row) =>
        departureMatchesHomeEmAndamentoCard(row, hoje) &&
        normalizePlacaKeyDriverMap(primaryPlacaFromViaturasField(row.viaturas)) === key,
    ) ?? null
  );
}

function destinoDaSaida(row: DepartureRecord): string {
  const hospital = row.hospitalDestino.trim();
  const objetivo = row.objetivoSaida.trim();
  const lugar = [row.bairro, row.cidade].map((part) => part.trim()).filter(Boolean).join(" — ");
  return hospital || objetivo || lugar || "—";
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))]/70 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="text-right text-sm font-semibold text-[hsl(var(--foreground))]">{value || "—"}</span>
    </div>
  );
}

export function DriverMapVehicleModal({ pin, onClose }: { pin: DriverActivePin; onClose: () => void }) {
  const { departures } = useDepartures();
  const saida = useMemo(() => saidaDaViatura(departures, pin.placa), [departures, pin.placa]);
  const motorista = saida?.motoristas.trim() ?? "";
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  async function solicitar() {
    if (!saida || !motorista || busy) return;
    setBusy(true);
    setAviso("");
    setErro("");
    try {
      await solicitarLocalizacao({
        placa: pin.placa,
        departureId: saida.id,
        motorista,
      });
      setAviso(`Chamada enviada para ${motorista}. Se o celular estiver bloqueado, o aviso aparece na tela de bloqueio.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível solicitar a localização.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="sot-viatura-mapa-titulo">
      <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h3 id="sot-viatura-mapa-titulo" className="text-lg font-semibold text-[hsl(var(--foreground))]">
            {pin.placa}
          </h3>
          <button type="button" className="rounded-lg p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Fechar" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3">
          <Linha label="Viatura" value={pin.placa} />
          <Linha label="Motorista" value={motorista || "—"} />
          <Linha label="Tipo" value={saida?.tipo ?? "—"} />
          <Linha label="Saída" value={saida ? `${saida.dataSaida} ${saida.horaSaida}`.trim() : "—"} />
          <Linha label="Destino" value={saida ? destinoDaSaida(saida) : "—"} />
          <Linha label="Setor" value={saida?.setor.trim() || "—"} />
          <Linha label="KM saída" value={saida?.kmSaida.trim() || "—"} />
          <Linha
            label="Última posição"
            value={pin.lastUpdateAtMs !== null ? formatDateTime(pin.lastUpdateAtMs) : "Hora desconhecida"}
          />
        </div>

        {aviso ? <p className="mt-3 text-sm text-green-700">{aviso}</p> : null}
        {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}

        <Button type="button" className="mt-4 w-full" disabled={!saida || !motorista || busy} onClick={() => void solicitar()}>
          {busy ? "A solicitar..." : "Solicitar Localização"}
        </Button>
      </div>
    </div>
  );
}
