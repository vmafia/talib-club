import { readFileSync } from 'fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(
  readFileSync('C:/Users/hp/Downloads/talib-club-web-firebase-adminsdk-fbsvc-c2318098e8.json', 'utf8')
);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

const COLLECTIONS = [
  { name: 'content_articles', type: 'articles' },
  { name: 'content_books', type: 'books' },
  { name: 'content_media', type: 'media' },
  { name: 'content_scholars', type: 'scholars' },
  { name: 'book_campaigns', type: 'book_campaigns' },
  { name: 'openhouse_booths', type: 'openhouse_booths' }
];

function getCategorySlug(type, item) {
  if (!item) return null;
  const mapEra = (val) => {
    if (!val) return 'unknown';
    const str = String(val).trim().toLowerCase();
    if (str === '1' || str === 'ยุคแรก' || str === 'salaf') return 'salaf';
    if (str === '2' || str === 'ยุคกลาง' || str === 'classical') return 'classical';
    if (str === '3' || str === 'ยุคฟื้นฟู' || str === 'revival') return 'revival';
    if (str === '4' || str === 'ยุคปัจจุบัน' || str === 'modern') return 'modern';
    return str;
  }
  switch (type) {
    case 'articles': {
      const artType = (item.type || 'general').toLowerCase();
      if (artType === 'series' && item.series) return item.series.toLowerCase();
      return artType;
    }
    case 'books':
      return (item.type || 'book').toLowerCase();
    case 'media':
      return (item.playlist || 'media').toLowerCase();
    case 'scholars':
      return mapEra(item.era);
    case 'book_campaigns':
      return 'campaign';
    case 'openhouse_booths':
      return (item.slug || 'booth').toLowerCase();
    default:
      return null;
  }
}

// Strip Thai characters from slug, keep only English/numbers/hyphens
function sanitizeSlug(slug) {
  if (!slug) return 'unknown';
  // Remove Thai unicode range and other non-ascii
  let clean = slug.replace(/[\u0E00-\u0E7F]/g, '').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean || 'unknown';
}

function needsMigration(docId) {
  if (/^\d+$/.test(docId)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(docId)) return true;
  if (docId.includes('-') && /[A-Z]/.test(docId.split('-')[0])) return true;
  // Has Thai characters
  if (/[\u0E00-\u0E7F]/.test(docId)) return true;
  // Has special characters not allowed
  if (/[^a-z0-9-]/.test(docId)) return true;
  return false;
}

const localCounters = {};

async function getNextSeq(collectionName, categorySlug) {
  const counterKey = categorySlug ? `${collectionName}_${categorySlug}` : collectionName;
  if (localCounters[counterKey] === undefined) {
    const counterRef = db.collection('counters').doc(counterKey);
    const doc = await counterRef.get();
    localCounters[counterKey] = doc.exists ? (doc.data().count || 0) : 0;
  }
  localCounters[counterKey]++;
  return localCounters[counterKey];
}

async function saveAllCounters() {
  const batch = db.batch();
  for (const [key, count] of Object.entries(localCounters)) {
    batch.set(db.collection('counters').doc(key), { count });
  }
  await batch.commit();
  console.log(`  Saved ${Object.keys(localCounters).length} counters`);
}

async function migrate() {
  console.log('=== Starting Full Migration ===\n');
  
  // Reset counters
  console.log('Resetting old counters...');
  const counterSnap = await db.collection('counters').get();
  if (counterSnap.docs.length > 0) {
    const batch = db.batch();
    for (const doc of counterSnap.docs) batch.delete(doc.ref);
    await batch.commit();
    console.log(`  Deleted ${counterSnap.docs.length} old counters`);
  }

  const oldToNewMap = {};

  for (const coll of COLLECTIONS) {
    console.log(`\n--- ${coll.name} ---`);
    const snap = await db.collection(coll.name).get();
    let migrated = 0, skipped = 0;

    const toMigrate = [];
    const alreadyGood = [];
    
    for (const docSnap of snap.docs) {
      if (needsMigration(docSnap.id)) {
        toMigrate.push(docSnap);
      } else {
        alreadyGood.push(docSnap);
        skipped++;
      }
    }

    // Account for existing good IDs in counters
    for (const docSnap of alreadyGood) {
      const match = docSnap.id.match(/^(.+)-(\d+)$/);
      if (match) {
        const counterKey = `${coll.name}_${match[1]}`;
        const num = parseInt(match[2], 10);
        if (localCounters[counterKey] === undefined || localCounters[counterKey] < num) {
          localCounters[counterKey] = num;
        }
      }
    }

    for (const docSnap of toMigrate) {
      const oldId = docSnap.id;
      const data = docSnap.data();
      const originalId = data.old_id || oldId;
      
      let slug = getCategorySlug(coll.type, data);
      slug = sanitizeSlug(slug);
      
      const nextSeq = await getNextSeq(coll.name, slug);
      const newId = `${slug}-${nextSeq}`;

      console.log(`  ${oldId} -> ${newId}`);

      const newData = { ...data, id: newId, old_id: originalId };
      delete newData.undefined;
      
      await db.collection(coll.name).doc(newId).set(newData);
      
      if (coll.type === 'book_campaigns') {
        const holdsSnap = await docSnap.ref.collection('holds').get();
        for (const holdDoc of holdsSnap.docs) {
          await db.collection(coll.name).doc(newId).collection('holds').doc(holdDoc.id).set(holdDoc.data());
          await holdDoc.ref.delete();
        }
      }

      await docSnap.ref.delete();
      oldToNewMap[oldId] = { newId, type: coll.type };
      if (originalId !== oldId) oldToNewMap[originalId] = { newId, type: coll.type };
      migrated++;
    }
    console.log(`  Result: migrated=${migrated}, skipped=${skipped}`);
  }

  console.log('\nSaving counters...');
  await saveAllCounters();

  // Foreign keys
  console.log('\n--- Foreign Keys ---');

  const bSnap = await db.collection('content_bookmarks').get();
  let bmCount = 0;
  for (const b of bSnap.docs) {
    const data = b.data();
    if (data.articleId && oldToNewMap[data.articleId]?.type === 'articles') {
      const newId = oldToNewMap[data.articleId].newId;
      const newDocId = `${data.uid}_${newId}`;
      await db.collection('content_bookmarks').doc(newDocId).set({ ...data, id: newDocId, articleId: newId });
      await b.ref.delete();
      bmCount++;
    }
  }
  console.log(`  Bookmarks: ${bmCount}`);

  const hSnap = await db.collection('content_history').get();
  let hCount = 0;
  for (const h of hSnap.docs) {
    const data = h.data();
    if (data.itemId && oldToNewMap[data.itemId]) {
      const newId = oldToNewMap[data.itemId].newId;
      const newDocId = `${data.uid}_${data.type}_${newId}`;
      await db.collection('content_history').doc(newDocId).set({ ...data, id: newDocId, itemId: newId });
      await h.ref.delete();
      hCount++;
    }
  }
  console.log(`  History: ${hCount}`);

  const rSnap = await db.collection('book_registrations').get();
  let rCount = 0;
  for (const r of rSnap.docs) {
    const data = r.data();
    if (data.campaignId && oldToNewMap[data.campaignId]?.type === 'book_campaigns') {
      await r.ref.update({ campaignId: oldToNewMap[data.campaignId].newId });
      rCount++;
    }
  }
  console.log(`  Registrations: ${rCount}`);

  console.log(`\n✅ Done! Total mappings: ${Object.keys(oldToNewMap).length}`);
}

migrate().catch(err => { console.error('FAILED:', err); process.exit(1); });
