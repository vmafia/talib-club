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
        @media (max-width: 600px) {
          .admin-mobile-select-wrapper {
            display: block !important;
          }
          .admin-desktop-pills {
            display: none !important;
          }
        }
      `}} />

      <div className="admin-nav-container" style={{ marginBottom: 24 }}>
        <div className="admin-mobile-select-wrapper" style={{ display: "none" }}>
          <select 
            value={tab} 
            onChange={(e) => go("admin", { tab: e.target.value }, { replace: true, noScroll: true })}
            style={{ 
              width: "100%", 
              fontSize: 14, 
              padding: "10px 14px", 
              borderRadius: 8, 
              border: "1px solid var(--br)", 
              background: "var(--card)", 
              fontFamily: "'Prompt', sans-serif" 
            }}
          >
            {TABS.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="admin-desktop-pills" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => go("admin", { tab: t.id }, { replace: true, noScroll: true })} className={`pill ${tab === t.id ? "on" : ""}`}>
              <i className={`ti ${t.icon}`} style={{ marginRight: 6 }}></i>{t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "articles" && <AdminArticles />}
      {tab === "library" && <AdminLibrary />}
      {tab === "media" && <AdminMedia />}
      {tab === "scholars" && <AdminScholars />}
      {tab === "taxonomy" && <AdminTaxonomy />}
      {tab === "tracking" && <AdminTracking />}
      {tab === "site" && <AdminSite />}
    </div>
  )
}
