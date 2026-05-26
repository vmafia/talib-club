import { useEffect } from "react"

export default function MediaDetail({ item, go }) {
  // ถ้ารีเฟรชแล้วไม่มีข้อมูล ให้กลับไปหน้ามีเดีย
  useEffect(() => {
    if (!item) {
      go("media")
    }
  }, [item, go])

  if (!item) return null

  return (
    <div className="article-page" style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* ปุ่มย้อนกลับ */}
      <button 
        onClick={() => go("media")}
        className="sec-link" 
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}
      >
        <i className="ti ti-arrow-left"></i> กลับไปหน้ารวมมีเดีย
      </button>

      {/* ส่วนเล่นมีเดีย */}
      {item.type === "youtube" && (
        <div style={{
          marginBottom: 24, borderRadius: 12, overflow: "hidden",
          border: ".5px solid var(--br2)", background: "#000",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)"
        }}>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <iframe style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
              src={`https://www.youtube.com/embed/${item.embedId}?autoplay=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen title={item.title} />
          </div>
        </div>
      )}

      {item.type === "spotify" && (
        <div style={{
          marginBottom: 24, borderRadius: 12, overflow: "hidden",
          border: ".5px solid var(--br2)", background: "var(--card)",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.1)"
        }}>
          {item.spotifyUrl ? (
            <iframe style={{ width: "100%", height: 152, border: "none" }}
              src={item.spotifyUrl.includes("/embed/")
                ? item.spotifyUrl
                : item.spotifyUrl.replace("open.spotify.com/", "open.spotify.com/embed/")}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy" title={item.title} />
          ) : (
            <div className="empty">ยังไม่ได้ใส่ Spotify URL</div>
          )}
        </div>
      )}

      {/* ข้อมูลรายละเอียด */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span className="tag" style={{
            background: item.type === "youtube" ? "rgba(255,50,50,.08)" : "rgba(30,215,96,.08)",
            color: item.type === "youtube" ? "#ff4444" : "#1ed760", fontSize: 11
          }}>
            <i className={`ti ${item.type === "youtube" ? "ti-brand-youtube" : "ti-brand-spotify"}`} style={{ marginRight: 4 }}></i>
            {item.type === "youtube" ? "YouTube" : "Spotify"}
          </span>
          <span style={{ fontSize: 13, color: "var(--t3)", fontWeight: 300 }}>{item.series}</span>
        </div>
        
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>{item.title}</h1>
        
        <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: ".5px solid var(--br2)", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-user" style={{ color: "var(--t2)" }}></i>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>ช่อง/ผู้จัดทำ</div>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{item.channel}</div>
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-clock" style={{ color: "var(--t2)" }}></i>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>ความยาว</div>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{item.duration || "ไม่ได้ระบุ"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
