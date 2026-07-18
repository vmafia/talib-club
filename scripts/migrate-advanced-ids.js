import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import admin from '../api/_firebase-admin.js';

const db = admin.firestore();

const COLLECTIONS = [
  { name: 'content_articles', type: 'articles' },
  { name: 'content_books', type: 'books' },
  { name: 'content_media', type: 'media' },
  { name: 'content_scholars', type: 'scholars' },
  { name: 'book_campaigns', type: 'book_campaigns' }
];

function getCategorySlug(type, item) {
  if (!item) return null;
  const mapEra = (val) => {
    if (!val) return "unknown";
    const str = String(val).trim().toLowerCase();
    if (str === "1" || str === "ยุคแรก" || str === "salaf") return "salaf";
    if (str === "2" || str === "ยุคกลาง" || str === "classical") return "classical";
    if (str === "3" || str === "ยุคฟื้นฟู" || str === "revival") return "revival";
    if (str === "4" || str === "ยุคปัจจุบัน" || str === "modern") return "modern";
    return str;
  }
  switch (type) {
    case 'articles': return item.type === 'series' && item.series ? item.series : (item.category || 'general');
    case 'books': return item.type || 'book';
    case 'media': return item.playlist || 'general';
    case 'scholars': return mapEra(item.era);
    case 'book_campaigns': return 'campaign';
    default: return null;
  }
}

async function getNextSeq(collectionName, categorySlug) {
  const counterKey = categorySlug ? `${collectionName}_${categorySlug}` : collectionName;
  const counterRef = db.collection('counters').doc(counterKey);
  
  return await db.runTransaction(async (t) => {
    const doc = await t.get(counterRef);
    let nextId = 1;
    if (doc.exists) {
      nextId = (doc.data().count || 0) + 1;
    }
    t.set(counterRef, { count: nextId });
    return nextId;
  });
}

async function migrate() {
  console.log("Starting advanced IDs migration...");
  const oldToNewMap = {}; // { [oldId]: { newId, type } }

  // 1. Migrate Main Collections
  for (const coll of COLLECTIONS) {
    console.log(`\nMigrating ${coll.name}...`);
    const snap = await db.collection(coll.name).get();
    let migratedCount = 0;

    for (const docSnap of snap.docs) {
      const oldId = docSnap.id;
      // Skip if already has hyphen (advanced format) except if we want to force re-migration (we don't)
      if (oldId.includes('-')) {
        console.log(`  Skip ${oldId} (already migrated)`);
        continue;
      }

      const data = docSnap.data();
      const slug = getCategorySlug(coll.type, data);
      const nextSeq = await getNextSeq(coll.name, slug);
      const newId = `${slug}-${nextSeq}`;

      console.log(`  Migrating ${oldId} -> ${newId}`);

      const newData = { ...data, id: newId, old_id: oldId };
      await db.collection(coll.name).doc(newId).set(newData);
      
      // If book_campaigns, we need to migrate the holds subcollection
      if (coll.type === 'book_campaigns') {
        const holdsSnap = await docSnap.ref.collection('holds').get();
        for (const holdDoc of holdsSnap.docs) {
          await db.collection(coll.name).doc(newId).collection('holds').doc(holdDoc.id).set(holdDoc.data());
          await holdDoc.ref.delete();
        }
      }

      await docSnap.ref.delete();
      oldToNewMap[oldId] = { newId, type: coll.type };
      migratedCount++;
    }
    console.log(`Finished ${coll.name}. Migrated: ${migratedCount}`);
  }

  // 2. Migrate Foreign Keys in User Collections (Bookmarks, History, Registrations)
  console.log("\nMigrating foreign keys in user collections...");

  // content_bookmarks -> articleId
  const bSnap = await db.collection('content_bookmarks').get();
  for (const b of bSnap.docs) {
    const data = b.data();
    if (data.articleId && oldToNewMap[data.articleId] && oldToNewMap[data.articleId].type === 'articles') {
      const newArticleId = oldToNewMap[data.articleId].newId;
      const newDocId = `${data.uid}_${newArticleId}`;
      console.log(`  Updating bookmark ${b.id} -> ${newDocId} (articleId: ${newArticleId})`);
      await db.collection('content_bookmarks').doc(newDocId).set({
        ...data,
        id: newDocId,
        articleId: newArticleId
      });
      await b.ref.delete();
    }
  }

  // content_history -> itemId
  const hSnap = await db.collection('content_history').get();
  for (const h of hSnap.docs) {
    const data = h.data();
    if (data.itemId && oldToNewMap[data.itemId]) {
      const newItemId = oldToNewMap[data.itemId].newId;
      const newDocId = `${data.uid}_${data.type}_${newItemId}`;
      console.log(`  Updating history ${h.id} -> ${newDocId} (itemId: ${newItemId})`);
      await db.collection('content_history').doc(newDocId).set({
        ...data,
        id: newDocId,
        itemId: newItemId
      });
      await h.ref.delete();
    }
  }

  // book_registrations -> campaignId
  const rSnap = await db.collection('book_registrations').get();
  for (const r of rSnap.docs) {
    const data = r.data();
    if (data.campaignId && oldToNewMap[data.campaignId] && oldToNewMap[data.campaignId].type === 'book_campaigns') {
      const newCampaignId = oldToNewMap[data.campaignId].newId;
      console.log(`  Updating registration ${r.id} (campaignId: ${newCampaignId})`);
      await r.ref.update({ campaignId: newCampaignId });
    }
  }

  console.log("Migration complete!");
}

migrate().catch(console.error);
