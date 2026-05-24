import { useState, useEffect } from "react"
import { SITE } from "../data/index.js"

const NAV_LINKS = [
  { id: "home",     label: "หน้าหลัก",  icon: "ti-home" },
  { id: "articles", label: "บทความ",    icon: "ti-file-text" },
  { id: "library",  label: "ห้องสมุด",  icon: "ti-books" },
  { id: "media",    label: "มีเดีย",    icon: "ti-player-play" },
  { id: "scholars", label: "อุลามาอ์",  icon: "ti-users" },
  { id: "tracking", label: "ตรวจสอบพัสดุ",  icon: "ti-package" },
]

export default function Nav({ page, go, theme, setTheme }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setMenuOpen(false)
    }
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  function nav(id) {
    go(id)
    setMenuOpen(false)
  }

  return (
    <nav style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: isMobile ? "12px 16px" : "13px 28px",
      borderBottom: ".5px solid var(--br2)",
      position: "sticky", top: 0, zIndex: 200,
      background: "var(--nav-bg)", backdropFilter: "blur(14px)",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => nav("home")}>
        <div style={{
          width: 34, height: 34, background: "var(--logo-bg)", borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: "var(--logo-c)", letterSpacing: ".07em" }}>TALIB</span>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.15 }}>{SITE.name}</div>
          {!isMobile && <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 300 }}>{SITE.tagline}</div>}
        </div>
      </div>

      {/* Desktop Links */}
      {!isMobile && (
        <div style={{ display: "flex", gap: 2 }}>
          {NAV_LINKS.map(l => (
            <button key={l.id} onClick={() => nav(l.id)} style={{
              background: page === l.id ? "var(--bg2)" : "none",
              border: "none", cursor: "pointer", fontFamily: "'Prompt',sans-serif",
              fontSize: 12, color: page === l.id ? "var(--text)" : "var(--t2)",
              fontWeight: page === l.id ? 500 : 300,
              padding: "6px 10px", borderRadius: 8, transition: "all .15s",
            }}>
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Right Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Theme Toggle */}
        <div style={{
          display: "flex", background: "var(--bg2)", borderRadius: 20,
          padding: 3, border: ".5px solid var(--br)", gap: 2,
        }}>
          {[["light", "☀"], ["dark", "◑"]].map(([m, icon]) => (
            <button key={m} onClick={() => setTheme(m)} style={{
              fontFamily: "'Prompt',sans-serif", fontSize: isMobile ? 12 : 10,
              padding: isMobile ? "5px 8px" : "4px 10px", borderRadius: 16,
              border: "none", cursor: "pointer",
              background: theme === m ? "var(--acc)" : "transparent",
              color: theme === m ? "var(--bg)" : "var(--t3)",
              fontWeight: 300, transition: "all .2s",
            }}>
              {isMobile ? icon : (m === "light" ? "☀ Light" : "◑ Dark")}
            </button>
          ))}
        </div>

        {/* Login (Desktop only) */}
        {!isMobile && (
          <button style={{
            fontFamily: "'Prompt',sans-serif", cursor: "pointer",
            border: ".5px solid var(--br)", borderRadius: 24,
            fontSize: 11, fontWeight: 300, padding: "6px 14px",
            background: "transparent", color: "var(--t2)",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <i className="ti ti-user" style={{ fontSize: 11 }}></i>เข้าสู่ระบบ
          </button>
        )}

        {/* Hamburger (Mobile only) */}
        {isMobile && (
          <button onClick={() => setMenuOpen(o => !o)} style={{
            background: menuOpen ? "var(--bg3)" : "var(--bg2)",
            border: ".5px solid var(--br)", borderRadius: 8,
            width: 36, height: 36, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text)", transition: "all .2s",
          }}>
            <i className={`ti ${menuOpen ? "ti-x" : "ti-menu-2"}`} style={{ fontSize: 18 }}></i>
          </button>
        )}
      </div>

      {/* MOBILE DRAWER */}
      {isMobile && menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
            zIndex: 150, backdropFilter: "blur(2px)",
          }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: 260,
            background: "var(--bg)", borderLeft: ".5px solid var(--br)",
            zIndex: 160, padding: "60px 0 24px",
            display: "flex", flexDirection: "column",
            boxShadow: "-8px 0 32px rgba(0,0,0,.4)",
          }}>
            {NAV_LINKS.map(l => (
              <button key={l.id} onClick={() => nav(l.id)} style={{
                width: "100%", textAlign: "left", fontFamily: "'Prompt',sans-serif",
                fontSize: 14, fontWeight: page === l.id ? 500 : 300,
                padding: "16px 20px", border: "none", cursor: "pointer",
                background: page === l.id ? "var(--bg2)" : "transparent",
                color: page === l.id ? "var(--text)" : "var(--t2)",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <i className={`ti ${l.icon}`} style={{ fontSize: 16, color: page === l.id ? "var(--teal)" : "var(--t3)" }}></i>
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  )
}
