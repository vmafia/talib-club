import { useState, useMemo, useEffect } from "react"
import { DEFAULT_TAXONOMY, SCHOLARS } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"

const ERA_LABELS = {
  1: "ยุคแรก (Salaf) ค.ศ. 600–900",
  2: "ยุคกลาง ค.ศ. 900–1500",
  3: "ยุคฟื้นฟู ค.ศ. 1500–1800",
  4: "ยุคปัจจุบัน ค.ศ. 1800–ปัจจุบัน"
}
const ERA_COLORS = {
  1: "var(--teal)",
  2: "#c9a84c",
  3: "#8b7dd8",
  4: "var(--acc)"
}

const mapEraValue = (val) => {
  if (!val) return ""
  const str = String(val).trim()
  if (str === "1" || str === "ยุคแรก") return "1"
  if (str === "2" || str === "ยุคกลาง") return "2"
  if (str === "3" || str === "ยุคฟื้นฟู") return "3"
  if (str === "4" || str === "ยุคปัจจุบัน") return "4"
  return str
}

export default function Scholars() {
  const { items: scholars, loading } = useContentCollection("scholars", SCHOLARS, null, { live: false })
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  
  const [search, setSearch] = useState("")
  const [era, setEra] = useState("0")
  const [field, setField] = useState("all")
  
  const [aqFilter, setAqFilter] = useState("")
  const [mhFilter, setMhFilter] = useState("")
  const [mzFilter, setMzFilter] = useState("")

  const [visibleCounts, setVisibleCounts] = useState({ 1: 6, 2: 6, 3: 6, 4: 6 })

  const resetVisible = () => {
    setVisibleCounts({ 1: 6, 2: 6, 3: 6, 4: 6 })
  }

  const fields = ["all", ...new Set([...(taxonomy.scholarFields || []), ...scholars.map(s => s.field).filter(Boolean)])]

  const filtered = useMemo(() => {
    return scholars.filter(s => {
      const term = search.toLowerCase().trim()
      const matchSearch = !term ||
        (s.name && s.name.toLowerCase().includes(term)) ||
        (s.latin && s.latin.toLowerCase().includes(term)) ||
        (s.note && s.note.toLowerCase().includes(term))

      const matchEra = era === "0" || mapEraValue(s.era) === mapEraValue(era)
      const matchField = field === "all" || (s.field && s.field.includes(field))
      
      const matchAq = !aqFilter || s.aq === aqFilter
      const matchMh = !mhFilter || s.mh === mhFilter
      const matchMz = !mzFilter || s.mz === mzFilter

      return matchSearch && matchEra && matchField && matchAq && matchMh && matchMz
    })
  }, [scholars, search, era, field, aqFilter, mhFilter, mzFilter])

  const eras = ["0", ...(taxonomy.scholarEras || []).map(item => item.id)]
  const eraLabelMap = Object.fromEntries((taxonomy.scholarEras || []).map(item => [String(item.id), item.label]))

  const getAqClass = (aq) => {
    switch (aq) {
      case "สะลัฟ": return "baq-salafi"
      case "อะชะอะรี": return "baq-ashari"
      case "มาตุรีดี": return "baq-maturidi"
      default: return "baq-unknown"
    }
  }

  const getMhClass = (mh) => {
    switch (mh) {
      case "สะลัฟี": return "bmh-salafi"
      case "ศูฟี": return "bmh-sufi"
      case "เดโอบันดี": return "bmh-deobandi"
      case "บะเรลวี": return "bmh-bareilwi"
      case "ตับลีฆ": return "bmh-tabligh"
      case "อิควาน": return "bmh-ikhwan"
      case "กลาสสิก": return "bmh-classic"
      default: return "bmh-unknown"
    }
  }

  const getMzClass = (mz) => {
    switch (mz) {
      case "หัมบะลี": return "bmz-hanbali"
      case "ชาฟิอี": return "bmz-shafii"
      case "มาลิกี": return "bmz-maliki"
      case "หะนะฟี": return "bmz-hanafi"
      case "ซอฮิรี": return "bmz-zahiri"
      default: return "bmz-unknown"
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 8 }}>ทำเนียบบุคคลในอิสลาม</h1>
        <p style={{ color: "var(--t2)" }}>รวบรวมบุคคลและปราชญ์ในประวัติศาสตร์อิสลามแบ่งตามยุคสมัย พร้อมข้อมูลวิชาการ</p>
        {loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดรายชื่อใหม่ล่าสุด...</p>}
      </div>

      {/* DISCLAIMER BANNER */}
      <div style={{
        background: "rgba(245, 158, 11, 0.08)",
        border: "0.5px solid rgba(245, 158, 11, 0.25)",
        padding: "12px 16px",
        borderRadius: "8px",
        marginBottom: "24px",
        fontSize: "12px",
        color: "var(--amber)",
        lineHeight: "1.5",
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }}>
        <i className="ti ti-info-circle" style={{ fontSize: "16px", flexShrink: 0 }}></i>
        <span>
          <strong>ชี้แจง:</strong> รายชื่อและฐานข้อมูลบุคคลด้านล่างนี้ยังอยู่ในขั้นตอนการปรับปรุงและอัปเดตข้อมูลให้สมบูรณ์ ทีมงานกำลังทยอยตรวจสอบรายละเอียดวิชาการทีละท่านอย่างรอบคอบ
        </span>
      </div>
      {/* SEARCH + FILTER */}
      <div className="filter-bar">
        <div className="filter-search">
          <i className="ti ti-search"></i>
          <input 
            placeholder="ค้นหาชื่ออุลามาอ์ (ไทย/English/ประวัติ)..." 
            value={search}
            onChange={e => { setSearch(e.target.value); resetVisible(); }} 
          />
        </div>
        <select 
          className="filter-select"
          value={field} 
          onChange={e => { setField(e.target.value); resetVisible(); }} 
        >
          {fields.map(f => <option key={f} value={f}>{f === "all" ? "ทุกสาขาวิชา" : f}</option>)}
        </select>
      </div>
      
      {/* Advanced Filters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        <select 
          className="filter-select"
          value={aqFilter} 
          onChange={e => { setAqFilter(e.target.value); resetVisible(); }} 
          style={{ width: "100%" }}
        >
          <option value="">ทุกอะกีดะฮฺ</option>
          <option value="สะลัฟ">สะลัฟ / อะฮฺลุสสุนนะฮฺ</option>
          <option value="อะชะอะรี">อะชะอะรี</option>
          <option value="มาตุรีดี">มาตุรีดี</option>
          <option value="ไม่ระบุ">ไม่ระบุ</option>
        </select>
        <select 
          className="filter-select"
          value={mhFilter} 
          onChange={e => { setMhFilter(e.target.value); resetVisible(); }} 
          style={{ width: "100%" }}
        >
          <option value="">ทุกมันฮัจญ์</option>
          <option value="สะลัฟี">สะลัฟี</option>
          <option value="ศูฟี">ศูฟี / ตะเซาวุฟ</option>
          <option value="เดโอบันดี">เดโอบันดี</option>
          <option value="บะเรลวี">บะเรลวี</option>
          <option value="ตับลีฆ">ตับลีฆ</option>
          <option value="อิควาน">อิควาน</option>
          <option value="กลาสสิก">กลาสสิก / อะชะอะรี</option>
          <option value="ไม่ระบุ">ไม่ระบุ</option>
        </select>
        <select 
          className="filter-select"
          value={mzFilter} 
          onChange={e => { setMzFilter(e.target.value); resetVisible(); }} 
          style={{ width: "100%" }}
        >
          <option value="">ทุกมัซฮับ</option>
          <option value="หัมบะลี">หัมบะลี</option>
          <option value="ชาฟิอี">ชาฟิอี</option>
          <option value="มาลิกี">มาลิกี</option>
          <option value="หะนะฟี">หะนะฟี</option>
          <option value="ซอฮิรี">ซอฮิรี</option>
          <option value="ไม่ระบุ">ไม่ระบุ</option>
        </select>
      </div>

      {/* ERA TABS */}
      <div className="filter-pills">
        {eras.map(e => (
          <button 
            key={e} 
            onClick={() => { setEra(e); resetVisible(); }} 
            className={`filter-pill ${era === e ? 'active' : ''}`}
          >
            {e === "0" ? "ทั้งหมด" : eraLabelMap[e] || ERA_LABELS[e] || `ยุคที่ ${e}`}
          </button>
        ))}
      </div>

      {/* TIMELINE */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card scholar-skeleton-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="skeleton-shimmer" style={{ height: 14, width: "50%", borderRadius: 4 }}></div>
                <div className="skeleton-shimmer" style={{ height: 12, width: "20%", borderRadius: 4 }}></div>
              </div>
              <div className="skeleton-shimmer" style={{ height: 11, width: "35%", borderRadius: 4 }}></div>
              <div style={{ display: "flex", gap: 12 }}>
                <div className="skeleton-shimmer" style={{ height: 11, width: "25%", borderRadius: 4 }}></div>
                <div className="skeleton-shimmer" style={{ height: 11, width: "25%", borderRadius: 4 }}></div>
              </div>
              <div className="skeleton-shimmer" style={{ height: 12, width: "80%", borderRadius: 4, marginTop: 4 }}></div>
            </div>
          ))}
        </div>
      ) : (
        eras.filter(item => item !== "0").map(eraNum => {
        const eraScholars = filtered.filter(s => mapEraValue(s.era) === mapEraValue(eraNum))
        if (eraScholars.length === 0) return null
        const color = ERA_COLORS[eraNum] || "var(--teal)"
        const visibleScholars = eraScholars.slice(0, visibleCounts[eraNum] || 12)
        
        return (
          <div key={eraNum} style={{ marginBottom: 36 }}>
            {/* Era Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 3, height: 28, background: color, borderRadius: 2, flexShrink: 0 }}></div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  {eraLabelMap[eraNum] || ERA_LABELS[eraNum] || `ยุคที่ ${eraNum}`}
                </div>
                <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{eraScholars.length} ท่าน</div>
              </div>
            </div>

            {/* Scholars Cards Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {visibleScholars.map(s => (
                <div 
                  key={s.id} 
                  className="card scholar-card"
                  style={{ 
                    padding: 16, 
                    borderTop: `3px solid ${color}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", lineHeight: 1.4 }}>{s.name}</div>
                    <span 
                      className="tag" 
                      style={{ 
                        background: "var(--acc2)", 
                        color: "var(--t2)", 
                        fontSize: 9, 
                        flexShrink: 0, 
                        fontWeight: 400 
                      }}
                    >
                      {s.field}
                    </span>
                  </div>
                  
                  {s.latin && (
                    <div style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace" }}>
                      {s.latin}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 300 }}>
                      <span style={{ color: "var(--t3)" }}>ฮ.ศ. </span>
                      <span style={{ color: color, fontWeight: 500 }}>{s.hijri}</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 300 }}>
                      <span style={{ color: "var(--t3)" }}>ค.ศ. </span>
                      <span style={{ color: "var(--text)" }}>{s.ad}</span>
                    </div>
                  </div>

                  {/* Badges for Creed, Manhaj, Mazhab */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0" }}>
                    {s.aq && s.aq !== "ไม่ระบุ" && (
                      <span className={`badge-mockup ${getAqClass(s.aq)}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                        {s.aq}
                      </span>
                    )}
                    {s.mh && s.mh !== "ไม่ระบุ" && (
                      <span className={`badge-mockup ${getMhClass(s.mh)}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                        {s.mh}
                      </span>
                    )}
                    {s.mz && s.mz !== "ไม่ระบุ" && (
                      <span className={`badge-mockup ${getMzClass(s.mz)}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                        {s.mz}
                      </span>
                    )}
                  </div>

                  <ScholarNote note={s.note} />
                </div>
              ))}
            </div>

            {/* SHOW MORE BUTTON */}
            {eraScholars.length > visibleScholars.length && (
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button 
                  onClick={() => setVisibleCounts(prev => ({ ...prev, [eraNum]: prev[eraNum] + 6 }))}
                  style={{
                    fontFamily: "'Prompt', sans-serif", fontSize: 11, fontWeight: 300,
                    padding: "5px 16px", borderRadius: 20, border: ".5px solid var(--br)",
                    cursor: "pointer", transition: "all .15s",
                    background: "var(--card)", color: "var(--t2)"
                  }}
                  onMouseOver={e => { e.target.style.background = 'var(--acc)'; e.target.style.color = 'var(--bg)' }}
                  onMouseOut={e => { e.target.style.background = 'var(--card)'; e.target.style.color = 'var(--t2)' }}
                >
                  แสดงเพิ่มเติม ({eraScholars.length - visibleScholars.length} ท่าน)
                </button>
              </div>
            )}
          </div>
        )
      }))}

      {!loading && filtered.length === 0 && <div className="empty">ไม่พบรายชื่อบุคคลที่ตรงกับการค้นหา</div>}

      {/* CONTACT */}
      <div style={{
        marginTop: 32, padding: "20px 24px", background: "var(--acc2)",
        border: ".5px solid var(--acc-br)", borderRadius: 14, textAlign: "center"
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>
          ต้องการเสนอรายชื่อบุคคลเพิ่มเติม?
        </div>
        <p style={{ fontSize: 12, marginBottom: 14 }}>ติดต่อทีม Talib Club เพื่อเสนอรายชื่อบุคคลและผู้รู้เพิ่มเติม</p>
        <a 
          href="https://www.facebook.com/TalibClub" 
          target="_blank" 
          rel="noreferrer" 
          className="btn btn-main" 
          style={{ fontSize: 12, textDecoration: "none", display: "inline-block" }}
        >
          ติดต่อเรา
        </a>
      </div>
    </div>
  )
}

function ScholarNote({ note }) {
  const [expanded, setExpanded] = useState(false);
  const noteText = note || "";
  const isLong = noteText.length > 80;
  
  if (!noteText) return null;
  
  return (
    <div style={{ marginTop: "auto", paddingTop: 4 }}>
      <p 
        style={{
          fontSize: 11.5,
          lineHeight: 1.55,
          color: "var(--text2)",
          fontWeight: 300,
          display: "-webkit-box",
          WebkitLineClamp: expanded ? "unset" : 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        }}
      >
        {noteText}
      </p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          style={{
            background: "none",
            border: "none",
            color: "var(--teal)",
            fontSize: "11px",
            cursor: "pointer",
            padding: "2px 0 0 0",
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            fontFamily: "'Prompt', sans-serif",
            fontWeight: 400,
            marginTop: 2
          }}
        >
          {expanded ? (
            <>แสดงน้อยลง <i className="ti ti-chevron-up"></i></>
          ) : (
            <>อ่านเพิ่มเติม <i className="ti ti-chevron-down"></i></>
          )}
        </button>
      )}
    </div>
  )
}