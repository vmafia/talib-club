import admin from "./_firebase-admin.js";

export default async function handler(req, res) {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection("content_articles").get();
    
    const titles = {};
    const duplicates = [];
    const ids = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      ids.push(doc.id);
      if (titles[data.title]) {
        duplicates.push({
          title: data.title,
          id1: titles[data.title],
          id2: doc.id
        });
      } else {
        titles[data.title] = doc.id;
      }
    });

    res.status(200).json({
      total: snapshot.docs.length,
      duplicateCount: duplicates.length,
      duplicates: duplicates.slice(0, 10),
      allIds: ids.slice(0, 50)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
