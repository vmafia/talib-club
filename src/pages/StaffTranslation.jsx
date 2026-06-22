import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore"
import { db } from "../lib/firebase.js"
import { useAuth } from "../hooks/useAuth.js"
import { notifyError, notifySuccess } from "../utils/feedback.jsx"
import { buildPageRange } from "../utils/pagination.js"

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

function matchesStatus(item, filter) {
  if (filter === "all") return true
  const status = item.status || STATUS.pending
  return status === filter
}

function getMyName(profile) {
  return profile?.displayName || profile?.email || ""
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
  const { user, profile } = useAuth()
  const myName = getMyName(profile)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState(0)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [editItem, setEditItem] = useState(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [activeWorkspaceItem, setActiveWorkspaceItem] = useState(null)
  const [workspaceParagraphs, setWorkspaceParagraphs] = useState([])
  const [workspaceThaiTitle, setWorkspaceThaiTitle] = useState("")
  const [translating, setTranslating] = useState(false)
  const [workspaceDirty, setWorkspaceDirty] = useState(false)

  useEffect(() => { loadItems() }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [query, statusFilter, myTasksOnly, pageSize])

  async function loadItems() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error("Failed to load translation items:", err)
      notifyError("โหลดฐานข้อมูลงานแปลไม่สำเร็จ: " + (err.message || err))
    } finally {
      setLoading(false)
    }
  }

  async function openWorkspace(item) {
    if (item.assignee && item.assignee !== myName && item.status !== STATUS.completed) {
      notifyError(`งานนี้รับโดย ${item.assignee} อยู่แล้ว`)
      return
    }
    setActiveWorkspaceItem(item)
    setWorkspaceParagraphs(item.paragraphs || [])
    setWorkspaceThaiTitle(item.thaiTitle || "")
    setWorkspaceDirty(false)
  }

  function closeWorkspace() {
    if (workspaceDirty && !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากพื้นที่แปลหรือไม่?")) {
      return
    }
    setActiveWorkspaceItem(null)
    setWorkspaceParagraphs([])
    setWorkspaceThaiTitle("")
    setWorkspaceDirty(false)
    loadItems()
  }

  async function runTranslation() {
    if (!activeWorkspaceItem?.url) return
    setTranslating(true)
    try {
      const idToken = user ? await user.getIdToken() : ""
      const res = await fetch("/api/abuiyaad-translate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ url: activeWorkspaceItem.url }),
      })
      if (!res.ok) {
        let errMessage = `HTTP Error Status ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMessage += ` - ${errData.error}`;
        } catch { /* ignore parse error */ }
        throw new Error(errMessage);
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      const newParagraphs = data.translations || []
      setWorkspaceParagraphs(newParagraphs)
      setWorkspaceDirty(true)
      notifySuccess("แปลบทความด้วย AI เรียบร้อยแล้ว ตรวจทานและกดบันทึกร่างก่อนออก")
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
    const saved = {
      ...activeWorkspaceItem,
      paragraphs: workspaceParagraphs,
      thaiTitle: workspaceThaiTitle.trim(),
      status: markCompleted ? STATUS.completed : STATUS.progress,
      assignee: activeWorkspaceItem.assignee || myName,
    }
    setActiveWorkspaceItem(saved)
    setWorkspaceDirty(false)
    notifySuccess(markCompleted ? "บันทึกและทำเครื่องหมายว่าแปลเสร็จแล้ว" : "บันทึกร่างแล้ว")
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
      const localPatch = { ...patch }
      delete localPatch.claimedAt
      setItems(prev => prev.map(r => r.id === item.id ? { ...r, ...localPatch } : r))
      return true
    } catch (err) {
      console.error("Failed to update translation item:", err)
      notifyError("อัปเดตไม่สำเร็จ: " + (err.message || err))
      return false
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
  const pendingPct = total ? Math.round((pending / total) * 100) : 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(i => {
      if (myTasksOnly && i.assignee !== myName) return false
      if (!matchesStatus(i, statusFilter)) return false
      if (!q) return true
      return (
        i.title.toLowerCase().includes(q) ||
        (i.thaiTitle || "").toLowerCase().includes(q) ||
        (i.assignee || "").toLowerCase().includes(q)
      )
    })
  }, [items, query, statusFilter, myTasksOnly, myName])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const pageRange = useMemo(() => buildPageRange(currentPage, totalPages), [currentPage, totalPages])
  const paginatedItems = useMemo(() => {
    return filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [filtered, currentPage, pageSize])

  if (activeWorkspaceItem) {
    return (
      <div className="translation-page">
        {/* Print Stylesheet */}
        <style>{`
          @media print {
            html, body, #root, .app, main, .translation-page {
              height: auto !important;
              min-height: auto !important;
              max-height: none !important;
              overflow: visible !important;
              display: block !important;
              position: static !important;
            }
            body {
              background: #fff !important;
              margin: 0 !important;
              padding: 0 !important;
              color: #000 !important;
            }
            nav, .countdown-banner, .no-print {
              display: none !important;
            }
            #print-area {
              display: block !important;
              position: relative !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              page-break-after: auto;
            }
            #print-area * {
              visibility: visible !important;
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
                <div style={{ fontSize: "13px", lineHeight: "1.5", color: "#000", textAlign: "justify", fontWeight: (p.tag || "").startsWith("h") ? "bold" : "normal" }}>
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
              <button className="btn btn-outline" onClick={closeWorkspace}>
                <i className="ti ti-arrow-left" /> กลับหน้าหลัก
              </button>
              <h1 style={{ marginTop: "10px" }}>พื้นที่แปลภาษา</h1>
              <p style={{ marginTop: "4px" }}>บทความ: <a href={activeWorkspaceItem.url} target="_blank" rel="noreferrer" style={{ color: "var(--teal)" }}>{activeWorkspaceItem.title} <i className="ti ti-external-link" /></a></p>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                {activeWorkspaceItem.assignee ? (
                  <span className="badge badge-teal" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <i className="ti ti-user" /> ผู้รับงาน: {activeWorkspaceItem.assignee}
                  </span>
                ) : (
                  <span className="badge" style={{ background: "rgba(245,158,11,0.08)", color: "#bd7a13", border: "0.5px solid rgba(245,158,11,0.2)", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "12px" }}>
                    <i className="ti ti-info-circle" /> ยังไม่มีผู้รับงาน (จะรับงานให้อัตโนมัติเมื่อกดบันทึกร่าง)
                  </span>
                )}
              </div>
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
                onChange={e => { setWorkspaceThaiTitle(e.target.value); setWorkspaceDirty(true) }} 
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
                      <span style={{ fontSize: "10px", color: "var(--teal)", background: "var(--teal-bg)", padding: "2px 6px", borderRadius: "4px", marginRight: "6px", verticalAlign: "middle" }}>{(p.tag || "p").toUpperCase()}</span>
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
                          setWorkspaceDirty(true)
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
          <h1 style={{ marginTop: "10px" }}>ติดตามงานแปล</h1>
          <p style={{ marginTop: "4px" }}>กวาดรายการจาก abuiyaad.com รับงาน แปลด้วย AI และบันทึกความคืบหน้า</p>
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
                <div style={{ width: `${pendingPct}%`, background: "rgba(189,122,19,0.35)", height: "100%", transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "11px", color: "var(--t3)", flexWrap: "wrap" }}>
                <span><span style={{ color: "var(--teal)" }}>■</span> เสร็จแล้ว {completedPct}%</span>
                <span><span style={{ color: "#3b73c4" }}>■</span> กำลังแปล {inProgressPct}%</span>
                <span><span style={{ color: "#bd7a13" }}>■</span> ยังไม่แปล {pendingPct}%</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Search & Filter */}
      <div className="filter-bar translation-filter-bar">
        <div className="filter-search">
          <i className="ti ti-search"></i>
          <input
            type="text"
            placeholder="ค้นหาชื่อบทความ หัวข้อไทย หรือผู้รับงาน..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">ทั้งหมด ({total})</option>
          <option value={STATUS.pending}>ยังไม่แปล ({pending})</option>
          <option value={STATUS.progress}>กำลังแปล ({inProgress})</option>
          <option value={STATUS.completed}>แปลเสร็จแล้ว ({completed})</option>
        </select>
        <button
          type="button"
          className={`pill ${myTasksOnly ? "on-acc" : ""}`}
          onClick={() => setMyTasksOnly(v => !v)}
        >
          {myTasksOnly ? "แสดงทั้งหมด" : "เฉพาะงานของฉัน"}
        </button>
        <select
          className="filter-select translation-page-size"
          value={pageSize}
          onChange={e => setPageSize(Number(e.target.value))}
          aria-label="จำนวนรายการต่อหน้า"
        >
          <option value={10}>10 รายการ/หน้า</option>
          <option value={20}>20 รายการ/หน้า</option>
          <option value={50}>50 รายการ/หน้า</option>
        </select>
      </div>

      <div className="translation-list-meta">
        แสดง {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} จาก {filtered.length} รายการ
        {myTasksOnly && myName ? ` · งานของ ${myName}` : ""}
      </div>

      {/* Table */}
      <div className="card translation-table">
        {loading ? (
          <div className="empty">
            <i className="ti ti-loader-2 spin" style={{ fontSize: "24px", color: "var(--teal)" }} />
            <p style={{ marginTop: "10px" }}>กำลังโหลดข้อมูล...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty" style={{ padding: "32px 20px" }}>
            <i className="ti ti-search-off" style={{ fontSize: 28, color: "var(--t3)" }} />
            <p style={{ marginTop: 10 }}>{items.length === 0 ? "ยังไม่มีข้อมูล กดกวาดข้อมูลจากเว็บเพื่อเริ่มต้น" : "ไม่พบบทความตามเงื่อนไขที่เลือก"}</p>
          </div>
        ) : paginatedItems.map(item => (
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
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
              {/* Status Badge */}
              {item.status === STATUS.completed ? (
                <span className="badge" style={{ background: "rgba(16,185,129,0.08)", color: "var(--teal)", border: "0.5px solid rgba(16,185,129,0.2)", fontSize: "11px", padding: "3px 10px", borderRadius: "12px" }}>
                  <i className="ti ti-circle-check" style={{ marginRight: 4 }} />แปลเสร็จแล้ว
                </span>
              ) : item.status === STATUS.progress ? (
                <span className="badge" style={{ background: "rgba(59,115,196,0.08)", color: "#3b73c4", border: "0.5px solid rgba(59,115,196,0.2)", fontSize: "11px", padding: "3px 10px", borderRadius: "12px" }}>
                  <i className="ti ti-hourglass-low" style={{ marginRight: 4 }} />กำลังแปล
                </span>
              ) : (
                <span className="badge" style={{ background: "rgba(245,158,11,0.08)", color: "#bd7a13", border: "0.5px solid rgba(245,158,11,0.2)", fontSize: "11px", padding: "3px 10px", borderRadius: "12px" }}>
                  <i className="ti ti-dots" style={{ marginRight: 4 }} />ยังไม่แปล
                </span>
              )}

              {/* Action Buttons Row */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {/* 1. Claim/Unclaim */}
                {!item.assignee && item.status !== STATUS.completed && (
                  <button className="btn btn-teal" style={{ padding: "5px 12px", fontSize: "12px", height: "30px", display: "inline-flex", alignItems: "center" }}
                    onClick={() => claimItem(item)}>
                    รับงาน
                  </button>
                )}
                {item.assignee && item.assignee === myName && item.status !== STATUS.completed && (
                  <button className="btn btn-outline" style={{ padding: "5px 12px", fontSize: "12px", height: "30px", color: "#ef4444", borderColor: "rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.02)", display: "inline-flex", alignItems: "center" }}
                    onClick={() => unclaimItem(item)}>
                    ยกเลิกรับงาน
                  </button>
                )}

                {/* 2. Edit metadata */}
                <button className="btn btn-outline" style={{ padding: "5px 8px", fontSize: "12px", height: "30px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  onClick={() => setEditItem(item)}
                  title="แก้ไขรายละเอียดบทความ"
                >
                  <i className="ti ti-settings" />
                </button>

                {/* 3. Workspace / AI translate */}
                {item.status === STATUS.completed ? (
                  <button 
                    className="btn btn-outline" 
                    style={{ 
                      padding: "5px 12px", 
                      fontSize: "12px", 
                      height: "30px",
                      color: "var(--teal)", 
                      borderColor: "rgba(15,110,86,0.3)",
                      background: "rgba(15,110,86,0.05)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                    onClick={() => openWorkspace(item)}
                  >
                    <i className="ti ti-eye" /> ดู/แก้ไขคำแปล
                  </button>
                ) : item.status === STATUS.progress ? (
                  item.assignee === myName ? (
                    <button 
                      className="btn translation-btn-progress" 
                      onClick={() => openWorkspace(item)}
                    >
                      <i className="ti ti-pencil" /> แปลต่อ/ตรวจทาน
                    </button>
                  ) : (
                    <button 
                      className="btn" 
                      disabled 
                      style={{ 
                        padding: "5px 12px", 
                        fontSize: "12px", 
                        height: "30px", 
                        background: "var(--br2)", 
                        color: "var(--t3)", 
                        border: "none", 
                        cursor: "not-allowed",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title={`งานนี้กำลังแปลโดย ${item.assignee}`}
                    >
                      <i className="ti ti-lock" /> อยู่ระหว่างแปล
                    </button>
                  )
                ) : (
                  <button 
                    className="btn translation-btn-pending" 
                    onClick={() => openWorkspace(item)}
                  >
                    <i className="ti ti-cpu" /> เปิดพื้นที่แปล
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {filtered.length > pageSize && (
        <div className="pagination-container" style={{ marginTop: "24px" }}>
          <button 
            className={`pagination-btn ${currentPage === 1 ? "disabled" : ""}`}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            ก่อนหน้า
          </button>
          
          {pageRange.map((p, idx) => {
            const prev = pageRange[idx - 1]
            const showGap = prev && p - prev > 1
            return (
              <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {showGap && <span className="pagination-ellipsis" aria-hidden>…</span>}
                <button
                  className={`pagination-btn ${currentPage === p ? "active" : ""}`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              </span>
            )
          })}

          <button 
            className={`pagination-btn ${currentPage === totalPages ? "disabled" : ""}`}
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            ถัดไป
          </button>
        </div>
      )}

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