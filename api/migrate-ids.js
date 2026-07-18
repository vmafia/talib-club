import admin from "./_firebase-admin.js";

export default async function handler(req, res) {
  try {
    const db = admin.firestore();
    const collections = [
      { name: "content_articles", metaKey: "articles" },
      { name: "content_books", metaKey: "books" },
      { name: "content_media", metaKey: "media" },
      { name: "content_scholars", metaKey: "scholars" },
      { name: "book_campaigns", metaKey: "book_campaigns" }
    ];
    
    const logs = [];
    
    for (const col of collections) {
      const colName = col.name;
      logs.push(`Processing collection: ${colName}...`);
      const snap = await db.collection(colName).get();
      
      // Sort documents by createdAt to assign sequential IDs chronically
      const docs = snap.docs.map(doc => ({
         oldId: doc.id,
         data: doc.data(),
         createdAt: doc.data().createdAt?.toMillis ? doc.data().createdAt.toMillis() : (doc.data().createdAt || 0)
      })).sort((a, b) => a.createdAt - b.createdAt);
      
      let nextId = 1;
      
      for (const item of docs) {
        const { oldId, data } = item;
        
        // Skip if it's already a sequential ID (e.g. "1", "2")
        if (/^\d+$/.test(oldId)) {
           nextId = Math.max(nextId, parseInt(oldId, 10) + 1);
           continue; 
        }
        
        let newId = String(nextId);
        
        // Ensure newId doesn't collide with existing oldIds that happen to be numbers
        while (true) {
          const existSnap = await db.collection(colName).doc(String(newId)).get();
          if (!existSnap.exists) break;
          newId = String(parseInt(newId, 10) + 1);
        }
        
        nextId = parseInt(newId, 10) + 1;
        
        logs.push(`Migrating [${colName}] ${oldId} -> ${newId}`);
        
        data.id = newId; 
        await db.collection(colName).doc(newId).set(data);
        
        if (colName === "content_articles") {
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
      
      // Save the latest sequence ID to the counters collection
      await db.collection("counters").doc(col.metaKey).set({ count: nextId - 1 }, { merge: true });
    }
    
    // Force cache invalidation on clients
    const metaPayload = {};
    const now = Date.now();
    for (const col of collections) {
      metaPayload[col.metaKey] = now;
    }
    await db.collection("site_settings").doc("content_meta").set(metaPayload, { merge: true });
    
    res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({ error: error.message });
  }
}
