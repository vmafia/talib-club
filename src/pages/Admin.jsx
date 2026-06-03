import { useEffect, useState } from "react"
import AdminArticles from "./admin/AdminArticles.jsx"
import AdminLibrary from "./admin/AdminLibrary.jsx"
import AdminMedia from "./admin/AdminMedia.jsx"
import AdminScholars from "./admin/AdminScholars.jsx"
import AdminTracking from "./admin/AdminTracking.jsx"
import AdminSite from "./admin/AdminSite.jsx"
import AdminTaxonomy from "./admin/AdminTaxonomy.jsx"

const TABS = [
  { id: "articles", label: "บทความ", icon: "ti-file-text" },
  { id: "library", label: "หนังสือ/PDF", icon: "ti-books" },
  { id: "media", label: "มีเดีย", icon: "ti-player-play" },
  { id: "scholars", label: "อุลามาอฺ", icon: "ti-users" },
  { id: "taxonomy", label: "หมวด/ตัวเลือก", icon: "ti-tags" },
  { id: "tracking", label: "Tracking", icon: "ti-package" },
  { id: "site", label: "ตั้งค่าเว็บ", icon: "ti-settings" },
]

export default function Admin({ go, authState, initialTab = "articles" }) {
  const [tab, setTab] = useState(initialTab || "articles")
  const activeTabObj = TABS.find(t => t.id === tab) || TABS[0]

  useEffect(() => {
    if (initialTab && TABS.some(item => item.id === initialTab)) setTab(initialTab)
  }, [initialTab])

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 24, paddingBottom: 16, borderBottom: ".5px solid var(--br2)",
        flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <span className="badge badge-teal">Staff only</span>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", marginTop: 8 }}>
            <i className="ti ti-shield-check" style={{ marginRight: 8, color: "var(--teal)" }}></i>
            Admin Panel
          </div>
          <p style={{ marginTop: 4 }}>จัดการเนื้อหาและข้อมูลหลักของ Talib Club</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => go("staff")}>
            <i className="ti ti-arrow-left" style={{ marginRight: 6 }}></i>Staff
          </button>
          <button className="btn btn-outline" onClick={authState.logout}>
            <i className="ti ti-logout" style={{ marginRight: 6 }}></i>ออกจากระบบ
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .admin-mobile-select-wrapper {
          display: none !important;
        }
        .admin-sidebar {
          display: block !important;
        }
        .admin-layout-wrapper {
          display: flex !important;
        }
        .admin-side-btn:hover {
          background: var(--bg3) !important;
          color: var(--text) !important;
        }
        .admin-side-btn.active:hover {
          background: var(--teal-bg) !important;
          color: var(--teal) !important;
        }
        @media (max-width: 850px) {
          .admin-mobile-select-wrapper {
            display: block !important;
            margin-bottom: 20px;
          }
          .admin-sidebar {
            display: none !important;
          }
          .admin-layout-wrapper {
            display: block !important;
          }
        }
      `}} />

      <div className="admin-mobile-select-wrapper" style={{ display: "none" }}>
        <div style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "var(--bg2)",
          border: "1px solid var(--br)",
          borderRadius: 12,
          cursor: "pointer",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className={`ti ${activeTabObj.icon}`} style={{ fontSize: 18, color: "var(--teal)" }}></i>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{activeTabObj.label}</span>
          </div>
          <i className="ti ti-chevron-down" style={{ fontSize: 14, color: "var(--t3)" }}></i>
          
          <select 
            value={tab} 
            onChange={(e) => go("admin", { tab: e.target.value }, { replace: true, noScroll: true })}
            style={{ 
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%", 
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            {TABS.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-layout-wrapper" style={{ display: "flex", gap: 24, minHeight: "60vh" }}>
        <aside className="admin-sidebar" style={{ width: 220, flexShrink: 0 }}>
          <div style={{ 
            position: "sticky", 
            top: 90, 
            display: "flex", 
            flexDirection: "column", 
            gap: 4,
            background: "var(--bg2)",
            border: "1.5px solid var(--br2)",
            borderRadius: 16,
            padding: 8,
          }}>
            <div style={{ 
              padding: "8px 12px", 
              fontSize: 11, 
              fontWeight: 600, 
              color: "var(--t3)", 
              textTransform: "uppercase", 
              letterSpacing: "0.05em",
              borderBottom: "1px solid var(--br2)",
              marginBottom: 6
            }}>
              เมนูผู้ดูแลระบบ
            </div>
            {TABS.map(t => {
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => go("admin", { tab: t.id }, { replace: true, noScroll: true })}
                  className={`admin-side-btn ${isActive ? "active" : ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 14px",
                    border: "none",
                    borderRadius: 10,
                    background: isActive ? "var(--teal-bg)" : "transparent",
                    color: isActive ? "var(--teal)" : "var(--t2)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    transition: "all 0.2s ease",
                  }}
                >
                  <i className={`ti ${t.icon}`} style={{ 
                    fontSize: 16, 
                    color: isActive ? "var(--teal)" : "var(--t3)",
                    transition: "color 0.2s ease"
                  }}></i>
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="admin-content-area" style={{ flex: 1, minWidth: 0 }}>
          {tab === "articles" && <AdminArticles />}
          {tab === "library" && <AdminLibrary />}
          {tab === "media" && <AdminMedia />}
          {tab === "scholars" && <AdminScholars />}
          {tab === "taxonomy" && <AdminTaxonomy />}
          {tab === "tracking" && <AdminTracking />}
          {tab === "site" && <AdminSite />}
        </div>
      </div>
    </div>
  )
}
