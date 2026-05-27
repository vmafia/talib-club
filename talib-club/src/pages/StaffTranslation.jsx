import { useEffect, useMemo, useState } from "react"
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore"
import { db } from "../lib/firebase.js"
import { useAuth } from "../hooks/useAuth.js"
import { notifyError, notifySuccess } from "../utils/feedback.jsx"

const COLLECTION = "translation_abuiyaad"
const STATUS = { pending: "Pending", progress: "In progress", completed: "Completed" }
const STATUS_LABEL = {
  [STATUS.pending]: "ยังไม่แปล",
  [STATUS.progress]: "กำลังแปล",
  [STATUS.completed]: "แปลเสร็จแล้ว",
}
const STATUS_COLOR = {
  [STATUS.pending]: { bg: "#fff8e1", color: "#f59e0b", border: "#ffe082" },
  [STATUS.progress]: { bg: "#e3f2fd", color: "#2196f3", border: "#90caf9" },
  [STATUS.completed]: { bg: "#e8f5e9", color: "#4caf50", border: "#a5d6a7" },
}

function docId(url) {
  return btoa(unescape(encodeURIComponent(url))).replace(/[+/=]/g, "_").slice(0, 120)
}

// ── Modal กรอกรายละเอียด ──────────────────────────────────────────
function EditModal({ item, onClose, onSave }) {
  const [thaiTitle, setThaiTitle] = useState(item.thaiTitle || "")
  const [note, setNote] = useState(item.note || "")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({ thaiTitle: thaiTitle.trim(), note: note.trim() })
    setSaving(false)
    onClose()
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }}>
      <div style={{
        background: "var(--card-bg, #fff)", borderRadius: "14px", padding: "28px",
        width: "min(520px, 92vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.18)"
      }}>
        {/* Header */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", color: "#999", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>บทความต้นฉบับ</div>
          <a href={item.url} target="_blank" rel="noreferrer"
            style={{ fontSize: "14px", color: "#008080", fontWeight: 500, wordBreak: "break-word" }}>
            {item.title}
          </a>
        </div>

        {/* หัวข้อภาษาไทย */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
            หัวข้อภาษาไทย
          </label>
          <input
            type="text"
            value={thaiTitle}
            onChange={e => setThaiTitle(e.target.value)}
            placeholder="กรอกหัวข้อภาษาไทย..."
            style={{
              width: "100%", padding: "10px 12px", borderRadius: "8px",
              border: "1px solid #ddd", fontSize: "14px", boxSizing: "border-box",
              background: "var(--input-bg, #f9f9f9)"
            }}
          />
        </div>

        {/* หมายเหตุ */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
            หมายเหตุ <span style={{ fontWeight: 400, color: "#999" }}>(ไม่บังคับ)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="เช่น กำลังรอตรวจสอบ, ต้องการความช่วยเหลือ..."
            rows={3}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: "8px",
              border: "1px solid #ddd", fontSize: "14px", resize: "vertical",
              boxSizing: "border-box", background: "var(--input-bg, #f9f9f9)"
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #ddd", background: "transparent", cursor: "pointer", fontSize: "14px" }}>
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#008080", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────
export default function StaffTranslation({ go }) {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [progress, setProgress] = useState(0)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editItem, setEditItem] = useState(null)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map(item => ({ id: item.id, ...item.data() })))
    } catch {
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
          batch.set(doc(db, COLLECTION, id),
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
    } catch {
      notifyError("อัปเดตไม่สำเร็จ")
    }
  }

  // รับงาน — ใส่ชื่อ user ที่ login อัตโนมัติ
  async function claimItem(item) {
    const name = profile?.displayName || profile?.email || "ไม่ระบุ"
    await updateItem(item, { status: STATUS.progress, assignee: name, claimedAt: serverTimestamp() })
    notifySuccess(`รับงานแล้ว: ${name}`)
  }

  async function saveEdit(item, patch) {
    await updateItem(item, patch)
    notifySuccess("บันทึกแล้ว")
  }

  // สถิติ
  const total = items.length
  const completed = items.filter(i => i.status === STATUS.completed).length
  const inProgress = items.filter(i => i.status === STATUS.progress).length
  const pending = items.filter(i => !i.status || i.status === STATUS.pending).length
  const completedPct = total ? Math.round((completed / total) * 100) : 0
  const inProgressPct = total ? Math.round((inProgress / total) * 100) : 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(i =>
      (statusFilter === "all" || i.status === statusFilter) &&
      (!q || i.title.toLowerCase().includes(q) || (i.thaiTitle || "").toLowerCase().includes(q))
    )
  }, [items, query, statusFilter])

  return (
    <div className="translation-page">
      {/* Header */}
      <div className="staff-section-head">
        <div>
          <button className="btn btn-outline" onClick={() => go("staff")}>
            <i className="ti ti-arrow-left"></i> กลับ
          </button>
          <h1>Translation Tracker</h1>
        </div>
        <button className="btn btn-teal" onClick={runScrape} disabled={scraping}>
          {scraping ? `กำลังกวาด... ${progress}%` : "กวาดข้อมูลจากเว็บทั้งหมด"}
        </button>
      </div>

      {/* Scrape progress bar */}
      {scraping && (
        <div style={{ width: "100%", background: "#e0e0e0", height: "8px", margin: "15px 0", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, background: "#008080", height: "100%", transition: "width 0.3s ease" }} />
        </div>
      )}

      {/* Summary Cards */}
      {!loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", margin: "16px 0" }}>
            {[
              { label: "บทความทั้งหมด", value: total, bg: "#f8f9fa", color: "#333", border: "#e9ecef" },
              { label: "ยังไม่แปล", value: pending, bg: "#fff8e1", color: "#f59e0b", border: "#ffe082" },
              { label: "กำลังแปล", value: inProgress, bg: "#e3f2fd", color: "#2196f3", border: "#90caf9" },
              { label: "แปลเสร็จแล้ว", value: completed, bg: "#e8f5e9", color: "#4caf50", border: "#a5d6a7" },
            ].map(card => (
              <div key={card.label} style={{
                background: card.bg, borderRadius: "10px", padding: "16px",
                textAlign: "center", border: `1px solid ${card.border}`
              }}>
                <div style={{ fontSize: "30px", fontWeight: "bold", color: card.color }}>{card.value}</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar รวม */}
          {total > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#666", marginBottom: "6px" }}>
                <span>ความคืบหน้าการแปล</span>
                <span style={{ fontWeight: 600 }}>{completedPct}% เสร็จแล้ว · {inProgressPct}% กำลังแปล</span>
              </div>
              <div style={{ width: "100%", background: "#e0e0e0", height: "12px", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${completedPct}%`, background: "#4caf50", height: "100%", transition: "width 0.5s ease" }} />
                <div style={{ width: `${inProgressPct}%`, background: "#2196f3", height: "100%", transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "12px", color: "#888" }}>
                <span><span style={{ color: "#4caf50" }}>■</span> เสร็จแล้ว</span>
                <span><span style={{ color: "#2196f3" }}>■</span> กำลังแปล</span>
                <span><span style={{ color: "#ddd" }}>■</span> ยังไม่แปล</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filter & Search */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="ค้นหาบทความ (ภาษาอังกฤษหรือไทย)..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: "200px", padding: "9px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px" }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px" }}
        >
          <option value="all">ทั้งหมด ({total})</option>
          <option value={STATUS.pending}>ยังไม่แปล ({pending})</option>
          <option value={STATUS.progress}>กำลังแปล ({inProgress})</option>
          <option value={STATUS.completed}>แปลเสร็จแล้ว ({completed})</option>
        </select>
      </div>

      {/* Table */}
      <div className="card translation-table">
        {loading ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#888" }}>กำลังโหลดข้อมูล...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#888" }}>ไม่พบบทความ</div>
        ) : filtered.map(item => {
          const sc = STATUS_COLOR[item.status] || STATUS_COLOR[STATUS.pending]
          return (
            <div className="translation-row" key={item.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "start", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>

              {/* ข้อมูลบทความ */}
              <div>
                {/* หัวข้ออังกฤษ */}
                <a href={item.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: "14px", fontWeight: 500, color: "#008080", display: "block", marginBottom: "3px" }}>
                  {item.title}
                </a>

                {/* หัวข้อไทย */}
                {item.thaiTitle ? (
                  <div style={{ fontSize: "13px", color: "#555", marginBottom: "4px" }}>
                    🇹🇭 {item.thaiTitle}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#bbb", marginBottom: "4px", fontStyle: "italic" }}>
                    ยังไม่มีหัวข้อภาษาไทย
                  </div>
                )}

                {/* ผู้รับผิดชอบ + หมายเหตุ */}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  {item.assignee && (
                    <span style={{ fontSize: "12px", color: "#666" }}>
                      👤 {item.assignee}
                    </span>
                  )}
                  {item.note && (
                    <span style={{ fontSize: "12px", color: "#999", fontStyle: "italic" }}>
                      📝 {item.note}
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end", minWidth: "140px" }}>
                {/* Status badge + dropdown */}
                <select
                  value={item.status || STATUS.pending}
                  onChange={e => updateItem(item, { status: e.target.value })}
                  style={{
                    padding: "5px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                    border: `1px solid ${sc.border}`, background: sc.bg, color: sc.color, cursor: "pointer"
                  }}
                >
                  {Object.values(STATUS).map(s => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: "6px" }}>
                  {/* ปุ่มรับงาน */}
                  {(!item.assignee || item.assignee === "") && item.status !== STATUS.completed && (
                    <button
                      onClick={() => claimItem(item)}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: "12px",
                        border: "1px solid #008080", background: "transparent",
                        color: "#008080", cursor: "pointer", whiteSpace: "nowrap"
                      }}>
                      รับงาน
                    </button>
                  )}

                  {/* ปุ่มแก้ไข */}
                  <button
                    onClick={() => setEditItem(item)}
                    style={{
                      padding: "4px 10px", borderRadius: "6px", fontSize: "12px",
                      border: "1px solid #ddd", background: "transparent",
                      color: "#555", cursor: "pointer"
                    }}>
                    ✏️ แก้ไข
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={patch => saveEdit(editItem, patch)}
        />
      )}
    </div>
  )
}