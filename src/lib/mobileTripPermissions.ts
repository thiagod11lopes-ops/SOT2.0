import { saveMobilePushSubscriptionForMotorista } from "./firebase/mobilePushSubscriptions";
import {
  ensurePushSubscription,
  isNotificationSupported,
  requestNotificationPermissionIfNeeded,
} from "./mobilePushNotifications";
import { ensureGeolocationPermission } from "./mobileDriverTracking";

const ACK_KEY = "sot_mobile_trip_permissions_ack_v1";

export type TripPermissionsStatus = {
  locationGranted: boolean;
  callsGranted: boolean;
  acknowledged: boolean;
};

type TripPermissionsAck = {
  motorista: string;
  at: number;
  location: boolean;
  calls: boolean;
};

function readAck(): TripPermissionsAck | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const motorista = String(parsed.motorista ?? "").trim();
    const at = Number(parsed.at);
    if (!motorista || !Number.isFinite(at)) return null;
    return {
      motorista,
      at,
      location: parsed.location === false ? false : true,
      calls: parsed.calls === false ? false : true,
    };
  } catch {
    return null;
  }
}

export function markTripPermissionsAcknowledged(motorista: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      ACK_KEY,
      JSON.stringify({
        motorista: motorista.trim(),
        at: Date.now(),
        location: true,
        calls: true,
      } satisfies TripPermissionsAck),
    );
  } catch {
    /* ignore */
  }
}

export function hasTripPermissionsAcknowledged(motorista: string): boolean {
  const ack = readAck();
  if (!ack) return false;
  if (ack.motorista.trim().toLowerCase() !== motorista.trim().toLowerCase()) return false;
  return ack.location && ack.calls;
}

export async function queryTripPermissionsStatus(motorista: string): Promise<TripPermissionsStatus> {
  let locationGranted = false;
  try {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      locationGranted = result.state === "granted";
    }
  } catch {
    locationGranted = false;
  }

  const callsGranted =
    isNotificationSupported() && typeof Notification !== "undefined" && Notification.permission === "granted";

  return {
    locationGranted,
    callsGranted,
    acknowledged: hasTripPermissionsAcknowledged(motorista),
  };
}

/** Já autorizou uma vez e as permissões do sistema ainda estão ativas. */
export async function tripPermissionsReady(motorista: string): Promise<boolean> {
  const status = await queryTripPermissionsStatus(motorista);
  return status.acknowledged && status.locationGranted && status.callsGranted;
}

/** Pede só a localização. Devolve erro ou `null` se ficou aceite. */
export async function requestTripLocationPermission(): Promise<string | null> {
  try {
    await ensureGeolocationPermission();
    return null;
  } catch {
    return "É necessário permitir a localização para iniciar a saída e partilhar a posição da viatura.";
  }
}

/** Pede notificações/chamadas e regista o celular. Devolve erro ou `null` se ficou aceite. */
export async function requestTripCallsPermission(motorista: string): Promise<string | null> {
  const nome = motorista.trim();
  if (!nome) return "Entre com o seu nome de motorista antes de iniciar a saída.";

  if (!isNotificationSupported()) {
    return "Este celular não permite notificações. Sem isso, as chamadas com o ecrã bloqueado não funcionam.";
  }

  const notification = await requestNotificationPermissionIfNeeded();
  if (notification !== "granted") {
    return "É necessário permitir as notificações para receber as chamadas do HNMD mesmo com o celular bloqueado.";
  }

  const subscription = await ensurePushSubscription({ renew: false });
  if (!subscription) {
    return "Não foi possível ativar as chamadas neste celular. Verifique as notificações nas definições e tente de novo.";
  }

  await saveMobilePushSubscriptionForMotorista(nome, subscription);
  return null;
}

/**
 * Garante localização + chamadas e grava o aceite para as próximas saídas.
 * Devolve mensagem de erro ou `null` se tudo ficou autorizado.
 */
export async function requestTripPermissions(motorista: string): Promise<string | null> {
  const nome = motorista.trim();
  if (!nome) return "Entre com o seu nome de motorista antes de iniciar a saída.";

  const loc = await requestTripLocationPermission();
  if (loc) return loc;

  const calls = await requestTripCallsPermission(nome);
  if (calls) return calls;

  markTripPermissionsAcknowledged(nome);
  return null;
}
