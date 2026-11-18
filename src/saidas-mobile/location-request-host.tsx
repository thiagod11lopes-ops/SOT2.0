import { useEffect, useRef, useState } from "react";
import { postDriverLocation } from "../lib/driverLocationPost";
import {
  formatGeolocationBlockMessage,
  ensureGeolocationPermission,
  getActiveTrackingInfo,
  subscribeActiveTrackingChange,
} from "../lib/mobileDriverTracking";
import { loadActiveMobileMotorista } from "../lib/mobileMotoristaCredentials";
import { normalizePlacaKeyDriverMap } from "../lib/departureDriverMapFilter";
import {
  responderSolicitacaoLocalizacao,
  solicitacaoEhDesteMotorista,
  subscribeSolicitacaoLocalizacao,
  type SolicitacaoLocalizacao,
} from "../lib/solicitacaoLocalizacao";
import {
  dismissNativeIncomingLocationCall,
  showNativeIncomingLocationCall,
} from "../lib/nativeIncomingCall";
import { LocationCallScreen } from "./location-call-screen";

const MOTORISTA_EVENT = "sot-mobile-motorista";

function pedidoEhDesteCelular(pedido: SolicitacaoLocalizacao, motoristaLogado: string): boolean {
  if (solicitacaoEhDesteMotorista(pedido, motoristaLogado)) return true;
  const tracking = getActiveTrackingInfo();
  if (!tracking) return false;
  return normalizePlacaKeyDriverMap(tracking.placa) === normalizePlacaKeyDriverMap(pedido.placa);
}

function readSotCallActionFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q < 0) return null;
  const params = new URLSearchParams(hash.slice(q + 1));
  if (params.get("sotCall") !== "1") return null;
  return (params.get("sotCallAction") || "open").trim() || "open";
}

function clearSotCallParamsFromHash(): void {
  if (typeof window === "undefined") return;
  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q < 0) return;
  const pathPart = hash.slice(1, q);
  const params = new URLSearchParams(hash.slice(q + 1));
  if (!params.has("sotCall") && !params.has("sotCallAction")) return;
  params.delete("sotCall");
  params.delete("sotCallAction");
  const next = params.toString();
  const nextHash = next ? `#${pathPart}?${next}` : `#${pathPart}`;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
}

export function LocationRequestHost() {
  const [motorista, setMotorista] = useState(() => loadActiveMobileMotorista() ?? "");
  const [pedido, setPedido] = useState<SolicitacaoLocalizacao | null>(null);
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [trackingTick, setTrackingTick] = useState(0);
  const tratadoRef = useRef("");
  const pendingActionRef = useRef<string | null>(readSotCallActionFromHash());
  const autoEnviarDoneRef = useRef("");

  useEffect(() => {
    const sync = () => setMotorista(loadActiveMobileMotorista() ?? "");
    window.addEventListener(MOTORISTA_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MOTORISTA_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const syncHashAction = () => {
      const action = readSotCallActionFromHash();
      if (action) pendingActionRef.current = action;
    };
    syncHashAction();
    window.addEventListener("hashchange", syncHashAction);
    return () => window.removeEventListener("hashchange", syncHashAction);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string } | null;
      if (!data || data.type !== "sot-location-call") return;
      const action = String(data.action || "open");
      if (action === "enviar" || action === "open" || action === "ring") {
        pendingActionRef.current = action === "ring" ? "open" : action;
      }
      setPedido((atual) => {
        if (!atual || atual.status !== "pendente") return atual;
        if (!pedidoEhDesteCelular(atual, loadActiveMobileMotorista() ?? "")) return atual;
        if (action === "recusar") {
          tratadoRef.current = atual.id;
          setAberto(false);
          void responderSolicitacaoLocalizacao(atual, "recusada").catch(() => undefined);
          return atual;
        }
        setErro("");
        setAberto(true);
        return atual;
      });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => subscribeActiveTrackingChange(() => setTrackingTick((n) => n + 1)), []);

  useEffect(() => {
    return subscribeSolicitacaoLocalizacao(
      (next) => {
        setPedido(next);
        if (!next || next.status !== "pendente" || next.id === tratadoRef.current) {
          if (!next || next.status !== "pendente") setAberto(false);
          return;
        }
        const logado = loadActiveMobileMotorista() ?? "";
        if (!pedidoEhDesteCelular(next, logado)) {
          setAberto(false);
          return;
        }
        setErro("");
        setAberto(true);
      },
      () => setAberto(false),
    );
  }, []);

  useEffect(() => {
    if (!pedido || pedido.status !== "pendente" || pedido.id === tratadoRef.current) return;
    if (!pedidoEhDesteCelular(pedido, motorista)) {
      setAberto(false);
      return;
    }
    setAberto(true);
  }, [pedido, motorista, trackingTick]);

  function fecharSemEnviar() {
    if (!pedido) return;
    tratadoRef.current = pedido.id;
    pendingActionRef.current = null;
    clearSotCallParamsFromHash();
    setAberto(false);
    setErro("");
    setBusy(false);
    void responderSolicitacaoLocalizacao(pedido, "recusada").catch(() => undefined);
  }

  async function enviar() {
    if (!pedido || busy) return;
    setBusy(true);
    setErro("");
    try {
      await ensureGeolocationPermission();
      const position = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
        );
      });
      await postDriverLocation({
        placa: pedido.placa,
        latitude: position.lat,
        longitude: position.lng,
        departureId: pedido.departureId || undefined,
      });
      tratadoRef.current = pedido.id;
      pendingActionRef.current = null;
      clearSotCallParamsFromHash();
      setAberto(false);
      void responderSolicitacaoLocalizacao(pedido, "enviada").catch(() => undefined);
    } catch (e) {
      const falhaDeGps =
        typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "number";
      setErro(falhaDeGps ? formatGeolocationBlockMessage(e) : e instanceof Error ? e.message : formatGeolocationBlockMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!aberto || !pedido || busy) return;
    if (pendingActionRef.current !== "enviar") return;
    if (autoEnviarDoneRef.current === pedido.id) return;
    autoEnviarDoneRef.current = pedido.id;
    pendingActionRef.current = null;
    clearSotCallParamsFromHash();
    void enviar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara uma vez por pedido quando veio da notificação
  }, [aberto, pedido, busy]);

  useEffect(() => {
    if (!aberto || !pedido || pedido.status !== "pendente") {
      void dismissNativeIncomingLocationCall();
      return;
    }
    void showNativeIncomingLocationCall({ placa: pedido.placa });
    return () => {
      void dismissNativeIncomingLocationCall();
    };
  }, [aberto, pedido]);

  if (!aberto || !pedido) return null;
  return (
    <LocationCallScreen busy={busy} error={erro} onEnviar={() => void enviar()} onRecusar={fecharSemEnviar} />
  );
}
