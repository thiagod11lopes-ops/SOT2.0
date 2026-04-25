type WhatsAppSendResult = { ok: true } | { ok: false; error: string };

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
  const token = readEnv("VITE_WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = readEnv("VITE_WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

export async function sendWhatsAppTemplateHelloWorld(toPhone: string): Promise<WhatsAppSendResult> {
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
