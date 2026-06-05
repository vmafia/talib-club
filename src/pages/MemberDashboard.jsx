import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import toast from 'react-hot-toast'
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { ARTICLES, BOOKS } from "../data/index.js"
import { useContentCollection, useUserCollection, useUserDoc } from "../lib/contentStore.js"
import { storage, db } from "../lib/firebase.js"
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore"
import { confirmAction } from "../utils/feedback.jsx"
import Quran from "./Quran.jsx"
import DashboardNav from "../components/DashboardNav.jsx"

function resolveDashboardView(initialView) {
  if (!initialView || initialView === "bookshelf" || initialView === "streak") return "overview"
  return initialView
}

export default function MemberDashboard({ authState, go, initialView = "overview", ctx, theme }) {
  const [view, setCurrentView] = useState(() => resolveDashboardView(initialView))
  const [copied, setCopied] = useState("")
  const [quranSura, setQuranSura] = useState(1)
  const [quranAyah, setQuranAyah] = useState(null)

  const user = authState?.user
  const profile = authState?.profile || {}
  const name = profile.displayName || user?.displayName || user?.email || "สมาชิก"
  const role = profile.role || "member"

  useEffect(() => {
    if (initialView === "bookshelf" || initialView === "streak") {
      go("reader", ctx?.shelfItemId ? { shelfItemId: ctx.shelfItemId } : null)
      return
    }

    const searchParams = new URLSearchParams(window.location.search)
    const sura = searchParams.get("sura") || ctx?.sura
    const ayah = searchParams.get("ayah") || ctx?.ayah
    if (sura) setQuranSura(Number(sura))
    if (ayah) setQuranAyah(Number(ayah))
    else setQuranAyah(null)
  }, [initialView, ctx, go])

  const setView = (newView) => {
    if (newView === "quran") {
      go("quran", { sura: quranSura, ayah: quranAyah })
    } else if (newView === "bookshelf" || newView === "streak") {
      go("reader")
    } else {
      setCurrentView(newView)
      go("member", { view: newView }, { replace: true, noScroll: true })
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
      {user && !user.emailVerified && (
        <div className="card" style={{
          background: "rgba(217, 119, 6, 0.07)",
          borderColor: "rgba(217, 119, 6, 0.25)",
          borderStyle: "solid",
          borderWidth: ".5px",
          color: "var(--text)",
          padding: "16px 20px",
          marginBottom: 20,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "start", gap: 10, flex: 1, minWidth: 260 }}>
            <i className="ti ti-mail-exclamation" style={{ fontSize: 22, color: "#d97706", marginTop: 2 }}></i>
            <div>
              <strong style={{ fontSize: 14, display: "block", marginBottom: 2 }}>กรุณายืนยันอีเมลของคุณ ✉️</strong>
              <span style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5 }}>
                บัญชีของคุณยังไม่ได้ยืนยันความถูกต้องของอีเมล ({user.email}) โปรดตรวจสอบกล่องจดหมายและกดยืนยันตัวตน เพื่อความปลอดภัยในการสะสมประวัติ Streak การอ่าน
              </span>
            </div>
          </div>
          <button 
            className="btn"
            style={{ 
              background: "#d97706", 
              borderColor: "#d97706", 
              color: "#fff",
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 20,
              cursor: "pointer",
            }}
            onClick={async () => {
              try {
                if (authState?.sendCurrentEmailVerification) {
                  await authState.sendCurrentEmailVerification();
                  toast.success("ส่งลิงก์ยืนยันตัวตนไปยังอีเมลของคุณอีกครั้งเรียบร้อยแล้ว!");
                }
              } catch (err) {
                console.error(err);
                toast.error("ไม่สามารถส่งอีเมลยืนยันตัวตนได้ในขณะนี้");
              }
            }}
          >
            ส่งลิงก์อีกครั้ง
          </button>
        </div>
      )}
      {view === "overview" && (
        <div className="member-hero">
          <div>
            <span className="badge badge-teal">{role === "staff" ? "Staff" : "Member"}</span>
            <h1>ยินดีต้อนรับ, {name}</h1>
            <p>พื้นที่สมาชิกสำหรับติดตามการอ่าน บันทึกหนังสือ และจัดการข้อมูลบัญชี Talib Club</p>
          </div>
          <div className="member-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {role === "staff" && (
              <button className="btn btn-teal" onClick={() => go("staff")} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-briefcase"></i>พื้นที่ปฏิบัติงานสตาฟ
              </button>
            )}
            <button className="btn btn-outline" onClick={handleLogout} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <i className="ti ti-logout"></i>ออกจากระบบ
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
      {view === "profile" && <ProfilePanel authState={authState} copied={copied} copyText={copyText} go={go} setView={setView} ctx={ctx} />}
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
      {view === "leaderboard" && (
        <LeaderboardPanel
          authState={authState}
          setView={setView}
        />
      )}
      {view === "reflections" && (
        <ReflectionsPanel
          authState={authState}
          setView={setView}
          theme={theme}
        />
      )}
    </div>
  )
}

function Overview({ authState, go, setView, onOpenQuran, onOpenSavedVerses }) {
  const [lastRead, setLastRead] = useState(null)

  const uid = authState?.user?.uid
  const { items: shelfItems } = useContentCollection("bookshelf", [], uid, { live: false })
  const { items: savedVerses } = useUserCollection("quran_bookmarks", uid)
  const { item: remoteLastRead } = useUserDoc("quran_last_read", uid, uid ? `${uid}_last_read` : null)
  const { items: sessionItems } = useContentCollection("reading_sessions", [], uid, { live: false })
  const { items: streakRecords } = useContentCollection("reading_streaks", [], uid, { live: false })
  
  const userSavedVerses = useMemo(() => savedVerses.filter(item => item.uid === uid), [savedVerses, uid])
  const activeBooks = useMemo(() => shelfItems.filter(item => item.uid === uid && item.status !== "finished"), [shelfItems, uid])

  const sessionCount = useMemo(() => sessionItems.filter(item => item.uid === uid && item.verified).length, [sessionItems, uid])
  const streakSettings = useMemo(() => streakRecords.find(item => item.uid === uid || item.id === uid), [streakRecords, uid])
  const finishedCount = useMemo(() => shelfItems.filter(item => item.uid === uid && item.status === "finished").length, [shelfItems, uid])
  const bookmarkCount = userSavedVerses.length
  const [sharedCount, setSharedCount] = useState(() => Number(localStorage.getItem("talib_shared_articles_count") || 0))

  useEffect(() => {
    const handleStorage = () => setSharedCount(Number(localStorage.getItem("talib_shared_articles_count") || 0))
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  const achievements = useMemo(() => [
    {
      id: "first_step",
      name: "ผู้เริ่มเดินทาง (First Step)",
      desc: "สะสมชั่วโมงการอ่านครบ 1 ครั้งแรกสำเร็จ",
      unlocked: sessionCount >= 1,
      icon: "ti ti-shoe",
      color: "#0d9488",
    },
    {
      id: "streak_master",
      name: "ผู้รักษาวินัย (Streak Master)",
      desc: "รักษาสถิติการอ่านต่อเนื่องตั้งแต่ 7 วันขึ้นไป",
      unlocked: (streakSettings?.streakCount || 0) >= 7,
      icon: "ti ti-flame",
      color: "#f97316",
    },
    {
      id: "quran_lover",
      name: "รักอัลกุรอาน (Quran Lover)",
      desc: "บันทึกข้อคิดอายะฮ์อัลกุรอานครบ 5 อายะฮ์",
      unlocked: bookmarkCount >= 5,
      icon: "ti ti-heart",
      color: "#ec4899",
    },
    {
      id: "bookworm",
      name: "หนอนหนังสือ (Bookworm)",
      desc: "อ่านหนังสือบนชั้นวางจบเล่มครบ 3 เล่ม",
      unlocked: finishedCount >= 3,
      icon: "ti ti-book",
      color: "#a855f7",
    },
    {
      id: "wisdom_spreader",
      name: "ผู้ส่งต่อความรู้ (Wisdom Spreader)",
      desc: "แชร์บทความความรู้ให้ผู้อื่นอย่างน้อย 1 ครั้ง",
      unlocked: sharedCount >= 1,
      icon: "ti ti-share",
      color: "#3b82f6",
    }
  ], [sessionCount, streakSettings?.streakCount, bookmarkCount, finishedCount, sharedCount])

  useEffect(() => {
    if (uid && remoteLastRead) {
      setLastRead(remoteLastRead)
      localStorage.setItem("quran-last-read", JSON.stringify(remoteLastRead))
      return
    }

    try {
      const local = localStorage.getItem("quran-last-read")
      if (local) {
        setLastRead(JSON.parse(local))
      }
    } catch (err) {
      console.error(err)
    }
  }, [remoteLastRead, uid])

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
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block" }}>อ่านต่อล่าสุด</strong>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>ซูเราะฮ์ {lastRead.suraName || lastRead.sura} อายะฮ์ {lastRead.aya}</span>
            </div>
          </div>
          <button className="btn btn-teal" onClick={() => onOpenQuran(lastRead.sura, lastRead.aya)} style={{ padding: "6px 14px", fontSize: 11 }}>
            อ่านต่อล่าสุด <i className="ti ti-arrow-right" style={{ marginLeft: 4 }}></i>
          </button>
        </div>
      )}

      <DashboardNav 
        setView={setView} 
        go={go} 
        lastRead={lastRead} 
        onOpenQuran={onOpenQuran} 
        activeBooksCount={activeBooks.length} 
        userSavedVersesCount={userSavedVerses.length} 
      />

      {/* Achievements Section */}
      <div style={{ marginTop: 32, textAlign: "left" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-award" style={{ color: "var(--teal)", fontSize: 22 }}></i> ความสำเร็จและเหรียญตรา (Achievements)
        </h2>
        <p style={{ fontSize: 12, color: "var(--t2)", marginBottom: 18 }}>สะสมชั่วโมงการอ่าน ศึกษาพระพจนารถ และรักษาวินัยการเรียนรู้เพื่อปลดล็อครางวัล</p>

        <div className="grid3" style={{ gap: 16 }}>
          {achievements.map(badge => (
            <div
              key={badge.id}
              className={`achievement-row ${badge.unlocked ? "unlocked" : "locked"}`}
              style={{
                borderColor: badge.unlocked ? badge.color : "var(--br)",
                boxShadow: badge.unlocked ? `0 4px 14px ${badge.color}15` : "none"
              }}
              onMouseEnter={(e) => {
                if (badge.unlocked) {
                  e.currentTarget.style.transform = "translateY(-4px)"
                  e.currentTarget.style.boxShadow = `0 8px 24px ${badge.color}25`
                }
              }}
              onMouseLeave={(e) => {
                if (badge.unlocked) {
                  e.currentTarget.style.transform = "translateY(0px)"
                  e.currentTarget.style.boxShadow = `0 4px 14px ${badge.color}15`
                }
              }}
            >
              <div
                className="achievement-row-icon"
                style={{
                  background: badge.unlocked ? badge.color + "15" : "var(--br2)",
                  color: badge.unlocked ? badge.color : "var(--t3)",
                  filter: badge.unlocked ? "none" : "grayscale(100%)",
                }}
              >
                <i className={badge.icon} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 13, color: badge.unlocked ? "var(--text)" : "var(--t2)" }}>{badge.name}</strong>
                  {badge.unlocked ? (
                    <i className="ti ti-circle-check" style={{ color: "var(--teal)", fontSize: 14 }}></i>
                  ) : (
                    <i className="ti ti-lock" style={{ color: "var(--t3)", fontSize: 12 }}></i>
                  )}
                </div>
                <p style={{ fontSize: 11, color: "var(--t2)", marginTop: 4, lineHeight: 1.4 }}>{badge.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
]

const CATEGORY_MAP = {
  aqeedah: "อากีดะฮ์",
  fiqh: "ฟิกฮ์",
  seerah: "ซีเราะฮ์",
  hadith: "ฮะดีษ",
  social: "สังคมศาสตร์",
  tafsir: "ตัฟซีร"
}

const TYPE_MAP = {
  series: "ซีรีส์",
  general: "บทความทั่วไป",
  specific: "บทความเฉพาะเรื่อง",
  social: "สังคมศาสตร์"
}

function getArticleMonthString(dateStr) {
  if (!dateStr) return "ไม่ระบุเวลา"
  const parts = dateStr.split("-")
  if (parts.length >= 2) {
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10) - 1
    if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 0 && m < 12) {
      return `${THAI_MONTHS[m]} ${y + 543}`
    }
  }
  return dateStr
}

function getSavedMonthString(date) {
  if (!date || Number.isNaN(date.getTime())) return "ไม่ระบุเวลา"
  return `${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`
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

function getWeekKey(date) {
  const ms = getTimeMs(date || Date.now())
  const d = new Date(ms)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return getLocalDayKey(monday.getTime())
}

function normalizeStreakSettings(settings, uid) {
  const base = settings || {}
  return {
    id: base.id || uid,
    uid: base.uid || uid,
    gems: Number(base.gems || 0),
    freezeCredits: Number(base.freezeCredits ?? 2),
    leaveCredits: Number(base.leaveCredits ?? 1),
    protectedDays: Array.isArray(base.protectedDays) ? base.protectedDays : [],
    claimedMissions: base.claimedMissions || {},
    remindersEnabled: Boolean(base.remindersEnabled),
    reminderTimes: Array.isArray(base.reminderTimes) ? base.reminderTimes : [],
  }
}

function calculateReadingStreak(values, protections = []) {
  const days = new Set()
  values.forEach(value => {
    const key = getLocalDayKey(value)
    if (key) days.add(key)
  })
  const protectedByDay = new Map()
  protections.forEach(item => {
    if (item?.date) protectedByDay.set(item.date, item)
  })
  const coveredDays = new Set([...days, ...protectedByDay.keys()])
  const today = getLocalDayKey(Date.now())
  let current = 0
  let cursor = today
  while (coveredDays.has(cursor)) {
    current += 1
    const [y, m, d] = cursor.split("-").map(Number)
    const prev = new Date(y, m - 1, d - 1)
    cursor = getLocalDayKey(prev.getTime())
  }
  return {
    current,
    totalDays: days.size,
    protectedTotal: protectedByDay.size,
    todayKey: today,
    todayVerified: days.has(today),
    todayProtected: protectedByDay.get(today) || null,
    coveredDays,
  }
}

function SavedArticlesPanel({ authState, go, setView }) {
  const uid = authState?.user?.uid;
  const { items: articles, loading: loadingArticles } = useContentCollection("articles", ARTICLES, null, { live: false })
  const { items: bookmarks, loading: loadingBookmarks } = useContentCollection("bookmarks", [], uid, { live: false })

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

  if (loadingArticles || loadingBookmarks) return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>

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

function ProfilePanel({ authState, copied, copyText, go, setView, ctx }) {
  const user = authState?.user
  const profile = authState?.profile || {}
  const role = profile.role || "member"
  const displayName = profile.displayName || user?.displayName || "-"
  const email = user?.email || profile.email || "-"
  const photoURL = user?.photoURL || ""
  const isStaff = role === "staff"

  const subView = ctx?.sub || "stats"
  const setSubView = (newSub) => {
    go("member", { view: "profile", sub: newSub }, { replace: true, noScroll: true })
  }

  const [form, setForm] = useState({
    displayName: displayName === "-" ? "" : displayName,
    email,
    currentPassword: "",
    newPassword: "",
  })
  const [busy, setBusy] = useState("")


  // 💡 เชื่อมต่อกับคอลเลกชัน history ใน Firestore
  const { items: rawHistory, loading: loadingHistory } = useContentCollection("history", [], user?.uid, { live: false })
  const { items: savedVerses } = useUserCollection("quran_bookmarks", user?.uid)
  const { items: readingSessions } = useContentCollection("reading_sessions", [], user?.uid, { live: false })
  const { items: streakRecords, saveItem: saveStreakSettings } = useContentCollection("reading_streaks", [], user?.uid, { live: false })

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

  const userSettings = useMemo(() => {
    if (!user?.uid) return null
    const found = streakRecords.find(item => item.uid === user.uid || item.id === user.uid)
    return normalizeStreakSettings(found, user.uid)
  }, [streakRecords, user?.uid])

  const handleToggleReminders = async (enabled) => {
    if (!userSettings) return
    if (enabled) {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        toast.error("เบราว์เซอร์ปฏิเสธสิทธิ์การแจ้งเตือน กรุณาเปิดสิทธิ์ในตั้งค่าเบราว์เซอร์เพื่อให้แจ้งเตือนทำงานได้")
      }
    }
    try {
      await saveStreakSettings({
        ...userSettings,
        remindersEnabled: enabled
      })
      toast.success(enabled ? "เปิดใช้งานระบบการแจ้งเตือนให้อ่านหนังสือแล้ว 🔔" : "ปิดใช้งานระบบการแจ้งเตือนแล้ว")
    } catch (err) {
      toast.error("บันทึกข้อมูลไม่สำเร็จ")
    }
  }

  const handleAddReminderTime = async (timeStr) => {
    if (!userSettings || !timeStr) return
    if (userSettings.reminderTimes.includes(timeStr)) {
      toast.error("มีเวลานี้ในการตั้งค่าแล้ว")
      return
    }
    const updatedTimes = [...userSettings.reminderTimes, timeStr].sort()
    try {
      await saveStreakSettings({
        ...userSettings,
        reminderTimes: updatedTimes
      })
      toast.success(`เพิ่มเวลาแจ้งเตือน ${timeStr} สำเร็จ`)
    } catch (err) {
      toast.error("บันทึกข้อมูลไม่สำเร็จ")
    }
  }

  const handleRemoveReminderTime = async (timeStr) => {
    if (!userSettings) return
    const updatedTimes = userSettings.reminderTimes.filter(t => t !== timeStr)
    try {
      await saveStreakSettings({
        ...userSettings,
        reminderTimes: updatedTimes
      })
      toast.success(`ลบเวลาแจ้งเตือน ${timeStr} สำเร็จ`)
    } catch (err) {
      toast.error("บันทึกข้อมูลไม่สำเร็จ")
    }
  }

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
    const targetId = h.itemId || parseHistoryTargetId(h) || h.id;
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
        <div className="profile-head" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="profile-avatar" style={{ overflow: "hidden", margin: 0 }}>
              {photoURL ? <img src={photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(displayName, email)}
            </div>
            <div>
              <span className={`badge ${isStaff ? "badge-teal" : "badge-acc"}`}>{isStaff ? "Staff" : "Member"}</span>
              <h2>{displayName}</h2>
              <p>{email}</p>
            </div>
          </div>
          {isStaff && (
            <button className="btn btn-teal" onClick={() => go("staff")} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <i className="ti ti-briefcase"></i>พื้นที่ปฏิบัติงานสตาฟ
            </button>
          )}
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

function parseHistoryTargetId(historyItem) {
  const rawId = String(historyItem?.id || "")
  const match = rawId.match(/_(article|book|media)_(.+)$/)
  return match?.[2] || null
}

function formEmailChanged(nextEmail, currentEmail) {
  return nextEmail?.trim().toLowerCase() !== currentEmail?.trim().toLowerCase()
}

const fieldStyle = { display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "var(--t2)" }

function SavedVersesPanel({ authState, go, setView, setQuranSura, setQuranAyah }) {
  const uid = authState?.user?.uid;
  const { items: savedVerses, loading, deleteItem, saveItem } = useUserCollection("quran_bookmarks", uid)
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

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>

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
                      <div 
                        style={{
                          fontFamily: "'Amiri', serif",
                          fontSize: 24,
                          direction: "rtl",
                          textAlign: "right",
                          marginBottom: 10,
                          lineHeight: 1.8,
                          color: "var(--text)"
                        }}
                        dangerouslySetInnerHTML={{ __html: item.arabicText }}
                      />
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
                        borderTop: "3px solid var(--teal)",
                        padding: "10px 14px",
                        borderRadius: "8px",
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

function TutorialModal({ onClose, theme }) {
  return createPortal(
    <div className={`app ${theme || "light"}`} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 16px",
    }}>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--br);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--teal);
        }
      `}</style>
      <div className="card" style={{
        maxWidth: 500,
        width: "100%",
        maxHeight: "calc(100vh - 40px)",
        padding: "24px 20px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        textAlign: "center",
        animation: "pageFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        position: "relative",
        margin: "auto",
        boxSizing: "border-box",
      }}>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: -4 }}>
            <span className="badge badge-teal" style={{ fontSize: 11, padding: "4px 10px", fontWeight: 600 }}>แนะนำการใช้งาน 🚀</span>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            ห้องอ่านหนังสือส่วนตัวคืออะไร?
          </h2>

          <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>
            เครื่องมือสร้างวินัยรักการอ่าน ผ่านการจับเวลาจริง บันทึกผล และสะสมสถิติความต่อเนื่อง (Streak)
          </p>
        </div>

        <div className="custom-scrollbar" style={{
          flex: "1 1 auto",
          overflowY: "auto",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingRight: 6,
          marginRight: -6,
        }}>

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
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>อ่านและบันทึกเซสชันทุกวัน ระบบจะนับวันต่อเนื่อง หากวันไหนอ่านไม่ได้ ใช้ไอเทมคุ้มครองแทนได้</span>
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
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>อ่าน 20 นาที หรือเขียนข้อคิด 200 ตัวอักษร หรือผ่านแบบทดสอบ 4/5 ข้อ จึงจะได้รับไอเทม และมีสิทธิ์รับได้เพียงครั้งเดียวต่อวัน</span>
            </div>
          </div>

        </div>

        <div style={{ flexShrink: 0, marginTop: 4 }}>
          <button
            className="btn btn-teal"
            onClick={onClose}
            style={{ width: "100%", padding: "12px", fontSize: 14 }}
          >
            เข้าใจแล้ว เริ่มต้นใช้งานเลย!
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}

// --- Leaderboard Panel ---
function LeaderboardPanel({ authState, setView }) {
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)
  const uid = authState?.user?.uid

  useEffect(() => {
    async function fetchLeaders() {
      try {
        setLoading(true)
        const q = query(
          collection(db, "content_reading_streaks"),
          orderBy("streakCount", "desc"),
          limit(10)
        )
        const snapshot = await getDocs(q)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setLeaders(data)
      } catch (err) {
        console.error("Error fetching leaderboard", err)
      } finally {
        setLoading(false)
      }
    }
    fetchLeaders()
  }, [])

  const userRank = useMemo(() => {
    if (!uid || leaders.length === 0) return null
    const idx = leaders.findIndex(item => item.uid === uid || item.id === uid)
    if (idx !== -1) return { rank: idx + 1, data: leaders[idx] }
    return null
  }, [leaders, uid])

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "left" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card" style={{ padding: 28, position: "relative", overflow: "hidden" }}>
        {/* Background gradient hint */}
        <div style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 150,
          height: 150,
          background: "radial-gradient(circle, rgba(236,72,153,0.12) 0%, rgba(0,0,0,0) 70%)",
          pointerEvents: "none"
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "rgba(236,72,153,0.1)",
            color: "#ec4899",
            display: "grid",
            placeItems: "center",
            fontSize: 24
          }}>
            <i className="ti ti-crown"></i>
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>ตารางอันดับผู้รักษาวินัยการอ่าน</h2>
            <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 4 }}>สมาชิกรักการอ่านที่มีสถิติ Streak การอ่านหนังสือสะสมต่อเนื่องสูงสุด 10 อันดับแรก</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <i className="ti ti-loader-2 spin" style={{ fontSize: 28, color: "var(--teal)", marginBottom: 8 }}></i>
            <div style={{ fontSize: 12, color: "var(--t2)" }}>กำลังดึงข้อมูลอันดับจากระบบ...</div>
          </div>
        ) : leaders.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>
            ยังไม่มีผู้ติดอันดับในขณะนี้ เริ่มอ่านหนังสือเพื่อสะสม Streak วันนี้กันเลย!
          </div>
        ) : (
          <div>
            {/* List */}
            <div className="leaderboard-list">
              {leaders.map((item, index) => {
                const isCurrentUser = item.uid === uid || item.id === uid
                const rank = index + 1
                let rankBadge = ""
                let rankStyle = { fontWeight: 600 }
                if (rank === 1) {
                  rankBadge = "🥇"
                  rankStyle = { fontSize: 20 }
                } else if (rank === 2) {
                  rankBadge = "🥈"
                  rankStyle = { fontSize: 20 }
                } else if (rank === 3) {
                  rankBadge = "🥉"
                  rankStyle = { fontSize: 20 }
                } else {
                  rankBadge = `#${rank}`
                  rankStyle = { fontSize: 13, color: "var(--t3)", fontFamily: "monospace" }
                }

                return (
                  <div
                    key={item.id}
                    className={`leaderboard-item ${isCurrentUser ? "me" : ""}`}
                    style={isCurrentUser ? { borderColor: "#ec4899", boxShadow: "0 4px 12px rgba(236,72,153,0.08)" } : {}}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ width: 32, textAlign: "center", ...rankStyle }}>
                        {rankBadge}
                      </span>
                      <div>
                        <strong style={{ fontSize: 14, color: "var(--text)" }}>
                          {item.displayName || "ผู้ไม่ประสงค์ออกนาม"}
                        </strong>
                        {isCurrentUser && (
                          <span className="badge badge-teal" style={{ marginLeft: 8, fontSize: 10, background: "rgba(236,72,153,0.1)", color: "#ec4899", border: "none" }}>คุณ</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <i className="ti ti-flame" style={{ color: "#f97316", fontSize: 18 }} />
                      <strong style={{ fontSize: 15, fontFamily: "monospace" }}>{item.streakCount || 0}</strong>
                      <span style={{ fontSize: 12, color: "var(--t3)" }}>วันต่อเนื่อง</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Current user rank callout if not in top 10 */}
            {!userRank && uid && (
              <div
                className="card"
                style={{
                  marginTop: 20,
                  padding: 16,
                  borderRadius: 14,
                  border: "0.5px dashed var(--teal)",
                  background: "var(--teal-bg)",
                  textAlign: "center",
                  fontSize: 13
                }}
              >
                คุณยังไม่ได้สะสม Streak หรือไม่อยู่ใน 10 อันดับแรก มาร่วมท้าทายด้วยการอ่านวันละ 10 นาทีขึ้นไปกันเถอะ! 📚🚀
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Edit Reflection Modal ---
function EditReflectionModal({ note, onClose, onSave, theme }) {
  const [text, setText] = useState(note.notes)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!text.trim()) {
      toast.error("กรุณากรอกข้อคิดบันทึก")
      return
    }
    setSaving(true)
    try {
      await onSave(note, text.trim())
      toast.success("แก้ไขบันทึกข้อคิดเรียบร้อยแล้ว")
      onClose()
    } catch (err) {
      console.error(err)
      toast.error("เกิดข้อผิดพลาดในการบันทึก")
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className={`app ${theme || "light"}`} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16
    }}>
      <div className="card" style={{
        maxWidth: 500,
        width: "100%",
        padding: 24,
        background: "var(--card)",
        border: "0.5px solid var(--br)",
        borderRadius: 20,
        boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        animation: "pageFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-edit" style={{ color: "var(--teal)" }}></i> แก้ไขข้อคิดบันทึก
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 20 }}>
            <i className="ti ti-x"></i>
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 8, fontWeight: 500 }}>
            {note.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 12 }}>
            {note.reference}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              background: "var(--bg3)",
              border: "1px solid var(--br)",
              color: "var(--text)",
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
              outline: "none"
            }}
            placeholder="เขียนข้อคิดธรรมสะกิดใจที่นี่..."
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving} style={{ borderRadius: 20 }}>
            ยกเลิก
          </button>
          <button className="btn btn-teal" onClick={handleSave} disabled={saving} style={{ borderRadius: 20 }}>
            {saving ? <i className="ti ti-loader-2 spin"></i> : "บันทึกข้อมูล"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// --- Reflections Panel ---
function ReflectionsPanel({ authState, setView, theme }) {
  const uid = authState?.user?.uid
  const { items: books } = useContentCollection("books", BOOKS, null, { live: false })
  const { items: bookmarkItems, loading: loadingBookmarks, saveItem: saveBookmark } = useUserCollection("quran_bookmarks", uid)
  const { items: sessionItems, loading: loadingSessions, saveItem: saveSession } = useContentCollection("reading_sessions", [], uid, { live: false })
  const [search, setSearch] = useState("")
  const [activeExportCard, setActiveExportCard] = useState(null)
  const [editingNote, setEditingNote] = useState(null)

  const bookmarkNotes = useMemo(() => {
    return bookmarkItems
      .filter(item => item.notes && item.notes.trim())
      .map(item => ({
        id: item.id,
        type: "quran",
        title: `ซูเราะฮ์ ${item.suraName || item.sura} [${item.sura}:${item.aya}]`,
        notes: item.notes,
        arabicText: item.arabicText,
        translation: item.translation,
        date: item.createdAt || item.updatedAt,
        reference: `คัมภีร์อัลกุรอาน ซูเราะฮ์ ${item.suraName || item.sura} อายะฮ์ที่ ${item.aya}`
      }))
  }, [bookmarkItems])

  const sessionNotes = useMemo(() => {
    return sessionItems
      .filter(item => item.reflection && item.reflection.trim())
      .map(item => {
        const book = books.find(b => String(b.id) === String(item.bookId)) || item.customBook || {}
        return {
          id: item.id,
          type: "book",
          title: book.title || "หนังสือทั่วไป",
          notes: item.reflection,
          date: item.completedAt || item.createdAt,
          reference: `หนังสือ: ${book.title || "ทั่วไป"} (หน้า ${item.startPage || 0} - ${item.endPage || 0})`
        }
      })
  }, [sessionItems, books])

  const allNotes = useMemo(() => {
    return [...bookmarkNotes, ...sessionNotes].sort((a, b) => {
      const timeA = a.date ? (typeof a.date.toDate === "function" ? a.date.toDate().getTime() : new Date(a.date).getTime()) : 0
      const timeB = b.date ? (typeof b.date.toDate === "function" ? b.date.toDate().getTime() : new Date(b.date).getTime()) : 0
      return timeB - timeA
    })
  }, [bookmarkNotes, sessionNotes])

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return allNotes
    const q = search.toLowerCase()
    return allNotes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.notes.toLowerCase().includes(q) ||
      (n.translation && n.translation.toLowerCase().includes(q))
    )
  }, [allNotes, search])

  const handleSaveEdit = async (note, newText) => {
    if (note.type === "quran") {
      const bookmark = bookmarkItems.find(b => String(b.id) === String(note.id))
      if (bookmark) {
        await saveBookmark({ ...bookmark, notes: newText })
      }
    } else {
      const session = sessionItems.find(s => String(s.id) === String(note.id))
      if (session) {
        await saveSession({ ...session, reflection: newText })
      }
    }
  }

  const handleDeleteNote = async (note) => {
    const ok = await confirmAction({
      title: "ยืนยันการลบข้อคิด",
      message: "คุณต้องการลบข้อคิดสะกิดใจนี้หรือไม่? (บันทึกเวลาการอ่านจะคงอยู่ แต่ข้อมูลข้อคิดที่เขียนไว้จะถูกลบออก)",
      confirmText: "ใช่, ลบข้อคิด",
      cancelText: "ยกเลิก",
      danger: true
    })
    if (!ok) return

    try {
      if (note.type === "quran") {
        const bookmark = bookmarkItems.find(b => String(b.id) === String(note.id))
        if (bookmark) {
          await saveBookmark({ ...bookmark, notes: "" })
        }
      } else {
        const session = sessionItems.find(s => String(s.id) === String(note.id))
        if (session) {
          await saveSession({ ...session, reflection: "" })
        }
      }
      toast.success("ลบข้อคิดเรียบร้อยแล้ว")
    } catch (err) {
      console.error(err)
      toast.error("เกิดข้อผิดพลาดในการลบ")
    }
  }

  const loading = loadingBookmarks || loadingSessions

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", textAlign: "left" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(168,85,247,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-feather" style={{ color: "#a855f7", fontSize: 20 }}></i>
            </div>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>สมุดบันทึกข้อคิด (My Reflections)</h2>
              <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{filteredNotes.length} รายการ (จดบันทึกจากหนังสือและอัลกุรอาน)</p>
            </div>
          </div>
        </div>

        {allNotes.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>
            คุณยังไม่มีข้อคิดที่บันทึกไว้ เริ่มเขียนบันทึกในห้องอ่านหนังสือ หรือบันทึกข้อคิดในอัลกุรอานเพื่อรวบรวมไว้ที่นี่!
          </div>
        ) : (
          <>
            <div style={{ position: "relative", marginBottom: 20 }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 14 }}></i>
              <input
                placeholder="ค้นหาตามหัวข้อหรือเนื้อหาบันทึก..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, width: "100%", height: 38 }}
              />
            </div>

            {filteredNotes.length === 0 ? (
              <div className="empty" style={{ padding: "30px 0" }}>ไม่พบรายการที่ค้นหา</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredNotes.map(note => (
                  <div key={note.id} className="card" style={{ padding: 20, border: "0.5px solid var(--br)", background: "var(--bg3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                      <span className={`badge ${note.type === "quran" ? "badge-teal" : "badge-outline"}`} style={{ fontSize: 11, borderColor: note.type === "quran" ? "transparent" : "rgba(168,85,247,0.4)", color: note.type === "quran" ? "#fff" : "#a855f7" }}>
                        <i className={`ti ${note.type === "quran" ? "ti-book" : "ti-notebook"}`} style={{ marginRight: 4 }}></i>
                        {note.title}
                      </span>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--teal)", borderColor: "var(--teal)" }}
                          onClick={() => setActiveExportCard(note)}
                        >
                          <i className="ti ti-share"></i> การ์ด
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--t2)", borderColor: "var(--br)" }}
                          onClick={() => setEditingNote(note)}
                        >
                          <i className="ti ti-edit"></i> แก้ไข
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "#e05555", borderColor: "rgba(224,85,85,0.4)" }}
                          onClick={() => handleDeleteNote(note)}
                        >
                          <i className="ti ti-trash"></i> ลบ
                        </button>
                      </div>
                    </div>

                    <div style={{ background: "var(--card)", borderLeft: "3.5px solid var(--teal)", padding: "10px 14px", borderRadius: "0 8px 8px 0" }}>
                      <p style={{ fontSize: 13, color: "var(--text)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {note.notes}
                      </p>
                    </div>

                    {note.type === "quran" && note.translation && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "var(--t3)", fontStyle: "italic", borderTop: "0.5px dashed var(--br2)", paddingTop: 8 }}>
                        คำแปลอายะฮ์: {note.translation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {activeExportCard && (
        <ExportCardModal
          note={activeExportCard}
          theme={theme}
          onClose={() => setActiveExportCard(null)}
        />
      )}
      {editingNote && (
        <EditReflectionModal
          note={editingNote}
          theme={theme}
          onClose={() => setEditingNote(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  )
}

// --- Export Card Modal ---
function ExportCardModal({ note, onClose, theme }) {
  const cardRef = useRef(null)

  const handlePrint = () => {
    const printContent = cardRef.current.innerHTML
    
    const win = window.open("", "_blank")
    win.document.write(`
      <html>
        <head>
          <title>Talib Club Reflection Card</title>
          <link href="https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=Prompt:wght@300;400;500;600&family=Amiri&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Prompt', sans-serif;
              background: #fff;
              color: #1e293b;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card-container {
              background: #fbfbfa;
              border: 2px solid #bba588;
              border-radius: 16px;
              padding: 40px;
              width: 500px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.05);
              text-align: center;
              position: relative;
            }
            .watermark {
              color: #bba588;
              font-size: 11px;
              letter-spacing: 2px;
              text-transform: uppercase;
              margin-top: 30px;
              font-weight: 500;
            }
            .quote-text {
              font-size: 17px;
              line-height: 1.6;
              font-style: italic;
              color: #2c3e50;
              margin: 20px 0;
              white-space: pre-wrap;
            }
            .ref {
              font-size: 12px;
              color: #7f8c8d;
              font-weight: 500;
              margin-top: 15px;
            }
            .divider {
              width: 60px;
              height: 1px;
              background: #bba588;
              margin: 15px auto;
            }
            .arabic {
              font-family: 'Amiri', serif;
              font-size: 26px;
              direction: rtl;
              margin-bottom: 12px;
              color: #0d9488;
              line-height: 1.6;
            }
            @media print {
              body { height: auto; }
              .card-container {
                box-shadow: none;
                border: 2px solid #bba588;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="card-container">
            ${printContent}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `)
    win.document.close()
  }

  const handleCopyText = async () => {
    const text = `"${note.notes}"\n\n— อ้างอิง: ${note.reference}\n(บันทึกผ่าน Talib Club)`
    try {
      await navigator.clipboard.writeText(text)
      toast.success("คัดลอกข้อความบันทึกแล้ว")
    } catch {
      toast.error("คัดลอกล้มเหลว")
    }
  }

  return createPortal(
    <div className={`app ${theme || "light"}`} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16
    }}>
      <div className="card" style={{
        maxWidth: 560,
        width: "100%",
        padding: 24,
        background: "var(--card)",
        border: "0.5px solid var(--br)",
        borderRadius: 20,
        boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        animation: "pageFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        {/* Quote Card Area */}
        <div style={{
          background: theme === "dark" ? "#1e2022" : "#fcfbf7",
          border: "2px solid #cbb598",
          borderRadius: 16,
          padding: "36px 28px",
          textAlign: "center",
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.02)",
          marginBottom: 20,
          color: theme === "dark" ? "#e2e8f0" : "#1e293b"
        }}>
          {/* We wrap the content we want to copy/print in a div with ref */}
          <div ref={cardRef}>
            {note.type === "quran" && note.arabicText && (
              <div class="arabic" dangerouslySetInnerHTML={{ __html: note.arabicText }} />
            )}

            <div class="quote-text">
              "{note.notes}"
            </div>

            <div class="divider" />

            <div class="ref">
              {note.reference}
            </div>

            <div class="watermark">
              Talib Club · ปลูกฝังนิสัยรักการเรียนรู้
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={onClose} style={{ padding: "8px 16px" }}>
            ปิดหน้าต่าง
          </button>
          <button className="btn btn-outline" onClick={handleCopyText} style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-copy"></i> คัดลอกข้อความ
          </button>
          <button className="btn btn-teal" onClick={handlePrint} style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-printer"></i> พิมพ์การ์ด / บันทึก PDF
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
