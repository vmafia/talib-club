import { useEffect, useMemo, useRef, useState } from "react"
import toast from 'react-hot-toast'
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { ARTICLES, BOOKS } from "../data/index.js"
import { useContentCollection } from "../lib/contentStore.js"
import { storage } from "../lib/firebase.js"
import { confirmAction } from "../utils/feedback.jsx"
import Quran from "./Quran.jsx"

export default function MemberDashboard({ authState, go, initialView = "overview", ctx }) {
  const [view, setCurrentView] = useState("overview")
  const [copied, setCopied] = useState("")
  const [quranSura, setQuranSura] = useState(1)
  const [quranAyah, setQuranAyah] = useState(null)
  
  const user = authState?.user
  const profile = authState?.profile || {}
  const name = profile.displayName || user?.displayName || user?.email || "สมาชิก"
  const role = profile.role || "member"

  useEffect(() => {
    if (initialView) setCurrentView(initialView)
    
    const searchParams = new URLSearchParams(window.location.search)
    const sura = searchParams.get("sura") || ctx?.sura
    const ayah = searchParams.get("ayah") || ctx?.ayah
    if (sura) setQuranSura(Number(sura))
    if (ayah) setQuranAyah(Number(ayah))
    else if (initialView !== "quran" && view !== "quran") setQuranAyah(null)
  }, [initialView, ctx])

  const setView = (newView) => {
    if (newView === "quran") {
      go("quran", { sura: quranSura, ayah: quranAyah })
    } else {
      go("member", { view: newView })
    }
  }

  async function copyText(label, value) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      toast.success("คัดลอกข้อความแล้ว")
      window.setTimeout(() => setCopied(""), 1800)
    } catch (err) {
      toast.error("คัดลอกไม่สำเร็จ")
      setCopied("")
    }
  }

  const handleLogout = async () => {
    const ok = await confirmAction({
      title: "ออกจากระบบ?",
      message: "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
      confirmText: "ออกจากระบบ",
      danger: true
    });
    if (!ok) return;
    const toastId = toast.loading("กำลังออกจากระบบ...");
    setTimeout(async () => {
      try {
        if (authState?.logout) await authState.logout();
        toast.success("ออกจากระบบสำเร็จ", { id: toastId });
        window.location.href = "/";
      } catch (error) {
        toast.error("เกิดข้อผิดพลาดในการออกจากระบบ", { id: toastId });
      }
    }, 600);
  };

  return (
    <div className="member-page">
      {view === "overview" && (
        <div className="member-hero">
          <div>
            <span className="badge badge-teal">{role === "staff" ? "Staff" : "Member"}</span>
            <h1>ยินดีต้อนรับ, {name}</h1>
            <p>พื้นที่สมาชิกสำหรับติดตามการอ่าน บันทึกหนังสือ และจัดการข้อมูลบัญชี Talib Club</p>
          </div>
          <div className="member-actions">
            <button className="btn btn-outline" onClick={handleLogout}>
              <i className="ti ti-logout" style={{ marginRight: 6 }}></i>ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {view === "overview" && (
        <Overview 
          authState={authState} 
          go={go} 
          setView={setView} 
          onOpenQuran={(sura, ayah) => {
            go("quran", { sura: sura || 1, ayah: ayah || null })
          }}
          onOpenSavedVerses={() => setView("saved-verses")}
        />
      )}
      {view === "saved-articles" && <SavedArticlesPanel authState={authState} go={go} setView={setView} />}
      {view === "bookshelf" && <BookshelfPanel authState={authState} go={go} setView={setView} />}
      {view === "profile" && <ProfilePanel authState={authState} copied={copied} copyText={copyText} go={go} setView={setView} />}
      {view === "quran" && (
        <div style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
          <button 
            onClick={() => setView("overview")} 
            className="sec-link" 
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
          >
            <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
          </button>
          <Quran 
            initialSura={quranSura} 
            initialAyah={quranAyah} 
            authState={authState}
          />
        </div>
      )}
      {view === "saved-verses" && (
        <SavedVersesPanel 
          authState={authState} 
          go={go} 
          setView={setView} 
          setQuranSura={setQuranSura}
          setQuranAyah={setQuranAyah}
        />
      )}
    </div>
  )
}

function Overview({ authState, go, setView, onOpenQuran, onOpenSavedVerses }) {
  const [lastRead, setLastRead] = useState(null)
  const uid = authState?.user?.uid
  const { items: readingSessions } = useContentCollection("reading_sessions", [])
  const { items: streakRecords, saveItem: saveStreakSettings } = useContentCollection("reading_streaks", [])

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
    toast.success(isLeave ? "บันทึกวันลากิจแล้ว streak ยังปลอดภัย" : "ใช้น้ำแข็งคุ้มครอง streak วันนี้แล้ว")
  }

  useEffect(() => {
    try {
      const local = localStorage.getItem("quran-last-read")
      if (local) {
        setLastRead(JSON.parse(local))
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  return (
    <div>
      <ReadingStreakPanel
        streak={streak}
        settings={streakSettings}
        todaySeconds={todaySeconds}
        goalPercent={goalPercent}
        onRead={() => setView("bookshelf")}
        onFreeze={() => protectToday("freeze")}
        onLeave={() => protectToday("leave")}
      />

      {lastRead && (
        <div className="card" style={{ 
          padding: "16px 20px", 
          marginBottom: 20, 
          background: "var(--teal-bg)", 
          borderColor: "rgba(45, 190, 160, 0.2)",
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          textAlign: "left"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--br)", flexShrink: 0 }}>
              <i className="ti ti-flag-2" style={{ color: "var(--teal)", fontSize: 16 }}></i>
            </div>
            <div>
              <span style={{ fontSize: 11, color: "var(--t2)", display: "block" }}>อ่านอัลกุรอานค้างไว้ล่าสุด</span>
              <strong style={{ fontSize: 13, color: "var(--text)" }}>ซูเราะฮ์ {lastRead.suraName} ({lastRead.suraThaiName}) อายะฮ์ที่ {lastRead.aya}</strong>
            </div>
          </div>
          <button 
            className="btn btn-teal" 
            style={{ padding: "6px 16px", fontSize: 12 }}
            onClick={() => onOpenQuran(lastRead.sura, lastRead.aya)}
          >
            อ่านต่อล่าสุด <i className="ti ti-arrow-right" style={{ marginLeft: 4 }}></i>
          </button>
        </div>
      )}

      <div className="grid3">
        <DashboardCard icon="ti-user-circle" title="โปรไฟล์ของฉัน" text="จัดการข้อมูลบัญชี" onClick={() => setView("profile")} />
        <DashboardCard icon="ti-book" title="อัลกุรอานของฉัน" text="เปิดอ่าน แปลไทย ตัฟซีรย่อ และค้นหาคำสำคัญ" onClick={() => onOpenQuran(1, null)} />
        <DashboardCard icon="ti-notebook" title="อายะฮ์ที่บันทึกไว้" text="ข้อคิดและประโยชน์ที่ได้รับจากอัลกุรอาน" onClick={onOpenSavedVerses} />
        <DashboardCard icon="ti-book-2" title="ชั้นหนังสือของฉัน" text="เพิ่มหนังสือจากเว็บหรือไฟล์นอก แล้วบันทึกเซสชันอ่านจริง" onClick={() => setView("bookshelf")} />
        <DashboardCard icon="ti-flame" title={`${streak.current} วันต่อเนื่อง`} text={`ดีที่สุด ${streak.best} วัน · อ่านจริง ${streak.totalDays} วัน · คุ้มครอง ${streak.protectedTotal} วัน`} onClick={() => setView("bookshelf")} />
        <DashboardCard 
          icon="ti-bookmark" 
          title="บทความที่บันทึกไว้" 
          text="เก็บบทความที่อยากกลับมาอ่านภายหลัง" 
          onClick={() => setView("saved-articles")} 
        />
      </div>
    </div>
  )
}

function ReadingStreakPanel({ streak, settings, todaySeconds, goalPercent, onRead, onFreeze, onLeave }) {
  const protectedLabel = streak.todayProtected?.type === "leave" ? "ลากิจ" : streak.todayProtected ? "น้ำแข็ง" : ""
  const statusText = streak.todayVerified
    ? "วันนี้อ่านจริงแล้ว ไฟยังต่อเนื่อง"
    : protectedLabel
      ? `วันนี้ใช้${protectedLabel}คุ้มครอง streak`
      : "อ่านอย่างน้อยวันละนิดเพื่อรักษาไฟ"

  return (
    <section className="card streak-panel">
      <div className="streak-flame">
        <i className="ti ti-flame"></i>
      </div>
      <div className="streak-main">
        <span className="badge badge-teal">Daily reading streak</span>
        <h2>{streak.current} วันต่อเนื่อง</h2>
        <p>{statusText} · เป้าหมายวันนี้ {formatReadingMinutes(todaySeconds)}/{DAILY_READING_GOAL_MINUTES} นาที</p>
        <div className="streak-progress" aria-label="reading goal progress">
          <span style={{ width: `${goalPercent}%` }}></span>
        </div>
      </div>
      <div className="streak-actions">
        <button className="btn btn-teal" onClick={onRead}>
          <i className="ti ti-player-play" style={{ marginRight: 6 }}></i>เริ่มอ่าน
        </button>
        <button className="btn btn-outline" onClick={onFreeze} disabled={streak.todayVerified || streak.todayProtected || settings.freezeCredits <= 0}>
          <i className="ti ti-snowflake" style={{ marginRight: 6 }}></i>น้ำแข็ง {settings.freezeCredits}
        </button>
        <button className="btn btn-outline" onClick={onLeave} disabled={streak.todayVerified || streak.todayProtected || settings.leaveCredits <= 0}>
          <i className="ti ti-calendar-pause" style={{ marginRight: 6 }}></i>ลากิจ {settings.leaveCredits}
        </button>
      </div>
    </section>
  )
}

// แผงแสดงผลบทความบุ๊กมาร์กจริงจากคอลเลกชันใน Firestore พร้อมระบบกรองข้อมูลและค้นหาขั้นสูง
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const CATEGORY_MAP = {
  aqeedah: "อากีดะฮ์",
  fiqh: "ฟิกฮ์",
  seerah: "ซีเราะฮ์",
  hadith: "ฮะดีษ",
  social: "สังคมศาสตร์",
  tafsir: "ตัฟซีร"
};

const TYPE_MAP = {
  series: "ซีรีส์",
  general: "บทความทั่วไป",
  specific: "บทความเฉพาะเรื่อง",
  social: "สังคมศาสตร์"
};

function getArticleMonthString(dateStr) {
  if (!dateStr) return "ไม่ระบุเวลา";
  const parts = dateStr.split("-");
  if (parts.length >= 2) {
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    if (m >= 0 && m < 12) {
      return `${THAI_MONTHS[m]} ${y}`;
    }
  }
  return "ไม่ระบุเวลา";
}

function getSavedMonthString(date) {
  if (!date || isNaN(date.getTime())) return "ไม่ระบุเวลา";
  const month = THAI_MONTHS[date.getMonth()];
  const year = date.getFullYear() + 543; // ปี พ.ศ.
  return `${month} ${year}`;
}

function getTimeMs(value) {
  if (!value) return 0
  if (typeof value.toDate === "function") return value.toDate().getTime()
  if (value.seconds) return value.seconds * 1000
  if (typeof value === "number") return value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function getLocalDayKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const ms = getTimeMs(value)
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

const DAILY_READING_GOAL_MINUTES = 10
const MIN_VERIFIED_SECONDS = 180
const MIN_REFLECTION_CHARS = 20
const DEFAULT_FREEZE_CREDITS = 2
const DEFAULT_LEAVE_CREDITS = 1

function normalizeStreakSettings(settings, uid) {
  const protectedDays = Array.isArray(settings?.protectedDays) ? settings.protectedDays : []
  return {
    id: uid,
    uid,
    freezeCredits: Number.isFinite(Number(settings?.freezeCredits)) ? Number(settings.freezeCredits) : DEFAULT_FREEZE_CREDITS,
    leaveCredits: Number.isFinite(Number(settings?.leaveCredits)) ? Number(settings.leaveCredits) : DEFAULT_LEAVE_CREDITS,
    protectedDays,
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

function getShelfBook(item, books) {
  return books.find(book => String(book.id) === String(item.bookId)) || item.customBook || null
}

function getBookFileUrl(item) {
  return item?.book?.fileUrl || item?.customBook?.fileUrl || item?.fileUrl || ""
}

function getProgressFromSession(item, endPage, pagesRead) {
  const totalPages = Number(item.totalPages || item.customBook?.totalPages || 0)
  const currentProgress = Number(item.progress || 0)
  if (totalPages > 0 && Number(endPage || 0) > 0) {
    return Math.min(100, Math.round((Number(endPage) / totalPages) * 100))
  }
  return Math.min(100, currentProgress + Math.max(3, Math.min(12, Number(pagesRead || 1) * 3)))
}

function sanitizeStorageName(name) {
  return String(name || "book.pdf")
    .replace(/[^\w.\-ก-๙]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
}

function compactSessionSummary(sessions) {
  const verified = sessions.filter(item => item.verified)
  const totalSeconds = verified.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0)
  const pages = verified.reduce((sum, item) => sum + Number(item.pagesRead || 0), 0)
  return { verifiedCount: verified.length, totalSeconds, pages }
}

const BOOK_STATUS = [
  { id: "reading", label: "กำลังอ่าน" },
  { id: "finished", label: "อ่านจบแล้ว" },
  { id: "planned", label: "อยากอ่าน" },
]

function BookshelfPanel({ authState, go, setView }) {
  const uid = authState?.user?.uid
  const { items: books } = useContentCollection("books", BOOKS)
  const { items: shelfItems, loading, saveItem, deleteItem } = useContentCollection("bookshelf", [])
  const { items: readingSessions, saveItem: saveReadingSession } = useContentCollection("reading_sessions", [])
  const [bookId, setBookId] = useState("")
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
  const [sessionTarget, setSessionTarget] = useState(null)
  const [quizState, setQuizState] = useState(null)

  const sessionsByShelf = useMemo(() => {
    const map = new Map()
    readingSessions
      .filter(item => item.uid === uid)
      .forEach(item => {
        const key = String(item.shelfItemId || "")
        if (!key) return
        map.set(key, [...(map.get(key) || []), item])
      })
    return map
  }, [readingSessions, uid])

  const myShelf = useMemo(() => {
    return shelfItems
      .filter(item => item.uid === uid)
      .map(item => {
        const itemSessions = sessionsByShelf.get(String(item.id)) || []
        return {
          ...item,
          book: getShelfBook(item, books),
          sessionSummary: compactSessionSummary(itemSessions),
        }
      })
      .filter(item => item.book)
      .sort((a, b) => getTimeMs(b.updatedAt || b.addedAt) - getTimeMs(a.updatedAt || a.addedAt))
  }, [books, sessionsByShelf, shelfItems, uid])

  const availableBooks = useMemo(() => {
    const savedIds = new Set(myShelf.filter(item => item.sourceType !== "external").map(item => String(item.bookId)))
    return books.filter(book => !savedIds.has(String(book.id)))
  }, [books, myShelf])

  const stats = useMemo(() => {
    const finished = myShelf.filter(item => item.status === "finished").length
    const reading = myShelf.filter(item => item.status === "reading").length
    const verifiedSessions = myShelf.reduce((sum, item) => sum + Number(item.sessionSummary?.verifiedCount || 0), 0)
    const totalSeconds = myShelf.reduce((sum, item) => sum + Number(item.sessionSummary?.totalSeconds || 0), 0)
    const avgProgress = myShelf.length
      ? Math.round(myShelf.reduce((sum, item) => sum + Number(item.progress || 0), 0) / myShelf.length)
      : 0
    return { finished, reading, avgProgress, verifiedSessions, totalSeconds }
  }, [myShelf])

  function cleanShelfItem(item) {
    const { book, sessionSummary, ...rest } = item
    return rest
  }

  async function addBook() {
    if (!bookId || !uid) return
    const book = books.find(item => String(item.id) === String(bookId))
    if (!book) return

    await saveItem({
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
    setBookId("")
    toast.success("เพิ่มเข้าชั้นหนังสือแล้ว")
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

      await saveItem({
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
      toast.success("เพิ่มไฟล์นอกเข้าชั้นหนังสือแล้ว")
    } catch (error) {
      console.error(error)
      toast.error("เพิ่มไฟล์นอกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์อัปโหลดหรือใช้ลิงก์ไฟล์แทน")
    } finally {
      setUploadingExternal(false)
    }
  }

  async function updateShelfItem(item, patch) {
    const nextProgress = patch.status === "finished" ? 100 : patch.progress
    await saveItem({
      ...cleanShelfItem(item),
      ...patch,
      progress: nextProgress !== undefined ? Number(nextProgress) : Number(item.progress || 0),
      updatedAt: Date.now(),
    })
  }

  async function removeShelfItem(id) {
    const ok = await confirmAction({
      title: "นำออกจากชั้นหนังสือ?",
      message: "รายการนี้จะถูกลบออกจากชั้นหนังสือของคุณ",
      confirmText: "นำออก",
      danger: true,
    })
    if (!ok) return
    await deleteItem(id)
    toast.success("นำออกจากชั้นหนังสือแล้ว")
  }

  async function finishReadingSession(item, payload) {
    const report = calculateVerificationReport(payload)
    const sessionId = `${uid}_${item.id}_${Date.now()}`
    await saveReadingSession({
      id: sessionId,
      uid,
      shelfItemId: item.id,
      bookId: String(item.bookId),
      bookTitle: item.book.title,
      sourceType: item.sourceType || "library",
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

    if (!report.verified) {
      toast.error(`ยังไม่ผ่านการยืนยัน (${report.score}/100) ลองอ่านให้ครบเวลาและบันทึกข้อคิดเพิ่มอีกนิด`)
      return false
    }

    const nextProgress = getProgressFromSession(item, payload.endPage, report.pagesRead)
    await updateShelfItem(item, {
      progress: nextProgress,
      currentPage: Number(payload.endPage || item.currentPage || 0),
      status: nextProgress >= 100 ? "finished" : "reading",
      totalReadSeconds: Number(item.totalReadSeconds || 0) + Number(payload.activeSeconds || 0),
      verifiedSessions: Number(item.verifiedSessions || 0) + 1,
      lastReadAt: Date.now(),
      lastVerificationScore: report.score,
    })
    toast.success(`อ่านจริงผ่านแล้ว +${formatReadingMinutes(payload.activeSeconds)} · คะแนนยืนยัน ${report.score}/100`)
    return true
  }

  async function startQuiz(item) {
    setQuizState({ item, loading: true, quiz: [], answers: {}, source: "" })
    try {
      const itemSessions = readingSessions.filter(session => session.uid === uid && session.shelfItemId === item.id && session.verified)
      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book: {
            id: item.book.id,
            title: item.book.title,
            author: item.book.author,
            type: item.book.type,
            category: item.book.category,
            desc: item.book.desc,
            note: item.note || "",
            readingEvidence: {
              progress: item.progress || 0,
              verifiedSessions: itemSessions.length,
              totalMinutes: Math.round(itemSessions.reduce((sum, session) => sum + Number(session.activeSeconds || 0), 0) / 60),
              reflections: itemSessions.slice(0, 5).map(session => session.reflection).filter(Boolean),
            },
          },
        }),
      })
      const data = await response.json()
      setQuizState({ item, loading: false, quiz: data.quiz || [], answers: {}, source: data.source || "fallback" })
    } catch (error) {
      console.error(error)
      toast.error("สร้างแบบทดสอบไม่สำเร็จ")
      setQuizState(null)
    }
  }

  function answerQuiz(index, answerIndex) {
    setQuizState(prev => prev ? ({
      ...prev,
      answers: { ...prev.answers, [index]: answerIndex },
    }) : prev)
  }

  async function finishQuiz() {
    if (!quizState?.item) return
    const score = quizState.quiz.reduce((sum, question, index) => {
      return sum + (quizState.answers[index] === question.answerIndex ? 1 : 0)
    }, 0)
    await updateShelfItem(quizState.item, {
      lastQuiz: {
        score,
        total: quizState.quiz.length,
        source: quizState.source,
        takenAt: Date.now(),
      },
    })
    toast.success(`บันทึกคะแนนแล้ว: ${score}/${quizState.quiz.length}`)
    setQuizState(null)
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>
  }

  return (
    <div className="profile-layout" style={{ maxWidth: 980, margin: "0 auto" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "grid", placeItems: "center" }}>
              <i className="ti ti-books" style={{ color: "var(--teal)", fontSize: 20 }}></i>
            </div>
            <div>
              <h2 style={{ fontSize: 18 }}>ชั้นหนังสือของฉัน</h2>
              <p style={{ fontSize: 12, marginTop: 2 }}>เพิ่มหนังสือจากคลังหรือไฟล์นอก แล้วต่อ streak ด้วยเซสชันอ่านจริง</p>
            </div>
          </div>
        </div>

        <div className="profile-stat-grid">
          <div className="card profile-stat-card">
            <div className="profile-stat-icon" style={{ background: "var(--teal-bg)", color: "var(--teal)" }}><i className="ti ti-book-2"></i></div>
            <div><div className="profile-stat-label">กำลังอ่าน</div><div className="profile-stat-value">{stats.reading} เล่ม</div></div>
          </div>
          <div className="card profile-stat-card">
            <div className="profile-stat-icon" style={{ background: "rgba(255,179,0,.12)", color: "rgb(255,179,0)" }}><i className="ti ti-check"></i></div>
            <div><div className="profile-stat-label">อ่านจบแล้ว</div><div className="profile-stat-value">{stats.finished} เล่ม</div></div>
          </div>
          <div className="card profile-stat-card">
            <div className="profile-stat-icon" style={{ background: "rgba(59,115,196,.14)", color: "#6ba0ff" }}><i className="ti ti-chart-dots"></i></div>
            <div><div className="profile-stat-label">ความคืบหน้าเฉลี่ย</div><div className="profile-stat-value">{stats.avgProgress}%</div></div>
          </div>
          <div className="card profile-stat-card">
            <div className="profile-stat-icon" style={{ background: "rgba(167,139,250,.14)", color: "#a78bfa" }}><i className="ti ti-shield-check"></i></div>
            <div><div className="profile-stat-label">อ่านจริงที่ยืนยันแล้ว</div><div className="profile-stat-value">{stats.verifiedSessions} ครั้ง · {formatReadingMinutes(stats.totalSeconds)}</div></div>
          </div>
        </div>

        <div className="bookshelf-add-panel">
          <div className="reader-control" style={{ marginBottom: 12 }}>
            <button className={`reader-btn ${addMode === "library" ? "on" : ""}`} onClick={() => setAddMode("library")}>จากคลังเว็บ</button>
            <button className={`reader-btn ${addMode === "external" ? "on" : ""}`} onClick={() => setAddMode("external")}>ไฟล์/ลิงก์นอก</button>
          </div>

          {addMode === "library" ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
              <select value={bookId} onChange={event => setBookId(event.target.value)}>
                <option value="">เลือกหนังสือเพื่อเพิ่มเข้าชั้น</option>
                {availableBooks.map(book => (
                  <option key={book.id} value={book.id}>{book.title}</option>
                ))}
              </select>
              <button className="btn btn-teal" onClick={addBook} disabled={!bookId}>เพิ่ม</button>
            </div>
          ) : (
            <div className="bookshelf-external-form">
              <input value={externalBook.title} onChange={event => setExternalBook(prev => ({ ...prev, title: event.target.value }))} placeholder="ชื่อหนังสือหรือไฟล์" />
              <input value={externalBook.author} onChange={event => setExternalBook(prev => ({ ...prev, author: event.target.value }))} placeholder="ผู้เขียน/แหล่งที่มา (ไม่บังคับ)" />
              <input value={externalBook.fileUrl} onChange={event => setExternalBook(prev => ({ ...prev, fileUrl: event.target.value }))} placeholder="ลิงก์ PDF / Google Drive / แหล่งอ่านออนไลน์" />
              <input type="number" min="0" value={externalBook.totalPages} onChange={event => setExternalBook(prev => ({ ...prev, totalPages: event.target.value }))} placeholder="จำนวนหน้าทั้งหมด (ถ้ารู้)" />
              <textarea value={externalBook.desc} onChange={event => setExternalBook(prev => ({ ...prev, desc: event.target.value }))} placeholder="คำอธิบายสั้น ๆ หรือเป้าหมายการอ่าน" style={{ minHeight: 70 }} />
              <label className="bookshelf-file-input">
                <i className="ti ti-upload"></i>
                <span>{externalBook.file ? externalBook.file.name : "อัปโหลดไฟล์จากเครื่อง (PDF/เอกสาร)"}</span>
                <input type="file" accept=".pdf,.epub,.doc,.docx,.txt,image/*" onChange={event => setExternalBook(prev => ({ ...prev, file: event.target.files?.[0] || null }))} />
              </label>
              <button className="btn btn-teal" onClick={addExternalBook} disabled={uploadingExternal}>
                <i className={`ti ${uploadingExternal ? "ti-loader-2 spin" : "ti-plus"}`} style={{ marginRight: 6 }}></i>
                {uploadingExternal ? "กำลังเพิ่ม..." : "เพิ่มไฟล์นอก"}
              </button>
            </div>
          )}
        </div>

        {myShelf.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>ยังไม่มีหนังสือในชั้น เลือกหนังสือด้านบนเพื่อเริ่มติดตามได้เลย</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {myShelf.map(item => (
              <div key={item.id} className="card bookshelf-item" style={{ padding: 16, boxShadow: "none", background: "var(--bg2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 15, lineHeight: 1.45 }}>{item.book.title}</h3>
                    <p style={{ fontSize: 12, marginTop: 2 }}>{item.book.author} · {item.book.type} · อ่านจริง {item.sessionSummary.verifiedCount} ครั้ง</p>
                    {item.sourceType === "external" && <span className="tag tag-teal" style={{ marginTop: 6 }}>ไฟล์นอกของสมาชิก</span>}
                  </div>
                  <button className="btn btn-teal" style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }} onClick={() => setSessionTarget(item)}>
                    <i className="ti ti-player-play" style={{ marginRight: 4 }}></i>เริ่มอ่าน
                  </button>
                  {(item.status === "finished" || Number(item.progress || 0) >= 80) && (
                    <button className="btn btn-teal" style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }} onClick={() => startQuiz(item)}>
                      <i className="ti ti-sparkles" style={{ marginRight: 4 }}></i>Quiz
                    </button>
                  )}
                  <button className="btn btn-outline" style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }} onClick={() => {
                    if (item.sourceType === "external" && getBookFileUrl(item)) window.open(getBookFileUrl(item), "_blank", "noopener,noreferrer")
                    else go("library-detail", item.book)
                  }}>
                    เปิด
                  </button>
                </div>

                <div className="bookshelf-progress">
                  <div>
                    <span>ความคืบหน้า</span>
                    <strong>{Number(item.progress || 0)}%</strong>
                  </div>
                  <div className="streak-progress"><span style={{ width: `${Number(item.progress || 0)}%` }}></span></div>
                  <div>
                    <span>เวลาที่ผ่านการยืนยัน</span>
                    <strong>{formatReadingMinutes(item.sessionSummary.totalSeconds)}</strong>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr) 110px auto", gap: 10, alignItems: "center", marginTop: 12 }}>
                  <select value={item.status || "reading"} onChange={event => updateShelfItem(item, { status: event.target.value })}>
                    {BOOK_STATUS.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
                  </select>
                  <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--t2)" }}>
                    <span>หน้าปัจจุบัน</span>
                    <input
                      type="number"
                      min="0"
                      value={Number(item.currentPage || 0)}
                      onChange={event => updateShelfItem(item, { currentPage: Number(event.target.value || 0) })}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--t2)" }}>
                    <span>จำนวนหน้า</span>
                    <input
                      type="number"
                      min="0"
                      value={Number(item.totalPages || item.customBook?.totalPages || 0)}
                      onChange={event => updateShelfItem(item, { totalPages: Number(event.target.value || 0) })}
                    />
                  </label>
                  <button className="btn btn-outline" style={{ padding: "7px 10px", fontSize: 11, color: "#e05555" }} onClick={() => removeShelfItem(item.id)}>
                    ลบ
                  </button>
                </div>

                <textarea
                  value={item.note || ""}
                  placeholder="บันทึกข้อคิดหรือหน้าที่อ่านค้างไว้..."
                  onChange={event => updateShelfItem(item, { note: event.target.value })}
                  style={{ marginTop: 12, minHeight: 70 }}
                />
                {item.lastQuiz && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--teal)", background: "var(--teal-bg)", padding: "8px 10px", borderRadius: 8 }}>
                    คะแนน Quiz ล่าสุด {item.lastQuiz.score}/{item.lastQuiz.total} · {item.lastQuiz.source || "AI"}
                  </div>
                )}
                {item.lastVerificationScore && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--t2)" }}>
                    คะแนนยืนยันการอ่านล่าสุด {item.lastVerificationScore}/100 · หน้าล่าสุด {item.currentPage || 0}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {quizState && (
        <QuizModal
          quizState={quizState}
          onAnswer={answerQuiz}
          onClose={() => setQuizState(null)}
          onFinish={finishQuiz}
        />
      )}
      {sessionTarget && (
        <ReadingSessionModal
          item={sessionTarget}
          onClose={() => setSessionTarget(null)}
          onFinish={async payload => {
            const ok = await finishReadingSession(sessionTarget, payload)
            if (ok) setSessionTarget(null)
          }}
        />
      )}
    </div>
  )
}

function ReadingSessionModal({ item, onClose, onFinish }) {
  const initialStart = Math.max(1, Number(item.currentPage || 0) + 1)
  const [startedAt] = useState(() => Date.now())
  const [activeSeconds, setActiveSeconds] = useState(0)
  const [inactiveSeconds, setInactiveSeconds] = useState(0)
  const [startPage, setStartPage] = useState(String(initialStart))
  const [endPage, setEndPage] = useState(String(initialStart))
  const [reflection, setReflection] = useState("")
  const [saving, setSaving] = useState(false)
  const activeRef = useRef(true)

  useEffect(() => {
    const refreshActivity = () => {
      activeRef.current = document.visibilityState === "visible" && document.hasFocus()
    }
    refreshActivity()
    window.addEventListener("focus", refreshActivity)
    window.addEventListener("blur", refreshActivity)
    document.addEventListener("visibilitychange", refreshActivity)
    const timer = window.setInterval(() => {
      if (activeRef.current) setActiveSeconds(value => value + 1)
      else setInactiveSeconds(value => value + 1)
    }, 1000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshActivity)
      window.removeEventListener("blur", refreshActivity)
      document.removeEventListener("visibilitychange", refreshActivity)
    }
  }, [])

  const report = calculateVerificationReport({ activeSeconds, inactiveSeconds, startPage, endPage, reflection })
  const fileUrl = getBookFileUrl(item)
  const checks = [
    { label: `อ่านแบบ active อย่างน้อย ${Math.round(MIN_VERIFIED_SECONDS / 60)} นาที`, ok: activeSeconds >= MIN_VERIFIED_SECONDS },
    { label: "ระบุหน้าที่อ่านอย่างน้อย 1 หน้า", ok: report.pagesRead > 0 },
    { label: `บันทึกข้อคิดอย่างน้อย ${MIN_REFLECTION_CHARS} ตัวอักษร`, ok: reflection.trim().length >= MIN_REFLECTION_CHARS },
    { label: "โฟกัสอยู่กับหน้าอ่านเป็นส่วนใหญ่", ok: report.focusRatio >= 0.65 },
  ]

  async function submit() {
    setSaving(true)
    try {
      await onFinish({
        startedAt,
        activeSeconds,
        inactiveSeconds,
        startPage: Number(startPage || 0),
        endPage: Number(endPage || 0),
        reflection,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div className="card" style={{ maxWidth: 780, maxHeight: "90vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <span className="badge badge-teal">Verified reading session</span>
            <h2 style={{ fontSize: 20, marginTop: 8 }}>อ่านจริงเพื่อรักษา streak</h2>
            <p style={{ fontSize: 12, marginTop: 4 }}>{item.book?.title}</p>
          </div>
          <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={onClose}>ปิด</button>
        </div>

        <div className="reading-session-grid">
          <div className="reading-session-score">
            <strong>{report.score}/100</strong>
            <span>{report.verified ? "พร้อมบันทึกเป็นอ่านจริง" : "ยังต้องอ่าน/จดเพิ่ม"}</span>
            <div className="streak-progress"><span style={{ width: `${report.score}%` }}></span></div>
          </div>
          <div className="reading-session-timer">
            <div><span>เวลา active</span><strong>{formatReadingMinutes(activeSeconds)}</strong></div>
            <div><span>เวลาหลุดโฟกัส</span><strong>{formatReadingMinutes(inactiveSeconds)}</strong></div>
          </div>
        </div>

        {fileUrl && (
          <a className="btn btn-outline" href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
            <i className="ti ti-external-link"></i>เปิดไฟล์อ่านคู่กับตัวจับเวลา
          </a>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <label style={fieldStyle}>
            <span>เริ่มหน้า</span>
            <input type="number" min="1" value={startPage} onChange={event => setStartPage(event.target.value)} />
          </label>
          <label style={fieldStyle}>
            <span>ถึงหน้า</span>
            <input type="number" min="1" value={endPage} onChange={event => setEndPage(event.target.value)} />
          </label>
        </div>

        <label style={fieldStyle}>
          <span>ข้อคิด/สรุปจากที่อ่าน</span>
          <textarea value={reflection} onChange={event => setReflection(event.target.value)} placeholder="เขียนสรุปสั้น ๆ ว่าอ่านเรื่องอะไร ได้ข้อคิดอะไร หรือมีประเด็นไหนอยากกลับมาทบทวน..." style={{ minHeight: 110 }} />
        </label>

        <div className="reading-checklist">
          {checks.map(check => (
            <div key={check.label} className={check.ok ? "ok" : ""}>
              <i className={`ti ${check.ok ? "ti-circle-check" : "ti-circle"}`}></i>
              <span>{check.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <p style={{ fontSize: 12 }}>ระบบจะเพิ่ม progress และต่อ streak เฉพาะเซสชันที่ผ่านการยืนยันเท่านั้น</p>
          <button className="btn btn-teal" disabled={saving} onClick={submit}>
            <i className={`ti ${saving ? "ti-loader-2 spin" : "ti-shield-check"}`} style={{ marginRight: 6 }}></i>
            {saving ? "กำลังบันทึก..." : "บันทึกเซสชัน"}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuizModal({ quizState, onAnswer, onClose, onFinish }) {
  const answered = Object.keys(quizState.answers || {}).length
  const score = quizState.quiz.reduce((sum, question, index) => {
    return sum + (quizState.answers[index] === question.answerIndex ? 1 : 0)
  }, 0)
  const done = quizState.quiz.length > 0 && answered === quizState.quiz.length
  const difficultyLabels = { easy: "ง่าย", medium: "กลาง", hard: "ท้าทาย" }
  const sourceLabel = quizState.source === "openai"
    ? "OpenAI"
    : quizState.source === "anthropic"
      ? "Anthropic"
      : "โหมดสำรอง"

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div className="card" style={{ maxWidth: 760, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <span className="badge badge-teal">{sourceLabel}</span>
            <h2 style={{ fontSize: 20, marginTop: 8 }}>Quiz หลังอ่านจบ</h2>
            <p style={{ fontSize: 12, marginTop: 4 }}>{quizState.item?.book?.title} · {quizState.quiz.length || 20} ข้อคละความยาก</p>
          </div>
          <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={onClose}>ปิด</button>
        </div>

        {quizState.loading ? (
          <div className="empty" style={{ padding: "38px 0" }}>
            <i className="ti ti-loader-2 spin" style={{ color: "var(--teal)", fontSize: 24, display: "block", marginBottom: 10 }}></i>
            กำลังสร้างแบบทดสอบจาก AI...
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 14 }}>
              {quizState.quiz.map((question, qIndex) => {
                const selected = quizState.answers[qIndex]
                const hasAnswered = selected !== undefined
                return (
                  <div key={qIndex} className="card" style={{ padding: 14, background: "var(--bg2)", boxShadow: "none" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <h3 style={{ fontSize: 14, lineHeight: 1.55 }}>{qIndex + 1}. {question.question}</h3>
                      <span className="tag tag-acc" style={{ flexShrink: 0 }}>{difficultyLabels[question.difficulty] || "กลาง"}</span>
                    </div>
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {question.options.map((option, optionIndex) => {
                        const isCorrect = hasAnswered && optionIndex === question.answerIndex
                        const isWrong = hasAnswered && selected === optionIndex && selected !== question.answerIndex
                        return (
                          <button
                            key={optionIndex}
                            className="btn btn-outline"
                            onClick={() => onAnswer(qIndex, optionIndex)}
                            style={{
                              borderRadius: 10,
                              textAlign: "left",
                              justifyContent: "flex-start",
                              background: isCorrect ? "var(--teal-bg)" : isWrong ? "rgba(224,85,85,.12)" : "var(--card)",
                              color: isWrong ? "#ff8a8a" : "var(--text)",
                            }}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                    {hasAnswered && (
                      <p style={{ fontSize: 12, marginTop: 10, color: "var(--t2)" }}>{question.explanation}</p>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>คะแนนตอนนี้ {score}/{quizState.quiz.length}</strong>
              <button className="btn btn-teal" disabled={!done} onClick={onFinish}>บันทึกคะแนน</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SavedArticlesPanel({ authState, go, setView }) {
  const { items: articles, loading: loadingArticles } = useContentCollection("articles", ARTICLES)
  const { items: bookmarks, loading: loadingBookmarks } = useContentCollection("bookmarks", [])
  
  const uid = authState?.user?.uid;

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [authorFilter, setAuthorFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState("all")
  const [sortBy, setSortBy] = useState("newest_saved")

  const savedArticlesWithBookmarkInfo = useMemo(() => {
    if (!uid) return [];
    const userBookmarks = bookmarks.filter(b => b.uid === uid);
    
    return userBookmarks.map(b => {
      const art = articles.find(a => String(a.id) === String(b.articleId));
      if (!art) return null;
      
      let savedAtDate = null;
      if (b.savedAt) {
        if (b.savedAt.toDate) {
          savedAtDate = b.savedAt.toDate();
        } else if (b.savedAt.seconds) {
          savedAtDate = new Date(b.savedAt.seconds * 1000);
        } else {
          savedAtDate = new Date(b.savedAt);
        }
      }
      
      const savedMonthStr = savedAtDate ? getSavedMonthString(savedAtDate) : getArticleMonthString(art.date);
      
      return {
        ...art,
        bookmarkId: b.id,
        savedAtDate,
        savedMonthStr
      };
    }).filter(Boolean);
  }, [articles, bookmarks, uid])

  const categories = useMemo(() => {
    const cats = new Set(savedArticlesWithBookmarkInfo.map(a => a.category).filter(Boolean));
    return Array.from(cats);
  }, [savedArticlesWithBookmarkInfo]);

  const authors = useMemo(() => {
    const auts = new Set(savedArticlesWithBookmarkInfo.map(a => a.author).filter(Boolean));
    return Array.from(auts);
  }, [savedArticlesWithBookmarkInfo]);

  const types = useMemo(() => {
    const typs = new Set(savedArticlesWithBookmarkInfo.map(a => a.type).filter(Boolean));
    return Array.from(typs);
  }, [savedArticlesWithBookmarkInfo]);

  const months = useMemo(() => {
    const mths = new Set(savedArticlesWithBookmarkInfo.map(a => a.savedMonthStr).filter(Boolean));
    return Array.from(mths).sort((a, b) => b.localeCompare(a));
  }, [savedArticlesWithBookmarkInfo]);

  const filteredArticles = useMemo(() => {
    let result = [...savedArticlesWithBookmarkInfo];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a => 
        a.title.toLowerCase().includes(q) ||
        (a.excerpt && a.excerpt.toLowerCase().includes(q)) ||
        (a.author && a.author.toLowerCase().includes(q)) ||
        (a.tags && a.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter(a => a.category === categoryFilter);
    }

    if (authorFilter !== "all") {
      result = result.filter(a => a.author === authorFilter);
    }

    if (typeFilter !== "all") {
      result = result.filter(a => a.type === typeFilter);
    }

    if (monthFilter !== "all") {
      result = result.filter(a => a.savedMonthStr === monthFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "newest_saved") {
        const timeA = a.savedAtDate ? a.savedAtDate.getTime() : 0;
        const timeB = b.savedAtDate ? b.savedAtDate.getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === "oldest_saved") {
        const timeA = a.savedAtDate ? a.savedAtDate.getTime() : 0;
        const timeB = b.savedAtDate ? b.savedAtDate.getTime() : 0;
        return timeA - timeB;
      }
      if (sortBy === "newest_article") {
        return b.date.localeCompare(a.date);
      }
      if (sortBy === "oldest_article") {
        return a.date.localeCompare(b.date);
      }
      return 0;
    });

    return result;
  }, [savedArticlesWithBookmarkInfo, search, categoryFilter, authorFilter, typeFilter, monthFilter, sortBy]);

  const hasActiveFilters = search || categoryFilter !== "all" || authorFilter !== "all" || typeFilter !== "all" || monthFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setAuthorFilter("all");
    setTypeFilter("all");
    setMonthFilter("all");
    setSortBy("newest_saved");
  };

  if (loadingArticles || loadingBookmarks) return <div style={{textAlign: "center", padding: 40}}><i className="ti ti-loader-2 spin" style={{fontSize: 24, color: "var(--teal)"}}></i></div>

  return (
    <div className="profile-layout" style={{ maxWidth: 720, margin: "0 auto" }}>
      <button 
        onClick={() => setView("overview")} 
        className="sec-link" 
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
             <i className="ti ti-bookmark-filled" style={{ color: "var(--teal)", fontSize: 20 }}></i>
           </div>
           <div>
             <h2 style={{ fontSize: 18 }}>บทความที่บันทึกไว้</h2>
             <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{filteredArticles.length} รายการ จากทั้งหมด {savedArticlesWithBookmarkInfo.length} รายการ</p>
           </div>
        </div>

        {savedArticlesWithBookmarkInfo.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>คุณยังไม่ได้บันทึกบทความใดๆ ไว้เลย</div>
        ) : (
          <>
            {/* ส่วนค้นหาและตัวกรอง */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: "0.5px solid var(--br2)" }}>
              {/* แถบหลัก: ค้นหาและเรียงลำดับ */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
                  <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 14 }}></i>
                  <input 
                    placeholder="ค้นหาชื่อบทความ, ผู้เขียน, หรือคำสำคัญ..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    style={{ paddingLeft: 36, width: "100%", height: 38 }} 
                  />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select 
                    value={sortBy} 
                    onChange={e => setSortBy(e.target.value)} 
                    style={{ padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 38 }}
                  >
                    <option value="newest_saved">บันทึกล่าสุด</option>
                    <option value="oldest_saved">บันทึกเก่าสุด</option>
                    <option value="newest_article">บทความใหม่สุด</option>
                    <option value="oldest_article">บทความเก่าสุด</option>
                  </select>
                  {hasActiveFilters && (
                    <button className="btn btn-outline" onClick={clearFilters} style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, height: 38, borderRadius: 8 }}>
                      <i className="ti ti-rotate-clockwise"></i> ล้างตัวกรอง
                    </button>
                  )}
                </div>
              </div>

              {/* ตัวกรองย่อยเพิ่มเติม */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>หมวดหมู่</label>
                  <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทั้งหมด</option>
                    {categories.map(c => <option key={c} value={c}>{CATEGORY_MAP[c] || c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>ประเภท</label>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทุกประเภท</option>
                    {types.map(t => <option key={t} value={t}>{TYPE_MAP[t] || t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>ผู้เขียน</label>
                  <select value={authorFilter} onChange={e => setAuthorFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทุกคน</option>
                    {authors.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>เดือนที่บันทึก</label>
                  <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทุกช่วงเวลา</option>
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {filteredArticles.length === 0 ? (
              <div className="empty" style={{ padding: "40px 0" }}>ไม่พบรายการที่ตรงกับตัวกรองที่เลือก</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
                {filteredArticles.map(a => (
                  <div key={a.id} className="card" style={{ cursor: "pointer", padding: 16, display: "flex", flexDirection: "column" }} onClick={() => go("article", a)}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                      <span className="tag tag-teal">{CATEGORY_MAP[a.category] || a.category}</span>
                      <span className="tag tag-acc">{TYPE_MAP[a.type] || a.type}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 8, lineHeight: 1.45 }}>{a.title}</div>
                    <div style={{ marginTop: "auto", fontSize: 11, color: "var(--t3)" }}>
                      {a.author} · {a.date}
                      {a.savedAtDate && <div style={{ fontSize: 10, color: "var(--teal)", marginTop: 4 }}><i className="ti ti-bookmark" style={{ marginRight: 2 }}></i>บันทึกเมื่อ: {getSavedMonthString(a.savedAtDate)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ProfilePanel({ authState, copied, copyText, go, setView }) {
  const user = authState?.user
  const profile = authState?.profile || {}
  const role = profile.role || "member"
  const displayName = profile.displayName || user?.displayName || "-"
  const email = user?.email || profile.email || "-"
  const photoURL = user?.photoURL || ""
  const isStaff = role === "staff"

  const [subView, setSubView] = useState("stats") // "stats" or "account"
  
  const [form, setForm] = useState({
    displayName: displayName === "-" ? "" : displayName,
    email,
    currentPassword: "",
    newPassword: "",
  })
  const [busy, setBusy] = useState("")
  
  // 💡 เชื่อมต่อกับคอลเลกชัน history ใน Firestore
  const { items: rawHistory, loading: loadingHistory } = useContentCollection("history", [])
  const { items: savedVerses } = useContentCollection("quran_bookmarks", [])
  const { items: readingSessions } = useContentCollection("reading_sessions", [])
  const { items: streakRecords } = useContentCollection("reading_streaks", [])
  
  const history = useMemo(() => {
    if (!user?.uid) return [];
    return rawHistory
      .filter(h => h.uid === user.uid)
      .sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        return timeB - timeA;
      });
  }, [rawHistory, user?.uid])

  const isGoogleUser = user?.providerData?.some(p => p.providerId === "google.com") || false;

  useEffect(() => {
    setForm({
      displayName: displayName === "-" ? "" : displayName,
      email,
      currentPassword: "",
      newPassword: "",
    })
  }, [displayName, email])

  // ลบโค้ด useEffect ดั้งเดิมที่ดึงประวัติจาก localStorage ออกแล้ว เพราะเปลี่ยนไปดึงจาก Firestore ด้านบนแล้ว

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const stats = useMemo(() => {
    const articlesRead = history.filter(h => h.type === "article").length;
    const booksDownloaded = history.filter(h => h.type === "book").length;
    const mediaWatched = history.filter(h => h.type === "media").length;
    const verifiedSessions = readingSessions.filter(item => item.uid === user?.uid && item.verified)
    const settings = normalizeStreakSettings(streakRecords.find(item => item.uid === user?.uid || item.id === user?.uid), user?.uid)
    const streak = calculateReadingStreak(
      verifiedSessions.map(item => item.dayKey || item.completedAt || item.createdAt),
      settings.protectedDays
    );
    const readingMinutes = Math.round(verifiedSessions.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0) / 60)
    return { articlesRead, booksDownloaded, mediaWatched, streak, verifiedSessions: verifiedSessions.length, readingMinutes };
  }, [history, readingSessions, streakRecords, user?.uid])

  const handleHistoryClick = (h) => {
    const targetId = h.itemId || h.id;
    if (h.type === "article") go("article", { id: targetId });
    else if (h.type === "book") go("library-detail", { id: targetId });
    else if (h.type === "media") go("media-detail", { id: targetId });
  }

  async function saveAccount(e) {
    e.preventDefault()
    setBusy("account")
    
    try {
      // 1. Update Display Name if changed
      if (form.displayName.trim() !== displayName.trim()) {
        if (authState?.updateUserProfile) {
          await authState.updateUserProfile({
            displayName: form.displayName,
          })
        }
        toast.success("อัปเดตชื่อที่แสดงเรียบร้อยแล้ว")
      }

      // 2. Sensitive operations (Email or Password change)
      const emailChanged = form.email.trim().toLowerCase() !== email.trim().toLowerCase();
      const passwordChanged = form.newPassword.trim() !== "";

      if (emailChanged || passwordChanged) {
        if (!isGoogleUser) {
          if (!form.currentPassword.trim()) {
            throw new Error("กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน");
          }
          // Re-authenticate first
          await authState.reauthenticateForSensitiveAction(form.currentPassword);
        } else {
          // If Google user tries to modify email or password somehow (should be disabled anyway)
          throw new Error("ผู้ใช้งานผ่าน Google ไม่จำเป็นต้องเปลี่ยนอีเมลหรือรหัสผ่านที่นี่");
        }

        if (emailChanged) {
          await authState.requestEmailChange(form.email);
          toast.success("ส่งอีเมลยืนยันการเปลี่ยนอีเมลแล้ว กรุณาตรวจสอบอีเมลใหม่ของคุณ");
        }

        if (passwordChanged) {
          await authState.updateUserPassword(form.newPassword);
          toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
        }
      }

      // Reset password fields on success
      set("currentPassword", "")
      set("newPassword", "")
    } catch (err) {
      console.error(err)
      let msg = "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      if (err.code === "auth/wrong-password") {
        msg = "รหัสผ่านปัจจุบันไม่ถูกต้อง";
      } else if (err.message) {
        msg = err.message;
      }
      toast.error(msg);
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="profile-layout" style={{ maxWidth: 720, margin: "0 auto" }}>
      <button 
        onClick={() => setView("overview")} 
        className="sec-link" 
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card profile-card" style={{ padding: 24 }}>
        <div className="profile-head" style={{ marginBottom: 20 }}>
          <div className="profile-avatar" style={{ overflow: "hidden" }}>
            {photoURL ? <img src={photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(displayName, email)}
          </div>
          <div>
            <span className={`badge ${isStaff ? "badge-teal" : "badge-acc"}`}>{isStaff ? "Staff" : "Member"}</span>
            <h2>{displayName}</h2>
            <p>{email}</p>
          </div>
        </div>

        {/* Sub Navigation pills */}
        <div className="profile-tabs">
          <button className={`pill ${subView === "stats" ? "on" : ""}`} onClick={() => setSubView("stats")}>
            <i className="ti ti-chart-bar" style={{ marginRight: 6 }}></i>สถิติและการเรียนรู้
          </button>
          <button className={`pill ${subView === "account" ? "on" : ""}`} onClick={() => setSubView("account")}>
            <i className="ti ti-settings" style={{ marginRight: 6 }}></i>ตั้งค่าบัญชี
          </button>
        </div>

        {subView === "stats" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--teal-bg)", color: "var(--teal)", display: "grid", placeItems: "center", fontSize: 18 }}>
                  <i className="ti ti-file-text"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>บทความที่อ่าน</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.articlesRead} บทความ</div>
                </div>
              </div>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255, 179, 0, 0.1)", color: "rgb(255, 179, 0)", display: "grid", placeItems: "center", fontSize: 18 }}>
                  <i className="ti ti-download"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>โหลดหนังสือ</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.booksDownloaded} เล่ม</div>
                </div>
              </div>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(30, 215, 96, 0.1)", color: "rgb(30, 215, 96)", display: "grid", placeItems: "center", fontSize: 18 }}>
                  <i className="ti ti-player-play"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>ดู/ฟังมีเดีย</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.mediaWatched} คลิป</div>
                </div>
              </div>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(248, 113, 113, 0.12)", color: "#f87171", display: "grid", placeItems: "center", fontSize: 18 }}>
                  <i className="ti ti-flame"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>streak อ่านจริง</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.streak.current} วัน · {stats.verifiedSessions} ครั้ง</div>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}><i className="ti ti-history" style={{ color: "var(--teal)" }}></i> ประวัติกิจกรรมล่าสุด</h3>
              {history.length === 0 ? (
                <div className="empty" style={{ padding: 24, textAlign: "center" }}>ยังไม่มีประวัติกิจกรรมการเรียนรู้ใดๆ ในระบบ</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.slice(0, 10).map((h, i) => {
                    let icon = "ti-file-text";
                    let color = "var(--teal)";
                    let typeLabel = "บทความ";
                    if (h.type === "book") {
                      icon = "ti-book";
                      color = "rgb(255, 179, 0)";
                      typeLabel = "หนังสือ";
                    } else if (h.type === "media") {
                      icon = h.mediaType === "youtube" ? "ti-brand-youtube" : "ti-brand-spotify";
                      color = h.mediaType === "youtube" ? "#ff4444" : "#1ed760";
                      typeLabel = h.mediaType === "youtube" ? "YouTube" : "Spotify";
                    }
                    return (
                      <div 
                        key={`${h.id}-${h.timestamp}-${i}`} 
                        onClick={() => handleHistoryClick(h)}
                        className="card" 
                        style={{ 
                          padding: "10px 14px", 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "space-between", 
                          gap: 12,
                          cursor: "pointer",
                          transition: "transform 0.15s ease",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = "translateX(4px)"}
                        onMouseLeave={(e) => e.currentTarget.style.transform = "none"}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--bg2)", color, display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0 }}>
                            <i className={`ti ${icon}`}></i>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 9, color: "var(--t3)", display: "block" }}>{typeLabel}</span>
                            <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontSize: 13 }}>{h.title}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: "var(--t3)", flexShrink: 0 }}>{new Date(h.timestamp).toLocaleDateString("th-TH", { month: "short", day: "numeric" })}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {subView === "account" && (
          <form onSubmit={saveAccount}>
            <section className="profile-section" style={{ borderTop: "none", padding: 0 }}>
              <div className="profile-section-head" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 500 }}>ข้อมูลส่วนตัวบัญชี</h3>
                  <p style={{ fontSize: 12, color: "var(--t3)" }}>จัดการชื่อที่แสดง อีเมล และรหัสผ่านของคุณ</p>
                </div>
              </div>

              {isGoogleUser && (
                <div style={{ background: "rgba(45,190,160,0.06)", border: "0.5px solid rgba(45,190,160,0.25)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 11, color: "var(--teal)", lineHeight: 1.5 }}>
                  <i className="ti ti-brand-google" style={{ marginRight: 6 }}></i>
                  คุณเชื่อมต่อระบบผ่าน Google: การเปลี่ยนอีเมลและรหัสผ่านต้องทำผ่านบัญชี Google ของคุณโดยตรง
                </div>
              )}

              <div style={{ display: "grid", gap: 14 }}>
                <label style={fieldStyle}>
                  <span>ชื่อที่แสดง</span>
                  <input value={form.displayName} onChange={e => set("displayName", e.target.value)} placeholder="ชื่อที่ต้องการแสดง" required />
                </label>

                <label style={fieldStyle}>
                  <span>อีเมลหลัก (Email)</span>
                  <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="อีเมล" disabled={isGoogleUser} style={isGoogleUser ? { opacity: 0.6 } : undefined} required />
                </label>

                {!isGoogleUser && (
                  <>
                    <label style={fieldStyle}>
                      <span>รหัสผ่านใหม่ (หากต้องการเปลี่ยน)</span>
                      <input type="password" value={form.newPassword} onChange={e => set("newPassword", e.target.value)} placeholder="ป้อนรหัสผ่านใหม่" />
                    </label>

                    {(form.email.trim().toLowerCase() !== email.trim().toLowerCase() || form.newPassword.trim() !== "") && (
                      <label style={fieldStyle}>
                        <span>รหัสผ่านปัจจุบันเพื่อยืนยันสิทธิ์ *</span>
                        <input type="password" value={form.currentPassword} onChange={e => set("currentPassword", e.target.value)} placeholder="ป้อนรหัสผ่านเดิมของคุณ" required />
                      </label>
                    )}
                  </>
                )}
              </div>

              <div className="profile-actions" style={{ marginTop: 20 }}>
                <button className="btn btn-teal" disabled={busy === "account"} type="submit">
                  <i className={`ti ${busy === "account" ? "ti-loader-2 spin" : "ti-device-floppy"}`} style={{ marginRight: 6 }}></i>
                  {busy === "account" ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
                </button>
              </div>
            </section>
          </form>
        )}
      </div>
    </div>
  )
}

function DashboardCard({ icon, title, text, onClick }) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag onClick={onClick} className="card dashboard-card">
      <i className={`ti ${icon}`}></i>
      <h2>{title}</h2>
      <p>{text}</p>
    </Tag>
  )
}

function initials(name, email) {
  const source = name && name !== "-" ? name : email
  return source.split(/\s|@/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "TC"
}

function formEmailChanged(nextEmail, currentEmail) {
  return nextEmail?.trim().toLowerCase() !== currentEmail?.trim().toLowerCase()
}

const fieldStyle = { display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "var(--t2)" }

function SavedVersesPanel({ authState, go, setView, setQuranSura, setQuranAyah }) {
  const { items: savedVerses, loading, deleteItem, saveItem } = useContentCollection("quran_bookmarks", [])
  const uid = authState?.user?.uid;
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState("");

  const userSaved = useMemo(() => {
    if (!uid) return [];
    return savedVerses.filter(v => v.uid === uid);
  }, [savedVerses, uid]);

  const filteredSaved = useMemo(() => {
    if (!search.trim()) return userSaved;
    const q = search.toLowerCase();
    return userSaved.filter(v => 
      v.notes?.toLowerCase().includes(q) ||
      v.translation?.toLowerCase().includes(q) ||
      v.suraName?.toLowerCase().includes(q) ||
      String(v.sura).includes(q)
    );
  }, [userSaved, search]);

  const handleOpenVerse = (sura, aya) => {
    go("quran", { sura, ayah: aya })
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditNote(item.notes || "");
  };

  const handleSaveNote = async (item) => {
    const toastId = toast.loading("กำลังบันทึก...");
    try {
      await saveItem({
        ...item,
        notes: editNote,
        updatedAt: new Date()
      });
      toast.success("บันทึกข้อคิดเรียบร้อยแล้ว", { id: toastId });
      setEditingId(null);
    } catch (err) {
      toast.error("ไม่สามารถบันทึกได้", { id: toastId });
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirmAction({
      title: "ลบอายะฮ์ที่บันทึก?",
      message: "คุณต้องการยกเลิกการบันทึกอายะฮ์นี้ใช่หรือไม่?",
      confirmText: "ลบออก",
      danger: true
    });
    if (ok) {
      const toastId = toast.loading("กำลังลบ...");
      try {
        await deleteItem(id);
        toast.success("ลบรายการแล้ว", { id: toastId });
      } catch (err) {
        toast.error("ลบไม่สำเร็จ", { id: toastId });
      }
    }
  };

  if (loading) return <div style={{textAlign: "center", padding: 40}}><i className="ti ti-loader-2 spin" style={{fontSize: 24, color: "var(--teal)"}}></i></div>

  return (
    <div className="profile-layout" style={{ maxWidth: 840, margin: "0 auto" }}>
      <button 
        onClick={() => setView("overview")} 
        className="sec-link" 
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
             <i className="ti ti-notebook" style={{ color: "var(--teal)", fontSize: 20 }}></i>
           </div>
           <div>
             <h2 style={{ fontSize: 18 }}>อายะฮ์อัลกุรอานที่บันทึกไว้</h2>
             <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{filteredSaved.length} รายการ (บันทึกข้อคิดและประโยชน์จากอายะฮ์)</p>
           </div>
        </div>

        {userSaved.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>
            คุณยังไม่มีอายะฮ์ที่บันทึกไว้ ไปเปิดคัมภีร์อัลกุรอานเพื่อบันทึกและจดข้อคิดกันเลยครับ!
          </div>
        ) : (
          <>
            {/* ค้นหา */}
            <div style={{ position: "relative", marginBottom: 20 }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 14 }}></i>
              <input 
                placeholder="ค้นหาตามข้อคิด คำแปล หรือซูเราะห์..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                style={{ paddingLeft: 36, width: "100%", height: 38 }} 
              />
            </div>

            {filteredSaved.length === 0 ? (
              <div className="empty" style={{ padding: "30px 0" }}>ไม่พบรายการที่ค้นหา</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredSaved.map(item => (
                  <div key={item.id} className="card" style={{ padding: 20, border: "0.5px solid var(--br)", background: "var(--bg3)" }}>
                    
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                      <span className="badge badge-teal" style={{ fontSize: 11, cursor: "pointer" }} onClick={() => handleOpenVerse(item.sura, item.aya)}>
                        <i className="ti ti-book" style={{ marginRight: 4 }}></i>
                        ซูเราะฮ์ {item.suraName} [{item.sura}:{item.aya}]
                      </span>
                      
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }} onClick={() => handleOpenVerse(item.sura, item.aya)}>
                          <i className="ti ti-eye"></i> เปิดอ่าน
                        </button>
                        <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }} onClick={() => handleEdit(item)}>
                          <i className="ti ti-edit"></i> แก้ไข
                        </button>
                        <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--red)", borderColor: "rgba(220,38,38,0.2)" }} onClick={() => handleDelete(item.id)}>
                          <i className="ti ti-trash"></i> ลบ
                        </button>
                      </div>
                    </div>

                    {/* Verses Container */}
                    <div style={{ padding: 12, background: "var(--card)", borderRadius: 8, marginBottom: 12, border: "0.5px solid var(--br2)" }}>
                      <div style={{ 
                        fontFamily: "'Amiri', serif", 
                        fontSize: 24, 
                        direction: "rtl", 
                        textAlign: "right", 
                        marginBottom: 10,
                        lineHeight: 1.8,
                        color: "var(--text)"
                      }}>
                        {item.arabicText}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5 }}>
                        {item.translation}
                      </div>
                    </div>

                    {/* Reflection / Notes Box */}
                    {editingId === item.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--teal)" }}>
                          แก้ไขข้อคิด/ประโยชน์ที่ได้รับจากอายะฮ์นี้:
                        </label>
                        <textarea 
                          value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          placeholder="เขียนบันทึกสิ่งที่คุณได้รับ หรือข้อคิดสำหรับเตือนตนเอง..."
                          style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 8, border: "0.5px solid var(--teal)", fontFamily: "'Prompt', sans-serif", fontSize: 13, background: "var(--card)", color: "var(--text)" }}
                        />
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn btn-outline" style={{ padding: "4px 12px", fontSize: 11 }} onClick={() => setEditingId(null)}>
                            ยกเลิก
                          </button>
                          <button className="btn btn-teal" style={{ padding: "4px 12px", fontSize: 11 }} onClick={() => handleSaveNote(item)}>
                            บันทึก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ 
                        background: "rgba(45, 190, 160, 0.05)", 
                        borderLeft: "3px solid var(--teal)", 
                        padding: "10px 14px", 
                        borderRadius: "0 8px 8px 0",
                        marginTop: 10 
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--teal)", marginBottom: 4 }}>
                          ประโยชน์และข้อคิดเตือนใจที่คุณบันทึกไว้:
                        </div>
                        <p style={{ fontSize: 13, color: "var(--text)", fontStyle: item.notes ? "normal" : "italic", margin: 0 }}>
                          {item.notes || "ไม่มีข้อบันทึก (กดแก้ไขเพื่อเพิ่มข้อคิดเตือนใจ)"}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
