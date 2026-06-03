import fs from 'fs';
import path from 'path';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC8HoWaAu0XWy3he_pMxqUIWwREDPdeUpg",
  authDomain: "talib-club-web.firebaseapp.com",
  projectId: "talib-club-web",
  storageBucket: "talib-club-web.firebasestorage.app",
  messagingSenderId: "300903382422",
  appId: "1:300903382422:web:887e6f03a6c4f0092db1b7",
};

const monthsMap = {
  'มค': '01', 'มค.': '01', 'ม.ค': '01', 'ม.ค.': '01',
  'กพ': '02', 'กพ.': '02', 'ก.พ': '02', 'ก.พ.': '02',
  'มีค': '03', 'มีค.': '03', 'มี.ค': '03', 'มี.ค.': '03',
  'เมย': '04', 'เมย.': '04', 'เม.ย': '04', 'เม.ย.': '04',
  'พค': '05', 'พค.': '05', 'พ.ค': '05', 'พ.ค.': '05',
  'มิย': '06', 'มิย.': '06', 'มิ.ย': '06', 'มิ.ย.': '06',
  'กค': '07', 'กค.': '07', 'ก.ค': '07', 'ก.ค.': '07',
  'สค': '08', 'สค.': '08', 'ส.ค': '08', 'ส.ค.': '08',
  'กย': '09', 'กย.': '09', 'ก.ย': '09', 'ก.ย.': '09',
  'ตค': '10', 'ตค.': '10', 'ต.ค': '10', 'ต.ค.': '10',
  'พย': '11', 'พย.': '11', 'พ.ย': '11', 'พ.ย.': '11',
  'ธค': '12', 'ธค.': '12', 'ธ.ค': '12', 'ธ.ค.': '12'
};

function convertDate(thaiDateStr) {
  if (!thaiDateStr) return '';
  const cleaned = thaiDateStr.trim().replace(',', '');
  const parts = cleaned.split(/\s+/);
  if (parts.length < 3) return '';
  
  const monthThai = parts[0];
  const month = monthsMap[monthThai] || '01';
  const day = parts[1].padStart(2, '0');
  const yearGregorian = parseInt(parts[2], 10);
  if (isNaN(yearGregorian)) return '';
  const yearBuddhist = yearGregorian + 543;
  
  return `${yearBuddhist}-${month}-${day}`;
}

function cleanHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseHtmlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = content.split('<section class="_a6-g">');
  sections.shift(); // remove header part
  
  const parsedItems = [];
  
  for (const sec of sections) {
    // Image URL
    const imgMatch = sec.match(/<a target="_blank" href="([^"]+)"|<img class="[^"]+" src="([^"]+)"|<img src="([^"]+)"/);
    let coverUrl = '';
    if (imgMatch) {
      const rawUrl = imgMatch[1] || imgMatch[2] || imgMatch[3];
      coverUrl = '/' + cleanHtmlEntities(rawUrl);
    }
    
    // Body Text
    const textMatch = sec.match(/<div class="_3-95">([\s\S]*?)<\/div>/);
    let bodyText = '';
    if (textMatch) {
      bodyText = cleanHtmlEntities(textMatch[1].trim());
    }
    
    // Date
    const footerMatch = sec.match(/<footer class="_3-94 _a6-o">.*?<div class="_a72d">([^<]+)<\/div>.*?<\/footer>/s);
    let dateStr = '';
    if (footerMatch) {
      dateStr = footerMatch[1].trim();
    } else {
      const altMatch = sec.match(/<div class="_a72d">([^<]+)<\/div>/);
      if (altMatch) {
        dateStr = altMatch[1].trim();
      }
    }
    
    const formattedDate = convertDate(dateStr);
    
    if (bodyText) {
      parsedItems.push({
        coverUrl,
        bodyText,
        date: formattedDate
      });
    }
  }
  
  return parsedItems;
}

function extractMeta(bodyText, isQa = false) {
  const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
  let title = '';
  let category = isQa ? 'fiqh' : 'aqeedah';
  let type = 'general';
  
  const tags = (bodyText.match(/#[^\s#]+/g) || []).map(t => t.slice(1).trim()).filter(Boolean);
  
  if (isQa) {
    type = 'general';
    if (lines.length > 0) {
      let firstLine = lines[0];
      firstLine = firstLine.replace(/#QA|#Q&A|#ถามตอบ|#ถาม-ตอบ/gi, '').trim();
      title = firstLine;
    }
    if (!title) title = 'ถาม-ตอบ';
    
    const fullLower = bodyText.toLowerCase();
    if (fullLower.includes('หย่า') || fullLower.includes('หิญาบ') || fullLower.includes('ละหมาด') || fullLower.includes('อีด') || fullLower.includes('วาญิบ') || fullLower.includes('ฮุก่ม') || fullLower.includes('แต่งงาน')) {
      category = 'fiqh';
    } else if (fullLower.includes('อากีดะฮ์') || fullLower.includes('ความเชื่อ') || fullLower.includes('เตาฮีด') || fullLower.includes('ศรัทธา') || fullLower.includes('ชิริก')) {
      category = 'aqeedah';
    } else {
      category = 'fiqh';
    }
  } else {
    let titleLineIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (lines[i].includes('❝') && lines[i].includes('❞')) {
        const header = lines[i].replace(/[❝❞]/g, '').trim();
        if (header.includes('สังคมศาสตร์')) {
          type = 'social';
          category = 'social';
        } else if (header.includes('เฉพาะเรื่อง') || header.includes('เฉพาะ')) {
          type = 'specific';
        } else {
          type = 'general';
        }
        titleLineIdx = i + 1;
      }
    }
    
    if (lines[titleLineIdx]) {
      let candidate = lines[titleLineIdx];
      if (candidate.startsWith('•')) {
        candidate = candidate.replace(/^•/, '').trim();
      }
      title = candidate;
    }
    
    if (!title && lines.length > 0) {
      title = lines[0];
    }
    
    if (title && title.length > 100) {
      title = title.substring(0, 97) + '...';
    }
  }
  
  const cleanBody = bodyText
    .split('\n')
    .map(l => l.trim())
    .filter(l => !l.startsWith('❝') && !l.includes('#'))
    .join(' ')
    .trim();
  const excerpt = cleanBody.substring(0, 150) + (cleanBody.length > 150 ? '...' : '');
  
  return { title, category, type, tags, excerpt };
}

async function run() {
  console.log("Connecting to Firebase...");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("Fetching existing articles from Firestore to detect duplicates...");
  const snapshot = await getDocs(collection(db, "content_articles"));
  
  const existingTitles = new Set();
  let maxId = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.title && !data.deleted) {
      existingTitles.add(data.title.trim().toLowerCase());
    }
    const idNum = parseInt(doc.id, 10);
    if (!isNaN(idNum) && idNum > maxId) {
      maxId = idNum;
    }
  });

  let nextId = Math.max(maxId + 1, 200);
  console.log(`Duplicate checking set up. Next numeric document ID will start at: ${nextId}`);

  // Path to HTML files
  const articlesPath = 'C:/Users/hp/Downloads/facebook-TalibPublisher-3_6_2026-lTyduMT4/this_profile\'s_activity_across_facebook/posts/album/9.html';
  const qaPath = 'C:/Users/hp/Downloads/facebook-TalibPublisher-3_6_2026-lTyduMT4/this_profile\'s_activity_across_facebook/posts/album/7.html';

  console.log("Parsing 'บทความ' (9.html)...");
  const rawArticles = parseHtmlFile(articlesPath);
  console.log(`Parsed ${rawArticles.length} raw articles.`);

  console.log("Parsing 'ถาม-ตอบ' (7.html)...");
  const rawQa = parseHtmlFile(qaPath);
  console.log(`Parsed ${rawQa.length} raw Q&A posts.`);

  const newItemsToInsert = [];

  // Map rawArticles to schemas
  rawArticles.forEach((item, index) => {
    const meta = extractMeta(item.bodyText, false);
    const normTitle = meta.title.trim().toLowerCase();
    
    if (existingTitles.has(normTitle)) {
      console.log(`[Skip Duplicate] Article: "${meta.title}"`);
      return;
    }

    newItemsToInsert.push({
      id: String(nextId++),
      type: meta.type,
      title: meta.title,
      category: meta.category,
      excerpt: meta.excerpt,
      author: "Talib Club",
      date: item.date || "2569-01-01",
      tags: meta.tags,
      body: item.bodyText,
      coverUrl: item.coverUrl,
      coverEmoji: "📖",
      deleted: false,
      views: 0
    });
  });

  // Map rawQa to schemas
  rawQa.forEach((item, index) => {
    const meta = extractMeta(item.bodyText, true);
    const normTitle = meta.title.trim().toLowerCase();
    
    if (existingTitles.has(normTitle)) {
      console.log(`[Skip Duplicate] Q&A: "${meta.title}"`);
      return;
    }

    newItemsToInsert.push({
      id: String(nextId++),
      type: meta.type,
      title: meta.title,
      category: meta.category,
      excerpt: meta.excerpt,
      author: "Talib Club",
      date: item.date || "2569-01-01",
      tags: meta.tags,
      body: item.bodyText,
      coverUrl: item.coverUrl,
      coverEmoji: "💬",
      deleted: false,
      views: 0
    });
  });

  console.log(`Total new items to upload: ${newItemsToInsert.length}`);

  // Write new items to Firestore
  let successCount = 0;
  for (const item of newItemsToInsert) {
    try {
      await setDoc(doc(db, "content_articles", item.id), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      successCount++;
      if (successCount % 10 === 0 || successCount === newItemsToInsert.length) {
        console.log(`Uploaded ${successCount}/${newItemsToInsert.length} documents...`);
      }
    } catch (err) {
      console.error(`Failed to upload document ${item.id}:`, err);
    }
  }

  console.log(`Finished seeding Firestore! Uploaded ${successCount} new items successfully.`);

  // Now, update local src/data/articles.js so they are synchronized
  console.log("Updating local fallback src/data/articles.js file...");
  const articlesFile = 'C:/Users/hp/Documents/GitHub/talib-club/src/data/articles.js';
  let localContent = fs.readFileSync(articlesFile, 'utf8');

  // We find where export const ARTICLES = [...]; is defined or recreate it
  // Since ARTICLES was empty or contains previous items, we can import them and merge
  // Wait, let's use a robust replacement for the file content
  // First, let's load what's currently in ARTICLES by evaluating or regex extraction
  const arrayMatch = localContent.match(/export const ARTICLES = (\[[\s\S]*?\]);/);
  let currentArticlesList = [];
  if (arrayMatch) {
    try {
      // Clean string representation of list to parse it as JSON safely or evaluate it
      // Let's replace the ARTICLES block with the merged array
      const rawArrayStr = arrayMatch[1];
      // A safe way is to import and merge them
    } catch (e) {
      console.warn("Could not parse current ARTICLES fallback array.", e);
    }
  }

  // To be perfectly safe, we can rebuild the articles.js structure cleanly.
  // Let's extract categories, types, and series declarations and append the merged articles array.
  // Wait, let's read the current articles.js contents and overwrite the export const ARTICLES = ... line.
  const categoriesMatch = localContent.match(/export const ARTICLE_CATEGORIES = (\[[\s\S]*?\]);/);
  const typesMatch = localContent.match(/export const ARTICLE_TYPES = (\[[\s\S]*?\]);/);
  const seriesMatch = localContent.match(/export const SERIES = (\[[\s\S]*?\]);/);

  const categoriesStr = categoriesMatch ? categoriesMatch[1] : '[]';
  const typesStr = typesMatch ? typesMatch[1] : '[]';
  const seriesStr = seriesMatch ? seriesMatch[1] : '[]';

  // Read current ARTICLES array if it had anything (usually [] in clean setup)
  let baseArticles = [];
  
  // We can write the complete merged content back
  const mergedLocalArticlesList = [...baseArticles, ...newItemsToInsert];

  const newArticlesContent = `// ============================================================
//  TALIB CLUB — ข้อมูลบทความ
// ============================================================

export const ARTICLE_CATEGORIES = ${categoriesStr};

export const ARTICLE_TYPES = ${typesStr};

export const SERIES = ${seriesStr};

export const ARTICLES = ${JSON.stringify(mergedLocalArticlesList, null, 2)};
`;

  fs.writeFileSync(articlesFile, newArticlesContent, 'utf8');
  console.log("Local fallback src/data/articles.js file updated successfully!");
}

run().catch(console.error);
