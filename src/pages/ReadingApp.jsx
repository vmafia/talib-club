import { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import { BOOKS, DEFAULT_TAXONOMY } from "../data/index.js"
import { useContentCollection, useTaxonomySettings, useUserDoc } from "../lib/contentStore.js"
import { confirmAction } from "../utils/feedback.jsx"
import { getDownloadURL, ref, uploadBytes, getStorage } from "firebase/storage"
import { doc, getDoc } from "firebase/firestore"
import { storage, app, db } from "../lib/firebase.js"
import { safeDateNow } from "../utils/time.js"
import { useReadingTimer } from "./reading/hooks/useReadingTimer.js"
import { TutorialModal } from "./reading/components/TutorialModal.jsx"
import { QuizModal } from "./reading/components/QuizModal.jsx"
import { MissionRow } from "./reading/components/MissionRow.jsx"
import ReadingDashboard from "./reading/components/ReadingDashboard.jsx"

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
  return getLocalDayKey(safeDateNow())
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
    streakCount: Number(settings?.streakCount || 0),
    bestStreak: Number(settings?.bestStreak || 0),
    displayName: settings?.displayName || "",
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
  const readOnlyQueryOptions = useMemo(() => ({ live: false }), [])
  const { items: books } = useContentCollection("books", BOOKS, null, readOnlyQueryOptions)
  const { items: shelfItems, saveItem: saveShelfItem, deleteItem: deleteShelfItem } = useContentCollection("bookshelf", [], uid, readOnlyQueryOptions)
  const { items: readingSessions, loading: loadingSessions, saveItem: saveReadingSession } = useContentCollection("reading_sessions", [], uid, readOnlyQueryOptions)
  const { item: streakRecord, loading: loadingStreaks, saveItem: saveStreakSettings } = useUserDoc("reading_streaks", uid, uid, null)
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
  const { seconds, isRunning, startTimer, pauseTimer, resumeTimer, resetTimer } = useReadingTimer()

  // Log Form states
  const [startPage, setStartPage] = useState("")
  const [endPage, setEndPage] = useState("")
  const [reflection, setReflection] = useState("")
  const [saving, setSaving] = useState(false)

  // Add Book Dropdown states
  const [selectedBookToAdd, setSelectedBookToAdd] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [activeQuizShelfItem, setActiveQuizShelfItem] = useState(null)

  // Reading Reminders states
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem("talib_notif_enabled") === "true")
  const [notifTime, setNotifTime] = useState(() => localStorage.getItem("talib_notif_time") || "20:00")

  // --- Normalized Streak & Sessions ---
  const streakSettings = useMemo(() => {
    return normalizeStreakSettings(streakRecord, uid)
  }, [streakRecord, uid])

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
              { date: yesterdayKey, type: "freeze", usedAt: safeDateNow() },
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

  // Sync calculated streak count and user display name to Firestore for leaderboard
  useEffect(() => {
    if (!uid || loadingStreaks || loadingSessions || !streakSettings) return
    const currentStreakCount = streak.current
    const currentBestStreak = streak.best
    const userDisplayName = authState?.user?.displayName || authState?.user?.email?.split("@")[0] || "สมาชิก"

    if (
      streakSettings.streakCount !== currentStreakCount ||
      streakSettings.bestStreak !== currentBestStreak ||
      streakSettings.displayName !== userDisplayName
    ) {
      const syncStreak = async () => {
        try {
          await saveStreakSettings({
            ...streakSettings,
            streakCount: currentStreakCount,
            bestStreak: currentBestStreak,
            displayName: userDisplayName,
            updatedAt: safeDateNow()
          })
        } catch (err) {
          console.error("Failed to sync streak count to Firestore", err)
        }
      }
      syncStreak()
    }
  }, [uid, loadingStreaks, loadingSessions, streakSettings, streak.current, streak.best, authState?.user?.displayName, authState?.user?.email, saveStreakSettings])

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
        { date: key, type, usedAt: safeDateNow() },
      ],
    })
    toast.success(isLeave ? "บันทึกวันลากิจแล้ว" : "ใช้น้ำแข็งคุ้มครอง streak วันนี้แล้ว")
  }

  async function handleSaveQuizScore(shelfItemId, score) {
    const item = shelfItems.find(s => String(s.id) === String(shelfItemId))
    if (!item) return
    try {
      const updatedItem = {
        ...item,
        lastQuiz: {
          score,
          takenAt: new Date().toISOString()
        }
      }
      await saveShelfItem(updatedItem)
    } catch (err) {
      console.error("Failed to save quiz score", err)
      toast.error("เกิดข้อผิดพลาดในการบันทึกคะแนนควิซ")
    }
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
      addedAt: safeDateNow(),
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
        const usedStorage = storage || getStorage(app)
        const fileRef = ref(usedStorage, `members/${uid}/bookshelf/${safeDateNow()}-${safeName}`)
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
        addedAt: safeDateNow(),
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
    resumeTimer()
    setStartPage(shelfItem.currentPage || 1)
    setEndPage("")
    setReflection("")
    setActiveMobileTab("form")
  }

  function cancelReading() {
    setActiveBook(null)
    resetTimer()
    setStartPage("")
    setEndPage("")
    setReflection("")
  }

  function stopReading() {
    pauseTimer()
  }

  function toggleTimer() {
    if (isRunning) {
      pauseTimer()
    } else {
      resumeTimer()
    }
  }

  const exitReadingRoom = async () => {
    const ok = await confirmAction({
      title: "ออกจากห้องอ่านหนังสือ?",
      message: "คำเตือน: ความคืบหน้าและเวลาที่อ่านสะสมในเซสชันนี้จะสูญหายทั้งหมด และจะไม่ถูกนำไปคำนวณ Streak หรือภารกิจรายวัน คุณต้องการออกจากห้องอ่านหนังสือโดยไม่บันทึกใช่หรือไม่?",
      confirmText: "ยืนยันการออกโดยไม่บันทึก",
      danger: true
    })
    if (!ok) return
    stopReading()
    setActiveBook(null)
    resetTimer()
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
        startedAt: startTimestampRef.current || safeDateNow() - (seconds * 1000),
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

      const sessionId = `${uid}_${activeBook.id}_${safeDateNow()}`

      await saveReadingSession({
        id: sessionId,
        uid,
        shelfItemId: activeBook.id,
        bookId: String(activeBook.bookId),
        bookTitle: activeBook.book.title,
        sourceType: activeBook.sourceType || "library",
        dayKey: todayKey(),
        startedAt: payload.startedAt,
        completedAt: safeDateNow(),
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

      // Get latest streak document to avoid overwriting recent gems
      const latestStreakSnap = await getDoc(doc(db, "content_reading_streaks", uid))
      const currentGems = latestStreakSnap.exists() ? Number(latestStreakSnap.data().gems || 0) : Number(streakSettings?.gems || 0)

      // Update user's streak document with gems
      await saveStreakSettings({
        ...streakSettings,
        gems: currentGems + sessionGems,
      })

      const nextProgress = getProgressFromSession(activeBook, end, report.pagesRead)

      const cleanItem = { ...activeBook }
      delete cleanItem.book

      // Get latest shelf item to avoid overwriting concurrent read time
      const latestBookSnap = await getDoc(doc(db, "content_bookshelf", activeBook.id))
      const latestBookData = latestBookSnap.exists() ? latestBookSnap.data() : activeBook
      const currentReadSeconds = Number(latestBookData.totalReadSeconds || 0)
      const currentVerifiedSessions = Number(latestBookData.verifiedSessions || 0)

      await saveShelfItem({
        ...cleanItem,
        progress: nextProgress,
        currentPage: end,
        status: nextProgress >= 100 ? "finished" : "reading",
        totalReadSeconds: currentReadSeconds + seconds,
        verifiedSessions: currentVerifiedSessions + 1,
        lastReadAt: safeDateNow(),
        lastVerificationScore: report.score,
      })

      toast.success(`บันทึกการอ่านเสร็จสมบูรณ์! (+${sessionGems} 💎) คะแนนยืนยันการเรียนรู้: ${report.score}/100`)
      resetTimer()
      setActiveBook(null)
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
          <style dangerouslySetInnerHTML={{
            __html: `
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
                    <TimerPanel
            seconds={seconds}
            displayTimer={displayTimer}
            startPage={startPage}
            setStartPage={setStartPage}
            endPage={endPage}
            setEndPage={setEndPage}
            reflection={reflection}
            setReflection={setReflection}
            saving={saving}
            saveReadingProgress={saveReadingProgress}
            MIN_VERIFIED_SECONDS={MIN_VERIFIED_SECONDS}
            MIN_REFLECTION_CHARS={MIN_REFLECTION_CHARS}
          />

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
    <ReadingDashboard
      showTutorial={showTutorial} setShowTutorial={setShowTutorial}
      readingTab={readingTab} setReadingTab={setReadingTab}
      myActiveBooks={myActiveBooks} myFinishedBooks={myFinishedBooks}
      showAddForm={showAddForm} setShowAddForm={setShowAddForm}
      addMode={addMode} setAddMode={setAddMode}
      selectedBookToAdd={selectedBookToAdd} setSelectedBookToAdd={setSelectedBookToAdd}
      books={books} addNewBookToShelf={addNewBookToShelf}
      customBookTitle={customBookTitle} setCustomBookTitle={setCustomBookTitle}
      customBookAuthor={customBookAuthor} setCustomBookAuthor={setCustomBookAuthor}
      customBookUrl={customBookUrl} setCustomBookUrl={setCustomBookUrl}
      customBookDesc={customBookDesc} setCustomBookDesc={setCustomBookDesc}
      customBookTotalPages={customBookTotalPages} setCustomBookTotalPages={setCustomBookTotalPages}
      customBookFile={customBookFile} setCustomBookFile={setCustomBookFile}
      uploadingExternal={uploadingExternal} addCustomBookToShelf={addCustomBookToShelf}
      searchQ={searchQ} setSearchQ={setSearchQ}
      filteredActiveBooks={filteredActiveBooks} filteredFinishedBooks={filteredFinishedBooks}
      startReadingSession={startReadingSession}
      markFinished={markFinished}
      removeShelfItem={removeShelfItem}
      stats={stats}
      hasConfiguredNotif={hasConfiguredNotif}
      notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled}
      notifTime={notifTime} setNotifTime={setNotifTime}
      saveNotifSettings={saveNotifSettings}
      streakSettings={streakSettings}
      streak={streak}
      todayKey={todayKey()}
      todaySeconds={todaySeconds} goalPercent={goalPercent}
      DAILY_READING_GOAL_MINUTES={DAILY_READING_GOAL_MINUTES}
      showShop={showShop} setShowShop={setShowShop}
      inventory={inventory} setInventory={setInventory}
      useFreeze={useFreeze} useLeave={useLeave}
      missionStatus={missionStatus} handleClaimMission={handleClaimMission}
      activeQuizShelfItem={activeQuizShelfItem} setActiveQuizShelfItem={setActiveQuizShelfItem} handleQuizSubmit={handleQuizSubmit}
    />
  );
}
