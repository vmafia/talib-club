import admin, { verifyIdToken } from './_firebase-admin.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://talibclub.org";

function send(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(data),
  };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

async function requireUser(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const err = new Error("Unauthorized: Missing authentication token");
    err.status = 401;
    throw err;
  }
  return verifyIdToken(authHeader.substring(7));
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validatePayload(body) {
  const campaignId = cleanText(body.campaignId, 120);
  const slipUrl = cleanText(body.slipUrl, 1200);
  const registration = {
    name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 30),
    address: cleanText(body.address, 1000),
    zipcode: cleanText(body.zipcode, 20),
    contact: cleanText(body.contact, 120),
  };

  if (!campaignId) throw new Error("Missing campaignId");
  if (!slipUrl || !/^https:\/\//i.test(slipUrl)) throw new Error("Invalid slipUrl");
  if (!registration.name || !registration.phone || !registration.address || !registration.zipcode) {
    throw new Error("Missing required registration fields");
  }

  return { campaignId, slipUrl, registration };
}

export default async function handler(req, res) {
  const method = req.method || req.httpMethod;
  if (method === "OPTIONS") return send(res, 200, { ok: true });
  if (method !== "POST") return send(res, 405, { error: "Method Not Allowed" });

  let decodedToken;
  try {
    decodedToken = await requireUser(req);
  } catch (err) {
    return send(res, err.status || 401, { error: err.message });
  }

  let payload;
  try {
    payload = validatePayload(parseBody(req));
  } catch (err) {
    return send(res, 400, { error: err.message });
  }

  try {
    const uid = decodedToken.uid;
    const db = admin.firestore();
    const campaignRef = db.doc(`book_campaigns/${payload.campaignId}`);
    const holdRef = campaignRef.collection("holds").doc(uid);
    const registrationRef = db.doc(`book_registrations/${payload.campaignId}_${uid}`);
    await db.runTransaction(async (tx) => {
      const [campaignSnap, holdSnap, registrationSnap] = await Promise.all([
        tx.get(campaignRef),
        tx.get(holdRef),
        tx.get(registrationRef),
      ]);

      if (!campaignSnap.exists) throw new Error("Campaign not found");
      const campaign = campaignSnap.data() || {};
      if (campaign.status !== "active") throw new Error("Campaign is not active");

      const quota = Number(campaign.quota || 0);
      if (!Number.isFinite(quota) || quota <= 0) throw new Error("Campaign quota is invalid");

      const hold = holdSnap.exists ? holdSnap.data() : null;
      const expiresAt = hold?.expiresAt?.toDate ? hold.expiresAt.toDate() : null;
      if (!hold || hold.status !== "reserved" || !expiresAt || expiresAt <= new Date()) {
        throw new Error("Reservation hold is missing or expired");
      }

      const completedQuery = campaignRef.collection("holds").where("status", "==", "completed");
      const completedSnap = await tx.get(completedQuery);
      const alreadyCompleted = registrationSnap.exists && registrationSnap.data()?.uid === uid;
      if (!alreadyCompleted && completedSnap.size >= quota) {
        throw new Error("Campaign quota is full");
      }

      tx.set(registrationRef, {
        campaignId: payload.campaignId,
        uid,
        ...payload.registration,
        slipUrl: payload.slipUrl,
        status: "submitted",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: registrationSnap.exists
          ? registrationSnap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()
          : admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(holdRef, {
        uid,
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return send(res, 200, { success: true });
  } catch (err) {
    console.error("submit-book-registration failed:", err);
    return send(res, 400, { error: err.message || "Registration failed" });
  }
}
