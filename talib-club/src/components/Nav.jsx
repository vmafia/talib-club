import { useState, useEffect } from "react"

const SITE = { name: "Talib Club", tagline: "แหล่งรวมความรู้" };

const NAV_LINKS = [
  { id: "home",     label: "หน้าหลัก",  icon: "ti-home" },
  { id: "articles", label: "บทความ",    icon: "ti-file-text" },
  { id: "library",  label: "ห้องสมุด",  icon: "ti-books" },
  { id: "media",    label: "มีเดีย",    icon: "ti-player-play" },
  { id: "scholars", label: "อุลามาอ์",  icon: "ti-users" },
  { id: "tracking", label: "ตรวจสอบพัสดุ", icon: "ti-package" },
]

export default function Nav({ page, go, theme, setTheme }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  function nav(id) {
    go(id)
  }

  return (
    <>
      {/* ─── HEADER BAR ─── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: ".5px solid var(--br2)",
        position: "sticky", top: 0, zIndex: 200,
        background: "var(--nav-bg)", backdropFilter: "blur(14px)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => nav("home")}>
          <div style={{
            width: 30, height: 30, background: "var(--logo-bg)", borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: 7, fontWeight: 600, color: "var(--logo-c)", letterSpacing: ".07em" }}>
              TALIB
            </span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.15 }}>
              {SITE.name}
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} style={{
            background: "var(--bg2)", border: "none", cursor: "pointer",
            color: "var(--t3)", padding: "6px 10px", borderRadius: 20, transition: "all .2s"
          }}>
            <i className={`ti ${theme === "light" ? "ti-moon" : "ti-sun"}`}></i>
          </button>
          {!isMobile && (
            <button style={{
              fontFamily: "'Prompt',sans-serif", cursor: "pointer",
              border: ".5px solid var(--br)", borderRadius: 24,
              fontSize: 11, fontWeight: 300, padding: "6px 14px",
              background: "transparent", color: "var(--t2)",
            }}>
              เข้าสู่ระบบ
            </button>
          )}
        </div>
      </nav>

      {/* ─── MOBILE BOTTOM BAR ─── */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "var(--nav-bg)", borderTop: ".5px solid var(--br2)",
          display: "flex", justifyContent: "space-around",
          padding: "8px 0 env(safe-area-inset-bottom)",
          backdropFilter: "blur(14px)",
        }}>
          {NAV_LINKS.map(l => (
            <button key={l.id} onClick={() => nav(l.id)} style={{
              flex: 1, fontFamily: "'Prompt',sans-serif", fontSize: 9, fontWeight: 300,
              padding: "6px 2px", border: "none", cursor: "pointer",
              background: "transparent",
              color: page === l.id ? "var(--teal)" : "var(--t3)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              transition: "all .15s",
            }}>
              <i className={`ti ${l.icon}`} style={{ fontSize: 17 }}></i>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
