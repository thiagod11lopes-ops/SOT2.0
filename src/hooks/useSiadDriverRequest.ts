import { useCallback, useEffect, useState } from "react";
import {
  confirmSiadDriver,
  getSiadDriverRequestForDate,
  readSiadDriverRequestStore,
  requestSiadDriver,
  subscribeSiadDriverRequestChanges,
  type SiadDriverRequestRecord,
} from "../lib/siadDriverRequest";

export function useSiadDriverRequest(dateSaida: string) {
  const [record, setRecord] = useState<SiadDriverRequestRecord | null>(() =>
    getSiadDriverRequestForDate(dateSaida),
  );

  const refresh = useCallback(() => {
    setRecord(getSiadDriverRequestForDate(dateSaida));
  }, [dateSaida]);

  useEffect(() => {
    refresh();
    return subscribeSiadDriverRequestChanges(refresh);
  }, [refresh]);

  const request = useCallback(() => requestSiadDriver(dateSaida), [dateSaida]);
  const confirm = useCallback(() => confirmSiadDriver(dateSaida), [dateSaida]);

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

export function usePendingSiadDriverRequests() {
  const [pending, setPending] = useState(() => {
    const store = readSiadDriverRequestStore();
    return Object.entries(store)
      .filter(([, row]) => row.status === "requested")
      .map(([dateSaida, record]) => ({ dateSaida, record }))
      .sort((a, b) => b.record.requestedAt - a.record.requestedAt);
  });

  const refresh = useCallback(() => {
    const store = readSiadDriverRequestStore();
    setPending(
      Object.entries(store)
        .filter(([, row]) => row.status === "requested")
        .map(([dateSaida, record]) => ({ dateSaida, record }))
        .sort((a, b) => b.record.requestedAt - a.record.requestedAt),
    );
  }, []);

  useEffect(() => {
    refresh();
    return subscribeSiadDriverRequestChanges(refresh);
  }, [refresh]);

  return pending;
}
