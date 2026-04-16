import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { isoDateToPtBr } from "./dateFormat";
import { maiorKmChegadaPorViatura, statusTrocaOleo, type TrocaOleoRegistro } from "./oilMaintenance";
import { viaturaEstaNaOficina, type MapaOficinaPorViatura } from "./oficinaVisits";
import type { DepartureRecord } from "../types/departure";

function safeFileSegment(value: string): string {
  return (
    value.replace(/[^\d\-a-zA-ZÀ-ÿ]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") ||
    "documento"
  );
}

export type VehicleMaintenancePdfRow = {
  viatura: string;
  kmAtual: string;
  ultimaTroca: string;
  proximaTrocaKm: string;
  trocaPorTempo: string;
  status: string;
  inop: string;
  oficina: string;
};

export type VehicleMaintenancePdfParams = {
  placas: string[];
  departures: DepartureRecord[];
  mapaTrocaOleo: Record<string, TrocaOleoRegistro | undefined>;
  mapaOficina: MapaOficinaPorViatura;
  isInoperante: (placa: string) => boolean;
};

export function buildVehicleMaintenancePdfRows(params: VehicleMaintenancePdfParams): VehicleMaintenancePdfRow[] {
  return params.placas.map((placa) => {
    const kmAtualNum = maiorKmChegadaPorViatura(params.departures, placa);
    const reg = params.mapaTrocaOleo[placa];
    const st = statusTrocaOleo(kmAtualNum, reg);

    let statusLabel = "—";
    if (!st.temRegistro) {
      statusLabel = "Sem registro de troca";
    } else if (st.atrasado) {
      statusLabel =
        st.porKm && st.porPrazo
          ? "Atrasado (km e prazo)"
          : st.porKm
            ? "Atrasado (km)"
            : "Atrasado (prazo)";
    } else {
      statusLabel = "Em dia";
    }

    const limiteKm = st.kmLimite !== null ? `${st.kmLimite.toLocaleString("pt-BR")} km` : "—";
    const limiteData = st.dataLimiteOleoIso !== null ? isoDateToPtBr(st.dataLimiteOleoIso) : "—";
    const ultima =
      reg && st.temRegistro
        ? `${reg.ultimaTrocaKm.toLocaleString("pt-BR")} km · ${isoDateToPtBr(reg.ultimaTrocaData)}`
        : "—";

    const visitasOficina = params.mapaOficina[placa] ?? [];
    const oficinaComSaidaEmBranco = viaturaEstaNaOficina(visitasOficina);

    return {
      viatura: placa,
      kmAtual: kmAtualNum !== null ? `${kmAtualNum.toLocaleString("pt-BR")} km` : "—",
      ultimaTroca: ultima,
      proximaTrocaKm: limiteKm,
      trocaPorTempo: limiteData,
      status: statusLabel,
      inop: params.isInoperante(placa) ? "SIM" : "—",
      oficina: oficinaComSaidaEmBranco ? "SIM" : "—",
    };
  });
}

export async function buildVehicleMaintenancePdf(
  params: VehicleMaintenancePdfParams,
): Promise<{ doc: jsPDF; filename: string }> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const centerX = pageW / 2;

  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Manutenções — Troca de óleo", centerX, y, { align: "center" });
  y += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(70, 70, 70);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, centerX, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 8;

  const rows = buildVehicleMaintenancePdfRows(params);

  const head = [
    ["Viatura", "KM atual", "Última troca", "Próxima troca (km)", "Troca por tempo", "Status", "INOP", "Oficina"],
  ];
  const body = rows.map((r) => [
    r.viatura,
    r.kmAtual,
    r.ultimaTroca,
    r.proximaTrocaKm,
    r.trocaPorTempo,
    r.status,
    r.inop,
    r.oficina,
  ]);

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.35, bottom: 1.35, left: 1.4, right: 1.4 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: [170, 170, 170],
      lineWidth: 0.12,
      textColor: [20, 20, 20],
    },
    headStyles: {
      fillColor: [230, 230, 235],
      textColor: [20, 20, 20],
      fontStyle: "bold",
      valign: "middle",
    },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    margin: { left: margin, right: margin },
    tableWidth: pageW - 2 * margin,
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 26 },
      2: { cellWidth: 44 },
      3: { cellWidth: 34 },
      4: { cellWidth: 30 },
      5: { cellWidth: 44 },
      6: { cellWidth: 16, halign: "center" },
      7: { cellWidth: 18, halign: "center" },
    },
  });

  const filename = `manutencoes-${safeFileSegment(new Date().toLocaleDateString("pt-BR"))}.pdf`;
  return { doc, filename };
}

export async function downloadVehicleMaintenancePdf(params: VehicleMaintenancePdfParams): Promise<void> {
  const { doc, filename } = await buildVehicleMaintenancePdf(params);
  doc.save(filename);
}

