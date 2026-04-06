import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { CalendarDays, Loader2 } from "lucide-react";
import {
  isValueInCatalog,
  mergeViaturasCatalog,
  useCatalogItems,
} from "../context/catalog-items-context";
import { useAppTab } from "../context/app-tab-context";
import { useDepartures } from "../context/departures-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import {
  CUSTOM_LOCATIONS_STORAGE_KEY,
  emptyCustomLocations,
  findCanonicalCity,
  findCanonicalString,
  mergeUniqueSorted,
  normalizeCustomLocations,
  type CustomLocationsState,
} from "../lib/customLocationsStorage";
import { formatDateToPtBr, getCurrentDatePtBr, normalizeDatePtBr, parsePtBrToDate } from "../lib/dateFormat";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { normalize24hTime } from "../lib/timeInput";
import { cn } from "../lib/utils";
import type { DepartureRecord } from "../types/departure";
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
  } = useDepartures();
  const { setActiveTab: setMainAppTab } = useAppTab();
  const { items: catalogItems, addItem: addCatalogItem } = useCatalogItems();
  const { estaNaOficina } = useOficinaVisitas();
  const [activeSubTab, setActiveSubTab] = useState<string>(subTabs[0]);
  /** Após clicar em Cadastrar Saída com itens fora do catálogo; exibe o + piscando. */
  const [catalogSubmitAttempted, setCatalogSubmitAttempted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const useCloudLocations = isFirebaseConfigured();
  /** Duplo clique em Cidade/Bairro: modal para novo item. */
  const [addLocationModal, setAddLocationModal] = useState<
    null | { kind: "city" } | { kind: "bairro"; cityKey: string }
  >(null);
  const [addLocationDraft, setAddLocationDraft] = useState("");

  useEffect(() => {
    void idbGetJson<unknown>(CUSTOM_LOCATIONS_STORAGE_KEY).then((stored) => {
      setCustomLocations(normalizeCustomLocations(stored));
      setCustomLocationsHydrated(true);
    });
  }, []);

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
                const raw = await idbGetJson<unknown>(CUSTOM_LOCATIONS_STORAGE_KEY);
                const n = normalizeCustomLocations(raw);
                if (
                  n.extraCities.length > 0 ||
                  Object.keys(n.extraNeighborhoodsByCity).length > 0
                ) {
                  await setSotStateDoc(SOT_STATE_DOC.customLocations, n);
                }
                return;
              }
              customLocationsRemoteRef.current = true;
              setCustomLocations(normalizeCustomLocations(payload));
            })();
          },
          (err) => console.error("[SOT] Firestore cidades/bairros extras:", err),
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
      });
      setEditingId(record.id);
      setActiveSubTab("Cadastrar Nova Saída");
      lastAppliedEditVersion.current = editIntentVersion;
      clearPendingEditDeparture();
      setEditHydrating(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [editIntentVersion, pendingEditDepartureId, departures, clearPendingEditDeparture]);

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
    if (!isValueInCatalog(om, catalogItems.oms)) f.push("OM");
    if (
      departureType === "Ambulância" &&
      !isValueInCatalog(destinationHospital, catalogItems.hospitais)
    ) {
      f.push("Hospital de Destino");
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
      om,
      viaturas: vehicles,
      motoristas: drivers,
      hospitalDestino: destinationHospital,
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
      updateDeparture(editingId, payload);
      setEditingId(null);
    } else {
      addDeparture(payload);
    }
    setMainAppTab(mainListTabForDepartureTipo(departureType));
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
    addCatalogItem("oms", "1º BPM");
    addCatalogItem("hospitais", "Hospital Municipal Souza Aguiar");
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
    setOm("1º BPM");
    setVehicles("AMB-01 / M-10234");
    setDrivers("Sd Santos / Sd Oliveira");
    setDestinationHospital("Hospital Municipal Souza Aguiar");
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
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={fillExampleDeparture}>
              Preencher com exemplo
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {activeSubTab === "Saídas Cadastradas" ? (
            <>
              <DepartureDeleteOrCancelModal
                open={deleteModalId !== null && deleteModalRecord !== null}
                onOpenChange={(o) => {
                  if (!o) setDeleteModalId(null);
                }}
                record={deleteModalRecord}
                onExcluirDefinitivo={removeDeparture}
                onConfirmarCancelamento={handleConfirmarCancelamentoCadastro}
              />
              <RegisteredFullDeparturesTable
                rows={departures}
                emptyLabel="Nenhuma saída cadastrada ainda. Use Cadastrar Nova Saída para incluir."
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
                        variant="outline"
                        size="icon"
                        translate="no"
                        className="h-10 w-10 shrink-0 rounded-xl border-[hsl(var(--border))] shadow-sm transition hover:shadow-md"
                        aria-label="Abrir calendário — data do pedido"
                      >
                        <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" />
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
                        variant="outline"
                        size="icon"
                        translate="no"
                        className="h-10 w-10 shrink-0 rounded-xl border-[hsl(var(--border))] shadow-sm transition hover:shadow-md"
                        aria-label="Abrir calendário — data da saída"
                      >
                        <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" />
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

              <CatalogComboField
                id="field-om"
                label="OM"
                category="oms"
                value={om}
                onChange={setOm}
                options={catalogItems.oms}
                showPlusAfterAttempt={catalogSubmitAttempted}
              />

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
                    label="Hospital de Destino"
                    category="hospitais"
                    value={destinationHospital}
                    onChange={setDestinationHospital}
                    options={catalogItems.hospitais}
                    showPlusAfterAttempt={catalogSubmitAttempted}
                  />

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
                    <strong>{catalogBlockingLabels.join(", ")}</strong>. Para Setor, Responsável, OM e Hospital
                    de Destino, inclua o valor em <strong>Cadastrar Itens</strong> (botão <strong>+</strong>{" "}
                    vermelho). Para <strong>Viaturas</strong> e <strong>Motoristas</strong>, cadastre em{" "}
                    <strong>Frota e Pessoal</strong> e selecione de novo.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-3">
                <Button type="button" variant="default" onClick={handleCadastrarSaida}>
                  {editingId ? "Atualizar saída" : "Cadastrar Saída"}
                </Button>
                <Button type="button" variant="outline">
                  Cadastrar em Série
                </Button>
                <Button type="button" variant="outline">
                  Cadastrar Múltiplos Destinos
                </Button>
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
                variant="outline"
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
