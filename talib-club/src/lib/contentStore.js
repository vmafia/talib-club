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

function byNewestDate(a, b) {
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

export function useContentCollection(name, fallbackItems = []) {
  const [remoteItems, setRemoteItems] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const collectionName = CONTENT_COLLECTIONS[name]

  useEffect(() => {
    if (!collectionName) {
      setError(new Error(`Unknown content collection: ${name}`))
      setLoading(false)
      return undefined
    }

    const unsubscribe = onSnapshot(
      collection(db, collectionName),
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
  }, [collectionName, name])

  const items = useMemo(() => {
    const source = loading && remoteItems === null ? [] : mergeWithFallback(fallbackItems, remoteItems)
    return [...source].sort(byNewestDate)
  }, [fallbackItems, loading, remoteItems])

  async function saveItem(item) {
    const id = String(item.id || crypto.randomUUID())
    await setDoc(doc(db, collectionName, id), {
      ...cleanForFirestore(item),
      id,
      deleted: false,
      updatedAt: serverTimestamp(),
    }, { merge: true })
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

export function useSiteSettings(fallbackSite) {
  const [site, setSite] = useState(fallbackSite)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, SITE_DOC.collection, SITE_DOC.id),
      snapshot => {
        setSite(snapshot.exists() ? { ...fallbackSite, ...snapshot.data() } : fallbackSite)
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
        setTaxonomy(snapshot.exists() ? { ...fallbackTaxonomy, ...snapshot.data() } : fallbackTaxonomy)
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
