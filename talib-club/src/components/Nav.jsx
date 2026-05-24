import { useState, useEffect } from "react"

// ปรับปรุงการกำหนดค่าข้อมูลเพื่อป้องกัน Error เรื่อง Path ไฟล์
const SITE = { name: "Talib Club", tagline: "แหล่งรวมความรู้" };

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
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) setMenuOpen(false)
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
      {/* ─── NAV BAR ─── */}
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
            <span style={{ fontSize: 8, fontWeight: 600, color: "var(--logo-c)", letterSpacing: ".07em" }}>
              TALIB
            </span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.15 }}>
              {SITE.name}
            </div>
            {!isMobile && (
              <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 300 }}>
                {SITE.tagline}
              </div>
            )}
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
          <div style={{
            display: "flex", background: "var(--bg2)", borderRadius: 20,
            padding: 3, border: ".5px solid var(--br)", gap: 2,
          }}>
            {[["light", "☀"], ["dark", "◑"]].map(([m, icon]) => (
              <button key={m} onClick={() => setTheme(m)} style={{
                fontFamily: "'Prompt',sans-serif",
                fontSize: isMobile ? 12 : 10,
                padding: isMobile ? "5px 8px" : "4px 10px",
                borderRadius: 16, border: "none", cursor: "pointer",
                background: theme === m ? "var(--acc)" : "transparent",
                color: theme === m ? "var(--bg)" : "var(--t3)",
                fontWeight: 300, transition: "all .2s",
              }}>
                {isMobile ? icon : (m === "light" ? "☀ Light" : "◑ Dark")}
              </button>
            ))}
          </div>

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
      </nav>

      {/* ─── MOBILE DRAWER ─── */}
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
            transform: menuOpen ? "translateX(0)" : "translateX(100%)",
            transition: "transform .25s cubic-bezier(.4,0,.2,1)",
            display: "flex", flexDirection: "column",
            boxShadow: menuOpen ? "-8px 0 32px rgba(0,0,0,.4)" : "none",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "0 20px 20px", borderBottom: ".5px solid var(--br2)", marginBottom: 8,
            }}>
              <div style={{
                width: 32, height: 32, background: "var(--logo-bg)", borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 7, fontWeight: 600, color: "var(--logo-c)" }}>TALIB</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{SITE.name}</div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 300 }}>{SITE.tagline}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {NAV_LINKS.map(l => (
                <button key={l.id} onClick={() => nav(l.id)} style={{
                  width: "100%", textAlign: "left", fontFamily: "'Prompt',sans-serif",
                  fontSize: 14, fontWeight: page === l.id ? 500 : 300,
                  padding: "13px 20px", border: "none", cursor: "pointer",
                  background: page === l.id ? "var(--bg2)" : "transparent",
                  color: page === l.id ? "var(--text)" : "var(--t2)",
                  display: "flex", alignItems: "center", gap: 12,
                  borderLeft: page === l.id ? "2px solid var(--teal)" : "2px solid transparent",
                  transition: "all .15s",
                }}>
                  <i className={`ti ${l.icon}`} style={{
                    fontSize: 16, color: page === l.id ? "var(--teal)" : "var(--t3)",
                    flexShrink: 0,
                  }}></i>
                  {l.label}
                </button>
              ))}
            </div>
            <div style={{ padding: "12px 20px", borderTop: ".5px solid var(--br2)" }}>
              <button style={{
                width: "100%", fontFamily: "'Prompt',sans-serif", fontSize: 13, fontWeight: 400,
                padding: "10px", borderRadius: 24, border: ".5px solid var(--br)",
                background: "transparent", color: "var(--t2)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <i className="ti ti-user" style={{ fontSize: 13 }}></i>เข้าสู่ระบบ
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── MOBILE BOTTOM BAR ─── */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "var(--nav-bg)", borderTop: ".5px solid var(--br2)",
          display: "flex", backdropFilter: "blur(14px)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>
          {NAV_LINKS.slice(0, 5).map(l => (
            <button key={l.id} onClick={() => nav(l.id)} style={{
              flex: 1, fontFamily: "'Prompt',sans-serif", fontSize: 9, fontWeight: 300,
              padding: "8px 2px", border: "none", cursor: "pointer",
              background: "transparent",
              color: page === l.id ? "var(--teal)" : "var(--t3)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              transition: "all .15s",
            }}>
              <i className={`ti ${l.icon}`} style={{ fontSize: 18 }}></i>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
