import admin from './_firebase-admin.js';

const db = admin.firestore();

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;|&amp;|&lt;|&gt;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(text, maxLen = 160) {
  if (!text) return '';
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen - 3).trim() + '...';
}

function generateHtml({ title, description, canonical, ogImage, ogType = 'website', jsonLd, bodyContent }) {
  const SITE_NAME = 'Talib Club';
  
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="th_TH">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
  
  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}">` : ''}
  
  ${jsonLd ? `<script type="application/ld+json">\n${JSON.stringify(jsonLd)}\n</script>` : ''}
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600&display=swap" rel="stylesheet">
  
  <style>
    body { font-family: 'Prompt', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #0f6e56; }
    a { color: #0f6e56; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    nav { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
    nav a { margin-right: 15px; }
  </style>
  
  <!-- Redirect user browsers back to the SPA if they somehow hit this endpoint -->
  <!-- <meta http-equiv="refresh" content="0;url=${canonical}"> -->
</head>
<body>
  <nav>
    <a href="/">หน้าแรก</a>
    <a href="/articles">บทความ</a>
    <a href="/library">ห้องสมุด</a>
    <a href="/media">มีเดีย</a>
    <a href="/scholars">ทำเนียบบุคคล</a>
  </nav>
  <main>
    ${bodyContent}
  </main>
  <script>
    // Redirect normal browsers to the SPA path so hydration works correctly
    if (!navigator.userAgent.match(/bot|crawler|spider|crawling/i)) {
      window.location.replace('${new URL(canonical).pathname}${new URL(canonical).search}');
    }
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    // When rewriting in Vercel, req.url might be the rewritten path or original path.
    // Usually x-vercel-rewrite-path-info contains the original requested path if rewritten.
    const pathInfo = req.headers['x-vercel-rewrite-path-info'];
    const requestUrl = pathInfo ? `${protocol}://${host}${pathInfo}` : `${protocol}://${host}${req.url}`;
    const url = new URL(requestUrl);
    const path = url.pathname;
    const id = url.searchParams.get('id');
    const BASE_URL = 'https://talibclub.org';
    const canonical = `${BASE_URL}${path}${id ? \`?id=\${id}\` : ''}`;

    let html = '';

    if (path === '/' || path === '') {
      html = generateHtml({
        title: 'Talib Club | แหล่งศึกษาอิสลามแนวทางสะลัฟ',
        description: 'คลังความรู้อิสลามวิชาการ สำหรับมุสลิมและผู้สนใจทุกท่าน รวมบทความ หนังสือ สื่อการเรียนรู้ และทำเนียบนักวิชาการ',
        canonical,
        ogImage: `${BASE_URL}/logo.png`,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "Talib Club",
          "url": BASE_URL
        },
        bodyContent: `
          <h1>Talib Club — แหล่งศึกษาอิสลามแนวทางสะลัฟ</h1>
          <p>คลังความรู้อิสลามวิชาการ สำหรับมุสลิมและผู้สนใจทุกท่าน รวมบทความวิชาการ หนังสือ สื่อการเรียนรู้ และทำเนียบนักวิชาการ</p>
        `
      });
    } else if (path === '/article' && id) {
      const doc = await db.collection('content_articles').doc(id).get();
      if (doc.exists) {
        const article = doc.data();
        const plainBody = stripHtml(article.body || article.excerpt || '');
        const desc = truncate(plainBody, 160);
        html = generateHtml({
          title: `${article.title} | Talib Club`,
          description: desc,
          canonical,
          ogImage: article.coverUrl || `${BASE_URL}/logo.png`,
          ogType: 'article',
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": article.title,
            "author": { "@type": "Person", "name": article.author || "Talib Club" },
            "datePublished": article.date || undefined,
            "image": article.coverUrl || undefined,
            "description": truncate(plainBody, 200)
          },
          bodyContent: `
            <article>
              <h1>${article.title}</h1>
              ${article.coverUrl ? `<img src="${article.coverUrl}" alt="${article.title}">` : ''}
              <p><strong>ผู้เขียน:</strong> ${article.author || '-'} | <strong>วันที่:</strong> <time>${article.date || '-'}</time></p>
              <div>${article.body || plainBody}</div>
            </article>
          `
        });
      }
    } else if (path === '/articles') {
      const snap = await db.collection('content_articles').orderBy('date', 'desc').limit(20).get();
      const articles = snap.docs.map(d => ({id: d.id, ...d.data()}));
      
      let listHtml = '<h1>บทความวิชาการอิสลาม</h1><ul>';
      articles.forEach(a => {
        listHtml += \`<li><a href="/article?id=\${a.id}">\${a.title}</a> - \${a.author}</li>\`;
      });
      listHtml += '</ul>';

      html = generateHtml({
        title: 'บทความวิชาการอิสลาม | Talib Club',
        description: 'รวมบทความวิชาการอิสลามแนวทางสะลัฟ ครอบคลุมอากีดะฮ์ ฟิกฮ์ ซีเราะฮ์ ฮะดีษ ตัฟซีร และสังคมศาสตร์อิสลาม',
        canonical,
        bodyContent: listHtml
      });
    } else if (path === '/library-detail' && id) {
      const doc = await db.collection('content_books').doc(id).get();
      if (doc.exists) {
        const book = doc.data();
        html = generateHtml({
          title: `${book.title} | Talib Club`,
          description: book.description || `ดาวน์โหลดหนังสือ ${book.title}`,
          canonical,
          ogImage: book.coverUrl || `${BASE_URL}/logo.png`,
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Book",
            "name": book.title,
            "author": { "@type": "Person", "name": book.author || "Talib Club" },
            "description": book.description
          },
          bodyContent: `
            <article>
              <h1>${book.title}</h1>
              ${book.coverUrl ? `<img src="${book.coverUrl}" alt="${book.title}">` : ''}
              <p>${book.description || ''}</p>
            </article>
          `
        });
      }
    } else if (path === '/media-detail' && id) {
      const doc = await db.collection('content_media').doc(id).get();
      if (doc.exists) {
        const media = doc.data();
        html = generateHtml({
          title: `${media.title} | Talib Club`,
          description: media.description || media.series || `สื่อการเรียนรู้อิสลาม: ${media.title}`,
          canonical,
          ogImage: media.thumbnailUrl || media.coverUrl || `${BASE_URL}/logo.png`,
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": media.title,
            "description": media.description || media.title,
            "thumbnailUrl": media.thumbnailUrl || media.coverUrl
          },
          bodyContent: `
            <article>
              <h1>${media.title}</h1>
              ${(media.thumbnailUrl || media.coverUrl) ? `<img src="${media.thumbnailUrl || media.coverUrl}" alt="${media.title}">` : ''}
              <p>${media.description || media.series || ''}</p>
            </article>
          `
        });
      }
    } else {
      // Fallback for /library, /media, /scholars, /donate and not found
      html = generateHtml({
        title: 'Talib Club | แหล่งศึกษาอิสลามแนวทางสะลัฟ',
        description: 'คลังความรู้อิสลามวิชาการ สำหรับมุสลิมและผู้สนใจทุกท่าน',
        canonical,
        bodyContent: `<h1>Talib Club</h1><p>กรุณารอสักครู่ กำลังพาคุณเข้าสู่เว็บไซต์...</p>`
      });
    }

    if (!html) {
      html = generateHtml({
        title: 'ไม่พบเนื้อหา | Talib Club',
        description: 'เนื้อหาที่คุณค้นหาอาจถูกลบหรือไม่มีอยู่',
        canonical,
        bodyContent: `<h1>ไม่พบเนื้อหา</h1><p>ขออภัย ไม่พบหน้าที่คุณต้องการ</p><a href="/">กลับหน้าแรก</a>`
      });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error('Prerender error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(500).send('<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Server Error</h1></body></html>');
  }
}
