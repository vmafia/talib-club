import admin from "./_firebase-admin.js";
export default async function handler(req, res) {
  try {
    const db = admin.firestore();
    const snap = await db.collection("content_articles").get();
    const ids = snap.docs.map(doc => doc.id);
    res.status(200).json({ ids });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
