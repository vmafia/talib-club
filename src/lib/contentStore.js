import { useEffect, useMemo, useState } from "react"
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
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

// ============================================================
//  Global Connection Cache for Firestore Reads Optimization
// ============================================================

const collectionStoreCache = {}

function getOrCreateCollectionCache(collectionName) {
  if (!collectionStoreCache[collectionName]) {
    collectionStoreCache[collectionName] = {
      collectionName,
      remoteItems: null,
      loading: true,
      error: null,
      subscribers: new Set(),
      unsubscribeFirestore: null,
      cleanupTimeout: null,
    }
  }
  return collectionStoreCache[collectionName]
}

function subscribeToCollection(collectionName, callback) {
  const cache = getOrCreateCollectionCache(collectionName)
  
  cache.subscribers.add(callback)
  
  if (cache.cleanupTimeout) {
    clearTimeout(cache.cleanupTimeout)
    cache.cleanupTimeout = null
  }
  
  // Call callback with current cached state immediately
  callback({
    remoteItems: cache.remoteItems,
    loading: cache.loading,
    error: cache.error
  })
  
  if (!cache.unsubscribeFirestore) {
    cache.unsubscribeFirestore = onSnapshot(
      collection(db, collectionName),
      snapshot => {
        const next = snapshot.docs.map(item => {
          const data = item.data()
          return { ...data, id: data.id ?? item.id }
        })
        cache.remoteItems = next
        cache.loading = false
        cache.error = null
        
        cache.subscribers.forEach(cb => cb({
          remoteItems: cache.remoteItems,
          loading: cache.loading,
          error: cache.error
        }))
      },
      err => {
        console.error(`Cannot load ${collectionName}`, err)
        cache.error = err
        cache.loading = false
        cache.remoteItems = null
        
        cache.subscribers.forEach(cb => cb({
          remoteItems: cache.remoteItems,
          loading: cache.loading,
          error: cache.error
        }))
      }
    )
  }
  
  return () => {
    cache.subscribers.delete(callback)
    if (cache.subscribers.size === 0) {
      if (cache.cleanupTimeout) clearTimeout(cache.cleanupTimeout)
      cache.cleanupTimeout = setTimeout(() => {
        if (cache.subscribers.size === 0 && cache.unsubscribeFirestore) {
          cache.unsubscribeFirestore()
          cache.unsubscribeFirestore = null
          cache.remoteItems = null
          cache.loading = true
          cache.error = null
        }
        cache.cleanupTimeout = null
      }, 5000) // 5s grace period
    }
  }
}

const documentStoreCache = {}

function getOrCreateDocumentCache(collectionPath, docId) {
  const cacheKey = `${collectionPath}/${docId}`
  if (!documentStoreCache[cacheKey]) {
    documentStoreCache[cacheKey] = {
      collectionPath,
      docId,
      data: null,
      exists: false,
      loading: true,
      error: null,
      subscribers: new Set(),
      unsubscribeFirestore: null,
      cleanupTimeout: null
    }
  }
  return documentStoreCache[cacheKey]
}

function subscribeToDocument(collectionPath, docId, callback) {
  const cache = getOrCreateDocumentCache(collectionPath, docId)
  
  cache.subscribers.add(callback)
  
  if (cache.cleanupTimeout) {
    clearTimeout(cache.cleanupTimeout)
    cache.cleanupTimeout = null
  }
  
  callback({
    data: cache.data,
    exists: cache.exists,
    loading: cache.loading,
    error: cache.error
  })
  
  if (!cache.unsubscribeFirestore) {
    cache.unsubscribeFirestore = onSnapshot(
      doc(db, collectionPath, docId),
      snapshot => {
        cache.data = snapshot.exists() ? snapshot.data() : null
        cache.exists = snapshot.exists()
        cache.loading = false
        cache.error = null
        
        cache.subscribers.forEach(cb => cb({
          data: cache.data,
          exists: cache.exists,
          loading: cache.loading,
          error: cache.error
        }))
      },
      err => {
        console.error(`Cannot load document ${collectionPath}/${docId}`, err)
        cache.error = err
        cache.loading = false
        cache.data = null
        cache.exists = false
        
        cache.subscribers.forEach(cb => cb({
          data: cache.data,
          exists: cache.exists,
          loading: cache.loading,
          error: cache.error
        }))
      }
    )
  }
  
  return () => {
    cache.subscribers.delete(callback)
    if (cache.subscribers.size === 0) {
      if (cache.cleanupTimeout) clearTimeout(cache.cleanupTimeout)
      cache.cleanupTimeout = setTimeout(() => {
        if (cache.subscribers.size === 0 && cache.unsubscribeFirestore) {
          cache.unsubscribeFirestore()
          cache.unsubscribeFirestore = null
          cache.data = null
          cache.exists = false
          cache.loading = true
          cache.error = null
        }
        cache.cleanupTimeout = null
      }, 5000) // 5s grace period
    }
  }
}

// ============================================================
//  Exported Caching Hooks
// ============================================================

export function useContentCollection(name, fallbackItems = []) {
  const collectionName = CONTENT_COLLECTIONS[name]
  const cache = collectionName ? getOrCreateCollectionCache(collectionName) : null

  const [state, setState] = useState(() => ({
    remoteItems: cache ? cache.remoteItems : null,
    loading: cache ? cache.loading : true,
    error: cache ? cache.error : null
  }))

  useEffect(() => {
    if (!collectionName) {
      setState({
        remoteItems: null,
        loading: false,
        error: new Error(`Unknown content collection: ${name}`)
      })
      return undefined
    }

    const unsubscribe = subscribeToCollection(collectionName, (nextState) => {
      setState(nextState)
    })

    return unsubscribe
  }, [collectionName, name])

  const serializedFallback = JSON.stringify(fallbackItems)
  const stableFallbackItems = useMemo(() => fallbackItems, [serializedFallback])

  const items = useMemo(() => {
    if (state.loading && state.remoteItems === null) {
      return []
    }
    const merged = mergeWithFallback(stableFallbackItems, state.remoteItems)
    return [...merged].filter(item => !item.deleted).sort(byNewest)
  }, [stableFallbackItems, state.loading, state.remoteItems])

  async function saveItem(item) {
    const id = String(item.id || crypto.randomUUID())
    const payload = {
      ...cleanForFirestore(item),
      id,
      deleted: false,
      updatedAt: serverTimestamp(),
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
    loading: state.loading,
    error: state.error,
    isUsingFallback: !state.loading && (!state.remoteItems || state.remoteItems.length === 0),
    saveItem,
    deleteItem,
  }
}

export function useSiteSettings(fallbackSite) {
  const cache = getOrCreateDocumentCache(SITE_DOC.collection, SITE_DOC.id)
  
  const [state, setState] = useState(() => ({
    data: cache.data,
    exists: cache.exists,
    loading: cache.loading,
    error: cache.error
  }))

  useEffect(() => {
    const unsubscribe = subscribeToDocument(SITE_DOC.collection, SITE_DOC.id, (nextState) => {
      setState(nextState)
    })
    return unsubscribe
  }, [])

  const site = useMemo(() => {
    return state.exists ? deepMerge(fallbackSite, state.data) : fallbackSite
  }, [state.exists, state.data, fallbackSite])

  async function saveSiteSettings(nextSite) {
    await setDoc(doc(db, SITE_DOC.collection, SITE_DOC.id), {
      ...cleanForFirestore(nextSite),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  return { site, loading: state.loading, error: state.error, saveSiteSettings }
}

export function useTaxonomySettings(fallbackTaxonomy) {
  const cache = getOrCreateDocumentCache(TAXONOMY_DOC.collection, TAXONOMY_DOC.id)
  
  const [state, setState] = useState(() => ({
    data: cache.data,
    exists: cache.exists,
    loading: cache.loading,
    error: cache.error
  }))

  useEffect(() => {
    const unsubscribe = subscribeToDocument(TAXONOMY_DOC.collection, TAXONOMY_DOC.id, (nextState) => {
      setState(nextState)
    })
    return unsubscribe
  }, [])

  const taxonomy = useMemo(() => {
    return state.exists ? deepMerge(fallbackTaxonomy, state.data) : fallbackTaxonomy
  }, [state.exists, state.data, fallbackTaxonomy])

  async function saveTaxonomySettings(nextTaxonomy) {
    await setDoc(doc(db, TAXONOMY_DOC.collection, TAXONOMY_DOC.id), {
      ...cleanForFirestore(nextTaxonomy),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  return { taxonomy, loading: state.loading, error: state.error, saveTaxonomySettings }
}
