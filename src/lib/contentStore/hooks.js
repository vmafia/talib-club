import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch, query, where, limit, orderBy, getCountFromServer, runTransaction } from "firebase/firestore"
import { db } from "../firebase.js"
import { getOfflineItem } from "../offlineStore.js"
import { CONTENT_COLLECTIONS, USER_SPECIFIC_COLLECTIONS, PUBLIC_COLLECTIONS, LOCAL_STORAGE_CACHE_PREFIX } from "./constants.js"
import { cleanForFirestore, getMs, byNewest, mergeWithFallback, getQueryCacheKey, generateDocId } from "./utils.js"
import { 
  collectionCache, countCache, inFlightRequests, setWithLimit,
  readCachedCollection, writeCachedCollection, readLocalStorageCacheEntry, invalidateCollectionCache,
  fetchContentMetadata, updateCollectionMetadata,
  readCachedUserDocument, writeCachedUserDocument, invalidateUserDocumentCache
} from "./cache.js"

export async function getNextSequenceId(db, collectionName) {
  // Use 'counters' collection to track auto-incrementing IDs
  const counterRef = doc(db, "counters", collectionName)
  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef)
    let nextId = 1
    if (counterDoc.exists()) {
      nextId = (counterDoc.data().count || 0) + 1
    }
    transaction.set(counterRef, { count: nextId })
    return String(nextId)
  })
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
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const lastRefetchTrigger = useRef(refetchTrigger)
  const isRefetching = refetchTrigger !== lastRefetchTrigger.current
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
    // H7: Fix cache bypass logic
    const cached = !live && !isRefetching ? readCachedCollection(cacheKey) : null
    lastRefetchTrigger.current = refetchTrigger
    if (cached) {
      setRemoteItems(cached)
      setError(null)
      setLoading(false)
      return undefined
    }

    setLoading(true)

    let active = true

    const loadData = async () => {
      try {
        const q = buildCollectionQuery(collectionName, {
          uid,
          isUserSpecific,
          orderByField,
          orderDirection,
          limitCount,
        })

        // Check IndexedDB cache first
        if (!live) {
          try {
            const offlineEntry = await getOfflineItem('collections', cacheKey)
            if (offlineEntry) {
              let isValid = true
              if (PUBLIC_COLLECTIONS.includes(collectionName)) {
                try {
                  const serverMeta = await fetchContentMetadata()
                  const serverLastUpdate = serverMeta[collectionName] || 0
                  if (serverLastUpdate > 0 && offlineEntry.at < serverLastUpdate) {
                    isValid = false
                  }
                } catch (metaErr) {
                  console.log("[contentStore] Failed to fetch server metadata, using offline cache fallback.", metaErr)
                }
              }
              if (isValid && active) {
                collectionCache.set(cacheKey, { items: offlineEntry.items, at: offlineEntry.at })
                setRemoteItems(offlineEntry.items)
                setError(null)
                setLoading(false)
                return
              }
            }
          } catch (dbErr) {
            console.warn("[contentStore] IndexedDB read failed", dbErr)
          }
        }

        // Check metadata-based cache first
        if (!live && PUBLIC_COLLECTIONS.includes(collectionName)) {
          const localEntry = readLocalStorageCacheEntry(cacheKey)
          if (localEntry) {
            const serverMeta = await fetchContentMetadata()
            const serverLastUpdate = serverMeta[collectionName] || 0
            if (serverLastUpdate > 0 && localEntry.at >= serverLastUpdate) {
              if (active) {
                // Populate memory cache so future calls use it instantly
                collectionCache.set(cacheKey, { items: localEntry.items, at: localEntry.at })
                setRemoteItems(localEntry.items)
                setError(null)
                setLoading(false)
              }
              return
            }
          }
        }

        // Request deduplication: if same query is in-flight, wait for it
        if (inFlightRequests.has(cacheKey)) {
          try {
            const next = await inFlightRequests.get(cacheKey)
            if (active) {
              setRemoteItems(next)
              setError(null)
              setLoading(false)
            }
          } catch (err) {
            if (active) {
              setError(err)
              setRemoteItems(null)
              setLoading(false)
            }
          }
          return
        }

        // Fetch and dedup: store Promise that resolves to data, not snapshot
        const fetchPromise = getDocs(q)
          .then(snapshot => {
            const next = mapSnapshotDocs(snapshot)
            if (!live) writeCachedCollection(cacheKey, next)
            return next
          })
        inFlightRequests.set(cacheKey, fetchPromise)

        try {
          const next = await fetchPromise
          inFlightRequests.delete(cacheKey)
          if (!active) return

          setRemoteItems(next)
          setError(null)
          setLoading(false)
        } catch (err) {
          inFlightRequests.delete(cacheKey)
          if (!active) return
          console.error(`Cannot load ${collectionName}`, err)
          setError(err)
          setRemoteItems(null)
          setLoading(false)
        }
      } catch (outerErr) {
        if (!active) return
        console.error(`Cannot load ${collectionName}`, outerErr)
        setError(outerErr)
        setRemoteItems(null)
        setLoading(false)
      }
    }

    if (live) {
      const q = buildCollectionQuery(collectionName, {
        uid,
        isUserSpecific,
        orderByField,
        orderDirection,
        limitCount,
      })
      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          if (!active) return
          const next = mapSnapshotDocs(snapshot)
          setRemoteItems(next)
          setError(null)
          setLoading(false)
        },
        err => {
          if (!active) return
          console.error(`Cannot load ${collectionName}`, err)
          setError(err)
          setRemoteItems(null)
          setLoading(false)
        }
      )
      return () => {
        active = false
        unsubscribe()
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [collectionName, name, uid, isUserSpecific, limitCount, orderByField, orderDirection, live, refetchTrigger])

  // H4: Avoid running JSON.stringify on every render by checking object identity/deep equality only when needed
  const fallbackRef = useRef(fallbackItems)
  if (fallbackRef.current !== fallbackItems) {
    if (JSON.stringify(fallbackRef.current) !== JSON.stringify(fallbackItems)) {
      fallbackRef.current = fallbackItems
    }
  }
  const stableFallbackItems = fallbackRef.current

  const items = useMemo(() => {
    if (loading && remoteItems === null) {
      return stableFallbackItems
    }
    const merged = mergeWithFallback(stableFallbackItems, remoteItems)
    return [...merged].filter(item => !item.deleted).sort(byNewest)
  }, [stableFallbackItems, loading, remoteItems])

  const saveItem = useCallback(async (item) => {
    let id = item.id;
    if (!id) id = await getNextSequenceId(db, name);
    id = String(id);
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

    // 🟢 Optimistic Update: อัปเดต State ที่หน้าจอก่อนทันทีโดยไม่ต้องดึงข้อมูลใหม่
    const localPayload = { ...payload, updatedAt: Date.now() }
    if (localPayload.createdAt) localPayload.createdAt = Date.now()

    let backupRemoteItems = null
    const backupCacheEntries = new Map(
      [...collectionCache.entries()].filter(([key]) => key.includes(`"collectionName":"${collectionName}"`))
    )
    setRemoteItems(prev => {
      backupRemoteItems = prev
      const list = prev || []
      const idx = list.findIndex(d => String(d.id) === id)
      if (idx >= 0) {
        const next = [...list]
        next[idx] = { ...next[idx], ...localPayload }
        return next
      }
      return [localPayload, ...list]
    })

    // 🟢 เคลียร์ Cache ทุก Query ของ Collection นี้ทิ้งทั้งหมด เพื่อบังคับให้ผู้ใช้ทั่วไป (Public) ดึงข้อมูลใหม่
    invalidateCollectionCache(collectionName)

    try {
      // ยิงเซฟลง Firestore แค่ 1 Write
      await setDoc(doc(db, collectionName, id), payload, { merge: true })
      await updateCollectionMetadata(collectionName)
    } catch (err) {
      // Rollback on failure
      setRemoteItems(backupRemoteItems)
      for (const [key, entry] of backupCacheEntries) {
        collectionCache.set(key, entry)
        if (PUBLIC_COLLECTIONS.includes(collectionName)) {
          try { localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items: entry.items, at: Date.now() })) } catch (e) { }
        }
      }
      throw err
    }

  }, [collectionName, isUserSpecific, uid, name])

  const deleteItem = useCallback(async (id) => {
    let backupRemoteItems = null
    const backupCacheEntries = new Map(
      [...collectionCache.entries()].filter(([key]) => key.includes(`"collectionName":"${collectionName}"`))
    )
    // 🟢 Optimistic Update: มาร์กเป็น deleted: true บนหน้าจอก่อนทันที (เพื่อแก้ปัญหา Fallback Merge ย้อนกลับมาแสดง)
    setRemoteItems(prev => {
      backupRemoteItems = prev
      const list = prev || []
      const idx = list.findIndex(d => String(d.id) === String(id))
      if (idx >= 0) {
        const next = [...list]
        next[idx] = { ...next[idx], deleted: true }
        return next
      }
      return [...list, { id: String(id), deleted: true }]
    })

    // 🟢 มาร์กเป็น deleted: true ใน Cache
    for (const [key, entry] of [...collectionCache.entries()]) {
      if (key.includes(`"collectionName":"${collectionName}"`)) {
        const idx = entry.items.findIndex(d => String(d.id) === String(id))
        const newItems = idx >= 0
          ? entry.items.map(d => String(d.id) === String(id) ? { ...d, deleted: true } : d)
          : [...entry.items, { id: String(id), deleted: true }]
        collectionCache.set(key, { ...entry, items: newItems })
        if (PUBLIC_COLLECTIONS.includes(collectionName)) {
          try { localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items: newItems, at: Date.now() })) } catch (e) { }
        }
      }
    }

    try {
      await setDoc(doc(db, collectionName, String(id)), {
        id: String(id),
        deleted: true,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      await updateCollectionMetadata(collectionName)
    } catch (err) {
      setRemoteItems(backupRemoteItems)
      for (const [key, entry] of backupCacheEntries) {
        collectionCache.set(key, entry)
        if (PUBLIC_COLLECTIONS.includes(collectionName)) {
          try { localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items: entry.items, at: Date.now() })) } catch (e) { }
        }
      }
      throw err
    }

  }, [collectionName])

  return {
    items,
    loading,
    error,
    isUsingFallback: !loading && (remoteItems === null || error !== null),
    saveItem,
    deleteItem,
  }
}

export async function saveContentItem(name, item, uid = null) {
  const collectionName = CONTENT_COLLECTIONS[name]
  if (!collectionName) throw new Error(`Unknown content collection: ${name}`)

  const isUserSpecific = USER_SPECIFIC_COLLECTIONS.includes(name)
  let id = item.id;
  if (!id) id = await getNextSequenceId(db, name);
  id = String(id);
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

  if (isUserSpecific && uid && item.uid && item.uid !== uid) {
    throw new Error("Unauthorized: cannot write to another user's data")
  }

  await setDoc(doc(db, collectionName, id), payload, { merge: true })

  const localPayload = { ...payload, updatedAt: Date.now() }
  if (localPayload.createdAt) localPayload.createdAt = Date.now()

  // 🟢 Optimistic Update แทนการล้าง Cache
  for (const [key, entry] of collectionCache.entries()) {
    if (key.includes(`"collectionName":"${collectionName}"`)) {
      const idx = entry.items.findIndex(d => String(d.id) === id)
      const newItems = idx >= 0
        ? entry.items.map(d => String(d.id) === id ? { ...d, ...localPayload } : d)
        : [localPayload, ...entry.items]
      collectionCache.set(key, { ...entry, items: newItems })
      if (PUBLIC_COLLECTIONS.includes(collectionName)) {
        try { localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items: newItems, at: Date.now() })) } catch (e) { }
      }
    }
  }
  await updateCollectionMetadata(collectionName)
}

export async function deleteContentItem(name, id) {
  const collectionName = CONTENT_COLLECTIONS[name]
  if (!collectionName) throw new Error(`Unknown content collection: ${name}`)

  await setDoc(doc(db, collectionName, String(id)), {
    id: String(id),
    deleted: true,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  // 🟢 Optimistic Update แทนการล้าง Cache โดยระบุเป็น deleted: true เพื่อความสอดคล้อง
  for (const [key, entry] of collectionCache.entries()) {
    if (key.includes(`"collectionName":"${collectionName}"`)) {
      const idx = entry.items.findIndex(d => String(d.id) === String(id))
      const newItems = idx >= 0
        ? entry.items.map(d => String(d.id) === String(id) ? { ...d, deleted: true } : d)
        : [...entry.items, { id: String(id), deleted: true }]
      collectionCache.set(key, { ...entry, items: newItems })
      if (PUBLIC_COLLECTIONS.includes(collectionName)) {
        try { localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items: newItems, at: Date.now() })) } catch (e) { }
      }
    }
  }
  await updateCollectionMetadata(collectionName)
}

/**
 * Bulk-delete multiple items in a single Firestore writeBatch (max 500 per batch).
 * Returns { deleted: number, failed: number } for partial-failure reporting.
 */
export async function bulkDeleteItems(name, ids) {
  const collectionName = CONTENT_COLLECTIONS[name]
  if (!collectionName) throw new Error(`Unknown content collection: ${name}`)
  if (!ids || ids.length === 0) return { deleted: 0, failed: 0 }

  const BATCH_LIMIT = 500
  let deleted = 0
  let failed = 0
  const now = serverTimestamp()

  // Process in chunks of 500 (Firestore writeBatch limit)
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const chunk = ids.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(db)
    chunk.forEach(id => {
      batch.set(doc(db, collectionName, String(id)), {
        id: String(id),
        deleted: true,
        updatedAt: now,
      }, { merge: true })
    })
    try {
      await batch.commit()
      deleted += chunk.length
    } catch (err) {
      console.error(`bulkDeleteItems: batch failed for chunk starting at index ${i}`, err)
      failed += chunk.length
    }
  }

  // Update local cache optimistically for all successfully marked IDs
  for (const [key, entry] of collectionCache.entries()) {
    if (key.includes(`"collectionName":"${collectionName}"`)) {
      const idsSet = new Set(ids.map(String))
      const newItems = entry.items.map(d => idsSet.has(String(d.id)) ? { ...d, deleted: true } : d)
      collectionCache.set(key, { ...entry, items: newItems })
      if (PUBLIC_COLLECTIONS.includes(collectionName)) {
        try { localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items: newItems, at: Date.now() })) } catch (e) { }
      }
    }
  }

  if (deleted > 0) await updateCollectionMetadata(collectionName)
  return { deleted, failed }
}

/**
 * Bulk-save multiple items in a single Firestore writeBatch (max 500 per batch).
 * Returns { saved: number, failed: number } for partial-failure reporting.
 */
export async function bulkSaveItems(name, items, uid = null) {
  const collectionName = CONTENT_COLLECTIONS[name]
  if (!collectionName) throw new Error(`Unknown content collection: ${name}`)
  if (!items || items.length === 0) return { saved: 0, failed: 0 }

  const isUserSpecific = USER_SPECIFIC_COLLECTIONS.includes(name)
  const BATCH_LIMIT = 500
  let saved = 0
  let failed = 0
  const now = serverTimestamp()
  
  const payloads = []
  for (const item of items) {
    let id = item.id;
    if (!id) id = await getNextSequenceId(db, name);
    id = String(id);
    const payload = {
      ...cleanForFirestore(item),
      id,
      deleted: false,
      updatedAt: now,
    }
    if (isUserSpecific && uid && !payload.uid) payload.uid = uid
    if (!payload.createdAt && !item.createdAt) payload.createdAt = now
    payloads.push(payload)
  }

  for (let i = 0; i < payloads.length; i += BATCH_LIMIT) {
    const chunk = payloads.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(db)
    chunk.forEach(payload => {
      batch.set(doc(db, collectionName, payload.id), payload, { merge: true })
    })
    try {
      await batch.commit()
      saved += chunk.length
    } catch (err) {
      console.error(`bulkSaveItems: batch failed for chunk starting at index ${i}`, err)
      failed += chunk.length
    }
  }

  // Update local cache optimistically
  for (const [key, entry] of collectionCache.entries()) {
    if (key.includes(`"collectionName":"${collectionName}"`)) {
      let newItems = [...entry.items]
      payloads.forEach(payload => {
        const idx = newItems.findIndex(d => String(d.id) === payload.id)
        if (idx >= 0) newItems[idx] = { ...newItems[idx], ...payload }
        else newItems = [payload, ...newItems]
      })
      collectionCache.set(key, { ...entry, items: newItems })
      if (PUBLIC_COLLECTIONS.includes(collectionName)) {
        try { localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + key, JSON.stringify({ items: newItems, at: Date.now() })) } catch (e) { }
      }
    }
  }

  if (saved > 0) await updateCollectionMetadata(collectionName)
  return { saved, failed }
}

const COUNT_CACHE_TTL_MS = 1 * 60 * 1000 // 1 minute memory
const COUNT_LOCAL_STORAGE_TTL_MS = 1 * 60 * 1000 // 1 minute localStorage

export function useCollectionCount(name) {
  const collectionName = CONTENT_COLLECTIONS[name]
  const cacheKey = `count_${name}`

  const getCachedValue = () => {
    // 1. Check memory cache
    const memEntry = countCache.get(cacheKey)
    if (memEntry && (Date.now() - memEntry.at < COUNT_CACHE_TTL_MS)) {
      return memEntry.count
    }
    // 2. Check localStorage cache
    try {
      const localData = localStorage.getItem(LOCAL_STORAGE_CACHE_PREFIX + cacheKey)
      if (localData) {
        const parsed = JSON.parse(localData)
        if (Date.now() - parsed.at < COUNT_LOCAL_STORAGE_TTL_MS) {
          countCache.set(cacheKey, { count: parsed.count, at: parsed.at })
          return parsed.count
        }
      }
    } catch (e) { }
    return null
  }

  const [count, setCount] = useState(() => getCachedValue() ?? 0)
  const [loading, setLoading] = useState(() => getCachedValue() === null)

  useEffect(() => {
    if (!collectionName) {
      setLoading(false)
      return
    }

    const cachedVal = getCachedValue()
    if (cachedVal !== null) {
      setCount(cachedVal)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    getCountFromServer(collection(db, collectionName))
      .then(snapshot => {
        if (!active) return
        const cnt = snapshot.data().count
        const now = Date.now()
        countCache.set(cacheKey, { count: cnt, at: now })
        try {
          localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + cacheKey, JSON.stringify({ count: cnt, at: now }))
        } catch (e) { }
        setCount(cnt)
        setLoading(false)
      })
      .catch(err => {
        if (!active) return
        console.error(`Error counting ${collectionName}:`, err)
        setLoading(false)
      })
    return () => { active = false }
  }, [collectionName, name])

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
  } catch (e) {
    return []
  }
}

function writeQuranBookmarksSession(uid, items) {
  if (!uid) return
  try {
    sessionStorage.setItem(`talib_quran_bookmarks_${uid}`, JSON.stringify(items))
  } catch (e) {
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
    if (!uid || fetchedRef.current === uid) return
    fetchedRef.current = uid
    fetchItems()
  }, [uid, fetchItems])

  const saveItem = useCallback(async (item) => {
    if (!collectionName) return
    let id = item.id;
    if (!id) id = await getNextSequenceId(db, name);
    id = String(id);
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
    // Optimistic Update
    setItems(prev => {
      const idx = prev.findIndex(d => String(d.id) === id)
      const next = { ...payload, id, savedAt: new Date() }
      const merged = idx >= 0 ? prev.map((d, i) => i === idx ? next : d) : [...prev, next]
      if (isQuranBookmarks) writeQuranBookmarksSession(uid, merged)
      return merged
    })
    await setDoc(doc(db, collectionName, id), payload, { merge: true })
    invalidateUserCollectionCache(collectionName, uid)
  }, [collectionName, uid, isQuranBookmarks])

  const deleteItem = useCallback(async (id) => {
    if (!collectionName) return
    // Optimistic Update
    setItems(prev => {
      const merged = prev.filter(d => String(d.id) !== String(id))
      if (isQuranBookmarks) writeQuranBookmarksSession(uid, merged)
      return merged
    })
    await setDoc(doc(db, collectionName, String(id)), {
      id: String(id), deleted: true, updatedAt: serverTimestamp()
    }, { merge: true })
    invalidateUserCollectionCache(collectionName, uid)
  }, [collectionName, uid, isQuranBookmarks])

  return { items, loading, saveItem, deleteItem, refetch: fetchItems }
}

/**
 * Single user document (1 Firestore read) — for quran_last_read, etc.
 */
export function useUserDoc(collectionKey, uid, docId, fallback = null) {
  const collectionName = CONTENT_COLLECTIONS[collectionKey]
  const serializedFallback = JSON.stringify(fallback)
  const stableFallback = useMemo(() => fallback, [serializedFallback])
  const [item, setItem] = useState(() => {
    if (!collectionName || !uid || !docId) return stableFallback
    const cached = readCachedUserDocument(collectionName, docId)
    return cached !== null ? cached : stableFallback
  })
  const [loading, setLoading] = useState(() => {
    if (!collectionName || !uid || !docId) return false
    const cached = readCachedUserDocument(collectionName, docId)
    return cached === null
  })

  const fetchDoc = useCallback(async () => {
    if (!collectionName || !uid || !docId) {
      setItem(stableFallback)
      setLoading(false)
      return
    }

    const cached = readCachedUserDocument(collectionName, docId)
    if (cached !== null) {
      setItem(cached)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const snapshot = await getDoc(doc(db, collectionName, String(docId)))
      if (snapshot.exists() && !snapshot.data()?.deleted) {
        const data = snapshot.data()
        const docData = { ...data, id: data.id ?? snapshot.id }
        writeCachedUserDocument(collectionName, docId, docData)
        setItem(docData)
      } else {
        if (collectionKey === "reading_streaks") {
          const legacySnap = await getDocs(
            query(
              collection(db, collectionName),
              where("uid", "==", uid),
              limit(1)
            )
          )
          if (!legacySnap.empty) {
            const data = legacySnap.docs[0].data()
            const docData = { ...data, id: data.id ?? legacySnap.docs[0].id }
            writeCachedUserDocument(collectionName, docId, docData)
            setItem(docData)
            return
          }
        }
        writeCachedUserDocument(collectionName, docId, null)
        setItem(null)
      }
    } catch (err) {
      console.error(`useUserDoc fetch error (${collectionKey}/${docId}):`, err)
      setItem(stableFallback)
    } finally {
      setLoading(false)
    }
  }, [collectionName, collectionKey, uid, docId, stableFallback])

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
    const finalData = { ...payload, id: String(docId) }
    writeCachedUserDocument(collectionName, docId, finalData)
    setItem(finalData)
  }, [collectionName, uid, docId])

  const deleteItem = useCallback(async () => {
    if (!collectionName || !docId) return
    await setDoc(doc(db, collectionName, String(docId)), {
      id: String(docId),
      deleted: true,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    invalidateUserDocumentCache(collectionName, docId)
    setItem(null)
  }, [collectionName, docId])

  return { item, loading, saveItem, deleteItem, refetch: fetchDoc }
}

const SETTINGS_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const documentCache = new Map()

function readCachedDocument(collectionName, docId) {
  const cacheKey = `${collectionName}:${docId}`
  // Check memory cache
  const entry = documentCache.get(cacheKey)
  if (entry) {
    if (Date.now() - entry.at < SETTINGS_CACHE_TTL_MS) {
      return entry.data
    }
    documentCache.delete(cacheKey)
  }

  // Check localStorage
  try {
    const localData = localStorage.getItem(LOCAL_STORAGE_CACHE_PREFIX + cacheKey)
    if (localData) {
      const parsed = JSON.parse(localData)
      if (Date.now() - parsed.at < SETTINGS_CACHE_TTL_MS) {
        documentCache.set(cacheKey, { data: parsed.data, at: parsed.at })
        return parsed.data
      }
      localStorage.removeItem(LOCAL_STORAGE_CACHE_PREFIX + cacheKey)
    }
  } catch (e) {
    console.error("Failed to read document from localStorage cache:", e)
  }
  return null
}

function writeCachedDocument(collectionName, docId, data) {
  const cacheKey = `${collectionName}:${docId}`
  const now = Date.now()
  documentCache.set(cacheKey, { data, at: now })
  try {
    localStorage.setItem(LOCAL_STORAGE_CACHE_PREFIX + cacheKey, JSON.stringify({ data, at: now }))
  } catch (e) {
    console.error("Failed to write document to localStorage cache:", e)
  }
}

export function invalidateDocumentCache(collectionName, docId) {
  const cacheKey = `${collectionName}:${docId}`
  documentCache.delete(cacheKey)
  try {
    localStorage.removeItem(LOCAL_STORAGE_CACHE_PREFIX + cacheKey)
  } catch (e) { }
}

/**
 * Fetch a single public content document (1 read) instead of the whole collection.
 * Checks the collection cache first to avoid Firestore reads if the list is already loaded.
 */
export function useContentDoc(collectionKey, docId, fallback = null) {
  const collectionName = CONTENT_COLLECTIONS[collectionKey]
  const serializedFallback = JSON.stringify(fallback)
  const stableFallback = useMemo(() => fallback, [serializedFallback])

  // Find in collection cache first to avoid Firestore getDoc reads
  const cachedFromCollection = useMemo(() => {
    if (!collectionName || !docId) return null
    // Search the memory cache for any cache key of this collection
    for (const [key, entry] of collectionCache.entries()) {
      if (key.includes(`"collectionName":"${collectionName}"`)) {
        const found = entry.items.find(item => String(item.id) === String(docId))
        if (found) return found
      }
    }
    // Search localStorage cache
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(LOCAL_STORAGE_CACHE_PREFIX) && key.includes(`"collectionName":"${collectionName}"`)) {
          const localData = localStorage.getItem(key)
          if (localData) {
            const parsed = JSON.parse(localData)
            const found = parsed.items?.find(item => String(item.id) === String(docId))
            if (found) return found
          }
        }
      }
    } catch (e) { }
    return null
  }, [collectionName, docId])

  const [item, setItem] = useState(() => cachedFromCollection || stableFallback)
  const [loading, setLoading] = useState(() => !cachedFromCollection && Boolean(docId))
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (!collectionName || !docId) {
      setItem(stableFallback)
      setLoading(false)
      return undefined
    }

    setLoading(!cachedFromCollection)
    if (cachedFromCollection) {
      setItem(cachedFromCollection)
      // Do not return here; we want to fetch the live document in the background
      // to get the most up-to-date views and downloads metrics.
    }

    getDoc(doc(db, collectionName, String(docId)))
      .then(snapshot => {
        if (!active) return
        if (snapshot.exists() && !snapshot.data()?.deleted) {
          const data = snapshot.data()
          setItem({ ...data, id: data.id ?? snapshot.id })
        } else {
          // If we had cached data but the doc is missing from DB, we fall back
          setItem(stableFallback)
        }
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        if (!active) return
        console.error(`Cannot load ${collectionName}/${docId}`, err)
        setError(err)
        if (!cachedFromCollection) {
          setItem(stableFallback)
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [collectionName, collectionKey, docId, stableFallback, cachedFromCollection])

  return { item, loading, error }
}

