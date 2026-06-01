import { useState, useMemo, useEffect } from "react"
import { MEDIA, DEFAULT_TAXONOMY, SITE } from "../data/index.js"
import { useContentCollection, useTaxonomySettings, useSiteSettings } from "../lib/contentStore.js"

export default function Media({ go }) {
  const { items: media, loading, error, isUsingFallback } = useContentCollection("media", MEDIA)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  const { site } = useSiteSettings(SITE)
  
  // State สำหรับหน้าแรก (หน้ารวมเพลย์ลิสต์)
  const [filter, setFilter] = useState("all")
  const [searchPlaylist, setSearchPlaylist] = useState("")
  
  // State สำหรับด้านใน Playlist
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [searchClip, setSearchClip] = useState("")
  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 9

  const filters = [
    { id: "all", label: "ทั้งหมด", icon: "ti-layout-grid" },
    ...(taxonomy.mediaTypes || []).map(item => {
      const lower = String(item).toLowerCase();
      return {
        id: lower,
        label: lower === "youtube" ? "YouTube" : lower === "spotify" ? "Spotify" : lower === "video" ? "คลิปสั้น" : item,
        icon: lower === "youtube" ? "ti-brand-youtube" : lower === "spotify" ? "ti-brand-spotify" : lower === "video" ? "ti-video" : "ti-player-play",
      };
    }),
  ]

  // 1. จัดกลุ่มเพลย์ลิสต์
  const playlists = []
  media.forEach(item => {
    const playlistName = item.series || "วิดีโอทั่วไป"
    let pl = playlists.find(p => p.name === playlistName)
    if (!pl) {
      pl = {
        name: playlistName,
        teacher: item.channel || item.series || "Talib Club",
        type: String(item.type || "").toLowerCase(),
        items: []
      }
      playlists.push(pl)
    }
    pl.items.push(item)
  })

  // 2. กรองเพลย์ลิสต์หน้าแรก (ค้นหา + ประเภท)
  const filteredPlaylists = playlists.filter(pl => {
    const matchType = filter === "all" || String(pl.type).toLowerCase() === String(filter).toLowerCase();
    const matchSearch = String(pl.name).toLowerCase().includes(searchPlaylist.toLowerCase()) || 
                        String(pl.teacher).toLowerCase().includes(searchPlaylist.toLowerCase());
    return matchType && matchSearch;
  })

  // 3. กรองคลิปเมื่ออยู่ด้านใน Playlist (ค้นหาชื่อคลิป)
  const filteredClips = useMemo(() => {
    if (!selectedPlaylist) return []
    if (!searchClip.trim()) return selectedPlaylist.items
    
    return selectedPlaylist.items.filter(item => 
      String(item.title).toLowerCase().includes(searchClip.toLowerCase()) ||
      String(item.channel).toLowerCase().includes(searchClip.toLowerCase())
    )
  }, [selectedPlaylist, searchClip])

  // รีเซ็ตหน้าเมื่อมีการค้นหาคลิปใหม่
  useEffect(() => {
    setPage(1)
  }, [searchClip])

  // จัดการข้อมูลหน้า Pagination สำหรับคลิปที่กรองแล้ว
  const currentItems = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE
    return filteredClips.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredClips, page])

  const totalPages = Math.ceil(filteredClips.length / ITEMS_PER_PAGE)

  // ฟังก์ชันออกจากเพลย์ลิสต์ (เคลียร์ค่าการค้นหาและหน้า)
  const handleBackToPlaylists = () => {
    setSelectedPlaylist(null)
    setSearchClip("")
    setPage(1)
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>มีเดีย</h1>
        <p>วิดีโอ YouTube และพอดแคสต์ Spotify จาก Talib Club</p>
        {loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดข้อมูล...</p>}
      </div>

      {!selectedPlaylist ? (
        <>
          {/* แถบค้นหา และ กรองเพลย์ลิสต์ */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
            <div style={{ flex: "1 1 250px", position: "relative" }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 16 }}></i>
              <input 
                value={searchPlaylist} 
                onChange={e => setSearchPlaylist(e.target.value)} 
                placeholder="ค้นหาเพลย์ลิสต์ หรือ ชื่อช่อง..." 
                style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "10px 16px 10px 42px", background: "var(--bg2)", border: "none" }} 
              />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
          </div>

          {filteredPlaylists.length === 0 ? (
            <div className="empty">ไม่พบเพลย์ลิสต์ที่ตรงกับการค้นหา</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 14 }}>
              {filteredPlaylists.map((pl, idx) => (
                <div key={idx} className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", padding: 0 }}>
                  <div style={{ display: "flex", height: 130, borderBottom: ".5px solid var(--br2)" }}>
                    <div style={{ flex: 1, background: pl.type === "youtube" ? "rgba(255,50,50,.05)" : pl.type === "spotify" ? "rgba(30,215,96,.05)" : "rgba(15,110,86,.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <i className={`ti ${pl.type === "youtube" ? "ti-brand-youtube" : pl.type === "spotify" ? "ti-brand-spotify" : "ti-video"}`} style={{ fontSize: 44, color: pl.type === "youtube" ? "#ff4444" : pl.type === "spotify" ? "#1ed760" : "var(--teal)", opacity: .7 }}></i>
                    </div>
                    <div style={{ width: 85, backgroundColor: "#111a22", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <i className="ti ti-menu-2" style={{ fontSize: 16, opacity: 0.8 }}></i>
                      <span style={{ fontSize: 12, fontWeight: 400 }}>{pl.items.length} คลิป</span>
                    </div>
                  </div>
                  <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1 }}>
                    <div style={{ fontSize: 12, color: "var(--teal)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
                      <i className="ti ti-user" style={{ fontSize: 12 }}></i> จากช่อง: {pl.teacher}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text)", marginBottom: 6, lineHeight: 1.4, flex: 1 }}>
                      {pl.name}
                    </div>
                    <button 
                      className="btn btn-outline" 
                      onClick={() => { setSelectedPlaylist(pl); setPage(1); setSearchClip(""); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, padding: "8px 0", borderColor: "rgba(15,110,86,0.3)", color: "var(--teal)" }}
                    >
                      <i className="ti ti-play-circle" style={{ fontSize: 13 }}></i> ดูเพลย์ลิสต์
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* INSIDE PLAYLIST (แบบบล็อกพร้อมปก Thumbnail และ Pagination) */
        <div>
          <button className="btn btn-outline" style={{ marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px" }} onClick={handleBackToPlaylists}>
            <i className="ti ti-arrow-left"></i> กลับหน้ารวมมีเดีย
          </button>
          
          <div className="card" style={{ padding: 18, marginBottom: 24, background: "var(--acc2)" }}>
            <div style={{ fontSize: 12, color: "var(--teal)", marginBottom: 4, fontWeight: 500 }}>จากช่อง: {selectedPlaylist.teacher}</div>
            <h2 style={{ fontSize: 18, fontWeight: 500 }}>{selectedPlaylist.name}</h2>
            <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 4 }}>
              รวมเนื้อหาทั้งหมด {filteredClips.length} คลิป {totalPages > 0 && `(หน้าที่ ${page}/${totalPages})`}
            </p>
          </div>

          {/* แถบค้นหาคลิปภายในเพลย์ลิสต์ */}
          <div style={{ marginBottom: 24, position: "relative", maxWidth: 400 }}>
            <i className="ti ti-search" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 16 }}></i>
            <input 
              value={searchClip} 
              onChange={e => setSearchClip(e.target.value)} 
              placeholder={`ค้นหาคลิปใน ${selectedPlaylist.name}...`} 
              style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "10px 16px 10px 42px", background: "var(--bg2)", border: ".5px solid var(--br)" }} 
            />
          </div>

          {filteredClips.length === 0 ? (
            <div className="empty">ไม่พบคลิปที่ตรงกับการค้นหาในเพลย์ลิสต์นี้</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {currentItems.map((item) => {
                // ดึงภาพปกจาก YouTube หากไม่มีการใส่ CoverUrl
                const thumbUrl = item.coverUrl || (item.type === "youtube" && item.embedId ? `https://img.youtube.com/vi/${item.embedId}/hqdefault.jpg` : null)
                
                return (
                  <div 
                    key={item.id} 
                    className="card" 
                    style={{ padding: 0, overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column" }}
                    onClick={() => go ? go("media-detail", item) : undefined}
                  >
                    <div style={{ height: 150, background: "var(--acc2)", position: "relative" }}>
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <i className={`ti ${item.type === "youtube" ? "ti-brand-youtube" : item.type === "spotify" ? "ti-brand-spotify" : "ti-video"}`} style={{ fontSize: 40, color: "var(--t3)" }}></i>
                        </div>
                      )}
                      {item.duration && (
                        <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                          {item.duration}
                        </span>
                      )}
                    </div>
                    <div style={{ padding: 14, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 6 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t3)" }}>{item.channel}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 32, flexWrap: "wrap" }}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button 
                  key={i} 
                  onClick={() => { setPage(i + 1); window.scrollTo(0, 0); }}
                  className={page === i + 1 ? "btn btn-teal" : "btn btn-outline"} 
                  style={{ padding: "6px 14px", fontSize: 12 }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
    { key: "tiktok", icon: "ti-brand-tiktok" },
  ].map(item => ({ ...item, url: site?.social?.[item.key] })).filter(item => item.url)

  return (
    <footer style={{ padding: "32px 0 20px", marginTop: "40px", textAlign: "center", position: "relative", borderTop: ".5px solid var(--br2)" }}>
      
      <div style={{ fontSize: "14px", color: "var(--text)", fontWeight: 500, letterSpacing: "0.5px", marginBottom: "6px", textTransform: "uppercase" }}>
        Quran, Sunnah <span style={{fontWeight: 300, fontSize: "13px"}}>and the understanding of Salaf</span>
      </div>

      <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "16px", fontWeight: 300 }}>
        All Rights Reserved for Talib Club {new Date().getFullYear()} ©
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
        {links.map(item => (
          <a key={item.key} href={item.url} target="_blank" rel="noreferrer" style={{ width: "36px", height: "36px", backgroundColor: "var(--card)", border: ".5px solid var(--br)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t2)", textDecoration: "none", transition: "0.2s" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--teal)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--teal)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; e.currentTarget.style.color = "var(--t2)"; e.currentTarget.style.borderColor = "var(--br)"; }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: "16px" }}></i>
          </a>
        ))}
      </div>

      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ position: "absolute", right: "0", top: "32px", width: "38px", height: "38px", backgroundColor: "var(--teal-bg)", border: "1px solid rgba(15,110,86,0.1)", borderRadius: "50%", color: "var(--teal)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "0.2s" }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--teal)"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--teal-bg)"; e.currentTarget.style.color = "var(--teal)"; }}
      >
        <i className="ti ti-arrow-up" style={{ fontSize: "16px" }}></i>
      </button>
    </footer>
  )
}