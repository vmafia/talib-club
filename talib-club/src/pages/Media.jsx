import { useState } from "react"

// --- รวบรวมข้อมูลและฟังก์ชันที่จำเป็นไว้ในไฟล์เดียว ---

const DEFAULT_TAXONOMY = {
  mediaTypes: ["youtube", "spotify"]
};

const MEDIA = [
  { id: "1", type: "youtube", title: "Talib Club Episode 1", channel: "Talib TV", duration: "45:00" },
  { id: "2", type: "spotify", title: "Morning Talk", channel: "Talib Podcast", duration: "12:30" }
];

// จำลองการใช้งาน Content Store
function useContentCollection(key, data) {
  return { items: data, loading: false };
}

function useTaxonomySettings(fallback) {
  return { taxonomy: fallback };
}

// --- ส่วนประกอบ Media ---

export default function App() {
  const { items: media, loading } = useContentCollection("media", MEDIA)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  const [filter, setFilter] = useState("all")

  const filtered = media.filter(m => filter === "all" || m.type === filter)

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>มีเดีย</h1>
        <p>วิดีโอ YouTube และพอดแคสต์ Spotify จาก Talib Club</p>
        {loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดข้อมูล...</p>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
        {[{ id: "all", label: "ทั้งหมด", icon: "ti-layout-grid" }, ...(taxonomy.mediaTypes || []).map(item => ({
          id: item, label: item === "youtube" ? "YouTube" : item === "spotify" ? "Spotify" : item,
          icon: item === "youtube" ? "ti-brand-youtube" : item === "spotify" ? "ti-brand-spotify" : "ti-player-play",
        }))].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            fontFamily: "'Prompt', sans-serif", fontSize: 12, fontWeight: 300,
            padding: "6px 14px", borderRadius: 20, border: ".5px solid #ccc",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            background: filter === f.id ? "#333" : "#f9f9f9",
            color: filter === f.id ? "#fff" : "#333"
          }}>
            <i className={`ti ${f.icon}`} style={{ fontSize: 12 }}></i>{f.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {filtered.map(m => (
          <div key={m.id} style={{ cursor: "pointer", overflow: "hidden", border: "1px solid #eee", borderRadius: "8px" }}>
            <div style={{ height: 120, background: m.type === "youtube" ? "rgba(255,50,50,.08)" : "rgba(30,215,96,.08)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <i style={{ fontSize: 40, color: m.type === "youtube" ? "#ff4444" : "#1ed760", opacity: .7 }}>▶</i>
              {m.duration && (
                <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.7)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                  {m.duration}
                </div>
              )}
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{m.title}</div>
              <div style={{ fontSize: 11, color: "#666" }}>{m.channel}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
