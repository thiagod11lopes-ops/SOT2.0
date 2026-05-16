import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CarFront, ChevronDown, ChevronUp, ClipboardList, Signature } from "lucide-react";
import { DepartureOcorrenciasModal } from "../components/departure-ocorrencias-modal";
import { Button } from "../components/ui/button";
import { isRubricaImageDataUrl } from "../lib/rubricaDrawing";
import { mergeViaturasCatalog, useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import type { DepartureKmFieldsPatch } from "../context/departures-context";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { parseKmCampo } from "../lib/oilMaintenance";
import { normalize24hTime } from "../lib/timeInput";
import { formatTipoSaidaAmbulancia, type DepartureRecord } from "../types/departure";
import { listRowFromRecord } from "../types/departure";
import {
  getRdvPlacasNaOficinaFromLatestPersistedRdv,
  RDV_STORAGE_EVENT,
} from "../lib/relatorioDiarioViaturasStorage";
import {
  formatGeolocationBlockMessage,
  geolocationUnavailableMessage,
  startMobileDriverTrackingSession,
  stopMobileDriverTrackingSessionIfMatches,
} from "../lib/mobileDriverTracking";
import { clearDriverActiveLocation, resolveDriverLocationPostUrl } from "../lib/driverLocationPost";
import { primaryPlacaFromViaturasField } from "../lib/viaturaPlaca";
import { loadActiveMobileMotorista } from "../lib/mobileMotoristaCredentials";
import {
  clearMotoristaActiveAssignmentIfDeparture,
  writeMotoristaActiveAssignment,
} from "../lib/motoristaActiveAssignment";
import { cn } from "../lib/utils";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { RubricaSignaturePad, type RubricaSignaturePadHandle } from "./rubrica-signature-pad";
import { MobileEditableSelectField, MobileEditableTextField } from "./mobile-field-edit-modal";

/** Mão a acenar («tchau») — formas simples (rect/ellipse) para Safari não falhar o SVG. */
function IconMaoTchau({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <title>Mão a dizer tchau</title>
      {/* Manga */}
      <rect x="4" y="42" width="20" height="18" rx="4" fill="#64748b" />
      <rect x="10" y="38" width="8" height="8" rx="2" fill="#475569" />
      {/* Palma (amarelo tipo emoji 👋) */}
      <ellipse cx="38" cy="40" rx="20" ry="18" fill="#fbbf24" />
      <ellipse cx="38" cy="40" rx="17" ry="15" fill="#fcd34d" />
      {/* Polegar */}
      <ellipse cx="14" cy="36" rx="9" ry="7" fill="#fcd34d" transform="rotate(-35 14 36)" />
      {/* Dedos em linha, espaçados */}
      <rect x="22" y="6" width="7" height="22" rx="3.5" fill="#fcd34d" />
      <rect x="31" y="2" width="7" height="26" rx="3.5" fill="#fbbf24" />
      <rect x="40" y="4" width="7" height="24" rx="3.5" fill="#fcd34d" />
      <rect x="49" y="10" width="6" height="18" rx="3" fill="#fbbf24" />
      {/* Contorno suave palma */}
      <ellipse cx="38" cy="43" rx="14" ry="10" fill="#f59e0b" opacity="0.2" />
    </svg>
  );
}

export function DepartureCard({
  record,
  onPatchKm,
  updateDeparture,
  isSelectedForExcluir,
  onSelectForExcluir,
  allowMobileEdit = true,
  mergedDestinoDisplay,
  mergedSetorDisplay,
}: {
  record: DepartureRecord;
  onPatchKm: (patch: DepartureKmFieldsPatch) => void;
  updateDeparture?: (id: string, data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  /** Ambulância: destaque da saída escolhida para poder usar «Excluir Saída». */
  isSelectedForExcluir?: boolean;
  /** Ambulância: chamado ao tocar no cabeçalho do cartão (junto com expandir). */
  onSelectForExcluir?: () => void;
  /** No separador mobile, só o dia atual pode ser alterado; outros dias são só leitura. */
  allowMobileEdit?: boolean;
  /** Quando vários registos são fundidos num cartão (mesma hora, viatura e motorista): destino combinado. */
  mergedDestinoDisplay?: string;
  /** Idem: setores combinados (vista administrativa). */
  mergedSetorDisplay?: string;
}) {
  const expandContentRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [boaViagemOpen, setBoaViagemOpen] = useState(false);
  const [rubricaModalOpen, setRubricaModalOpen] = useState(false);
  const [oficinaConfirmModalOpen, setOficinaConfirmModalOpen] = useState(false);
  const [ocorrenciasModalOpen, setOcorrenciasModalOpen] = useState(false);
  const rubricaPadRef = useRef<RubricaSignaturePadHandle>(null);
  const rubricaTitleId = useId();
  const row = listRowFromRecord(record);
  const { departures } = useDepartures();
  const { items: catalogItems } = useCatalogItems();
  const [rdvOficinaTick, setRdvOficinaTick] = useState(0);
  useEffect(() => {
    const on = () => setRdvOficinaTick((t) => t + 1);
    window.addEventListener(RDV_STORAGE_EVENT, on);
    return () => window.removeEventListener(RDV_STORAGE_EVENT, on);
  }, []);
  const rdvPlacasNaOficinaLower = useMemo(() => {
    void rdvOficinaTick;
    return new Set(
      getRdvPlacasNaOficinaFromLatestPersistedRdv()
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
    );
  }, [rdvOficinaTick]);
  /** Ambulância: só placas de «Ambulâncias» em Frota e Pessoal e fora da oficina (RDV col. Oficina, igual ao cadastro principal). */
  const viaturasAmbDisponiveis = useMemo(
    () => catalogItems.ambulancias.filter((p) => !rdvPlacasNaOficinaLower.has(p.trim().toLowerCase())),
    [catalogItems.ambulancias, rdvPlacasNaOficinaLower],
  );
  const viaturasOpcoes = useMemo(() => {
    if (record.tipo !== "Ambulância") return mergeViaturasCatalog(catalogItems);
    return viaturasAmbDisponiveis;
  }, [record.tipo, catalogItems, viaturasAmbDisponiveis]);
  const motoristasFrota = catalogItems.motoristas;

  const isAmbulancia = record.tipo === "Ambulância";
  const cancelada = record.cancelada === true;
  const editavel = allowMobileEdit && !cancelada;
  const hospitalResumo = record.hospitalDestino.trim();
  const hospitalAoLadoDestino = isAmbulancia && hospitalResumo.length > 0;
  const tipoSaidaResumo = isAmbulancia ? formatTipoSaidaAmbulancia(record) : "";
  const destinoCabecalho = mergedDestinoDisplay ?? row.destino;
  const destinoCabecalhoLongo = Boolean(mergedDestinoDisplay);

  const kmSaidaPreenchido = record.kmSaida.trim().length > 0;
  const kmChegadaPreenchido = record.kmChegada.trim().length > 0;
  const chegadaPreenchido = record.chegada.trim().length > 0;
  const ficouNaOficina = record.ficouNaOficina === true && record.rubrica.trim().length > 0;
  const saidaFinalizada =
    kmSaidaPreenchido && ((kmChegadaPreenchido && chegadaPreenchido) || ficouNaOficina);

  /**
   * Detecta a transição **in-curso → finalizada**: o motorista acabou agora de preencher
   * KM chegada + chegada (ou marcou "ficou na oficina"). Só nesta transição limpamos o
   * rastreamento (sessão em memória + atribuição Firestore se apontar para esta saída).
   *
   * O ref evita falsos positivos no remount do componente — quando o Safari reabre numa saída
   * já finalizada, `saidaFinalizada` já chega `true`, mas como o ref também inicializa `true`,
   * a transição não é detectada e nada é limpo.
   */
  const prevSaidaFinalizadaRef = useRef(saidaFinalizada);
  useEffect(() => {
    const transicionou = !prevSaidaFinalizadaRef.current && saidaFinalizada;
    prevSaidaFinalizadaRef.current = saidaFinalizada;
    if (!transicionou) return;
    stopMobileDriverTrackingSessionIfMatches(record.id);
    const motorista = loadActiveMobileMotorista();
    if (motorista) void clearMotoristaActiveAssignmentIfDeparture(motorista, record.id);
  }, [saidaFinalizada, record.id]);

  /**
   * Re-escreve a atribuição `motorista_active_assignments` no Firestore sempre que esta saída
   * está em curso (KM saída preenchido sem KM chegada) e há um motorista logado neste device.
   *
   * Porquê: a atribuição é a fonte de verdade que o servidor consulta para saber em que placa
   * gravar os envios do OwnTracks. Se o motorista bloquear o iPhone e voltar a abrir o Safari
   * mais tarde — ou se algum efeito secundário tiver marcado o doc como inactivo — este efeito
   * volta a pôr o doc activo com a placa actual da saída, no remount do componente.
   *
   * É chamado apenas para saídas **em curso**, e tem custo Firestore mínimo (1 write por placa).
   */
  const saidaEmCurso = kmSaidaPreenchido && !saidaFinalizada;
  useEffect(() => {
    if (!saidaEmCurso) return;
    const placa = primaryPlacaFromViaturasField(record.viaturas);
    if (!placa) return;
    const motorista = loadActiveMobileMotorista();
    if (!motorista) return;
    void writeMotoristaActiveAssignment({ motorista, placa, departureId: record.id });
  }, [saidaEmCurso, record.id, record.viaturas]);

  function applyAmbPatch(partial: Partial<DepartureRecord>) {
    if (!editavel || !updateDeparture) return;
    updateDeparture(record.id, {
      ...record,
      ...partial,
    });
  }

  function commitRubrica() {
    if (!updateDeparture) return;
    const { id, createdAt, ...rest } = record;
    void id;
    void createdAt;
    const drawn = rubricaPadRef.current?.getDataUrl() ?? "";
    updateDeparture(record.id, { ...rest, rubrica: drawn });
    const placa = primaryPlacaFromViaturasField(record.viaturas);
    if (placa && resolveDriverLocationPostUrl()) {
      void clearDriverActiveLocation(placa).catch((e) =>
        console.warn("[SOT mobile] clearDriverActiveLocation:", e),
      );
    }
    setRubricaModalOpen(false);
    setOpen(false);
  }

  function handleSalvarOcorrencias(departureId: string, texto: string) {
    if (!updateDeparture) return;
    const { id, createdAt, ...rest } = record;
    void id;
    void createdAt;
    updateDeparture(departureId, { ...rest, ocorrencias: texto });
  }

  function applyAdminCadastroPatch(partial: Partial<DepartureRecord>) {
    if (!editavel || !updateDeparture) return;
    updateDeparture(record.id, {
      ...record,
      ...partial,
    });
  }

  function marcarViaturaNaOficina() {
    if (!editavel || !updateDeparture) return;
    updateDeparture(record.id, {
      ...record,
      kmChegada: "",
      chegada: "",
      ficouNaOficina: true,
    });
    setOficinaConfirmModalOpen(false);
    setRubricaModalOpen(true);
  }

  async function handleIniciarSaida() {
    if (!editavel) return;
    if (!record.kmSaida.trim()) {
      window.alert("Preencha o KM saída antes de iniciar o rastreamento da viagem.");
      return;
    }
    const placa = primaryPlacaFromViaturasField(record.viaturas);
    if (!placa) {
      window.alert("Informe a viatura antes de iniciar.");
      return;
    }
    if (!resolveDriverLocationPostUrl()) {
      window.alert(
        "Esta cópia do SOT não tem URL de envio de localização: defina o projeto Firebase (VITE_FIREBASE_PROJECT_ID) ou VITE_DRIVER_LOCATION_POST_URL.",
      );
      return;
    }
    try {
      await startMobileDriverTrackingSession({ recordId: record.id, placa });
      setOpen(false);
      setBoaViagemOpen(true);
    } catch (e) {
      if (e instanceof Error && e.message.includes(geolocationUnavailableMessage())) {
        window.alert(e.message);
        return;
      }
      window.alert(formatGeolocationBlockMessage(e));
    }
  }

  function getKmSaidaPrefillOnClickFromLastNormal(): string | null {
    const placaKey = record.viaturas.trim().toLowerCase();
    if (!placaKey) return null;
    let latest: DepartureRecord | null = null;
    for (const d of departures) {
      if (d.id === record.id) continue;
      if (d.viaturas.trim().toLowerCase() !== placaKey) continue;
      if (!latest) {
        latest = d;
        continue;
      }
      const da = d.updatedAt ?? d.createdAt ?? 0;
      const la = latest.updatedAt ?? latest.createdAt ?? 0;
      if (da >= la) latest = d;
    }
    if (!latest) return null;
    const latestOficinaRubricada =
      latest.ficouNaOficina === true && latest.rubrica.trim().length > 0 && latest.kmSaida.trim().length > 0;
    if (latestOficinaRubricada) return null;
    const km = parseKmCampo(latest.kmChegada) ?? parseKmCampo(latest.kmSaida);
    if (km === null) return null;
    return formatKmThousandsPtBr(String(km));
  }

  function handleKmSaidaFieldTapPrefill(onApply: (km: string) => void): boolean {
    if (!editavel) return false;
    if (record.kmSaida.trim().length > 0) return false;
    const km = getKmSaidaPrefillOnClickFromLastNormal();
    if (!km) return false;
    onApply(km);
    return true;
  }

  /** Rubrica não depende de `editavel`: em dias só leitura ainda se pode rubricar se já houver chegada registada. */
  const mostrarRubricar =
    (chegadaPreenchido || ficouNaOficina) && Boolean(updateDeparture) && !cancelada;

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      expandContentRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!boaViagemOpen) return;
    const t = window.setTimeout(() => setBoaViagemOpen(false), 4000);
    return () => window.clearTimeout(t);
  }, [boaViagemOpen]);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-[hsl(var(--border))]/90 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--card))]/70 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] transition",
        cancelada && "opacity-50",
        open && !isSelectedForExcluir && "ring-1 ring-[hsl(var(--primary))]/35",
        isSelectedForExcluir && "ring-2 ring-[hsl(var(--primary))]/70",
      )}
    >
      {cancelada ? (
        <div
          role="status"
          aria-label="Saída cancelada — rubrica"
          className="relative w-full overflow-hidden border-b border-red-600/25 bg-[hsl(var(--muted))]/15 px-3 py-2.5"
        >
          <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Rubrica
          </p>
          <div className="relative mt-1 flex min-h-[3.25rem] items-center justify-center overflow-hidden rounded-md border border-[hsl(var(--border))]/50 bg-[hsl(var(--background))]/40 px-2 py-2">
            {isRubricaImageDataUrl(record.rubrica) ? (
              <img
                src={record.rubrica}
                alt=""
                className="max-h-10 w-full object-contain opacity-45"
              />
            ) : (
              <p className="w-full break-words text-center text-xs leading-snug text-[hsl(var(--foreground))]/90">
                {(record.rubrica ?? "").trim() || "—"}
              </p>
            )}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <span className="-rotate-[35deg] select-none whitespace-nowrap text-[0.72rem] font-black uppercase tracking-[0.2em] text-red-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]">
                CANCELADA
              </span>
            </span>
          </div>
        </div>
      ) : kmSaidaPreenchido ? (
        <div
          role="status"
          aria-label={saidaFinalizada ? "Saída finalizada" : "Saída iniciada"}
          className={cn(
            "w-full border-b border-black/10 py-1.5 text-center text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white",
            saidaFinalizada ? "bg-[hsl(217_75%_42%)]" : "bg-[hsl(152_65%_32%)]",
          )}
        >
          {saidaFinalizada ? "Finalizada" : "Iniciada"}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          onSelectForExcluir?.();
          setOpen((v) => !v);
        }}
        style={{ touchAction: "manipulation" }}
        aria-pressed={isSelectedForExcluir === true ? true : undefined}
        className="flex min-h-[4.5rem] w-full items-stretch gap-3 p-4 text-left active:bg-[hsl(var(--muted))]/20"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-bold tabular-nums text-[hsl(var(--primary))]">{row.saida}</span>
            <span className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{row.viatura}</span>
          </div>
          <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{row.motorista}</p>
          {tipoSaidaResumo ? (
            <p className="min-w-0 break-words text-sm leading-snug line-clamp-2">
              <span className="text-[hsl(var(--muted-foreground))]">Tipo saída </span>
              <span className="font-medium text-[hsl(var(--foreground))]">{tipoSaidaResumo}</span>
            </p>
          ) : null}
          <p
            className={cn(
              "text-sm",
              hospitalAoLadoDestino || destinoCabecalhoLongo
                ? "min-w-0 break-words text-balance leading-snug line-clamp-3"
                : "truncate",
            )}
          >
            <span className="text-[hsl(var(--muted-foreground))]">Dest. </span>
            <span className="font-medium text-[hsl(var(--foreground))]">{destinoCabecalho}</span>
            {hospitalAoLadoDestino ? (
              <>
                <span className="text-[hsl(var(--muted-foreground))]"> · </span>
                <span className="text-[hsl(var(--muted-foreground))]">Hosp. </span>
                <span className="font-medium text-[hsl(var(--foreground))]">{hospitalResumo}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 self-stretch">
          {!hospitalAoLadoDestino ? (
            <span
              className="max-w-[40%] truncate rounded-lg bg-[hsl(var(--muted))]/60 px-2 py-0.5 text-[0.65rem] font-bold text-[hsl(var(--foreground))]"
              title={row.hospital}
            >
              {row.hospital}
            </span>
          ) : null}
          <div className="mt-auto">
            {open ? (
              <ChevronUp className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
            ) : (
              <ChevronDown className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
            )}
          </div>
        </div>
      </button>

      {open && isAmbulancia && (updateDeparture || !allowMobileEdit) ? (
        <div
          ref={expandContentRef}
          className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4"
        >
          {cancelada ? (
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Esta saída foi cancelada.</p>
          ) : null}
          {!allowMobileEdit ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Apenas saídas do dia de hoje podem ser editadas neste separador.
            </p>
          ) : null}
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            {editavel ? "Edição rápida (mesma ordem)" : "Dados (só leitura)"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MobileEditableSelectField
              label="Viatura"
              value={record.viaturas}
              onChange={(v) => applyAmbPatch({ viaturas: v })}
              options={viaturasOpcoes}
              disabled={!editavel}
              emptyCatalogHint
            />
            <MobileEditableSelectField
              label="Motorista"
              value={record.motoristas}
              onChange={(v) => applyAmbPatch({ motoristas: v })}
              options={motoristasFrota}
              disabled={!editavel}
              emptyCatalogHint
            />
            <MobileEditableTextField
              label="Hospital"
              value={record.hospitalDestino}
              onCommit={(v) => applyAmbPatch({ hospitalDestino: v })}
              disabled={!editavel}
            />
            <div className="col-span-1 flex flex-col gap-2 sm:col-span-2">
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Tipo de saída (ambulância)
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]",
                    !editavel && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={record.tipoSaidaInterHospitalar === true}
                    disabled={!editavel}
                    onChange={(e) =>
                      applyAmbPatch({ tipoSaidaInterHospitalar: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-[hsl(var(--border))]"
                  />
                  Inter-Hospitalar
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]",
                    !editavel && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={record.tipoSaidaAlta === true}
                    disabled={!editavel}
                    onChange={(e) => applyAmbPatch({ tipoSaidaAlta: e.target.checked })}
                    className="h-4 w-4 rounded border-[hsl(var(--border))]"
                  />
                  Alta
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]",
                    !editavel && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={record.tipoSaidaOutros === true}
                    disabled={!editavel}
                    onChange={(e) => applyAmbPatch({ tipoSaidaOutros: e.target.checked })}
                    className="h-4 w-4 rounded border-[hsl(var(--border))]"
                  />
                  Outros
                </label>
              </div>
            </div>
            <MobileEditableTextField
              label="Hora da saída"
              value={record.horaSaida}
              onCommit={(v) => applyAmbPatch({ horaSaida: v })}
              transform={normalize24hTime}
              time24h
              disabled={!editavel}
            />
            <MobileEditableTextField
              label="Destino"
              value={record.bairro}
              onCommit={(v) => applyAmbPatch({ bairro: v })}
              disabled={!editavel}
            />
            <div className="col-span-1 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <MobileEditableTextField
                  label="KM saída"
                  value={formatKmThousandsPtBr(record.kmSaida)}
                  onCommit={(v) => applyAmbPatch({ kmSaida: v })}
                  onBeforeOpen={() => handleKmSaidaFieldTapPrefill((km) => applyAmbPatch({ kmSaida: km }))}
                  transform={formatKmThousandsPtBr}
                  inputMode="numeric"
                  mono
                  disabled={!editavel}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!editavel}
                className="mb-[2px] h-11 min-h-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-3 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55 disabled:opacity-40"
                onClick={handleIniciarSaida}
              >
                Iniciar Saída
              </Button>
            </div>
            <MobileEditableTextField
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onCommit={(v) =>
                applyAmbPatch({ kmChegada: v, ficouNaOficina: v.trim().length > 0 ? false : record.ficouNaOficina })
              }
              transform={formatKmThousandsPtBr}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <div className="col-span-1 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <MobileEditableTextField
                  label="Hora da chegada"
                  value={record.chegada}
                  onCommit={(v) =>
                    applyAmbPatch({
                      chegada: v,
                      ficouNaOficina: normalize24hTime(v).trim().length > 0 ? false : record.ficouNaOficina,
                    })
                  }
                  transform={normalize24hTime}
                  time24h
                  disabled={!editavel}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!editavel}
                className="mb-[2px] h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-amber-500/10 p-0 text-amber-700 hover:bg-amber-500/20 disabled:opacity-40 dark:text-amber-400"
                title="Viatura ficou na oficina (carro quebrado)"
                aria-label="Marcar viatura como ficou na oficina"
                onClick={() => setOficinaConfirmModalOpen(true)}
              >
                <CarFront className="h-5 w-5" />
              </Button>
            </div>
            {updateDeparture ? (
              <div className="col-span-1 sm:col-span-2 flex flex-col gap-2 pt-0.5">
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 p-0 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55",
                        record.ocorrencias?.trim() && "border-[hsl(var(--primary))]/40 text-[hsl(var(--primary))]",
                      )}
                      aria-label="Ocorrências"
                      title="Ocorrências"
                      onClick={() => setOcorrenciasModalOpen(true)}
                    >
                      <ClipboardList className="h-5 w-5" />
                    </Button>
                    <span className="text-[0.75rem] font-medium text-[hsl(var(--foreground))]">
                      {record.ocorrencias?.trim() ? "Ocorrências registadas" : "Ocorrências"}
                    </span>
                  </div>
                  {mostrarRubricar ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-3 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55"
                        aria-label="Rubricar"
                        title="Rubricar"
                        onClick={() => setRubricaModalOpen(true)}
                      >
                        <Signature className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Rubricar</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
                {mostrarRubricar && (record.rubrica ?? "").trim().length > 0 ? (
                  <p className="text-[0.7rem] leading-snug text-[hsl(var(--muted-foreground))]">
                    Rubrica registada — aparece no PDF (Gerar PDF / Enviar / Assinar).
                    {isRubricaImageDataUrl(record.rubrica) ? " (desenho)" : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {open && !isAmbulancia ? (
        <div
          ref={expandContentRef}
          className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4"
        >
          {cancelada ? (
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Esta saída foi cancelada.</p>
          ) : null}
          {!allowMobileEdit ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Apenas saídas do dia de hoje podem ser editadas neste separador.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Setor / ramal
              </p>
              <p className="text-sm text-[hsl(var(--foreground))]">
                {mergedSetorDisplay ?? (record.setor.trim() || "—")} · {record.ramal.trim() || "—"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Objetivo
              </p>
              <p className="text-sm leading-snug text-[hsl(var(--foreground))]">
                {record.objetivoSaida.trim() || "—"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="col-span-1 sm:col-span-3">
              <MobileEditableTextField
                label="Destino"
                value={record.bairro}
                onCommit={(v) => applyAdminCadastroPatch({ bairro: v })}
                disabled={!editavel || !updateDeparture}
              />
            </div>
            <div className="col-span-1 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <MobileEditableTextField
                  label="KM saída"
                  value={formatKmThousandsPtBr(record.kmSaida)}
                  onCommit={(v) => onPatchKm({ kmSaida: v })}
                  onBeforeOpen={() => handleKmSaidaFieldTapPrefill((km) => onPatchKm({ kmSaida: km }))}
                  transform={formatKmThousandsPtBr}
                  inputMode="numeric"
                  mono
                  disabled={!editavel}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!editavel}
                className="mb-[2px] h-11 min-h-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-3 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55 disabled:opacity-40"
                onClick={handleIniciarSaida}
              >
                Iniciar Saída
              </Button>
            </div>
            <MobileEditableTextField
              label="KM chegada"
              value={formatKmThousandsPtBr(record.kmChegada)}
              onCommit={(v) =>
                applyAdminCadastroPatch({
                  kmChegada: formatKmThousandsPtBr(v),
                  ficouNaOficina: formatKmThousandsPtBr(v).trim().length > 0 ? false : record.ficouNaOficina,
                })
              }
              transform={formatKmThousandsPtBr}
              inputMode="numeric"
              mono
              disabled={!editavel}
            />
            <div className="col-span-1 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <MobileEditableTextField
                  label="Hora da chegada"
                  value={record.chegada}
                  onCommit={(v) =>
                    applyAdminCadastroPatch({
                      chegada: normalize24hTime(v),
                      ficouNaOficina: normalize24hTime(v).trim().length > 0 ? false : record.ficouNaOficina,
                    })
                  }
                  time24h
                  disabled={!editavel}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!editavel}
                className="mb-[2px] h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-amber-500/10 p-0 text-amber-700 hover:bg-amber-500/20 disabled:opacity-40 dark:text-amber-400"
                title="Viatura ficou na oficina (carro quebrado)"
                aria-label="Marcar viatura como ficou na oficina"
                onClick={() => setOficinaConfirmModalOpen(true)}
              >
                <CarFront className="h-5 w-5" />
              </Button>
            </div>
            {updateDeparture ? (
              <div className="col-span-1 sm:col-span-3 flex flex-col gap-2 pt-0.5">
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 p-0 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55",
                        record.ocorrencias?.trim() && "border-[hsl(var(--primary))]/40 text-[hsl(var(--primary))]",
                      )}
                      aria-label="Ocorrências"
                      title="Ocorrências"
                      onClick={() => setOcorrenciasModalOpen(true)}
                    >
                      <ClipboardList className="h-5 w-5" />
                    </Button>
                    <span className="text-[0.75rem] font-medium text-[hsl(var(--foreground))]">
                      {record.ocorrencias?.trim() ? "Ocorrências registadas" : "Ocorrências"}
                    </span>
                  </div>
                  {mostrarRubricar ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-3 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/55"
                        aria-label="Rubricar"
                        title="Rubricar"
                        onClick={() => setRubricaModalOpen(true)}
                      >
                        <Signature className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Rubricar</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
                {mostrarRubricar && (record.rubrica ?? "").trim().length > 0 ? (
                  <p className="text-[0.7rem] leading-snug text-[hsl(var(--muted-foreground))]">
                    Rubrica registada — aparece no PDF (Gerar PDF / Enviar / Assinar).
                    {isRubricaImageDataUrl(record.rubrica) ? " (desenho)" : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {updateDeparture ? (
        <DepartureOcorrenciasModal
          open={ocorrenciasModalOpen}
          onOpenChange={setOcorrenciasModalOpen}
          record={record}
          onSave={handleSalvarOcorrencias}
          confirmFirst
          alignTop
        />
      ) : null}

      {rubricaModalOpen ? (
        <div
          className={cn(MOBILE_MODAL_OVERLAY_CLASS, "z-[500]")}
          role="dialog"
          aria-modal="true"
          aria-labelledby={rubricaTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRubricaModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={rubricaTitleId} className="mb-3 text-lg font-semibold text-[hsl(var(--foreground))]">
              Rubrica
            </h2>
            <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">
              Desenhe a rubrica com o dedo ou o rato — sem teclado. Aparece na coluna Rubrica do PDF (aba Saídas).
            </p>
            <RubricaSignaturePad
              key={record.id}
              ref={rubricaPadRef}
              initialDataUrl={isRubricaImageDataUrl(record.rubrica) ? record.rubrica : null}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                className="min-h-11 rounded-xl font-medium text-black"
                onClick={() => rubricaPadRef.current?.clearPad()}
              >
                Limpar
              </Button>
              <Button
                type="button"
                className="min-h-11 rounded-xl font-medium text-black"
                onClick={() => setRubricaModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="button" className="min-h-11 rounded-xl font-semibold text-black" onClick={commitRubrica}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {oficinaConfirmModalOpen ? (
        <div
          className={cn(MOBILE_MODAL_OVERLAY_CLASS, "z-[520] items-center pt-12")}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOficinaConfirmModalOpen(false);
          }}
        >
          <div
            className="mt-10 w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">Viatura ficou na oficina?</h3>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Ao confirmar, a saída será finalizada sem KM chegada e sem Hora da chegada. Em seguida, faça a rubrica
              para concluir.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                className="min-h-10 rounded-xl font-medium text-black"
                onClick={() => setOficinaConfirmModalOpen(false)}
              >
                Não
              </Button>
              <Button
                type="button"
                className="min-h-10 rounded-xl font-semibold text-black"
                onClick={marcarViaturaNaOficina}
              >
                Sim
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {boaViagemOpen ? (
        <>
          <style>{`
            @keyframes sot-boa-viagem-backdrop {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes sot-boa-viagem-card {
              from { opacity: 0; transform: scale(0.9) translateY(1.25rem) rotateX(8deg); }
              to { opacity: 1; transform: scale(1) translateY(0) rotateX(0deg); }
            }
            @keyframes sot-boa-viagem-shine {
              0% { background-position: 0% 50%; }
              100% { background-position: 200% 50%; }
            }
            @keyframes sot-boa-viagem-wave {
              0%, 100% { transform: rotate(-10deg); }
              50% { transform: rotate(22deg); }
            }
          `}</style>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sot-boa-viagem-title"
            className="fixed inset-0 z-[580] flex items-center justify-center bg-gradient-to-br from-slate-950/80 via-indigo-950/75 to-violet-950/80 p-5 backdrop-blur-[20px]"
            style={{ animation: "sot-boa-viagem-backdrop 0.45s ease-out both" }}
            onClick={() => setBoaViagemOpen(false)}
          >
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/[0.12] to-white/[0.04] p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.06) inset,0_25px_80px_-20px_rgba(99,102,241,0.55)]"
              style={{ animation: "sot-boa-viagem-card 0.55s cubic-bezier(0.22, 1, 0.36, 1) both" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="pointer-events-none absolute -left-1/4 -top-1/2 h-[120%] w-[70%] rounded-full bg-cyan-400/25 blur-[60px]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-1/3 -right-1/4 h-[90%] w-[65%] rounded-full bg-fuchsia-500/20 blur-[55px]"
                aria-hidden
              />
              <div className="relative rounded-[1.85rem] bg-slate-950/40 px-8 py-10 text-center">
                <div
                  className="mx-auto mb-4 flex min-h-[7rem] items-end justify-center pt-1"
                  style={{
                    animation: "sot-boa-viagem-wave 0.75s ease-in-out infinite",
                    transformOrigin: "30% 92%",
                  }}
                >
                  <div className="rounded-2xl border border-amber-200/35 bg-gradient-to-b from-amber-500/25 to-slate-950/60 p-3 shadow-lg ring-1 ring-amber-400/30">
                    <IconMaoTchau className="h-24 w-24 drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]" />
                  </div>
                </div>
                <h2
                  id="sot-boa-viagem-title"
                  className="mb-2 bg-gradient-to-r from-cyan-100 via-white to-fuchsia-100 bg-[length:200%_auto] bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-[2.75rem]"
                  style={{ animation: "sot-boa-viagem-shine 2.5s ease-in-out infinite alternate" }}
                >
                  BOA VIAGEM
                </h2>
                <p className="text-sm font-medium text-white/55">
                  Rastreamento activo · conduza em segurança
                </p>
                <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                <p className="mt-4 text-[0.7rem] uppercase tracking-[0.2em] text-white/35">Toque fora para fechar</p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}
