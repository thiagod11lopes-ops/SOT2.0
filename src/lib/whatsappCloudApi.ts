type WhatsAppSendResult = { ok: true } | { ok: false; error: string };
const WHATSAPP_LOCAL_TOKEN_KEY = "sot_whatsapp_cloud_token_v1";
const WHATSAPP_LOCAL_PHONE_NUMBER_ID_KEY = "sot_whatsapp_cloud_phone_number_id_v1";
const WHATSAPP_LOCAL_PROXY_BASE_URL_KEY = "sot_whatsapp_proxy_base_url_v1";

function readEnv(name: string): string {
  const v = String(import.meta.env[name] ?? "").trim();
  return v;
}

function normalizePhoneForApi(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

function getConfig(): { token: string; phoneNumberId: string } | null {
  const localToken = typeof localStorage !== "undefined" ? String(localStorage.getItem(WHATSAPP_LOCAL_TOKEN_KEY) ?? "").trim() : "";
  const localPhoneNumberId =
    typeof localStorage !== "undefined" ? String(localStorage.getItem(WHATSAPP_LOCAL_PHONE_NUMBER_ID_KEY) ?? "").trim() : "";
  const token = localToken || readEnv("VITE_WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = localPhoneNumberId || readEnv("VITE_WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

function getProxyBaseUrl(): string {
  const local =
    typeof localStorage !== "undefined" ? String(localStorage.getItem(WHATSAPP_LOCAL_PROXY_BASE_URL_KEY) ?? "").trim() : "";
  const env = readEnv("VITE_WHATSAPP_PROXY_BASE_URL");
  return local || env;
}

export function saveWhatsAppCloudApiConfig(config: { token: string; phoneNumberId: string }): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(WHATSAPP_LOCAL_TOKEN_KEY, config.token.trim());
  localStorage.setItem(WHATSAPP_LOCAL_PHONE_NUMBER_ID_KEY, config.phoneNumberId.trim());
}

export function saveWhatsAppProxyBaseUrl(baseUrl: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(WHATSAPP_LOCAL_PROXY_BASE_URL_KEY, baseUrl.trim());
}

export function readWhatsAppCloudApiConfig(): { token: string; phoneNumberId: string; proxyBaseUrl: string } {
  const token = typeof localStorage !== "undefined" ? String(localStorage.getItem(WHATSAPP_LOCAL_TOKEN_KEY) ?? "") : "";
  const phoneNumberId =
    typeof localStorage !== "undefined" ? String(localStorage.getItem(WHATSAPP_LOCAL_PHONE_NUMBER_ID_KEY) ?? "") : "";
  const proxyBaseUrl =
    typeof localStorage !== "undefined" ? String(localStorage.getItem(WHATSAPP_LOCAL_PROXY_BASE_URL_KEY) ?? "") : "";
  return { token: token.trim(), phoneNumberId: phoneNumberId.trim(), proxyBaseUrl: proxyBaseUrl.trim() };
}

async function sendViaProxy(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const base = getProxyBaseUrl();
  if (!base) return { ok: false, error: "Configuração da API do WhatsApp ausente no ambiente." };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/whatsapp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `Falha HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede ao enviar WhatsApp." };
  }
}

export async function sendWhatsAppTemplateHelloWorld(toPhone: string): Promise<WhatsAppSendResult> {
  const base = getProxyBaseUrl();
  if (base) {
    return sendViaProxy({ toPhone, mode: "template_hello_world" });
  }
  const cfg = getConfig();
  if (!cfg) {
    return { ok: false, error: "Configuração da API do WhatsApp ausente no ambiente." };
  }
  const to = normalizePhoneForApi(toPhone);
  if (!to) return { ok: false, error: "Telefone inválido para envio." };
  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      return { ok: false, error: body.error?.message ?? `Falha HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede ao enviar WhatsApp." };
  }
}

export async function sendWhatsAppTextMessage(toPhone: string, text: string): Promise<WhatsAppSendResult> {
  const base = getProxyBaseUrl();
  if (base) {
    return sendViaProxy({ toPhone, mode: "text", text });
  }
  const cfg = getConfig();
  if (!cfg) {
    return { ok: false, error: "Configuração da API do WhatsApp ausente no ambiente." };
  }
  const to = normalizePhoneForApi(toPhone);
  if (!to) return { ok: false, error: "Telefone inválido para envio." };
  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      return { ok: false, error: body.error?.message ?? `Falha HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede ao enviar WhatsApp." };
  }
}
