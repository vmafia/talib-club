import { useState } from "react"
import { MEDIA, DEFAULT_TAXONOMY, SITE } from "../data/index.js"
import { useContentCollection, useTaxonomySettings, useSiteSettings } from "../lib/contentStore.js"

export default function Media({ go }) {
  const { items: media, loading, error, isUsingFallback } = useContentCollection("media", MEDIA)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  const { site } = useSiteSettings(SITE)
  const [filter, setFilter] = useState("all")

  const filtered = media.filter(item => filter === "all" || item.type === filter)
  const filters = [
    { id: "all", label: "ทั้งหมด", icon: "ti-layout-grid" },
    ...(taxonomy.mediaTypes || []).map(item => ({
      id: item,
      label: item === "youtube" ? "YouTube" : item === "spotify" ? "Spotify" : item,
      icon: item === "youtube" ? "ti-brand-youtube" : item === "spotify" ? "ti-brand-spotify" : "ti-player-play",
    })),
  ]

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>มีเดีย</h1>
        <p>วิดีโอ YouTube และพอดแคสต์ Spotify จาก Talib Club</p>
        {loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดข้อมูล...</p>}
        {error && <p style={{ marginTop: 8, fontSize: 12, color: "#e05555" }}>โหลดข้อมูลจาก Firestore ไม่สำเร็จ กำลังแสดงข้อมูลสำรอง</p>}
        {!error && isUsingFallback && <p style={{ marginTop: 8, fontSize: 12 }}>ยังไม่มีข้อมูลใน Firestore จึงแสดงรายการตั้งต้นก่อน</p>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
        {filters.map(item => (
          <button
            key={item.id}
            className={filter === item.id ? "btn btn-teal" : "btn btn-outline"}
            onClick={() => setFilter(item.id)}
          >
            <i className={`ti ${item.icon}`} style={{ marginRight: 6 }}></i>{item.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {filtered.map(item => (
          <div
            key={item.id}
            className="card"
            style={{ cursor: "pointer", overflow: "hidden" }}
            onClick={() => go ? go("media-detail", item) : undefined}
          >
            <div
              style={{
                height: 120,
                background: item.type === "youtube" ? "rgba(255,50,50,.08)" : "rgba(30,215,96,.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <i
                className={`ti ${item.type === "youtube" ? "ti-brand-youtube" : "ti-brand-spotify"}`}
                style={{ fontSize: 42, color: item.type === "youtube" ? "#ff4444" : "#1ed760", opacity: .75 }}
              ></i>
              {item.duration && (
                <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.72)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                  {item.duration}
                </div>
              )}
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: "var(--text)" }}>{item.title}</div>
              <div style={{ fontSize: 11, color: "var(--t3)" }}>{item.channel || item.series || "Talib Club"}</div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && <div className="empty">ไม่พบรายการมีเดีย</div>}

      {/* FOOTER */}
      <Footer site={site} />
    </div>
  )
}

function Footer({ site }) {
  const links = [
    { key: "facebook", icon: "ti-brand-facebook" },
    { key: "youtube", icon: "ti-brand-youtube" },
    { key: "spotify", icon: "ti-brand-spotify" },
    { key: "instagram", icon: "ti-brand-instagram" },
  ].map(item => ({ ...item, url: site?.social?.[item.key] })).filter(item => item.url)

  return (
    <footer style={{
      backgroundColor: "#111a22",
      color: "#fff",
      padding: "40px 20px",
      textAlign: "center",
      position: "relative",
      marginTop: "60px",
      width: "100vw",
      marginLeft: "calc(-50vw + 50%)",
      boxSizing: "border-box",
      borderTop: "1px solid #1f2937"
    }}>
      <div style={{ display: "flex", justifyContent: "center", gap: "24px", flexWrap: "wrap", marginBottom: "16px" }}>
        <a href="#" style={{ color: "#2ea970", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>เกี่ยวกับเว็บไซต์</a>
        <a href="#" style={{ color: "#2ea970", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>ผู้ดูแลระบบ</a>
        <a href="#" style={{ color: "#2ea970", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>นโยบายความเป็นส่วนตัว</a>
      </div>

      <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "24px" }}>
        All Rights Reserved for Talib Club {new Date().getFullYear()} ©
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
        {links.map(item => (
          <a key={item.key} href={item.url} target="_blank" rel="noreferrer" style={{
            width: "42px", height: "42px",
            backgroundColor: "#080c11",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", textDecoration: "none", transition: "0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--teal)"}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#080c11"}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: "18px" }}></i>
          </a>
        ))}
      </div>

      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{
        position: "absolute", right: "max(20px, calc(50vw - 520px))", top: "50%", transform: "translateY(-50%)",
        width: "42px", height: "42px",
        backgroundColor: "#1b2a24",
        border: "none", borderRadius: "50%",
        color: "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "0.2s"
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--teal)"}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1b2a24"}
      >
        <i className="ti ti-arrow-up" style={{ fontSize: "18px" }}></i>
      </button>
    </footer>
  )
}