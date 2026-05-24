import { useState, useEffect } from "react"
import { SITE } from "../data/index.js"

const NAV_LINKS = [
  { id: "home",     label: "หน้าหลัก",  icon: "ti-home" },
  { id: "articles", label: "บทความ",    icon: "ti-file-text" },
  { id: "library",  label: "ห้องสมุด",  icon: "ti-books" },
  { id: "media",    label: "มีเดีย",    icon: "ti-player-play" },
  { id: "scholars", label: "อุลามาอ์",  icon: "ti-users" },
  { id: "tracking", label: "ตรวจสอบพัสดุ", icon: "ti-package" },
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
    <>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: ".5px solid var(--br2)",
        position: "sticky", top: 0, zIndex: 100, // ต่ำกว่า Drawer
        background: "var(--nav-bg)", backdropFilter: "blur(14px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          {isMobile && (
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text)" }}>
              <i className={`ti ${menuOpen ? "ti-x" : "ti-menu-2"}`}></i>
            </button>
          )}
          <div style={{ fontWeight: 600, cursor: "pointer", fontSize: 16 }} onClick={() => nav("home")}>
            {SITE.name}
          </div>
        </div>

        {!isMobile && (
          <div style={{ display: "flex", gap: "8px" }}>
            {NAV_LINKS.map(l => (
              <button key={l.id} onClick={() => nav(l.id)} style={{
                background: page === l.id ? "var(--bg2)" : "transparent",
                border: "none", cursor: "pointer", padding: "6px 12px",
                borderRadius: 8, fontSize: 13, color: page === l.id ? "var(--text)" : "var(--t2)",
              }}>
                {l.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} style={{
            background: "var(--bg2)", border: "none", cursor: "pointer",
            color: "var(--t3)", padding: "6px 10px", borderRadius: 20
          }}>
            <i className={`ti ${theme === "light" ? "ti-moon" : "ti-sun"}`}></i>
          </button>
        </div>
      </nav>

      {/* MOBILE DRAWER: แก้ไข zIndex และตำแหน่งให้ครอบคลุม */}
      {isMobile && menuOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 999, // ให้สูงกว่าทุกอย่างในหน้าเว็บ
        }}>
          {/* Overlay โปร่งใส */}
          <div onClick={() => setMenuOpen(false)} style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)"
          }} />
          
          {/* เมนูจริง */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: "280px",
            background: "var(--bg)", padding: "60px 20px",
            borderRight: "1px solid var(--br2)", boxShadow: "5px 0 15px rgba(0,0,0,0.1)"
          }}>
            {NAV_LINKS.map(l => (
              <button key={l.id} onClick={() => nav(l.id)} style={{
                display: "block", width: "100%", textAlign: "left", padding: "18px 10px",
                fontSize: 16, background: "transparent", border: "none",
                color: page === l.id ? "var(--teal)" : "var(--text)", cursor: "pointer"
              }}>
                <i className={`ti ${l.icon}`} style={{ marginRight: 15 }}></i>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
