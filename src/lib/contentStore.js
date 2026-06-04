import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  query,
  where,
  limit,
  orderBy,
  getCountFromServer,
} from "firebase/firestore"
import { db } from "./firebase.js"

export const CONTENT_COLLECTIONS = {
  articles: "content_articles",
  books: "content_books",
  media: "content_media",
  scholars: "content_scholars",
  bookmarks: "content_bookmarks",
  bookshelf: "content_bookshelf",
  reading_sessions: "content_reading_sessions",
  reading_streaks: "content_reading_streaks",
  quran_bookmarks: "content_quran_bookmarks",
  quran_last_read: "content_quran_last_read",
  history: "content_history",
}

export const SITE_DOC = { collection: "content_settings", id: "site" }
export const TAXONOMY_DOC = { collection: "content_settings", id: "taxonomy" }

function cleanForFirestore(value) {
  if (Array.isArray(value)) return value.map(cleanForFirestore)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanForFirestore(item)])
  )
}

function isPlainObject(value) {
  return Boolean(value) && Object.getPrototypeOf(value) === Object.prototype
}

function deepMerge(base, patch) {
  if (Array.isArray(base) && Array.isArray(patch)) return patch
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch === undefined ? base : patch
  }

  const result = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    result[key] = key in base ? deepMerge(base[key], value) : value
  }
  return result
}

function getMs(val) {
  if (!val) return 0
  if (typeof val.toDate === "function") return val.toDate().getTime()
  if (val.seconds) return val.seconds * 1000
  if (typeof val === "number") return val
  const parsed = Date.parse(val)
  return isNaN(parsed) ? 0 : parsed
}

function byNewest(a, b) {
  // Sort by createdAt or updatedAt (Firestore timestamp)
  const timeA = getMs(a.createdAt || a.updatedAt)
  const timeB = getMs(b.createdAt || b.updatedAt)
  if (timeA || timeB) {
    if (timeA && timeB) return timeB - timeA // Newer first
    return timeA ? -1 : 1 // Items with Firestore timestamps go to the top
  }

  // Fall back to date field if available
  const dateA = String(a.date || "")
  const dateB = String(b.date || "")
  if (dateA !== dateB) return dateB.localeCompare(dateA)

  return String(b.id || "").localeCompare(String(a.id || ""))
}

function mergeWithFallback(fallbackItems, remoteItems) {
  if (!remoteItems) return fallbackItems

  const byId = new Map(fallbackItems.map(item => [String(item.id), item]))
  remoteItems.forEach(item => {
    const id = String(item.id)
    if (item.deleted) {
      byId.delete(id)
      return
    }
    byId.set(id, { ...(byId.get(id) || {}), ...item })
  })
  return [...byId.values()]
}

const USER_SPECIFIC_COLLECTIONS = [
  "bookmarks",
  "bookshelf",
  "reading_sessions",
  "reading_streaks",
  "quran_bookmarks",
  "quran_last_read",
  "history",
]

const COLLECTION_CACHE_TTL_MS = 5 * 60 * 1000
const PUBLIC_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const PUBLIC_COLLECTIONS = ["content_articles", "content_books", "content_media", "content_scholars"]
const LOCAL_STORAGE_CACHE_PREFIX = "talib_cache_"
const collectionCache = new Map()

function getQueryCacheKey(collectionName, uid, limitCount, orderByField, orderDirection) {
  return JSON.stringify({ collectionName, uid: uid || null, limitCount, orderByField, orderDirection })
}

function readCachedCollection(key) {
  // Check memory cache first
  const entry = collectionCache.get(key)
  if (entry) {
    if (Date.now() - entry.at < COLLECTION_CACHE_TTL_MS) {
      return entry.items
    }
    collectionCache.delete(key)
  }

  // Check localStorage for public collections
  try {
    const isPublic = PUBLIC_COLLECTIONS.some(col => key.includes(`"collectionName":"${col}"`))
    if (isPublic) {
      const localData = localStorage.getItem(LOCAL_STORAGE_CACHE_PREFIX + key)
      if (localData) {
        const parsed = JSON.parse(localData)
        if (Date.now() - parsed.at < PUBLIC_CACHE_TTL_MS) {
          // Re-populate memory cache
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

function writeCachedCollection(key, items) {
  const now = Date.now()
  collectionCache.set(key, { items, at: now })

  // Write to localStorage for public collections
  try {
    const isPublic = PUBLIC_COLLECTIONS.some(col => key.includes(`"collectionName":"${col}"`))
    if (isPublic) {
      localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items, at: now }))
    }
  } catch (e) {
    console.error("Failed to write to localStorage cache:", e)
  }
}

export function invalidateContentCache(collectionName = null) {
  if (!collectionName) {
    collectionCache.clear()
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(LOCAL_STORAGE_CACHE_PREFIX)) {
          localStorage.removeItem(key)
        }
      }
    } catch (e) {}
    return
  }
  for (const key of [...collectionCache.keys()]) {
    if (key.includes(`"collectionName":"${collectionName}"`)) {
      collectionCache.delete(key)
      try {
        localStorage.removeItem(LOCAL_STORAGE_CACHE_PREFIX + key)
      } catch (e) {}
    }
  }
}

function buildCollectionQuery(collectionName, { uid, isUserSpecific, orderByField, orderDirection, limitCount }) {
  let q = collection(db, collectionName)
  if (isUserSpecific && uid) {
    q = query(q, where("uid", "==", uid))
  }
  if (orderByField) {
    q = query(q, orderBy(orderByField, orderDirection))
  }
  if (limitCount) {
    q = query(q, limit(limitCount))
  }
  return q
}

function mapSnapshotDocs(snapshot) {
  return snapshot.docs.map(item => {
    const data = item.data()
    return { ...data, id: data.id ?? item.id }
  })
}

export function useContentCollection(name, fallbackItems = [], uid = null, options = {}) {
  const {
    limit: limitCount = null,
    orderByField = null,
    orderDirection = "desc",
    live = false,
  } = options

  const [remoteItems, setRemoteItems] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const collectionName = CONTENT_COLLECTIONS[name]
  const isUserSpecific = USER_SPECIFIC_COLLECTIONS.includes(name)

  useEffect(() => {
    if (!collectionName) {
      setError(new Error(`Unknown content collection: ${name}`))
      setLoading(false)
      return undefined
    }

    if (isUserSpecific && !uid) {
      setRemoteItems([])
      setLoading(false)
      return undefined
    }

    const cacheKey = getQueryCacheKey(collectionName, uid, limitCount, orderByField, orderDirection)
    const cached = !live ? readCachedCollection(cacheKey) : null
    if (cached) {
      setRemoteItems(cached)
      setError(null)
      setLoading(false)
      return undefined
    }

    setLoading(true)

    const q = buildCollectionQuery(collectionName, {
      uid,
      isUserSpecific,
      orderByField,
      orderDirection,
      limitCount,
    })

    const applySnapshot = snapshot => {
      const next = mapSnapshotDocs(snapshot)
      if (!live) writeCachedCollection(cacheKey, next)
      setRemoteItems(next)
      setError(null)
      setLoading(false)
    }

    if (live) {
      const unsubscribe = onSnapshot(
        q,
        applySnapshot,
        err => {
          console.error(`Cannot load ${collectionName}`, err)
          setError(err)
          setRemoteItems(null)
          setLoading(false)
        }
      )
      return unsubscribe
    }

    getDocs(q)
      .then(applySnapshot)
      .catch(err => {
        console.error(`Cannot load ${collectionName} (one-time)`, err)
        setError(err)
        setRemoteItems(null)
        setLoading(false)
      })
    return undefined
  }, [collectionName, name, uid, isUserSpecific, limitCount, orderByField, orderDirection, live])

  const serializedFallback = JSON.stringify(fallbackItems)
  const stableFallbackItems = useMemo(() => fallbackItems, [serializedFallback])

  const items = useMemo(() => {
    if (loading && remoteItems === null) {
      return []
    }
    const merged = mergeWithFallback(stableFallbackItems, remoteItems)
    return [...merged].filter(item => !item.deleted).sort(byNewest)
  }, [stableFallbackItems, loading, remoteItems])

  const saveItem = useCallback(async (item) => {
    const id = String(item.id || crypto.randomUUID())
    const payload = {
      ...cleanForFirestore(item),
      id,
      deleted: false,
      updatedAt: serverTimestamp(),
    }
    if (isUserSpecific && uid && !payload.uid) {
      payload.uid = uid
    }
    if (!payload.createdAt && !item.createdAt) {
      payload.createdAt = serverTimestamp()
    }
    await setDoc(doc(db, collectionName, id), payload, { merge: true })
    invalidateContentCache(collectionName)
  }, [collectionName, isUserSpecific, uid])

  const deleteItem = useCallback(async (id) => {
    await setDoc(doc(db, collectionName, String(id)), {
      id: String(id),
      deleted: true,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    invalidateContentCache(collectionName)
  }, [collectionName])

  return {
    items,
    loading,
    error,
    isUsingFallback: !loading && (!remoteItems || remoteItems.length === 0),
    saveItem,
    deleteItem,
  }
}

export function useCollectionCount(name) {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const collectionName = CONTENT_COLLECTIONS[name]

  useEffect(() => {
    if (!collectionName) {
      setLoading(false)
      return
    }
    setLoading(true)
    getCountFromServer(collection(db, collectionName))
      .then(snapshot => {
        setCount(snapshot.data().count)
        setLoading(false)
      })
      .catch(err => {
        console.error(`Error counting ${collectionName}:`, err)
        setLoading(false)
      })
  }, [collectionName])

  return { count, loading }
}

const USER_COLLECTION_CACHE_TTL_MS = 5 * 60 * 1000
const userCollectionCache = new Map()

function getUserCollectionCacheKey(collectionName, uid) {
  return `${collectionName}:${uid}`
}

function readUserCollectionCache(key) {
  const entry = userCollectionCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > USER_COLLECTION_CACHE_TTL_MS) {
    userCollectionCache.delete(key)
    return null
  }
  return entry.items
}

function writeUserCollectionCache(key, items) {
  userCollectionCache.set(key, { items, at: Date.now() })
}

function invalidateUserCollectionCache(collectionName, uid) {
  if (uid) userCollectionCache.delete(getUserCollectionCacheKey(collectionName, uid))
}

function readQuranBookmarksSession(uid) {
  if (!uid) return []
  try {
    const raw = sessionStorage.getItem(`talib_quran_bookmarks_${uid}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeQuranBookmarksSession(uid, items) {
  if (!uid) return
  try {
    sessionStorage.setItem(`talib_quran_bookmarks_${uid}`, JSON.stringify(items))
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Lightweight ONE-TIME fetch hook (getDocs, not onSnapshot).
 * Use this for user-specific data that doesn't need live updates
 * (e.g. Quran bookmarks, last-read) to minimise Firestore read counts.
 */
export function useUserCollection(name, uid) {
  const collectionName = CONTENT_COLLECTIONS[name]
  const isQuranBookmarks = name === "quran_bookmarks"
  const [items, setItems] = useState(() => (isQuranBookmarks ? readQuranBookmarksSession(uid) : []))
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  const fetchItems = useCallback(async () => {
    if (!collectionName || !uid) {
      setItems([])
      return
    }

    const cacheKey = getUserCollectionCacheKey(collectionName, uid)
    const cached = readUserCollectionCache(cacheKey)
    if (cached) {
      setItems(cached)
      if (isQuranBookmarks) writeQuranBookmarksSession(uid, cached)
      return
    }

    setLoading(true)
    try {
      let snapshot
      try {
        snapshot = await getDocs(query(
          collection(db, collectionName),
          where("uid", "==", uid),
          where("deleted", "==", false)
        ))
      } catch (indexErr) {
        console.warn(`useUserCollection: falling back to uid-only query (${name})`, indexErr)
        snapshot = await getDocs(query(collection(db, collectionName), where("uid", "==", uid)))
      }
      const docs = snapshot.docs
        .map(d => ({ ...d.data(), id: d.data().id ?? d.id }))
        .filter(d => !d.deleted)
      setItems(docs)
      writeUserCollectionCache(cacheKey, docs)
      if (isQuranBookmarks) writeQuranBookmarksSession(uid, docs)
    } catch (err) {
      console.error(`useUserCollection fetch error (${name}):`, err)
    } finally {
      setLoading(false)
    }
  }, [collectionName, uid, name, isQuranBookmarks])

  useEffect(() => {
    if (!uid || fetchedRef.current) return
    fetchedRef.current = true
    fetchItems()
  }, [uid, fetchItems])

  // Re-fetch when uid changes (login/logout)
  const prevUidRef = useRef(uid)
  useEffect(() => {
    if (prevUidRef.current !== uid) {
      prevUidRef.current = uid
      fetchedRef.current = false
      if (uid) fetchItems()
      else setItems([])
    }
  }, [uid, fetchItems])

  const saveItem = useCallback(async (item) => {
    if (!collectionName) return
    const id = String(item.id || crypto.randomUUID())
    const payload = {
      ...cleanForFirestore(item),
      id,
      uid,
      deleted: false,
      updatedAt: serverTimestamp(),
    }
    if (!payload.createdAt && !item.createdAt) {
      payload.createdAt = serverTimestamp()
    }
    await setDoc(doc(db, collectionName, id), payload, { merge: true })
    invalidateUserCollectionCache(collectionName, uid)
    setItems(prev => {
      const idx = prev.findIndex(d => String(d.id) === id)
      const next = { ...payload, id }
      const merged = idx >= 0 ? prev.map((d, i) => i === idx ? next : d) : [...prev, next]
      if (isQuranBookmarks) writeQuranBookmarksSession(uid, merged)
      return merged
    })
  }, [collectionName, uid, isQuranBookmarks])

  const deleteItem = useCallback(async (id) => {
    if (!collectionName) return
    await setDoc(doc(db, collectionName, String(id)), {
      id: String(id), deleted: true, updatedAt: serverTimestamp()
    }, { merge: true })
    invalidateUserCollectionCache(collectionName, uid)
    setItems(prev => {
      const merged = prev.filter(d => String(d.id) !== String(id))
      if (isQuranBookmarks) writeQuranBookmarksSession(uid, merged)
      return merged
    })
  }, [collectionName, uid, isQuranBookmarks])

  return { items, loading, saveItem, deleteItem, refetch: fetchItems }
}

/**
 * Single user document (1 Firestore read) — for quran_last_read, etc.
 */
export function useUserDoc(collectionKey, uid, docId, fallback = null) {
  const collectionName = CONTENT_COLLECTIONS[collectionKey]
  const [item, setItem] = useState(fallback)
  const [loading, setLoading] = useState(Boolean(uid && docId))

  const fetchDoc = useCallback(async () => {
    if (!collectionName || !uid || !docId) {
      setItem(fallback)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const snapshot = await getDoc(doc(db, collectionName, String(docId)))
      if (snapshot.exists() && !snapshot.data()?.deleted) {
        const data = snapshot.data()
        setItem({ ...data, id: data.id ?? snapshot.id })
      } else {
        setItem(null)
      }
    } catch (err) {
      console.error(`useUserDoc fetch error (${collectionKey}/${docId}):`, err)
      setItem(fallback)
    } finally {
      setLoading(false)
    }
  }, [collectionName, collectionKey, uid, docId, fallback])

  useEffect(() => {
    fetchDoc()
  }, [fetchDoc])

  const saveItem = useCallback(async (data) => {
    if (!collectionName || !uid || !docId) return
    const payload = {
      ...cleanForFirestore(data),
      id: String(docId),
      uid,
      deleted: false,
      updatedAt: serverTimestamp(),
    }
    if (!payload.createdAt && !data.createdAt) {
      payload.createdAt = serverTimestamp()
    }
    await setDoc(doc(db, collectionName, String(docId)), payload, { merge: true })
    setItem({ ...payload, id: String(docId) })
  }, [collectionName, uid, docId])

  const deleteItem = useCallback(async () => {
    if (!collectionName || !docId) return
    await setDoc(doc(db, collectionName, String(docId)), {
      id: String(docId),
      deleted: true,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    setItem(null)
  }, [collectionName, docId])

  return { item, loading, saveItem, deleteItem, refetch: fetchDoc }
}

/**
 * Fetch a single public content document (1 read) instead of the whole collection.
 */
export function useContentDoc(collectionKey, docId, fallback = null) {
  const collectionName = CONTENT_COLLECTIONS[collectionKey]
  const [item, setItem] = useState(fallback)
  const [loading, setLoading] = useState(Boolean(docId))
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!collectionName || !docId) {
      setItem(fallback)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    getDoc(doc(db, collectionName, String(docId)))
      .then(snapshot => {
        if (snapshot.exists() && !snapshot.data()?.deleted) {
          const data = snapshot.data()
          setItem({ ...data, id: data.id ?? snapshot.id })
        } else {
          setItem(fallback)
        }
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        console.error(`Cannot load ${collectionName}/${docId}`, err)
        setError(err)
        setItem(fallback)
        setLoading(false)
      })
    return undefined
  }, [collectionName, collectionKey, docId, fallback])

  return { item, loading, error }
}

export function useSiteSettings(fallbackSite) {
  const [site, setSite] = useState(fallbackSite)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getDoc(doc(db, SITE_DOC.collection, SITE_DOC.id))
      .then(snapshot => {
        if (cancelled) return
        setSite(snapshot.exists() ? deepMerge(fallbackSite, snapshot.data()) : fallbackSite)
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error("Cannot load site settings", err)
        setSite(fallbackSite)
        setError(err)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [fallbackSite])

  async function saveSiteSettings(nextSite) {
    await setDoc(doc(db, SITE_DOC.collection, SITE_DOC.id), {
      ...cleanForFirestore(nextSite),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  return { site, loading, error, saveSiteSettings }
}

export function useTaxonomySettings(fallbackTaxonomy) {
  const [taxonomy, setTaxonomy] = useState(fallbackTaxonomy)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getDoc(doc(db, TAXONOMY_DOC.collection, TAXONOMY_DOC.id))
      .then(snapshot => {
        if (cancelled) return
        setTaxonomy(snapshot.exists() ? deepMerge(fallbackTaxonomy, snapshot.data()) : fallbackTaxonomy)
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error("Cannot load taxonomy settings", err)
        setTaxonomy(fallbackTaxonomy)
        setError(err)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [fallbackTaxonomy])

  async function saveTaxonomySettings(nextTaxonomy) {
    await setDoc(doc(db, TAXONOMY_DOC.collection, TAXONOMY_DOC.id), {
      ...cleanForFirestore(nextTaxonomy),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  return { taxonomy, loading, error, saveTaxonomySettings }
}
