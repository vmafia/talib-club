import React, { useEffect, useMemo, useState, useRef } from "react"
import { createPortal } from "react-dom"
import {
  collection, query, updateDoc, doc, getDocs, getDoc,
  serverTimestamp, addDoc, deleteDoc, setDoc, orderBy, onSnapshot
} from "firebase/firestore"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { toast } from "react-hot-toast"
import { db, app } from "../lib/firebase.js"
import { triggerPushNotification } from "../utils/pushNotifications.js"
import { Z } from "../utils/ui.js"
import { formatFirebaseDate } from "../utils/format.js"
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

// ━━━ TELEGRAM NOTIFICATION ━━━
const sendBotNotification = async (message) => {
  try {
    await fetch("/api/send-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    })
  } catch (e) {
    console.error("Telegram notify error:", e)
  }
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
  const [previewModal, setPreviewModal] = useState({ open: false, file: null })

  const fileInputRef = useRef(null)
  const notifiedMonthRef = useRef(null) // Track if notification already sent this month
  
  // Security: Require authenticated user with uid, never fall back to localStorage
  const uid = authState?.user?.uid
  const currentUser = authState?.profile?.displayName || authState?.user?.displayName || ""
  const isAdmin = authState?.profile?.role === "admin" || authState?.profile?.role === "owner" || authState?.profile?.role === "staff"

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
  
  // Phase 2: Use onSnapshot instead of polling to dramatically reduce Firebase reads and cost
  useEffect(() => {
    setLoading(true)
    setPollError(null)
    
    const unsubSubs = onSnapshot(
      query(collection(db, "submissions"), orderBy("createdAt", "desc")),
      (snap) => {
        setSubs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
        setPollError(null)
      },
      (err) => {
        console.error("Listen subs error:", err)
        setPollError("ไม่สามารถรับข้อมูลงานแบบ Real-time ได้")
        setLoading(false)
      }
    )

    const unsubStaff = onSnapshot(
      doc(db, "settings", "staff"),
      (snap) => {
        if (snap.exists() && snap.data().members) {
          setStaffTeam(snap.data().members)
        }
      },
      (err) => console.error("Listen staff settings error:", err)
    )

    const unsubMag = onSnapshot(
      doc(db, "settings", "magazine"),
      (snap) => {
        if (snap.exists() && snap.data().queue) {
          setMagazineQueue(snap.data().queue)
        } else {
          setMagazineQueue(DEFAULT_MAGAZINE)
        }
      },
      (err) => console.error("Listen mag settings error:", err)
    )

    return () => {
      unsubSubs()
      unsubStaff()
      unsubMag()
    }
  }, [])

  // ━━━ ออโต้แจ้งเตือนคิววารสารทุกต้นเดือน ━━━
  // Only check once per month using useRef to avoid duplicate notifications
  useEffect(() => {
    if (!isAdmin || magazineQueue.length === 0) return

    const checkMonthlyQueue = async () => {
      const now = new Date()
      const currentDay = now.getDate()
      const currentMonthIndex = now.getMonth()
      const currentYear = now.getFullYear()
      const currentQueue = magazineQueue[currentMonthIndex]
      
      if (!currentQueue || !currentQueue.user) return

      let phase = null
      let message = ""
      if (currentDay >= 1 && currentDay <= 7) {
        phase = "start"
        message = `📣 [แจ้งเตือนวารสารต้นเดือน]\nเดือน ${currentQueue.month} นี้ เป็นคิวของ: 👤 ${currentQueue.user} ⭐️\n\nเตรียมตัวคิดหัวข้อและเตรียมงานได้เลยครับ! ✌️\n\n📌 ดูงาน: https://talibclub.org/staff-work`
      } else if (currentDay >= 14 && currentDay <= 20) {
        phase = "mid"
        message = `⏳ [แจ้งเตือนวารสารกลางเดือน]\nเดือน ${currentQueue.month} คิวของ 👤 ${currentQueue.user}\n\nเหลือเวลาอีกประมาณ ${28 - currentDay} วันก่อนถึงกำหนด (วันที่ 28)\nใครมีหน้าที่ช่วยซัพพอร์ต เตรียมตัวให้พร้อมนะครับ!\n\n📌 ดูงาน: https://talibclub.org/staff-work`
      } else if (currentDay >= 28) {
        phase = "deadline"
        message = `🚨 [แจ้งเตือนวารสารโค้งสุดท้าย]\nวันนี้วันที่ ${currentDay} แล้ว! กำหนดมอบหมายงานวารสารประจำเดือน ${currentQueue.month}\n\nคิวของ: 👤 ${currentQueue.user}\nรีบจัดการมอบหมายงานลงระบบได้เลยครับ 🔥\n\n📌 ดูงาน: https://talibclub.org/staff-work`
      }

      if (!phase) return
      
      const notifyKey = `mag_notify_${currentYear}_${currentMonthIndex}_${phase}`

      // Check local session first to prevent rapid spam
      if (notifiedMonthRef.current === notifyKey) return
      
      try {
        const notifyDocRef = doc(db, "system", "magazine_notify")
        const snap = await getDoc(notifyDocRef)
        const data = snap.exists() ? snap.data() : {}
        
        if (!data[notifyKey]) {
          await sendBotNotification(message)
          await setDoc(notifyDocRef, { ...data, [notifyKey]: true })
        }
        
        notifiedMonthRef.current = notifyKey
      } catch (err) {
        console.error("Failed to process magazine notification", err)
      }
    }

    checkMonthlyQueue()
  }, [isAdmin, magazineQueue])

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
            const isVideo = file.type.startsWith("video/") || file.name.match(/\.(mp4|mov|webm|avi|mkv|ogg)$/i)
            
            if (isVideo) {
               // อัปโหลดวิดีโอเข้า Cloudinary
               const formData = new FormData()
               formData.append("file", file)
               formData.append("upload_preset", "talib_videos")
               
               try {
                 const res = await fetch("https://api.cloudinary.com/v1_1/dldqlklcf/video/upload", {
                   method: "POST",
                   body: formData
                 })
                 const data = await res.json()
                 if (data.secure_url) {
                    // บังคับเปลี่ยนนามสกุลเป็น .mp4 เพื่อให้ Cloudinary แปลงไฟล์ (Transcode) แก้ปัญหาจอดำทันที
                    const secureUrl = data.secure_url
                    const extIndex = secureUrl.lastIndexOf('.')
                    let optimizedUrl = secureUrl
                    if (extIndex !== -1) {
                       optimizedUrl = secureUrl.substring(0, extIndex) + ".mp4"
                    }
                    fileLinks.push({ name: file.name, url: optimizedUrl, source: "cloudinary" })
                 } else {
                    throw new Error("Cloudinary upload failed: " + JSON.stringify(data))
                 }
               } catch (uploadErr) {
                 console.error("Cloudinary upload error:", uploadErr)
                 throw uploadErr
               }

            } else {
               // อัปโหลดไฟล์ทั่วไป (รูป, เอกสาร) เข้า Firebase Storage ปกติ
               const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
               let storageRef = null
               try {
                 storageRef = ref(storage, `staff_submissions/${Date.now()}_${safeName}`)
                 await uploadBytes(storageRef, file)
                 const url = await getDownloadURL(storageRef)
                 fileLinks.push({ name: file.name, url, source: "firebase" })
               } catch (uploadErr) {
                 console.error("Staff submission upload error:", uploadErr?.code || "-", uploadErr?.message || uploadErr, "ref:", storageRef?.fullPath)
                 throw uploadErr
               }
            }
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
        `✍️ เขียน/แปล: ${form.writer || "-"}\n🎨 กราฟิก: ${form.graphic || "-"}\n📢 คนลงโพสต์: ${form.poster || "-"}\n\n📌 ดูงาน: https://talibclub.org/staff-work`
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
        await sendBotNotification(`✅ [อนุมัติแล้ว] งาน "${targetSub.title}"\nตรวจผ่านแล้ว 🎉 เตรียมจัดคิวลงแพลตฟอร์มได้เลย!\n\n📌 ดูงาน: https://talibclub.org/staff-work`)
        await triggerPushNotification(
          "✅ งานผ่านการอนุมัติแล้ว",
          `งาน "${targetSub.title}" ได้รับการอนุมัติโดยแอดมิน`,
          "/staff-work",
          { isStaffOnly: true }
        )
      } else if (nextStatus === STATUS_OPTIONS.REJECTED) {
        await sendBotNotification(`⚠️ [ถูกตีกลับ] งาน "${targetSub.title}"\nของถูกตีกลับให้แก้ไข!\n\n💬 ฟีดแบ็กจากแอดมิน:\n"${feedbackText}"\n\nรีบเข้าไปแก้ไขด้วยนะครับ 🛠️\n\n📌 ดูงาน: https://talibclub.org/staff-work`)
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

      await sendBotNotification(`📢 [ลงโพสต์เรียบร้อย]\nงาน: "${targetSub.title}"\n\n📱 แพลตฟอร์ม: ${platformsStr}\n🔗 ลิงก์: ${postUrl || "ไม่ได้ระบุ"}\n\n📌 ดูคิวโพสต์: https://talibclub.org/staff-work`)
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
    <div className="staff-work animate-fade-in" style={{ padding: "clamp(12px, 3vw, 24px)" }}>
      
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
      <div className="card staff-work-hero" style={{ padding: "clamp(12px, 3vw, 24px)", marginBottom: "24px" }}>
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
                  <div key={sub.id} className={`card animate-fade-in staff-sub-card ${isPending ? "is-pending" : isRejected ? "is-rejected" : isApproved ? "is-approved" : "is-posted"}`} style={{ padding: "clamp(12px, 3vw, 20px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                          <span className="tag tag-acc">{sub.type}</span>
                          <span className={`staff-status ${isPending ? "warn" : isRejected ? "bad" : isApproved ? "ok" : "info"}`}>{sub.status}</span>
                          <span style={{ fontSize: "11px", color: "var(--t3)" }}>ส่งโดย: {sub.staffName} • {formatFirebaseDate(sub.createdAt, true)}</span>
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
                                    const btn = e.currentTarget;
                                    const originalText = btn.innerHTML;
                                    btn.innerHTML = '<i class="ti ti-loader spin"></i>';
                                    btn.disabled = true;
                                    try {
                                      const res = await fetch(file.url);
                                      const blob = await res.blob();
                                      const blobUrl = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = blobUrl;
                                      a.download = file.name || 'download';
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      URL.revokeObjectURL(blobUrl);
                                    } catch (err) {
                                      console.error(err);
                                      window.open(file.url, '_blank');
                                    } finally {
                                      btn.innerHTML = originalText;
                                      btn.disabled = false;
                                    }
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2, color: "var(--teal)" }}
                                  title="ดาวน์โหลดไฟล์ลงเครื่อง"
                                >
                                  ⬇️
                                </button>
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setPreviewModal({ open: true, file: file });
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2, color: "var(--orange)" }}
                                  title="เปิดดูพรีวิว"
                                >
                                  👁️
                                </button>
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
                        <p>📆 <strong>ลงงานจริง:</strong> {formatFirebaseDate(sub.scheduleDate, true)}</p>
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
          <div className="card" style={{ padding: "clamp(12px, 3vw, 24px)", maxWidth: "700px", margin: "0 auto" }}>
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
          <div className="card" style={{ padding: "clamp(12px, 3vw, 24px)" }}>
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
            
            <div className="card" style={{ padding: "clamp(12px, 3vw, 24px)" }}>
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

            <div className="card" style={{ padding: "clamp(12px, 3vw, 24px)" }}>
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
      {/* Preview Modal */}
      {previewModal.open && previewModal.file && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{ background: "var(--card)", padding: 24, borderRadius: 16, maxWidth: 800, width: "100%", position: "relative", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
            <button 
              onClick={() => setPreviewModal({ open: false, file: null })}
              style={{ position: "absolute", top: 16, right: 16, background: "var(--bg2)", color: "var(--text)", border: "none", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="ti ti-x"></i>
            </button>
            <h3 style={{ marginBottom: 16, color: "var(--text)", paddingRight: 40 }}>พรีวิวไฟล์: <span style={{ color: "var(--teal)", fontWeight: "normal" }}>{previewModal.file.name}</span></h3>
            
            <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200, border: "1px solid var(--border)" }}>
              {previewModal.file.name.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                <video src={previewModal.file.url} controls autoPlay style={{ maxWidth: "100%", maxHeight: "60vh" }} />
              ) : previewModal.file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={previewModal.file.url} alt="preview" style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }} />
              ) : (
                <div style={{ color: "#fff", padding: 40, textAlign: "center" }}>
                  <i className="ti ti-file" style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}></i>
                  <p>ไม่สามารถพรีวิวไฟล์นามสกุลนี้ได้</p>
                </div>
              )}
            </div>
            
            {previewModal.file.name.match(/\.(mp4|webm|ogg|mov)$/i) && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(255, 165, 0, 0.1)", borderLeft: "4px solid orange", borderRadius: 4 }}>
                <p style={{ fontSize: 13, color: "var(--t2)", margin: 0, display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <i className="ti ti-info-circle" style={{ color: "orange", fontSize: 18, marginTop: 2 }}></i>
                  <span>
                    <strong>หมายเหตุ:</strong> หากวิดีโอแสดงผลเป็นจอดำ (เล่นได้แค่เสียง) เกิดจากเบราว์เซอร์ไม่รองรับการถอดรหัสวิดีโอนี้ (มักพบในไฟล์ที่อัดจากมือถือ) <br/>
                    กรุณากดปุ่ม <strong>"ดาวน์โหลดไฟล์"</strong> เพื่อนำไปเปิดรับชมด้วยโปรแกรมในคอมพิวเตอร์แทนครับ
                  </span>
                </p>
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: "center", display: "flex", justifyContent: "center", gap: 12 }}>
              <button 
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  const originalText = btn.innerHTML;
                  btn.innerHTML = '<i class="ti ti-loader spin"></i> กำลังดาวน์โหลด...';
                  btn.disabled = true;
                  try {
                    const res = await fetch(previewModal.file.url);
                    const blob = await res.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = previewModal.file.name || 'download';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                  } catch (err) {
                    console.error(err);
                    window.open(previewModal.file.url, '_blank');
                  } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                  }
                }} 
                className="btn btn-teal"
              >
                <i className="ti ti-download"></i> ดาวน์โหลดไฟล์ต้นฉบับ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}