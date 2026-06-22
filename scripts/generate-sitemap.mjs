import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://talib.club';
const PROJECT_ID = 'talib-club-web';

async function fetchDocuments(collectionName) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}?pageSize=300`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Sitemap] Warning: Failed to fetch ${collectionName} (${res.status} ${res.statusText})`);
      return [];
    }
    const data = await res.json();
    return data.documents || [];
  } catch (err) {
    console.error(`[Sitemap] Error fetching ${collectionName}:`, err.message);
    return [];
  }
}

function getField(doc, fieldName, type = 'stringValue') {
  if (doc.fields && doc.fields[fieldName]) {
    return doc.fields[fieldName][type];
  }
  return null;
}

function isDeleted(doc) {
  const deletedVal = getField(doc, 'deleted', 'booleanValue');
  return deletedVal === true;
}

function getDocId(doc) {
  const idVal = getField(doc, 'id', 'stringValue');
  if (idVal) return idVal;
  return doc.name.split('/').pop();
}

function getFormattedDate(doc) {
  if (doc.updateTime) {
    return doc.updateTime.split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

async function generate() {
  console.log('[Sitemap] Generating sitemap.xml...');
  const urls = [];

  // 1. Add static pages
  const today = new Date().toISOString().split('T')[0];
  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/articles', priority: '0.8', changefreq: 'daily' },
    { path: '/library', priority: '0.8', changefreq: 'daily' },
    { path: '/media', priority: '0.8', changefreq: 'daily' },
    { path: '/scholars', priority: '0.8', changefreq: 'weekly' },
    { path: '/donate', priority: '0.5', changefreq: 'monthly' }
  ];

  for (const page of staticPages) {
    urls.push({
      loc: `${BASE_URL}${page.path}`,
      lastmod: today,
      changefreq: page.changefreq,
      priority: page.priority
    });
  }

  // 2. Fetch dynamic items from Firestore REST API
  const [articles, books, media] = await Promise.all([
    fetchDocuments('content_articles'),
    fetchDocuments('content_books'),
    fetchDocuments('content_media')
  ]);

  // 3. Process Articles
  articles.forEach(doc => {
    if (isDeleted(doc)) return;
    const id = getDocId(doc);
    urls.push({
      loc: `${BASE_URL}/article?id=${id}`,
      lastmod: getFormattedDate(doc),
      changefreq: 'weekly',
      priority: '0.7'
    });
  });

  // 4. Process Books
  books.forEach(doc => {
    if (isDeleted(doc)) return;
    const id = getDocId(doc);
    urls.push({
      loc: `${BASE_URL}/library-detail?id=${id}`,
      lastmod: getFormattedDate(doc),
      changefreq: 'weekly',
      priority: '0.7'
    });
  });

  // 5. Process Media
  media.forEach(doc => {
    if (isDeleted(doc)) return;
    const id = getDocId(doc);
    urls.push({
      loc: `${BASE_URL}/media-detail?id=${id}`,
      lastmod: getFormattedDate(doc),
      changefreq: 'weekly',
      priority: '0.7'
    });
  });

  // 6. Generate XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const url of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${url.loc}</loc>\n`;
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += '  </url>\n';
  }
  xml += '</urlset>\n';

  // 7. Write to public/sitemap.xml and dist/sitemap.xml (if dist exists)
  const publicPath = path.resolve(process.cwd(), 'public/sitemap.xml');
  fs.writeFileSync(publicPath, xml, 'utf8');
  console.log(`[Sitemap] Written to ${publicPath}`);

  const distPath = path.resolve(process.cwd(), 'dist/sitemap.xml');
  const distDir = path.dirname(distPath);
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(distPath, xml, 'utf8');
    console.log(`[Sitemap] Written to ${distPath}`);
  } else {
    console.log('[Sitemap] Dist directory not found, skipping writing to dist/sitemap.xml');
  }
}

generate().catch(err => {
  console.error('[Sitemap] Generation failed:', err);
});
