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
  notebooks: "content_notebooks",
}

export const SITE_DOC = { collection: "content_settings", id: "site" }
export const TAXONOMY_DOC = { collection: "content_settings", id: "taxonomy" }

export const USER_SPECIFIC_COLLECTIONS = [
  "bookmarks",
  "bookshelf",
  "reading_sessions",
  "reading_streaks",
  "quran_bookmarks",
  "quran_last_read",
  "history",
  "notebooks",
]

export const COLLECTION_CACHE_TTL_MS = 5 * 60 * 1000
export const PUBLIC_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
export const PUBLIC_COLLECTIONS = ["content_articles", "content_books", "content_media", "content_scholars"]
export const LOCAL_STORAGE_CACHE_PREFIX = "talib_cache_"
export const USER_DOC_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
export const METADATA_TTL_MS = 5 * 60 * 1000 // 5 minutes
