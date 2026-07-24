export const config = {
  runtime: 'edge',
};

// Server-side proxy for web image search.
//
// History: this used to scrape DuckDuckGo, which works from a normal IP but is
// blocked from Vercel's datacenter IPs — production returned 500 "VQD token not
// found" because DDG serves servers a challenge page. So the reliable path is
// Pixabay (free API key, server-friendly, and it actually supports the filters a
// notebook wants: transparent-background stickers, clipart/illustrations,
// photos). DDG stays as a best-effort fallback for local/dev use, and its
// failure is never fatal — the client also queries keyless sources (Wikimedia,
// Openverse) directly, so an empty proxy response just means "nothing extra".

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });

// Pixabay: reliable from a server, free key. `type` maps onto its own filters.
async function searchPixabay(q, type, key) {
  const api = new URL('https://pixabay.com/api/');
  api.searchParams.set('key', key);
  api.searchParams.set('q', q);
  api.searchParams.set('per_page', '40');
  api.searchParams.set('safesearch', 'true');
  api.searchParams.set('image_type', type === 'photo' ? 'photo' : type === 'clipart' ? 'illustration' : type === 'transparent' ? 'all' : 'all');
  // Real transparent PNGs (die-cut stickers) come back when we ask for them.
  if (type === 'transparent') api.searchParams.set('colors', 'transparent');

  const res = await fetch(api.toString());
  if (!res.ok) throw new Error(`Pixabay ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map((h) => ({
    id: `px-${h.id}`,
    title: (h.tags || '').split(',')[0]?.trim() || 'Pixabay',
    thumbnail: h.previewURL,
    url: h.webformatURL || h.largeImageURL,
    width: h.imageWidth,
    height: h.imageHeight,
    source: 'Pixabay',
    license: 'Pixabay (ฟรี)',
    context: h.pageURL,
  })).filter((r) => r.thumbnail);
}

// DuckDuckGo scrape — kept for non-datacenter use; never throws upward.
async function searchDuckDuckGo(q, type) {
  const htmlRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' },
  });
  if (!htmlRes.ok) throw new Error('DDG html ' + htmlRes.status);
  const html = await htmlRes.text();
  const m = html.match(/vqd="([^"]+)"/) || html.match(/vqd=([\d-]+)&/);
  if (!m) throw new Error('DDG vqd missing');
  const vqd = m[1];

  const f = ['', '', '', type ? `type:${type}` : '', '', ''].join(',');
  const imgRes = await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=${encodeURIComponent(f)}&p=1`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!imgRes.ok) throw new Error('DDG i.js ' + imgRes.status);
  const data = await imgRes.json();
  return (data.results || []).map((it, i) => ({
    id: `ddg-${i}`,
    title: it.title,
    thumbnail: it.thumbnail || it.image,
    url: it.image,
    width: it.width,
    height: it.height,
    source: it.source || 'Web',
    license: 'เว็บ',
    context: it.url,
  })).filter((r) => r.thumbnail);
}

// Google Custom Search — best fallback, needs API key and CX.
async function searchGoogle(q, type, key, cx) {
  // Google's imgType maps: clipart -> clipart, photo -> photo, transparent -> no direct equivalent but can use fileType=png
  const api = new URL('https://www.googleapis.com/customsearch/v1');
  api.searchParams.set('key', key);
  api.searchParams.set('cx', cx);
  api.searchParams.set('q', q);
  api.searchParams.set('searchType', 'image');
  api.searchParams.set('safe', 'active');
  if (type === 'photo') api.searchParams.set('imgType', 'photo');
  else if (type === 'clipart') api.searchParams.set('imgType', 'clipart');
  
  const res = await fetch(api.toString());
  if (!res.ok) throw new Error(`Google ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((h, i) => ({
    id: `gg-${i}`,
    title: h.title || 'Google Image',
    thumbnail: h.image?.thumbnailLink || h.link,
    url: h.link,
    width: h.image?.width || 800,
    height: h.image?.height || 800,
    source: h.displayLink || 'Google',
    license: 'Google Search',
    context: h.image?.contextLink || h.link,
  })).filter((r) => r.thumbnail);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || '';
  if (!q) return json({ error: 'missing_query', results: [] }, 400);

  const key = process.env.PIXABAY_KEY || process.env.PIXABAY_API_KEY;
  const ggKey = process.env.GOOGLE_API_KEY;
  const ggCx = process.env.GOOGLE_CX;
  const notes = [];

  // 1) Pixabay first when configured — the dependable source.
  if (key) {
    try {
      const results = await searchPixabay(q, type, key);
      if (results.length) {
        return json({ results, provider: 'pixabay' }, 200, { 'Cache-Control': 's-maxage=3600' });
      }
      notes.push('pixabay:empty');
    } catch (e) {
      notes.push('pixabay:' + String(e?.message || e));
    }
  } else {
    notes.push('pixabay:no_key');
  }

  // 2) Google Custom Search if configured
  if (ggKey && ggCx) {
    try {
      const results = await searchGoogle(q, type, ggKey, ggCx);
      if (results.length) {
        return json({ results, provider: 'google', notes }, 200, { 'Cache-Control': 's-maxage=3600' });
      }
      notes.push('google:empty');
    } catch (e) {
      notes.push('google:' + String(e?.message || e));
    }
  }

  // 3) DuckDuckGo fallback — works locally, usually blocked on Vercel.
  try {
    const results = await searchDuckDuckGo(q, type);
    return json({ results, provider: 'duckduckgo', notes }, 200, { 'Cache-Control': 's-maxage=1800' });
  } catch (e) {
    notes.push('ddg:' + String(e?.message || e));
  }

  // Nothing extra from the proxy — not an error; the client's keyless sources
  // (Wikimedia, Openverse) still fill the grid.
  return json({ results: [], provider: 'none', notes }, 200);
}
