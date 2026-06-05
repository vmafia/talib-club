import { doc, updateDoc, increment } from "firebase/firestore"
import { db } from "../lib/firebase.js"
import { CONTENT_COLLECTIONS } from "../lib/contentStore.js"

/** Atomic counter bump — avoids stale read-modify-write overwrites */
export async function bumpContentMetric(collectionKey, id, field) {
  const collectionName = CONTENT_COLLECTIONS[collectionKey]
  if (!collectionName || !id || !field) return

  // S2 Rate limit: 1 bump per session per document per field
  const storageKey = `talib_bumped_${collectionKey}_${id}_${field}`
  try {
    if (sessionStorage.getItem(storageKey)) {
      return
    }
  } catch (e) {
    // sessionStorage might be full or disabled
  }

  try {
    await updateDoc(doc(db, collectionName, String(id)), { [field]: increment(1) })
    try {
      sessionStorage.setItem(storageKey, "1")
    } catch (e) {}
  } catch (err) {
    console.error(`bumpContentMetric(${collectionKey}, ${field})`, err)
  }
}
