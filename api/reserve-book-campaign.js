import admin, { verifyIdToken } from "./_firebase-admin.js";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://talibclub.org";

function send(res, status, data) {
  const headers = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (typeof res.setHeader === "function") {
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  return { statusCode: status, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body !== "string") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

async function requireUser(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const error = new Error("Unauthorized: Missing authentication token");
    error.status = 401;
    throw error;
  }
  return verifyIdToken(authHeader.substring(7));
}

export default async function handler(req, res) {
  const method = req.method || req.httpMethod;
  if (method === "OPTIONS") return send(res, 200, { ok: true });
  if (method !== "POST") return send(res, 405, { error: "Method Not Allowed" });

  let token;
  try { token = await requireUser(req); } catch (error) { return send(res, error.status || 401, { error: error.message }); }

  const campaignId = String(parseBody(req).campaignId || "").trim().slice(0, 120);
  if (!campaignId) return send(res, 400, { error: "Missing campaignId" });

  try {
    const db = admin.firestore();
    const campaignRef = db.doc(`book_campaigns/${campaignId}`);
    const holdRef = campaignRef.collection("holds").doc(token.uid);
    const hold = await db.runTransaction(async (tx) => {
      const campaignSnap = await tx.get(campaignRef);
      if (!campaignSnap.exists) throw new Error("Campaign not found");
      const campaign = campaignSnap.data() || {};
      if (campaign.status !== "active") throw new Error("Campaign is not active");

      const quota = Number(campaign.quota || 0);
      const timeLimit = Number(campaign.timeLimit || 15);
      if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(timeLimit) || timeLimit <= 0) throw new Error("Campaign settings are invalid");

      const existingHold = await tx.get(holdRef);
      if (existingHold.exists) {
        const data = existingHold.data() || {};
        if (data.status === "completed") return { status: "completed" };
        const expiry = data.expiresAt?.toDate?.();
        if (data.status === "reserved" && expiry && expiry > new Date()) {
          return { status: "reserved", expiresAt: expiry.toISOString() };
        }
      }

      const activeHolds = campaignRef.collection("holds").where("status", "==", "reserved");
      const activeHoldsSnap = await tx.get(activeHolds);
      
      let activeCount = 0;
      const nowMs = Date.now();
      activeHoldsSnap.forEach(doc => {
        const d = doc.data();
        if (d.expiresAt && d.expiresAt.toMillis() > nowMs) {
          activeCount++;
        }
      });
      
      const completedHoldsSnap = await tx.get(campaignRef.collection("holds").where("status", "==", "completed"));
      if (activeCount + completedHoldsSnap.size >= quota) throw new Error("Campaign quota is full");

      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + timeLimit * 60 * 1000);
      tx.set(holdRef, {
        uid: token.uid,
        status: "reserved",
        expiresAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { status: "reserved", expiresAt: expiresAt.toDate().toISOString() };
    });
    return send(res, 200, { success: true, hold });
  } catch (error) {
    console.error("reserve-book-campaign failed:", error);
    return send(res, 400, { error: error.message || "Could not reserve campaign" });
  }
}
