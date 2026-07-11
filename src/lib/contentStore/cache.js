import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "../firebase.js"
import { setOfflineItem } from "../offlineStore.js"
import {
  USER_DOC_CACHE_TTL_MS,
  COLLECTION_CACHE_TTL_MS,
  PUBLIC_CACHE_TTL_MS,
  PUBLIC_COLLECTIONS,
  LOCAL_STORAGE_CACHE_PREFIX,
  METADATA_TTL_MS,
  CONTENT_COLLECTIONS
} from "./constants.js"

// Cache maps
export const collectionCache = new Map()
export const countCache = new Map()
export const userDocumentCache = new Map()
export const inFlightRequests = new Map()

export function setWithLimit(map, key, value, limit = 100) {
  map.set(key, value)
  if (map.size > limit) {
    const firstKey = map.keys().next().value
    map.delete(firstKey)
  }
}

export function readCachedUserDocument(collectionName, docId) {
  const cacheKey = `${collectionName}:${docId}`
  const entry = userDocumentCache.get(cacheKey)
  if (entry) {
    if (Date.now() - entry.at < USER_DOC_CACHE_TTL_MS) {
      return entry.data
    }
    userDocumentCache.delete(cacheKey)
  }
  return null
}

export function writeCachedUserDocument(collectionName, docId, data) {
  const cacheKey = `${collectionName}:${docId}`
  setWithLimit(userDocumentCache, cacheKey, { data, at: Date.now() }, 200)
}

export function invalidateUserDocumentCache(collectionName, docId) {
  const cacheKey = `${collectionName}:${docId}`
  userDocumentCache.delete(cacheKey)
}

export function readCachedCollection(key) {
  const entry = collectionCache.get(key)
  if (entry) {
    if (Date.now() - entry.at < COLLECTION_CACHE_TTL_MS) {
      return entry.items
    }
    collectionCache.delete(key)
  }

  try {
    const isPublic = PUBLIC_COLLECTIONS.some(col => key.includes(`"collectionName":"${col}"`))
    if (isPublic) {
      const localData = localStorage.getItem(LOCAL_STORAGE_CACHE_PREFIX + key)
      if (localData) {
        const parsed = JSON.parse(localData)
        if (Date.now() - parsed.at < PUBLIC_CACHE_TTL_MS) {
          collectionCache.set(key, { items: parsed.items, at: parsed.at })
          return parsed.items
        }
        localStorage.removeItem(LOCAL_STORAGE_CACHE_PREFIX + key)
      }
    }
  } catch (e) {
    console.error("Failed to read from localStorage cache:", e)
  }
  return null
}

export function writeCachedCollection(key, items) {
  const now = Date.now()
  setWithLimit(collectionCache, key, { items, at: now }, 50)

  try {
    const isPublic = PUBLIC_COLLECTIONS.some(col => key.includes(`"collectionName":"${col}"`))
    if (isPublic) {
      localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items, at: now }))
    }
  } catch (e) {
    console.error("Failed to write to localStorage cache:", e)
  }

  setOfflineItem('collections', key, { items, at: now }).catch(e => {
    console.error("Failed to write collection to IndexedDB", e)
  })
}

export function invalidateCollectionCache(collectionName) {
  // Clear from memory
  for (const key of collectionCache.keys()) {
    if (key.includes(`"collectionName":"${collectionName}"`)) {
      collectionCache.delete(key)
    }
  }

  // Clear from localStorage
  try {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LOCAL_STORAGE_CACHE_PREFIX) && k.includes(`"collectionName":"${collectionName}"`)) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  } catch (e) {
    console.error("Failed to invalidate localStorage cache:", e)
  }
}

export function readLocalStorageCacheEntry(key) {
  try {
    const localData = localStorage.getItem(LOCAL_STORAGE_CACHE_PREFIX + key)
    if (localData) {
      return JSON.parse(localData)
    }
  } catch (e) {
    console.error("Failed to read raw localStorage cache:", e)
  }
  return null
}

let cachedMetadata = null
let cachedMetadataAt = 0

export async function fetchContentMetadata() {
  if (cachedMetadata && (Date.now() - cachedMetadataAt < METADATA_TTL_MS)) {
    return cachedMetadata
  }
  try {
    const snap = await getDoc(doc(db, "content_settings", "metadata"))
    if (snap.exists()) {
      cachedMetadata = snap.data()
    } else {
      cachedMetadata = {}
    }
    cachedMetadataAt = Date.now()
  } catch (e) {
    console.warn("Could not fetch content metadata", e)
    cachedMetadata = cachedMetadata || {}
  }
  return cachedMetadata
}

export async function updateCollectionMetadata(collectionName) {
  try {
    await setDoc(doc(db, "content_settings", "metadata"), {
      [collectionName]: Date.now(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (e) {
    console.warn("Could not update collection metadata timestamp", e)
  }
}

export async function invalidateContentCache(collectionName = null) {
  if (!collectionName) {
    collectionCache.clear()
    countCache.clear()
    userDocumentCache.clear()
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(LOCAL_STORAGE_CACHE_PREFIX)) {
          localStorage.removeItem(key)
        }
      }
    } catch (e) { }
    cachedMetadata = null
    cachedMetadataAt = 0
    return
  }
  for (const key of [...collectionCache.keys()]) {
    if (key.includes(`"collectionName":"${collectionName}"`)) {
      collectionCache.delete(key)
      try {
        localStorage.removeItem(LOCAL_STORAGE_CACHE_PREFIX + key)
      } catch (e) { }
    }
  }
  for (const [key, val] of Object.entries(CONTENT_COLLECTIONS)) {
    if (val === collectionName) {
      countCache.delete(`count_${key}`)
      try {
        localStorage.removeItem(LOCAL_STORAGE_CACHE_PREFIX + `count_${key}`)
      } catch (e) { }
    }
  }
}

// Single document cache
export function readCachedDocument(collectionName, docId) {
  const cacheKey = `${collectionName}:${docId}`
  const entry = userDocumentCache.get(cacheKey)
  if (entry) {
    if (Date.now() - entry.at < PUBLIC_CACHE_TTL_MS) {
      return entry.data
    }
    userDocumentCache.delete(cacheKey)
  }
  return null
}

export function writeCachedDocument(collectionName, docId, data) {
  const cacheKey = `${collectionName}:${docId}`
  setWithLimit(userDocumentCache, cacheKey, { data, at: Date.now() }, 100)
}

export function invalidateDocumentCache(collectionName, docId) {
  const cacheKey = `${collectionName}:${docId}`
  userDocumentCache.delete(cacheKey)
}
