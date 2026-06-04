import { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import { BOOKS, DEFAULT_TAXONOMY } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"
import { confirmAction } from "../utils/feedback.jsx"
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { storage } from "../lib/firebase.js"

// --- Helper Functions ---
function sanitizeStorageName(name) {
  return String(name || "book.pdf")
    .replace(/[^\w.\-ก-๙]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
}

const DAILY_READING_GOAL_MINUTES = 10
const MIN_VERIFIED_SECONDS = 180
const MIN_REFLECTION_CHARS = 20
const DEFAULT_FREEZE_CREDITS = 2
const DEFAULT_LEAVE_CREDITS = 1

// --- Helper Functions ---
function getMs(val) {
  if (!val) return 0
  if (typeof val.toDate === "function") return val.toDate().getTime()
  if (val.seconds) return val.seconds * 1000
  if (typeof val === "number") return val
  const parsed = Date.parse(val)
  return isNaN(parsed) ? 0 : parsed
}

function getLocalDayKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const ms = getMs(value)
  if (!ms) return ""
  const date = new Date(ms)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function addDaysToKey(dayKey, amount) {
  const date = new Date(`${dayKey}T00:00:00`)
  date.setDate(date.getDate() + amount)
  return getLocalDayKey(date.getTime())
}

function todayKey() {
  return getLocalDayKey(Date.now())
}

function formatReadingMinutes(seconds) {
  const minutes = Math.round(Number(seconds || 0) / 60)
  return minutes <= 0 ? "0 นาที" : `${minutes} นาที`
}

function getPagesRead(startPage, endPage) {
  const start = Number(startPage || 0)
  const end = Number(endPage || 0)
  if (!start || !end || end < start) return 0
  return end - start + 1
}

function getProgressFromSession(item, endPage, pagesRead) {
  const totalPages = Number(item.totalPages || item.customBook?.totalPages || 0)
  const currentProgress = Number(item.progress || 0)
  if (totalPages > 0 && Number(endPage || 0) > 0) {
    return Math.min(100, Math.round((Number(endPage) / totalPages) * 100))
  }
  return Math.min(100, currentProgress + Math.max(3, Math.min(12, Number(pagesRead || 1) * 3)))
}

function calculateVerificationReport({ activeSeconds = 0, inactiveSeconds = 0, startPage = 0, endPage = 0, reflection = "" }) {
  const pagesRead = getPagesRead(startPage, endPage)
  const reflectionLength = reflection.trim().length
  const totalSeconds = Number(activeSeconds || 0) + Number(inactiveSeconds || 0)
  const focusRatio = totalSeconds ? Number(activeSeconds || 0) / totalSeconds : 1
  const timeScore = Math.min(40, Math.round((Number(activeSeconds || 0) / MIN_VERIFIED_SECONDS) * 40))
  const pageScore = pagesRead > 0 ? 25 : 0
  const reflectionScore = Math.min(25, Math.round((reflectionLength / MIN_REFLECTION_CHARS) * 25))
  const focusScore = Math.round(Math.max(0, Math.min(1, focusRatio)) * 10)
  const score = Math.min(100, timeScore + pageScore + reflectionScore + focusScore)
  const verified = score >= 72 && Number(activeSeconds || 0) >= MIN_VERIFIED_SECONDS && pagesRead > 0 && reflectionLength >= MIN_REFLECTION_CHARS
  return { score, verified, pagesRead, focusRatio }
}

function normalizeStreakSettings(settings, uid) {
  const protectedDays = Array.isArray(settings?.protectedDays) ? settings.protectedDays : []
  const reminderTimes = Array.isArray(settings?.reminderTimes) ? settings.reminderTimes : []
  return {
    id: uid,
    uid,
    freezeCredits: Number.isFinite(Number(settings?.freezeCredits)) ? Number(settings.freezeCredits) : DEFAULT_FREEZE_CREDITS,
    leaveCredits: Number.isFinite(Number(settings?.leaveCredits)) ? Number(settings.leaveCredits) : DEFAULT_LEAVE_CREDITS,
    protectedDays,
    claimedMissions: settings?.claimedMissions || {},
    gems: Number(settings?.gems || 0),
    remindersEnabled: settings?.remindersEnabled ?? false,
    reminderTimes,
  }
}

function calculateReadingStreak(values, protections = []) {
  const days = new Set(values.map(getLocalDayKey).filter(Boolean))
  const protectedByDay = new Map(
    protections
      .map(item => ({
        ...item,
        date: item.date || item.dayKey || getLocalDayKey(item.createdAt || item.usedAt),
      }))
      .filter(item => item.date)
      .map(item => [item.date, item])
  )
  const coveredDays = new Set([...days, ...protectedByDay.keys()])
  const sorted = [...coveredDays].sort()
  let best = 0
  let run = 0
  let prevTime = 0

  sorted.forEach(day => {
    const currentTime = new Date(`${day}T00:00:00`).getTime()
    run = prevTime && currentTime - prevTime === 86400000 ? run + 1 : 1
    best = Math.max(best, run)
    prevTime = currentTime
  })

  let current = 0
  const today = todayKey()
  const yesterday = addDaysToKey(today, -1)
  const startDay = coveredDays.has(today) ? today : coveredDays.has(yesterday) ? yesterday : ""

  if (startDay) {
    const cursor = new Date(`${startDay}T00:00:00`)
    while (coveredDays.has(getLocalDayKey(cursor.getTime()))) {
      current += 1
      cursor.setDate(cursor.getDate() - 1)
    }
  }

  return {
    current,
    best,
    totalDays: days.size,
    protectedTotal: protectedByDay.size,
    todayKey: today,
    todayVerified: days.has(today),
    todayProtected: protectedByDay.get(today) || null,
    coveredDays,
  }
}

function getShelfBook(item, books) {
  return books.find(book => String(book.id) === String(item.bookId)) || item.customBook || null
}

function getPreviewUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`
  return url
}

export default function ReadingApp({ authState, go, ctx, theme }) {
  const uid = authState?.user?.uid
  const dismissedShelfRef = useRef(null)

  function clearShelfLaunchContext() {
    if (!ctx?.shelfItemId) return
    dismissedShelfRef.current = ctx.shelfItemId
    const next = { ...ctx }
    delete next.shelfItemId
    go("reader", Object.keys(next).length ? next : null, { replace: true, noScroll: true })
  }
  const { items: books } = useContentCollection("books", BOOKS, null, { live: false })
  const { items: shelfItems, saveItem: saveShelfItem, deleteItem: deleteShelfItem } = useContentCollection("bookshelf", [], uid, { live: false })
  const { items: readingSessions, loading: loadingSessions, saveItem: saveReadingSession } = useContentCollection("reading_sessions", [], uid, { live: false })
  const { items: streakRecords, loading: loadingStreaks, saveItem: saveStreakSettings } = useContentCollection("reading_streaks", [], uid, { live: false })
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)

  // Reading Mode State
  const [activeBook, setActiveBook] = useState(null)
  const [activeMobileTab, setActiveMobileTab] = useState("form") // "preview" or "form" for mobile split layout, default to form first
  const [showTutorial, setShowTutorial] = useState(false)
  const [readingTab, setReadingTab] = useState("reading") // "reading" | "finished" | "stats"
  
  // External Upload States
  const [addMode, setAddMode] = useState("library")
  const [externalBook, setExternalBook] = useState({
    title: "",
    author: "",
    fileUrl: "",
    desc: "",
    totalPages: "",
    file: null,
  })
  const [uploadingExternal, setUploadingExternal] = useState(false)
  
  // Stopwatch states
  const [seconds, setSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const timerRef = useRef(null)
  const startTimestampRef = useRef(null)
  const accumulatedSecondsRef = useRef(0)

  // Log Form states
  const [startPage, setStartPage] = useState("")
  const [endPage, setEndPage] = useState("")
  const [reflection, setReflection] = useState("")
  const [saving, setSaving] = useState(false)

  // Add Book Dropdown states
  const [selectedBookToAdd, setSelectedBookToAdd] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)

  // Reading Reminders states
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem("talib_notif_enabled") === "true")
  const [notifTime, setNotifTime] = useState(() => localStorage.getItem("talib_notif_time") || "20:00")

  // --- Normalized Streak & Sessions ---
  const streakSettings = useMemo(() => {
    return normalizeStreakSettings(streakRecords.find(item => item.uid === uid || item.id === uid), uid)
  }, [streakRecords, uid])

  const streak = useMemo(() => {
    const verifiedDays = readingSessions
      .filter(item => item.uid === uid && item.verified)
      .map(item => item.dayKey || item.completedAt || item.createdAt)
    return calculateReadingStreak(verifiedDays, streakSettings.protectedDays)
  }, [readingSessions, streakSettings.protectedDays, uid])

  const todaySessions = useMemo(() => {
    return readingSessions.filter(item => item.uid === uid && item.verified && (item.dayKey || getLocalDayKey(item.completedAt)) === streak.todayKey)
  }, [readingSessions, streak.todayKey, uid])

  const todaySeconds = todaySessions.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0)
  const goalPercent = Math.min(100, Math.round((todaySeconds / (DAILY_READING_GOAL_MINUTES * 60)) * 100))

  const myActiveBooks = useMemo(() => {
    return shelfItems
      .filter(item => item.uid === uid && item.status !== "finished")
      .map(item => ({
        ...item,
        book: getShelfBook(item, books),
      }))
      .filter(item => item.book)
  }, [shelfItems, books, uid])

  const myFinishedBooks = useMemo(() => {
    return shelfItems
      .filter(item => item.uid === uid && item.status === "finished")
      .map(item => ({
        ...item,
        book: getShelfBook(item, books),
      }))
      .filter(item => item.book)
  }, [shelfItems, books, uid])

  const stats = useMemo(() => {
    const userShelf = shelfItems.filter(item => item.uid === uid)
    const finished = userShelf.filter(item => item.status === "finished").length
    const reading = userShelf.filter(item => item.status === "reading" || !item.status).length
    
    const progressSum = userShelf.reduce((sum, item) => sum + Number(item.progress || 0), 0)
    const avgProgress = userShelf.length ? Math.round(progressSum / userShelf.length) : 0
    
    const verifiedSessions = userShelf.reduce((sum, item) => sum + Number(item.verifiedSessions || 0), 0)
    const totalSeconds = userShelf.reduce((sum, item) => sum + Number(item.totalReadSeconds || 0), 0)
    
    return {
      reading,
      finished,
      avgProgress,
      verifiedSessions,
      totalSeconds
    }
  }, [shelfItems, uid])

  const availableBooks = useMemo(() => {
    const savedIds = new Set(shelfItems.filter(item => item.uid === uid).map(item => String(item.bookId)))
    return books.filter(book => !savedIds.has(String(book.id)))
  }, [books, shelfItems, uid])

  const todayQuizPassed = useMemo(() => {
    return shelfItems.some(item => {
      if (item.uid !== uid || !item.lastQuiz) return false
      const dateKey = getLocalDayKey(item.lastQuiz.takenAt)
      return dateKey === streak.todayKey && item.lastQuiz.score >= 12
    })
  }, [shelfItems, streak.todayKey, uid])

  const last7Days = useMemo(() => {
    const list = []
    const dayNames = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."]
    for (let i = 6; i >= 0; i--) {
      const key = addDaysToKey(streak.todayKey, -i)
      const dateObj = new Date(`${key}T00:00:00`)
      const name = dayNames[dateObj.getDay()]
      
      const daySessions = readingSessions.filter(
        item => item.uid === uid && item.verified && (item.dayKey || getLocalDayKey(item.completedAt)) === key
      )
      const secs = daySessions.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0)
      const minutes = Math.round(secs / 60)
      const metGoal = secs >= DAILY_READING_GOAL_MINUTES * 60
      
      const protection = streakSettings.protectedDays.find(
        p => (p.date || p.dayKey || getLocalDayKey(p.createdAt || p.usedAt)) === key
      )
      
      list.push({
        key,
        name,
        minutes,
        metGoal,
        protection,
        hasRead: daySessions.length > 0
      })
    }
    return list
  }, [readingSessions, streak.todayKey, streakSettings.protectedDays, uid])

  const handleToggleReminders = async (enabled) => {
    if (!streakSettings) return
    if (enabled) {
      if (typeof Notification === "undefined") {
        toast.error("เบราว์เซอร์ของคุณไม่รองรับการแจ้งเตือน")
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        toast.error("เบราว์เซอร์ปฏิเสธสิทธิ์การแจ้งเตือน กรุณาเปิดสิทธิ์ในตั้งค่าเบราว์เซอร์เพื่อให้แจ้งเตือนทำงานได้")
      }
    }
    try {
      await saveStreakSettings({
        ...streakSettings,
        remindersEnabled: enabled
      })
      toast.success(enabled ? "เปิดใช้งานระบบการแจ้งเตือนให้อ่านหนังสือแล้ว 🔔" : "ปิดใช้งานระบบการแจ้งเตือนแล้ว")
    } catch (err) {
      console.error(err)
      toast.error("ตั้งค่าการแจ้งเตือนไม่สำเร็จ")
    }
  }

  const handleAddReminderTime = async (timeStr) => {
    if (!streakSettings) return
    if (streakSettings.reminderTimes.includes(timeStr)) {
      toast.error("คุณตั้งค่าการแจ้งเตือนเวลานี้ไว้แล้ว")
      return
    }
    const updatedTimes = [...streakSettings.reminderTimes, timeStr].sort()
    try {
      await saveStreakSettings({
        ...streakSettings,
        reminderTimes: updatedTimes
      })
      toast.success(`เพิ่มเวลาแจ้งเตือน ${timeStr} น. สำเร็จ`)
    } catch (err) {
      console.error(err)
      toast.error("เพิ่มเวลาแจ้งเตือนไม่สำเร็จ")
    }
  }

  const handleRemoveReminderTime = async (timeStr) => {
    if (!streakSettings) return
    const updatedTimes = streakSettings.reminderTimes.filter(t => t !== timeStr)
    try {
      await saveStreakSettings({
        ...streakSettings,
        reminderTimes: updatedTimes
      })
      toast.success(`ลบเวลาแจ้งเตือน ${timeStr} น. เรียบร้อย`)
    } catch (err) {
      console.error(err)
      toast.error("ลบเวลาแจ้งเตือนไม่สำเร็จ")
    }
  }

  // --- Actions ---
  async function claimMission(missionId) {
    if (!uid) return
    const isM1 = missionId === "m1"
    const isM2 = missionId === "m2"
    const isM3 = missionId === "m3"
    
    const todayClaims = streakSettings.claimedMissions?.[streak.todayKey] || {}
    if (todayClaims[missionId]) {
      toast.success("คุณรับรางวัลภารกิจนี้ไปแล้ว")
      return
    }
    
    let completed = false
    if (isM1) completed = todaySeconds >= 600
    if (isM2) completed = todaySessions.some(s => s.reflection && s.reflection.length >= 100)
    if (isM3) completed = todayQuizPassed
    
    if (!completed) {
      toast.error("ภารกิจยังไม่เสร็จสมบูรณ์")
      return
    }
    
    let gemsReward = 0
    if (isM1) gemsReward = 5
    else if (isM2) gemsReward = 8
    else if (isM3) gemsReward = 10
    
    const nextClaimed = {
      ...streakSettings.claimedMissions,
      [streak.todayKey]: {
        ...(streakSettings.claimedMissions?.[streak.todayKey] || {}),
        [missionId]: true
      }
    }
    
    await saveStreakSettings({
      ...streakSettings,
      gems: Number(streakSettings.gems || 0) + gemsReward,
      claimedMissions: nextClaimed
    })
    
    toast.success(`สำเร็จ! รับรางวัล +${gemsReward} 💎`)
  }

  async function buyItem(itemType) {
    if (!uid) return
    const isFreeze = itemType === "freeze"
    const cost = isFreeze ? 50 : 80
    const currentGems = Number(streakSettings.gems || 0)
    
    if (currentGems < cost) {
      toast.error("เพชรของคุณไม่เพียงพอ")
      return
    }
    
    if (isFreeze) {
      if (streakSettings.freezeCredits >= 2) {
        toast.error("คุณมีน้ำแข็งเต็มจำนวนจำกัดแล้ว (สูงสุด 2 ชิ้น)")
        return
      }
      await saveStreakSettings({
        ...streakSettings,
        gems: currentGems - cost,
        freezeCredits: Number(streakSettings.freezeCredits || 0) + 1,
      })
      toast.success("ซื้อน้ำแข็งสำเร็จ! 🧊")
    } else {
      if (streakSettings.leaveCredits >= 2) {
        toast.error("คุณมีสิทธิ์ลากิจเต็มจำนวนจำกัดแล้ว (สูงสุด 2 ชิ้น)")
        return
      }
      await saveStreakSettings({
        ...streakSettings,
        gems: currentGems - cost,
        leaveCredits: Number(streakSettings.leaveCredits || 0) + 1,
      })
      toast.success("ซื้อสิทธิ์ลากิจสำเร็จ! 📅")
    }
  }

  // Auto-applied freeze logic for yesterday
  useEffect(() => {
    if (!uid || loadingSessions || loadingStreaks || !streakSettings) return

    const yesterdayKey = addDaysToKey(streak.todayKey, -1)

    // Check if user read yesterday
    const readYesterday = readingSessions.some(
      item => item.uid === uid && item.verified && (item.dayKey || getLocalDayKey(item.completedAt || item.createdAt)) === yesterdayKey
    )

    // Check if yesterday was already protected
    const protectedYesterday = streakSettings.protectedDays.some(
      p => (p.date || p.dayKey || getLocalDayKey(p.createdAt || p.usedAt)) === yesterdayKey
    )

    // Check if user actually had an active streak of at least 1 day before yesterday
    const hadStreakBeforeYesterday = streak.coveredDays && streak.coveredDays.has(addDaysToKey(yesterdayKey, -1))

    if (!readYesterday && !protectedYesterday && streakSettings.freezeCredits > 0 && hadStreakBeforeYesterday && streak.totalDays > 0) {
      const applyAutoFreeze = async () => {
        try {
          await saveStreakSettings({
            ...streakSettings,
            freezeCredits: Number(streakSettings.freezeCredits || 0) - 1,
            protectedDays: [
              ...streakSettings.protectedDays,
              { date: yesterdayKey, type: "freeze", usedAt: Date.now() },
            ],
          })
          toast.success("เมื่อวานนี้คุณไม่ได้เข้าอ่านหนังสือ! ระบบได้ใช้น้ำแข็งช่วยปกป้อง Streak ของคุณอัตโนมัติ 🧊", { duration: 5000 })
        } catch (err) {
          console.error("Auto freeze failed", err)
        }
      }
      applyAutoFreeze()
    }
  }, [uid, loadingSessions, loadingStreaks, streakSettings, readingSessions, streak.todayKey, streak.coveredDays, saveStreakSettings])

  async function protectToday(type) {
    if (!uid) return
    if (streak.todayVerified) {
      toast.success("วันนี้ต่อไฟด้วยการอ่านจริงแล้ว")
      return
    }
    if (streak.todayProtected) {
      toast.success("วันนี้ได้รับการคุ้มครอง streak แล้ว")
      return
    }

    // Check if streak is 0 (i.e. yesterday was not read/protected)
    const yesterdayKey = addDaysToKey(streak.todayKey, -1)
    if (!streak.coveredDays || !streak.coveredDays.has(yesterdayKey)) {
      toast.error("คุณไม่มีวันสะสมต่อเนื่อง (Streak เป็น 0) จึงไม่สามารถใช้สิทธิ์คุ้มครองได้")
      return
    }

    const key = streak.todayKey
    const isLeave = type === "leave"
    const creditKey = isLeave ? "leaveCredits" : "freezeCredits"
    if (Number(streakSettings[creditKey] || 0) <= 0) {
      toast.error(isLeave ? "สิทธิ์ลากิจหมดแล้ว" : "น้ำแข็งหมดแล้ว")
      return
    }
    await saveStreakSettings({
      ...streakSettings,
      [creditKey]: Number(streakSettings[creditKey] || 0) - 1,
      protectedDays: [
        ...streakSettings.protectedDays,
        { date: key, type, usedAt: Date.now() },
      ],
    })
    toast.success(isLeave ? "บันทึกวันลากิจแล้ว" : "ใช้น้ำแข็งคุ้มครอง streak วันนี้แล้ว")
  }

  async function removeShelfItem(id) {
    const ok = await confirmAction({
      title: "ลบออกจากชั้นหนังสือ?",
      message: "ข้อมูลความคืบหน้าและประวัติการอ่านของเล่มนี้จะถูกลบออกจากชั้นของคุณ",
      confirmText: "ยืนยันการลบ",
      danger: true
    })
    if (!ok) return
    try {
      await deleteShelfItem(id)
      toast.success("ลบหนังสือออกจากชั้นเรียบร้อยแล้ว")
    } catch (err) {
      toast.error("ลบไม่สำเร็จ กรุณาตรวจสอบสิทธิ์")
    }
  }

  async function addNewBookToShelf() {
    if (!selectedBookToAdd || !uid) return
    const book = books.find(item => String(item.id) === String(selectedBookToAdd))
    if (!book) return

    await saveShelfItem({
      id: `${uid}_book_${book.id}`,
      uid,
      bookId: String(book.id),
      status: "reading",
      progress: 0,
      note: "",
      totalPages: Number(book.totalPages || 0),
      sourceType: "library",
      addedAt: Date.now(),
    })
    setSelectedBookToAdd("")
    toast.success("เพิ่มเข้าชั้นหนังสือแล้ว! พร้อมเปิดห้องอ่านหนังสือ")
  }

  async function addExternalBook() {
    if (!uid) return
    const title = externalBook.title.trim() || externalBook.file?.name || ""
    const hasSource = externalBook.fileUrl.trim() || externalBook.file
    if (!title) {
      toast.error("กรุณาใส่ชื่อหนังสือหรือเลือกไฟล์")
      return
    }
    if (!hasSource) {
      toast.error("กรุณาใส่ลิงก์ไฟล์หรืออัปโหลดไฟล์")
      return
    }

    setUploadingExternal(true)
    try {
      let fileUrl = externalBook.fileUrl.trim()
      let fileMeta = {}

      if (externalBook.file) {
        const safeName = sanitizeStorageName(externalBook.file.name)
        const fileRef = ref(storage, `members/${uid}/bookshelf/${Date.now()}-${safeName}`)
        await uploadBytes(fileRef, externalBook.file, {
          contentType: externalBook.file.type || "application/octet-stream",
          customMetadata: { uid, title },
        })
        fileUrl = await getDownloadURL(fileRef)
        fileMeta = {
          fileName: externalBook.file.name,
          fileSize: externalBook.file.size,
          fileType: externalBook.file.type,
        }
      }

      const externalId = `external-${crypto.randomUUID()}`
      const customBook = {
        id: externalId,
        title,
        author: externalBook.author.trim() || "ไฟล์ของสมาชิก",
        type: "ไฟล์นอก",
        source: "เพิ่มโดยสมาชิก",
        category: "หนังสือส่วนตัว",
        fileUrl,
        desc: externalBook.desc.trim(),
        totalPages: Number(externalBook.totalPages || 0),
        ...fileMeta,
      }

      await saveShelfItem({
        id: `${uid}_book_${externalId}`,
        uid,
        bookId: externalId,
        sourceType: "external",
        customBook,
        totalPages: Number(externalBook.totalPages || 0),
        status: "reading",
        progress: 0,
        note: "",
        addedAt: Date.now(),
      })
      setExternalBook({ title: "", author: "", fileUrl: "", desc: "", totalPages: "", file: null })
      toast.success("เพิ่มไฟล์นอกเข้าชั้นหนังสือแล้ว! พร้อมเปิดห้องอ่านหนังสือ")
    } catch (error) {
      console.error(error)
      toast.error("เพิ่มไฟล์นอกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์อัปโหลดหรือใช้ลิงก์ไฟล์แทน")
    } finally {
      setUploadingExternal(false)
    }
  }

  // --- Stopwatch logic ---
  useEffect(() => {
    if (isRunning) {
      const tick = () => {
        const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000)
        setSeconds(accumulatedSecondsRef.current + elapsed)
      }
      
      tick()
      timerRef.current = setInterval(tick, 1000)

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          tick()
        }
      }
      document.addEventListener("visibilitychange", handleVisibilityChange)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
        document.removeEventListener("visibilitychange", handleVisibilityChange)
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRunning])

  // Auto-start reading session when shelfItemId is passed via context
  useEffect(() => {
    if (!ctx?.shelfItemId || shelfItems.length === 0 || books.length === 0 || activeBook) return
    if (dismissedShelfRef.current === ctx.shelfItemId) return
    const item = shelfItems.find(s => s.id === ctx.shelfItemId)
    if (item) {
      const book = getShelfBook(item, books)
      if (book) startReading({ ...item, book })
    }
  }, [ctx?.shelfItemId, shelfItems, books, activeBook])

  function startReading(shelfItem) {
    setActiveBook(shelfItem)
    accumulatedSecondsRef.current = 0
    setSeconds(0)
    setIsRunning(true)
    setStartPage(shelfItem.currentPage || 1)
    setEndPage("")
    setReflection("")
    setActiveMobileTab("form")
    startTimestampRef.current = Date.now()
  }

  const toggleStopwatch = () => {
    if (isRunning) {
      const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000)
      accumulatedSecondsRef.current += elapsed
      setSeconds(accumulatedSecondsRef.current)
    } else {
      startTimestampRef.current = Date.now()
    }
    setIsRunning(!isRunning)
  }

  const exitReadingRoom = async () => {
    const ok = await confirmAction({
      title: "ออกจากห้องอ่านหนังสือ?",
      message: "คำเตือน: ความคืบหน้าและเวลาที่อ่านสะสมในเซสชันนี้จะสูญหายทั้งหมด และจะไม่ถูกนำไปคำนวณ Streak หรือภารกิจรายวัน คุณต้องการออกจากห้องอ่านหนังสือโดยไม่บันทึกใช่หรือไม่?",
      confirmText: "ยืนยันการออกโดยไม่บันทึก",
      danger: true
    })
    if (!ok) return
    setIsRunning(false)
    setActiveBook(null)
    setSeconds(0)
    accumulatedSecondsRef.current = 0
    clearShelfLaunchContext()
  }

  const saveReadingProgress = async () => {
    if (!activeBook) return
    const start = parseInt(startPage, 10)
    const end = parseInt(endPage, 10)
    
    if (isNaN(start) || isNaN(end) || end < start) {
      toast.error("กรุณาใส่หน้าเริ่มต้นและสิ้นสุดให้ถูกต้อง")
      return
    }
    if (seconds < 10) {
      toast.error("คุณพึ่งจะเริ่มอ่านเอง! กรุณารอจับเวลาอย่างน้อย 10 วินาที")
      return
    }
    
    setSaving(true)
    try {
      const payload = {
        startedAt: startTimestampRef.current || Date.now() - (seconds * 1000),
        activeSeconds: seconds,
        inactiveSeconds: 0,
        startPage: start,
        endPage: end,
        reflection: reflection.trim()
      }
      
      const report = calculateVerificationReport(payload)
      
      if (!report.verified) {
        toast.error(`เซสชันนี้ยังไม่ผ่านเกณฑ์ทบทวนความรู้ (${report.score}/100) ลองอ่านสะสมเวลาต่อ หรือเพิ่มบันทึกข้อคิดสะท้อนธรรมยาวขึ้นอีกนิด (อย่างน้อย 20 ตัวอักษร)`)
        setSaving(false)
        return
      }

      const sessionId = `${uid}_${activeBook.id}_${Date.now()}`
      
      await saveReadingSession({
        id: sessionId,
        uid,
        shelfItemId: activeBook.id,
        bookId: String(activeBook.bookId),
        bookTitle: activeBook.book.title,
        sourceType: activeBook.sourceType || "library",
        dayKey: todayKey(),
        startedAt: payload.startedAt,
        completedAt: Date.now(),
        activeSeconds: payload.activeSeconds,
        inactiveSeconds: payload.inactiveSeconds,
        startPage: Number(payload.startPage || 0),
        endPage: Number(payload.endPage || 0),
        pagesRead: report.pagesRead,
        reflection: payload.reflection.trim(),
        focusRatio: report.focusRatio,
        verificationScore: report.score,
        verified: report.verified,
      })

      // Calculate session rewards
      const sessionGems = Math.min(10, Math.floor(seconds / 120)) // 1 Gem per 2 mins, max 10

      // Update user's streak document with gems
      await saveStreakSettings({
        ...streakSettings,
        gems: Number(streakSettings.gems || 0) + sessionGems,
      })

      const nextProgress = getProgressFromSession(activeBook, end, report.pagesRead)
      
      const cleanItem = { ...activeBook }
      delete cleanItem.book
      
      await saveShelfItem({
        ...cleanItem,
        progress: nextProgress,
        currentPage: end,
        status: nextProgress >= 100 ? "finished" : "reading",
        totalReadSeconds: Number(activeBook.totalReadSeconds || 0) + seconds,
        verifiedSessions: Number(activeBook.verifiedSessions || 0) + 1,
        lastReadAt: Date.now(),
        lastVerificationScore: report.score,
      })

      toast.success(`บันทึกการอ่านเสร็จสมบูรณ์! (+${sessionGems} 💎) คะแนนยืนยันการเรียนรู้: ${report.score}/100`)
      setIsRunning(false)
      setActiveBook(null)
      setSeconds(0)
      clearShelfLaunchContext()
    } catch (err) {
      console.error(err)
      toast.error("บันทึกข้อมูลล้มเหลว กรุณาลองอีกครั้ง")
    } finally {
      setSaving(false)
    }
  }

  // Formatting stopwatch display
  const displayTimer = useMemo(() => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }, [seconds])

  if (activeBook) {
    // --- Focused Reading Room View (Full-Bleed Overlay App Interface) ---
    return createPortal(
      <div className={`app ${theme || "light"}`} style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        padding: "16px 20px",
        overflow: "hidden",
        boxSizing: "border-box",
        animation: "pageFadeIn 0.25s ease-out forwards"
      }}>
        {/* Header HUD */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 14, borderBottom: "1px solid var(--br2)", marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: 10, color: "var(--teal)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>โหมดแอปอ่านหนังสือโฟกัส (Distraction-Free)</span>
            <h2 style={{ fontSize: 16, marginTop: 2, fontWeight: 600, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{activeBook.book.title}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Digital Timer HUD */}
            <div style={{
              background: seconds >= MIN_VERIFIED_SECONDS ? "var(--teal-bg)" : "var(--bg2)",
              border: seconds >= MIN_VERIFIED_SECONDS ? "1.5px solid var(--teal)" : "1.5px solid var(--br)",
              boxShadow: (isRunning && seconds >= MIN_VERIFIED_SECONDS) ? "0 0 12px rgba(69, 214, 182, 0.25)" : "none",
              padding: "6px 16px",
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.3s ease"
            }}>
              <i className={`ti ${isRunning ? "ti-clock spin" : "ti-player-pause"}`} style={{ color: seconds >= MIN_VERIFIED_SECONDS ? "var(--teal)" : "var(--t3)", fontSize: 14 }}></i>
              <strong style={{ fontFamily: "monospace", fontSize: 16, color: seconds >= MIN_VERIFIED_SECONDS ? "var(--teal)" : "var(--text)" }}>{displayTimer}</strong>
            </div>

            <button onClick={toggleStopwatch} className={`btn ${isRunning ? "btn-outline" : "btn-teal"}`} style={{ padding: "8px 14px", fontSize: 12 }}>
              <i className={`ti ${isRunning ? "ti-player-pause" : "ti-player-play"}`}></i> {isRunning ? "หยุดจับเวลา" : "เริ่มจับเวลา"}
            </button>
            <button onClick={exitReadingRoom} className="btn" style={{ background: "#e05555", color: "#fff", padding: "8px 14px", fontSize: 12 }}>
              <i className="ti ti-logout"></i> ออก
            </button>
          </div>
        </div>

        {/* Mobile Tabs navigation (rendered only on mobile) */}
        <div style={{ display: "none", gap: 8, marginBottom: 12, borderBottom: "1.5px solid var(--br2)", paddingBottom: 2 }} className="mobile-tabs-container">
          <button 
            type="button"
            onClick={() => setActiveMobileTab("preview")} 
            style={{
              flex: 1,
              padding: "10px 14px",
              fontFamily: "'Prompt', sans-serif",
              fontSize: 13,
              fontWeight: activeMobileTab === "preview" ? 600 : 400,
              background: activeMobileTab === "preview" ? "var(--teal-bg)" : "transparent",
              color: activeMobileTab === "preview" ? "var(--teal)" : "var(--t3)",
              border: "none",
              borderBottom: activeMobileTab === "preview" ? "2.5px solid var(--teal)" : "none",
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s"
            }}
          >
            <i className="ti ti-book" style={{ fontSize: 15 }}></i>
            อ่านหนังสือเต็มจอ
          </button>
          <button 
            type="button"
            onClick={() => setActiveMobileTab("form")} 
            style={{
              flex: 1,
              padding: "10px 14px",
              fontFamily: "'Prompt', sans-serif",
              fontSize: 13,
              fontWeight: activeMobileTab === "form" ? 600 : 400,
              background: activeMobileTab === "form" ? "var(--teal-bg)" : "transparent",
              color: activeMobileTab === "form" ? "var(--teal)" : "var(--t3)",
              border: "none",
              borderBottom: activeMobileTab === "form" ? "2.5px solid var(--teal)" : "none",
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s"
            }}
          >
            <i className="ti ti-notebook" style={{ fontSize: 15 }}></i>
            บันทึกผล ({reflection.length >= MIN_REFLECTION_CHARS ? "ครบ" : "กรอกข้อมูล"})
          </button>
        </div>

        {/* Workspace Split */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2.2fr", gap: 18, flex: 1, minHeight: 0 }} className="reader-split">
          <style dangerouslySetInnerHTML={{__html: `
            @media (max-width: 900px) {
              .mobile-tabs-container {
                display: flex !important;
              }
              .reader-split {
                grid-template-columns: 1fr !important;
                flex: 1 !important;
                min-height: 0 !important;
              }
              .reader-preview {
                display: ${activeMobileTab === "preview" ? "block" : "none"} !important;
                height: 100% !important;
              }
              .reader-form-card {
                display: ${activeMobileTab === "form" ? "flex" : "none"} !important;
                height: 100% !important;
              }
            }
          `}} />

          {/* Left Panel: Reading Log Panel */}
          <div className="card reader-form-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", height: "100%" }}>
            <h3 style={{ fontSize: 14, borderBottom: "1.5px solid var(--br2)", paddingBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-notebook" style={{ color: "var(--teal)" }}></i> บันทึกผลการอ่าน
            </h3>

            {/* Instruction/Warning Note */}
            <div style={{
              background: "rgba(224, 85, 85, 0.08)",
              border: "1px solid rgba(224, 85, 85, 0.25)",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 11,
              color: "#e05555",
              lineHeight: 1.6
            }}>
              <i className="ti ti-alert-triangle" style={{ marginRight: 6 }}></i>
              <strong>โปรดทราบ:</strong> คุณต้องสะสมเวลาให้ครบ 3 นาทีขึ้นไป, ระบุเลขหน้าให้ถูกต้อง และบันทึกข้อคิดอย่างน้อย 20 ตัวอักษร จึงจะสามารถกดบันทึกความคืบหน้าได้ หากคุณกด "ออก" ก่อนกดบันทึก เวลาและสถิติทั้งหมดในรอบนี้จะสูญหายทันที
            </div>

            {/* Dynamic Checklist HUD */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "var(--bg2)",
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--br2)",
              fontSize: 12
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 }}>เกณฑ์การยืนยันเซสชัน</span>
              
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: seconds >= MIN_VERIFIED_SECONDS ? "var(--teal)" : "var(--t3)", transition: "color 0.2s" }}>
                <i className={`ti ${seconds >= MIN_VERIFIED_SECONDS ? "ti-circle-check" : "ti-circle"}`} style={{ fontSize: 14, color: seconds >= MIN_VERIFIED_SECONDS ? "var(--teal)" : "var(--t3)" }}></i>
                <span>เวลาอ่านอย่างน้อย 3 นาที (ขณะนี้: {displayTimer})</span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: (endPage && Number(endPage) >= Number(startPage)) ? "var(--teal)" : "var(--t3)", transition: "color 0.2s" }}>
                <i className={`ti ${(endPage && Number(endPage) >= Number(startPage)) ? "ti-circle-check" : "ti-circle"}`} style={{ fontSize: 14, color: (endPage && Number(endPage) >= Number(startPage)) ? "var(--teal)" : "var(--t3)" }}></i>
                <span>ระบุหน้าที่อ่านถึง (หน้า {startPage} ถึง {endPage || "?"})</span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: reflection.trim().length >= MIN_REFLECTION_CHARS ? "var(--teal)" : "var(--t3)", transition: "color 0.2s" }}>
                <i className={`ti ${reflection.trim().length >= MIN_REFLECTION_CHARS ? "ti-circle-check" : "ti-circle"}`} style={{ fontSize: 14, color: reflection.trim().length >= MIN_REFLECTION_CHARS ? "var(--teal)" : "var(--t3)" }}></i>
                <span>บันทึกข้อคิด {MIN_REFLECTION_CHARS} ตัวอักษรขึ้นไป ({reflection.trim().length}/{MIN_REFLECTION_CHARS})</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>หน้าเริ่มต้น *</span>
                <input 
                  type="number" 
                  value={startPage} 
                  onChange={e => setStartPage(e.target.value)} 
                  style={{ fontSize: 13, padding: "8px 10px" }} 
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>อ่านถึงหน้า *</span>
                <input 
                  type="number" 
                  placeholder="เช่น 12" 
                  value={endPage} 
                  onChange={e => setEndPage(e.target.value)} 
                  style={{ fontSize: 13, padding: "8px 10px" }} 
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>บันทึกข้อคิดที่ได้รับ (สั้นๆ) *</span>
                <span style={{ fontSize: 10, color: reflection.length >= MIN_REFLECTION_CHARS ? "var(--teal)" : "#e05555" }}>
                  {reflection.length}/{MIN_REFLECTION_CHARS} อักษร
                </span>
              </div>
              <textarea 
                value={reflection} 
                onChange={e => setReflection(e.target.value)} 
                rows={5} 
                placeholder="วันนี้ได้ข้อคิดสะกิดใจเรื่องอะไรบ้างจากการอ่านหัวข้อนี้? พิมพ์ข้อเขียนสั้นๆ (อย่างน้อย 20 ตัวอักษรเพื่อรับสถิติยืนยัน)" 
                style={{ fontSize: 12, padding: 10, lineHeight: 1.5 }}
              />
            </label>

            <button 
              onClick={saveReadingProgress} 
              disabled={saving || seconds < MIN_VERIFIED_SECONDS || reflection.length < MIN_REFLECTION_CHARS || !endPage || Number(endPage) < Number(startPage)}
              className="btn btn-teal" 
              style={{ width: "100%", marginTop: "auto", padding: "10px 0", fontSize: 13 }}
            >
              {saving ? "กำลังบันทึก..." : "บันทึกความคืบหน้า"}
            </button>
          </div>

          {/* Right Panel: Embedded Google Preview Viewer */}
          <div className="reader-preview" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--br2)", background: "var(--bg2)", height: "100%" }}>
            {activeBook.book.fileUrl ? (
              <iframe 
                src={getPreviewUrl(activeBook.book.fileUrl)} 
                style={{ width: "100%", height: "100%", border: "none" }} 
                title="Book Preview"
                allow="autoplay"
              ></iframe>
            ) : (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "var(--t3)" }}>
                <i className="ti ti-book-off" style={{ fontSize: 48, marginBottom: 12 }}></i>
                <p>หนังสือเล่มนี้ไม่มีไฟล์ PDF พรีวิว</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>กรุณาเปิดอ่านผ่านเอกสารรูปเล่มจริงหรือไฟล์ภายนอกของท่าน ควบคู่กับการใช้ตัวจับเวลาด้านขวาครับ</p>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    )
  }

  const hasConfiguredNotif = !!notifEnabled || !!streakSettings?.remindersEnabled;

  const renderNotificationSettings = (highlighted) => (
    <div className="card" style={{ 
      padding: 18, 
      marginBottom: 0,
      border: highlighted ? "2px solid var(--teal)" : undefined,
      boxShadow: highlighted ? "0 4px 20px rgba(13, 148, 136, 0.15)" : undefined,
      position: "relative"
    }}>
      {highlighted && (
        <div style={{
          position: "absolute",
          top: -10,
          right: 12,
          background: "var(--teal)",
          color: "#fff",
          fontSize: "10px",
          fontWeight: "bold",
          padding: "2px 8px",
          borderRadius: "10px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          แนะนำให้ตั้งค่า 🔔
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <i className="ti ti-bell" style={{ color: "var(--teal)", fontSize: 16 }}></i>
        <h3 style={{ fontSize: 13, fontWeight: 600 }}>ตั้งค่าการแจ้งเตือนอ่านหนังสือรายวัน</h3>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {/* 1. Browser Notification Switch */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={notifEnabled}
            onChange={async (e) => {
              const val = e.target.checked
              setNotifEnabled(val)
              localStorage.setItem("talib_notif_enabled", String(val))
              if (val) {
                if (typeof Notification === "undefined") {
                  toast.error("เบราว์เซอร์ของคุณไม่รองรับการแจ้งเตือน")
                  setNotifEnabled(false)
                  localStorage.setItem("talib_notif_enabled", "false")
                  return
                }
                const perm = await Notification.requestPermission()
                if (perm === "granted") {
                  toast.success("เปิดใช้งานแจ้งเตือนแล้ว 🔔")
                  new Notification("เปิดการแจ้งเตือนแล้ว 🔔", {
                    body: "ระบบจะแจ้งเตือนเมื่อถึงเวลาอ่านหนังสือที่คุณตั้งค่าไว้"
                  })
                } else {
                  toast.error("เบราว์เซอร์ปฏิเสธสิทธิ์การแจ้งเตือน กรุณาเปิดสิทธิ์ในตั้งค่าเบราว์เซอร์")
                }
              } else {
                toast.success("ปิดการแจ้งเตือนแล้ว")
              }
            }}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ color: "var(--text)" }}>เปิดแจ้งเตือนจากเบราว์เซอร์</span>
        </label>

        {/* 2. Browser Alarm Time Setting */}
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--t2)" }}>
          <span>เวลาอ่านหนังสือประจำวัน (เบราว์เซอร์)</span>
          <input
            type="time"
            value={notifTime}
            disabled={!notifEnabled}
            onChange={(e) => {
              const val = e.target.value
              setNotifTime(val)
              localStorage.setItem("talib_notif_time", val)
              toast.success(`ตั้งเวลาแจ้งเตือนเป็น ${val} เรียบร้อยแล้ว`)
            }}
            style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: "var(--card)", border: "0.5px solid var(--br)", color: "var(--text)", borderRadius: 8 }}
          />
        </label>

        <div style={{ margin: "8px 0", height: "1px", background: "var(--br2)" }} />

        {/* 3. Sync Cloud Notifications (Daily Goal Streak) */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={streakSettings.remindersEnabled}
            onChange={(e) => handleToggleReminders(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontWeight: 500, color: "var(--text)" }}>ตั้งเตือนรักษาสถิติการอ่านรายวัน (Sync คลาวด์)</span>
        </label>

        {streakSettings.remindersEnabled && (
          <div style={{ display: "grid", gap: 10, padding: 12, background: "var(--bg2)", borderRadius: 10, border: "0.5px solid var(--br)", marginTop: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--t2)" }}>ตั้งเตือนเวลาอื่น ๆ:</div>
            
            {streakSettings.reminderTimes.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--t3)" }}>ยังไม่มีเวลาแจ้งเตือนที่ตั้งค่าไว้</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {streakSettings.reminderTimes.map((timeStr) => (
                  <div key={timeStr} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--teal-bg)", border: "0.5px solid var(--teal)", color: "var(--teal)", padding: "3px 8px", borderRadius: 12, fontSize: 11 }}>
                    <i className="ti ti-alarm" style={{ fontSize: 10 }}></i>
                    <span>{timeStr}</span>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveReminderTime(timeStr)} 
                      style={{ background: "none", border: "none", color: "red", cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}
                    >
                      <i className="ti ti-x" style={{ fontSize: 11 }}></i>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
              <input 
                type="time" 
                id="new-reader-reminder-time" 
                defaultValue="20:00" 
                style={{ flex: 1, padding: "4px 8px", fontSize: 12, background: "var(--card)", border: "0.5px solid var(--br)", color: "var(--text)", borderRadius: 6, height: 28 }}
              />
              <button 
                type="button" 
                className="btn btn-teal" 
                style={{ padding: "0 10px", fontSize: 11, height: 28, borderRadius: 6 }}
                onClick={() => {
                  const input = document.getElementById("new-reader-reminder-time")
                  if (input && input.value) {
                    handleAddReminderTime(input.value)
                  }
                }}
              >
                <i className="ti ti-plus" style={{ marginRight: 4 }}></i>เพิ่ม
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // --- Reading App Home / Dashboard View ---
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 40, width: "100%", textAlign: "left" }}>
      {/* Onboarding Tutorial Modal */}
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {/* Home Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 600, textTransform: "uppercase" }}>Talib Private Reader</span>
          <h1 style={{ fontSize: 24, marginTop: 4 }}>ห้องอ่านหนังสือส่วนตัว</h1>
          <p style={{ fontSize: 12, color: "var(--t2)" }}>Gamified Reading App - บันทึกเวลาอ่านอัตโนมัติ สะสมไอเทม และทำภารกิจรายวัน</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setShowTutorial(true)}
            style={{ background: "none", border: "none", color: "var(--teal)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "'Prompt', sans-serif" }}
          >
            <i className="ti ti-help-circle"></i> วิธีใช้งาน
          </button>
          <button className="btn btn-outline" onClick={() => go("member", { view: "overview" })} style={{ fontSize: 12, padding: "8px 16px" }}>
            <i className="ti ti-layout-dashboard" style={{ marginRight: 6 }}></i>แดชบอร์ดหลัก
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .reader-grid-layout {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 20px;
          align-items: start;
          width: 100%;
        }
        @media (max-width: 800px) {
          .reader-grid-layout {
            grid-template-columns: 1fr;
          }
        }
      `}} />

      <div className="reader-grid-layout">
        {/* Left Column: Active Bookshelf (Primary Core Actions) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Active Bookshelf Shelf Section */}
          <div style={{ marginBottom: 8 }}>
            {/* Tab navigation */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--br2)", paddingBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button 
                onClick={() => setReadingTab("reading")} 
                className={`reader-btn ${readingTab === "reading" ? "on" : ""}`}
                style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
              >
                กำลังอ่าน ({myActiveBooks.length})
              </button>
              <button 
                onClick={() => setReadingTab("finished")} 
                className={`reader-btn ${readingTab === "finished" ? "on" : ""}`}
                style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
              >
                อ่านจบแล้ว ({myFinishedBooks.length})
              </button>
              <button 
                onClick={() => setReadingTab("stats")} 
                className={`reader-btn ${readingTab === "stats" ? "on" : ""}`}
                style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
              >
                สถิติสะสม 📊
              </button>

              <button 
                onClick={() => setShowAddForm(!showAddForm)} 
                className="btn btn-outline" 
                style={{ fontSize: 11, padding: "6px 14px", borderRadius: 20, marginLeft: "auto" }}
              >
                <i className={`ti ${showAddForm ? "ti-minus" : "ti-plus"}`}></i> {showAddForm ? "ปิดช่องเพิ่มหนังสือ" : "เพิ่มหนังสือเข้าชั้น"}
              </button>
            </div>

            {showAddForm && (
              <div className="card" style={{ padding: 18, background: "var(--bg2)", border: "1.5px solid var(--br2)", borderRadius: 12, marginBottom: 16, animation: "pageFadeIn 0.2s ease-out" }}>
                <div className="reader-control" style={{ marginBottom: 12, display: "flex", gap: 4, width: "fit-content" }}>
                  <button 
                    className={`reader-btn ${addMode === "library" ? "on" : ""}`} 
                    onClick={() => setAddMode("library")}
                    style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
                  >
                    เลือกจากคลังของเว็บ
                  </button>
                  <button 
                    className={`reader-btn ${addMode === "external" ? "on" : ""}`} 
                    onClick={() => setAddMode("external")}
                    style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
                  >
                    อัปโหลดไฟล์ / ลิงก์นอก
                  </button>
                </div>

                {addMode === "library" ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select 
                      value={selectedBookToAdd} 
                      onChange={event => setSelectedBookToAdd(event.target.value)} 
                      style={{ fontSize: 12, padding: "8px 10px", flex: 1, minWidth: 200 }}
                    >
                      <option value="">-- เลือกหนังสือจากคลัง --</option>
                      {availableBooks.map(book => (
                        <option key={book.id} value={book.id}>{book.title} ({book.author})</option>
                      ))}
                    </select>
                    <button 
                      onClick={() => { addNewBookToShelf(); setShowAddForm(false); }} 
                      disabled={!selectedBookToAdd}
                      className="btn btn-teal" 
                      style={{ padding: "8px 20px", fontSize: 12 }}
                    >
                      เพิ่มเข้าชั้นหนังสือ
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input 
                        value={externalBook.title} 
                        onChange={event => setExternalBook(prev => ({ ...prev, title: event.target.value }))} 
                        placeholder="ชื่อหนังสือหรือไฟล์ *" 
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                      <input 
                        value={externalBook.author} 
                        onChange={event => setExternalBook(prev => ({ ...prev, author: event.target.value }))} 
                        placeholder="ผู้เขียน/แหล่งที่มา (ไม่บังคับ)" 
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                      <input 
                        value={externalBook.fileUrl} 
                        onChange={event => setExternalBook(prev => ({ ...prev, fileUrl: event.target.value }))} 
                        placeholder="ลิงก์ PDF / Google Drive / URL อ่านออนไลน์" 
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                      <input 
                        type="number" 
                        min="0" 
                        value={externalBook.totalPages} 
                        onChange={event => setExternalBook(prev => ({ ...prev, totalPages: event.target.value }))} 
                        placeholder="จำนวนหน้าทั้งหมด" 
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                    </div>
                    <textarea 
                      value={externalBook.desc} 
                      onChange={event => setExternalBook(prev => ({ ...prev, desc: event.target.value }))} 
                      placeholder="คำอธิบายหรือจดบันทึกเป้าหมายสั้น ๆ สำหรับหนังสือเล่มนี้..." 
                      style={{ fontSize: 12, padding: "8px 10px", minHeight: 60 }} 
                    />
                    
                    <label className="bookshelf-file-input" style={{ 
                      display: "flex", alignItems: "center", gap: 10, minHeight: 44, 
                      border: "1px dashed var(--br)", borderRadius: 10, background: "var(--card)", 
                      padding: "10px 12px", color: "var(--t2)", fontSize: 12, cursor: "pointer" 
                    }}>
                      <i className="ti ti-upload" style={{ color: "var(--teal)", fontSize: 18 }}></i>
                      <span>{externalBook.file ? externalBook.file.name : "หรือคลิกอัปโหลดไฟล์ PDF จากเครื่อง (จำกัด 20MB)"}</span>
                      <input 
                        type="file" 
                        accept=".pdf,.epub,.doc,.docx,.txt" 
                        onChange={event => setExternalBook(prev => ({ ...prev, file: event.target.files?.[0] || null }))} 
                        style={{ display: "none" }}
                      />
                    </label>
                    
                    <button 
                      className="btn btn-teal" 
                      onClick={async () => { await addExternalBook(); setShowAddForm(false); }} 
                      disabled={uploadingExternal}
                      style={{ width: "100%", padding: "10px", fontSize: 12 }}
                    >
                      <i className={`ti ${uploadingExternal ? "ti-loader-2 spin" : "ti-plus"}`} style={{ marginRight: 6 }}></i>
                      {uploadingExternal ? "กำลังอัปโหลดและบันทึกไฟล์..." : "บันทึกและเพิ่มไฟล์นอกเข้าชั้น"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {readingTab === "reading" && (
              myActiveBooks.length === 0 ? (
                <div className="card" style={{ padding: "32px 16px", textAlign: "center", color: "var(--t3)" }}>
                  <i className="ti ti-book-2" style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}></i>
                  <p style={{ fontSize: 13 }}>ไม่มีหนังสืออยู่ในหน้าอ่านค้างไว้ในขณะนี้</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>กรุณาเลือกหนังสือจากกล่องเลือกด้านบนเพื่อเพิ่มเข้าชั้นหนังสือและเริ่มเซสชันจับเวลาอ่านจริงครับ</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {myActiveBooks.map(item => (
                    <div key={item.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          <span className="tag tag-teal" style={{ fontSize: 9, padding: "1px 6px" }}>{item.book.category || "หนังสือ"}</span>
                          <span className="tag" style={{ fontSize: 9, padding: "1px 6px", background: "var(--acc2)" }}>{item.book.type}</span>
                        </div>
                        <strong style={{ fontSize: 13, color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4 }}>{item.book.title}</strong>
                        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4, marginBottom: 12 }}>{item.book.author}</div>
                        
                        {/* Progress bar */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--t2)", marginBottom: 4 }}>
                            <span>ความคืบหน้า</span>
                            <span>{item.progress || 0}%</span>
                          </div>
                          <div style={{ height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${item.progress || 0}%`, height: "100%", background: "var(--teal)", borderRadius: 3 }}></div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button 
                          onClick={() => startReading(item)} 
                          className="btn btn-teal" 
                          style={{ flex: 1, padding: "6px 0", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                        >
                          <i className="ti ti-device-desktop"></i> เปิดห้องอ่าน (จับเวลา)
                        </button>
                        <button 
                          onClick={() => removeShelfItem(item.id)} 
                          className="btn btn-outline" 
                          style={{ padding: "6px 10px", fontSize: 11, color: "#e05555", borderColor: "rgba(224,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="ลบหนังสือออกจากชั้น"
                        >
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {readingTab === "finished" && (
              myFinishedBooks.length === 0 ? (
                <div className="card" style={{ padding: "32px 16px", textAlign: "center", color: "var(--t3)" }}>
                  <i className="ti ti-book" style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}></i>
                  <p style={{ fontSize: 13 }}>ยังไม่มีหนังสือที่อ่านจบแล้วในคลัง</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>สู้ๆ ครับ! เมื่อคุณอ่านหนังสือได้ครบ 100% หนังสือจะย้ายมาอยู่ตู้นี้โดยอัตโนมัติ</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {myFinishedBooks.map(item => (
                    <div key={item.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: 0.9 }}>
                      <div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          <span className="tag tag-teal" style={{ fontSize: 9, padding: "1px 6px" }}>{item.book.category || "หนังสือ"}</span>
                          <span className="tag" style={{ fontSize: 9, padding: "1px 6px", background: "var(--teal-bg)", color: "var(--teal)" }}>อ่านจบแล้ว ✨</span>
                        </div>
                        <strong style={{ fontSize: 13, color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4 }}>{item.book.title}</strong>
                        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4, marginBottom: 12 }}>{item.book.author}</div>
                        
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--t2)", marginBottom: 4 }}>
                            <span>ความคืบหน้า</span>
                            <span>100%</span>
                          </div>
                          <div style={{ height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: "100%", height: "100%", background: "var(--teal)", borderRadius: 3 }}></div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--t2)", display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--br2)", paddingTop: 8, marginTop: 8 }}>
                          <span>อ่านสะสม: {formatReadingMinutes(item.totalReadSeconds || 0)}</span>
                          <span>ยืนยันข้อมูล: {item.verifiedSessions || 0} ครั้ง</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                          <button 
                            onClick={() => removeShelfItem(item.id)} 
                            className="btn btn-outline" 
                            style={{ flex: 1, padding: "6px 0", fontSize: 11, color: "#e05555", borderColor: "rgba(224,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                          >
                            <i className="ti ti-trash"></i> ลบหนังสือออกจากชั้น
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {readingTab === "stats" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-book-2" style={{ color: "var(--teal)", fontSize: 20 }}></i>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>กำลังอ่าน</span>
                    <strong style={{ fontSize: 16, color: "var(--text)" }}>{stats.reading} เล่ม</strong>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,179,0,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-check" style={{ color: "rgb(255,179,0)", fontSize: 20 }}></i>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>อ่านจบแล้ว</span>
                    <strong style={{ fontSize: 16, color: "var(--text)" }}>{stats.finished} เล่ม</strong>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,115,196,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-chart-dots" style={{ color: "#6ba0ff", fontSize: 20 }}></i>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>ความคืบหน้าเฉลี่ย</span>
                    <strong style={{ fontSize: 16, color: "var(--text)" }}>{stats.avgProgress}%</strong>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(167,139,250,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-shield-check" style={{ color: "#a78bfa", fontSize: 20 }}></i>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>อ่านจริงที่ยืนยันแล้ว</span>
                    <strong style={{ fontSize: 14, color: "var(--text)", display: "block" }}>{stats.verifiedSessions} ครั้ง</strong>
                    <span style={{ fontSize: 9, color: "var(--t2)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>สะสม: {formatReadingMinutes(stats.totalSeconds)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Gamification Stats (Sidebar) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Gamified Streak Row (Duolingo Style - Sidebar Compact Version) */}
          <section className="card streak-panel" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18, marginBottom: 0 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div className="streak-flame" style={{ flexShrink: 0, width: 40, height: 40, fontSize: 20 }}>
                <i className="ti ti-flame"></i>
              </div>
              <div className="streak-main" style={{ flex: 1, minWidth: 0 }}>
                <span className="badge badge-teal" style={{ fontSize: 9, padding: "2px 6px" }}>ความต่อเนื่องในการอ่านสะสม</span>
                <h2 style={{ fontSize: 16, marginTop: 4, fontWeight: 600 }}>{streak.current} วันต่อเนื่อง</h2>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "var(--t2)" }}>
              เป้าหมายวันนี้ {formatReadingMinutes(todaySeconds)}/{DAILY_READING_GOAL_MINUTES} นาที 
              {streak.todayVerified ? " (สำเร็จแล้ววันนี้! 🔥)" : ""}
            </div>
            <div className="streak-progress" style={{ height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden", marginTop: 2 }}>
              <div style={{ width: `${goalPercent}%`, height: "100%", background: "var(--teal)", borderRadius: 3 }}></div>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <div className="btn btn-outline" style={{ flex: 1, padding: "6px 8px", fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: 0.8, pointerEvents: "none", cursor: "default", whiteSpace: "nowrap" }}>
                <i className="ti ti-snowflake" style={{ color: "#64c8ff" }}></i>น้ำแข็ง {streakSettings.freezeCredits}
              </div>
              <button className="btn btn-outline" onClick={() => protectToday("leave")} disabled={streak.todayVerified || streak.todayProtected || streakSettings.leaveCredits <= 0} style={{ flex: 1, padding: "6px 8px", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, whiteSpace: "nowrap" }}>
                <i className="ti ti-calendar-pause" style={{ color: "#3b73c4" }}></i>ลากิจ {streakSettings.leaveCredits}
              </button>
            </div>

            {/* 7 Days Stats Grid */}
            <div style={{ paddingTop: 10, borderTop: "1px solid var(--br2)", marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
                {last7Days.map(day => {
                  let bg = "var(--bg3)"
                  let border = "1px solid var(--br)"
                  let color = "var(--t3)"
                  let icon = null

                  if (day.metGoal) {
                    bg = "var(--teal-bg)"
                    border = "1.5px solid var(--teal)"
                    color = "var(--teal)"
                    icon = <i className="ti ti-flame" style={{ fontSize: 12 }}></i>
                  } else if (day.protection) {
                    const isLeave = day.protection.type === "leave"
                    bg = isLeave ? "rgba(59, 115, 196, 0.1)" : "rgba(100, 200, 255, 0.1)"
                    border = isLeave ? "1.5px solid #3b73c4" : "1.5px solid #64c8ff"
                    color = isLeave ? "#3b73c4" : "#64c8ff"
                    icon = isLeave ? <i className="ti ti-calendar-pause" style={{ fontSize: 10 }}></i> : <i className="ti ti-snowflake" style={{ fontSize: 10 }}></i>
                  } else if (day.hasRead) {
                    bg = "var(--bg2)"
                    border = "1px dashed var(--teal)"
                    color = "var(--teal)"
                    icon = <span style={{ fontSize: 8, fontWeight: "bold" }}>{day.minutes}ม</span>
                  } else {
                    icon = <i className="ti ti-minus" style={{ opacity: 0.3, fontSize: 10 }}></i>
                  }

                  const isToday = day.key === streak.todayKey

                  return (
                    <div key={day.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1, minWidth: 32 }}>
                      <span style={{ fontSize: 9, color: isToday ? "var(--teal)" : "var(--t2)", fontWeight: isToday ? 600 : 300 }}>{day.name}</span>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: bg, border: border, color: color,
                        position: "relative"
                      }}>
                        {icon}
                        {isToday && (
                          <span style={{
                            position: "absolute", bottom: -1, width: 4, height: 4,
                            borderRadius: "50%", background: "var(--teal)"
                          }} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* If NOT configured, place it as position #2 (promoted with highlight border) */}
          {!hasConfiguredNotif && renderNotificationSettings(true)}

          {/* 💎 Item Shop & Currency Card */}
          <div className="card" style={{ padding: 18, marginBottom: 0, display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-shopping-cart" style={{ color: "var(--teal)", fontSize: 16 }}></i>
                <h3 style={{ fontSize: 13, fontWeight: 600 }}>ร้านค้าไอเทม (Item Shop)</h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(245,158,11,0.08)", padding: "4px 8px", borderRadius: 20, border: "0.5px solid rgba(245,158,11,0.2)" }}>
                <span style={{ fontSize: 13 }}>💎</span>
                <strong style={{ fontSize: 13, color: "#f59e0b" }}>{streakSettings.gems || 0}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {/* Item 1: Freeze Ice */}
              <div style={{ display: "flex", flex: 1, minWidth: 200, alignItems: "center", justifyContent: "space-between", background: "var(--bg2)", padding: 10, borderRadius: 10, border: "0.5px solid var(--br)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>🧊</span>
                  <div>
                    <strong style={{ fontSize: 11, color: "var(--text)", display: "block" }}>น้ำแข็ง (Freeze)</strong>
                    <span style={{ fontSize: 9, color: "var(--t3)", display: "block" }}>คุ้มครอง Streak อัตโนมัติ</span>
                  </div>
                </div>
                <button
                  className="btn btn-teal"
                  onClick={() => buyItem("freeze")}
                  disabled={Number(streakSettings.gems || 0) < 50 || Number(streakSettings.freezeCredits || 0) >= 2}
                  style={{ padding: "6px 10px", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span>50 💎</span>
                </button>
              </div>

              {/* Item 2: Leave Day */}
              <div style={{ display: "flex", flex: 1, minWidth: 200, alignItems: "center", justifyContent: "space-between", background: "var(--bg2)", padding: 10, borderRadius: 10, border: "0.5px solid var(--br)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  <div>
                    <strong style={{ fontSize: 11, color: "var(--text)", display: "block" }}>ลากิจ (Leave)</strong>
                    <span style={{ fontSize: 9, color: "var(--t3)", display: "block" }}>กดใช้วันนี้ด้วยตัวเอง</span>
                  </div>
                </div>
                <button
                  className="btn btn-teal"
                  onClick={() => buyItem("leave")}
                  disabled={Number(streakSettings.gems || 0) < 80 || Number(streakSettings.leaveCredits || 0) >= 2}
                  style={{ padding: "6px 10px", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span>80 💎</span>
                </button>
              </div>
            </div>
          </div>

          {/* 🎯 Daily Missions Checklist */}
          <div className="card" style={{ padding: 18, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <i className="ti ti-target" style={{ color: "var(--teal)", fontSize: 16 }}></i>
              <h3 style={{ fontSize: 13, fontWeight: 600 }}>ภารกิจสะสมไอเทมประจำวัน</h3>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <MissionRow 
                title="1. นักอ่านผู้ทุ่มเท"
                desc="สะสมเวลาอ่านหนังสือให้ครบ 10 นาทีในวันนี้"
                progress={todaySeconds}
                target={600}
                formatProgress={(val) => `${Math.round(val / 60)}/10 นาที`}
                rewardText="+5 💎"
                claimed={streakSettings.claimedMissions?.[streak.todayKey]?.m1}
                onClaim={() => claimMission("m1")}
              />

              <MissionRow 
                title="2. บันทึกธรรมสะกิดใจ"
                desc="บันทึกบันทึกการอ่านและเขียนข้อคิดที่มีความยาว 100 ตัวอักษรขึ้นไปในเซสชันเดียวกันวันนี้"
                progress={todaySessions.reduce((max, s) => Math.max(max, s.reflection?.length || 0), 0)}
                target={100}
                formatProgress={(val) => `${val}/100 ตัวอักษร`}
                rewardText="+8 💎"
                claimed={streakSettings.claimedMissions?.[streak.todayKey]?.m2}
                onClaim={() => claimMission("m2")}
              />

              <MissionRow 
                title="3. สอบควิซหนังสือ"
                desc="ทำแบบทดสอบ (Quiz) หนังสือใดๆ บนชั้นหนังสือ และสอบผ่านได้คะแนน 12/20 ข้อขึ้นไปวันนี้"
                progress={todayQuizPassed ? 1 : 0}
                target={1}
                formatProgress={(val) => val === 1 ? "สำเร็จ" : "ยังไม่สำเร็จ"}
                rewardText="+10 💎"
                claimed={streakSettings.claimedMissions?.[streak.todayKey]?.m3}
                onClaim={() => claimMission("m3")}
              />
            </div>
          </div>

          {/* If configured, place it at the bottom (position #4) */}
          {hasConfiguredNotif && renderNotificationSettings(false)}
        </div>
      </div>
    </div>
  )
}

function MissionRow({ title, desc, progress, target, formatProgress, rewardText, claimed, onClaim }) {
  const completed = progress >= target
  const percent = Math.min(100, Math.round((progress / target) * 100))
  
  const containerBg = claimed 
    ? "rgba(45, 190, 160, 0.04)" 
    : completed 
      ? "rgba(45, 190, 160, 0.08)" 
      : "var(--bg2)"
  const borderColor = claimed 
    ? "rgba(45, 190, 160, 0.15)" 
    : completed 
      ? "rgba(45, 190, 160, 0.35)" 
      : "var(--br)"
  
  return (
    <div style={{ 
      padding: "10px 12px", 
      background: containerBg, 
      border: `1px solid ${borderColor}`,
      borderRadius: 12, 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "space-between", 
      gap: 12,
      flexWrap: "wrap",
      textAlign: "left",
      transition: "all 0.2s ease"
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <strong style={{ fontSize: 12, color: "var(--text)" }}>{title}</strong>
          <span style={{ fontSize: 9, fontWeight: 500, color: "var(--teal)", background: "var(--teal-bg)", padding: "1px 5px", borderRadius: 4 }}>
            {rewardText}
          </span>
        </div>
        <p style={{ fontSize: 10, color: "var(--t2)", marginBottom: 6, lineHeight: 1.3 }}>{desc}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: "var(--bg3)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${percent}%`, height: "100%", background: "var(--teal)", borderRadius: 2 }}></div>
          </div>
          <span style={{ fontSize: 9, color: "var(--t3)", fontWeight: 500, whiteSpace: "nowrap" }}>
            {formatProgress(progress)}
          </span>
        </div>
      </div>
      
      <div>
        {claimed ? (
          <button className="btn btn-outline" disabled style={{ padding: "4px 8px", fontSize: 10, opacity: 0.6, cursor: "not-allowed", color: "var(--teal)", borderColor: "rgba(45, 190, 160, 0.2)" }}>
            <i className="ti ti-check" style={{ marginRight: 2 }}></i>รับแล้ว
          </button>
        ) : (
          <button 
            onClick={onClaim}
            disabled={!completed}
            className={`btn ${completed ? "btn-teal" : "btn-outline"}`}
            style={{ 
              padding: "4px 10px", 
              fontSize: 10, 
              opacity: completed ? 1 : 0.6, 
              cursor: completed ? "pointer" : "not-allowed",
              boxShadow: completed ? "0 4px 10px rgba(45,190,160,0.15)" : "none"
            }}
          >
            {completed ? "รับรางวัล" : "ยังไม่เสร็จ"}
          </button>
        )}
      </div>
    </div>
  )
}

function TutorialModal({ onClose }) {
  return createPortal(
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 16px",
      overflowY: "auto",
    }} onClick={onClose}>
      <div className="card" style={{
        maxWidth: 500,
        width: "100%",
        padding: "28px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        textAlign: "center",
        animation: "pageFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        position: "relative",
      }} onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            fontSize: 18,
            cursor: "pointer",
            color: "var(--t3)",
            width: 32,
            height: 32,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            transition: "background 0.15s",
          }}
          title="ปิด"
        >
          <i className="ti ti-x"></i>
        </button>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: -4 }}>
          <span className="badge badge-teal" style={{ fontSize: 11, padding: "4px 10px", fontWeight: 600 }}>แนะนำการใช้งาน 🚀</span>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", margin: 0 }}>
          ห้องอ่านหนังสือส่วนตัวคืออะไร?
        </h2>

        <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6, margin: 0 }}>
          เครื่องมือสร้างวินัยรักการอ่าน ผ่านการจับเวลาจริง บันทึกผล และสะสมสถิติความต่อเนื่อง (Streak)
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>

          <div style={{ display: "flex", gap: 12, background: "var(--bg2)", padding: 13, borderRadius: 12, border: "0.5px solid var(--br)" }}>
            <div style={{ width: 34, height: 34, background: "var(--teal-bg)", color: "var(--teal)", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
              <i className="ti ti-books"></i>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block", marginBottom: 2 }}>เพิ่มหนังสือแล้วเริ่มอ่าน</strong>
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>เลือกหนังสือจากคลังหรืออัปโหลด PDF กด <span style={{ color: "var(--teal)", fontWeight: 500 }}>เริ่มอ่าน</span> เพื่อเข้าโหมดจับเวลา ระบบบันทึกเวลาที่อ่านจริงเท่านั้น</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, background: "var(--bg2)", padding: 13, borderRadius: 12, border: "0.5px solid var(--br)" }}>
            <div style={{ width: 34, height: 34, background: "rgba(248, 113, 113, 0.12)", color: "#f87171", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
              <i className="ti ti-flame"></i>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block", marginBottom: 2 }}>รักษา Streak ต่อเนื่อง 🔥</strong>
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>อ่าน and บันทึกเซสชันทุกวัน ระบบจะนับวันต่อเนื่อง หากวันไหนอ่านไม่ได้ ใช้ไอเทมคุ้มครองแทนได้</span>
            </div>
          </div>

          {/* ─── น้ำแข็ง & ลากิจ ─── */}
          <div style={{ background: "rgba(96,165,250,0.07)", border: "0.5px solid rgba(96,165,250,0.2)", borderRadius: 12, padding: 13 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-shield-check" style={{ color: "#60a5fa" }}></i>
              ไอเทมคุ้มครอง Streak (สูงสุด 2 ชิ้นต่อประเภท)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>🧊</span>
                <div>
                  <strong style={{ fontSize: 12, color: "var(--text)" }}>น้ำแข็ง (Freeze)</strong>
                  <span style={{ fontSize: 11, color: "var(--t2)", display: "block", lineHeight: 1.4 }}>ระบบใช้อัตโนมัติเมื่อลืมอ่านหนังสือในวันก่อนหน้า เพื่อรักษา Streak ของคุณ ได้จากภารกิจสะสม</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>📅</span>
                <div>
                  <strong style={{ fontSize: 12, color: "var(--text)" }}>ลากิจ (Leave)</strong>
                  <span style={{ fontSize: 11, color: "var(--t2)", display: "block", lineHeight: 1.4 }}>ใช้เมื่อวางแผนล่วงหน้าแล้วว่าน่าจะเรียนไม่ทันหรือไม่ว่าง สามารถกดใช้วันนี้ด้วยตัวเอง ได้จากภารกิจสะสม</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, background: "var(--bg2)", padding: 13, borderRadius: 12, border: "0.5px solid var(--br)" }}>
            <div style={{ width: 34, height: 34, background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
              <i className="ti ti-target"></i>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block", marginBottom: 2 }}>ภารกิจรายวัน (ไม่ง่าย)</strong>
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>อ่าน 10 นาที หรือเขียนข้อคิด 100 ตัวอักษร หรือผ่านแบบทดสอบ 12/20 ข้อ จึงจะได้รับไอเทม และมีสิทธิ์รับได้เพียงครั้งเดียวต่อวัน</span>
            </div>
          </div>

        </div>

        <button
          className="btn btn-teal"
          onClick={onClose}
          style={{ width: "100%", padding: "12px", fontSize: 14, marginTop: 4 }}
        >
          เข้าใจแล้ว เริ่มต้นใช้งานเลย!
        </button>

      </div>
    </div>,
    document.body
  )
}
