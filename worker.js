/**
 * PluginHub — Cloudflare Worker (companion to pluginhub_revised.html)
 *
 * Bu worker, istemci tarafında (tarayıcıda) sır tutulmasını istemediğimiz
 * tüm işlemleri (TMDB isteği, rapor kaydı, cihazlar arası senkron) proxy'ler.
 *
 * GEREKLİ KURULUM:
 * 1. `wrangler secret put TMDB_API_KEY`  → TMDB API anahtarını buraya taşı,
 *    HTML dosyasından tamamen kaldırıldı.
 * 2. KV namespace oluştur ve `wrangler.toml` içinde `PLUGINHUB_KV` olarak bağla
 *    (rapor kayıtları ve sync verileri için).
 * 3. Aşağıdaki CORS başlıklarındaki origin'i kendi domainin ile sınırlamanı
 *    öneririm ("*" yerine "https://tcl-iffalcon.github.io" gibi).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    switch (body.action) {
      case 'report':
        return handleReport(body, env);
      case 'tmdb_popular':
        return handleTmdbPopular(body, env);
      case 'sync_push':
        return handleSyncPush(body, env);
      case 'sync_pull':
        return handleSyncPull(body, env);
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  },
};

// ---------------------------
// 1) Çalışmıyor bildirimi
// ---------------------------
async function handleReport(body, env) {
  const { plugin, platform, timestamp } = body;
  if (!plugin || !platform) return json({ error: 'Missing fields' }, 400);

  const key = `report:${Date.now()}:${crypto.randomUUID()}`;
  await env.PLUGINHUB_KV.put(key, JSON.stringify({ plugin, platform, timestamp }));

  return json({ ok: true });
}

// ---------------------------
// 2) TMDB proxy — anahtar hiçbir zaman istemciye gitmez
// ---------------------------
async function handleTmdbPopular(body, env) {
  const page = Number(body.page) || 1;
  const language = body.language || 'tr-TR';

  const url = `https://api.themoviedb.org/3/movie/popular?api_key=${env.TMDB_API_KEY}&language=${encodeURIComponent(language)}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) return json({ error: 'TMDB request failed' }, 502);

  const data = await res.json();
  return json(data);
}

// ---------------------------
// 3) Cihazlar arası senkron (favoriler / puanlar / notlar)
// ---------------------------
async function handleSyncPush(body, env) {
  const { code, data } = body;
  if (!code || !data) return json({ error: 'Missing code or data' }, 400);

  const safeCode = String(code).toUpperCase().slice(0, 8);
  await env.PLUGINHUB_KV.put(`sync:${safeCode}`, JSON.stringify(data), {
    expirationTtl: 60 * 60 * 24 * 180, // 180 gün sonra otomatik silinir
  });

  return json({ ok: true, code: safeCode });
}

async function handleSyncPull(body, env) {
  const { code } = body;
  if (!code) return json({ error: 'Missing code' }, 400);

  const safeCode = String(code).toUpperCase().slice(0, 8);
  const raw = await env.PLUGINHUB_KV.get(`sync:${safeCode}`);
  if (!raw) return json({ error: 'Code not found' }, 404);

  return json({ ok: true, data: JSON.parse(raw) });
}
