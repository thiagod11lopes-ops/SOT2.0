import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { CalendarDays, CheckCircle2, Loader2, Search } from "lucide-react";
import {
  isValueInCatalog,
  mergeViaturasCatalog,
  useCatalogItems,
} from "../context/catalog-items-context";
import { useAppTab } from "../context/app-tab-context";
import { useDepartures } from "../context/departures-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import { useSyncPreference } from "../context/sync-preference-context";
import {
  CUSTOM_LOCATIONS_STORAGE_KEY,
  emptyCustomLocations,
  findCanonicalCity,
  findCanonicalString,
  mergeUniqueSorted,
  normalizeCustomLocations,
  type CustomLocationsState,
} from "../lib/customLocationsStorage";
import { stashDeparturesListFilterFromCadastro } from "../lib/departuresListFilterCadastro";
import {
  dataSaidaToListFilterPtBr,
  formatDateToPtBr,
  getCurrentDatePtBr,
  getWeekdayDatesFromTodayThroughEndOfCurrentMonth,
  isCompleteDatePtBr,
  normalizeDatePtBr,
  parsePtBrToDate,
} from "../lib/dateFormat";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { normalize24hTime } from "../lib/timeInput";
import { HOSPITAL_EXEMPLOS_OCULTOS_MODAL_MOBILE } from "../lib/mobileCatalogExcludes";
import { cn } from "../lib/utils";
import type { DepartureRecord, DepartureType } from "../types/departure";
import { CatalogItemsPanel } from "./catalog-items-panel";
import { CatalogComboField } from "./catalog-select";
import { DepartureDeleteOrCancelModal } from "./departure-delete-or-cancel-modal";
import { RegisteredFullDeparturesTable } from "./registered-full-departures-table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { TabsList } from "./ui/tabs";
import ibgeBairrosPorCidadeJson from "../data/bairrosPorCidade.json";

const subTabs = [
  "Cadastrar Nova Saída",
  "Saídas Cadastradas",
  "Cadastrar Itens",
  "Saídas não Programadas",
];

const metroRioCities = [
  "Rio de Janeiro",
  "Belford Roxo",
  "Duque de Caxias",
  "Guapimirim",
  "Itaboraí",
  "Itaguaí",
  "Japeri",
  "Magé",
  "Maricá",
  "Mesquita",
  "Nilópolis",
  "Niterói",
  "Nova Iguaçu",
  "Paracambi",
  "Queimados",
  "São Gonçalo",
  "São João de Meriti",
  "Seropédica",
  "Tanguá",
];

/** Bairros (IBGE CD2022 + suplemento municipal) — ver `scripts/generate-bairros-ibge.mjs`. */
const IBGE_BAIRROS_POR_CIDADE = ibgeBairrosPorCidadeJson as Record<string, string[]>;

function mainListTabForDepartureTipo(tipo: string): "Saídas Administrativas" | "Saídas de Ambulância" {
  return tipo === "Ambulância" ? "Saídas de Ambulância" : "Saídas Administrativas";
}

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

const WEEKDAY_NAMES_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function formatWeekdayCommaDatePtBr(d: Date): string {
  return `${WEEKDAY_NAMES_PT[d.getDay()]}, ${formatDateToPtBr(d)}`;
}

function hasSiadDepartureOnDate(records: DepartureRecord[], target: Date): boolean {
  for (const r of records) {
    if (r.setor.trim().toLowerCase() !== "siad") continue;
    const ds = parsePtBrToDate(r.dataSaida.trim());
    if (!ds) continue;
    if (isSameLocalCalendarDay(ds, target)) return true;
  }
  return false;
}

function hasExternoBatchDepartureOnDate(records: DepartureRecord[], target: Date): boolean {
  for (const r of records) {
    if (r.setor.trim().toLowerCase() !== "secom") continue;
    if (r.objetivoSaida.trim().toLowerCase() !== "externo") continue;
    const ds = parsePtBrToDate(r.dataSaida.trim());
    if (!ds) continue;
    if (isSameLocalCalendarDay(ds, target)) return true;
  }
  return false;
}

function getMissingSiadWeekdayDates(records: DepartureRecord[]): Date[] {
  return getWeekdayDatesFromTodayThroughEndOfCurrentMonth().filter((d) => !hasSiadDepartureOnDate(records, d));
}

function getMissingExternoBatchWeekdayDates(records: DepartureRecord[]): Date[] {
  return getWeekdayDatesFromTodayThroughEndOfCurrentMonth().filter(
    (d) => !hasExternoBatchDepartureOnDate(records, d),
  );
}

/** Datas únicas (dd/mm/aaaa), ordenadas cronologicamente. */
function uniqueSortedSeriesDates(dates: Date[]): Date[] {
  const byKey = new Map<string, Date>();
  for (const d of dates) {
    const key = formatDateToPtBr(d);
    if (!byKey.has(key)) byKey.set(key, d);
  }
  return [...byKey.values()].sort((a, b) => a.getTime() - b.getTime());
}

function applyDepartureRecordToForm(
  r: DepartureRecord,
  setters: {
    setDepartureType: (v: string) => void;
    setRequestDate: (v: string) => void;
    setRequestTime: (v: string) => void;
    setDepartureDate: (v: string) => void;
    setDepartureTime: (v: string) => void;
    setSector: (v: string) => void;
    setExtension: (v: string) => void;
    setDepartureObjective: (v: string) => void;
    setPassengerCount: (v: string) => void;
    setRequestResponsible: (v: string) => void;
    setOm: (v: string) => void;
    setVehicles: (v: string) => void;
    setDrivers: (v: string) => void;
    setDestinationHospital: (v: string) => void;
    setKmDeparture: (v: string) => void;
    setKmArrival: (v: string) => void;
    setArrivalTime: (v: string) => void;
    setCity: (v: string) => void;
    setNeighborhood: (v: string) => void;
    setTipoSaidaInterHospitalar: (v: boolean) => void;
    setTipoSaidaAlta: (v: boolean) => void;
    setTipoSaidaOutros: (v: boolean) => void;
  },
) {
  setters.setDepartureType(r.tipo);
  setters.setRequestDate(r.dataPedido);
  setters.setRequestTime(r.horaPedido);
  setters.setDepartureDate(r.dataSaida);
  setters.setDepartureTime(r.horaSaida);
  setters.setSector(r.setor);
  setters.setExtension(r.ramal);
  setters.setDepartureObjective(r.objetivoSaida);
  setters.setPassengerCount(r.numeroPassageiros);
  setters.setRequestResponsible(r.responsavelPedido);
  setters.setOm(r.om);
  setters.setVehicles(r.viaturas);
  setters.setDrivers(r.motoristas);
  setters.setDestinationHospital(r.hospitalDestino);
  setters.setKmDeparture(formatKmThousandsPtBr(r.kmSaida));
  setters.setKmArrival(formatKmThousandsPtBr(r.kmChegada));
  setters.setArrivalTime(r.chegada);
  setters.setCity(r.cidade);
  setters.setNeighborhood(r.bairro);
  setters.setTipoSaidaInterHospitalar(r.tipo === "Ambulância" && r.tipoSaidaInterHospitalar === true);
  setters.setTipoSaidaAlta(r.tipo === "Ambulância" && r.tipoSaidaAlta === true);
  setters.setTipoSaidaOutros(r.tipo === "Ambulância" && r.tipoSaidaOutros === true);
}

function applyDeparturePayloadToForm(
  payload: Omit<DepartureRecord, "id" | "createdAt">,
  setters: {
    setDepartureType: (v: string) => void;
    setRequestDate: (v: string) => void;
    setRequestTime: (v: string) => void;
    setDepartureDate: (v: string) => void;
    setDepartureTime: (v: string) => void;
    setSector: (v: string) => void;
    setExtension: (v: string) => void;
    setDepartureObjective: (v: string) => void;
    setPassengerCount: (v: string) => void;
    setRequestResponsible: (v: string) => void;
    setOm: (v: string) => void;
    setVehicles: (v: string) => void;
    setDrivers: (v: string) => void;
    setDestinationHospital: (v: string) => void;
    setKmDeparture: (v: string) => void;
    setKmArrival: (v: string) => void;
    setArrivalTime: (v: string) => void;
    setCity: (v: string) => void;
    setNeighborhood: (v: string) => void;
    setTipoSaidaInterHospitalar: (v: boolean) => void;
    setTipoSaidaAlta: (v: boolean) => void;
    setTipoSaidaOutros: (v: boolean) => void;
  },
) {
  setters.setDepartureType(payload.tipo);
  setters.setRequestDate(payload.dataPedido);
  setters.setRequestTime(payload.horaPedido);
  setters.setDepartureDate(payload.dataSaida);
  setters.setDepartureTime(payload.horaSaida);
  setters.setSector(payload.setor);
  setters.setExtension(payload.ramal);
  setters.setDepartureObjective(payload.objetivoSaida);
  setters.setPassengerCount(payload.numeroPassageiros);
  setters.setRequestResponsible(payload.responsavelPedido);
  setters.setOm(payload.om);
  setters.setVehicles(payload.viaturas);
  setters.setDrivers(payload.motoristas);
  setters.setDestinationHospital(payload.hospitalDestino);
  setters.setKmDeparture(formatKmThousandsPtBr(payload.kmSaida));
  setters.setKmArrival(formatKmThousandsPtBr(payload.kmChegada));
  setters.setArrivalTime(payload.chegada);
  setters.setCity(payload.cidade);
  setters.setNeighborhood(payload.bairro);
  setters.setTipoSaidaInterHospitalar(payload.tipo === "Ambulância" && payload.tipoSaidaInterHospitalar === true);
  setters.setTipoSaidaAlta(payload.tipo === "Ambulância" && payload.tipoSaidaAlta === true);
  setters.setTipoSaidaOutros(payload.tipo === "Ambulância" && payload.tipoSaidaOutros === true);
}

export function RegisterDeparturePage() {
  const {
    departures,
    addDeparture,
    updateDeparture,
    removeDeparture,
    beginEditDeparture,
    pendingEditDepartureId,
    editIntentVersion,
    clearPendingEditDeparture,
    forceCloudResync,
  } = useDepartures();
  const {
    setActiveTab: setMainAppTab,
    setPendingDeparturesFilterDatePtBr,
    bumpDeparturesListMountKey,
  } = useAppTab();
  const { items: catalogItems, addItem: addCatalogItem } = useCatalogItems();
  const { estaNaOficina } = useOficinaVisitas();
  const [activeSubTab, setActiveSubTab] = useState<string>(subTabs[0]);
  const [saidaFiltroViatura, setSaidaFiltroViatura] = useState("");
  const [saidaFiltroMotorista, setSaidaFiltroMotorista] = useState("");
  const [saidaFiltroTipo, setSaidaFiltroTipo] = useState<"Todos" | DepartureType>("Todos");
  const [saidaLupaBusca, setSaidaLupaBusca] = useState("");

  const saidasCadastradasFiltradas = useMemo(() => {
    const v = saidaFiltroViatura.trim().toLowerCase();
    const m = saidaFiltroMotorista.trim().toLowerCase();
    let list = departures;
    if (saidaFiltroTipo !== "Todos") {
      list = list.filter((d) => d.tipo === saidaFiltroTipo);
    }
    if (v) {
      list = list.filter((d) => d.viaturas.trim().toLowerCase().includes(v));
    }
    if (m) {
      list = list.filter((d) => d.motoristas.trim().toLowerCase().includes(m));
    }
    return list;
  }, [departures, saidaFiltroMotorista, saidaFiltroTipo, saidaFiltroViatura]);

  const emptyLabelSaidasCadastradas = useMemo(() => {
    const base = "Nenhuma saída cadastrada ainda. Use Cadastrar Nova Saída para incluir.";
    if (departures.length === 0) return base;
    const hasFilters =
      saidaFiltroViatura.trim().length > 0 ||
      saidaFiltroMotorista.trim().length > 0 ||
      saidaFiltroTipo !== "Todos";
    return hasFilters ? "Nenhuma saída encontrada com os filtros atuais." : base;
  }, [departures.length, saidaFiltroMotorista, saidaFiltroTipo, saidaFiltroViatura]);

  /** Após clicar em Cadastrar Saída com itens fora do catálogo; exibe o + piscando. */
  const [catalogSubmitAttempted, setCatalogSubmitAttempted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConflictInfo, setEditConflictInfo] = useState<{
    id: string;
    payload: Omit<DepartureRecord, "id" | "createdAt">;
  } | null>(null);
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const deleteModalRecord = useMemo(
    () => (deleteModalId ? departures.find((d) => d.id === deleteModalId) ?? null : null),
    [departures, deleteModalId],
  );
  const lastAppliedEditVersion = useRef(0);
  /** Overlay enquanto o formulário aplica o registro vindo de “Editar saída” (não depende do IBGE). */
  const [editHydrating, setEditHydrating] = useState(false);
  const [departureType, setDepartureType] = useState<string>("Administrativa");
  const [requestDate, setRequestDate] = useState<string>(getCurrentDatePtBr);
  const [requestTime, setRequestTime] = useState<string>(getCurrentTime);
  const [departureDate, setDepartureDate] = useState<string>("");
  const [requestCalendarOpen, setRequestCalendarOpen] = useState(false);
  const [departureCalendarOpen, setDepartureCalendarOpen] = useState(false);
  const [seriesCalendarOpen, setSeriesCalendarOpen] = useState(false);
  const [seriesSelectedDates, setSeriesSelectedDates] = useState<Date[]>([]);
  const [departureTime, setDepartureTime] = useState<string>("");
  const [sector, setSector] = useState<string>("");
  const [extension, setExtension] = useState<string>("");
  const [departureObjective, setDepartureObjective] = useState<string>("");
  const [passengerCount, setPassengerCount] = useState<string>("");
  const [requestResponsible, setRequestResponsible] = useState<string>("");
  const [om, setOm] = useState<string>("");
  const [vehicles, setVehicles] = useState<string>("");
  const [drivers, setDrivers] = useState<string>("");
  const [destinationHospital, setDestinationHospital] = useState<string>("");
  const [tipoSaidaInterHospitalar, setTipoSaidaInterHospitalar] = useState(false);
  const [tipoSaidaAlta, setTipoSaidaAlta] = useState(false);
  const [tipoSaidaOutros, setTipoSaidaOutros] = useState(false);
  const [kmDeparture, setKmDeparture] = useState<string>("");
  const [kmArrival, setKmArrival] = useState<string>("");
  const [arrivalTime, setArrivalTime] = useState<string>("");
  const [city, setCity] = useState<string>("Rio de Janeiro");
  const [neighborhood, setNeighborhood] = useState<string>(
    () => IBGE_BAIRROS_POR_CIDADE["Rio de Janeiro"]?.[0] ?? "",
  );
  const [customLocations, setCustomLocations] = useState<CustomLocationsState>(() => emptyCustomLocations());
  const [customLocationsHydrated, setCustomLocationsHydrated] = useState(false);
  const customLocationsRemoteRef = useRef(false);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloudLocations = isFirebaseConfigured() && firebaseOnlyEnabled;
  /** Duplo clique em Cidade/Bairro: modal para novo item. */
  const [addLocationModal, setAddLocationModal] = useState<
    null | { kind: "city" } | { kind: "bairro"; cityKey: string }
  >(null);
  const [addLocationDraft, setAddLocationDraft] = useState("");
  const [siadGapMissingDates, setSiadGapMissingDates] = useState<Date[] | null>(null);
  const [siadMonthBlockedModalOpen, setSiadMonthBlockedModalOpen] = useState(false);
  const [externoGapMissingDates, setExternoGapMissingDates] = useState<Date[] | null>(null);
  const [externoMonthBlockedModalOpen, setExternoMonthBlockedModalOpen] = useState(false);
  /**
   * Nomes legados dos modais de confirmação em lote (substituídos por `siadGapMissingDates` / `externoGapMissingDates`).
   * Mantidos como `false` para evitar ReferenceError se alguma referência antiga ou HMR stale ainda existir.
   */
  const siadBatchModalOpen = false;
  const externoBatchModalOpen = false;
  void siadBatchModalOpen;
  void externoBatchModalOpen;
  const [cadastroSuccessModalOpen, setCadastroSuccessModalOpen] = useState(false);
  const [cadastroSuccessModalDescription, setCadastroSuccessModalDescription] = useState("");
  const cadastroSuccessNavigateTabRef = useRef<"Saídas Administrativas" | "Saídas de Ambulância" | null>(null);
  const cadastroSuccessFilterDatePtBrRef = useRef<string | null>(null);

  useEffect(() => {
    if (useCloudLocations) {
      // Modo estrito Firebase: ignora hidratação inicial por cache local.
      setCustomLocationsHydrated(true);
      return;
    }
    void idbGetJson<unknown>(CUSTOM_LOCATIONS_STORAGE_KEY).then((stored) => {
      setCustomLocations(normalizeCustomLocations(stored));
      setCustomLocationsHydrated(true);
    });
  }, [useCloudLocations]);

  useEffect(() => {
    if (!customLocationsHydrated) return;
    void idbSetJson(CUSTOM_LOCATIONS_STORAGE_KEY, customLocations);
  }, [customLocations, customLocationsHydrated]);

  useEffect(() => {
    if (!customLocationsHydrated || !useCloudLocations) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.customLocations,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              customLocationsRemoteRef.current = true;
              setCustomLocations(normalizeCustomLocations(payload));
            })();
          },
          (err) => console.error("[SOT] Firestore cidades/bairros extras:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (cidades extras):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [customLocationsHydrated, useCloudLocations]);

  useEffect(() => {
    if (!customLocationsHydrated || !useCloudLocations) return;
    if (customLocationsRemoteRef.current) {
      customLocationsRemoteRef.current = false;
      return;
    }
    void setSotStateDoc(SOT_STATE_DOC.customLocations, customLocations).catch((e) => {
      console.error("[SOT] Gravar cidades/bairros extras na nuvem:", e);
    });
  }, [customLocations, customLocationsHydrated, useCloudLocations]);

  useLayoutEffect(() => {
    if (editIntentVersion === 0) return;
    if (editIntentVersion === lastAppliedEditVersion.current) return;
    if (!pendingEditDepartureId) return;
    setEditHydrating(true);
  }, [editIntentVersion, pendingEditDepartureId]);

  useEffect(() => {
    if (editIntentVersion === 0) return;
    if (editIntentVersion === lastAppliedEditVersion.current) return;
    if (!pendingEditDepartureId) return;

    const record = departures.find((d) => d.id === pendingEditDepartureId);
    if (!record) {
      clearPendingEditDeparture();
      setEditHydrating(false);
      return;
    }

    const frame = requestAnimationFrame(() => {
      applyDepartureRecordToForm(record, {
        setDepartureType,
        setRequestDate,
        setRequestTime,
        setDepartureDate,
        setDepartureTime,
        setSector,
        setExtension,
        setDepartureObjective,
        setPassengerCount,
        setRequestResponsible,
        setOm,
        setVehicles,
        setDrivers,
        setDestinationHospital,
        setKmDeparture,
        setKmArrival,
        setArrivalTime,
        setCity,
        setNeighborhood,
        setTipoSaidaInterHospitalar,
        setTipoSaidaAlta,
        setTipoSaidaOutros,
      });
      setEditingId(record.id);
      if (editConflictInfo?.id === record.id) {
        applyDeparturePayloadToForm(editConflictInfo.payload, {
          setDepartureType,
          setRequestDate,
          setRequestTime,
          setDepartureDate,
          setDepartureTime,
          setSector,
          setExtension,
          setDepartureObjective,
          setPassengerCount,
          setRequestResponsible,
          setOm,
          setVehicles,
          setDrivers,
          setDestinationHospital,
          setKmDeparture,
          setKmArrival,
          setArrivalTime,
          setCity,
          setNeighborhood,
          setTipoSaidaInterHospitalar,
          setTipoSaidaAlta,
          setTipoSaidaOutros,
        });
        setEditConflictInfo(null);
      }
      setActiveSubTab("Cadastrar Nova Saída");
      lastAppliedEditVersion.current = editIntentVersion;
      clearPendingEditDeparture();
      setEditHydrating(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [editIntentVersion, pendingEditDepartureId, departures, clearPendingEditDeparture, editConflictInfo]);

  const allCityNames = useMemo(() => {
    const s = new Set<string>([...metroRioCities, ...customLocations.extraCities]);
    for (const k of Object.keys(customLocations.extraNeighborhoodsByCity)) {
      s.add(k);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [customLocations]);

  const mergedNeighborhoodsByCity = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const c of allCityNames) {
      const ibge = IBGE_BAIRROS_POR_CIDADE[c] ?? [];
      const extra = customLocations.extraNeighborhoodsByCity[c] ?? [];
      result[c] = mergeUniqueSorted(ibge, extra);
    }
    return result;
  }, [allCityNames, customLocations.extraNeighborhoodsByCity]);

  const cityNeighborhoods = useMemo(
    () => mergedNeighborhoodsByCity[city] ?? [],
    [city, mergedNeighborhoodsByCity],
  );

  /** Permite edição de registro cujo bairro ainda não está na lista. */
  const bairroSelectOptions = useMemo(() => {
    const list = cityNeighborhoods;
    const n = neighborhood.trim();
    if (n && !list.some((x) => x.toLowerCase() === n.toLowerCase())) {
      return [neighborhood, ...list];
    }
    return list;
  }, [cityNeighborhoods, neighborhood]);

  const viaturasAdminDisponiveis = useMemo(
    () => catalogItems.viaturasAdministrativas.filter((p) => !estaNaOficina(p)),
    [catalogItems.viaturasAdministrativas, estaNaOficina],
  );

  const viaturasAmbDisponiveis = useMemo(
    () => catalogItems.ambulancias.filter((p) => !estaNaOficina(p)),
    [catalogItems.ambulancias, estaNaOficina],
  );

  const mergedViaturasCatalog = useMemo(
    () =>
      mergeViaturasCatalog({
        ...catalogItems,
        viaturasAdministrativas: viaturasAdminDisponiveis,
        ambulancias: viaturasAmbDisponiveis,
      }),
    [catalogItems, viaturasAdminDisponiveis, viaturasAmbDisponiveis],
  );

  /** Evita a mesma placa em dois grupos do select (cadastro duplicado por engano). */
  const ambulanciaOptionsForSelect = useMemo(() => {
    const admin = new Set(
      viaturasAdminDisponiveis.map((x) => x.trim().toLowerCase()).filter(Boolean),
    );
    return viaturasAmbDisponiveis.filter((x) => !admin.has(x.trim().toLowerCase()));
  }, [viaturasAdminDisponiveis, viaturasAmbDisponiveis]);

  /** Administrativa: todas disponíveis; Ambulância: só ambulâncias disponíveis (fora da oficina). */
  const viaturasCatalogForCurrentTipo = useMemo(() => {
    if (departureType === "Ambulância") return viaturasAmbDisponiveis;
    return mergedViaturasCatalog;
  }, [departureType, mergedViaturasCatalog, viaturasAmbDisponiveis]);

  const viaturaSelectHasOptions =
    departureType === "Ambulância"
      ? viaturasAmbDisponiveis.length > 0
      : mergedViaturasCatalog.length > 0;

  /** Valor da saída ainda não cadastrado na lista aplicável ao tipo (ex.: edição antiga). */
  const orphanViatura = useMemo(() => {
    const v = vehicles.trim();
    if (!v) return false;
    return !isValueInCatalog(v, viaturasCatalogForCurrentTipo);
  }, [vehicles, viaturasCatalogForCurrentTipo]);

  /** Ao mudar para Ambulância com catálogo de ambulâncias, remove viatura que não seja ambulância. */
  useEffect(() => {
    if (departureType !== "Ambulância") return;
    if (catalogItems.ambulancias.length === 0) return;
    setVehicles((prev) => {
      const v = prev.trim();
      if (!v) return prev;
      if (isValueInCatalog(v, catalogItems.ambulancias)) return prev;
      return "";
    });
  }, [departureType, catalogItems.ambulancias]);

  /** Viatura na oficina (entrada sem saída) não pode ser usada em nova saída. */
  useEffect(() => {
    const v = vehicles.trim();
    if (!v) return;
    if (estaNaOficina(v)) setVehicles("");
  }, [vehicles, estaNaOficina]);

  const motoristaSelectOptions = useMemo(() => {
    const list = [...catalogItems.motoristas];
    const m = drivers.trim();
    if (m && !list.some((x) => x.toLowerCase() === m.toLowerCase())) {
      list.unshift(drivers);
    }
    return list;
  }, [catalogItems.motoristas, drivers]);

  const catalogBlockingLabels = useMemo(() => {
    const f: string[] = [];
    if (!isValueInCatalog(sector, catalogItems.setores)) f.push("Setor");
    if (!isValueInCatalog(requestResponsible, catalogItems.responsaveis)) {
      f.push("Responsável pelo Pedido");
    }
    if (departureType === "Administrativa" && !isValueInCatalog(om, catalogItems.oms)) {
      f.push("OM");
    }
    if (
      departureType === "Ambulância" &&
      !isValueInCatalog(destinationHospital, catalogItems.hospitais)
    ) {
      f.push("Hospital");
    }
    {
      const v = vehicles.trim();
      if (v && estaNaOficina(v)) f.push("Viaturas");
      else if (viaturasCatalogForCurrentTipo.length > 0) {
        if (!v || !isValueInCatalog(v, viaturasCatalogForCurrentTipo)) f.push("Viaturas");
      }
    }
    if (catalogItems.motoristas.length > 0) {
      const m = drivers.trim();
      if (!m || !isValueInCatalog(m, catalogItems.motoristas)) f.push("Motoristas");
    }
    return f;
  }, [
    sector,
    requestResponsible,
    om,
    destinationHospital,
    departureType,
    vehicles,
    drivers,
    catalogItems.setores,
    catalogItems.responsaveis,
    catalogItems.oms,
    catalogItems.hospitais,
    viaturasCatalogForCurrentTipo,
    catalogItems.motoristas,
    estaNaOficina,
  ]);

  const canSubmitWithCatalog = catalogBlockingLabels.length === 0;

  useEffect(() => {
    if (canSubmitWithCatalog) {
      setCatalogSubmitAttempted(false);
    }
  }, [canSubmitWithCatalog]);

  useEffect(() => {
    if (editingId) {
      setSeriesSelectedDates([]);
      setSeriesCalendarOpen(false);
    }
  }, [editingId]);

  useEffect(() => {
    if (!cadastroSuccessModalOpen) return;
    const id = window.setTimeout(() => {
      const tab = cadastroSuccessNavigateTabRef.current;
      const filterPtBr = cadastroSuccessFilterDatePtBrRef.current;
      cadastroSuccessNavigateTabRef.current = null;
      cadastroSuccessFilterDatePtBrRef.current = null;
      const filterOk = filterPtBr && isCompleteDatePtBr(filterPtBr) ? filterPtBr : null;
      if (filterOk) {
        stashDeparturesListFilterFromCadastro(filterOk);
      }
      flushSync(() => {
        setCadastroSuccessModalOpen(false);
        if (tab) {
          if (filterOk) {
            setPendingDeparturesFilterDatePtBr(filterOk);
            bumpDeparturesListMountKey();
          }
          setMainAppTab(tab);
        }
      });
    }, 2000);
    return () => window.clearTimeout(id);
  }, [cadastroSuccessModalOpen, setMainAppTab, setPendingDeparturesFilterDatePtBr, bumpDeparturesListMountKey]);

  function buildDeparturePayload(): Omit<DepartureRecord, "id" | "createdAt"> {
    const base: Omit<DepartureRecord, "id" | "createdAt"> = {
      tipo: departureType as DepartureRecord["tipo"],
      dataPedido: requestDate,
      horaPedido: requestTime,
      dataSaida: departureDate,
      horaSaida: departureTime,
      setor: sector,
      ramal: extension,
      objetivoSaida: departureObjective,
      numeroPassageiros: passengerCount,
      responsavelPedido: requestResponsible,
      om: departureType === "Administrativa" ? om : "",
      viaturas: vehicles,
      motoristas: drivers,
      hospitalDestino: destinationHospital,
      tipoSaidaInterHospitalar: departureType === "Ambulância" && tipoSaidaInterHospitalar,
      tipoSaidaAlta: departureType === "Ambulância" && tipoSaidaAlta,
      tipoSaidaOutros: departureType === "Ambulância" && tipoSaidaOutros,
      kmSaida: kmDeparture,
      kmChegada: kmArrival,
      chegada: arrivalTime,
      cidade: city,
      bairro: neighborhood,
      rubrica: "",
      cancelada: false,
      ocorrencias: "",
    };
    if (editingId) {
      const prev = departures.find((d) => d.id === editingId);
      if (prev) {
        return {
          ...base,
          rubrica: prev.rubrica,
          cancelada: prev.cancelada,
          ocorrencias: prev.ocorrencias,
        };
      }
    }
    return base;
  }

  function handleConfirmarCancelamentoCadastro(departureId: string, nome: string) {
    const d = departures.find((x) => x.id === departureId);
    if (!d) return;
    const { id, createdAt, ...rest } = d;
    void id;
    void createdAt;
    updateDeparture(departureId, {
      ...rest,
      cancelada: true,
      rubrica: nome.trim(),
    });
  }

  function handleCadastrarSaida() {
    if (!canSubmitWithCatalog) {
      setCatalogSubmitAttempted(true);
      return;
    }
    setCatalogSubmitAttempted(false);
    const payload = buildDeparturePayload();
    if (editingId) {
      const editingTargetId = editingId;
      // Versão esperada: a do estado atual em `updateDeparture` (prev), não a do início da edição —
      // senão qualquer sync/cloud entre abrir o formulário e gravar gera falso conflito.
      updateDeparture(editingTargetId, payload, {
        onVersionConflict: () => {
          setEditConflictInfo({
            id: editingTargetId,
            payload,
          });
        },
      });
      setEditingId(null);
      {
        const ds = dataSaidaToListFilterPtBr(payload.dataSaida);
        if (ds) {
          stashDeparturesListFilterFromCadastro(ds);
          setPendingDeparturesFilterDatePtBr(ds);
          bumpDeparturesListMountKey();
        }
      }
      setMainAppTab(mainListTabForDepartureTipo(departureType));
      return;
    }
    if (seriesSelectedDates.length > 0) {
      const dates = uniqueSortedSeriesDates(seriesSelectedDates);
      const base = buildDeparturePayload();
      for (const d of dates) {
        addDeparture({ ...base, dataSaida: formatDateToPtBr(d) });
      }
      setSeriesSelectedDates([]);
      setSeriesCalendarOpen(false);
      cadastroSuccessNavigateTabRef.current = mainListTabForDepartureTipo(departureType);
      cadastroSuccessFilterDatePtBrRef.current =
        dates.length > 0 ? formatDateToPtBr(dates[dates.length - 1]) : null;
      setCadastroSuccessModalDescription(
        dates.length === 1 ? "A saída foi cadastrada." : `${dates.length} saídas foram cadastradas.`,
      );
      setCadastroSuccessModalOpen(true);
      return;
    }
    addDeparture(payload);
    cadastroSuccessNavigateTabRef.current = mainListTabForDepartureTipo(departureType);
    cadastroSuccessFilterDatePtBrRef.current = dataSaidaToListFilterPtBr(payload.dataSaida);
    setCadastroSuccessModalDescription("A saída foi cadastrada.");
    setCadastroSuccessModalOpen(true);
  }

  /** Cadastra como “Cadastrar Saída”, mantém o formulário e só reinicia Cidade/Bairro para novo destino. */
  function handleCadastrarMultiplosDestinos() {
    if (editingId) return;
    if (!canSubmitWithCatalog) {
      setCatalogSubmitAttempted(true);
      return;
    }
    setCatalogSubmitAttempted(false);
    addDeparture(buildDeparturePayload());
    setSeriesSelectedDates([]);
    setSeriesCalendarOpen(false);
    setCity("Rio de Janeiro");
    setNeighborhood(IBGE_BAIRROS_POR_CIDADE["Rio de Janeiro"]?.[0] ?? "");
    cadastroSuccessNavigateTabRef.current = null;
    cadastroSuccessFilterDatePtBrRef.current = null;
    setCadastroSuccessModalDescription(
      "A saída foi cadastrada. Cidade e bairro foram reiniciados para o próximo destino.",
    );
    setCadastroSuccessModalOpen(true);
  }

  function openAddCityModal() {
    setAddLocationModal({ kind: "city" });
    setAddLocationDraft("");
  }

  function openAddBairroModal() {
    if (!city.trim()) {
      window.alert("Selecione ou cadastre uma cidade antes de adicionar um bairro.");
      return;
    }
    setAddLocationModal({ kind: "bairro", cityKey: city });
    setAddLocationDraft("");
  }

  function runSiadBatchForDates(dates: Date[]) {
    if (dates.length === 0) return;
    const dataPedido = getCurrentDatePtBr();
    const horaPedido = getCurrentTime();
    addCatalogItem("setores", "SIAD");
    addCatalogItem("responsaveis", "SIAD");
    addCatalogItem("viaturasAdministrativas", "ASD");
    addCatalogItem("motoristas", "ASD");

    const base: Omit<DepartureRecord, "id" | "createdAt"> = {
      tipo: "Administrativa",
      dataPedido,
      horaPedido,
      dataSaida: "",
      horaSaida: "08:00",
      setor: "SIAD",
      ramal: "",
      objetivoSaida: "Atendimento domiciliar",
      numeroPassageiros: "2",
      responsavelPedido: "SIAD",
      om: "",
      viaturas: "ASD",
      motoristas: "ASD",
      hospitalDestino: "",
      tipoSaidaInterHospitalar: false,
      tipoSaidaAlta: false,
      tipoSaidaOutros: false,
      kmSaida: "",
      kmChegada: "",
      chegada: "",
      cidade: "ASD",
      bairro: "ASD",
      rubrica: "",
      cancelada: false,
      ocorrencias: "",
    };

    for (const d of dates) {
      addDeparture({ ...base, dataSaida: formatDateToPtBr(d) });
    }
    setSiadGapMissingDates(null);
    const firstPtBr = formatDateToPtBr(dates[0]!);
    stashDeparturesListFilterFromCadastro(firstPtBr);
    flushSync(() => {
      setPendingDeparturesFilterDatePtBr(firstPtBr);
      bumpDeparturesListMountKey();
      setMainAppTab("Saídas Administrativas");
    });
  }

  function handleConfirmSiadGapBatch() {
    if (!siadGapMissingDates || siadGapMissingDates.length === 0) {
      setSiadGapMissingDates(null);
      return;
    }
    runSiadBatchForDates(siadGapMissingDates);
  }

  function handleOpenSiadBatchClick() {
    const scope = getWeekdayDatesFromTodayThroughEndOfCurrentMonth();
    if (scope.length === 0) {
      window.alert("Não há dias úteis (segunda a sexta) restantes no mês vigente.");
      return;
    }
    const missing = getMissingSiadWeekdayDates(departures);
    if (missing.length === 0) {
      setSiadMonthBlockedModalOpen(true);
      return;
    }
    setSiadGapMissingDates(missing);
  }

  /** Sexta-feira (local): hora 08:00; demais dias úteis: 13:00. */
  function horaSaidaLoteExterno(d: Date): string {
    return d.getDay() === 5 ? "08:00" : "13:00";
  }

  function runExternoBatchForDates(dates: Date[]) {
    if (dates.length === 0) return;
    const dataPedido = getCurrentDatePtBr();
    const horaPedido = getCurrentTime();
    addCatalogItem("setores", "SECOM");
    addCatalogItem("responsaveis", "SECOM");
    addCatalogItem("oms", "1°DN");
    addCatalogItem("viaturasAdministrativas", "ASD");
    addCatalogItem("motoristas", "ASD");

    const base: Omit<DepartureRecord, "id" | "createdAt"> = {
      tipo: "Administrativa",
      dataPedido,
      horaPedido,
      dataSaida: "",
      horaSaida: "13:00",
      setor: "SECOM",
      ramal: "",
      objetivoSaida: "Externo",
      numeroPassageiros: "1",
      responsavelPedido: "SECOM",
      om: "1°DN",
      viaturas: "ASD",
      motoristas: "ASD",
      hospitalDestino: "",
      tipoSaidaInterHospitalar: false,
      tipoSaidaAlta: false,
      tipoSaidaOutros: false,
      kmSaida: "",
      kmChegada: "",
      chegada: "",
      cidade: "Rio de Janeiro",
      bairro: "Centro",
      rubrica: "",
      cancelada: false,
      ocorrencias: "",
    };

    for (const d of dates) {
      addDeparture({
        ...base,
        dataSaida: formatDateToPtBr(d),
        horaSaida: horaSaidaLoteExterno(d),
      });
    }
    setExternoGapMissingDates(null);
    const firstPtBr = formatDateToPtBr(dates[0]!);
    stashDeparturesListFilterFromCadastro(firstPtBr);
    flushSync(() => {
      setPendingDeparturesFilterDatePtBr(firstPtBr);
      bumpDeparturesListMountKey();
      setMainAppTab("Saídas Administrativas");
    });
  }

  function handleConfirmExternoGapBatch() {
    if (!externoGapMissingDates || externoGapMissingDates.length === 0) {
      setExternoGapMissingDates(null);
      return;
    }
    runExternoBatchForDates(externoGapMissingDates);
  }

  function handleOpenExternoBatchClick() {
    const scope = getWeekdayDatesFromTodayThroughEndOfCurrentMonth();
    if (scope.length === 0) {
      window.alert("Não há dias úteis (segunda a sexta) restantes no mês vigente.");
      return;
    }
    const missing = getMissingExternoBatchWeekdayDates(departures);
    if (missing.length === 0) {
      setExternoMonthBlockedModalOpen(true);
      return;
    }
    setExternoGapMissingDates(missing);
  }

  function confirmAddLocation() {
    const draft = addLocationDraft.trim();
    if (!draft || !addLocationModal) {
      setAddLocationModal(null);
      setAddLocationDraft("");
      return;
    }

    if (addLocationModal.kind === "city") {
      const existing = findCanonicalCity(draft, allCityNames);
      if (existing) {
        setCity(existing);
        setNeighborhood((mergedNeighborhoodsByCity[existing] ?? [])[0] ?? "");
      } else {
        const notInMetro = !metroRioCities.some((m) => m.toLowerCase() === draft.toLowerCase());
        setCustomLocations((prev) => ({
          extraCities: notInMetro ? mergeUniqueSorted(prev.extraCities, [draft]) : prev.extraCities,
          extraNeighborhoodsByCity: {
            ...prev.extraNeighborhoodsByCity,
            [draft]: prev.extraNeighborhoodsByCity[draft] ?? [],
          },
        }));
        setCity(draft);
        setNeighborhood("");
      }
      setAddLocationModal(null);
      setAddLocationDraft("");
      return;
    }

    const cityKey = addLocationModal.cityKey;
    const currentList = mergedNeighborhoodsByCity[cityKey] ?? [];
    const existingNb = findCanonicalString(draft, currentList);
    if (existingNb) {
      setNeighborhood(existingNb);
    } else {
      setCustomLocations((prev) => ({
        ...prev,
        extraNeighborhoodsByCity: {
          ...prev.extraNeighborhoodsByCity,
          [cityKey]: mergeUniqueSorted(prev.extraNeighborhoodsByCity[cityKey] ?? [], [draft]),
        },
      }));
      setNeighborhood(draft);
    }
    setAddLocationModal(null);
    setAddLocationDraft("");
  }

  const fillExampleDeparture = useCallback(() => {
    setEditingId(null);
    setCatalogSubmitAttempted(false);
    const hoje = getCurrentDatePtBr();
    const bairrosRj = mergedNeighborhoodsByCity["Rio de Janeiro"];
    addCatalogItem("setores", "SAMU Central");
    addCatalogItem("responsaveis", "Cap. Silva");
    addCatalogItem("hospitais", HOSPITAL_EXEMPLOS_OCULTOS_MODAL_MOBILE[0]);
    addCatalogItem("ambulancias", "AMB-01 / M-10234");
    addCatalogItem("motoristas", "Sd Santos / Sd Oliveira");
    setDepartureType("Ambulância");
    setRequestDate(hoje);
    setRequestTime("08:30");
    setDepartureDate(hoje);
    setDepartureTime("09:00");
    setSector("SAMU Central");
    setExtension("1234");
    setDepartureObjective("Transporte inter-hospitalar de paciente em estado estável");
    setPassengerCount("2");
    setRequestResponsible("Cap. Silva");
    setOm("");
    setVehicles("AMB-01 / M-10234");
    setDrivers("Sd Santos / Sd Oliveira");
    setDestinationHospital(HOSPITAL_EXEMPLOS_OCULTOS_MODAL_MOBILE[0]);
    setTipoSaidaInterHospitalar(true);
    setTipoSaidaAlta(false);
    setTipoSaidaOutros(false);
    setKmDeparture(formatKmThousandsPtBr("45230"));
    setKmArrival(formatKmThousandsPtBr("45268"));
    setArrivalTime("10:15");
    setCity("Rio de Janeiro");
    setNeighborhood(bairrosRj?.[0] ?? "");
  }, [mergedNeighborhoodsByCity, addCatalogItem]);

  return (
    <div className="space-y-4">
      <TabsList items={subTabs} active={activeSubTab} onChange={setActiveSubTab} />
      <Card>
        <CardHeader
          className={cn(
            "flex flex-row flex-wrap items-center justify-between gap-3 space-y-0",
            activeSubTab === "Cadastrar Nova Saída" && "pb-2",
          )}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="leading-none">{activeSubTab}</CardTitle>
            {activeSubTab === "Saídas Cadastradas" ? (
              <p className="text-sm font-normal text-[hsl(var(--muted-foreground))]">
                {departures.length === 1
                  ? "1 saída cadastrada"
                  : `${departures.length} saídas cadastradas`}
              </p>
            ) : null}
          </div>
          {activeSubTab === "Cadastrar Nova Saída" ? (
            <Button type="button" variant="default" size="sm" className="shrink-0" onClick={fillExampleDeparture}>
              Preencher com exemplo
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {activeSubTab === "Saídas Cadastradas" ? (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="saida-filter-viatura">
                    Viatura
                  </label>
                  <input
                    id="saida-filter-viatura"
                    type="text"
                    autoComplete="off"
                    value={saidaFiltroViatura}
                    onChange={(e) => setSaidaFiltroViatura(e.target.value)}
                    placeholder="Filtrar por viatura…"
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="saida-filter-motorista">
                    Motorista
                  </label>
                  <input
                    id="saida-filter-motorista"
                    type="text"
                    autoComplete="off"
                    value={saidaFiltroMotorista}
                    onChange={(e) => setSaidaFiltroMotorista(e.target.value)}
                    placeholder="Filtrar por motorista…"
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="saida-filter-tipo">
                    Tipo de saída
                  </label>
                  <select
                    id="saida-filter-tipo"
                    value={saidaFiltroTipo}
                    onChange={(e) => setSaidaFiltroTipo(e.target.value as "Todos" | DepartureType)}
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                  >
                    <option value="Todos">Todos</option>
                    <option value="Administrativa">Administrativa</option>
                    <option value="Ambulância">Ambulância</option>
                  </select>
                </div>

                <div className="space-y-2 md:col-span-1 md:row-span-1">
                  <label className="text-sm font-medium" htmlFor="saida-lupa-busca">
                    Lupa
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
                      aria-hidden
                    />
                    <input
                      id="saida-lupa-busca"
                      type="search"
                      autoComplete="off"
                      value={saidaLupaBusca}
                      onChange={(e) => setSaidaLupaBusca(e.target.value)}
                      placeholder="Buscar na tabela…"
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white py-2 pl-9 pr-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      aria-label="Buscar e destacar na tabela de saídas"
                    />
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">O texto é destacado em negrito.</p>
                </div>
              </div>

              <DepartureDeleteOrCancelModal
                open={deleteModalId !== null && deleteModalRecord !== null}
                onOpenChange={(o) => {
                  if (!o) setDeleteModalId(null);
                }}
                records={deleteModalRecord ? [deleteModalRecord] : null}
                onExcluirDefinitivo={removeDeparture}
                onConfirmarCancelamento={handleConfirmarCancelamentoCadastro}
              />
              <RegisteredFullDeparturesTable
                rows={saidasCadastradasFiltradas}
                emptyLabel={emptyLabelSaidasCadastradas}
                highlightTerm={saidaLupaBusca}
                onTrashClick={(id) => setDeleteModalId(id)}
                onEdit={beginEditDeparture}
              />
            </>
          ) : activeSubTab === "Cadastrar Itens" ? (
            <CatalogItemsPanel />
          ) : activeSubTab === "Cadastrar Nova Saída" ? (
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Saída</label>
                <select
                  value={departureType}
                  onChange={(event) => setDepartureType(event.target.value)}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option value="Administrativa">Administrativa</option>
                  <option value="Ambulância">Ambulância</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data do pedido</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={requestDate}
                    onChange={(event) => setRequestDate(normalizeDatePtBr(event.target.value))}
                    className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 font-mono text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  />
                  <Popover open={requestCalendarOpen} onOpenChange={setRequestCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="default"
                        size="icon"
                        translate="no"
                        className="h-10 w-10 shrink-0 rounded-xl shadow-sm transition hover:brightness-105"
                        aria-label="Abrir calendário — data do pedido"
                      >
                        <CalendarDays className="h-4 w-4 text-white" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="border-0 bg-transparent p-0 shadow-none">
                      <Calendar
                        mode="single"
                        selected={parsePtBrToDate(requestDate)}
                        defaultMonth={parsePtBrToDate(requestDate) ?? new Date()}
                        onSelect={(d) => {
                          setRequestDate(d ? formatDateToPtBr(d) : "");
                          setRequestCalendarOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Hora do pedido</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={requestTime}
                  onChange={(event) => setRequestTime(normalize24hTime(event.target.value))}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data da Saída</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={departureDate}
                    onChange={(event) => setDepartureDate(normalizeDatePtBr(event.target.value))}
                    className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 font-mono text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  />
                  <Popover open={departureCalendarOpen} onOpenChange={setDepartureCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="default"
                        size="icon"
                        translate="no"
                        className="h-10 w-10 shrink-0 rounded-xl shadow-sm transition hover:brightness-105"
                        aria-label="Abrir calendário — data da saída"
                      >
                        <CalendarDays className="h-4 w-4 text-white" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="border-0 bg-transparent p-0 shadow-none">
                      <Calendar
                        mode="single"
                        selected={parsePtBrToDate(departureDate)}
                        defaultMonth={parsePtBrToDate(departureDate) ?? new Date()}
                        onSelect={(d) => {
                          setDepartureDate(d ? formatDateToPtBr(d) : "");
                          setDepartureCalendarOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Hora da Saída</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={departureTime}
                  onChange={(event) => setDepartureTime(normalize24hTime(event.target.value))}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <CatalogComboField
                id="field-setor"
                label="Setor"
                category="setores"
                value={sector}
                onChange={setSector}
                options={catalogItems.setores}
                showPlusAfterAttempt={catalogSubmitAttempted}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">Objetivo da Saída</label>
                <input
                  type="text"
                  value={departureObjective}
                  onChange={(event) => setDepartureObjective(event.target.value)}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Número de passageiros</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={passengerCount}
                  onChange={(event) => setPassengerCount(event.target.value.replace(/\D/g, ""))}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <CatalogComboField
                id="field-responsavel"
                label="Responsável pelo Pedido"
                category="responsaveis"
                value={requestResponsible}
                onChange={setRequestResponsible}
                options={catalogItems.responsaveis}
                showPlusAfterAttempt={catalogSubmitAttempted}
              />

              {departureType === "Administrativa" ? (
                <CatalogComboField
                  id="field-om"
                  label="OM"
                  category="oms"
                  value={om}
                  onChange={setOm}
                  options={catalogItems.oms}
                  showPlusAfterAttempt={catalogSubmitAttempted}
                />
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="field-viaturas">
                  Viaturas
                </label>
                {viaturaSelectHasOptions ? (
                  <>
                    <select
                      id="field-viaturas"
                      value={vehicles}
                      onChange={(event) => setVehicles(event.target.value)}
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    >
                      <option value="">—</option>
                      {orphanViatura ? (
                        <option value={vehicles}>{vehicles}</option>
                      ) : null}
                      {departureType === "Administrativa" ? (
                        <>
                          {viaturasAdminDisponiveis.length > 0 ? (
                            <optgroup label="Viaturas administrativas">
                              {viaturasAdminDisponiveis.map((v) => (
                                <option key={`adm-${v}`} value={v}>
                                  {v}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          {ambulanciaOptionsForSelect.length > 0 ? (
                            <optgroup label="Ambulâncias">
                              {ambulanciaOptionsForSelect.map((v) => (
                                <option key={`amb-${v}`} value={v}>
                                  {v}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </>
                      ) : (
                        <optgroup label="Ambulâncias">
                          {viaturasAmbDisponiveis.map((v) => (
                            <option key={`amb-${v}`} value={v}>
                              {v}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </>
                ) : (
                  <input
                    id="field-viaturas"
                    type="text"
                    value={vehicles}
                    onChange={(event) => setVehicles(event.target.value)}
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="field-motoristas">
                  Motoristas
                </label>
                {catalogItems.motoristas.length > 0 ? (
                  <select
                    id="field-motoristas"
                    value={drivers}
                    onChange={(event) => setDrivers(event.target.value)}
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                  >
                    <option value="">—</option>
                    {motoristaSelectOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="field-motoristas"
                    type="text"
                    value={drivers}
                    onChange={(event) => setDrivers(event.target.value)}
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                  />
                )}
              </div>

              {departureType === "Ambulância" ? (
                <>
                  <CatalogComboField
                    id="field-hospital"
                    label="Hospital"
                    category="hospitais"
                    value={destinationHospital}
                    onChange={setDestinationHospital}
                    options={catalogItems.hospitais}
                    showPlusAfterAttempt={catalogSubmitAttempted}
                  />

                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium">Tipo de saída (ambulância)</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={tipoSaidaInterHospitalar}
                          onChange={(e) => setTipoSaidaInterHospitalar(e.target.checked)}
                          className="h-4 w-4 rounded border-[hsl(var(--border))]"
                        />
                        Inter-Hospitalar
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={tipoSaidaAlta}
                          onChange={(e) => setTipoSaidaAlta(e.target.checked)}
                          className="h-4 w-4 rounded border-[hsl(var(--border))]"
                        />
                        Alta
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={tipoSaidaOutros}
                          onChange={(e) => setTipoSaidaOutros(e.target.checked)}
                          className="h-4 w-4 rounded border-[hsl(var(--border))]"
                        />
                        Outros
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">KM SAÍDA</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={kmDeparture}
                      onChange={(event) => setKmDeparture(formatKmThousandsPtBr(event.target.value))}
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">KM CHEGADA</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={kmArrival}
                      onChange={(event) => setKmArrival(formatKmThousandsPtBr(event.target.value))}
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">CHEGADA</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={arrivalTime}
                      onChange={(event) => setArrivalTime(normalize24hTime(event.target.value))}
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium">Ramal</label>
                <input
                  type="text"
                  value={extension}
                  onChange={(event) => setExtension(event.target.value.replace(/[A-Za-zÀ-ÿ]/g, ""))}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="field-cidade">
                  Cidade
                </label>
                <select
                  id="field-cidade"
                  value={city}
                  title="Duplo clique para adicionar cidade"
                  onChange={(event) => {
                    const selectedCity = event.target.value;
                    setCity(selectedCity);
                    setNeighborhood((mergedNeighborhoodsByCity[selectedCity] ?? [])[0] ?? "");
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    openAddCityModal();
                  }}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                >
                  {allCityNames.map((metroCity) => (
                    <option key={metroCity} value={metroCity}>
                      {metroCity}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="field-bairro">
                  Bairro
                </label>
                <select
                  id="field-bairro"
                  value={neighborhood}
                  title="Duplo clique para adicionar bairro"
                  onChange={(event) => setNeighborhood(event.target.value)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    openAddBairroModal();
                  }}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                >
                  {bairroSelectOptions.length > 0 ? (
                    bairroSelectOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))
                  ) : (
                    <option value="">—</option>
                  )}
                </select>
              </div>

              <div className="col-span-full mt-2 space-y-3 border-t border-slate-200 pt-4">
                {catalogSubmitAttempted && !canSubmitWithCatalog ? (
                  <p className="text-sm text-red-800 dark:text-red-300/90" role="alert">
                    Cadastro bloqueado: ajuste os campos{" "}
                    <strong>{catalogBlockingLabels.join(", ")}</strong>. Para Setor, Responsável
                    {departureType === "Administrativa" ? ", OM" : ""}
                    {departureType === "Ambulância" ? ", Hospital" : ""}, inclua o valor em{" "}
                    <strong>Cadastrar Itens</strong> (botão <strong>+</strong>). Para{" "}
                    <strong>Viaturas</strong> e <strong>Motoristas</strong>, cadastre em <strong>Frota e Pessoal</strong>{" "}
                    e selecione de novo.
                  </p>
                ) : null}
                {editConflictInfo ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    Esta saída foi alterada em outro dispositivo. Recarregue os dados da nuvem e reaplique a sua edição.
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => {
                          forceCloudResync();
                          beginEditDeparture(editConflictInfo.id);
                        }}
                      >
                        Recarregar e reaplicar edição
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => setEditConflictInfo(null)}
                      >
                        Ignorar
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="min-w-[5.5rem]"
                    onClick={handleOpenSiadBatchClick}
                  >
                    SIAD
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="min-w-[5.5rem]"
                    onClick={handleOpenExternoBatchClick}
                  >
                    Externo
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                <Button type="button" variant="default" onClick={handleCadastrarSaida}>
                  {editingId
                    ? "Atualizar saída"
                    : seriesSelectedDates.length > 0
                      ? "Cadastrar Saídas em Série"
                      : "Cadastrar Saída"}
                </Button>
                <Popover open={seriesCalendarOpen} onOpenChange={setSeriesCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="default"
                      disabled={Boolean(editingId)}
                      aria-expanded={seriesCalendarOpen}
                      aria-haspopup="dialog"
                      aria-label="Cadastrar em série — abrir calendário para várias datas"
                    >
                      Cadastrar em Série
                      {seriesSelectedDates.length > 0 ? (
                        <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-medium text-white">
                          {seriesSelectedDates.length}
                        </span>
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-auto max-w-[calc(100vw-1.5rem)] border-0 bg-transparent p-0 shadow-none"
                  >
                    <div className="flex flex-col gap-2">
                      <Calendar
                        mode="multiple"
                        selected={seriesSelectedDates}
                        defaultMonth={seriesSelectedDates[0] ?? parsePtBrToDate(departureDate) ?? new Date()}
                        onSelect={(d) => setSeriesSelectedDates(d ?? [])}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 shadow-sm">
                        <p className="max-w-[14rem] text-xs text-[hsl(var(--muted-foreground))]">
                          Toque ou clique nos dias para marcar várias datas. Cada data gera um cadastro com a mesma
                          informação e <span className="font-medium text-[hsl(var(--foreground))]">data da saída</span>{" "}
                          correspondente.
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={() => setSeriesSelectedDates([])}
                          >
                            Limpar
                          </Button>
                          <Button type="button" variant="default" size="sm" onClick={() => setSeriesCalendarOpen(false)}>
                            Pronto
                          </Button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="default"
                  disabled={Boolean(editingId)}
                  onClick={handleCadastrarMultiplosDestinos}
                  aria-label="Cadastrar saída e manter dados; limpar cidade e bairro para outro destino"
                >
                  Cadastrar Múltiplos Destinos
                </Button>
                </div>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-dashed bg-[hsl(var(--muted))] p-8 text-sm text-slate-500">
              Nenhum conteúdo cadastrado para esta sub aba.
            </div>
          )}
        </CardContent>
      </Card>

      {siadMonthBlockedModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="siad-month-blocked-dialog-title"
          aria-describedby="siad-month-blocked-dialog-desc"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSiadMonthBlockedModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border-2 border-red-600 bg-red-50 p-4 shadow-lg dark:border-red-500 dark:bg-red-950/60">
            <h2
              id="siad-month-blocked-dialog-title"
              className="text-base font-semibold text-red-900 dark:text-red-100"
            >
              Lote SIAD indisponível
            </h2>
            <p
              id="siad-month-blocked-dialog-desc"
              className="mt-3 text-sm leading-relaxed text-red-800 dark:text-red-100/90"
            >
              Todos os <strong>dias úteis</strong> (segunda a sexta-feira), <strong>de hoje até o fim do mês vigente</strong>
              , já possuem saída com setor <strong>SIAD</strong> cadastrada para a data da saída correspondente.
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="default" onClick={() => setSiadMonthBlockedModalOpen(false)}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {externoMonthBlockedModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="externo-month-blocked-dialog-title"
          aria-describedby="externo-month-blocked-dialog-desc"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setExternoMonthBlockedModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border-2 border-red-600 bg-red-50 p-4 shadow-lg dark:border-red-500 dark:bg-red-950/60">
            <h2
              id="externo-month-blocked-dialog-title"
              className="text-base font-semibold text-red-900 dark:text-red-100"
            >
              Lote Externo (SECOM) indisponível
            </h2>
            <p
              id="externo-month-blocked-dialog-desc"
              className="mt-3 text-sm leading-relaxed text-red-800 dark:text-red-100/90"
            >
              Todos os <strong>dias úteis</strong> (segunda a sexta-feira), <strong>de hoje até o fim do mês vigente</strong>
              , já possuem saída do lote <strong>Externo</strong> (setor <strong>SECOM</strong> e objetivo{" "}
              <strong>Externo</strong>) cadastrada para a data da saída correspondente.
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="default" onClick={() => setExternoMonthBlockedModalOpen(false)}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {siadGapMissingDates && siadGapMissingDates.length > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="siad-gap-dialog-title"
          aria-describedby="siad-gap-dialog-desc"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSiadGapMissingDates(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-lg">
            <h2
              id="siad-gap-dialog-title"
              className="text-base font-semibold text-[hsl(var(--foreground))]"
            >
              Dias úteis sem saída SIAD
            </h2>
            <p id="siad-gap-dialog-desc" className="mt-3 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              Os dias abaixo (segunda a sexta, de hoje até o fim do mês vigente) ainda{" "}
              <strong>não possuem</strong> saída com setor <strong>SIAD</strong> cadastrada para a data da saída. Será
              usado o padrão do lote SIAD: saída às <strong>08:00</strong>, objetivo <strong>Atendimento domiciliar</strong>
              , passageiros <strong>2</strong>, responsável <strong>SIAD</strong>, viatura e motorista{" "}
              <strong>ASD</strong>, cidade e bairro <strong>ASD</strong>.
            </p>
            <ul className="mt-3 max-h-[40vh] list-inside list-disc space-y-1 overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-sm text-[hsl(var(--foreground))]">
              {siadGapMissingDates.map((d) => (
                <li key={d.getTime()}>{formatWeekdayCommaDatePtBr(d)}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[hsl(var(--foreground))]">
              Deseja <strong>cadastrar</strong> as saídas SIAD apenas para esses dias?
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="default" onClick={() => setSiadGapMissingDates(null)}>
                Não
              </Button>
              <Button type="button" variant="default" onClick={handleConfirmSiadGapBatch}>
                Cadastrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {externoGapMissingDates && externoGapMissingDates.length > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="externo-gap-dialog-title"
          aria-describedby="externo-gap-dialog-desc"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setExternoGapMissingDates(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-lg">
            <h2
              id="externo-gap-dialog-title"
              className="text-base font-semibold text-[hsl(var(--foreground))]"
            >
              Dias úteis sem saída Externo (SECOM)
            </h2>
            <p id="externo-gap-dialog-desc" className="mt-3 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              Os dias abaixo ainda <strong>não possuem</strong> saída do lote <strong>Externo</strong> (setor{" "}
              <strong>SECOM</strong>, objetivo <strong>Externo</strong>). Horário: <strong>13:00</strong> (sexta-feira{" "}
              <strong>08:00</strong>); <strong>1</strong> passageiro; OM <strong>1°DN</strong>; viatura e motorista{" "}
              <strong>ASD</strong>; <strong>Rio de Janeiro</strong> — <strong>Centro</strong>.
            </p>
            <ul className="mt-3 max-h-[40vh] list-inside list-disc space-y-1 overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-sm text-[hsl(var(--foreground))]">
              {externoGapMissingDates.map((d) => (
                <li key={d.getTime()}>{formatWeekdayCommaDatePtBr(d)}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[hsl(var(--foreground))]">
              Deseja <strong>cadastrar</strong> as saídas apenas para esses dias?
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="default" onClick={() => setExternoGapMissingDates(null)}>
                Não
              </Button>
              <Button type="button" variant="default" onClick={handleConfirmExternoGapBatch}>
                Cadastrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {addLocationModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-location-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAddLocationModal(null);
              setAddLocationDraft("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-lg">
            <h2
              id="add-location-dialog-title"
              className="text-base font-semibold text-[hsl(var(--foreground))]"
            >
              {addLocationModal.kind === "city" ? "Nova cidade" : "Novo bairro"}
            </h2>
            {addLocationModal.kind === "bairro" ? (
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Cidade: <strong>{addLocationModal.cityKey}</strong>
              </p>
            ) : null}
            <input
              type="text"
              autoFocus
              value={addLocationDraft}
              onChange={(e) => setAddLocationDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmAddLocation();
                }
                if (e.key === "Escape") {
                  setAddLocationModal(null);
                  setAddLocationDraft("");
                }
              }}
              placeholder={addLocationModal.kind === "city" ? "Nome da cidade" : "Nome do bairro"}
              className="mt-3 h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  setAddLocationModal(null);
                  setAddLocationDraft("");
                }}
              >
                Cancelar
              </Button>
              <Button type="button" variant="default" onClick={confirmAddLocation}>
                Adicionar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cadastroSuccessModalOpen ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cadastro-success-title"
          aria-describedby="cadastro-success-desc"
          aria-live="polite"
        >
          <div className="w-full max-w-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-5 text-center shadow-lg">
            <CheckCircle2
              className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400"
              strokeWidth={2}
              aria-hidden
            />
            <h2
              id="cadastro-success-title"
              className="mt-3 text-lg font-semibold text-[hsl(var(--foreground))]"
            >
              Cadastrado com sucesso
            </h2>
            <p id="cadastro-success-desc" className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {cadastroSuccessModalDescription}
            </p>
          </div>
        </div>
      ) : null}

      {editHydrating ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-8 py-6 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--primary))]" aria-hidden />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando dados da saída…</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
