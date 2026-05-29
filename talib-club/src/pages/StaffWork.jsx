import { useEffect, useMemo, useState, useRef } from "react"
import { collection, onSnapshot, query, updateDoc, doc, serverTimestamp, addDoc, deleteDoc, where } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { db, storage } from "../lib/firebase.js"
import { notifySuccess, notifyError } from "../utils/feedback.jsx"

// ━━━ CONFIG ━━━
const ADMIN_TEAM = ["อุสมาน", "ฟาดิล", "อนันดา"]
const STAFF_TEAM = ["ชาฟิน", "ชามิล", "ดาวูด", "ติรมีซี", "นิซอม", "แบยัง", "แบอัซมาวีย์", "ฟาดิล", "มะห์ดี", "ยะฮฺ", "อนันดา", "อับดุสสลาม", "อับบาส", "อุสมาน", "ฮาฟิซ"].sort()
const SUBMISSION_TYPES = ["บทความ", "เอกสาร", "รูปภาพ", "คลิป", "เสียง", "อื่นๆ"]
const STATUS_OPTIONS = { PENDING: "รอตรวจ", REJECTED: "ตีกลับ", APPROVED: "อนุมัติ", RECORDED: "บันทึก" }

const MAGAZINE_QUEUE = [
  { month: "มกราคม", user: "แบยัง" }, { month: "กุมภาพันธ์", user: "บังอัสมาวี" },
  { month: "มีนาคม", user: "อุสมาน" }, { month: "เมษายน", user: "ชามิล" },
  { month: "พฤษภาคม", user: "อนันดา" }, { month: "มิถุนายน", user: "แบยัง" },
  { month: "กรกฎาคม", user: "ฟาดิล" }, { month: "สิงหาคม", user: "ชาฟิน" },
  { month: "กันยายน", user: "อุสมาน" }, { month: "ตุลาคม", user: "ดาวูด" },
  { month: "พฤศจิกายน", user: "ฮาฟิซ" }, { month: "ธันวาคม", user: "มะห์ดี" }
]

// ━━━ HELPER FUNCTIONS ━━━
const formatDate = (date) => {
  if (!date) return "-"
  const d = new Date(date.seconds ? date.seconds * 1000 : date)
  return new Intl.DateTimeFormat("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d)
}

const formatTime = (seconds) => {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${String(sec).padStart(2, "0")}`
}

const getFileIcon = (filename) => {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (["pdf", "doc", "docx"].includes(ext)) return "📄"
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️"
  if (["mp4", "avi", "mov", "webm"].includes(ext)) return "🎬"
  if (["mp3", "wav", "aac"].includes(ext)) return "🎵"
  return "📎"
}

// ━━━ FETCH NOTIFICATIONS (Helper to send to Messenger) ━━━
const sendMessengerNotification = async (message, type = "info") => {
  // TODO: เชื่อมต่อ Facebook Messenger API หรือ Webhook
  // ตัวอย่าง: await fetch("/.netlify/functions/notify-messenger", { method: "POST", body: JSON.stringify({ message, type }) })
  console.log(`[${type.toUpperCase()}]`, message)
}

// ━━━ MAIN COMPONENT ━━━
export default function StaffWork({ authState, go }) {
  const [tab, setTab] = useState("dashboard")
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [selectedForReview, setSelectedForReview] = useState(null)
  const isAdmin = ADMIN_TEAM.includes(authState.user?.name)

  // ━━━ REAL-TIME LISTENER ━━━
  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, "submissions"))
    const unsubscribe = onSnapshot(q, (snap) => {
      setSubs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      notifyError("โหลดข้อมูลไม่ได้")
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // ━━━ STATS ━━━
  const stats = useMemo(() => ({
    pending: subs.filter(s => s.status === STATUS_OPTIONS.PENDING).length,
    rejected: subs.filter(s => s.status === STATUS_OPTIONS.REJECTED).length,
    approved: subs.filter(s => s.status === STATUS_OPTIONS.APPROVED).length,
    recorded: subs.filter(s => s.status === STATUS_OPTIONS.RECORDED).length,
    myPending: subs.filter(s => s.status === STATUS_OPTIONS.PENDING && s.staffName === authState.user?.name).length
  }), [subs, authState.user?.name])

  // ━━━ HANDLERS ━━━
  const handleSubmit = async (data) => {
    try {
      const docRef = await addDoc(collection(db, "submissions"), {
        ...data,
        staffName: authState.user?.name,
        status: STATUS_OPTIONS.PENDING,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        feedback: ""
      })
      notifySuccess("ส่งงานสำเร็จ ❤️")
      await sendMessengerNotification(`📬 ${authState.user?.name} ได้ส่งงาน: ${data.title}`, "info")
      setShowSubmitForm(false)
      return true
    } catch (e) {
      notifyError("ส่งงานไม่สำเร็จ")
      return false
    }
  }

  const handleUpdateStatus = async (id, newStatus, feedback = "") => {
    try {
      await updateDoc(doc(db, "submissions", id), {
        status: newStatus,
        feedback: feedback,
        updatedAt: serverTimestamp()
      })
      notifySuccess("อัปเดตสถานะเรียบร้อย")
      const sub = subs.find(s => s.id === id)
      if (newStatus === STATUS_OPTIONS.REJECTED) {
        await sendMessengerNotification(`⚠️ ${sub.staffName} - งานถูกตีกลับ: ${sub.title}\n💬 "${feedback}"`, "warning")
      } else if (newStatus === STATUS_OPTIONS.APPROVED) {
        await sendMessengerNotification(`✅ ${sub.staffName} - งานอนุมัติแล้ว: ${sub.title}`, "success")
      }
    } catch (e) {
      notifyError("อัปเดตไม่สำเร็จ")
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm("ลบงานนี้หรือ?")) {
      try {
        await deleteDoc(doc(db, "submissions", id))
        notifySuccess("ลบเรียบร้อย")
      } catch (e) {
        notifyError("ลบไม่ได้")
      }
    }
  }

  if (loading) {
    return (
      <div className="empty">
        <i className="ti ti-loader-2" style={{fontSize:28, color:"var(--teal)"}}></i>
        <p style={{marginTop:10}}>กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <div className="staff-work">
      {/* HEADER */}
      <div className="staff-work-head card" style={{padding: "24px", marginBottom: "24px"}}>
        <h1>ระบบส่งงาน Talib Club</h1>
        <p style={{marginTop: "8px"}}>รับงาน ส่งงาน ตรวจงาน และติดตามคิวงาน</p>
        
        <div className="staff-stat-grid" style={{marginTop: "20px"}}>
          <div className="card staff-stat">
            <span>รอตรวจ</span>
            <strong className={stats.pending > 0 ? "warn" : ""}>{stats.pending}</strong>
          </div>
          <div className="card staff-stat">
            <span>ตีกลับ</span>
            <strong style={{color: stats.rejected > 0 ? "#bd7a13" : "inherit"}}>{stats.rejected}</strong>
          </div>
          <div className="card staff-stat">
            <span>อนุมัติ</span>
            <strong className={stats.approved > 0 ? "ok" : ""}>{stats.approved}</strong>
          </div>
          <div className="card staff-stat">
            <span>บันทึก</span>
            <strong className={stats.recorded > 0 ? "ok" : ""}>{stats.recorded}</strong>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="staff-tabs">
        <button className={`pill ${tab === "dashboard" ? "on" : ""}`} onClick={() => setTab("dashboard")}>📊 แดชบอร์ด</button>
        <button className={`pill ${tab === "submit" ? "on" : ""}`} onClick={() => { setTab("submit"); setShowSubmitForm(true) }}>
          📤 ส่งงาน
          {stats.myPending > 0 && <span style={{marginLeft: "4px", background: "#d84f4f", color: "white", borderRadius: "10px", padding: "2px 6px", fontSize: "10px"}}>{stats.myPending}</span>}
        </button>
        <button className={`pill ${tab === "queue" ? "on" : ""}`} onClick={() => setTab("queue")}>
          📋 คิวตรวจ {isAdmin && `(${stats.pending})`}
        </button>
        {isAdmin && <button className={`pill ${tab === "admin" ? "on" : ""}`} onClick={() => setTab("admin")}>⚙️ ผู้จัดการ</button>}
        <button className={`pill ${tab === "magazine" ? "on" : ""}`} onClick={() => setTab("magazine")}>📚 คิววารสาร</button>
      </div>

      {/* CONTENT */}
      <div style={{minHeight: "500px"}}>
        {tab === "dashboard" && <DashboardTab subs={subs} authState={authState} stats={stats} handleSubmit={handleSubmit} />}
        {tab === "submit" && <SubmitTab showForm={showSubmitForm} setShowForm={setShowSubmitForm} onSubmit={handleSubmit} authState={authState} subs={subs} />}
        {tab === "queue" && <QueueTab subs={subs} isAdmin={isAdmin} authState={authState} onUpdateStatus={handleUpdateStatus} onDelete={handleDelete} />}
        {tab === "admin" && isAdmin && <AdminTab subs={subs} onDelete={handleDelete} stats={stats} />}
        {tab === "magazine" && <MagazineTab />}
      </div>
    </div>
  )
}

// ━━━ TAB: DASHBOARD ━━━
function DashboardTab({ subs, authState, stats, handleSubmit }) {
  const myWork = subs.filter(s => s.staffName === authState.user?.name)
  const recentRejected = subs.filter(s => s.status === STATUS_OPTIONS.REJECTED).slice(0, 5)

  return (
    <div style={{display: "grid", gap: "20px"}}>
      {/* MY TASKS */}
      <div className="card staff-task-card">
        <h2>งานของฉัน</h2>
        {myWork.length === 0 ? (
          <p style={{color: "var(--t2)", textAlign: "center", padding: "20px"}}>ยังไม่มีงาน</p>
        ) : (
          <div style={{marginTop: "12px"}}>
            {myWork.map(sub => (
              <div key={sub.id} className="staff-task-card" style={{marginBottom: "10px", borderLeft: "3px solid var(--teal)"}}>
                <div className="staff-card-top">
                  <span>📌 {sub.title}</span>
                  <span className={`staff-status ${sub.status === STATUS_OPTIONS.PENDING ? "warn" : sub.status === STATUS_OPTIONS.REJECTED ? "bad" : "ok"}`}>
                    {sub.status}
                  </span>
                </div>
                <p>{sub.description || "-"}</p>
                <small style={{color: "var(--t3)"}}>{sub.type} • {formatDate(sub.createdAt)}</small>
                {sub.feedback && (
                  <div className="staff-feedback">
                    <strong>💬 ฟีดแบ็ก:</strong> {sub.feedback}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REJECTED ITEMS */}
      {recentRejected.length > 0 && (
        <div className="card" style={{padding: "16px", borderLeft: "4px solid #d84f4f"}}>
          <h3>⚠️ งานที่ตีกลับล่าสุด</h3>
          {recentRejected.map(sub => (
            <div key={sub.id} style={{marginTop: "10px", padding: "10px", background: "rgba(216, 79, 79, 0.05)", borderRadius: "8px"}}>
              <p><strong>{sub.staffName}</strong> - {sub.title}</p>
              <p style={{fontSize: "12px", color: "#d84f4f", marginTop: "4px"}}>{sub.feedback}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ━━━ TAB: SUBMIT ━━━
function SubmitTab({ showForm, setShowForm, onSubmit, authState, subs }) {
  const [form, setForm] = useState({ title: "", type: "", description: "", assignedTo: "", files: [] })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    setForm(prev => ({ ...prev, files: [...prev.files, ...Array.from(e.target.files)] }))
  }

  const removeFile = (idx) => {
    setForm(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== idx) }))
  }

  const submitForm = async (e) => {
    e.preventDefault()
    if (!form.title || !form.type) {
      notifyError("กรุณากรอก หัวข้อ และ ประเภทงาน")
      return
    }

    setUploading(true)
    try {
      // Upload files
      const fileLinks = []
      for (const file of form.files) {
        const storageRef = ref(storage, `submissions/${Date.now()}-${file.name}`)
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        fileLinks.push({ name: file.name, url })
      }

      const success = await onSubmit({
        title: form.title,
        type: form.type,
        description: form.description,
        assignedTo: form.assignedTo,
        files: fileLinks
      })

      if (success) {
        setForm({ title: "", type: "", description: "", assignedTo: "", files: [] })
        setShowForm(false)
      }
    } finally {
      setUploading(false)
    }
  }

  const myPending = subs.filter(s => s.staffName === authState.user?.name && s.status === STATUS_OPTIONS.PENDING)

  if (!showForm) {
    return (
      <div style={{textAlign: "center", padding: "40px 20px"}}>
        <i className="ti ti-upload" style={{fontSize: "48px", color: "var(--teal)", display: "block", marginBottom: "12px"}}></i>
        <h2>ส่งงานใหม่</h2>
        <p style={{marginTop: "8px", color: "var(--t2)"}}>
          {myPending.length > 0 ? `คุณมี ${myPending.length} งานรอตรวจ` : "พร้อมส่งงาน!"}
        </p>
        <button className="btn btn-teal" onClick={() => setShowForm(true)} style={{marginTop: "16px"}}>
          ✏️ สร้างงานใหม่
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{padding: "20px", maxWidth: "600px"}}>
      <h2>📝 ส่งงานใหม่</h2>
      <form onSubmit={submitForm} className="staff-form">
        <div className="staff-form-grid">
          <div>
            <label style={{fontSize: "12px", color: "var(--t2)", fontWeight: "500"}}>📌 หัวข้อ</label>
            <input required value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="ชื่องาน/หัวข้อ" />
          </div>
          <div>
            <label style={{fontSize: "12px", color: "var(--t2)", fontWeight: "500"}}>🏷️ ประเภท</label>
            <select required value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}>
              <option value="">-- เลือก --</option>
              {SUBMISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={{fontSize: "12px", color: "var(--t2)", fontWeight: "500"}}>👥 มอบหมายให้</label>
          <select value={form.assignedTo} onChange={(e) => setForm({...form, assignedTo: e.target.value})}>
            <option value="">-- ตัวเอง --</option>
            {STAFF_TEAM.map(s => s !== authState.user?.name && <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={{fontSize: "12px", color: "var(--t2)", fontWeight: "500"}}>📝 คำอธิบาย</label>
          <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="รายละเอียดเพิ่มเติม..." rows="3"></textarea>
        </div>

        <div>
          <label style={{fontSize: "12px", color: "var(--t2)", fontWeight: "500"}}>📎 ไฟล์</label>
          <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} style={{width: "100%"}}>
            + เลือกไฟล์
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple style={{display: "none"}} />
          
          {form.files.length > 0 && (
            <div style={{marginTop: "10px", paddingTop: "10px", borderTop: ".5px solid var(--br2)"}}>
              {form.files.map((f, i) => (
                <div key={i} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", background: "var(--bg2)", borderRadius: "6px", marginBottom: "6px", fontSize: "12px"}}>
                  <span>{getFileIcon(f.name)} {f.name}</span>
                  <button type="button" className="btn btn-outline" onClick={() => removeFile(i)} style={{padding: "4px 8px", fontSize: "10px"}}>ลบ</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="staff-form-actions">
          <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>ยกเลิก</button>
          <button type="submit" className="btn btn-teal" disabled={uploading} style={{marginLeft: "10px"}}>
            {uploading ? "กำลังส่ง..." : "ส่งงาน"}
          </button>
        </div>
      </form>
    </div>
  )
}

// ━━━ TAB: QUEUE ━━━
function QueueTab({ subs, isAdmin, authState, onUpdateStatus, onDelete }) {
  const [filter, setFilter] = useState("ALL")
  const [reviewingId, setReviewingId] = useState(null)
  const [feedback, setFeedback] = useState("")

  const filtered = useMemo(() => {
    let list = subs
    if (filter !== "ALL") list = list.filter(s => s.status === filter)
    if (!isAdmin) list = list.filter(s => s.staffName === authState.user?.name)
    return list
  }, [subs, filter, isAdmin, authState.user?.name])

  return (
    <div style={{display: "grid", gap: "12px"}}>
      <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
        {["ALL", STATUS_OPTIONS.PENDING, STATUS_OPTIONS.REJECTED, STATUS_OPTIONS.APPROVED, STATUS_OPTIONS.RECORDED].map(st => (
          <button key={st} className={`pill ${filter === st ? "on" : ""}`} onClick={() => setFilter(st)}>
            {st === "ALL" ? "ทั้งหมด" : st}
          </button>
        ))}
      </div>

      <div className="translation-table">
        {filtered.length === 0 ? (
          <div style={{padding: "40px", textAlign: "center", color: "var(--t3)"}}>ไม่มีรายการ</div>
        ) : (
          filtered.map(sub => (
            <div key={sub.id} className="translation-row" style={{gridTemplateColumns: "1fr auto"}}>
              <div>
                <strong style={{fontSize: "14px"}}>{sub.title}</strong>
                <small style={{display: "block", marginTop: "4px"}}>
                  {sub.type} • {sub.staffName} • {formatDate(sub.createdAt)}
                </small>
                {sub.description && <p style={{marginTop: "6px", fontSize: "12px"}}>{sub.description}</p>}
                {sub.files?.length > 0 && (
                  <div style={{marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap"}}>
                    {sub.files.map((f, i) => (
                      <a key={i} href={f.url} target="_blank" rel="noreferrer" className="tag tag-teal">
                        {getFileIcon(f.name)} {f.name}
                      </a>
                    ))}
                  </div>
                )}
                {sub.feedback && (
                  <div className="staff-feedback" style={{marginTop: "8px"}}>
                    💬 {sub.feedback}
                  </div>
                )}
              </div>

              <div style={{display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end"}}>
                <span className={`staff-status ${sub.status === STATUS_OPTIONS.PENDING ? "warn" : sub.status === STATUS_OPTIONS.REJECTED ? "bad" : "ok"}`}>
                  {sub.status}
                </span>

                {isAdmin && sub.status === STATUS_OPTIONS.PENDING && (
                  <div style={{display: "flex", gap: "6px"}}>
                    <button className="btn btn-outline" onClick={() => { setReviewingId(sub.id); setFeedback("") }}>✏️</button>
                    <button className="btn" onClick={() => onUpdateStatus(sub.id, STATUS_OPTIONS.APPROVED)} style={{background: "var(--teal)", color: "white", padding: "6px 10px", fontSize: "11px"}}>✅</button>
                  </div>
                )}

                {isAdmin && <button className="btn btn-outline" onClick={() => onDelete(sub.id)} style={{color: "#d84f4f", borderColor: "rgba(216,79,79,.22)"}}>🗑️</button>}
              </div>

              {reviewingId === sub.id && (
                <div style={{gridColumn: "1 / -1", padding: "12px", background: "var(--bg2)", borderRadius: "8px"}}>
                  <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="ฟีดแบ็ก..." rows="2"></textarea>
                  <div style={{marginTop: "8px", display: "flex", gap: "6px"}}>
                    <button className="btn btn-outline" onClick={() => setReviewingId(null)}>ยกเลิก</button>
                    <button className="btn" onClick={() => { onUpdateStatus(sub.id, STATUS_OPTIONS.REJECTED, feedback); setReviewingId(null) }} style={{background: "#bd7a13", color: "white", padding: "6px 10px"}}>ตีกลับ</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ━━━ TAB: ADMIN ━━━
function AdminTab({ subs, onDelete, stats }) {
  const [archiveTab, setArchiveTab] = useState("all")

  const archived = useMemo(() => {
    let list = subs.filter(s => s.status === STATUS_OPTIONS.RECORDED)
    if (archiveTab !== "all") list = list.filter(s => s.type === archiveTab)
    return list
  }, [subs, archiveTab])

  return (
    <div style={{display: "grid", gap: "20px"}}>
      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px"}}>
        <div className="card staff-stat">
          <span>รอตรวจ</span>
          <strong className="warn">{stats.pending}</strong>
        </div>
        <div className="card staff-stat">
          <span>ตีกลับ</span>
          <strong style={{color: stats.rejected > 0 ? "#bd7a13" : "inherit"}}>{stats.rejected}</strong>
        </div>
        <div className="card staff-stat">
          <span>อนุมัติ</span>
          <strong className="ok">{stats.approved}</strong>
        </div>
        <div className="card staff-stat">
          <span>บันทึก</span>
          <strong className="ok">{stats.recorded}</strong>
        </div>
      </div>

      <div className="card" style={{padding: "16px"}}>
        <h2>📦 คลังงาน</h2>
        <div style={{marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap"}}>
          {["all", ...SUBMISSION_TYPES].map(t => (
            <button key={t} className={`pill ${archiveTab === t ? "on" : ""}`} onClick={() => setArchiveTab(t)}>
              {t === "all" ? "ทั้งหมด" : t}
            </button>
          ))}
        </div>

        <div className="translation-table" style={{marginTop: "12px"}}>
          {archived.length === 0 ? (
            <div style={{padding: "20px", textAlign: "center", color: "var(--t3)"}}>ไม่มีรายการ</div>
          ) : (
            archived.map(sub => (
              <div key={sub.id} className="translation-row" style={{gridTemplateColumns: "1fr 100px"}}>
                <div>
                  <strong>{sub.title}</strong>
                  <small style={{display: "block", marginTop: "4px"}}>
                    {sub.type} • {sub.staffName} • {formatDate(sub.updatedAt)}
                  </small>
                </div>
                <button className="btn btn-outline" onClick={() => onDelete(sub.id)} style={{color: "#d84f4f"}}>🗑️</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ━━━ TAB: MAGAZINE ━━━
function MagazineTab() {
  const currentMonth = new Date().getMonth()

  return (
    <div className="card" style={{padding: "20px"}}>
      <h2>📚 คิววารสารประจำปี</h2>
      <div className="staff-mag-grid" style={{marginTop: "16px"}}>
        {MAGAZINE_QUEUE.map((item, i) => (
          <div key={i} className={`card staff-mag-card ${i === currentMonth ? "current" : ""}`} style={{
            background: i === currentMonth ? "var(--teal-bg)" : "var(--card)",
            borderColor: i === currentMonth ? "var(--teal)" : "var(--br2)",
            borderLeftWidth: i === currentMonth ? "4px" : "1px"
          }}>
            <span>{item.month}</span>
            <strong style={{color: i === currentMonth ? "var(--teal)" : "var(--text)"}}>{item.user}</strong>
            {i === currentMonth && <em style={{color: "var(--teal)"}}>กำลังดำเนิน</em>}
          </div>
        ))}
      </div>
    </div>
  )
}