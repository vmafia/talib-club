export const config = {
  runtime: 'edge',
};

// Server-side proxy for DuckDuckGo Image Search.
// This replaces the old Google Custom Search JSON API which requires a paid plan or specific project whitelisting.
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) {
      return new Response(JSON.stringify({ error: 'missing_query', results: [] }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // 1) Get VQD token from DDG HTML
    const ddgHtmlRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' }
    });
    
    if (!ddgHtmlRes.ok) {
        throw new Error('DuckDuckGo HTML fetch failed: ' + ddgHtmlRes.status);
    }
    
    const html = await ddgHtmlRes.text();
    // DDG has shipped both `vqd="..."` and `vqd=...&` over time; accept either so
    // one markup tweak upstream doesn't take image search down.
    const vqdMatch = html.match(/vqd="([^"]+)"/) || html.match(/vqd=([\d-]+)&/);
    if (!vqdMatch) {
        throw new Error('DuckDuckGo VQD token not found in HTML response');
    }
    const vqd = vqdMatch[1];

    // Image filters, in DDG's own `f=time,size,color,type,layout,license` order.
    // These are what make the search actually useful in a notebook: transparent
    // PNGs for stickers, clip-art for decoration, large for backgrounds.
    const pick = (name, allowed) => {
      const v = url.searchParams.get(name);
      return v && allowed.includes(v) ? `${name}:${v}` : '';
    };
    const f = [
      '',
      pick('size', ['Small', 'Medium', 'Large', 'Wallpaper']),
      pick('color', ['color', 'Monochrome', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Brown', 'Black', 'Gray', 'Teal', 'White']),
      pick('type', ['photo', 'clipart', 'gif', 'transparent', 'line']),
      pick('layout', ['Square', 'Tall', 'Wide']),
      '',
    ].join(',');

    // 2) Fetch images using the VQD token
    const ddgImgRes = await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=${encodeURIComponent(f)}&p=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!ddgImgRes.ok) {
        throw new Error('DuckDuckGo Images fetch failed: ' + ddgImgRes.status);
    }

    const data = await ddgImgRes.json();
    const results = (data.results || []).map((it, i) => ({
      id: `ddg-${i}`,
      title: it.title,
      thumbnail: it.thumbnail || it.image,
      url: it.image,
      width: it.width,
      height: it.height,
      source: it.source || 'Web',
      license: 'เว็บ',
      context: it.url,
    })).filter(r => r.thumbnail);

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=3600' },
    });
  } catch (error) {
    console.error("DDG Search Error:", error);
    return new Response(JSON.stringify({ error: String(error?.message || error), results: [] }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
