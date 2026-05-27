import { useEffect, useMemo, useState } from "react"
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore"
import { db } from "../lib/firebase.js"
import { notifyError, notifySuccess } from "../utils/feedback.jsx"

const COLLECTION = "translation_abuiyaad"
const STATUS = { pending: "Pending", progress: "In progress", completed: "Completed" }
const STATUS_LABEL = { [STATUS.pending]: "ยังไม่แปล", [STATUS.progress]: "กำลังแปล", [STATUS.completed]: "แปลเสร็จแล้ว" }

function docId(url) {
  return btoa(unescape(encodeURIComponent(url))).replace(/[+/=]/g, "_").slice(0, 120)
}

export default function StaffTranslation({ go }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [progress, setProgress] = useState(0)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map(item => ({ id: item.id, ...item.data() })))
    } catch (error) {
      notifyError("โหลดฐานข้อมูลงานแปลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }

  async function runScrape() {
  setScraping(true)
  setProgress(30)
  try {
    const res = await fetch("/api/abuiyaad-scrape")
    const data = await res.json()

    if (!data.articles) throw new Error(data.error)

    setProgress(70)

    const BATCH_LIMIT = 499
    for (let i = 0; i < data.articles.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db)
      const chunk = data.articles.slice(i, i + BATCH_LIMIT)

      for (const post of chunk) {
        const id = docId(post.url)
        batch.set(
          doc(db, COLLECTION, id),
          { title: post.title, url: post.url, status: STATUS.pending },
          { merge: true }
        )
      }
      await batch.commit()
    }

    setProgress(100)
    notifySuccess(`สำเร็จ! ได้บทความทั้งหมด ${data.count} รายการ`)
    loadItems()

  } catch (err) {
    notifyError("กวาดข้อมูลไม่ได้: " + err.message)
  } finally {
    setScraping(false)
    setProgress(0)
  }
}
  async function updateItem(item, patch) {
    try {
      const batch = writeBatch(db)
      batch.set(doc(db, COLLECTION, item.id), { ...patch, updatedAt: serverTimestamp() }, { merge: true })
      await batch.commit()
      setItems(prev => prev.map(row => row.id === item.id ? { ...row, ...patch } : row))
      notifySuccess("อัปเดตสถานะแล้ว")
    } catch {
      notifyError("อัปเดตไม่สำเร็จ")
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(i => (statusFilter === "all" || i.status === statusFilter) && (!q || i.title.toLowerCase().includes(q)))
  }, [items, query, statusFilter])

  return (
    <div className="translation-page">
      <div className="staff-section-head">
        <div>
          <button className="btn btn-outline" onClick={() => go("staff")}><i className="ti ti-arrow-left"></i> กลับ</button>
          <h1>Translation Tracker</h1>
        </div>
        <button className="btn btn-teal" onClick={runScrape} disabled={scraping}>
          {scraping ? `กำลังกวาด... ${progress}%` : "กวาดข้อมูลจากเว็บทั้งหมด"}
        </button>
      </div>

      {scraping && (
        <div style={{ width: '100%', background: '#e0e0e0', height: '8px', margin: '15px 0', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, background: '#008080', height: '100%', transition: 'width 0.3s ease' }}></div>
        </div>
      )}

      <div className="card translation-table">
        {loading ? <div>กำลังโหลดข้อมูล...</div> : filtered.map(item => (
          <div className="translation-row" key={item.id}>
            <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
            <select value={item.status || STATUS.pending} onChange={e => updateItem(item, { status: e.target.value })}>
              {Object.values(STATUS).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}