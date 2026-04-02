import shp from "shpjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isValueInCatalog, useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { getCurrentDatePtBr, normalizeDatePtBr } from "../lib/dateFormat";
import { normalize24hTime } from "../lib/timeInput";
import { cn } from "../lib/utils";
import type { DepartureRecord } from "../types/departure";
import { CatalogItemsPanel } from "./catalog-items-panel";
import { CatalogComboField } from "./catalog-select";
import { RegisteredFullDeparturesTable } from "./registered-full-departures-table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { TabsList } from "./ui/tabs";

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

const IBGE_BAIRROS_URL =
  "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/bairros/shp/BR/BR_bairros_CD2022.zip";

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
  setters.setKmDeparture(r.kmSaida);
  setters.setKmArrival(r.kmChegada);
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
  const { items: catalogItems, addItem: addCatalogItem } = useCatalogItems();
  const [activeSubTab, setActiveSubTab] = useState<string>(subTabs[0]);
  /** Após clicar em Cadastrar Saída com itens fora do catálogo; exibe o + piscando. */
  const [catalogSubmitAttempted, setCatalogSubmitAttempted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const lastAppliedEditVersion = useRef(0);
  const [departureType, setDepartureType] = useState<string>("Administrativa");
  const [requestDate, setRequestDate] = useState<string>(getCurrentDatePtBr);
  const [requestTime, setRequestTime] = useState<string>(getCurrentTime);
  const [departureDate, setDepartureDate] = useState<string>("");
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
  const [neighborhood, setNeighborhood] = useState<string>("");
  const [neighborhoodsByCity, setNeighborhoodsByCity] = useState<Record<string, string[]>>({});
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    async function loadOfficialNeighborhoods() {
      try {
        const response = await fetch(IBGE_BAIRROS_URL);
        const zipArrayBuffer = await response.arrayBuffer();
        const parsed = await shp(zipArrayBuffer);
        const collection = Array.isArray(parsed) ? parsed[0] : parsed;
        const cityMap: Record<string, Set<string>> = {};
        for (const cityName of metroRioCities) cityMap[cityName] = new Set<string>();

        for (const feature of collection.features) {
          const cityName = feature.properties?.NM_MUN as string | undefined;
          const neighborhoodName = feature.properties?.NM_BAIRRO as string | undefined;
          if (!cityName || !neighborhoodName || !cityMap[cityName]) continue;
          cityMap[cityName].add(neighborhoodName.trim());
        }

        const normalized: Record<string, string[]> = {};
        for (const cityName of metroRioCities) {
          normalized[cityName] = Array.from(cityMap[cityName]).sort((a, b) =>
            a.localeCompare(b, "pt-BR"),
          );
        }

        if (mounted) {
          setNeighborhoodsByCity(normalized);
          setNeighborhood(normalized["Rio de Janeiro"]?.[0] ?? "");
          setLoadingNeighborhoods(false);
        }
      } catch {
        if (mounted) {
          setNeighborhoodsByCity({});
          setNeighborhood("");
          setLoadingNeighborhoods(false);
        }
      }
    }
    loadOfficialNeighborhoods();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (editIntentVersion === 0) return;
    if (editIntentVersion === lastAppliedEditVersion.current) return;
    if (!pendingEditDepartureId) return;
    if (loadingNeighborhoods) return;
    const record = departures.find((d) => d.id === pendingEditDepartureId);
    if (!record) {
      clearPendingEditDeparture();
      return;
    }
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
  }, [
    editIntentVersion,
    pendingEditDepartureId,
    departures,
    loadingNeighborhoods,
    clearPendingEditDeparture,
  ]);

  const cityNeighborhoods = useMemo(() => neighborhoodsByCity[city] ?? [], [city, neighborhoodsByCity]);

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
    return f;
  }, [
    sector,
    requestResponsible,
    om,
    destinationHospital,
    departureType,
    catalogItems.setores,
    catalogItems.responsaveis,
    catalogItems.oms,
    catalogItems.hospitais,
  ]);

  const canSubmitWithCatalog = catalogBlockingLabels.length === 0;

  useEffect(() => {
    if (canSubmitWithCatalog) {
      setCatalogSubmitAttempted(false);
    }
  }, [canSubmitWithCatalog]);

  function buildDeparturePayload(): Omit<DepartureRecord, "id" | "createdAt"> {
    return {
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
    };
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
    setActiveSubTab("Saídas Cadastradas");
  }

  const fillExampleDeparture = useCallback(() => {
    setEditingId(null);
    setCatalogSubmitAttempted(false);
    const hoje = getCurrentDatePtBr();
    const bairrosRj = neighborhoodsByCity["Rio de Janeiro"];
    addCatalogItem("setores", "SAMU Central");
    addCatalogItem("responsaveis", "Cap. Silva");
    addCatalogItem("oms", "1º BPM");
    addCatalogItem("hospitais", "Hospital Municipal Souza Aguiar");
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
    setKmDeparture("45230");
    setKmArrival("45268");
    setArrivalTime("10:15");
    setCity("Rio de Janeiro");
    setNeighborhood(bairrosRj?.[0] ?? "");
  }, [neighborhoodsByCity, addCatalogItem]);

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
            {activeSubTab === "Cadastrar Nova Saída" && editingId ? (
              <p className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                Editando um registro existente — salve para atualizar ou use &quot;Preencher com exemplo&quot; para
                novo cadastro.
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
            <RegisteredFullDeparturesTable
              rows={departures}
              emptyLabel="Nenhuma saída cadastrada ainda. Use Cadastrar Nova Saída para incluir."
              onRemove={removeDeparture}
              onEdit={beginEditDeparture}
            />
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
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={requestDate}
                  onChange={(event) => setRequestDate(normalizeDatePtBr(event.target.value))}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Hora do pedido</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  value={requestTime}
                  onChange={(event) => setRequestTime(normalize24hTime(event.target.value))}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data da Saída</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={departureDate}
                  onChange={(event) => setDepartureDate(normalizeDatePtBr(event.target.value))}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Hora da Saída</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
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
                placeholder="Digite ou escolha da lista"
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
                placeholder="Digite ou escolha da lista"
                showPlusAfterAttempt={catalogSubmitAttempted}
              />

              <CatalogComboField
                id="field-om"
                label="OM"
                category="oms"
                value={om}
                onChange={setOm}
                options={catalogItems.oms}
                placeholder="Digite ou escolha da lista"
                showPlusAfterAttempt={catalogSubmitAttempted}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">Viaturas</label>
                <input
                  type="text"
                  value={vehicles}
                  onChange={(event) => setVehicles(event.target.value)}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Motoristas</label>
                <input
                  type="text"
                  value={drivers}
                  onChange={(event) => setDrivers(event.target.value)}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                />
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
                    placeholder="Digite ou escolha da lista"
                    showPlusAfterAttempt={catalogSubmitAttempted}
                  />

                  <div className="space-y-2">
                    <label className="text-sm font-medium">KM SAÍDA</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={kmDeparture}
                      onChange={(event) => setKmDeparture(event.target.value.replace(/\D/g, ""))}
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">KM CHEGADA</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={kmArrival}
                      onChange={(event) => setKmArrival(event.target.value.replace(/\D/g, ""))}
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">CHEGADA</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:MM"
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
                <label className="text-sm font-medium">Cidade</label>
                <select
                  value={city}
                  onChange={(event) => {
                    const selectedCity = event.target.value;
                    setCity(selectedCity);
                    setNeighborhood((neighborhoodsByCity[selectedCity] ?? [])[0] ?? "");
                  }}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                >
                  {metroRioCities.map((metroCity) => (
                    <option key={metroCity} value={metroCity}>
                      {metroCity}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bairro</label>
                <select
                  value={neighborhood}
                  disabled={loadingNeighborhoods || cityNeighborhoods.length === 0}
                  onChange={(event) => setNeighborhood(event.target.value)}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100"
                >
                  {loadingNeighborhoods ? (
                    <option>Carregando bairros oficiais...</option>
                  ) : cityNeighborhoods.length > 0 ? (
                    cityNeighborhoods.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))
                  ) : (
                    <option>Nenhum bairro oficial encontrado</option>
                  )}
                </select>
              </div>

              <div className="col-span-full mt-2 space-y-3 border-t border-slate-200 pt-4">
                {catalogSubmitAttempted && !canSubmitWithCatalog ? (
                  <p className="text-sm text-red-800 dark:text-red-300/90" role="alert">
                    Cadastro bloqueado: os campos{" "}
                    <strong>{catalogBlockingLabels.join(", ")}</strong> contêm texto que ainda não está em{" "}
                    <strong>Cadastrar Itens</strong>. Use o botão <strong>+</strong> vermelho (piscando) ao lado
                    de cada um para incluir o valor no catálogo; em seguida salve novamente.
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
    </div>
  );
}
