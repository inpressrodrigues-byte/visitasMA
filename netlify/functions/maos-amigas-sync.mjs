import { getStore } from "@netlify/blobs";

const STORE_NAME = "maos-amigas-operacional";
const STATE_KEY = "state-v1";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-maos-amigas-token"
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(payload)
  };
}

function authorized(event) {
  const expected = process.env.MAOS_AMIGAS_SYNC_TOKEN;
  if (!expected) return { ok: false, status: 500, error: "Configure MAOS_AMIGAS_SYNC_TOKEN no Netlify." };
  const provided = event.headers["x-maos-amigas-token"] || event.headers["X-Maos-Amigas-Token"];
  if (provided !== expected) return { ok: false, status: 401, error: "Código de sincronização inválido." };
  return { ok: true };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  const auth = authorized(event);
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  const store = getStore(STORE_NAME);

  if (event.httpMethod === "GET") {
    const raw = await store.get(STATE_KEY, { consistency: "strong" });
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return json(200, { ok: true, data: data || null });
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "JSON inválido." });
    }
    if (!body.data || typeof body.data !== "object") {
      return json(400, { ok: false, error: "Dados ausentes." });
    }
    const updatedAt = body.data.updatedAt || new Date().toISOString();
    await store.setJSON(STATE_KEY, { ...body.data, updatedAt }, { metadata: { updatedAt } });
    return json(200, { ok: true, updatedAt });
  }

  return json(405, { ok: false, error: "Método não permitido." });
}
