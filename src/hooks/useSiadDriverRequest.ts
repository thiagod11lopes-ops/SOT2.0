import { useCallback, useEffect, useState } from "react";
import { useDepartures } from "../context/departures-context";
import {
  collectSiadDeparturesForSlot,
  confirmSiadDriver,
  getActiveSiadDriverRequestForDate,
  isSiadDriverRequestStale,
  readSiadDriverRequestStore,
  requestSiadDriver,
  resolveSiadDriverRequestForSlot,
  subscribeSiadDriverRequestChanges,
  parseSiadDriverRequestSlotKey,
  type SiadDriverRequestRecord,
  type SiadDriverRequestSlot,
} from "../lib/siadDriverRequest";

export function useSiadDriverRequest(dateSaida: string, horaSaida: string) {
  const { departures } = useDepartures();
  const [record, setRecord] = useState<SiadDriverRequestRecord | null>(() =>
    resolveSiadDriverRequestForSlot(dateSaida, horaSaida, []),
  );

  const refresh = useCallback(() => {
    setRecord(resolveSiadDriverRequestForSlot(dateSaida, horaSaida, departures));
  }, [dateSaida, horaSaida, departures]);

  useEffect(() => {
    refresh();
    return subscribeSiadDriverRequestChanges(refresh);
  }, [refresh]);

  const request = useCallback(
    (hora?: string) => requestSiadDriver(dateSaida, hora ?? horaSaida, departures),
    [dateSaida, horaSaida, departures],
  );
  const confirm = useCallback(
    () => confirmSiadDriver(dateSaida, horaSaida),
    [dateSaida, horaSaida],
  );

  return {
    record,
    status: record?.status ?? null,
    canRequest: !record,
    isRequested: record?.status === "requested",
    isConfirmed: record?.status === "confirmed",
    request,
    confirm,
    refresh,
  };
}

/** Estado do pedido de motorista para a data (qualquer horário ativo no dia). */
export function useSiadDriverRequestForDate(dateSaida: string) {
  const { departures } = useDepartures();
  const [active, setActive] = useState<SiadDriverRequestSlot | null>(() =>
    getActiveSiadDriverRequestForDate(dateSaida, []),
  );

  const refresh = useCallback(() => {
    setActive(getActiveSiadDriverRequestForDate(dateSaida, departures));
  }, [dateSaida, departures]);

  useEffect(() => {
    refresh();
    return subscribeSiadDriverRequestChanges(refresh);
  }, [refresh]);

  const request = useCallback(
    (hora: string) => requestSiadDriver(dateSaida, hora, departures),
    [dateSaida, departures],
  );

  const record = active?.record ?? null;

  return {
    active,
    record,
    horaSaida: active?.horaSaida ?? null,
    status: record?.status ?? null,
    canRequest: !record,
    isRequested: record?.status === "requested",
    isConfirmed: record?.status === "confirmed",
    request,
    refresh,
  };
}

export function usePendingSiadDriverRequests(): SiadDriverRequestSlot[] {
  const { departures } = useDepartures();
  const [pending, setPending] = useState<SiadDriverRequestSlot[]>([]);

  const refresh = useCallback(() => {
    const store = readSiadDriverRequestStore();
    const next = Object.entries(store)
      .map(([key, record]) => {
        if (record.status !== "requested") return null;
        const slot = parseSiadDriverRequestSlotKey(key);
        const hora = slot.horaSaida ?? "";
        const slotDepartures = collectSiadDeparturesForSlot(departures, slot.dateSaida, hora);
        if (isSiadDriverRequestStale(record, slotDepartures)) return null;
        return {
          dateSaida: slot.dateSaida,
          horaSaida: slot.horaSaida,
          record,
        };
      })
      .filter((slot): slot is SiadDriverRequestSlot => slot !== null)
      .sort((a, b) => b.record.requestedAt - a.record.requestedAt);
    setPending(next);
  }, [departures]);

  useEffect(() => {
    refresh();
    return subscribeSiadDriverRequestChanges(refresh);
  }, [refresh]);

  return pending;
}
