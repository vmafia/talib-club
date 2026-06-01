import { useEffect, useMemo } from "react"
import { useContentCollection } from "../lib/contentStore.js"
import { MEDIA } from "../data/index.js"

export default function MediaDetail({ item: initialItem, go, authState }) {
  const { items: mediaList, loading } = useContentCollection("media", MEDIA)
  const { saveItem: saveHistory } = useContentCollection("history", [])

  const urlId = new URLSearchParams(window.location.search).get("id")

  const item = useMemo(() => {
    if (initialItem && initialItem.title) return initialItem;
    if (urlId && mediaList.length > 0) return mediaList.find(m => String(m.id) === String(urlId));
    if (initialItem && initialItem.id && mediaList.length > 0) return mediaList.find(m => String(m.id) === String(initialItem.id));
    return null;
  }, [initialItem, urlId, mediaList])

  // ถ้ารีเฟรชแล้วไม่มีข้อมูล ให้กลับไปหน้ามีเดีย
  useEffect(() => {
    if (!loading && !item) {
      go("media")
    }
  }, [item, loading, go])

  // บันทึกประวัติการดูสื่อ
  useEffect(() => {
    if (item && authState?.user?.uid && saveHistory) {
      const uid = authState.user.uid;
      const historyId = `${uid}_media_${item.id}`;
      saveHistory({
        id: historyId,
        uid,
        itemId: item.id,
        type: "media",
        mediaType: item.type, // youtube หรือ spotify
        title: item.title, 
        timestamp: Date.now()
      }).catch(err => console.error("Failed to save media history to Firebase", err));
    }
  }, [item, authState?.user?.uid, saveHistory])

  if (loading) return <div style={{textAlign: "center", padding: 40}}><i className="ti ti-loader-2 spin" style={{fontSize: 24, color: "var(--teal)"}}></i></div>
  if (!item) return null

  return (
    <div className="article-page" style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 40, width: "100%" }}>
      {/* ปุ่มย้อนกลับ */}
      <button 
        onClick={() => go("media")}
        className="sec-link" 
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้ารวมมีเดีย
      </button>

      {/* ส่วนเล่นมีเดีย (ปรับขอบมน 16px และคุมระบบ Responsive ไม่ให้ดันจอแตก) */}
      {item.type === "youtube" && (
        <div style={{
          marginBottom: 24, borderRadius: 16, overflow: "hidden",
          border: ".5px solid var(--br2)", background: "#000",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.2)",
          width: "100%"
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
          marginBottom: 24, borderRadius: 16, overflow: "hidden",
          border: ".5px solid var(--br2)", background: "var(--card)",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.1)",
          width: "100%"
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

      {/* ข้อมูลรายละเอียด (ปรับปรุงให้อยู่ในการ์ดมินิมอล และเปลี่ยนเป็นคำว่า จากช่อง :) */}
      <div className="card" style={{ padding: 24, minWidth: 0, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span className="tag" style={{
            background: item.type === "youtube" ? "rgba(255,50,50,.08)" : "rgba(30,215,96,.08)",
            color: item.type === "youtube" ? "#ff4444" : "#1ed760", fontSize: 11, padding: "4px 10px", borderRadius: 20
          }}>
            <i className={`ti ${item.type === "youtube" ? "ti-brand-youtube" : "ti-brand-spotify"}`} style={{ marginRight: 4 }}></i>
            {item.type === "youtube" ? "YouTube" : "Spotify"}
          </span>
          <span style={{ fontSize: 13, color: "var(--t3)", fontWeight: 300 }}>{item.series}</span>
        </div>
        
        <h1 style={{ fontSize: 22, marginBottom: 20, lineHeight: 1.4, wordBreak: "break-word" }}>{item.title}</h1>
        
        <div style={{ display: "flex", alignItems: "center", gap: 20, borderTop: ".5px solid var(--br2)", paddingTop: 16, flexWrap: "wrap" }}>
          
          {/* จากช่อง : */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--teal-bg)", color: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-device-tv"></i>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>จากช่อง :</div>
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.channel}</div>
            </div>
          </div>
          
          {/* ความยาวคลิป */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg2)", color: "var(--t2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-clock"></i>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>ความยาว</div>
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>{item.duration || "ไม่ได้ระบุ"}</div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}