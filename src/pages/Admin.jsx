import { useEffect, useState } from "react"
import AdminArticles from "./admin/AdminArticles.jsx"
import AdminLibrary from "./admin/AdminLibrary.jsx"
import AdminMedia from "./admin/AdminMedia.jsx"
import AdminScholars from "./admin/AdminScholars.jsx"
import AdminTracking from "./admin/AdminTracking.jsx"
import AdminSite from "./admin/AdminSite.jsx"
import AdminTaxonomy from "./admin/AdminTaxonomy.jsx"
import AdminOpenHouse from "./admin/AdminOpenHouse.jsx"
import AdminBookCampaigns from "./admin/AdminBookCampaigns.jsx"
import AdminDashboard from "./admin/AdminDashboard.jsx"

const TABS = [
  { id: "dashboard", label: "ภาพรวม", icon: "ti-chart-bar" },
  { id: "articles", label: "บทความ", icon: "ti-file-text" },
  { id: "library", label: "หนังสือ/PDF", icon: "ti-books" },
  { id: "media", label: "มีเดีย", icon: "ti-player-play" },
  { id: "scholars", label: "อุลามาอฺ", icon: "ti-users" },
  { id: "book_campaigns", label: "แจกหนังสือ", icon: "ti-book" },
  { id: "openhouse", label: "นิทรรศการ (Open House)", icon: "ti-map" },
  { id: "taxonomy", label: "หมวด/ตัวเลือก", icon: "ti-tags" },
  { id: "tracking", label: "Tracking", icon: "ti-package" },
  { id: "site", label: "ตั้งค่าเว็บ", icon: "ti-settings" },
]

export default function Admin({ go, authState, initialTab = "dashboard" }) {
  const [tab, setTab] = useState(initialTab || "dashboard")
  const activeTabObj = TABS.find(t => t.id === tab) || TABS[0]
  const currentUser = authState?.profile?.displayName || authState?.user?.displayName || ""

  useEffect(() => {
    if (initialTab && TABS.some(item => item.id === initialTab)) setTab(initialTab)
  }, [initialTab])

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--br2)",
        flexWrap: "wrap", gap: 20,
      }}>
        <div style={{ flex: "1 1 min-content", minWidth: 280 }}>
          <span className="badge badge-teal" style={{ marginBottom: 10, display: "inline-block", padding: "4px 10px", fontSize: 12 }}>Staff only</span>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: 10, lineHeight: 1.3 }}>
            <i className="ti ti-shield-check" style={{ color: "var(--teal)", padding: 8, background: "var(--teal-bg)", borderRadius: 12 }}></i>
            Admin Panel
          </div>
          <p style={{ marginTop: 12, color: "var(--t2)", fontSize: 15, lineHeight: 1.5, maxWidth: 600 }}>จัดการเนื้อหาและข้อมูลหลักของ Talib Club</p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
          <button className="btn btn-outline" onClick={() => go("staff")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 12 }}>
            <i className="ti ti-arrow-left"></i> Staff
          </button>
          <button className="btn btn-outline" onClick={() => authState?.logout?.()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 12, color: "var(--red)", borderColor: "rgba(220,38,38,0.2)" }}>
            <i className="ti ti-logout"></i> ออกจากระบบ
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
        <div style={{ position: "relative", width: "100%" }}>
          <select 
            value={tab} 
            onChange={(e) => go("admin", { tab: e.target.value }, { replace: true, noScroll: true })}
            style={{ 
              width: "100%", 
              height: 48,
              padding: "0 16px",
              paddingRight: 40,
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 12,
              border: "1px solid var(--br)",
              background: "var(--bg2)",
              color: "var(--text)",
              fontFamily: "'Prompt', sans-serif",
              appearance: "none",
              WebkitAppearance: "none",
              cursor: "pointer",
              backgroundImage: "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238d877d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 16px center",
              backgroundSize: "18px",
              transition: "border-color 0.2s"
            }}
          >
            {TABS.map(t => (
              <option key={t.id} value={t.id} style={{ background: "var(--card)", color: "var(--text)" }}>
                {t.label}
              </option>
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
          {tab === "dashboard" && <AdminDashboard />}
          {tab === "articles" && <AdminArticles />}
          {tab === "library" && <AdminLibrary go={go} currentUser={currentUser} />}
          {tab === "media" && <AdminMedia go={go} currentUser={currentUser} />}
          {tab === "scholars" && <AdminScholars go={go} currentUser={currentUser} />}
          {tab === "openhouse" && <AdminOpenHouse go={go} />}
          {tab === "taxonomy" && <AdminTaxonomy />}
          {tab === "tracking" && <AdminTracking />}
          {tab === "book_campaigns" && <AdminBookCampaigns />}
          {tab === "site" && <AdminSite />}
        </div>
      </div>
    </div>
  )
}
