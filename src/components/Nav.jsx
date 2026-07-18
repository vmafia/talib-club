import { useEffect, useRef, useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { SITE } from "../data/index.js"

import { getPagePath } from "../utils/url.js"
import toast from "react-hot-toast"
import { confirmAction } from "../utils/feedback.jsx"
import { useContentCollection, useUserDoc, invalidateContentCache } from "../lib/contentStore.js"
import { ARTICLES, BOOKS } from "../data/index.js"
import { usePWA } from "../hooks/usePWA.js"
import { AccountDropdown, AccountDrawer } from "./nav/AccountComponents.jsx"
import { NotificationDropdown, NotificationDrawer } from "./nav/NotificationComponents.jsx"
// M2: Import shared utilities instead of duplicating them
import { getMs as getTimeMs, getLocalDayKey } from "../utils/streak.js"
import { safeDateNow } from "../utils/time.js"




function normalizeStreakSettings(settings, uid) {
  const protectedDays = Array.isArray(settings?.protectedDays) ? settings.protectedDays : []
  const reminderTimes = Array.isArray(settings?.reminderTimes) ? settings.reminderTimes : []
  return {
    id: uid,
    uid,
    protectedDays,
    remindersEnabled: settings?.remindersEnabled ?? false,
    reminderTimes,
  }
}


const NAV_LINKS = [
  { id: "home", label: "หน้าหลัก", icon: "ti-home" },
  { id: "articles", label: "บทความ", icon: "ti-file-text" },
  { id: "library", label: "ห้องสมุด", icon: "ti-books" },
  { id: "media", label: "มีเดีย", icon: "ti-player-play" },
  { id: "scholars", label: "ทำเนียบบุคคล", icon: "ti-users" },
  { id: "openhouse", label: "แหล่งเรียนรู้", icon: "ti-map" },
]

export default function Nav({ page, go, theme, setTheme, authState, readingSessions: readingSessionsProp }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [dynamicNotifications, setDynamicNotifications] = useState([])
  const accountRef = useRef(null)
  const notificationRef = useRef(null)
  const goRef = useRef(go)

  useEffect(() => { goRef.current = go }, [go])

  useEffect(() => {
    let unsubs = []
    async function setupDynamicNotifications() {
      try {
        const { collection, query, orderBy, limit, onSnapshot } = await import("firebase/firestore")
        const { db } = await import("../lib/firebase.js")
        
        const latestDocs = { article: null, media: null, book: null, campaign: null }

        const updateNotifs = () => {
          const newNotifs = []
          const { article, media, book, campaign } = latestDocs
          
          if (article) {
            newNotifs.push({
              id: `art-${article.id}`,
              title: "บทความวิชาการใหม่",
              desc: `อ่านบทความล่าสุด: "${article.title}" โดย ${article.author || "Talib Club"}`,
              time: article.date || "เมื่อเร็วๆ นี้",
              icon: "ti-file-text",
              color: "var(--teal)",
              onClick: () => { goRef.current("article", article); setMenuOpen(false); setAccountOpen(false); setNotificationOpen(false) }
            })
          }
          
          if (media) {
            newNotifs.push({
              id: `media-${media.id}`,
              title: "คลิปวิดีโอใหม่",
              desc: `รับชม: "${media.title}"`,
              time: media.date || "เมื่อเร็วๆ นี้",
              icon: "ti-brand-youtube",
              color: "#e05555",
              onClick: () => { goRef.current("media-detail", media); setMenuOpen(false); setAccountOpen(false); setNotificationOpen(false) }
            })
          }
          
          if (book) {
            newNotifs.push({
              id: `book-${book.id}`,
              title: "หนังสือและตำราใหม่",
              desc: `ดาวน์โหลดผลงานล่าสุด: "${book.title}" หมวดหมู่ ${book.category}`,
              time: "เมื่อเร็วๆ นี้",
              icon: "ti-book",
              color: "rgb(255, 179, 0)",
              onClick: () => { goRef.current("library-detail", book); setMenuOpen(false); setAccountOpen(false); setNotificationOpen(false) }
            })
          }

          if (campaign) {
            newNotifs.push({
              id: `camp-${campaign.id}`,
              title: "แจกหนังสือ/ตำราใหม่",
              desc: `แคมเปญใหม่: "${campaign.title || campaign.items?.[0]?.name || "แจกหนังสือฟรี"}" มารับได้เลย!`,
              time: "เมื่อเร็วๆ นี้",
              icon: "ti-gift",
              color: "var(--teal)",
              onClick: () => { goRef.current("books"); setMenuOpen(false); setAccountOpen(false); setNotificationOpen(false) }
            })
          }
          
          setDynamicNotifications(newNotifs)
        }

        const watchLatestDoc = (colName, orderField, key) => {
          const q = query(collection(db, colName), orderBy(orderField, "desc"), limit(10))
          const unsub = onSnapshot(q, (snap) => {
            if (snap.empty) {
              latestDocs[key] = null
            } else {
              const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
              const validDoc = docs.find(d => d.deleted !== true)
              latestDocs[key] = validDoc || null
            }
            updateNotifs()
          }, (err) => console.error("Error watching notifications:", err))
          unsubs.push(unsub)
        }

        watchLatestDoc("content_articles", "date", "article")
        watchLatestDoc("content_media", "date", "media")
        watchLatestDoc("content_books", "year", "book")
        watchLatestDoc("book_campaigns", "createdAt", "campaign")
        
      } catch(e) {
        console.error("Failed to setup dynamic notifications:", e)
      }
    }
    
    setupDynamicNotifications()
    
    return () => {
      unsubs.forEach(unsub => unsub && unsub())
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen)
    return () => document.body.classList.remove("menu-open")
  }, [menuOpen])

  const {
    isInstallable,
    isInstalled,
    installApp,
    pushState,
    togglePushSubscription
  } = usePWA(authState?.user, authState?.isStaff)

  const uid = authState?.user?.uid
  const readingSessions = readingSessionsProp ?? []
  const { item: streakRecord } = useUserDoc("reading_streaks", uid, uid, null)

  const userSettings = useMemo(() => {
    if (!uid) return null
    return normalizeStreakSettings(streakRecord, uid)
  }, [streakRecord, uid])

  const hasReadToday = useMemo(() => {
    if (!uid || !readingSessions) return false
    const today = getLocalDayKey(Date.now())
    return readingSessions.some(
      session => session.uid === uid && 
      session.verified && 
      (session.dayKey || getLocalDayKey(session.completedAt || session.createdAt)) === today
    )
  }, [readingSessions, uid])

  const [currentHM, setCurrentHM] = useState("")
  const [timeRemaining, setTimeRemaining] = useState("") // Countdown timer for 23:00 - 00:00

  // We keep a record of times we've alerted today to prevent duplicate alerts in the same minute
  const alertedTimesRef = useRef({ date: "", times: new Set() })

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date(safeDateNow())
      const todayStr = getLocalDayKey(now.getTime())
      
      // Reset alerted times if day changed
      if (alertedTimesRef.current.date !== todayStr) {
        alertedTimesRef.current = { date: todayStr, times: new Set() }
      }

      // Check current time
      const currentHours = String(now.getHours()).padStart(2, "0")
      const currentMinutes = String(now.getMinutes()).padStart(2, "0")
      const hm = `${currentHours}:${currentMinutes}`
      setCurrentHM(hm)

      // Calculate countdown time if it's 23:00-00:00
      if (now.getHours() === 23) {
        const secondsRemaining = 3600 - (now.getMinutes() * 60 + now.getSeconds())
        const m = Math.floor(secondsRemaining / 60)
        const s = secondsRemaining % 60
        setTimeRemaining(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`)
      } else {
        setTimeRemaining("")
      }

      // Check custom reminder matching
      if (
        userSettings?.remindersEnabled && 
        userSettings.reminderTimes.includes(hm) && 
        !hasReadToday && 
        !alertedTimesRef.current.times.has(hm)
      ) {
        alertedTimesRef.current.times.add(hm)
        
        // Show Toast
        toast("📚 ได้เวลาอ่านหนังสือรายวันแล้ว! ช่วยรักษา Streak ของคุณด้วยการอ่านหนังสือสักนิด", {
          icon: "🔔",
          duration: 6000
        })

        // Trigger PWA/OS Alert if supported & permitted
        // M3: Guard against browsers without Notification API (e.g. iOS Safari)
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("📚 ได้เวลาอ่านหนังสือแล้ว!", {
            // M4: Fixed Thai typo ("of" → "ของ")
            body: "รักษา Streak ต่อเนื่องของท่านด้วยการอ่านบทความหรือหนังสืออย่างน้อย 10 นาทีวันนี้",
            icon: "/icon-192.png"
          })
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [userSettings, hasReadToday])


  const notifications = useMemo(() => {
    const list = []
    
    // 1. Welcome Notification
    list.push({
      id: "welcome",
      title: "ยินดีต้อนรับสู่ Talib Club!",
      desc: `ขอให้อัลลอฮฺทรงเพิ่มพูนความรู้ที่เป็นประโยชน์แก่ท่านในการศึกษาอิสลาม`,
      time: "ระบบ",
      icon: "ti-gift",
      color: "var(--teal)",
      onClick: () => nav("member", { view: "profile" })
    })

    // 2. Dynamic Latest Content Notifications
    list.push(...dynamicNotifications)

    // 4. Feature Announcement
    list.push({
      id: "sync-feature",
      title: "ซิงก์ข้อมูลระหว่างอุปกรณ์",
      desc: "ประวัติการอ่านและอายะฮ์ที่ท่านบันทึกไว้จะเชื่อมโยงกับบัญชีของท่านโดยอัตโนมัติ เพื่อการเข้าใช้งานจากทุกอุปกรณ์",
      time: "ระบบ",
      icon: "ti-cloud-upload",
      color: "#3b73c4",
      onClick: () => nav("member", { view: "profile" })
    })

    // 5. Mandatory 23:00 Countdown (bypasses remindersEnabled)
    if (uid && !hasReadToday) {
      const now = new Date()
      if (now.getHours() === 23) {
        list.unshift({
          id: "streak-countdown",
          title: "⚠️ วันนี้คุณยังไม่ได้อ่านหนังสือ!",
          desc: `กรุณาเข้ามาอ่านหนังสือเพื่อรักษา Streak ของคุณ! เวลาคงเหลือ: ${timeRemaining || "59:59"} นาที`,
          time: "ด่วนที่สุด",
          icon: "ti-alert-triangle",
          color: "#ff4444",
          onClick: () => nav("reader")
        })
      }
    }

    // 6. Daily Reading Reminders (gated by remindersEnabled)
    if (uid && userSettings?.remindersEnabled && !hasReadToday) {
      userSettings.reminderTimes.forEach(timeStr => {
        const [h, m] = timeStr.split(":").map(Number)
        const remDate = new Date()
        remDate.setHours(h, m, 0, 0)
        
        if (Date.now() >= remDate.getTime()) {
          list.push({
            id: `reminder-${timeStr}`,
            title: "🔔 แจ้งเตือนเวลาอ่านหนังสือ",
            desc: `ถึงเวลาที่คุณตั้งค่าไว้เพื่ออ่านหนังสือแล้ว (${timeStr} น.) เข้ามาอ่านเพื่อรักษา Streak กันเถอะ`,
            time: `${timeStr} น.`,
            icon: "ti-alarm",
            color: "var(--teal)",
            onClick: () => nav("reader")
          })
        }
      })
    }

    return list
  }, [dynamicNotifications, authState?.user, authState?.profile, uid, userSettings, hasReadToday, timeRemaining])

  const [seenIds, setSeenIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("talib_seen_notifications") || "[]")
    } catch {
      return []
    }
  })

  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("talib_dismissed_notifications") || "[]")
    } catch {
      return []
    }
  })

  const [unreadCount, setUnreadCount] = useState(0)

  // Filter visible (non-dismissed) notifications
  const visibleNotifications = useMemo(() => {
    return notifications.filter(n => !dismissedIds.includes(n.id))
  }, [notifications, dismissedIds])

  useEffect(() => {
    const unseen = visibleNotifications.filter(n => !seenIds.includes(n.id))
    setUnreadCount(unseen.length)
  }, [visibleNotifications, seenIds])

  const markAllAsRead = () => {
    try {
      const ids = visibleNotifications.map(n => n.id)
      const merged = Array.from(new Set([...seenIds, ...ids]))
      localStorage.setItem("talib_seen_notifications", JSON.stringify(merged))
      setSeenIds(merged)
      setUnreadCount(0)
    } catch (e) {
      console.error(e)
    }
  }

  const markAsRead = (id) => {
    try {
      const merged = Array.from(new Set([...seenIds, id]))
      localStorage.setItem("talib_seen_notifications", JSON.stringify(merged))
      setSeenIds(merged)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDismissNotification = (id, e) => {
    e.stopPropagation()
    const next = [...dismissedIds, id]
    setDismissedIds(next)
    localStorage.setItem("talib_dismissed_notifications", JSON.stringify(next))
  }

  const toggleNotifications = () => {
    setNotificationOpen(!notificationOpen)
    setAccountOpen(false)
  }

  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setMenuOpen(false)
    }
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  useEffect(() => {
    function closeDropdowns(e) {
      if (e.target.closest(".account-drawer") || e.target.closest(".notification-drawer")) {
        return
      }
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false)
      if (notificationRef.current && !notificationRef.current.contains(e.target)) setNotificationOpen(false)
    }
    function closeOnEsc(e) {
      if (e.key === "Escape") {
        setAccountOpen(false)
        setNotificationOpen(false)
      }
    }
    document.addEventListener("mousedown", closeDropdowns)
    document.addEventListener("keydown", closeOnEsc)
    return () => {
      document.removeEventListener("mousedown", closeDropdowns)
      document.removeEventListener("keydown", closeOnEsc)
    }
  }, [])

  function nav(id, data = null, isLink = false) {
    if (!isLink) {
      go(id, data)
    }
    setMenuOpen(false)
    setAccountOpen(false)
    setNotificationOpen(false)
  }

  // แก้ไขระบบออกจากระบบให้สมูทขึ้น
  async function logout() {
    const ok = await confirmAction({
      title: "ออกจากระบบ?",
      message: "คุณต้องการออกจากระบบหรือไม่?",
      confirmText: "ออกจากระบบ",
      danger: true
    });
    if (!ok) return;

    const toastId = toast.loading("กำลังออกจากระบบ...");

    setTimeout(async () => {
      try {
        invalidateContentCache();
        if (authState?.logout) await authState.logout();
        toast.success("ออกจากระบบสำเร็จ", { id: toastId });
        nav("home"); // เปลี่ยนหน้าแบบ SPA ลื่นๆ โดยไม่ต้องรีโหลดหน้าเว็บใหม่
      } catch (error) {
        toast.error("เกิดข้อผิดพลาดในการออกจากระบบ", { id: toastId });
      }
    }, 400);
  }

  const userName = authState?.profile?.displayName || authState?.user?.displayName || authState?.user?.email || "บัญชีของฉัน"
  const userInitial = (userName.trim()[0] || "U").toUpperCase()
  const [avatarBroken, setAvatarBroken] = useState(false)
  const photoURL = avatarBroken ? "" : authState?.user?.photoURL

  return (
    <>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: ".5px solid var(--br2)",
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--nav-bg)", backdropFilter: "blur(14px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          {isMobile && (
            <button onClick={() => setMenuOpen(!menuOpen)} style={iconButtonStyle} aria-label={menuOpen ? "Close menu" : "Open menu"}>
              <i className={`ti ${menuOpen ? "ti-x" : "ti-menu-2"}`}></i>
            </button>
          )}
          <div style={{ fontWeight: 600, cursor: "pointer", fontSize: 16 }} onClick={() => nav("home")}>
          <span style={{ 
  fontFamily: '"Times New Roman", Times, serif', 
  color: "var(--text)", /* <-- เปลี่ยนเป็น var(--text) */
  fontSize: "24px",                              
  fontWeight: "bold",                            
  letterSpacing: "1px",                          
  textTransform: "uppercase"                     
}}>
  Talib
</span>
          </div>
        </div>

        {!isMobile && (
          <div style={{ display: "flex", gap: "8px" }}>
            {NAV_LINKS.map(l => <DesktopNavButton key={l.id} item={l} page={page} nav={nav} />)}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {authState?.user && (
            <div ref={notificationRef} style={{ position: "relative" }}>
              <button
                onClick={toggleNotifications}
                style={{
                  background: notificationOpen ? "var(--teal-bg)" : "var(--bg2)",
                  border: "none", cursor: "pointer",
                  color: notificationOpen ? "var(--teal)" : "var(--t3)",
                  padding: 0,
                  borderRadius: 20, width: 34, height: 34,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative"
                }}
                title="การแจ้งเตือน"
                aria-label="เมนูการแจ้งเตือน"
                aria-expanded={notificationOpen}
              >
                <i className="ti ti-bell" style={{ fontSize: 18 }}></i>
                {unreadCount > 0 && (
                  <span style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#e05555",
                    border: "1.5px solid var(--nav-bg)"
                  }} />
                )}
              </button>

              {notificationOpen && !isMobile && (
                <NotificationDropdown
                  notifications={visibleNotifications}
                  seenIds={seenIds}
                  markAsRead={markAsRead}
                  onDismiss={handleDismissNotification}
                  onClose={() => setNotificationOpen(false)}
                  pushState={pushState}
                  togglePushSubscription={togglePushSubscription}
                  unreadCount={unreadCount}
                  markAllAsRead={markAllAsRead}
                />
              )}
            </div>
          )}

          <div ref={accountRef} style={{ position: "relative" }}>
            <button
              onClick={() => authState?.user ? setAccountOpen(open => !open) : nav("auth")}
              style={{
                background: authState?.user ? "var(--teal-bg)" : "var(--bg2)",
                border: "none", cursor: "pointer",
                color: authState?.user ? "var(--teal)" : "var(--t3)",
                padding: authState?.user ? 0 : "6px 14px", // ปรับ padding
                borderRadius: 20, width: authState?.user ? 34 : "auto",
                height: authState?.user ? 34 : "auto",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: "6px", // เพิ่มช่องไฟระหว่างไอคอนและข้อความ
                fontFamily: "'Prompt',sans-serif", fontWeight: 600,
              }}
              title={authState?.user ? "บัญชีของฉัน" : "เข้าสู่ระบบ"}
              aria-label={authState?.user ? "เมนูบัญชี" : "เข้าสู่ระบบ"}
              aria-expanded={accountOpen}
            >
              {authState?.user ? (
                photoURL
                  ? <img src={photoURL} alt="" onError={() => setAvatarBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  : userInitial
              ) : (
                <>
                  <i className="ti ti-login" style={{ fontSize: 16 }}></i>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>เข้าสู่ระบบ</span>
                </>
              )}
            </button>

            {authState?.user && accountOpen && !isMobile && (
              <AccountDropdown
                name={userName}
                email={authState.user?.email}
                photoURL={photoURL}
                isStaff={authState.isStaff}
                nav={nav}
                logout={logout}
                isInstallable={isInstallable}
                installApp={installApp}
              />
            )}
          </div>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} style={{
            background: "var(--bg2)", border: "none", cursor: "pointer",
            color: "var(--t3)", width: 34, height: 34, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center"
          }} title="เปลี่ยนธีม" aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>
            <i className={`ti ${theme === "light" ? "ti-moon" : "ti-sun"}`}></i>
          </button>
        </div>
      </nav>

      {authState?.user && accountOpen && isMobile && (
        <AccountDrawer
          name={userName}
          email={authState.user?.email}
          photoURL={photoURL}
          isStaff={authState.isStaff}
          nav={nav}
          logout={logout}
          onClose={() => setAccountOpen(false)}
          page={page}
          isInstallable={isInstallable}
          installApp={installApp}
        />
      )}

      {authState?.user && notificationOpen && isMobile && (
        <NotificationDrawer
          notifications={visibleNotifications}
          seenIds={seenIds}
          markAsRead={markAsRead}
          onDismiss={handleDismissNotification}
          onClose={() => setNotificationOpen(false)}
          pushState={pushState}
          togglePushSubscription={togglePushSubscription}
          unreadCount={unreadCount}
          markAllAsRead={markAllAsRead}
        />
      )}

      {isMobile && menuOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
          <div onClick={() => setMenuOpen(false)} style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)",
          }} />
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: "280px",
            background: "var(--bg)", padding: "60px 20px",
            borderRight: "1px solid var(--br2)", boxShadow: "5px 0 15px rgba(0,0,0,0.1)",
          }}>
            {NAV_LINKS.map(l => (
              <Link key={l.id} to={getPagePath(l.id)} onClick={() => nav(l.id, null, true)} style={mobileButtonStyle(page, l.id)}>
                <i className={`ti ${l.icon}`} style={{ marginRight: 15 }}></i>
                {l.label}
              </Link>
            ))}
             <Link to={getPagePath(authState?.user ? "member" : "auth")} onClick={() => nav(authState?.user ? "member" : "auth", null, true)} style={mobileButtonStyle(page, authState?.user ? "member" : "auth")}>
              <i className={`ti ${authState?.user ? "ti-user-circle" : "ti-login"}`} style={{ marginRight: 15 }}></i>
              {authState?.user ? "บัญชีของฉัน" : "เข้าสู่ระบบ"}
            </Link>
          </div>
        </div>
      )}
    </>
  )
}

function DesktopNavButton({ item, page, nav }) {
  return (
    <Link to={getPagePath(item.id)} onClick={() => { nav(item.id, null, true) }} style={{
      background: page === item.id ? "var(--bg2)" : "transparent",
      border: "none", cursor: "pointer", padding: "6px 12px",
      borderRadius: 8, fontSize: 13,
      color: page === item.id ? "var(--text)" : "var(--t2)",
      fontFamily: "'Prompt',sans-serif",
      textDecoration: "none",
      display: "inline-block"
    }}>
      {item.label}
    </Link>
  )
}

function mobileButtonStyle(page, id) {
  return {
    display: "block", width: "100%", textAlign: "left", padding: "18px 10px",
    fontSize: 16, background: "transparent", border: "none",
    color: page === id ? "var(--teal)" : "var(--text)", cursor: "pointer",
    fontFamily: "'Prompt',sans-serif",
    textDecoration: "none",
    boxSizing: "border-box"
  }
}

const iconButtonStyle = {
  background: "transparent",
  border: "none",
  fontSize: 20,
  cursor: "pointer",
  color: "var(--text)",
}
