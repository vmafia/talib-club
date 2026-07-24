export const config = {
  runtime: 'edge',
};

// Server-side proxy for the uncledev.net AI API. The secret key lives only in the
// Vercel env var UNCLEDEV_AI_KEY and is attached here, so the browser never sees
// it. The client posts to /api/ai?path=chat|generate-image|attachments with the
// same body it would send upstream (JSON or multipart), and we forward it.
const BASE = 'https://ai.uncledev.net';
const ALLOWED = new Set(['chat', 'generate-image', 'attachments']);

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const key = process.env.UNCLEDEV_AI_KEY;

  // Health probe: lets the UI say "the key isn't set on the server" up front
  // instead of after a failed question. Never reveals the key itself.
  if (req.method === 'GET' && new URL(req.url).searchParams.get('path') === 'health') {
    return new Response(JSON.stringify({ configured: !!key, upstream: BASE }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (!key) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get('path') || 'chat';
  if (!ALLOWED.has(path)) {
    return new Response(JSON.stringify({ error: 'bad_path' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    // Buffer the body before forwarding. Streaming req.body across a redirect
    // (the upstream 307/308s on auth or trailing-slash normalisation) fails with
    // "a request with a one-time-use body … encountered a redirect"; a buffer is
    // replayable so fetch can follow the redirect cleanly.
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${key}`);
    const ct = req.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    const body = await req.arrayBuffer();

    const upstream = await fetch(`${BASE}/api/v1/${path}`, {
      method: 'POST',
      headers,
      body,
    });

    // A rejected key lands us on the login page instead of an answer; surface a
    // clear, actionable error instead of leaking the HTML login screen.
    if (upstream.redirected && /login|auth/i.test(upstream.url)) {
      return new Response(JSON.stringify({ error: 'ai_auth_failed', detail: 'upstream redirected to login — UNCLEDEV_AI_KEY is missing/invalid/expired' }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const respHeaders = new Headers(cors);
    respHeaders.set('content-type', upstream.headers.get('content-type') || 'application/json');

    // On failure the upstream often answers with an HTML error page, which the
    // client can only report as an unhelpful status number. Buffer it and pass
    // back a short, readable reason instead.
    if (!upstream.ok) {
      const raw = (await upstream.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return new Response(JSON.stringify({ error: 'ai_upstream_error', status: upstream.status, detail: raw.slice(0, 300) }), {
        status: upstream.status, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}
