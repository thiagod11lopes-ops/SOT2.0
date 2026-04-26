import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
const PHONE_NUMBER_ID = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
const ALLOWED_ORIGINS = String(
  process.env.WHATSAPP_PROXY_ALLOWED_ORIGINS ||
    "https://thiagod11lopes-ops.github.io,http://localhost:3000,http://localhost:3001,http://localhost:3002",
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function setCors(res, origin) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, payload, origin) {
  setCors(res, origin);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizePhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    setCors(res, origin);
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST" || req.url !== "/api/whatsapp/send") {
    json(res, 404, { error: "Not found" }, origin);
    return;
  }
  if (!TOKEN || !PHONE_NUMBER_ID) {
    json(res, 500, { error: "Servidor sem WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID." }, origin);
    return;
  }
  let bodyRaw = "";
  for await (const chunk of req) bodyRaw += chunk;
  let body = {};
  try {
    body = JSON.parse(bodyRaw || "{}");
  } catch {
    json(res, 400, { error: "JSON inválido." }, origin);
    return;
  }
  const to = normalizePhone(body.toPhone);
  const mode = String(body.mode || "");
  if (!to) {
    json(res, 400, { error: "toPhone inválido." }, origin);
    return;
  }
  let payload;
  if (mode === "template_hello_world") {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" },
      },
    };
  } else {
    const text = String(body.text || "").trim();
    if (!text) {
      json(res, 400, { error: "text vazio." }, origin);
      return;
    }
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      json(res, r.status, { error: out?.error?.message || "Falha no envio WhatsApp." }, origin);
      return;
    }
    json(res, 200, { ok: true }, origin);
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : "Erro de rede no proxy." }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`[whatsapp-proxy] listening on :${PORT}`);
});
