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
    <nav style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 20px", borderBottom: ".5px solid var(--br2)",
      position: "sticky", top: 0, zIndex: 200,
      background: "var(--nav-bg)", backdropFilter: "blur(14px)",
    }}>
      {/* ฝั่งซ้าย: ปุ่มเมนู (มือถือ) + ชื่อเว็บ */}
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

      {/* ฝั่งกลาง: เมนู (Desktop) */}
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

      {/* ฝั่งขวา: ธีม + ล็อกอิน */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} style={{
          background: "var(--bg2)", border: "none", cursor: "pointer",
          color: "var(--t3)", padding: "6px 10px", borderRadius: 20
        }}>
          <i className={`ti ${theme === "light" ? "ti-moon" : "ti-sun"}`}></i>
        </button>
        {!isMobile && (
          <button style={{ fontSize: 12, padding: "6px 14px", borderRadius: 20, border: ".5px solid var(--br)", background: "transparent", color: "var(--t2)" }}>
            เข้าสู่ระบบ
          </button>
        )}
      </div>

      {/* MOBILE DRAWER (สไลด์จากซ้าย) */}
      {isMobile && (
        <>
          {/* Overlay ดำจางๆ เมื่อเปิดเมนู */}
          {menuOpen && (
            <div onClick={() => setMenuOpen(false)} style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
              zIndex: 150, backdropFilter: "blur(2px)"
            }} />
          )}
          
          {/* กล่องเมนู */}
          <div style={{
            position: "fixed", top: 0, left: menuOpen ? 0 : "-100%", bottom: 0,
            width: "280px", background: "var(--bg)", zIndex: 160,
            padding: "80px 20px", transition: "left 0.3s ease",
            borderRight: ".5px solid var(--br2)", boxShadow: "2px 0 10px rgba(0,0,0,0.1)"
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
        </>
      )}
    </nav>
  )
}
