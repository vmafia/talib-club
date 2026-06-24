import React, { useEffect, useMemo, useState, useRef } from "react"
import { createPortal } from "react-dom"
import {
  collection, query, updateDoc, doc, getDocs, getDoc,
  serverTimestamp, addDoc, deleteDoc, setDoc, orderBy 
} from "firebase/firestore"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { toast } from "react-hot-toast"
import { db, app } from "../lib/firebase.js"
import { triggerPushNotification } from "../utils/pushNotifications.js"
import { Z } from "../utils/ui.js"
import StaffTasks from "../components/dashboard/StaffTasks.jsx"
import StaffCalendar from "../components/dashboard/StaffCalendar.jsx"

// ฟังก์ชันแจ้งเตือนด้วย Toast
const notifySuccess = (msg) => toast.success(msg)
const notifyError = (msg) => toast.error(msg)


// ━━━ CONFIGURATION ━━━
const ADMIN_TEAM = ["Usman Manu", "ฟาดิล", "อนันดา"] 
const SUBMISSION_TYPES = ["บทความ", "เอกสาร", "รูปภาพ", "คลิป", "เสียง", "อื่นๆ"]
const STATUS_OPTIONS = { PENDING: "รอตรวจ", REJECTED: "ตีกลับ", APPROVED: "อนุมัติแล้ว", POSTED: "ลงงานแล้ว" }
const PLATFORMS = ["Facebook", "Instagram", "YouTube", "TikTok", "Spotify"]

const DEFAULT_STAFF = ["ชาฟิน", "ชามิล", "ดาวูด", "ติรมีซี", "นิซอม", "แบยัง", "แบอัซมาวีย์", "ฟาดิล", "มะห์ดี", "ยะฮฺ", "อนันดา", "อับดุสสลาม", "อับบาส", "อุสมาน", "ฮาฟิซ"]
const DEFAULT_MAGAZINE = [
  { month: "มกราคม", user: "แบยัง" }, { month: "กุมภาพันธ์", user: "ฟาดิล" },
  { month: "มีนาคม", user: "อุสมาน" }, { month: "เมษายน", user: "ชามิล" },
  { month: "พฤษภาคม", user: "อนันดา" }, { month: "มิถุนายน", user: "แบยัง" },
  { month: "กรกฎาคม", user: "ฟาดิล" }, { month: "สิงหาคม", user: "ชาฟิน" },
  { month: "กันยายน", user: "อุสมาน" }, { month: "ตุลาคม", user: "ดาวูด" },
  { month: "พฤศจิกายน", user: "มะห์ดี" }, { month: "ธันวาคม", user: "ชาฟิน" }
]

// ━━━ TELEGRAM (ตั้งใน .env — ดู .env.example) ━━━
const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || ""
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || ""
const TELEGRAM_TOPIC_ID = import.meta.env.VITE_TELEGRAM_TOPIC_ID || "" // สำหรับกลุ่มที่มี Topics

const sendBotNotification = async (message) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML"
  };

  if (TELEGRAM_TOPIC_ID) {
    payload.message_thread_id = TELEGRAM_TOPIC_ID;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  } catch (e) {
    console.error("Telegram error:", e)
  }
}

const formatDate = (date) => {
  if (!date) return "-"
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
  
  // Modal State สำหรับลบข้อมูล
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: "", text: "", confirmLabel: "ยืนยัน", onConfirm: null })

  // Dynamic Data States
  const [staffTeam, setStaffTeam] = useState(DEFAULT_STAFF)
  const [magazineQueue, setMagazineQueue] = useState([])
  const [newStaffName, setNewStaffName] = useState("")

  // Form State (แยกหน้าที่ชัดเจน)
  const [form, setForm] = useState({ title: "", type: "", description: "", writer: "", graphic: "", poster: "", files: [] })
  const [uploading, setUploading] = useState(false)
  
  const [reviewingId, setReviewingId] = useState(null)
  const [feedback, setFeedback] = useState("")
  const [postingId, setPostingId] = useState(null)
  const [postingForm, setPostingForm] = useState({ scheduleDate: "", platforms: [], postLink: "" })

  const fileInputRef = useRef(null)
  const notifiedMonthRef = useRef(null) // Track if notification already sent this month
  
  // Security: Require authenticated user with uid, never fall back to localStorage
  const uid = authState?.user?.uid
  const currentUser = authState?.profile?.displayName || authState?.user?.displayName || ""
  const isAdmin = authState?.profile?.role === "admin" || authState?.user?.email === "islamofwhite@gmail.com" || (currentUser && ADMIN_TEAM.includes(currentUser))

  // Redirect if not authenticated
  if (!uid || !currentUser) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <p>กรุณาเข้าสู่ระบบเพื่อเข้าถึงหน้านี้</p>
      </div>
    )
  }

  // ━━━ FETCH DATA ━━━
  const [pollError, setPollError] = useState(null)
  const [failureCount, setFailureCount] = useState(0)
  
  // Use getDocs + periodic polling instead of onSnapshot to reduce Firebase reads
  // Polling every 10 seconds should give near real-time feel without excessive reads
  useEffect(() => {
    setLoading(true)
    setPollError(null)
    setFailureCount(0)
    let pollInterval = null
    let isMounted = true
    let pollBackoffDelay = 10000 // Start with 10 seconds

    const fetchData = async () => {
      try {
        const qSubs = query(collection(db, "submissions"), orderBy("createdAt", "desc"))
        const snap = await getDocs(qSubs)
        if (isMounted) {
          setSubs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
          setPollError(null)
          setFailureCount(0)
          pollBackoffDelay = 10000 // Reset backoff on success
        }
      } catch (err) {
        if (isMounted) {
          console.error("Fetch sub error:", err)
          setFailureCount(prev => prev + 1)
          setPollError("ไม่สามารถดึงข้อมูลงานได้ - กำลังลองใหม่...")
          // Exponential backoff: 10s, 20s, 40s max 60s
          pollBackoffDelay = Math.min(10000 * Math.pow(2, failureCount), 60000)
        }
      }
    }

    const fetchSettings = async () => {
      try {
        const staffSnap = await getDoc(doc(db, "settings", "staff"))
        if (isMounted && staffSnap.exists() && staffSnap.data().members) {
          setStaffTeam(staffSnap.data().members)
        }
      } catch (err) {
        console.error("Fetch staff settings error:", err)
      }

      try {
        const magSnap = await getDoc(doc(db, "settings", "magazine"))
        if (isMounted) {
          if (magSnap.exists() && magSnap.data().queue) {
            setMagazineQueue(magSnap.data().queue)
          } else {
            setMagazineQueue(DEFAULT_MAGAZINE)
          }
        }
      } catch (err) {
        console.error("Fetch magazine settings error:", err)
      }
    }

    // Initial load
    Promise.all([fetchData(), fetchSettings()]).then(() => {
      if (isMounted) setLoading(false)
    }).catch(err => {
      if (isMounted) {
        console.error("Initial fetch error:", err)
        setLoading(false)
      }
    })

    // Schedule first poll after initial load
    let nextPollDelay = pollBackoffDelay
    const schedulePoll = () => {
      if (!isMounted) return
      pollInterval = setTimeout(() => {
        if (!isMounted) return
        fetchData()
        fetchSettings()
        // Reschedule next poll with current backoff
        nextPollDelay = pollBackoffDelay
        schedulePoll()
      }, nextPollDelay)
    }
    
    schedulePoll()

    return () => {
      isMounted = false
      if (pollInterval) clearTimeout(pollInterval)
    }
  }, [])

  // ━━━ ออโต้แจ้งเตือนคิววารสารทุกต้นเดือน ━━━
  // Only check once per month using useRef to avoid duplicate notifications
  useEffect(() => {
    if (!isAdmin || magazineQueue.length === 0) return

    const checkMonthlyQueue = async () => {
      const now = new Date()
      const currentMonthIndex = now.getMonth()
      const currentYear = now.getFullYear()
      const currentMonth = `${currentYear}-${currentMonthIndex}`

      // Skip if we already notified this month (stored in useRef to persist across renders)
      if (notifiedMonthRef.current === currentMonth) return

      const currentQueue = magazineQueue[currentMonthIndex]
      if (currentQueue && currentQueue.user) {
        try {
          await sendBotNotification(`📚 [แจ้งเตือนคิววารสาร]\nเข้าสู่เดือน ${currentQueue.month} แล้ว!\n\nรับผิดชอบวารสารหลักเดือนนี้คือ: 🌟 ${currentQueue.user} 🌟\n\nเตรียมตัววางแผนงานได้เลยครับ 🚀`)
          await triggerPushNotification(
            "📚 แจ้งเตือนคิววารสารประจำเดือน",
            `เข้าสู่เดือน ${currentQueue.month} แล้ว! ผู้รับผิดชอบหลักคือ ${currentQueue.user}`,
            "/staff-work",
            { isStaffOnly: true }
          )
          // Mark this month as notified to prevent duplicate alerts
          notifiedMonthRef.current = currentMonth
        } catch (err) {
          console.error("Failed to send monthly notification:", err)
        }
      }
    }

    checkMonthlyQueue()
    // Run once on mount and when magazine queue is initially loaded, not on every update
  }, [isAdmin])

  const filteredSubs = useMemo(() => {
    return subs.filter(s => {
      if (myTasksOnly) {
        return s.staffName === currentUser || s.writer === currentUser || s.graphic === currentUser || s.poster === currentUser
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

  // ━━━ ADMIN ACTIONS ━━━
  const handleAddStaff = async () => {
    const name = newStaffName.trim()
    if (!name) return
    if (staffTeam.includes(name)) {
      notifyError(`"${name}" มีในระบบแล้ว`)
      return
    }
    const updatedTeam = [...staffTeam, name].sort()
    try {
      await setDoc(doc(db, "settings", "staff"), { members: updatedTeam }, { merge: true })
      setNewStaffName("")
      notifySuccess(`เพิ่ม "${name}" เข้าระบบแล้ว`)
    } catch (e) {
      notifyError("เกิดข้อผิดพลาดในการเพิ่มทีมงาน")
    }
  }

  const handleRemoveStaff = (name) => {
    setConfirmDialog({
      isOpen: true,
      title: "ลบทีมงาน",
      text: `คุณแน่ใจหรือไม่ที่จะลบ "${name}" ออกจากระบบ?`,
      confirmLabel: "ลบรายชื่อ",
      onConfirm: async () => {
        const updatedTeam = staffTeam.filter(n => n !== name)
        await setDoc(doc(db, "settings", "staff"), { members: updatedTeam }, { merge: true })
        notifySuccess(`ลบ "${name}" แล้ว`)
        setConfirmDialog({ isOpen: false })
      }
    })
  }

  const handleUpdateMagazine = async (index, newUser) => {
    const updatedQueue = [...magazineQueue]
    updatedQueue[index].user = newUser
    try {
      await setDoc(doc(db, "settings", "magazine"), { queue: updatedQueue }, { merge: true })
      notifySuccess(`อัปเดตคิววารสารสำเร็จ`)
    } catch (e) {
      notifyError("เกิดข้อผิดพลาดในการอัปเดตคิววารสาร")
    }
  }

  // ━━━ FILE & FORM HANDLERS ━━━
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
            let storageRef = null
            try {
              storageRef = ref(storage, `staff_submissions/${Date.now()}_${safeName}`)
              await uploadBytes(storageRef, file)
            } catch (uploadErr) {
              console.error("Staff submission upload error:", uploadErr?.code || "-", uploadErr?.message || uploadErr, "ref:", storageRef?.fullPath)
              throw uploadErr
            }
            const url = await getDownloadURL(storageRef)
            fileLinks.push({ name: file.name, url })
        }
      }

      await addDoc(collection(db, "submissions"), {
        title: form.title,
        type: form.type,
        description: form.description,
        writer: form.writer || "-",
        graphic: form.graphic || "-",
        poster: form.poster || "-",
        files: fileLinks,
        staffName: currentUser,
        status: STATUS_OPTIONS.PENDING,
        createdAt: serverTimestamp(),
        feedback: ""
      })
      
      notifySuccess("ส่งงานเข้าระบบแล้ว รอแอดมินตรวจสอบ")
      
      await sendBotNotification(
        `📬 [งานใหม่] ส่งโดย: ${currentUser}\nหัวข้อ: "${form.title}"\nประเภท: ${form.type}\n` +
        `✍️ เขียน/แปล: ${form.writer || "-"}\n🎨 กราฟิก: ${form.graphic || "-"}\n📢 คนลงโพสต์: ${form.poster || "-"}\n\nรอแอดมินตรวจสอบครับ 🚀`
      )
      await triggerPushNotification(
        "📬 มีงานส่งใหม่รอการตรวจสอบ",
        `หัวข้อ: "${form.title}" ส่งโดย: ${currentUser}`,
        "/staff-work",
        { isStaffOnly: true }
      )
      
      setForm({ title: "", type: "", description: "", writer: "", graphic: "", poster: "", files: [] })
      setTab("dashboard")
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการส่งงาน")
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
      if (!targetSub) return
      if (nextStatus === STATUS_OPTIONS.APPROVED) {
        await sendBotNotification(`✅ [อนุมัติแล้ว] งาน "${targetSub.title}"\nตรวจผ่านแล้ว 🎉 เตรียมจัดคิวลงแพลตฟอร์มได้เลย!`)
        await triggerPushNotification(
          "✅ งานผ่านการอนุมัติแล้ว",
          `งาน "${targetSub.title}" ได้รับการอนุมัติโดยแอดมิน`,
          "/staff-work",
          { isStaffOnly: true }
        )
      } else if (nextStatus === STATUS_OPTIONS.REJECTED) {
        await sendBotNotification(`⚠️ [ถูกตีกลับ] งาน "${targetSub.title}"\nของถูกตีกลับให้แก้ไข!\n\n💬 ฟีดแบ็กจากแอดมิน:\n"${feedbackText}"\n\nรีบเข้าไปแก้ไขด้วยนะครับ 🛠️`)
        await triggerPushNotification(
          "⚠️ งานถูกตีกลับให้แก้ไข",
          `งาน "${targetSub.title}" ถูกส่งกลับ: "${feedbackText}"`,
          "/staff-work",
          { isStaffOnly: true }
        )
      }
    } catch (e) {
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
      notifySuccess("บันทึกการลงงานเรียบร้อย!")
      setPostingId(null)
      const targetSub = subs.find(s => s.id === id)
      if (!targetSub) return
      const platformsStr = postingForm.platforms.join(", ")
      const postUrl = postingForm.postLink
      setPostingForm({ scheduleDate: "", platforms: [], postLink: "" })

      await sendBotNotification(`📢 [ลงโพสต์เรียบร้อย]\nงาน: "${targetSub.title}"\n\n📱 แพลตฟอร์ม: ${platformsStr}\n🔗 ลิงก์: ${postUrl || "ไม่ได้ระบุ"}`)
      await triggerPushNotification(
        "📢 ลงงานจริงเรียบร้อย",
        `งาน "${targetSub.title}" เผยแพร่ลง ${platformsStr} แล้ว`,
        "/staff-work",
        { isStaffOnly: true }
      )
    } catch (e) {
      notifyError("บันทึกการโพสต์ล้มเหลว")
    }
  }

  const handleDeleteSub = (id, title) => {
    setConfirmDialog({
      isOpen: true,
      title: "ยืนยันการลบงาน",
      text: `คุณแน่ใจหรือไม่ที่จะลบงาน "${title}" ออกจากระบบถาวร? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้`,
      confirmLabel: "ลบงานถาวร",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "submissions", id))
          notifySuccess("ลบงานเรียบร้อยแล้ว")
          setConfirmDialog({ isOpen: false })
        } catch (e) {
          notifyError("ลบงานล้มเหลว")
        }
      }
    })
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
      
      {/* ━━━ CUSTOM MODAL (แทนที่ Alert เบราว์เซอร์) ━━━ */}
      {confirmDialog.isOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.modal, padding: '20px' }}>
          <div className="card animate-fade-in" style={{ background: 'var(--bg)', padding: '24px', width: '100%', maxWidth: '420px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#d84f4f' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: '28px' }}></i>
              <h2 style={{ fontSize: '20px', color: 'var(--text)' }}>{confirmDialog.title}</h2>
            </div>
            <p style={{ color: 'var(--t2)', marginBottom: '24px', lineHeight: '1.6' }}>{confirmDialog.text}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setConfirmDialog({ isOpen: false })}>ยกเลิก</button>
              <button className="btn" style={{ background: '#d84f4f', color: '#fff', border: 'none' }} onClick={confirmDialog.onConfirm}>{confirmDialog.confirmLabel || "ยืนยัน"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ━━━ UPPER BANNER ━━━ */}
      <div className="card staff-work-hero" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <button className="btn btn-outline" onClick={() => go("staff")} style={{ marginBottom: "12px", padding: "5px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-arrow-left"></i> กลับ
            </button>
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
      <div className="staff-tabs" style={{ marginBottom: "24px", flexWrap: "wrap" }}>
        <button className={`pill ${tab === "dashboard" ? "on" : ""}`} onClick={() => setTab("dashboard")}>📊 แดชบอร์ดติดตามงาน</button>
        <button className={`pill ${tab === "submit" ? "on" : ""}`} onClick={() => setTab("submit")}>📤 โยนไฟล์ส่งงาน</button>
        <button className={`pill ${tab === "tasks" ? "on" : ""}`} onClick={() => setTab("tasks")}>📋 มอบหมายงาน</button>
        <button className={`pill ${tab === "calendar" ? "on" : ""}`} onClick={() => setTab("calendar")}>📅 ปฏิทินลงโพสต์</button>
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
                
                // เช็คว่าเราคือหนึ่งในผู้รับผิดชอบไหม เพื่อไฮไลต์ชื่อเรา
                const hl = (name) => name === currentUser ? <strong style={{color: "var(--teal)"}}>{name}</strong> : name;

                return (
                  <div key={sub.id} className={`card animate-fade-in staff-sub-card ${isPending ? "is-pending" : isRejected ? "is-rejected" : isApproved ? "is-approved" : "is-posted"}`} style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                          <span className="tag tag-acc">{sub.type}</span>
                          <span className={`staff-status ${isPending ? "warn" : isRejected ? "bad" : isApproved ? "ok" : "info"}`}>{sub.status}</span>
                          <span style={{ fontSize: "11px", color: "var(--t3)" }}>ส่งโดย: {sub.staffName} • {formatDate(sub.createdAt)}</span>
                        </div>
                        <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", lineHeight: "1.3" }}>{sub.title}</h2>
                        {sub.description && <p style={{ marginTop: "8px", color: "var(--t2)", whiteSpace: "pre-wrap" }}>{sub.description}</p>}
                      </div>
                      {(isAdmin || sub.staffName === currentUser) && (
                        <button className="btn btn-outline danger" onClick={() => handleDeleteSub(sub.id, sub.title)} style={{ padding: "4px 8px", fontSize: "11px", borderColor: "rgba(216,79,79,0.3)", color: "#d84f4f" }}>🗑️ ลบ</button>
                      )}
                    </div>

                    {/* แสดงหน้าที่ความรับผิดชอบชัดเจน */}
                    <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", background: "var(--bg2)", padding: "10px", borderRadius: "8px" }}>
                      <div style={{ fontSize: "12px", color: "var(--t2)" }}>✍️ เขียน/แปล: {hl(sub.writer)}</div>
                      <div style={{ fontSize: "12px", color: "var(--t2)" }}>🎨 กราฟิก: {hl(sub.graphic)}</div>
                      <div style={{ fontSize: "12px", color: "var(--t2)" }}>📢 ลงโพสต์: {hl(sub.poster)}</div>
                    </div>

                    {sub.files && sub.files.length > 0 && (
                      <div style={{ marginTop: "14px", paddingTop: "12px" }}>
                        <span style={{ fontSize: "12px", color: "var(--t2)", display: "block", marginBottom: "6px" }}>📎 ไฟล์แนบ:</span>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {sub.files.map((file, i) => (
                            <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16 }}>
                              <span style={{ fontSize: 12, color: "var(--text)" }}>{getFileIcon(file.name)} {file.name}</span>
                              <div style={{ display: "flex", gap: 6, borderLeft: "1px solid var(--border)", paddingLeft: 8, marginLeft: 2 }}>
                                <button 
                                  type="button"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    try {
                                      const loadingToast = toast.loading(`กำลังดึงไฟล์ ${file.name}...`);
                                      const response = await fetch(file.url);
                                      const blob = await response.blob();
                                      const url = window.URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.style.display = 'none';
                                      a.href = url;
                                      a.download = file.name;
                                      document.body.appendChild(a);
                                      a.click();
                                      window.URL.revokeObjectURL(url);
                                      toast.dismiss(loadingToast);
                                    } catch (err) {
                                      window.open(file.url, '_blank');
                                    }
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2, color: "var(--teal)" }}
                                  title="ดาวน์โหลดไฟล์"
                                >
                                  ⬇️
                                </button>
                                <a 
                                  href={file.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, textDecoration: "none", padding: 2 }}
                                  title="เปิดดู (Preview)"
                                >
                                  👁️
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sub.feedback && (
                      <div className="staff-feedback" style={{ marginTop: "14px", background: "rgba(189,122,19,0.1)", color: "#bd7a13", padding: "10px", borderRadius: "8px", fontSize: "13px" }}>
                        <strong>⚠️ ฟีดแบ็กแอดมิน:</strong> {sub.feedback}
                      </div>
                    )}

                    {isPosted && (
                      <div style={{ marginTop: "14px", padding: "12px", background: "rgba(45,190,160,0.05)", border: "1px solid rgba(45,190,160,0.2)", borderRadius: "8px", fontSize: "12px" }}>
                        <p>📆 <strong>ลงงานจริง:</strong> {formatDate(sub.scheduleDate)}</p>
                        <p style={{ marginTop: "4px" }}>📱 <strong>แพลตฟอร์ม:</strong> {sub.platforms?.join(", ")}</p>
                        {sub.postLink && <p style={{ marginTop: "4px" }}>🔗 <strong>ลิงก์:</strong> <a href={sub.postLink} target="_blank" rel="noreferrer" style={{ color: "var(--teal)" }}>กดเพื่อดูโพสต์</a></p>}
                      </div>
                    )}

                    <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                      {isAdmin && isPending && reviewingId !== sub.id && (
                        <>
                          <button className="btn btn-outline" onClick={() => { setReviewingId(sub.id); setFeedback(sub.feedback || "") }} style={{ color: "#bd7a13", borderColor: "rgba(189,122,19,0.3)" }}>⚠️ ตีกลับให้แก้</button>
                          <button className="btn btn-teal" onClick={() => handleReviewAction(sub.id, STATUS_OPTIONS.APPROVED)}>✅ ตรวจผ่าน/อนุมัติ</button>
                        </>
                      )}

                      {reviewingId === sub.id && (
                        <div className="card" style={{ width: "100%", padding: "14px", marginTop: "10px", background: "var(--bg2)" }}>
                          <label style={{ fontSize: "12px", display: "block", marginBottom: "6px" }}>ระบุคำแนะนำเพื่อให้ทีมงานนำไปแก้ไข:</label>
                          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="เช่น ขอแก้ฟอนต์..." rows="2" />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                            <button className="btn btn-outline" onClick={() => setReviewingId(null)}>ยกเลิก</button>
                            <button className="btn" onClick={() => {
                              if (!feedback.trim()) {
                                notifyError("กรุณาระบุฟีดแบ็กก่อนส่งกลับงาน")
                                return
                              }
                              handleReviewAction(sub.id, STATUS_OPTIONS.REJECTED, feedback.trim())
                            }} style={{ background: "#bd7a13", color: "white" }}>ยืนยันส่งกลับ</button>
                          </div>
                        </div>
                      )}

                      {isAdmin && isApproved && postingId !== sub.id && (
                        <button className="btn btn-main" onClick={() => setPostingId(sub.id)}>📱 บันทึกการลงแพลตฟอร์ม</button>
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
            <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>📤 ส่งผลงานชิ้นใหม่</h2>
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
              <div style={{ background: "var(--bg2)", padding: "16px", borderRadius: "12px", display: "grid", gap: "12px" }}>
                <h3 style={{ fontSize: "14px" }}>👥 หน้าที่ความรับผิดชอบ</h3>
                <div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--t2)" }}>✍️ ผู้เขียน/แปล</label>
                    <select value={form.writer} onChange={(e) => setForm({ ...form, writer: e.target.value })} style={{ marginTop: "4px" }}>
                      <option value="">-- ระบุชื่อ --</option>
                      {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--t2)" }}>🎨 ผู้ทำกราฟิก</label>
                    <select value={form.graphic} onChange={(e) => setForm({ ...form, graphic: e.target.value })} style={{ marginTop: "4px" }}>
                      <option value="">-- ระบุชื่อ --</option>
                      {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--t2)" }}>📢 ผู้โพสต์ลงแพลตฟอร์ม</label>
                    <select value={form.poster} onChange={(e) => setForm({ ...form, poster: e.target.value })} style={{ marginTop: "4px" }}>
                      <option value="">-- ระบุชื่อ --</option>
                      {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div 
                onDragOver={handleDragOver} 
                onDragLeave={handleDragLeave} 
                onDrop={handleDrop}
                style={{ 
                  border: `2px dashed ${isDragging ? "var(--teal)" : "var(--br2)"}`, 
                  padding: "30px 24px", 
                  borderRadius: "12px", 
                  textAlign: "center", 
                  background: isDragging ? "var(--teal-bg)" : "var(--card)",
                  transition: "all 0.2s"
                }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: "40px", color: isDragging ? "var(--teal)" : "var(--t3)" }}></i>
                <p style={{ margin: "8px 0", fontSize: "14px", fontWeight: "500" }}>ลากไฟล์มาวาง หรือ กดเพื่ออัปโหลด</p>
                <p style={{ margin: "0 0 12px 0", fontSize: "11px", color: "var(--t3)" }}>รองรับวิดีโอ, เสียง, รูปภาพ, PDF, Word</p>
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
                  {uploading ? "⏳ กำลังอัปโหลดไฟล์..." : "🚀 ส่งผลงานเข้าคิวรอตรวจ"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ━━━ TAB: TASKS ━━━ */}
        {tab === "tasks" && (
          <StaffTasks currentUser={currentUser} staffTeam={staffTeam} sendBotNotification={sendBotNotification} />
        )}

        {/* ━━━ TAB: CALENDAR ━━━ */}
        {tab === "calendar" && (
          <StaffCalendar currentUser={currentUser} staffTeam={staffTeam} sendBotNotification={sendBotNotification} />
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
                  <div key={i} className={`card staff-mag-card ${isCurrentMonth ? "current" : ""} ${isMine ? "mine" : ""}`} style={{ padding: "16px" }}>
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

            <div className="card" style={{ padding: "24px" }}>
              <h2 style={{ marginBottom: "16px" }}>📚 กำหนดคิวผู้รับผิดชอบวารสาร</h2>
              <div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
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