import { useEffect, useState } from "react"
import { useTheme } from "./hooks/useTheme.js"
import { useAuth } from "./hooks/useAuth.js"
import Nav from "./components/Nav.jsx"
import Home from "./pages/Home.jsx"
import Articles from "./pages/Articles.jsx"
import ArticleDetail from "./pages/ArticleDetail.jsx"
import Library from "./pages/Library.jsx"
import LibraryDetail from "./pages/LibraryDetail.jsx"
import Media from "./pages/Media.jsx"
import MediaDetail from "./pages/MediaDetail.jsx"
import Scholars from "./pages/Scholars.jsx"
import Tracking from "./pages/Tracking.jsx"
import Auth from "./pages/Auth.jsx"
import MemberDashboard from "./pages/MemberDashboard.jsx"
import StaffDashboard from "./pages/StaffDashboard.jsx"
import StaffWork from "./pages/StaffWork.jsx"
import StaffTranslation from "./pages/StaffTranslation.jsx"
import Admin from "./pages/Admin.jsx"
import Donation from "./pages/Donation.jsx"
import { Toaster } from "react-hot-toast"
import "./styles/global.css"

export default function App() {
  const { theme, setTheme } = useTheme()
  const authState = useAuth()
  const [page, setPage] = useState("home")
  const [ctx, setCtx] = useState(null)

  const urlToPage = {
    "": "home",
    "articles": "articles",
    "article": "article",
    "library": "library",
    "library-detail": "library-detail",
    "media": "media",
    "media-detail": "media-detail",
    "scholars": "scholars",
    "tracking-system": "tracking",
    "auth": "auth",
    "member": "member",
    "staff": "staff",
    "staff-work": "staff-work",
    "staff-translation": "staff-translation",
    "admin": "admin",
    "donate": "donate",
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
        setCtx(null)
      }
    }

    const initialPath = window.location.pathname.replace(/^\//, "")
    const initialPage = urlToPage[initialPath] || "home"
    window.history.replaceState({ page: initialPage, ctx: null }, "", window.location.pathname + window.location.search)
    setPage(initialPage)

    window.addEventListener("popstate", handlePopstate)
    return () => window.removeEventListener("popstate", handlePopstate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (p, data = null) => {
    setPage(p)
    setCtx(data)
    window.scrollTo({ top: 0, behavior: "smooth" })
    
    let urlPath = "/";
    if (p === "tracking") {
      urlPath = "/tracking-system";
    } else if (p !== "home") {
      urlPath = "/" + p;
    }
    
    // ฝัง ID ลงในลิงก์ URL อัตโนมัติ เพื่อให้แชร์ได้ 
    if (data && data.id) {
      urlPath += `?id=${data.id}`
    }
    
    window.history.pushState({ page: p, ctx: data }, "", urlPath);
  }

  return (
    <div className={`app ${theme}`}>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: "'Prompt', sans-serif", fontSize: 14 } }} />
      
      <Nav page={page} go={go} theme={theme} setTheme={setTheme} authState={authState} />
      <main>
        {page === "home" && <Home go={go} />}
        {page === "articles" && <Articles go={go} authState={authState} ctx={ctx} />}
        {/* ส่ง authState เข้าไปให้หน้าอ่านบทความ เพื่อให้ระบบรู้ว่าล็อกอินแล้ว */}
        {page === "article" && <ArticleDetail item={ctx} go={go} authState={authState} />}
        
        {page === "library" && <Library go={go} />}
        {page === "library-detail" && <LibraryDetail item={ctx} go={go} />}
        {page === "media" && <Media go={go} />}
        {page === "media-detail" && <MediaDetail item={ctx} go={go} />}
        {page === "scholars" && <Scholars />}
        {page === "tracking" && <Tracking />}
        {page === "auth" && <Auth authState={authState} go={go} />}
        
        {page === "member" && (
          <RequireLogin authState={authState} go={go}>
            <MemberDashboard authState={authState} go={go} initialView={ctx?.view} />
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
       {page === "article" && <ArticleDetail item={ctx} go={go} authState={authState} />}
      </main>
    </div>
  )
}

function RequireLogin({ authState, go, children }) {
  if (authState.loading) return <LoadingState />
  if (!authState.user) return <Auth authState={authState} go={go} />
  return children
}

function RequireStaff({ authState, go, children }) {
  if (authState.loading) return <LoadingState />
  if (!authState.user) return <Auth authState={authState} go={go} />
  if (!authState.isStaff) return <StaffDashboard authState={authState} go={go} />
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