import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import admin from "./api/_firebase-admin.js";

function generateDocId(item) {
  if (!item) return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  
  if (item.seriesId && item.part) {
    const seriesSlug = String(item.seriesId).trim().toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\w\u0E00-\u0E7F\-]/g, '');
    if (seriesSlug) return `${seriesSlug}-${item.part}`;
  }
  
  const base = item.title || item.name || item.subject || "";
  if (base) {
    const slug = base.trim().toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\w\u0E00-\u0E7F\-]/g, '');
    
    if (slug) {
      const rand = Math.random().toString(36).substring(2, 7);
      return `${slug}-${rand}`;
    }
  }
  
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

async function run() {
  const db = admin.firestore();
  const collections = ["articles", "library", "media", "scholars", "book_campaigns"];
  
  for (const colName of collections) {
    console.log(`Processing collection: ${colName}...`);
    const snap = await db.collection(colName).get();
    
    for (const doc of snap.docs) {
      const data = doc.data();
      const oldId = doc.id;
      
      // Check if it looks like an old auto-generated ID (20 chars, no hyphens)
      const isAutoId = oldId.length === 20 && !oldId.includes('-');
      
      if (!isAutoId) {
        // Skip already migrated ones
        continue;
      }
      
      let newId = generateDocId(data);
      
      // In case generated ID already exists (rare, but possible)
      let idCounter = 1;
      let finalNewId = newId;
      while (true) {
        const existSnap = await db.collection(colName).doc(finalNewId).get();
        if (!existSnap.exists) break;
        finalNewId = `${newId}-${idCounter}`;
        idCounter++;
      }
      newId = finalNewId;
      
      console.log(`Migrating [${colName}] ${oldId} -> ${newId}`);
      
      data.id = newId; // Update internal ID field
      
      // Save new document
      await db.collection(colName).doc(newId).set(data);
      
      // Migrate references if collection is articles
      if (colName === "articles") {
        // Bookmarks
        const bSnap = await db.collection("content_bookmarks").where("articleId", "==", oldId).get();
        for (const bDoc of bSnap.docs) {
          await bDoc.ref.update({ articleId: newId });
        }
        
        // Reading Sessions - usually has 'contentId' but let's check both
        const sSnap = await db.collection("content_reading_sessions").where("contentId", "==", oldId).get();
        for (const sDoc of sSnap.docs) {
          await sDoc.ref.update({ contentId: newId });
        }
        const sSnap2 = await db.collection("content_reading_sessions").where("articleId", "==", oldId).get();
        for (const sDoc of sSnap2.docs) {
          await sDoc.ref.update({ articleId: newId });
        }
      }
      
      // Delete old document
      await db.collection(colName).doc(oldId).delete();
    }
  }
  
  console.log("Migration complete.");
}

run().catch(console.error);
