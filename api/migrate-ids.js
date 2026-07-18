import admin from "./_firebase-admin.js";

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

export default async function handler(req, res) {
  try {
    const db = admin.firestore();
    const collections = ["articles", "library", "media", "scholars", "book_campaigns"];
    
    const logs = [];
    
    for (const colName of collections) {
      logs.push(`Processing collection: ${colName}...`);
      const snap = await db.collection(colName).get();
      
      for (const doc of snap.docs) {
        const data = doc.data();
        const oldId = doc.id;
        
        // UUID is 36 chars with 4 hyphens. Firestore auto-id is 20 chars alphanumeric.
        const isFirestoreId = oldId.length === 20 && !oldId.includes('-');
        const isUUID = oldId.length === 36 && oldId.split('-').length === 5;
        
        if (!isFirestoreId && !isUUID) {
          continue;
        }
        
        let newId = generateDocId(data);
        
        let idCounter = 1;
        let finalNewId = newId;
        while (true) {
          const existSnap = await db.collection(colName).doc(finalNewId).get();
          if (!existSnap.exists) break;
          finalNewId = `${newId}-${idCounter}`;
          idCounter++;
        }
        newId = finalNewId;
        
        logs.push(`Migrating [${colName}] ${oldId} -> ${newId}`);
        
        data.id = newId; 
        await db.collection(colName).doc(newId).set(data);
        
        if (colName === "articles") {
          const bSnap = await db.collection("content_bookmarks").where("articleId", "==", oldId).get();
          for (const bDoc of bSnap.docs) {
            await bDoc.ref.update({ articleId: newId });
          }
          
          const sSnap = await db.collection("content_reading_sessions").where("contentId", "==", oldId).get();
          for (const sDoc of sSnap.docs) {
            await sDoc.ref.update({ contentId: newId });
          }
          const sSnap2 = await db.collection("content_reading_sessions").where("articleId", "==", oldId).get();
          for (const sDoc of sSnap2.docs) {
            await sDoc.ref.update({ articleId: newId });
          }
        }
        
        await db.collection(colName).doc(oldId).delete();
      }
    }
    
    // Force cache invalidation on clients
    const metaPayload = {};
    const now = Date.now();
    for (const col of collections) {
      metaPayload[col] = now;
    }
    await db.collection("site_settings").doc("content_meta").set(metaPayload, { merge: true });
    
    res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({ error: error.message });
  }
}
