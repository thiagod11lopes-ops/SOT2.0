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
import { LocationCallScreen } from "./location-call-screen";

const MOTORISTA_EVENT = "sot-mobile-motorista";

function pedidoEhDesteCelular(pedido: SolicitacaoLocalizacao, motoristaLogado: string): boolean {
  if (solicitacaoEhDesteMotorista(pedido, motoristaLogado)) return true;
  const tracking = getActiveTrackingInfo();
  if (!tracking) return false;
  return normalizePlacaKeyDriverMap(tracking.placa) === normalizePlacaKeyDriverMap(pedido.placa);
}

export function LocationRequestHost() {
  const [motorista, setMotorista] = useState(() => loadActiveMobileMotorista() ?? "");
  const [pedido, setPedido] = useState<SolicitacaoLocalizacao | null>(null);
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [trackingTick, setTrackingTick] = useState(0);
  const tratadoRef = useRef("");

  useEffect(() => {
    const sync = () => setMotorista(loadActiveMobileMotorista() ?? "");
    window.addEventListener(MOTORISTA_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MOTORISTA_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
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

  if (!aberto || !pedido) return null;
  return (
    <LocationCallScreen busy={busy} error={erro} onEnviar={() => void enviar()} onRecusar={fecharSemEnviar} />
  );
}
