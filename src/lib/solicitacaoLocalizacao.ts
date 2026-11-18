import { getFirebaseIdTokenForFunctions } from "./driverLocationPost";
import { isFirebaseConfigured } from "./firebase/config";
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "./firebase/sotStateFirestore";
import { nomesMotoristaVistoriaEquivalentes } from "./vistoriaInspectionShared";

export type SolicitacaoLocalizacaoStatus = "pendente" | "enviada" | "recusada";

export type SolicitacaoLocalizacao = {
  id: string;
  placa: string;
  departureId: string;
  motorista: string;
  requestedAt: number;
  status: SolicitacaoLocalizacaoStatus;
};

function novoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolvePushLocationRequestUrl(): string | null {
  const fromEnv = String(import.meta.env.VITE_PUSH_LOCATION_REQUEST_URL ?? "").trim();
  if (fromEnv) return fromEnv;
  const pid = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "").trim();
  if (!pid) return null;
  return `https://southamerica-east1-${pid}.cloudfunctions.net/pushLocationRequest`;
}

export function parseSolicitacaoLocalizacao(payload: unknown): SolicitacaoLocalizacao | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const placa = String(row.placa ?? "").trim();
  const motorista = String(row.motorista ?? "").trim();
  const status = row.status;
  if (!id || !placa || !motorista) return null;
  if (status !== "pendente" && status !== "enviada" && status !== "recusada") return null;
  return {
    id,
    placa,
    departureId: String(row.departureId ?? "").trim(),
    motorista,
    requestedAt: Number(row.requestedAt) || 0,
    status,
  };
}

export function subscribeSolicitacaoLocalizacao(
  onChange: (pedido: SolicitacaoLocalizacao | null) => void,
  onError: (err: Error) => void,
): () => void {
  return subscribeSotStateDoc(
    SOT_STATE_DOC.solicitacaoLocalizacao,
    (payload) => onChange(parseSolicitacaoLocalizacao(payload)),
    onError,
  );
}

async function dispararAvisoNoCelular(pedido: SolicitacaoLocalizacao): Promise<void> {
  const url = resolvePushLocationRequestUrl();
  if (!url || !isFirebaseConfigured()) return;
  try {
    const token = await getFirebaseIdTokenForFunctions();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: pedido.id,
        placa: pedido.placa,
        motorista: pedido.motorista,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn("[SOT] pushLocationRequest:", res.status, txt.slice(0, 200));
    }
  } catch (e) {
    console.warn("[SOT] pushLocationRequest falhou:", e);
  }
}

export async function solicitarLocalizacao(args: {
  placa: string;
  departureId: string;
  motorista: string;
}): Promise<void> {
  const pedido: SolicitacaoLocalizacao = {
    id: novoId(),
    placa: args.placa.trim(),
    departureId: args.departureId,
    motorista: args.motorista.trim(),
    requestedAt: Date.now(),
    status: "pendente",
  };
  await setSotStateDoc(SOT_STATE_DOC.solicitacaoLocalizacao, pedido);
  await dispararAvisoNoCelular(pedido);
}

export async function responderSolicitacaoLocalizacao(
  pedido: SolicitacaoLocalizacao,
  status: Exclude<SolicitacaoLocalizacaoStatus, "pendente">,
): Promise<void> {
  await setSotStateDoc(SOT_STATE_DOC.solicitacaoLocalizacao, { ...pedido, status });
}

export function solicitacaoEhDesteMotorista(pedido: SolicitacaoLocalizacao, motoristaLogado: string): boolean {
  const logado = motoristaLogado.trim();
  if (!logado) return false;
  const nomes = pedido.motorista
    .split(/[,;/]|\se\s/i)
    .map((nome) => nome.trim())
    .filter(Boolean);
  if (nomes.length === 0) nomes.push(pedido.motorista.trim());
  return nomes.some((nome) => nomesMotoristaVistoriaEquivalentes(nome, logado));
}
