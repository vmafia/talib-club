import { useState, useEffect, useMemo, useCallback } from "react"
import { collection, query, where, getCountFromServer, getDocs, limit } from "firebase/firestore"
import { db } from "../../lib/firebase.js"
import { useUserDoc } from "../../lib/contentStore.js"
import DashboardNav from "../DashboardNav.jsx"

// Module-level cache to persist data across unmount/remount when switching tabs in Dashboard
let cachedOverviewCounts = null
let cachedOverviewStreak = 0
let cachedOverviewTimestamp = 0
let cachedOverviewUid = null
const OVERVIEW_CACHE_TTL = 60 * 1000 // 1 minute

export default function Overview({ authState, go, setView, onOpenQuran, onOpenSavedVerses }) {
  const [lastRead, setLastRead] = useState(null)

  const uid = authState?.user?.uid
  const { item: remoteLastRead } = useUserDoc("quran_last_read", uid, uid ? `${uid}_last_read` : null)

  const [counts, setCounts] = useState({
    activeBooks: 0,
    finishedBooks: 0,
    bookmarkCount: 0,
    sessionCount: 0,
  })
  const [streakCount, setStreakCount] = useState(0)
  const [loadingCounts, setLoadingCounts] = useState(true)

  // Memoize fetch function to prevent duplicate queries on re-render
  const fetchOverviewData = useCallback(async (userId) => {
    if (!userId) return

    const now = Date.now()
    if (
      cachedOverviewUid === userId &&
      cachedOverviewCounts &&
      now - cachedOverviewTimestamp < OVERVIEW_CACHE_TTL
    ) {
      setCounts(cachedOverviewCounts)
      setStreakCount(cachedOverviewStreak)
      setLoadingCounts(false)
      return
    }

    setLoadingCounts(true)
    
    try {
      const [
        activeBooksSnap,
        finishedBooksSnap,
        bookmarkSnap,
        sessionSnap,
        streakSnap,
      ] = await Promise.all([
        getCountFromServer(query(collection(db, "content_bookshelf"), where("uid", "==", userId), where("status", "!=", "finished"))),
        getCountFromServer(query(collection(db, "content_bookshelf"), where("uid", "==", userId), where("status", "==", "finished"))),
        getCountFromServer(query(collection(db, "content_quran_bookmarks"), where("uid", "==", userId))),
        getCountFromServer(query(collection(db, "content_reading_sessions"), where("uid", "==", userId), where("verified", "==", true))),
        getDocs(query(collection(db, "content_reading_streaks"), where("uid", "==", userId), limit(1))),
      ])
      
      let streakVal = 0
      if (!streakSnap.empty) {
        streakVal = streakSnap.docs[0].data()?.streakCount || 0
      }
      
      const newCounts = {
        activeBooks: activeBooksSnap.data().count,
        finishedBooks: finishedBooksSnap.data().count,
        bookmarkCount: bookmarkSnap.data().count,
        sessionCount: sessionSnap.data().count,
      }

      // Update cache
      cachedOverviewCounts = newCounts
      cachedOverviewStreak = streakVal
      cachedOverviewTimestamp = now
      cachedOverviewUid = userId
      
      setCounts(newCounts)
      setStreakCount(streakVal)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("Failed to load overview counts:", err)
      }
    } finally {
      setLoadingCounts(false)
    }
  }, [])

  useEffect(() => {
    if (!uid) {
      setLoadingCounts(false)
      return
    }
    fetchOverviewData(uid)
  }, [uid, fetchOverviewData])

  const sessionCount = counts.sessionCount
  const streakSettings = { streakCount }
  const finishedCount = counts.finishedBooks
  const bookmarkCount = counts.bookmarkCount
  const activeBooksCount = counts.activeBooks
  const userSavedVersesCount = counts.bookmarkCount
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
      if (import.meta.env.DEV) {
        console.error(err)
      }
    }
  }, [remoteLastRead, uid])

  if (loadingCounts) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)", marginBottom: 8 }}></i>
        <p style={{ fontSize: 13, color: "var(--t3)", fontFamily: "'Prompt', sans-serif" }}>กำลังโหลดสถิติของคุณ...</p>
      </div>
    )
  }

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
        activeBooksCount={activeBooksCount} 
        userSavedVersesCount={userSavedVersesCount} 
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
