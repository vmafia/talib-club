import React, { useState, useEffect } from "react"
import { collection, query, orderBy, getDocs } from "firebase/firestore"
import { db } from "../lib/firebase.js"
import "../styles/openhouse.css"

export default function OpenHouse({ go }) {
  const [platforms, setPlatforms] = useState([])
  const [booths, setBooths] = useState([])
  const [loading, setLoading] = useState(true)

  // Current view state: 'zones' (Main Hall), 'booths' (Platform selected)
  const [view, setView] = useState("zones")
  const [selectedPlatform, setSelectedPlatform] = useState(null)

  useEffect(() => {
    // Scroll to top when entering
    window.scrollTo(0, 0)
    
    // Fetch all booths to generate the zones dynamically
    const fetchBooths = async () => {
      try {
        const q = query(collection(db, "openhouse_booths"), orderBy("order", "asc"))
        const snap = await getDocs(q)
        const allBooths = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        
        setBooths(allBooths)
        
        // Extract unique platforms
        const uniquePlatforms = new Set()
        allBooths.forEach(b => {
          const plats = b.platforms || (b.platform ? [b.platform] : [])
          plats.forEach(p => uniquePlatforms.add(p))
        })
        
        const platformData = Array.from(uniquePlatforms).map(p => {
          const count = allBooths.filter(b => {
            const plats = b.platforms || (b.platform ? [b.platform] : [])
            return plats.includes(p)
          }).length
          
          let icon = "ti-world"
          let title = p
          if (p === "YouTube") { icon = "ti-brand-youtube"; title = "โซนวิดีโอ (YouTube)"; }
          if (p === "Website") { icon = "ti-world"; title = "โซนบทความ (Website)"; }
          if (p === "Facebook") { icon = "ti-brand-facebook"; title = "โซนเพจเฟสบุ๊ค (Facebook)"; }
          if (p === "Telegram") { icon = "ti-brand-telegram"; title = "โซนแชทและอัปเดต (Telegram)"; }
          if (p === "Podcast") { icon = "ti-microphone"; title = "โซนพอดแคสต์ (Podcast)"; }
          
          return { id: p, title, name: p, icon, count }
        })
        
        setPlatforms(platformData)
        setLoading(false)
      } catch (err) {
        console.error("Error fetching open house data", err)
        setLoading(false)
      }
    }
    
    fetchBooths()
  }, [])

  const enterPlatform = (platform) => {
    setSelectedPlatform(platform)
    setView("booths")
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const enterBooth = (boothId) => {
    go("openhouse-campus", { boothId })
  }

  const goBackToZones = () => {
    setView("zones")
    setSelectedPlatform(null)
  }

  return (
    <div className="openhouse-container">
      {/* Immersive Background */}
      <div className="openhouse-bg"></div>
      
      <div className="max-w" style={{ position: "relative", zIndex: 2 }}>
        
        {/* Header */}
        <div className="openhouse-header">
          <div className="openhouse-badge">Talib Open House</div>
          <h1 className="openhouse-title">นิทรรศการแหล่งเรียนรู้สะลัฟ</h1>
          <p className="openhouse-subtitle">ทะลุมิติสู่โลกแห่งความรู้จากสถาบันและช่องทางต่างๆ</p>
        </div>

        {loading ? (
          <div className="openhouse-loading">
            <i className="ti ti-loader-2 spin"></i> กำลังสร้างแผนที่โลกใบใหม่...
          </div>
        ) : (
          <div className="openhouse-content">
            {view === "zones" && (
              <div className="openhouse-zones-view fade-in">
                <h2 className="section-heading">เลือกโซนแพลตฟอร์ม</h2>
                <div className="zones-grid">
                  {platforms.length === 0 ? (
                    <div className="empty-state">ยังไม่มีโซนหรือบูธจัดแสดงในขณะนี้</div>
                  ) : platforms.map(p => (
                    <div key={p.id} className="zone-card" onClick={() => enterPlatform(p)}>
                      <div className="zone-icon"><i className={`ti ${p.icon}`}></i></div>
                      <h3 className="zone-name">{p.title}</h3>
                      <div className="zone-meta">{p.count} บูธจัดแสดง</div>
                      <div className="zone-glow"></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === "booths" && selectedPlatform && (
              <div className="openhouse-booths-view slide-in-bottom">
                <div className="booth-nav">
                  <button className="btn-back-glow" onClick={goBackToZones}>
                    <i className="ti ti-arrow-left"></i> กลับไปแผนที่หลัก
                  </button>
                  <h2 className="section-heading" style={{ margin: 0 }}>
                    <i className={`ti ${selectedPlatform.icon}`} style={{ marginRight: 12 }}></i>
                    {selectedPlatform.title}
                  </h2>
                </div>
                
                <div className="booths-grid">
                  {booths.filter(b => {
                    const plats = b.platforms || (b.platform ? [b.platform] : [])
                    return plats.includes(selectedPlatform.id)
                  }).map(booth => (
                    <div key={booth.id} className="booth-card" onClick={() => enterBooth(booth.id)}>
                      <div className="booth-color-top" style={{ background: booth.themeColor || "var(--teal)" }}></div>
                      <div className="booth-logo-wrapper">
                        {booth.logoUrl ? (
                          <img src={booth.logoUrl} alt={booth.name} className="booth-logo" />
                        ) : (
                          <div className="booth-logo-placeholder" style={{ background: booth.themeColor || "var(--bg3)" }}>
                            <i className="ti ti-building"></i>
                          </div>
                        )}
                      </div>
                      <div className="booth-info">
                        <h3 className="booth-name">{booth.name}</h3>
                        {booth.language && <div className="booth-lang"><i className="ti ti-language"></i> {booth.language}</div>}
                        {booth.description && <p className="booth-desc">{booth.description}</p>}
                      </div>
                      <div className="booth-action">
                        <span>เดินเข้าบูธ</span> <i className="ti ti-arrow-right"></i>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
      </div>
    </div>
  )
}
