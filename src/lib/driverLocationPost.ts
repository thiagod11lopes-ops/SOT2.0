import { getAuth } from "firebase/auth";
import { ensureFirebaseAuth } from "./firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase/config";

/** Payload JWT (sem verificar assinatura) — só para comparar `aud` com o projeto configurado. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Evita enviar token de outro projeto (ex.: segredos GitHub Pages incorrectos). */
function assertIdTokenMatchesFirebaseProject(token: string): void {
  const expected = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!expected) return;
  const payload = decodeJwtPayload(token);
  if (!payload) return;
  const aud = payload.aud;
  const audStr = typeof aud === "string" ? aud : Array.isArray(aud) ? aud[0] : undefined;
  if (typeof audStr === "string" && audStr !== expected) {
    throw new Error(
      `Sessão Firebase do projeto «${audStr}», mas esta app espera «${expected}». Nos segredos do GitHub (build Pages), defina VITE_FIREBASE_PROJECT_ID igual ao projeto onde a função está deployada e faça novo deploy.`,
    );
  }
}

function formatFunctionsHttpError(status: number, bodyText: string): string {
  if (status === 401) {
    try {
      const j = JSON.parse(bodyText) as {
        error?: string;
        reason?: string;
        token_project?: string;
        function_project?: string;
      };
      if (
        j.reason === "firebase_project_mismatch" &&
        typeof j.token_project === "string" &&
        typeof j.function_project === "string"
      ) {
        return (
          `Conflito de projetos Firebase: o browser está autenticado no projeto «${j.token_project}» (Firestore usa esse projeto), ` +
          `mas a função de localização está em «${j.function_project}». ` +
          `Corrija os segredos do GitHub Actions para que todos os VITE_FIREBASE_* apontem para «${j.function_project}» ` +
          `(igual ao .firebaserc / deploy da função), ou faça deploy de postDriverLocation no projeto «${j.token_project}». ` +
          `Depois volte a publicar o site.`
        );
      }
      if (j.error === "unauthorized_or_invalid") {
        return (
          "O servidor recusou o token Firebase. Confirme que os segredos VITE_FIREBASE_* no GitHub são do mesmo projeto " +
          "onde deployou a função postDriverLocation; domínio em Authentication → Authorized domains; Anonymous activo; Ctrl+F5."
        );
      }
      if (j.error === "missing_token") return "Pedido sem token Firebase. Recarregue a página.";
    } catch {
      /* usar texto cru */
    }
  }
  return bodyText.trim() || `HTTP ${status}`;
}

/** Token fresco para a Cloud Function validar com Admin SDK (evita ID token expirado → 401). */
async function getFirebaseIdTokenForFunctions(): Promise<string> {
  await ensureFirebaseAuth();
  const user = getAuth(getFirebaseApp()).currentUser;
  if (!user) {
    throw new Error(
      "Sem sessão Firebase. Recarregue a página e confirme autenticação anónima e domínio autorizado.",
    );
  }
  const token = await user.getIdToken(true);
  assertIdTokenMatchesFirebaseProject(token);
  return token;
}

/** URL explícita opcional (produção, emuladores ou proxy). Caso falte, monta pela região e ID do projeto. */
export function resolveDriverLocationPostUrl(): string | null {
  const explicit = import.meta.env.VITE_DRIVER_LOCATION_POST_URL?.trim();
  if (explicit) return explicit;
  const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!pid) return null;
  return `https://southamerica-east1-${pid}.cloudfunctions.net/postDriverLocation`;
}

/**
 * Envio HTTP (Passo 2) das coordenadas para o backend.
 * Utilizador deve estar autenticado no Firebase (anónimo ou outro).
 */
export async function postDriverLocation(args: {
  placa: string;
  latitude: number;
  longitude: number;
  /** Identificador da saída (opcional, diagnóstico). */
  departureId?: string;
  capturedAt?: string;
}): Promise<void> {
  const url = resolveDriverLocationPostUrl();
  if (!url) {
    throw new Error(
      "URL de envio de localização indisponível: defina VITE_FIREBASE_PROJECT_ID ou VITE_DRIVER_LOCATION_POST_URL.",
    );
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado neste ambiente.");

  const token = await getFirebaseIdTokenForFunctions();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      placa: args.placa.trim(),
      latitude: args.latitude,
      longitude: args.longitude,
      departureId: args.departureId,
      capturedAt: args.capturedAt ?? new Date().toISOString(),
    }),
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(formatFunctionsHttpError(res.status, txt));
}

/**
 * Remove a posição ativa no servidor (Firestore via Cloud Function), p.ex. após rubrica ao finalizar a saída.
 * Mesmo endpoint HTTP que `postDriverLocation`, corpo `{ clear: true, placa }`.
 */
export async function clearDriverActiveLocation(placa: string): Promise<void> {
  const url = resolveDriverLocationPostUrl();
  if (!url) {
    throw new Error(
      "URL de envio de localização indisponível: defina VITE_FIREBASE_PROJECT_ID ou VITE_DRIVER_LOCATION_POST_URL.",
    );
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado neste ambiente.");

  const token = await getFirebaseIdTokenForFunctions();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ placa: placa.trim(), clear: true }),
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(formatFunctionsHttpError(res.status, txt));
}

/**
 * Remove todas as posições ativas no servidor (mapa vazio até novo envio por viatura).
 * Mesmo endpoint, corpo `{ clearAll: true }`.
 */
export async function clearAllDriverActiveLocationsOnServer(): Promise<number> {
  const url = resolveDriverLocationPostUrl();
  if (!url) {
    throw new Error(
      "URL de envio de localização indisponível: defina VITE_FIREBASE_PROJECT_ID ou VITE_DRIVER_LOCATION_POST_URL.",
    );
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado neste ambiente.");

  const token = await getFirebaseIdTokenForFunctions();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clearAll: true }),
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(formatFunctionsHttpError(res.status, txt));

  try {
    const json = JSON.parse(txt) as { deleted?: number };
    return typeof json.deleted === "number" ? json.deleted : 0;
  } catch {
    return 0;
  }
}
