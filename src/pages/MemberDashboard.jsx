import { useEffect, useState, useMemo } from "react"
import toast from 'react-hot-toast'
import { ARTICLES, BOOKS } from "../data/index.js"
import { useContentCollection } from "../lib/contentStore.js"
import { confirmAction } from "../utils/feedback.jsx"
import Quran from "./Quran.jsx"

export default function MemberDashboard({ authState, go, initialView = "overview" }) {
  const [view, setView] = useState("overview")
  const [copied, setCopied] = useState("")
  const [quranSura, setQuranSura] = useState(1)
  const [quranAyah, setQuranAyah] = useState(null)
  
  const user = authState?.user
  const profile = authState?.profile || {}
  const name = profile.displayName || user?.displayName || user?.email || "สมาชิก"
  const role = profile.role || "member"

  useEffect(() => {
    if (initialView) setView(initialView)
  }, [initialView])

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
            setQuranSura(sura || 1)
            setQuranAyah(ayah || null)
            setView("quran")
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
  const { items: rawHistory } = useContentCollection("history", [])
  const { items: savedVerses } = useContentCollection("quran_bookmarks", [])

  const streak = useMemo(() => {
    const activityDates = rawHistory
      .filter(item => item.uid === uid)
      .map(item => item.timestamp || item.updatedAt || item.createdAt)

    savedVerses
      .filter(item => item.uid === uid)
      .forEach(item => activityDates.push(item.updatedAt || item.createdAt || item.savedAt))

    if (lastRead?.timestamp) activityDates.push(lastRead.timestamp)
    return calculateReadingStreak(activityDates)
  }, [lastRead, rawHistory, savedVerses, uid])

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
        <DashboardCard icon="ti-book-2" title="ชั้นหนังสือของฉัน" text="ติดตามหนังสือที่กำลังอ่าน อ่านจบ และความคืบหน้า" onClick={() => setView("bookshelf")} />
        <DashboardCard icon="ti-flame" title={`${streak.current} วันต่อเนื่อง`} text={`สถิติสูงสุด ${streak.best} วัน · มีกิจกรรม ${streak.totalDays} วัน`} onClick={() => setView("profile")} />
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
  const ms = getTimeMs(value)
  if (!ms) return ""
  const date = new Date(ms)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function calculateReadingStreak(values) {
  const days = new Set(values.map(getLocalDayKey).filter(Boolean))
  const sorted = [...days].sort()
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
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  const yesterday = new Date(cursor)
  yesterday.setDate(yesterday.getDate() - 1)

  if (days.has(getLocalDayKey(cursor.getTime())) || days.has(getLocalDayKey(yesterday.getTime()))) {
    while (days.has(getLocalDayKey(cursor.getTime()))) {
      current += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    if (current === 0) {
      cursor.setDate(cursor.getDate() - 1)
      while (days.has(getLocalDayKey(cursor.getTime()))) {
        current += 1
        cursor.setDate(cursor.getDate() - 1)
      }
    }
  }

  return { current, best, totalDays: days.size }
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
  const [bookId, setBookId] = useState("")
  const [quizState, setQuizState] = useState(null)

  const myShelf = useMemo(() => {
    return shelfItems
      .filter(item => item.uid === uid)
      .map(item => ({
        ...item,
        book: books.find(book => String(book.id) === String(item.bookId)),
      }))
      .filter(item => item.book)
      .sort((a, b) => getTimeMs(b.updatedAt || b.addedAt) - getTimeMs(a.updatedAt || a.addedAt))
  }, [books, shelfItems, uid])

  const availableBooks = useMemo(() => {
    const savedIds = new Set(myShelf.map(item => String(item.bookId)))
    return books.filter(book => !savedIds.has(String(book.id)))
  }, [books, myShelf])

  const stats = useMemo(() => {
    const finished = myShelf.filter(item => item.status === "finished").length
    const reading = myShelf.filter(item => item.status === "reading").length
    const avgProgress = myShelf.length
      ? Math.round(myShelf.reduce((sum, item) => sum + Number(item.progress || 0), 0) / myShelf.length)
      : 0
    return { finished, reading, avgProgress }
  }, [myShelf])

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
      addedAt: Date.now(),
    })
    setBookId("")
    toast.success("เพิ่มเข้าชั้นหนังสือแล้ว")
  }

  async function updateShelfItem(item, patch) {
    const nextProgress = patch.status === "finished" ? 100 : patch.progress
    await saveItem({
      ...item,
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

  async function startQuiz(item) {
    setQuizState({ item, loading: true, quiz: [], answers: {}, source: "" })
    try {
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
    <div className="profile-layout" style={{ maxWidth: 900, margin: "0 auto" }}>
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
              <p style={{ fontSize: 12, marginTop: 2 }}>ติดตามหนังสือที่กำลังอ่าน อ่านจบ และเป้าหมายต่อไป</p>
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
        </div>

        <div className="card" style={{ padding: 14, background: "var(--bg2)", boxShadow: "none", marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
            <select value={bookId} onChange={event => setBookId(event.target.value)}>
              <option value="">เลือกหนังสือเพื่อเพิ่มเข้าชั้น</option>
              {availableBooks.map(book => (
                <option key={book.id} value={book.id}>{book.title}</option>
              ))}
            </select>
            <button className="btn btn-teal" onClick={addBook} disabled={!bookId}>เพิ่ม</button>
          </div>
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
                    <p style={{ fontSize: 12, marginTop: 2 }}>{item.book.author} · {item.book.type}</p>
                  </div>
                  {item.status === "finished" && (
                    <button className="btn btn-teal" style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }} onClick={() => startQuiz(item)}>
                      <i className="ti ti-sparkles" style={{ marginRight: 4 }}></i>Quiz
                    </button>
                  )}
                  <button className="btn btn-outline" style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }} onClick={() => go("library-detail", item.book)}>
                    เปิด
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
                  <select value={item.status || "reading"} onChange={event => updateShelfItem(item, { status: event.target.value })}>
                    {BOOK_STATUS.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
                  </select>
                  <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--t2)" }}>
                    <span>ความคืบหน้า {Number(item.progress || 0)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Number(item.progress || 0)}
                      onChange={event => updateShelfItem(item, { progress: event.target.value })}
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
    </div>
  )
}

function QuizModal({ quizState, onAnswer, onClose, onFinish }) {
  const answered = Object.keys(quizState.answers || {}).length
  const score = quizState.quiz.reduce((sum, question, index) => {
    return sum + (quizState.answers[index] === question.answerIndex ? 1 : 0)
  }, 0)
  const done = quizState.quiz.length > 0 && answered === quizState.quiz.length
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
            <p style={{ fontSize: 12, marginTop: 4 }}>{quizState.item?.book?.title}</p>
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
                    <h3 style={{ fontSize: 14, lineHeight: 1.55 }}>{qIndex + 1}. {question.question}</h3>
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
    const streak = calculateReadingStreak([
      ...history.map(item => item.timestamp || item.updatedAt || item.createdAt),
      ...savedVerses.filter(item => item.uid === user?.uid).map(item => item.updatedAt || item.createdAt || item.savedAt),
    ]);
    return { articlesRead, booksDownloaded, mediaWatched, streak };
  }, [history, savedVerses, user?.uid])

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
    setQuranSura(sura);
    setQuranAyah(aya);
    setView("quran");
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
