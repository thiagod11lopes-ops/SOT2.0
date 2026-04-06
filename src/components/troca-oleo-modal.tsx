import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { getCurrentDatePtBr, isoDateToPtBr, normalizeDatePtBr, ptBrToIsoDate } from "../lib/dateFormat";
import {
  adicionarMesesIso,
  OLEO_KM_INTERVALO,
  OLEO_MESES_INTERVALO,
  parseKmCampo,
  subtrairMesesIso,
  type TrocaOleoRegistro,
} from "../lib/oilMaintenance";
import { Button } from "./ui/button";

/** Só dígitos; formata com ponto a cada mil (ex.: 45230 → 45.230). */
function formatKmComSeparadorMilhar(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return "";
  try {
    const n = BigInt(digitos);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  } catch {
    return "";
  }
}

type TrocaOleoModalProps = {
  placa: string | null;
  /** KM sugerido (ex.: maior KM chegada nas saídas), pode ser null. */
  kmSugerido: number | null;
  /** Registo atual desta placa no mapa (se existir). */
  registroAtual: TrocaOleoRegistro | undefined;
  onConfirm: (km: number, dataIso: string) => void;
  onClose: () => void;
};

export function TrocaOleoModal({
  placa,
  kmSugerido,
  registroAtual,
  onConfirm,
  onClose,
}: TrocaOleoModalProps) {
  const open = placa !== null;
  const [ultimaKmTexto, setUltimaKmTexto] = useState("");
  const [ultimaDataPtBr, setUltimaDataPtBr] = useState("");
  const [proximaKmTexto, setProximaKmTexto] = useState("");
  const [tempoLimitePtBr, setTempoLimitePtBr] = useState("");

  const recalcFromUltimaKmEData = useCallback((kmStr: string, dataStr: string) => {
    const km = parseKmCampo(kmStr);
    const iso = ptBrToIsoDate(dataStr.trim());
    if (km === null || km < 0 || !iso) {
      setProximaKmTexto("");
      setTempoLimitePtBr("");
      return;
    }
    setProximaKmTexto(formatKmComSeparadorMilhar(String(km + OLEO_KM_INTERVALO)));
    setTempoLimitePtBr(isoDateToPtBr(adicionarMesesIso(iso, OLEO_MESES_INTERVALO)));
  }, []);

  useEffect(() => {
    if (!open || !placa) return;

    if (registroAtual) {
      const uk = registroAtual.ultimaTrocaKm;
      const di = registroAtual.ultimaTrocaData;
      const ultimaKmF = formatKmComSeparadorMilhar(String(uk));
      const ultimaD = isoDateToPtBr(di);
      setUltimaKmTexto(ultimaKmF);
      setUltimaDataPtBr(ultimaD);
      setProximaKmTexto(formatKmComSeparadorMilhar(String(uk + OLEO_KM_INTERVALO)));
      setTempoLimitePtBr(isoDateToPtBr(adicionarMesesIso(di, OLEO_MESES_INTERVALO)));
      return;
    }

    const dataIni = getCurrentDatePtBr();
    const dataIso = ptBrToIsoDate(dataIni);
    setUltimaDataPtBr(dataIni);
    if (kmSugerido !== null && kmSugerido !== undefined) {
      const uk = kmSugerido;
      setUltimaKmTexto(formatKmComSeparadorMilhar(String(uk)));
      if (dataIso) {
        setProximaKmTexto(formatKmComSeparadorMilhar(String(uk + OLEO_KM_INTERVALO)));
        setTempoLimitePtBr(isoDateToPtBr(adicionarMesesIso(dataIso, OLEO_MESES_INTERVALO)));
      } else {
        setProximaKmTexto("");
        setTempoLimitePtBr("");
      }
    } else {
      setUltimaKmTexto("");
      setProximaKmTexto("");
      if (dataIso) {
        setTempoLimitePtBr(isoDateToPtBr(adicionarMesesIso(dataIso, OLEO_MESES_INTERVALO)));
      } else {
        setTempoLimitePtBr("");
      }
    }
  }, [open, placa, registroAtual, kmSugerido]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !placa) return null;

  const onChangeUltimaKm = (raw: string) => {
    const f = formatKmComSeparadorMilhar(raw);
    setUltimaKmTexto(f);
    recalcFromUltimaKmEData(f, ultimaDataPtBr);
  };

  const onChangeUltimaData = (raw: string) => {
    const n = normalizeDatePtBr(raw);
    setUltimaDataPtBr(n);
    recalcFromUltimaKmEData(ultimaKmTexto, n);
  };

  const onChangeProximaKm = (raw: string) => {
    const f = formatKmComSeparadorMilhar(raw);
    setProximaKmTexto(f);
    const proxima = parseKmCampo(f);
    if (proxima === null || proxima < OLEO_KM_INTERVALO) return;
    const ultima = proxima - OLEO_KM_INTERVALO;
    setUltimaKmTexto(formatKmComSeparadorMilhar(String(ultima)));
    const iso = ptBrToIsoDate(ultimaDataPtBr.trim());
    if (iso) {
      setTempoLimitePtBr(isoDateToPtBr(adicionarMesesIso(iso, OLEO_MESES_INTERVALO)));
    }
  };

  const onChangeTempoLimite = (raw: string) => {
    const n = normalizeDatePtBr(raw);
    setTempoLimitePtBr(n);
    const tempoIso = ptBrToIsoDate(n.trim());
    if (!tempoIso) return;
    const ultimaIso = subtrairMesesIso(tempoIso, OLEO_MESES_INTERVALO);
    setUltimaDataPtBr(isoDateToPtBr(ultimaIso));
    const km = parseKmCampo(ultimaKmTexto);
    if (km !== null && km >= 0) {
      setProximaKmTexto(formatKmComSeparadorMilhar(String(km + OLEO_KM_INTERVALO)));
    }
  };

  function handleConfirmar() {
    const km = parseKmCampo(ultimaKmTexto);
    if (km === null || km < 0) {
      window.alert("Informe uma quilometragem válida na última troca (número inteiro).");
      return;
    }
    const dataIso = ptBrToIsoDate(ultimaDataPtBr.trim());
    if (!dataIso) {
      window.alert("Informe a data completa da última troca (dd/mm/aaaa).");
      return;
    }
    onConfirm(km, dataIso);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="troca-oleo-modal-title"
        className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="troca-oleo-modal-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Troca de óleo — {placa}
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Ajuste a <strong>última troca</strong> (km e data) ou edite <strong>próxima troca</strong> /{" "}
          <strong>troca por tempo</strong> — os campos são recalculados entre si (regra: +10.000 km e +6 meses após a
          última troca).
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Última troca
            </p>
            <div className="mt-2 space-y-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="troca-oleo-km-ultima">
                  Quilometragem (odômetro)
                </label>
                <input
                  id="troca-oleo-km-ultima"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={ultimaKmTexto}
                  onChange={(e) => onChangeUltimaKm(e.target.value)}
                  placeholder="Ex.: 45.230"
                  className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm tabular-nums text-[hsl(var(--foreground))]"
                />
                {kmSugerido !== null ? (
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Sugestão pelo maior KM chegada nas saídas: {kmSugerido.toLocaleString("pt-BR")} km.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="troca-oleo-data-ultima">
                  Data da última troca
                </label>
                <input
                  id="troca-oleo-data-ultima"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="dd/mm/aaaa"
                  value={ultimaDataPtBr}
                  onChange={(e) => onChangeUltimaData(e.target.value)}
                  className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm tabular-nums text-[hsl(var(--foreground))]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="troca-oleo-km-proxima">
              Próxima troca (km)
            </label>
            <input
              id="troca-oleo-km-proxima"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={proximaKmTexto}
              onChange={(e) => onChangeProximaKm(e.target.value)}
              placeholder="Última + 10.000 km"
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm tabular-nums text-[hsl(var(--foreground))]"
            />
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Equivalente a última troca + 10.000 km.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="troca-oleo-tempo">
              Troca por tempo (data limite)
            </label>
            <input
              id="troca-oleo-tempo"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={tempoLimitePtBr}
              onChange={(e) => onChangeTempoLimite(e.target.value)}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm tabular-nums text-[hsl(var(--foreground))]"
            />
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Equivalente a data da última troca + 6 meses.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirmar}>
            Salvar troca
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
