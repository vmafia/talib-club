import { useEffect, useRef, useState, useMemo } from "react"
import { SITE } from "../data/index.js"
import toast from "react-hot-toast"
import { confirmAction } from "../utils/feedback.jsx"
import { useContentCollection } from "../lib/contentStore.js"
import { ARTICLES, BOOKS } from "../data/index.js"
import { usePWA } from "../hooks/usePWA.js"

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
  { id: "tracking", label: "ตรวจพัสดุ", icon: "ti-package" },
]

export default function Nav({ page, go, theme, setTheme, authState, readingSessions: readingSessionsProp }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const accountRef = useRef(null)
  const notificationRef = useRef(null)

  const {
    isInstallable,
    isInstalled,
    installApp,
    pushState,
    togglePushSubscription
  } = usePWA(authState?.user, authState?.isStaff)

  const uid = authState?.user?.uid
  const { items: articles } = useContentCollection("articles", ARTICLES, null, { limit: 1, orderByField: "createdAt", orderDirection: "desc", live: false })
  const { items: books } = useContentCollection("books", BOOKS, null, { limit: 1, orderByField: "createdAt", orderDirection: "desc", live: false })
  const readingSessions = readingSessionsProp ?? []
  const { items: streakRecords } = useContentCollection("reading_streaks", [], uid, { live: false })

  const userSettings = useMemo(() => {
    if (!uid || !streakRecords) return null
    const found = streakRecords.find(item => item.uid === uid || item.id === uid)
    return normalizeStreakSettings(found, uid)
  }, [streakRecords, uid])

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
      const now = new Date()
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
        if (Notification.permission === "granted") {
          new Notification("📚 ได้เวลาอ่านหนังสือแล้ว!", {
            body: "รักษา Streak ต่อเนื่อง of ท่านด้วยการอ่านบทความหรือหนังสืออย่างน้อย 10 นาทีวันนี้",
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

    // 2. Latest Article Notification
    if (articles && articles.length > 0) {
      const latestArt = articles[0]
      list.push({
        id: `art-${latestArt.id}`,
        title: "บทความวิชาการใหม่",
        desc: `อ่านบทความล่าสุด: "${latestArt.title}" โดย ${latestArt.author}`,
        time: latestArt.date || "เมื่อเร็วๆ นี้",
        icon: "ti-file-text",
        color: "var(--teal)",
        onClick: () => nav("article", latestArt)
      })
    }

    // 3. Latest Book Notification
    if (books && books.length > 0) {
      const latestBook = books[0]
      list.push({
        id: `book-${latestBook.id}`,
        title: "หนังสือและตำราใหม่",
        desc: `ดาวน์โหลดผลงานล่าสุด: "${latestBook.title}" หมวดหมู่ ${latestBook.category}`,
        time: "เมื่อเร็วๆ นี้",
        icon: "ti-book",
        color: "rgb(255, 179, 0)",
        onClick: () => nav("library-detail", latestBook)
      })
    }

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
  }, [articles, books, authState?.user, authState?.profile, uid, userSettings, hasReadToday, timeRemaining])

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

  function nav(id, data = null) {
    go(id, data)
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
        if (authState?.logout) await authState.logout();
        toast.success("ออกจากระบบสำเร็จ", { id: toastId });
        window.location.href = "/"; // รีโหลดหน้าเพื่อเคลียร์ state ทั้งหมด
      } catch (error) {
        toast.error("เกิดข้อผิดพลาดในการออกจากระบบ", { id: toastId });
      }
    }, 600);
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
              <button key={l.id} onClick={() => nav(l.id)} style={mobileButtonStyle(page, l.id)}>
                <i className={`ti ${l.icon}`} style={{ marginRight: 15 }}></i>
                {l.label}
              </button>
            ))}
             <button onClick={() => nav(authState?.user ? "member" : "auth")} style={mobileButtonStyle(page, authState?.user ? "member" : "auth")}>
              <i className={`ti ${authState?.user ? "ti-user-circle" : "ti-login"}`} style={{ marginRight: 15 }}></i>
              {authState?.user ? "บัญชีของฉัน" : "เข้าสู่ระบบ"}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function AccountDropdown({ name, email, photoURL, isStaff, nav, logout, isInstallable, installApp }) {
  return (
    <div style={{
      position: "absolute", right: 0, top: 42, width: 260,
      background: "var(--card)", border: ".5px solid var(--br2)",
      borderRadius: 12, boxShadow: "0 18px 45px rgba(0,0,0,.18)",
      padding: 10, zIndex: 200, color: "var(--text)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 10px", borderBottom: ".5px solid var(--br2)" }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%", background: "var(--teal-bg)",
          color: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, overflow: "hidden",
        }}>
          {photoURL ? <img src={photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (name.trim()[0] || "U").toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {email && <div style={{ fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>}
        </div>
      </div>

      <DropdownItem icon="ti-layout-dashboard" label="แดชบอร์ดสมาชิก" onClick={() => nav("member", { view: "overview" })} />
      <DropdownItem icon="ti-device-desktop" label="ห้องอ่านหนังสือ (จับเวลา)" onClick={() => nav("reader")} />
      <DropdownItem icon="ti-user-circle" label="โปรไฟล์ของฉัน" onClick={() => nav("member", { view: "profile" })} />
      {isStaff && <DropdownItem icon="ti-briefcase" label="Staff Workspace" onClick={() => nav("staff")} />}
      {isStaff && <DropdownItem icon="ti-shield-check" label="Admin Panel" onClick={() => nav("admin")} />}
      {isInstallable && <DropdownItem icon="ti-download" label="ติดตั้งแอป Talib" onClick={installApp} />}

      <div style={{ borderTop: ".5px solid var(--br2)", marginTop: 6, paddingTop: 6 }}>
        <DropdownItem icon="ti-logout" label="ออกจากระบบ" danger onClick={logout} />
      </div>
    </div>
  )
}

function DropdownItem({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", border: "none", background: "transparent", cursor: "pointer",
      color: danger ? "#e05555" : "var(--text)", display: "flex", alignItems: "center",
      gap: 10, padding: "10px 8px", borderRadius: 8, textAlign: "left",
      fontFamily: "'Prompt',sans-serif", fontSize: 12,
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 15, color: danger ? "#e05555" : "var(--teal)" }}></i>
      {label}
    </button>
  )
}

function DesktopNavButton({ item, page, nav }) {
  return (
    <button onClick={() => nav(item.id)} style={{
      background: page === item.id ? "var(--bg2)" : "transparent",
      border: "none", cursor: "pointer", padding: "6px 12px",
      borderRadius: 8, fontSize: 13,
      color: page === item.id ? "var(--text)" : "var(--t2)",
      fontFamily: "'Prompt',sans-serif",
    }}>
      {item.label}
    </button>
  )
}

function mobileButtonStyle(page, id) {
  return {
    display: "block", width: "100%", textAlign: "left", padding: "18px 10px",
    fontSize: 16, background: "transparent", border: "none",
    color: page === id ? "var(--teal)" : "var(--text)", cursor: "pointer",
    fontFamily: "'Prompt',sans-serif",
  }
}

const iconButtonStyle = {
  background: "transparent",
  border: "none",
  fontSize: 20,
  cursor: "pointer",
  color: "var(--text)",
}

function AccountDrawer({ name, email, photoURL, isStaff, nav, logout, onClose, page, isInstallable, installApp }) {
  return (
    <div className="account-drawer" style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div 
        onClick={onClose} 
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(6px)",
          animation: "fadeIn 0.25s ease-out"
        }} 
      />
      <div style={{
        position: "relative",
        background: "var(--card)",
        borderTop: ".5px solid var(--br2)",
        borderRadius: "24px 24px 0 0",
        padding: "16px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -8px 30px rgba(0,0,0,0.15)",
        zIndex: 1001,
        maxHeight: "85vh",
        overflowY: "auto",
        animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}} />
        <div style={{
          width: 40,
          height: 4,
          background: "var(--br2)",
          borderRadius: 2,
          margin: "0 auto 8px",
          opacity: 0.8
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 4px 16px", borderBottom: ".5px solid var(--br2)" }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--teal-bg)",
            color: "var(--teal)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 18,
            overflow: "hidden",
            flexShrink: 0
          }}>
            {photoURL ? <img src={photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (name.trim()[0] || "U").toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            {email && <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>}
          </div>
          <button onClick={onClose} style={{
            background: "var(--bg2)",
            border: "none",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--t2)",
            cursor: "pointer"
          }}>
            <i className="ti ti-x" style={{ fontSize: 16 }}></i>
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <DrawerItem icon="ti-layout-dashboard" label="แดชบอร์ดสมาชิก" onClick={() => { nav("member", { view: "overview" }); onClose(); }} />
          <DrawerItem icon="ti-device-desktop" label="ห้องอ่านหนังสือ (จับเวลา)" onClick={() => { nav("reader"); onClose(); }} />
          <DrawerItem icon="ti-user-circle" label="โปรไฟล์ของฉัน" onClick={() => { nav("member", { view: "profile" }); onClose(); }} />
          {isStaff && <DrawerItem icon="ti-briefcase" label="Staff Workspace" onClick={() => { nav("staff"); onClose(); }} />}
          {isStaff && <DrawerItem icon="ti-shield-check" label="Admin Panel" onClick={() => { nav("admin"); onClose(); }} />}
          {isInstallable && <DrawerItem icon="ti-download" label="ติดตั้งแอป Talib" onClick={() => { installApp(); onClose(); }} />}
        </div>
        <div style={{ borderTop: ".5px solid var(--br2)", paddingTop: 12 }}>
          <DrawerItem icon="ti-logout" label="ออกจากระบบ" danger onClick={() => { logout(); onClose(); }} />
        </div>
      </div>
    </div>
  )
}

function DrawerItem({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      width: "100%",
      border: "none",
      background: danger ? "rgba(224, 85, 85, 0.08)" : "var(--bg2)",
      cursor: "pointer",
      color: danger ? "#e05555" : "var(--text)",
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 16px",
      borderRadius: 12,
      textAlign: "left",
      fontFamily: "'Prompt',sans-serif",
      fontSize: 14,
      fontWeight: 500,
      transition: "background 0.2s"
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 18, color: danger ? "#e05555" : "var(--teal)" }}></i>
      <span style={{ flex: 1 }}>{label}</span>
      <i className="ti ti-chevron-right" style={{ fontSize: 14, opacity: 0.4 }}></i>
    </button>
  )
}

function NotificationDropdown({ notifications, seenIds, markAsRead, onDismiss, onClose, pushState, togglePushSubscription, unreadCount, markAllAsRead }) {
  return (
    <div style={{
      position: "absolute", right: 0, top: 42, width: 330,
      background: "var(--card)", border: ".5px solid var(--br2)",
      borderRadius: 12, boxShadow: "0 18px 45px rgba(0,0,0,.18)",
      padding: 12, zIndex: 200, color: "var(--text)",
      display: "flex", flexDirection: "column"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottom: ".5px solid var(--br2)", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-bell" style={{ color: "var(--teal)" }}></i> การแจ้งเตือน
        </span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} style={{
              background: "transparent", border: "none", cursor: "pointer", color: "var(--teal)", fontSize: 11,
              fontFamily: "'Prompt',sans-serif", fontWeight: 500
            }}>อ่านทั้งหมด</button>
          )}
          <button onClick={onClose} style={{
            background: "transparent", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 11,
            fontFamily: "'Prompt',sans-serif"
          }}>ปิด</button>
        </div>
      </div>

      {pushState && pushState.supported && (
        <div style={{
          background: "var(--bg2)", padding: "10px 12px", borderRadius: 10,
          marginBottom: 10, border: "0.5px solid var(--br2)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}>
            <i className={`ti ${pushState.subscribed ? "ti-bell-ringing" : "ti-bell-off"}`} style={{ color: pushState.subscribed ? "var(--teal)" : "var(--t3)", fontSize: 16 }}></i>
            <span style={{ fontSize: 11, fontWeight: 500 }}>รับการแจ้งเตือนบนเครื่องนี้</span>
          </div>
          <button 
            onClick={togglePushSubscription}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "none",
              background: pushState.subscribed ? "var(--teal-bg)" : "var(--bg3)",
              color: pushState.subscribed ? "var(--teal)" : "var(--t2)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Prompt', sans-serif"
            }}
          >
            {pushState.subscribed ? 'เปิดอยู่' : 'ปิดอยู่'}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>ไม่มีการแจ้งเตือนในขณะนี้</div>
        ) : notifications.map(n => {
          const isUnread = !seenIds.includes(n.id)
          return (
            <div
              key={n.id}
              onClick={() => { markAsRead(n.id); n.onClick(); onClose(); }}
              style={{
                padding: "10px 8px 10px 10px",
                borderRadius: 8,
                background: isUnread ? "rgba(45, 190, 160, 0.08)" : "var(--bg2)",
                border: isUnread ? "0.5px solid rgba(45, 190, 160, 0.2)" : "0.5px solid transparent",
                cursor: "pointer",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                transition: "transform 0.15s ease, background 0.15s ease",
                textAlign: "left",
                position: "relative"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateX(2px)"
                e.currentTarget.style.background = isUnread ? "rgba(45, 190, 160, 0.13)" : "var(--bg3)"
                const dismissBtn = e.currentTarget.querySelector(".dismiss-btn")
                if (dismissBtn) dismissBtn.style.opacity = "1"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none"
                e.currentTarget.style.background = isUnread ? "rgba(45, 190, 160, 0.08)" : "var(--bg2)"
                const dismissBtn = e.currentTarget.querySelector(".dismiss-btn")
                if (dismissBtn) dismissBtn.style.opacity = "0"
              }}
            >
              {/* Unread dot indicator */}
              {isUnread && (
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--teal)",
                  alignSelf: "center",
                  marginRight: 2,
                  flexShrink: 0
                }} />
              )}
              
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: "var(--card)", color: n.color || "var(--teal)",
                display: "grid", placeItems: "center", flexShrink: 0, fontSize: 14,
                border: "0.5px solid var(--br2)"
              }}>
                <i className={`ti ${n.icon}`}></i>
              </div>
              
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{n.title}</div>
                <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 2, lineHeight: 1.4 }}>{n.desc}</div>
                <span style={{ fontSize: 9, color: "var(--t3)", display: "block", marginTop: 4 }}>{n.time}</span>
              </div>

              {/* Dismiss X button */}
              <button 
                className="dismiss-btn"
                onClick={(e) => onDismiss(n.id, e)}
                style={{ 
                  background: "transparent", 
                  border: "none", 
                  color: "var(--t3)", 
                  cursor: "pointer", 
                  padding: "4px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  alignSelf: "center",
                  opacity: 0,
                  transition: "opacity 0.2s, background-color 0.15s, color 0.15s"
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.background = "var(--bg2)";
                  e.currentTarget.style.color = "#e05555";
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--t3)";
                }}
                title="ลบการแจ้งเตือน"
              >
                <i className="ti ti-x" style={{ fontSize: 10 }}></i>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NotificationDrawer({ notifications, seenIds, markAsRead, onDismiss, onClose, pushState, togglePushSubscription, unreadCount, markAllAsRead }) {
  return (
    <div className="notification-drawer" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
      <div 
        onClick={onClose} 
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(2px)",
          animation: "fadeIn 0.2s ease-out"
        }} 
      />
      <div style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "280px",
        background: "var(--bg)",
        padding: "60px 20px",
        borderLeft: "1px solid var(--br2)",
        boxShadow: "-5px 0 15px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        animation: "slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        zIndex: 1001
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 15, borderBottom: "1px solid var(--br2)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-bell" style={{ color: "var(--teal)" }}></i> การแจ้งเตือน
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} style={{
                background: "transparent", border: "none", cursor: "pointer", color: "var(--teal)", fontSize: 12,
                fontFamily: "'Prompt',sans-serif", fontWeight: 500
              }}>อ่านทั้งหมด</button>
            )}
            <button onClick={onClose} style={{
              background: "var(--bg2)",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--t2)",
              cursor: "pointer"
            }}>
              <i className="ti ti-x" style={{ fontSize: 14 }}></i>
            </button>
          </div>
        </div>

        {pushState && pushState.supported && (
          <div style={{
            background: "var(--bg2)", padding: "10px 12px", borderRadius: 10,
            border: "0.5px solid var(--br2)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 8
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}>
              <i className={`ti ${pushState.subscribed ? "ti-bell-ringing" : "ti-bell-off"}`} style={{ color: pushState.subscribed ? "var(--teal)" : "var(--t3)", fontSize: 16 }}></i>
              <span style={{ fontSize: 11, fontWeight: 500 }}>รับการแจ้งเตือนบนเครื่องนี้</span>
            </div>
            <button 
              onClick={togglePushSubscription}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "none",
                background: pushState.subscribed ? "var(--teal-bg)" : "var(--bg3)",
                color: pushState.subscribed ? "var(--teal)" : "var(--t2)",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Prompt', sans-serif"
              }}
            >
              {pushState.subscribed ? 'เปิดอยู่' : 'ปิดอยู่'}
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, overflowY: "auto" }}>
          {notifications.length === 0 ? (
            <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>ไม่มีการแจ้งเตือนในขณะนี้</div>
          ) : notifications.map(n => {
            const isUnread = !seenIds.includes(n.id)
            return (
              <div
                key={n.id}
                onClick={() => { markAsRead(n.id); n.onClick(); onClose(); }}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: isUnread ? "rgba(45, 190, 160, 0.08)" : "var(--card)",
                  border: isUnread ? "0.5px solid rgba(45, 190, 160, 0.2)" : "0.5px solid var(--br2)",
                  cursor: "pointer",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  textAlign: "left",
                  position: "relative"
                }}
              >
                {/* Unread dot indicator */}
                {isUnread && (
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--teal)",
                    alignSelf: "center",
                    marginRight: 2,
                    flexShrink: 0
                  }} />
                )}
                
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: "var(--bg2)", color: n.color || "var(--teal)",
                  display: "grid", placeItems: "center", flexShrink: 0, fontSize: 14
                }}>
                  <i className={`ti ${n.icon}`}></i>
                </div>
                
                <div style={{ minWidth: 0, flex: 1, paddingRight: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 2, lineHeight: 1.4 }}>{n.desc}</div>
                  <span style={{ fontSize: 9, color: "var(--t3)", display: "block", marginTop: 4 }}>{n.time}</span>
                </div>

                {/* Dismiss X button */}
                <button 
                  onClick={(e) => onDismiss(n.id, e)}
                  style={{ 
                    background: "transparent", 
                    border: "none", 
                    color: "var(--t3)", 
                    cursor: "pointer", 
                    padding: "4px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)"
                  }}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    e.currentTarget.style.background = "var(--bg2)";
                    e.currentTarget.style.color = "#e05555";
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--t3)";
                  }}
                  title="ลบการแจ้งเตือน"
                >
                  <i className="ti ti-x" style={{ fontSize: 10 }}></i>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}