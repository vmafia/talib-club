import { useEffect, useMemo, useState, useRef } from "react"
import { 
  collection, onSnapshot, query, updateDoc, doc, 
  serverTimestamp, addDoc, deleteDoc, setDoc, orderBy, getFirestore 
} from "firebase/firestore"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { initializeApp, getApps } from "firebase/app"
import toast from "react-hot-toast"

// ฟังก์ชันสำหรับแจ้งเตือน
const notifySuccess = (msg) => toast.success(msg)
const notifyError = (msg) => toast.error(msg)

// --- เริ่ม: โค้ดตั้งค่า Firebase (เพื่อให้ระบบ Preview ด้านขวามือทำงานได้) ---
const firebaseConfig = {
  apiKey: "AIzaSyC8HoWaAu0XWy3he_pMxqUIWwREDPdeUpg",
  authDomain: "talib-club-web.firebaseapp.com",
  projectId: "talib-club-web",
  storageBucket: "talib-club-web.firebasestorage.app",
  messagingSenderId: "300903382422",
  appId: "1:300903382422:web:887e6f03a6c4f0092db1b7"
};
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

// ⚠️ หมายเหตุสำหรับคุณอุสมาน: เมื่อนำโค้ดไปใช้ใน VS Code จริงของโปรเจกต์ 
// ให้ลบ Block การตั้งค่า Firebase ด้านบนนี้ออกทั้งหมด
// แล้วพิมพ์เรียกใช้งานบรรทัดนี้เหมือนเดิมครับ -> import { db } from "../lib/firebase.js"
// --- จบ: โค้ดตั้งค่า Firebase ---

// ━━━ CONFIGURATION ━━━
const ADMIN_TEAM = ["อุสมาน", "ฟาดิล", "อนันดา"] 
const SUBMISSION_TYPES = ["บทความ", "เอกสาร", "รูปภาพ", "คลิป", "เสียง", "อื่นๆ"]
const STATUS_OPTIONS = { PENDING: "รอตรวจ", REJECTED: "ตีกลับ", APPROVED: "อนุมัติแล้ว", POSTED: "ลงงานแล้ว" }
const PLATFORMS = ["Facebook", "Instagram", "YouTube", "TikTok", "Spotify"]

// ค่า Default กรณีเพิ่งเปิดระบบครั้งแรกและยังไม่มีข้อมูลใน Firebase
const DEFAULT_STAFF = ["ชาฟิน", "ชามิล", "ดาวูด", "ติรมีซี", "นิซอม", "แบยัง", "แบอัซมาวีย์", "ฟาดิล", "มะห์ดี", "ยะฮฺ", "อนันดา", "อับดุสสลาม", "อับบาส", "อุสมาน", "ฮาฟิซ"]
const DEFAULT_MAGAZINE = [
  { month: "มกราคม", user: "แบยัง" }, { month: "กุมภาพันธ์", user: "แบอัซมาวีย์" },
  { month: "มีนาคม", user: "อุสมาน" }, { month: "เมษายน", user: "ชามิล" },
  { month: "พฤษภาคม", user: "อนันดา" }, { month: "มิถุนายน", user: "แบยัง" },
  { month: "กรกฎาคม", user: "ฟาดิล" }, { month: "สิงหาคม", user: "ชาฟิน" },
  { month: "กันยายน", user: "อุสมาน" }, { month: "ตุลาคม", user: "ดาวูด" },
  { month: "พฤศจิกายน", user: "ฮาฟิซ" }, { month: "ธันวาคม", user: "มะห์ดี" }
]

// ━━━ TELEGRAM NOTIFICATION CONFIG ━━━
const TELEGRAM_BOT_TOKEN = "8683156343:AAEn8qfYjvhq2XhOkb0UuO3HP2re8U1emgk";
const TELEGRAM_CHAT_ID = "-1003358204239";

const sendBotNotification = async (message) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
    })
  } catch (e) {
    console.error("Telegram error:", e)
  }
}

const formatDate = (date) => {
  if (!date) return "-"
  // รองรับ Firebase Timestamp หรือ Date ธรรมดา
  const d = date?.toDate ? date.toDate() : (date.seconds ? new Date(date.seconds * 1000) : new Date(date))
  if (isNaN(d.getTime())) return "-"
  return new Intl.DateTimeFormat("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d)
}

const getFileIcon = (filename) => {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (["pdf", "doc", "docx"].includes(ext)) return "📄"
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️"
  if (["mp4", "avi", "mov", "webm"].includes(ext)) return "🎬"
  if (["mp3", "wav", "aac"].includes(ext)) return "🎵"
  return "📎"
}

export default function StaffWork({ authState, go }) {
  const [tab, setTab] = useState("dashboard")
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Dynamic Data States (โหลดจาก Firebase)
  const [staffTeam, setStaffTeam] = useState(DEFAULT_STAFF)
  const [magazineQueue, setMagazineQueue] = useState(DEFAULT_MAGAZINE)
  const [newStaffName, setNewStaffName] = useState("")

  // Form State (แยกหน้าที่มีผู้เขียน, กราฟิก, แอดมินโพสต์)
  const [form, setForm] = useState({ title: "", type: "", description: "", writer: "", graphic: "", adminPost: "", files: [] })
  const [uploading, setUploading] = useState(false)
  const [reviewingId, setReviewingId] = useState(null)
  const [feedback, setFeedback] = useState("")
  const [postingId, setPostingId] = useState(null)
  const [postingForm, setPostingForm] = useState({ scheduleDate: "", platforms: [], postLink: "" })

  const fileInputRef = useRef(null)
  
  // ⚡️ แก้ไขตรงนี้: ดึงชื่อจาก localStorage โดยตรง จะตรงกับคนที่ Login แน่นอน ⚡️
  const currentUser = localStorage.getItem("talib_user") || "ผู้เยี่ยมชม"
  const isAdmin = ADMIN_TEAM.includes(currentUser)

  // ดึงข้อมูลทั้งหมดจาก Firebase แบบ Real-time
  useEffect(() => {
    setLoading(true)

    const qSubs = query(collection(db, "submissions"), orderBy("createdAt", "desc"))
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      setSubs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error("Error fetching submissions:", err)
      notifyError("โหลดข้อมูลงานล้มเหลว")
      setLoading(false)
    })

    const unsubStaff = onSnapshot(doc(db, "settings", "staff"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().members) {
        setStaffTeam(docSnap.data().members)
      } else {
        setStaffTeam(DEFAULT_STAFF)
      }
    })

    const unsubMag = onSnapshot(doc(db, "settings", "magazine"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().queue) {
        setMagazineQueue(docSnap.data().queue)
      } else {
        setMagazineQueue(DEFAULT_MAGAZINE)
      }
    })

    return () => {
      unsubSubs()
      unsubStaff()
      unsubMag()
    }
  }, [])

  const filteredSubs = useMemo(() => {
    return subs.filter(s => {
      if (myTasksOnly) {
        return s.staffName === currentUser || s.writer === currentUser || s.graphic === currentUser || s.adminPost === currentUser
      }
      return true
    })
  }, [subs, myTasksOnly, currentUser])

  const stats = useMemo(() => ({
    pending: subs.filter(s => s.status === STATUS_OPTIONS.PENDING).length,
    rejected: subs.filter(s => s.status === STATUS_OPTIONS.REJECTED).length,
    approved: subs.filter(s => s.status === STATUS_OPTIONS.APPROVED).length,
    posted: subs.filter(s => s.status === STATUS_OPTIONS.POSTED).length,
  }), [subs])

  // --- Admin Methods (Update Firebase Settings) ---
  const handleAddStaff = async () => {
    if (!newStaffName.trim()) return
    const updatedTeam = [...staffTeam, newStaffName.trim()].sort()
    try {
      await setDoc(doc(db, "settings", "staff"), { members: updatedTeam }, { merge: true })
      setNewStaffName("")
      notifySuccess(`เพิ่ม "${newStaffName}" เข้าระบบแล้ว`)
    } catch (e) {
      console.error(e)
      notifyError("เกิดข้อผิดพลาดในการเพิ่มทีมงาน")
    }
  }

  const handleRemoveStaff = async (name) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ที่จะลบ "${name}" ออกจากระบบ?`)) {
      const updatedTeam = staffTeam.filter(n => n !== name)
      try {
        await setDoc(doc(db, "settings", "staff"), { members: updatedTeam }, { merge: true })
        notifySuccess(`ลบ "${name}" ออกจากระบบแล้ว`)
      } catch (e) {
        console.error(e)
        notifyError("เกิดข้อผิดพลาดในการลบทีมงาน")
      }
    }
  }

  const handleUpdateMagazine = async (index, newUser) => {
    const updatedQueue = [...magazineQueue]
    updatedQueue[index].user = newUser
    try {
      await setDoc(doc(db, "settings", "magazine"), { queue: updatedQueue }, { merge: true })
      notifySuccess(`อัปเดตคิววารสารสำเร็จ`)
    } catch (e) {
      console.error(e)
      notifyError("เกิดข้อผิดพลาดในการอัปเดตคิววารสาร")
    }
  }

  // --- File Handlers ---
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setForm(prev => ({ ...prev, files: [...prev.files, ...Array.from(e.target.files)] }))
    }
  }
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setForm(prev => ({ ...prev, files: [...prev.files, ...Array.from(e.dataTransfer.files)] }))
    }
  }
  const removeFormFile = (idx) => {
    setForm(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== idx) }))
  }

  // --- Submission Actions (Firebase) ---
  const handleCreateSubmission = async (e) => {
    e.preventDefault()
    if (!form.title || !form.type) {
      notifyError("กรุณากรอกหัวข้อและเลือกประเภทงาน")
      return
    }
    setUploading(true)
    
    try {
      const fileLinks = []
      const storage = getStorage(app) 
      
      if (form.files && form.files.length > 0) {
        for (const file of form.files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
          const storageRef = ref(storage, `staff_submissions/${Date.now()}_${safeName}`)
          await uploadBytes(storageRef, file)
          const url = await getDownloadURL(storageRef)
          fileLinks.push({ name: file.name, url })
        }
      }

      await addDoc(collection(db, "submissions"), {
        title: form.title,
        type: form.type,
        description: form.description,
        writer: form.writer,
        graphic: form.graphic,
        adminPost: form.adminPost,
        files: fileLinks,
        staffName: currentUser,
        status: STATUS_OPTIONS.PENDING,
        createdAt: serverTimestamp(),
        feedback: ""
      })
      
      notifySuccess("ส่งงานเข้าระบบแล้ว รอแอดมินตรวจสอบ")
      
      // ส่งแจ้งเตือน Telegram
      await sendBotNotification(`📬 [ส่งงานใหม่] โดย: ${currentUser}\n📌 หัวข้อ: "${form.title}"\n🏷️ ประเภท: ${form.type}\n\n👥 ทีมงานที่รับผิดชอบ:\n✍️ ผู้เขียน: ${form.writer || "-"}\n🎨 กราฟิก: ${form.graphic || "-"}\n📢 ผู้โพสต์: ${form.adminPost || "-"}\n\nรอแอดมินตรวจสอบความถูกต้องครับ 🚀`)
      
      setForm({ title: "", type: "", description: "", writer: "", graphic: "", adminPost: "", files: [] })
      setTab("dashboard")
    } catch (err) {
      console.error("Upload Error:", err)
      notifyError("เกิดข้อผิดพลาดในการส่งงาน กรุณาลองใหม่")
    } finally {
      setUploading(false)
    }
  }

  const handleReviewAction = async (id, nextStatus, feedbackText = "") => {
    try {
      await updateDoc(doc(db, "submissions", id), {
        status: nextStatus,
        feedback: feedbackText,
        updatedAt: serverTimestamp()
      })
      
      notifySuccess("บันทึกผลการตรวจสอบแล้ว")
      setReviewingId(null)

      const targetSub = subs.find(s => s.id === id)
      if (nextStatus === STATUS_OPTIONS.APPROVED) {
        await sendBotNotification(`✅ [อนุมัติแล้ว] งาน "${targetSub.title}"\nของคุณ ${targetSub.staffName} ได้รับการอนุมัติแล้ว 🎉 เตรียมตัวจัดตารางลงงานได้เลย!`)
      } else if (nextStatus === STATUS_OPTIONS.REJECTED) {
        await sendBotNotification(`⚠️ [ถูกตีกลับ] งาน "${targetSub.title}"\nของ ${targetSub.staffName} ถูกตีกลับให้แก้ไข!\n\n💬 ฟีดแบ็กจากแอดมิน:\n"${feedbackText}"\n\nรีบเข้าไปแก้ไขด้วยนะครับ 🛠️`)
      }
    } catch (e) {
      console.error(e)
      notifyError("อัปเดตสถานะล้มเหลว")
    }
  }

  const handlePostAction = async (id) => {
    try {
      await updateDoc(doc(db, "submissions", id), {
        status: STATUS_OPTIONS.POSTED,
        scheduleDate: postingForm.scheduleDate,
        platforms: postingForm.platforms,
        postLink: postingForm.postLink,
        updatedAt: serverTimestamp()
      })
      
      notifySuccess("บันทึกการโพสต์ลงงานเรียบร้อย!")
      setPostingId(null)
      const targetSub = subs.find(s => s.id === id)
      setPostingForm({ scheduleDate: "", platforms: [], postLink: "" })

      await sendBotNotification(`📢 [ลงงานเรียบร้อย] อัลฮัมดุลิลละฮฺ\nงานหัวข้อ "${targetSub.title}" โพสต์เผยแพร่เรียบร้อยแล้ว!\n\n📱 แพลตฟอร์ม: ${postingForm.platforms.join(", ")}\n🔗 ลิงก์โพสต์: ${postingForm.postLink || "ไม่ได้ระบุ"}`)
    } catch (e) {
      console.error(e)
      notifyError("บันทึกการโพสต์ล้มเหลว")
    }
  }

  const handleDeleteSub = async (id, title) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ที่จะลบงาน "${title}" ออกจากระบบถาวร?`)) {
      try {
        await deleteDoc(doc(db, "submissions", id))
        notifySuccess("ลบงานเรียบร้อยแล้ว")
      } catch (e) {
        console.error(e)
        notifyError("ลบงานล้มเหลว")
      }
    }
  }

  if (loading && subs.length === 0) {
    return (
      <div className="empty" style={{ padding: "80px 20px" }}>
        <i className="ti ti-loader-2 spin" style={{ fontSize: 40, color: "var(--teal)" }}></i>
        <p style={{ marginTop: 12 }}>กำลังโหลดข้อมูลระบบ Real-time...</p>
      </div>
    )
  }

  return (
    <div className="staff-work animate-fade-in" style={{ padding: "24px" }}>
      {/* ━━━ UPPER BANNER ━━━ */}
      <div className="card" style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--teal)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1>ศูนย์ปฏิบัติงาน Talib Club</h1>
            <p style={{ marginTop: "4px" }}>ทีมงาน: <strong style={{ color: "var(--teal)" }}>{currentUser}</strong> ({isAdmin ? "แอดมิน" : "ผู้จัดทำ"})</p>
          </div>
          <button className={`pill ${myTasksOnly ? "on-acc" : ""}`} onClick={() => setMyTasksOnly(!myTasksOnly)}>
            {myTasksOnly ? "👁️ แสดงงานทั้งหมด" : "📌 ดูเฉพาะงานของฉัน"}
          </button>
        </div>

        <div className="staff-stat-grid small" style={{ marginTop: "24px" }}>
          <div className="card staff-stat"><span>📥 รอตรวจสอบ</span><strong>{stats.pending}</strong></div>
          <div className="card staff-stat warn"><span>⚠️ โดนตีกลับ</span><strong style={{ color: "#bd7a13" }}>{stats.rejected}</strong></div>
          <div className="card staff-stat ok"><span>✅ ผ่านการอนุมัติ</span><strong>{stats.approved}</strong></div>
          <div className="card staff-stat info"><span>📢 ลงงานสำเร็จ</span><strong>{stats.posted}</strong></div>
        </div>
      </div>

      {/* ━━━ TABS NAVIGATION ━━━ */}
      <div className="staff-tabs" style={{ marginBottom: "24px" }}>
        <button className={`pill ${tab === "dashboard" ? "on" : ""}`} onClick={() => setTab("dashboard")}>📊 แดชบอร์ดติดตามงาน</button>
        <button className={`pill ${tab === "submit" ? "on" : ""}`} onClick={() => setTab("submit")}>📤 โยนไฟล์ส่งงาน</button>
        <button className={`pill ${tab === "magazine" ? "on" : ""}`} onClick={() => setTab("magazine")}>📚 คิววารสาร</button>
        {isAdmin && <button className={`pill ${tab === "admin" ? "on" : ""}`} onClick={() => setTab("admin")}>⚙️ ตั้งค่าระบบ</button>}
      </div>

      <div style={{ minHeight: "400px" }}>
        
        {/* ━━━ TAB: DASHBOARD ━━━ */}
        {tab === "dashboard" && (
          <div style={{ display: "grid", gap: "16px" }}>
            {filteredSubs.length === 0 ? (
              <div className="empty card">ไม่มีรายการงานที่ตรงกับเงื่อนไขในขณะนี้</div>
            ) : (
              filteredSubs.map(sub => {
                const isPending = sub.status === STATUS_OPTIONS.PENDING
                const isRejected = sub.status === STATUS_OPTIONS.REJECTED
                const isApproved = sub.status === STATUS_OPTIONS.APPROVED
                const isPosted = sub.status === STATUS_OPTIONS.POSTED

                return (
                  <div key={sub.id} className="card animate-fade-in" style={{ padding: "20px", borderLeft: `4px solid ${isPending ? "#bd7a13" : isRejected ? "#d84f4f" : isApproved ? "var(--teal)" : "#3b73c4"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                          <span className="tag tag-acc">{sub.type}</span>
                          <span className={`staff-status ${isPending ? "warn" : isRejected ? "bad" : isApproved ? "ok" : "info"}`}>{sub.status}</span>
                          <span style={{ fontSize: "11px", color: "var(--t3)" }}>คนส่ง: {sub.staffName} • {formatDate(sub.createdAt)}</span>
                        </div>
                        <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", lineHeight: "1.3" }}>{sub.title}</h2>
                        {sub.description && <p style={{ marginTop: "8px", color: "var(--t2)", whiteSpace: "pre-wrap" }}>{sub.description}</p>}
                      </div>
                      {(isAdmin || sub.staffName === currentUser) && (
                        <button className="btn btn-outline danger" onClick={() => handleDeleteSub(sub.id, sub.title)} style={{ padding: "4px 8px", fontSize: "11px" }}>🗑️ ลบ</button>
                      )}
                    </div>

                    <div style={{ marginTop: "14px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: "var(--t3)", fontWeight: "500" }}>👥 ทีมผู้รับผิดชอบ:</span>
                      {sub.writer && (
                        <span className="tag tag-acc" style={{ background: sub.writer === currentUser ? "var(--teal-bg)" : "var(--inp)", color: sub.writer === currentUser ? "var(--teal)" : "var(--t2)", padding: "4px 10px", fontSize: "11px", border: sub.writer === currentUser ? "1px solid var(--teal)" : "1px solid transparent" }}>
                          ✍️ ผู้เขียน: {sub.writer}
                        </span>
                      )}
                      {sub.graphic && (
                        <span className="tag tag-acc" style={{ background: sub.graphic === currentUser ? "var(--teal-bg)" : "var(--inp)", color: sub.graphic === currentUser ? "var(--teal)" : "var(--t2)", padding: "4px 10px", fontSize: "11px", border: sub.graphic === currentUser ? "1px solid var(--teal)" : "1px solid transparent" }}>
                          🎨 กราฟิก: {sub.graphic}
                        </span>
                      )}
                      {sub.adminPost && (
                        <span className="tag tag-acc" style={{ background: sub.adminPost === currentUser ? "var(--teal-bg)" : "var(--inp)", color: sub.adminPost === currentUser ? "var(--teal)" : "var(--t2)", padding: "4px 10px", fontSize: "11px", border: sub.adminPost === currentUser ? "1px solid var(--teal)" : "1px solid transparent" }}>
                          📢 โพสต์: {sub.adminPost}
                        </span>
                      )}
                      {!sub.writer && !sub.graphic && !sub.adminPost && (
                        <span style={{ fontSize: "11px", color: "var(--t3)" }}>- ไม่ได้ระบุ -</span>
                      )}
                    </div>

                    {sub.files && sub.files.length > 0 && (
                      <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: ".5px solid var(--br2)" }}>
                        <span style={{ fontSize: "12px", color: "var(--t2)", display: "block", marginBottom: "6px" }}>📎 ไฟล์แนบ (ดาวน์โหลดได้):</span>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {sub.files.map((file, i) => (
                            <a key={i} href={file.url} target="_blank" rel="noreferrer" className="pill on-acc" style={{ display: "flex", alignItems: "center", gap: "6px", textDecoration: "none" }}>
                              {getFileIcon(file.name)} {file.name}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {sub.feedback && (
                      <div className="staff-feedback" style={{ marginTop: "14px" }}>
                        <strong>💬 ฟีดแบ็กแอดมิน:</strong> {sub.feedback}
                      </div>
                    )}

                    {isPosted && (
                      <div style={{ marginTop: "14px", padding: "12px", background: "var(--inp)", borderRadius: "8px", fontSize: "12px" }}>
                        <p>📆 <strong>ลงงานจริง:</strong> {formatDate(sub.scheduleDate)}</p>
                        <p style={{ marginTop: "4px" }}>📱 <strong>แพลตฟอร์ม:</strong> {sub.platforms?.join(", ")}</p>
                        {sub.postLink && <p style={{ marginTop: "4px" }}>🔗 <strong>ลิงก์:</strong> <a href={sub.postLink} target="_blank" rel="noreferrer" style={{ color: "var(--teal)" }}>กดเพื่อดูโพสต์</a></p>}
                      </div>
                    )}

                    <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                      {isAdmin && isPending && reviewingId !== sub.id && (
                        <>
                          <button className="btn btn-outline" onClick={() => { setReviewingId(sub.id); setFeedback(sub.feedback || "") }} style={{ color: "#bd7a13", borderColor: "rgba(189,122,19,0.3)" }}>⚠️ ตีกลับ</button>
                          <button className="btn btn-teal" onClick={() => handleReviewAction(sub.id, STATUS_OPTIONS.APPROVED)}>✅ อนุมัติ</button>
                        </>
                      )}

                      {reviewingId === sub.id && (
                        <div className="card" style={{ width: "100%", padding: "14px", marginTop: "10px", background: "var(--bg2)" }}>
                          <label style={{ fontSize: "12px", display: "block", marginBottom: "6px" }}>ระบุคำแนะนำเพื่อให้ทีมงานนำไปแก้ไข:</label>
                          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="เช่น ขอแก้ฟอนต์..." rows="2" />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                            <button className="btn btn-outline" onClick={() => setReviewingId(null)}>ยกเลิก</button>
                            <button className="btn" onClick={() => handleReviewAction(sub.id, STATUS_OPTIONS.REJECTED, feedback)} style={{ background: "#bd7a13", color: "white" }}>ยืนยันส่งกลับ</button>
                          </div>
                        </div>
                      )}

                      {isAdmin && isApproved && postingId !== sub.id && (
                        <button className="btn btn-main" onClick={() => setPostingId(sub.id)}>📱 บันทึกการลงงาน</button>
                      )}

                      {postingId === sub.id && (
                        <div className="card" style={{ width: "100%", padding: "16px", marginTop: "12px", display: "grid", gap: "12px", background: "var(--bg2)" }}>
                          <h3>📝 บันทึกประวัติการลงโพสต์</h3>
                          <div className="staff-form-grid">
                            <div>
                              <label style={{ fontSize: "11px" }}>📆 เวลาลงโพสต์</label>
                              <input type="datetime-local" value={postingForm.scheduleDate} onChange={(e) => setPostingForm({ ...postingForm, scheduleDate: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ fontSize: "11px" }}>🔗 ลิงก์ URL โพสต์</label>
                              <input type="url" placeholder="https://..." value={postingForm.postLink} onChange={(e) => setPostingForm({ ...postingForm, postLink: e.target.value })} />
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: "11px", display: "block", marginBottom: "6px" }}>📱 แพลตฟอร์ม</label>
                            <div className="staff-choice-row">
                              {PLATFORMS.map(p => {
                                const active = postingForm.platforms.includes(p)
                                return (
                                  <button type="button" key={p} className={`pill ${active ? "on" : ""}`} onClick={() => setPostingForm(prev => ({
                                    ...prev, platforms: active ? prev.platforms.filter(x => x !== p) : [...prev.platforms, p]
                                  }))}>{p}</button>
                                )
                              })}
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
                            <button className="btn btn-outline" onClick={() => setPostingId(null)}>ยกเลิก</button>
                            <button className="btn btn-teal" onClick={() => handlePostAction(sub.id)}>💾 บันทึก & แจ้งกลุ่ม</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ━━━ TAB: SUBMIT ━━━ */}
        {tab === "submit" && (
          <div className="card" style={{ padding: "24px", maxWidth: "700px", margin: "0 auto" }}>
            <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>📤 ส่งผลงานชิ้นใหม่ (รองรับทุกไฟล์)</h2>
            <form onSubmit={handleCreateSubmission} className="staff-form" style={{ padding: 0 }}>
              
              <div className="staff-form-grid">
                <div>
                  <label>📌 หัวข้อย่อย / ชื่องาน <span style={{ color: "#d84f4f" }}>*</span></label>
                  <input required placeholder="เช่น อธิบายเตาฮีด EP.1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label>🏷️ ประเภทงาน <span style={{ color: "#d84f4f" }}>*</span></label>
                  <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="">-- เลือกประเภท --</option>
                    {SUBMISSION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label>📝 คำอธิบาย (บรีฟงาน หรือ ลิงก์ Drive เพิ่มเติม)</label>
                <textarea rows="3" placeholder="รายละเอียดต่างๆ..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              {/* แบ่งหน้าที่ชัดเจน */}
              <div className="staff-form-grid" style={{ marginTop: "12px", background: "var(--inp)", padding: "16px", borderRadius: "12px", border: "1px solid var(--br2)" }}>
                <div style={{ gridColumn: "1 / -1", marginBottom: "8px" }}>
                  <label style={{ fontWeight: "600", color: "var(--text)" }}>👥 ระบุทีมงานผู้รับผิดชอบตามหน้าที่ (เลือกได้ตามความเหมาะสม)</label>
                </div>
                
                <div>
                  <label style={{ fontSize: "11px", color: "var(--t2)", display: "block", marginBottom: "6px" }}>✍️ ผู้เขียน / ผู้แปลเนื้อหา</label>
                  <select value={form.writer} onChange={(e) => setForm({ ...form, writer: e.target.value })} style={{ fontSize: "12px" }}>
                    <option value="">-- ไม่ระบุ --</option>
                    {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "11px", color: "var(--t2)", display: "block", marginBottom: "6px" }}>🎨 กราฟิก / ตัดต่อวิดีโอ</label>
                  <select value={form.graphic} onChange={(e) => setForm({ ...form, graphic: e.target.value })} style={{ fontSize: "12px" }}>
                    <option value="">-- ไม่ระบุ --</option>
                    {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "11px", color: "var(--t2)", display: "block", marginBottom: "6px" }}>📢 แอดมินผู้ตรวจ / ผู้โพสต์ลงเพจ</label>
                  <select value={form.adminPost} onChange={(e) => setForm({ ...form, adminPost: e.target.value })} style={{ fontSize: "12px" }}>
                    <option value="">-- ไม่ระบุ --</option>
                    {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              </div>

              <div 
                onDragOver={handleDragOver} 
                onDragLeave={handleDragLeave} 
                onDrop={handleDrop}
                style={{ 
                  marginTop: "16px",
                  border: `2px dashed ${isDragging ? "var(--teal)" : "var(--br2)"}`, 
                  padding: "30px 24px", 
                  borderRadius: "12px", 
                  textAlign: "center", 
                  background: isDragging ? "var(--teal-bg)" : "var(--card)",
                  transition: "all 0.2s"
                }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: "40px", color: isDragging ? "var(--teal)" : "var(--t3)" }}></i>
                <p style={{ margin: "8px 0", fontSize: "14px", fontWeight: "500" }}>ลากไฟล์มาวาง หรือ กดเพื่ออัปโหลด</p>
                <p style={{ margin: "0 0 12px 0", fontSize: "11px", color: "var(--t3)" }}>รองรับวิดีโอ (MP4), ไฟล์เสียง, รูปภาพ, PDF, Word</p>
                <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} style={{ background: "var(--card)" }}>📎 เลือกไฟล์</button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple style={{ display: "none" }} />

                {form.files.length > 0 && (
                  <div style={{ marginTop: "16px", textAlign: "left", background: "var(--bg2)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--t2)", display: "block", marginBottom: "8px", fontWeight: "500" }}>ไฟล์ที่เตรียมส่ง: {form.files.length} ไฟล์</span>
                    <div style={{ display: "grid", gap: "6px" }}>
                      {form.files.map((file, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--card)", borderRadius: "6px", border: "1px solid var(--br2)" }}>
                          <span style={{ fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getFileIcon(file.name)} {file.name}</span>
                          <button type="button" onClick={() => removeFormFile(i)} style={{ background: "none", border: "none", color: "#d84f4f", cursor: "pointer", fontSize: "11px", fontWeight: "500", marginLeft: "10px" }}>ลบ</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="staff-form-actions" style={{ marginTop: "12px" }}>
                <button type="submit" className="btn btn-teal" disabled={uploading} style={{ width: "100%", padding: "14px", fontSize: "14px", fontWeight: "600" }}>
                  {uploading ? "⏳ กำลังอัปโหลดไฟล์ขึ้นระบบ..." : "🚀 ส่งผลงานเข้าคิวรอตรวจ"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ━━━ TAB: MAGAZINE ━━━ */}
        {tab === "magazine" && (
          <div className="card" style={{ padding: "24px" }}>
            <h2>📚 คิววารสารประจำปี</h2>
            <p style={{ marginBottom: "16px", color: "var(--t2)" }}>ติดตามผู้รับผิดชอบวารสารหลักในแต่ละเดือน</p>
            <div className="staff-mag-grid">
              {magazineQueue.map((item, i) => {
                const isCurrentMonth = i === new Date().getMonth()
                const isMine = item.user === currentUser
                return (
                  <div key={i} className={`card staff-mag-card ${isCurrentMonth ? "current" : ""} ${isMine ? "mine" : ""}`} style={{ padding: "16px", borderLeft: isCurrentMonth ? "4px solid var(--teal)" : "1px solid var(--br2)" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.month}</span>
                    <strong style={{ color: isCurrentMonth ? "var(--teal)" : "var(--text)", fontSize: "18px", marginTop: "4px" }}>{item.user}</strong>
                    {isCurrentMonth && <em style={{ fontSize: "10px", display: "inline-block", marginTop: "8px", background: "var(--teal-bg)", padding: "2px 8px", borderRadius: "10px", color: "var(--teal)", fontWeight: "500" }}>เดือนปัจจุบัน</em>}
                    {!isCurrentMonth && isMine && <em style={{ fontSize: "10px", display: "inline-block", marginTop: "8px", color: "var(--teal)", fontWeight: "500" }}>📌 คิวของคุณ</em>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ━━━ TAB: ADMIN SETTINGS ━━━ */}
        {tab === "admin" && isAdmin && (
          <div style={{ display: "grid", gap: "24px" }}>
            
            {/* Section 1: จัดการรายชื่อทีมงาน */}
            <div className="card" style={{ padding: "24px" }}>
              <h2 style={{ marginBottom: "16px" }}>👥 จัดการรายชื่อทีมงานในระบบ</h2>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", maxWidth: "400px" }}>
                <input 
                  type="text" 
                  value={newStaffName} 
                  onChange={(e) => setNewStaffName(e.target.value)} 
                  placeholder="พิมพ์ชื่อทีมงานใหม่..." 
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStaff()}
                />
                <button className="btn btn-teal" onClick={handleAddStaff}>+ เพิ่ม</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {staffTeam.map(name => (
                  <div key={name} className="pill" style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg2)" }}>
                    {name}
                    <button 
                      onClick={() => handleRemoveStaff(name)} 
                      style={{ background: "none", border: "none", color: "#d84f4f", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                      title="ลบรายชื่อ"
                    >×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: จัดการคิววารสาร */}
            <div className="card" style={{ padding: "24px" }}>
              <h2 style={{ marginBottom: "16px" }}>📚 กำหนดคิวผู้รับผิดชอบวารสาร</h2>
              <div className="grid3">
                {magazineQueue.map((item, i) => (
                  <div key={i} style={{ padding: "12px", background: "var(--bg2)", borderRadius: "8px" }}>
                    <label style={{ fontSize: "11px", color: "var(--t2)", display: "block", marginBottom: "6px" }}>{item.month}</label>
                    <select 
                      value={item.user} 
                      onChange={(e) => handleUpdateMagazine(i, e.target.value)}
                      style={{ padding: "6px 8px", fontSize: "13px" }}
                    >
                      <option value="">-- เลือกผู้รับผิดชอบ --</option>
                      {staffTeam.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}