import admin from "./_firebase-admin.js";

export default async function handler(req, res) {
  try {
    const db = admin.firestore();
    const collections = ["articles", "library", "media", "scholars", "book_campaigns"];
    
    const now = Date.now();
    const metaPayload = {};
    for (const col of collections) {
      metaPayload[col] = now;
    }
    
    await db.collection("site_settings").doc("content_meta").set(metaPayload, { merge: true });
    
    res.status(200).json({ success: true, message: "Metadata updated, cache will be invalidated on clients." });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
}
