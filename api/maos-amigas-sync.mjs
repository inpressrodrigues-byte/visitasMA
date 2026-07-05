import { Redis } from "@upstash/redis";

const STATE_KEY = "maos-amigas:state-v1";

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,x-maos-amigas-token");
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  const expected = process.env.MAOS_AMIGAS_SYNC_TOKEN;
  if (!expected) return { ok: false, status: 500, error: "Configure MAOS_AMIGAS_SYNC_TOKEN no Vercel." };
  const provided = req.headers["x-maos-amigas-token"];
  if (provided !== expected) return { ok: false, status: 401, error: "Código de sincronização inválido." };
  return { ok: true };
}

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Configure Redis/Upstash no Vercel: UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.");
  }
  return new Redis({ url, token });
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });

  const auth = authorized(req);
  if (!auth.ok) return send(res, auth.status, { ok: false, error: auth.error });

  let redis;
  try {
    redis = redisClient();
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message });
  }

  if (req.method === "GET") {
    const data = await redis.get(STATE_KEY);
    return send(res, 200, { ok: true, data: data || null });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, { ok: false, error: "JSON inválido." });
    }
    if (!body.data || typeof body.data !== "object") {
      return send(res, 400, { ok: false, error: "Dados ausentes." });
    }
    const updatedAt = body.data.updatedAt || new Date().toISOString();
    await redis.set(STATE_KEY, { ...body.data, updatedAt });
    return send(res, 200, { ok: true, updatedAt });
  }

  return send(res, 405, { ok: false, error: "Método não permitido." });
}

