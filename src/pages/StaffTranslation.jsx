import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
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

function docId(url) {
  return btoa(unescape(encodeURIComponent(url))).replace(/[+/=]/g, "_").slice(0, 120)
}

// ── Modal ──────────────────────────────────────────────────────────
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

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000
    }}>
      <div className="card" style={{ width: "min(520px,92vw)", padding: "28px" }}>
        <div style={{ marginBottom: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>บทความต้นฉบับ</div>
          <a href={item.url} target="_blank" rel="noreferrer"
            style={{ fontSize: "13px", color: "var(--teal)", fontWeight: 500, wordBreak: "break-word" }}>
            {item.title}
          </a>
        </div>

        <div style={{ display: "grid", gap: "14px", marginBottom: "22px" }}>
          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "var(--t2)" }}>
            หัวข้อภาษาไทย
            <input
              type="text"
              value={thaiTitle}
              onChange={e => setThaiTitle(e.target.value)}
              placeholder="กรอกหัวข้อภาษาไทย..."
            />
          </label>
          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "var(--t2)" }}>
            หมายเหตุ <span style={{ color: "var(--t3)", display: "inline" }}>(ไม่บังคับ)</span>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="เช่น กำลังรอตรวจสอบ, ต้องการความช่วยเหลือ..."
              rows={3}
              style={{ resize: "vertical" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-teal" onClick={handleSave} disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main ───────────────────────────────────────────────────────────
export default function StaffTranslation({ go }) {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState(0)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editItem, setEditItem] = useState(null)

  // Workspace states for side-by-side translation
  const [activeWorkspaceItem, setActiveWorkspaceItem] = useState(null)
  const [workspaceParagraphs, setWorkspaceParagraphs] = useState([])
  const [workspaceThaiTitle, setWorkspaceThaiTitle] = useState("")
  const [translating, setTranslating] = useState(false)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      notifyError("โหลดฐานข้อมูลงานแปลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }

  async function runTranslation() {
    setTranslating(true)
    try {
      const res = await fetch("/api/abuiyaad-translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: activeWorkspaceItem.url }),
      })
      if (!res.ok) throw new Error(`HTTP Error Status ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      const newParagraphs = data.translations || []
      setWorkspaceParagraphs(newParagraphs)
      notifySuccess("แปลบทความด้วย AI เรียบร้อยแล้ว! คุณสามารถปรับแก้ได้ในช่องขวา")
    } catch (err) {
      notifyError("แปลไม่สำเร็จ: " + err.message)
    } finally {
      setTranslating(false)
    }
  }

  async function saveWorkspace(markCompleted = false) {
    const name = profile?.displayName || profile?.email || "ไม่ระบุ"
    const patch = {
      paragraphs: workspaceParagraphs,
      thaiTitle: workspaceThaiTitle.trim(),
      status: markCompleted ? STATUS.completed : STATUS.progress,
      assignee: activeWorkspaceItem.assignee || name,
      claimedAt: activeWorkspaceItem.claimedAt || serverTimestamp(),
    }
    await updateItem(activeWorkspaceItem, patch)
    setActiveWorkspaceItem(prev => ({ ...prev, ...patch }))
    notifySuccess("บันทึกข้อมูลแล้ว")
  }

  async function runScrape() {
    setScraping(true)
    setScrapeProgress(30)
    try {
      const res = await fetch("/api/abuiyaad-scrape")
      const data = await res.json()
      if (!data.articles) throw new Error(data.error)
      setScrapeProgress(70)
      const BATCH_LIMIT = 499
      for (let i = 0; i < data.articles.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db)
        for (const post of data.articles.slice(i, i + BATCH_LIMIT)) {
          const id = docId(post.url)
          batch.set(doc(db, COLLECTION, id),
            { title: post.title, url: post.url, status: STATUS.pending },
            { merge: true }
          )
        }
        await batch.commit()
      }
      setScrapeProgress(100)
      notifySuccess(`สำเร็จ! ได้บทความทั้งหมด ${data.count} รายการ`)
      loadItems()
    } catch (err) {
      notifyError("กวาดข้อมูลไม่ได้: " + err.message)
    } finally {
      setScraping(false)
      setScrapeProgress(0)
    }
  }

  async function updateItem(item, patch) {
    try {
      const batch = writeBatch(db)
      batch.set(doc(db, COLLECTION, item.id), { ...patch, updatedAt: serverTimestamp() }, { merge: true })
      await batch.commit()
      setItems(prev => prev.map(r => r.id === item.id ? { ...r, ...patch } : r))
    } catch {
      notifyError("อัปเดตไม่สำเร็จ")
    }
  }

  async function claimItem(item) {
    const name = profile?.displayName || profile?.email || "ไม่ระบุ"
    await updateItem(item, { status: STATUS.progress, assignee: name, claimedAt: serverTimestamp() })
    notifySuccess("รับงานแล้ว")
  }

  async function unclaimItem(item) {
    await updateItem(item, { status: STATUS.pending, assignee: "", claimedAt: null })
    notifySuccess("ยกเลิกงานแล้ว")
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

  if (activeWorkspaceItem) {
    return (
      <div className="translation-page">
        {/* Print Stylesheet */}
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #print-area, #print-area * {
              visibility: visible !important;
            }
            #print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              color: #000 !important;
              background: #fff !important;
              display: block !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>

        {/* Print Area (Hidden on screen) */}
        <div id="print-area" style={{ display: "none", padding: "20px", fontFamily: "'Prompt', sans-serif" }}>
          <div style={{ padding: "12px", marginBottom: "20px", border: "1.5px solid #dcdcdc", borderRadius: "6px", fontSize: "12px", textAlign: "center", fontStyle: "italic", color: "#555", backgroundColor: "#f9f9f9" }}>
            ไฟล์นี้จัดทำขึ้นโดยการแปลเบื้องต้นจาก AI หากต้องการความถูกต้องสมบูรณ์ กรุณาตรวจสอบหรือเปรียบเทียบกับเว็บไซต์ต้นฉบับโดยตรง<br/>
            (This file is a preliminary AI translation. For absolute accuracy, please compare directly with the original website.)
          </div>
          
          <div style={{ borderBottom: "2px solid #0f6e56", paddingBottom: "12px", marginBottom: "20px" }}>
            <h1 style={{ fontSize: "20px", margin: "0 0 6px 0", color: "#111" }}>{workspaceThaiTitle || activeWorkspaceItem.title}</h1>
            <h2 style={{ fontSize: "15px", fontWeight: "normal", color: "#666", margin: "0 0 10px 0" }}>{activeWorkspaceItem.title}</h2>
            <div style={{ fontSize: "11px", color: "#888" }}>
              ต้นฉบับ: <a href={activeWorkspaceItem.url} target="_blank" rel="noreferrer">{activeWorkspaceItem.url}</a>
            </div>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            {workspaceParagraphs.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", borderBottom: ".5px solid #eee", paddingBottom: "12px", pageBreakInside: "avoid" }}>
                <div style={{ fontSize: "13px", lineHeight: "1.5", color: "#333", textAlign: "justify" }}>
                  {p.english}
                </div>
                <div style={{ fontSize: "13px", lineHeight: "1.5", color: "#000", textAlign: "justify", fontWeight: p.tag.startsWith("h") ? "bold" : "normal" }}>
                  {p.thai}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Screen Area (Hidden when printing) */}
        <div className="no-print">
          {/* Header */}
          <div className="staff-section-head" style={{ marginBottom: "20px" }}>
            <div>
              <button className="btn btn-outline" onClick={() => { setActiveWorkspaceItem(null); loadItems(); }}>
                <i className="ti ti-arrow-left" /> กลับหน้าหลัก
              </button>
              <h1 style={{ marginTop: "10px" }}>พื้นที่แปลภาษา</h1>
              <p style={{ marginTop: "4px" }}>บทความ: <a href={activeWorkspaceItem.url} target="_blank" rel="noreferrer" style={{ color: "var(--teal)" }}>{activeWorkspaceItem.title} <i className="ti ti-external-link" /></a></p>
            </div>
            
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button className="btn btn-outline" onClick={() => saveWorkspace(false)}>
                <i className="ti ti-device-floppy" style={{ marginRight: "4px" }} /> บันทึกร่าง
              </button>
              <button className="btn btn-teal" onClick={() => saveWorkspace(true)} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <i className="ti ti-checkbox" /> บันทึกเสร็จสมบูรณ์
              </button>
              {workspaceParagraphs.length > 0 && (
                <button className="btn" style={{ background: "var(--acc)", color: "var(--bg)", display: "inline-flex", alignItems: "center", gap: "4px" }} onClick={() => window.print()}>
                  <i className="ti ti-printer" /> พิมพ์ PDF (เทียบไทย-อังกฤษ)
                </button>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: "20px", marginBottom: "20px" }}>
            <label style={{ display: "grid", gap: "6px", fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>
              หัวข้อบทความภาษาไทย
              <input 
                type="text" 
                value={workspaceThaiTitle} 
                onChange={e => setWorkspaceThaiTitle(e.target.value)} 
                placeholder="กรอกชื่อหัวข้อภาษาไทย..."
                style={{ fontSize: "15px", padding: "10px" }}
              />
            </label>
          </div>

          {translating && (
            <div className="empty" style={{ padding: "40px" }}>
              <i className="ti ti-loader-2 spin" style={{ fontSize: "36px", color: "var(--teal)" }} />
              <p style={{ marginTop: "12px", fontWeight: 500 }}>ระบบ AI กำลังแปลและจัดเรียงเนื้อหาทีละประโยคแบบละเอียด...</p>
              <p style={{ fontSize: "12px", color: "var(--t3)" }}>ขั้นตอนนี้อาจใช้เวลา 5-15 วินาที ขึ้นอยู่กับความยาวของเนื้อหา</p>
            </div>
          )}

          {!translating && workspaceParagraphs.length === 0 && (
            <div className="empty" style={{ padding: "50px", border: "1.5px dashed var(--br)" }}>
              <i className="ti ti-language" style={{ fontSize: "44px", color: "var(--t3)", opacity: 0.6 }} />
              <h3 style={{ marginTop: "16px", fontSize: "16px" }}>ยังไม่มีเนื้อหาคำแปล</h3>
              <p style={{ color: "var(--t3)", fontSize: "13px", maxWidth: "450px", margin: "8px auto 20px" }}>
                กดปุ่มด้านล่างเพื่อสั่งให้ AI คัดลอกย่อหน้าภาษาอังกฤษทั้งหมดจาก abuiyaad.com แล้วแปลเป็นภาษาไทยให้อัตโนมัติในรูปแบบประโยคต่อประโยค
              </p>
              <button className="btn btn-teal" onClick={runTranslation} style={{ padding: "10px 24px" }}>
                <i className="ti ti-cpu" style={{ marginRight: "6px" }} /> สั่ง AI แปลบทความนี้
              </button>
            </div>
          )}

          {!translating && workspaceParagraphs.length > 0 && (
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", padding: "10px 20px", fontWeight: "600", color: "var(--t2)", borderBottom: "1px solid var(--br2)" }}>
                <div>อังกฤษ (Original)</div>
                <div>ไทย (คำแปล AI - แก้ไขได้)</div>
              </div>
              
              <div style={{ display: "grid", gap: "14px", maxHeight: "68vh", overflowY: "auto", paddingRight: "10px" }}>
                {workspaceParagraphs.map((p) => (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", background: "var(--card)", padding: "14px", borderRadius: "8px", border: ".5px solid var(--br)" }}>
                    <div style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--t2)", textAlign: "justify" }}>
                      <span style={{ fontSize: "10px", color: "var(--teal)", background: "var(--teal-bg)", padding: "2px 6px", borderRadius: "4px", marginRight: "6px", verticalAlign: "middle" }}>{p.tag.toUpperCase()}</span>
                      {p.english}
                    </div>
                    <div>
                      <textarea
                        value={p.thai || ""}
                        onChange={e => {
                          const updated = workspaceParagraphs.map(item =>
                            item.id === p.id ? { ...item, thai: e.target.value } : item
                          )
                          setWorkspaceParagraphs(updated)
                        }}
                        placeholder="กรอกบทแปลภาษาไทย..."
                        rows={Math.max(3, Math.ceil(p.english.length / 70))}
                        style={{ width: "100%", fontSize: "13px", lineHeight: "1.5", fontFamily: "'Prompt', sans-serif", padding: "8px", resize: "vertical", background: "var(--bg)", border: ".5px solid var(--br)", color: "var(--text)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="translation-page">

      {/* Header */}
      <div className="staff-section-head">
        <div>
          <button className="btn btn-outline" onClick={() => go("staff")}>
            <i className="ti ti-arrow-left" /> กลับ
          </button>
          <h1 style={{ marginTop: "10px" }}>Translation Tracker</h1>
          <p style={{ marginTop: "4px" }}>ติดตามสถานะการแปลบทความจาก abuiyaad.com</p>
        </div>
        <button className="btn btn-teal" onClick={runScrape} disabled={scraping}>
          <i className={`ti ${scraping ? "ti-loader-2 spin" : "ti-refresh"}`} style={{ marginRight: "6px" }} />
          {scraping ? `กำลังกวาด... ${scrapeProgress}%` : "กวาดข้อมูลจากเว็บ"}
        </button>
      </div>

      {/* Scrape progress */}
      {scraping && (
        <div style={{ width: "100%", background: "var(--br)", height: "4px", borderRadius: "2px", overflow: "hidden", marginBottom: "16px" }}>
          <div style={{ width: `${scrapeProgress}%`, background: "var(--teal)", height: "100%", transition: "width 0.3s ease" }} />
        </div>
      )}

      {/* Summary */}
      {!loading && (
        <>
          <div className="staff-stat-grid" style={{ marginBottom: "16px" }}>
            <div className="card staff-stat">
              <span>บทความทั้งหมด</span>
              <strong>{total}</strong>
            </div>
            <div className="card staff-stat warn">
              <span>ยังไม่แปล</span>
              <strong>{pending}</strong>
            </div>
            <div className="card staff-stat info">
              <span>กำลังแปล</span>
              <strong>{inProgress}</strong>
            </div>
            <div className="card staff-stat ok">
              <span>แปลเสร็จแล้ว</span>
              <strong>{completed}</strong>
            </div>
          </div>

          {total > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--t2)", marginBottom: "6px" }}>
                <span>ความคืบหน้าการแปล</span>
                <span>{completedPct}% เสร็จแล้ว · {inProgressPct}% กำลังแปล</span>
              </div>
              <div style={{ width: "100%", background: "var(--bg2)", height: "8px", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${completedPct}%`, background: "var(--teal)", height: "100%", transition: "width 0.5s ease" }} />
                <div style={{ width: `${inProgressPct}%`, background: "#3b73c4", height: "100%", transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "11px", color: "var(--t3)" }}>
                <span><span style={{ color: "var(--teal)" }}>■</span> เสร็จแล้ว</span>
                <span><span style={{ color: "#3b73c4" }}>■</span> กำลังแปล</span>
                <span><span style={{ color: "var(--bg2)" }}>■</span> ยังไม่แปล</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Search & Filter */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="ค้นหาบทความ (อังกฤษหรือไทย)..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: "200px" }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: "auto" }}
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
          <div className="empty">
            <i className="ti ti-loader-2 spin" style={{ fontSize: "24px", color: "var(--teal)" }} />
            <p style={{ marginTop: "10px" }}>กำลังโหลดข้อมูล...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">ไม่พบบทความ</div>
        ) : filtered.map(item => (
          <div key={item.id} style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) auto",
            gap: "12px",
            alignItems: "start",
            padding: "14px",
            borderTop: ".5px solid var(--br2)"
          }}>
            {/* ข้อมูล */}
            <div>
              <a href={item.url} target="_blank" rel="noreferrer"
                style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)", display: "block", marginBottom: "3px" }}>
                {item.title}
              </a>

              {item.thaiTitle ? (
                <div style={{ fontSize: "13px", color: "var(--teal)", marginBottom: "5px" }}>
                  {item.thaiTitle}
                </div>
              ) : (
                <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "5px", fontStyle: "italic" }}>
                  ยังไม่มีหัวข้อภาษาไทย
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {item.assignee && (
                  <span className="badge badge-teal" style={{ fontSize: "11px" }}>
                    <i className="ti ti-user" style={{ fontSize: "11px" }} /> {item.assignee}
                  </span>
                )}
                {item.note && (
                  <span style={{ fontSize: "11px", color: "var(--t3)", fontStyle: "italic" }}>
                    {item.note}
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
              <select
                value={item.status || STATUS.pending}
                onChange={e => updateItem(item, { status: e.target.value })}
                style={{ width: "auto", fontSize: "12px", padding: "5px 10px" }}
              >
                {Object.values(STATUS).map(s => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>

              <div style={{ display: "flex", gap: "6px" }}>
                {!item.assignee && item.status !== STATUS.completed && (
                  <button className="btn btn-outline" style={{ padding: "5px 12px", fontSize: "12px" }}
                    onClick={() => claimItem(item)}>
                    รับงาน
                  </button>
                )}
                {item.assignee && item.status !== STATUS.completed && (
                  <button className="btn btn-outline" style={{ padding: "5px 12px", fontSize: "12px", color: "var(--t3)" }}
                    onClick={() => unclaimItem(item)}>
                    ยกเลิก
                  </button>
                )}
                <button className="btn btn-outline" style={{ padding: "5px 12px", fontSize: "12px" }}
                  onClick={() => setEditItem(item)}>
                  <i className="ti ti-pencil" />
                </button>
              </div>

              {/* Workspace Entry Button */}
              <div style={{ marginTop: "4px" }}>
                {item.status === STATUS.completed ? (
                  <button 
                    className="btn btn-outline" 
                    style={{ 
                      padding: "5px 12px", 
                      fontSize: "12px", 
                      color: "var(--teal)", 
                      borderColor: "rgba(15,110,86,0.3)",
                      background: "rgba(15,110,86,0.05)"
                    }}
                    onClick={() => {
                      setActiveWorkspaceItem(item);
                      setWorkspaceParagraphs(item.paragraphs || []);
                      setWorkspaceThaiTitle(item.thaiTitle || "");
                    }}
                  >
                    <i className="ti ti-eye" style={{ marginRight: "4px" }} /> ดูและแก้ไขคำแปล
                  </button>
                ) : item.status === STATUS.progress ? (
                  <button 
                    className="btn" 
                    style={{ 
                      padding: "5px 12px", 
                      fontSize: "12px", 
                      background: "#3b73c4", 
                      color: "#fff" 
                    }}
                    onClick={() => {
                      setActiveWorkspaceItem(item);
                      setWorkspaceParagraphs(item.paragraphs || []);
                      setWorkspaceThaiTitle(item.thaiTitle || "");
                    }}
                  >
                    <i className="ti ti-pencil" style={{ marginRight: "4px" }} /> แปลต่อ / ตรวจทาน
                  </button>
                ) : (
                  <button 
                    className="btn" 
                    style={{ 
                      padding: "5px 12px", 
                      fontSize: "12px", 
                      background: "#bd7a13", 
                      color: "#fff" 
                    }}
                    onClick={() => {
                      setActiveWorkspaceItem(item);
                      setWorkspaceParagraphs(item.paragraphs || []);
                      setWorkspaceThaiTitle(item.thaiTitle || "");
                    }}
                  >
                    <i className="ti ti-cpu" style={{ marginRight: "4px" }} /> สั่ง AI แปลบทความ
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

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