import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  query,
  where,
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

export function useContentCollection(name, fallbackItems = [], uid = null) {
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

    setLoading(true)

    let q = collection(db, collectionName)
    if (isUserSpecific && uid) {
      q = query(q, where("uid", "==", uid))
    }

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const next = snapshot.docs.map(item => {
          const data = item.data()
          return { ...data, id: data.id ?? item.id }
        })
        setRemoteItems(next)
        setError(null)
        setLoading(false)
      },
      err => {
        console.error(`Cannot load ${collectionName}`, err)
        setError(err)
        setRemoteItems(null)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [collectionName, name, uid, isUserSpecific])

  const serializedFallback = JSON.stringify(fallbackItems)
  const stableFallbackItems = useMemo(() => fallbackItems, [serializedFallback])

  const items = useMemo(() => {
    if (loading && remoteItems === null) {
      return []
    }
    const merged = mergeWithFallback(stableFallbackItems, remoteItems)
    return [...merged].filter(item => !item.deleted).sort(byNewest)
  }, [stableFallbackItems, loading, remoteItems])

  async function saveItem(item) {
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
  }

  async function deleteItem(id) {
    await setDoc(doc(db, collectionName, String(id)), {
      id: String(id),
      deleted: true,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  return {
    items,
    loading,
    error,
    isUsingFallback: !loading && (!remoteItems || remoteItems.length === 0),
    saveItem,
    deleteItem,
  }
}

/**
 * Lightweight ONE-TIME fetch hook (getDocs, not onSnapshot).
 * Use this for user-specific data that doesn't need live updates
 * (e.g. Quran bookmarks, last-read) to minimise Firestore read counts.
 */
export function useUserCollection(name, uid) {
  const collectionName = CONTENT_COLLECTIONS[name]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  const fetchItems = useCallback(async () => {
    if (!collectionName || !uid) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const q = query(collection(db, collectionName), where("uid", "==", uid))
      const snapshot = await getDocs(q)
      const docs = snapshot.docs
        .map(d => ({ ...d.data(), id: d.data().id ?? d.id }))
        .filter(d => !d.deleted)
      setItems(docs)
    } catch (err) {
      console.error(`useUserCollection fetch error (${name}):`, err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [collectionName, uid, name])

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
    // Update local state optimistically
    setItems(prev => {
      const idx = prev.findIndex(d => String(d.id) === id)
      const next = { ...payload, id }
      return idx >= 0 ? prev.map((d, i) => i === idx ? next : d) : [...prev, next]
    })
  }, [collectionName, uid])

  const deleteItem = useCallback(async (id) => {
    if (!collectionName) return
    await setDoc(doc(db, collectionName, String(id)), {
      id: String(id), deleted: true, updatedAt: serverTimestamp()
    }, { merge: true })
    setItems(prev => prev.filter(d => String(d.id) !== String(id)))
  }, [collectionName])

  return { items, loading, saveItem, deleteItem, refetch: fetchItems }
}

export function useSiteSettings(fallbackSite) {
  const [site, setSite] = useState(fallbackSite)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, SITE_DOC.collection, SITE_DOC.id),
      snapshot => {
        setSite(snapshot.exists() ? deepMerge(fallbackSite, snapshot.data()) : fallbackSite)
        setError(null)
        setLoading(false)
      },
      err => {
        console.error("Cannot load site settings", err)
        setSite(fallbackSite)
        setError(err)
        setLoading(false)
      }
    )

    return unsubscribe
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
    const unsubscribe = onSnapshot(
      doc(db, TAXONOMY_DOC.collection, TAXONOMY_DOC.id),
      snapshot => {
        setTaxonomy(snapshot.exists() ? deepMerge(fallbackTaxonomy, snapshot.data()) : fallbackTaxonomy)
        setError(null)
        setLoading(false)
      },
      err => {
        console.error("Cannot load taxonomy settings", err)
        setTaxonomy(fallbackTaxonomy)
        setError(err)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [fallbackTaxonomy])

  async function saveTaxonomySettings(nextTaxonomy) {
    await setDoc(doc(db, TAXONOMY_DOC.collection, TAXONOMY_DOC.id), {
      ...cleanForFirestore(nextTaxonomy),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  return { taxonomy, loading, error, saveTaxonomySettings }
}
