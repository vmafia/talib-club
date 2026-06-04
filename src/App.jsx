import { Component, useEffect, useState, lazy, Suspense, useRef } from "react"
import { useTheme } from "./hooks/useTheme.js"
import { useAuth } from "./hooks/useAuth.js"
import Nav from "./components/Nav.jsx"

const lazyWithRetry = (componentImport) => {
  return lazy(() =>
    componentImport().catch((error) => {
      console.error("Chunk load failed, forcing page reload...", error);
      const hasReloaded = window.sessionStorage.getItem("chunk-reload");
      if (!hasReloaded) {
        window.sessionStorage.setItem("chunk-reload", "true");
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    })
  );
};

const Home = lazyWithRetry(() => import("./pages/Home.jsx"))
const Articles = lazyWithRetry(() => import("./pages/Articles.jsx"))
const ReadingApp = lazyWithRetry(() => import("./pages/ReadingApp.jsx"))
const ArticleDetail = lazyWithRetry(() => import("./pages/ArticleDetail.jsx"))
const Library = lazyWithRetry(() => import("./pages/Library.jsx"))
const LibraryDetail = lazyWithRetry(() => import("./pages/LibraryDetail.jsx"))
const Media = lazyWithRetry(() => import("./pages/Media.jsx"))
const MediaDetail = lazyWithRetry(() => import("./pages/MediaDetail.jsx"))
const Scholars = lazyWithRetry(() => import("./pages/Scholars.jsx"))
const Quran = lazyWithRetry(() => import("./pages/Quran.jsx"))
const Tracking = lazyWithRetry(() => import("./pages/Tracking.jsx"))
const Auth = lazyWithRetry(() => import("./pages/Auth.jsx"))
const MemberDashboard = lazyWithRetry(() => import("./pages/MemberDashboard.jsx"))
const StaffDashboard = lazyWithRetry(() => import("./pages/StaffDashboard.jsx"))
const StaffWork = lazyWithRetry(() => import("./pages/StaffWork.jsx"))
const StaffTranslation = lazyWithRetry(() => import("./pages/StaffTranslation.jsx"))
const Admin = lazyWithRetry(() => import("./pages/Admin.jsx"))
const Donation = lazyWithRetry(() => import("./pages/Donation.jsx"))
import { Toaster } from "react-hot-toast"
import PWAInstallBanner from "./components/PWAInstallBanner.jsx"
import "./styles/global.css"
import { useContentCollection } from "./lib/contentStore.js"

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

export default function App() {
  const { theme, setTheme } = useTheme()
  const authState = useAuth()
  const [page, setPage] = useState("home")
  const [ctx, setCtx] = useState(null)
  const [countdownText, setCountdownText] = useState("")

  const uid = authState?.user?.uid
  const { items: readingSessions } = useContentCollection("reading_sessions", [], uid, { live: false })
  const countdownNotifRef = useRef(null)

  // --- Preferred Time Notification (60s interval, gated by user toggle) ---
  useEffect(() => {
    if (!uid) return
    const interval = setInterval(() => {
      const isNotifEnabled = localStorage.getItem("talib_notif_enabled") === "true"
      if (!isNotifEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return
      const now = new Date()
      const todayKey = getLocalDayKey(now.getTime())
      const notifTime = localStorage.getItem("talib_notif_time") || "20:00"
      const [prefHour, prefMin] = notifTime.split(":").map(Number)
      if (now.getHours() === prefHour && now.getMinutes() === prefMin) {
        const lastSent = localStorage.getItem("talib_last_pref_notif_sent")
        if (lastSent !== todayKey) {
          localStorage.setItem("talib_last_pref_notif_sent", todayKey)
          new Notification("ได้เวลาอ่านหนังสือแล้ว 📖", {
            body: "มาร่วมสร้างนิสัยการอ่านและสะสม streak วันนี้กันเถอะ!",
            tag: "preferred-time-notif"
          })
        }
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [uid])

  // --- Realtime Countdown Banner & Mandatory Notification (1s tick, 23:00 hour) ---
  useEffect(() => {
    if (!uid) return
    const interval = setInterval(() => {
      const now = new Date()
      if (now.getHours() === 23) {
        const todayKey = getLocalDayKey(now.getTime())
        const todaySessions = readingSessions.filter(
          item =>
            item.uid === uid &&
            item.verified &&
            (item.dayKey || getLocalDayKey(item.completedAt || item.createdAt)) === todayKey
        )
        const todaySeconds = todaySessions.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0)
        if (todaySeconds < 600) {
          const secondsLeft = 3600 - (now.getMinutes() * 60 + now.getSeconds())
          const m = Math.floor(secondsLeft / 60)
          const s = secondsLeft % 60
          setCountdownText(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`)
          // Mandatory native notification every 5 min (bypasses user toggle)
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            if (now.getMinutes() % 5 === 0 && now.getSeconds() < 2) {
              const notif = new Notification("รีบด่วน! เหลือเวลารักษา Streak ⏰", {
                body: `คุณเหลือเวลาอีก ${m} นาที ${s} วินาที!`,
                tag: "streak-countdown",
                requireInteraction: true
              })
              countdownNotifRef.current = notif
            }
          }
        } else {
          setCountdownText("")
          if (countdownNotifRef.current) {
            countdownNotifRef.current.close()
            countdownNotifRef.current = null
          }
        }
      } else {
        setCountdownText("")
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [uid, readingSessions])

  const urlToPage = {
    "": "home",
    "articles": "articles",
    "article": "article",
    "library": "library",
    "library-detail": "library-detail",
    "media": "media",
    "media-detail": "media-detail",
    "scholars": "scholars",
    "quran": "quran",
    "tracking-system": "tracking",
    "auth": "auth",
    "member": "member",
    "staff": "staff",
    "staff-work": "staff-work",
    "staff-translation": "staff-translation",
    "admin": "admin",
    "donate": "donate",
    "reader": "reader",
  }

  useEffect(() => {
    const handlePopstate = (event) => {
      if (event && event.state && event.state.page) {
        setPage(event.state.page)
        setCtx(event.state.ctx || null)
      } else {
        const path = window.location.pathname.replace(/^\//, "")
        const mapped = urlToPage[path] || "home"
        setPage(mapped)
        
        // Restore context from query parameters on browser history navigation
        const params = new URLSearchParams(window.location.search)
        const parsedCtx = {}
        for (const [key, val] of params.entries()) {
          parsedCtx[key] = val
        }
        setCtx(Object.keys(parsedCtx).length > 0 ? parsedCtx : null)
      }
    }

    const initialPath = window.location.pathname.replace(/^\//, "")
    const initialPage = urlToPage[initialPath] || "home"
    
    // Restore context from query parameters on initial page load
    const params = new URLSearchParams(window.location.search)
    const initialCtx = {}
    for (const [key, val] of params.entries()) {
      initialCtx[key] = val
    }
    const finalCtx = Object.keys(initialCtx).length > 0 ? initialCtx : null

    window.history.replaceState({ page: initialPage, ctx: finalCtx }, "", window.location.pathname + window.location.search)
    setPage(initialPage)
    setCtx(finalCtx)

    window.sessionStorage.removeItem("chunk-reload");

    window.addEventListener("popstate", handlePopstate)
    return () => window.removeEventListener("popstate", handlePopstate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (p, data = null, options = {}) => {
    setPage(p)
    setCtx(data)
    if (!options.noScroll) {
      window.scrollTo(0, 0)
    }
    
    let urlPath = "/";
    if (p === "tracking") {
      urlPath = "/tracking-system";
    } else if (p !== "home") {
      urlPath = "/" + p;
    }
    
    // Embed context parameters automatically into the URL query string
    if (data) {
      const qParams = new URLSearchParams()
      if (["article", "library-detail", "media-detail"].includes(p) && data.id) {
        // For detail pages, only serialize 'id' to keep URLs clean, short, and shareable!
        qParams.set("id", String(data.id))
      } else {
        Object.entries(data).forEach(([key, val]) => {
          if (val !== null && val !== undefined && typeof val !== "object") {
            qParams.set(key, String(val))
          }
        })
      }
      const queryString = qParams.toString()
      if (queryString) {
        urlPath += `?${queryString}`
      }
    }
    
    if (options.replace) {
      window.history.replaceState({ page: p, ctx: data }, "", urlPath);
    } else {
      window.history.pushState({ page: p, ctx: data }, "", urlPath);
    }
  }

  return (
    <div className={`app ${theme}`}>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: "'Prompt', sans-serif", fontSize: 14 } }} />
      
      <Nav
        page={page}
        go={go}
        theme={theme}
        setTheme={setTheme}
        authState={authState}
        readingSessions={readingSessions}
      />
      {countdownText && (
        <div
          className="countdown-banner"
          onClick={() => go("reader")}
          style={{
            background: "linear-gradient(135deg, #dc2626, #991b1b)",
            color: "#fff",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            cursor: "pointer",
            fontFamily: "'Prompt', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            boxShadow: "0 4px 20px rgba(220, 38, 38, 0.3)",
            position: "sticky",
            top: 58,
            zIndex: 99,
          }}
        >
          <i className="ti ti-alert-triangle" style={{ fontSize: 18, animation: "countdown-pulse 1s infinite" }} />
          <span>⏰ เหลือเวลาอีก <strong style={{ fontSize: 20, fontFamily: "monospace", letterSpacing: 2, margin: "0 4px" }}>{countdownText}</strong> รีบอ่านหนังสือเพื่อรักษา Streak!</span>
          <i className="ti ti-chevron-right" style={{ fontSize: 14, opacity: 0.7 }} />
        </div>
      )}
      <main className={`${page === "quran" || page === "member" ? "wide" : ""} fade-in-active`} key={page}>
        <PageErrorBoundary resetKey={`${page}:${JSON.stringify(ctx || {})}`} go={go}>
          <Suspense fallback={<LoadingState />}>
            {page === "home" && <Home go={go} />}
            {page === "articles" && <Articles go={go} authState={authState} ctx={ctx} />}      
            {page === "article" && <ArticleDetail item={ctx} go={go} authState={authState} />}
            {page === "library" && <Library go={go} authState={authState} ctx={ctx} />}
            {page === "library-detail" && (
              <RequireLogin authState={authState} go={go}>
                <LibraryDetail item={ctx} go={go} authState={authState} />
              </RequireLogin>
            )}
            {page === "media" && <Media go={go} ctx={ctx} />}
            {page === "media-detail" && <MediaDetail item={ctx} go={go} authState={authState} />}
            {page === "scholars" && <Scholars />}
            {page === "quran" && (
              <RequireLogin authState={authState} go={go}>
                <MemberDashboard authState={authState} go={go} initialView="quran" ctx={ctx} />
              </RequireLogin>
            )}
            {page === "tracking" && <Tracking authState={authState} />}
            {page === "auth" && <Auth authState={authState} go={go} />}
            
            {page === "member" && (
              <RequireLogin authState={authState} go={go}>
                <MemberDashboard authState={authState} go={go} initialView={ctx?.view} ctx={ctx} theme={theme} />
              </RequireLogin>
            )}
            {page === "staff" && (
              <RequireLogin authState={authState} go={go}>
                <StaffDashboard authState={authState} go={go} />
              </RequireLogin>
            )}
            {page === "staff-work" && (
              <RequireStaff authState={authState} go={go}>
                <StaffWork authState={authState} go={go} />
              </RequireStaff>
            )}
            {page === "staff-translation" && (
              <RequireStaff authState={authState} go={go}>
                <StaffTranslation authState={authState} go={go} />
              </RequireStaff>
            )}
            {page === "admin" && (
              <RequireStaff authState={authState} go={go}>
                <Admin go={go} authState={authState} initialTab={ctx?.tab} />
              </RequireStaff>
            )}
            {page === "donate" && <Donation />}
            {page === "reader" && (
              <RequireLogin authState={authState} go={go}>
                <ReadingApp authState={authState} go={go} ctx={ctx} theme={theme} />
              </RequireLogin>
            )}
          </Suspense>
        </PageErrorBoundary>
      </main>
      <PWAInstallBanner />
    </div>
  )
}

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  componentDidCatch(error, info) {
    console.error("Page render failed", error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="card" style={{ maxWidth: 520, margin: "44px auto", padding: 24, textAlign: "center" }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 28, color: "var(--red)", marginBottom: 10 }}></i>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>เปิดหน้านี้ไม่สำเร็จ</h2>
        <p style={{ marginBottom: 16 }}>
          ระบบเจอข้อผิดพลาดระหว่างแสดงผลหน้า ลองโหลดใหม่ หรือกลับหน้าแรกเพื่อใช้งานต่อได้เลย
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-teal" onClick={() => window.location.reload()}>
            <i className="ti ti-refresh" style={{ marginRight: 6 }}></i>โหลดใหม่
          </button>
          <button className="btn btn-outline" onClick={() => this.props.go("home")}>
            <i className="ti ti-home" style={{ marginRight: 6 }}></i>กลับหน้าแรก
          </button>
        </div>
      </div>
    )
  }
}

function RequireLogin({ authState, go, children }) {
  if (authState.loading) return <LoadingState />
  if (!authState.user) return <Auth authState={authState} go={go} />
  return children
}

function RequireStaff({ authState, go, children }) {
  if (authState.loading) return <LoadingState />
  if (!authState.user) return <Auth authState={authState} go={go} />
  if (!authState.isStaff) return <UnauthorizedState go={go} />
  return children
}

function LoadingState() {
  return (
    <div className="card" style={{ maxWidth: 420, margin: "44px auto", padding: 24, textAlign: "center" }}>
      <i className="ti ti-loader-2 spin" style={{ fontSize: 28, color: "var(--teal)" }}></i>
      <p style={{ marginTop: 10 }}>กำลังตรวจสอบสถานะผู้ใช้...</p>
    </div>
  )
}

function UnauthorizedState({ go }) {
  return (
    <div className="card" style={{ maxWidth: 520, margin: "44px auto", padding: 24, textAlign: "center" }}>
      <i className="ti ti-shield-lock" style={{ fontSize: 28, color: "var(--teal)", marginBottom: 10 }}></i>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>หน้านี้สำหรับเจ้าหน้าที่เท่านั้น</h2>
      <p style={{ marginBottom: 16 }}>
        บัญชีของคุณยังไม่มีสิทธิ์เข้าถึงส่วนนี้ หากต้องการใช้งานพื้นที่ staff หรือ admin ให้ใช้บัญชีที่กำหนดสิทธิ์ไว้ก่อน
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-teal" onClick={() => go("home")}>
          <i className="ti ti-home" style={{ marginRight: 6 }}></i>กลับหน้าหลัก
        </button>
        <button className="btn btn-outline" onClick={() => go("member", { view: "overview" })}>
          <i className="ti ti-layout-dashboard" style={{ marginRight: 6 }}></i>ไปแดชบอร์ดสมาชิก
        </button>
      </div>
    </div>
  )
}
