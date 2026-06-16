import { useCallback, useEffect, useState } from "react";
import {
  confirmSiadDriver,
  getSiadDriverRequestForSlot,
  readSiadDriverRequestStore,
  requestSiadDriver,
  subscribeSiadDriverRequestChanges,
  parseSiadDriverRequestSlotKey,
  type SiadDriverRequestRecord,
  type SiadDriverRequestSlot,
} from "../lib/siadDriverRequest";

export function useSiadDriverRequest(dateSaida: string, horaSaida: string) {
  const [record, setRecord] = useState<SiadDriverRequestRecord | null>(() =>
    getSiadDriverRequestForSlot(dateSaida, horaSaida),
  );

  const refresh = useCallback(() => {
    setRecord(getSiadDriverRequestForSlot(dateSaida, horaSaida));
  }, [dateSaida, horaSaida]);

  useEffect(() => {
    refresh();
    return subscribeSiadDriverRequestChanges(refresh);
  }, [refresh]);

  const request = useCallback(
    (hora?: string) => requestSiadDriver(dateSaida, hora ?? horaSaida),
    [dateSaida, horaSaida],
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

export function usePendingSiadDriverRequests(): SiadDriverRequestSlot[] {
  const [pending, setPending] = useState<SiadDriverRequestSlot[]>(() => {
    const store = readSiadDriverRequestStore();
    return Object.entries(store)
      .filter(([, row]) => row.status === "requested")
      .map(([key, record]) => {
        const slot = parseSiadDriverRequestSlotKey(key);
        return {
          dateSaida: slot.dateSaida,
          horaSaida: slot.horaSaida,
          record,
        };
      })
      .sort((a, b) => b.record.requestedAt - a.record.requestedAt);
  });

  const refresh = useCallback(() => {
    const store = readSiadDriverRequestStore();
    setPending(
      Object.entries(store)
        .filter(([, row]) => row.status === "requested")
        .map(([key, record]) => {
          const slot = parseSiadDriverRequestSlotKey(key);
          return {
            dateSaida: slot.dateSaida,
            horaSaida: slot.horaSaida,
            record,
          };
        })
        .sort((a, b) => b.record.requestedAt - a.record.requestedAt),
    );
  }, []);

  useEffect(() => {
    refresh();
    return subscribeSiadDriverRequestChanges(refresh);
  }, [refresh]);

  return pending;
}
