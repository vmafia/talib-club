import { ARTICLE_CATEGORIES, ARTICLE_TYPES, SERIES } from "./articles.js"
import { BOOK_TYPES } from "./books.js"

export const DEFAULT_TAXONOMY = {
  articleCategories: ARTICLE_CATEGORIES.filter(item => item.id !== "all"),
  articleTypes: ARTICLE_TYPES.filter(item => item.id !== "all"),
  articleSeries: SERIES,
  bookTypes: BOOK_TYPES,
  bookSources: ["Talib Club", "สำนักพิมพ์อื่น"],
  mediaTypes: ["youtube", "spotify", "video"],
  scholarEras: [
    { id: "salaf", label: "ยุคแรก (Salaf)" },
    { id: "classical", label: "ยุคกลาง" },
    { id: "revival", label: "ยุคฟื้นฟู" },
    { id: "modern", label: "ยุคปัจจุบัน" },
  ],
  scholarFields: [
    { id: "aqeedah", label: "อากีดะฮ์" },
    { id: "fiqh", label: "ฟิกฮ์" },
    { id: "hadith", label: "หะดีษ" },
    { id: "tafsir", label: "ตัฟซีร" },
    { id: "history", label: "ประวัติศาสตร์" },
    { id: "arabic", label: "ภาษาอาหรับ" },
  ],
}
