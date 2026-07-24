// Image helpers for the notebook — kept free of component state so they can be
// unit-reasoned and reused. The component wires the results into React state.

// Search several open, CORS-friendly image sources at once so a query like
// "ซัยยิด กุฏุบ" returns real photos without leaving the app. Thai + English
// Wikipedia surface the lead photo of matching articles (people, places, books),
// Wikimedia Commons adds broader media, and Openverse covers stickers/clip-art.
//
// `onPartial` (optional) is called with the Google results as soon as they land,
// so the grid can fill in before the keyless sources finish. Resolves to the
// full de-duped list.
export async function fetchWebImages(q, { onPartial } = {}) {
  const merged = [];
  const seen = new Set();
  const add = (r) => {
    if (r?.thumbnail && !seen.has(r.thumbnail)) { seen.add(r.thumbnail); merged.push(r); }
  };

  // Real Google image results via our server-side proxy. Only returns data when
  // GOOGLE_CSE_KEY / GOOGLE_CSE_CX are set in the deployment; otherwise it 503s
  // and we fall through to the keyless sources below — no error shown.
  const google = (async () => {
    try {
      const res = await fetch(`/api/image-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      (data.results || []).forEach(add);
    } catch (_) { /* proxy offline / not configured */ }
  })();

  const wikiArticles = (lang) => (async () => {
    try {
      const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=12&piprop=thumbnail&pithumbsize=400&origin=*`);
      const data = await res.json();
      Object.values(data.query?.pages || {}).forEach(p => p.thumbnail && add({
        id: `wp-${lang}-${p.pageid}`, title: p.title, thumbnail: p.thumbnail.source, url: p.thumbnail.source,
        width: p.thumbnail.width, height: p.thumbnail.height, source: 'Wikipedia', license: 'สาธารณะ/CC'
      }));
    } catch (_) { /* one source failing shouldn't sink the search */ }
  })();

  const commons = (async () => {
    try {
      const res = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&origin=*`);
      const data = await res.json();
      Object.values(data.query?.pages || {}).forEach(p => {
        const ii = p.imageinfo?.[0];
        if (ii?.thumburl) add({
          id: `cm-${p.pageid}`, title: p.title.replace('File:', ''), thumbnail: ii.thumburl, url: ii.thumburl,
          width: ii.thumbwidth, height: ii.thumbheight, source: 'Commons',
          license: ii.extmetadata?.LicenseShortName?.value || 'CC', creator: ii.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '')
        });
      });
    } catch (_) { /* ignore */ }
  })();

  const openverse = (async () => {
    try {
      const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=24&mature=false`);
      const data = await res.json();
      (data.results || []).forEach(im => add({
        id: `ov-${im.id}`, title: im.title, thumbnail: im.thumbnail || im.url, url: im.url,
        width: im.width, height: im.height, source: 'Openverse', license: im.license, creator: im.creator
      }));
    } catch (_) { /* ignore */ }
  })();

  // Google first (if configured) so its results head the grid; surface them
  // immediately, then fill in the keyless sources.
  await google;
  if (merged.length) onPartial?.([...merged]);
  await Promise.all([wikiArticles('th'), wikiArticles('en'), commons, openverse]);
  return [...merged];
}

// Pull the best image reference out of a drag payload. The actual dragged image
// usually rides in text/html (<img src>); page/URL drags fall back to uri-list.
export function imageUrlFromDataTransfer(dt) {
  const html = dt.getData('text/html');
  if (html) { const m = html.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) return m[1]; }
  const uri = dt.getData('text/uri-list');
  if (uri) return uri.split('\n').find(l => l && !l.startsWith('#')) || '';
  const plain = dt.getData('text/plain');
  if (plain && /^https?:\/\//i.test(plain.trim())) return plain.trim();
  return '';
}

// Try to inline a remote image as a data URL (so it survives export/offline); on
// CORS/network failure, fall back to referencing the remote URL as-is.
export async function fetchAsDataUrlOrRemote(url) {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    if (blob.type.startsWith('image/')) {
      return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
    }
  } catch (_) { /* CORS or network: reference the remote URL instead */ }
  return url;
}
