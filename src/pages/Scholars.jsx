import { useState, useMemo, useEffect } from "react"
import { DEFAULT_TAXONOMY, SCHOLARS } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"
import SEOHead, { BASE_URL } from '../components/SEOHead.jsx'

const ERA_LABELS = {
  salaf: "ยุคแรก (Salaf) ค.ศ. 600–900",
  classical: "ยุคกลาง ค.ศ. 900–1500",
  revival: "ยุคฟื้นฟู ค.ศ. 1500–1800",
  modern: "ยุคปัจจุบัน ค.ศ. 1800–ปัจจุบัน"
}
const ERA_COLORS = {
  salaf: "var(--teal)",
  classical: "#c9a84c",
  revival: "#8b7dd8",
  modern: "var(--acc)"
}

const mapEraValue = (val) => {
  if (!val) return ""
  const str = String(val).trim().toLowerCase()
  if (str === "1" || str === "ยุคแรก" || str === "salaf") return "salaf"
  if (str === "2" || str === "ยุคกลาง" || str === "classical") return "classical"
  if (str === "3" || str === "ยุคฟื้นฟู" || str === "revival") return "revival"
  if (str === "4" || str === "ยุคปัจจุบัน" || str === "modern") return "modern"
  return str
}

export default function Scholars() {
  const scholarsQueryOptions = useMemo(() => ({ live: false }), [])
  const { items: scholars, loading } = useContentCollection("scholars", SCHOLARS, null, scholarsQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  const [search, setSearch] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [era, setEra] = useState("0")
  const [field, setField] = useState("all")

  const [aqFilter, setAqFilter] = useState("")
  const [mhFilter, setMhFilter] = useState("")
  const [mzFilter, setMzFilter] = useState("")

  const [visibleCounts, setVisibleCounts] = useState({ salaf: 6, classical: 6, revival: 6, modern: 6 })

  const resetVisible = () => {
    setVisibleCounts({ salaf: 6, classical: 6, revival: 6, modern: 6 })
  }

  const fields = ["all", ...new Set([...(taxonomy.scholarFields || []).map(f => typeof f === 'string' ? f : f.label), ...scholars.map(s => s.field).filter(Boolean)])]

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
      <SEOHead
        title="ทำเนียบอุลามาอ์และนักวิชาการอิสลาม | Talib Club"
        description="รวบรวมประวัติและผลงานของอุลามาอ์ นักวิชาการ และนักปราชญ์อิสลามที่สำคัญ"
        canonical={`${BASE_URL}/scholars`}
      />
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
      {/* ━━━ SEARCH & FILTER BAR ━━━ */}
      <div style={{ display: "flex", gap: 8, marginBottom: showAdvanced ? 12 : 24 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 16 }}></i>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); resetVisible(); }}
            placeholder="ค้นหาชื่ออุลามาอ์ (ไทย/English/ประวัติ)..."
            style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "12px 16px 12px 42px", background: "var(--bg2)", border: "1px solid transparent", fontSize: 14, outline: "none", transition: "border 0.2s" }}
            onFocus={(e) => e.target.style.border = "1px solid var(--teal)"}
            onBlur={(e) => e.target.style.border = "1px solid transparent"}
          />
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            padding: "0 18px",
            borderRadius: 24,
            background: showAdvanced ? "var(--teal)" : "var(--bg2)",
            color: showAdvanced ? "#fff" : "var(--text)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s"
          }}
          title="ตัวกรองเพิ่มเติม"
        >
          <i className="ti ti-filter" style={{ fontSize: 18 }}></i>
        </button>
      </div>

      {/* ━━━ EXPANDABLE FILTERS ━━━ */}
      {showAdvanced && (
        <div style={{ background: "var(--bg2)", padding: "16px", borderRadius: 16, marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>สาขาวิชา</span>
            <select value={field} onChange={e => { setField(e.target.value); resetVisible(); }} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              {fields.map(f => <option key={f} value={f}>{f === "all" ? "ทุกสาขาวิชา" : f}</option>)}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>ยุคสมัย</span>
            <select value={era} onChange={e => { setEra(e.target.value); resetVisible(); }} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              {eras.map(e => (
                <option key={e} value={e}>{e === "0" ? "-- ทุกยุคสมัย --" : eraLabelMap[e] || ERA_LABELS[e] || `ยุคที่ ${e}`}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>อะกีดะฮฺ</span>
            <select value={aqFilter} onChange={e => { setAqFilter(e.target.value); resetVisible(); }} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              <option value="">ทุกอะกีดะฮฺ</option>
              <option value="สะลัฟ">สะลัฟ / อะฮฺลุสสุนนะฮฺ</option>
              <option value="อะชะอะรี">อะชะอะรี</option>
              <option value="มาตุรีดี">มาตุรีดี</option>
              <option value="ไม่ระบุ">ไม่ระบุ</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>มันฮัจญ์</span>
            <select value={mhFilter} onChange={e => { setMhFilter(e.target.value); resetVisible(); }} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
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
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>มัซฮับ</span>
            <select value={mzFilter} onChange={e => { setMzFilter(e.target.value); resetVisible(); }} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              <option value="">ทุกมัซฮับ</option>
              <option value="หัมบะลี">หัมบะลี</option>
              <option value="ชาฟิอี">ชาฟิอี</option>
              <option value="มาลิกี">มาลิกี</option>
              <option value="หะนะฟี">หะนะฟี</option>
              <option value="ซอฮิรี">ซอฮิรี</option>
              <option value="ไม่ระบุ">ไม่ระบุ</option>
            </select>
          </label>
        </div>
      )}

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
                  <ScholarCard
                    key={s.id}
                    s={s}
                    color={color}
                    getAqClass={getAqClass}
                    getMhClass={getMhClass}
                    getMzClass={getMzClass}
                  />
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
          href="https://www.facebook.com/TalibPublisher"
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

function ScholarCard({ s, color, getAqClass, getMhClass, getMzClass }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = s.note && s.note.length > 80

  return (
    <div
      className="card scholar-card"
      onClick={() => {
        if (isLong) {
          setExpanded(!expanded)
        }
      }}
      style={{
        padding: 16,
        borderTop: `3px solid ${color}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: isLong ? "pointer" : "default",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)"
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0px)"
        e.currentTarget.style.boxShadow = "none"
      }}
      role={isLong ? "button" : undefined}
      tabIndex={isLong ? 0 : undefined}
      onKeyDown={(e) => {
        if (isLong && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          setExpanded(!expanded)
        }
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
            fontWeight: 400,
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

      {s.note && (
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
              overflow: "hidden",
              margin: 0,
            }}
          >
            {s.note}
          </p>
          {isLong && (
            <div
              style={{
                color: "var(--teal)",
                fontSize: "11px",
                padding: "4px 0 0 0",
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                fontFamily: "'Prompt', sans-serif",
                fontWeight: 400,
                marginTop: 2,
              }}
            >
              {expanded ? (
                <>แสดงน้อยลง <i className="ti ti-chevron-up"></i></>
              ) : (
                <>อ่านเพิ่มเติม <i className="ti ti-chevron-down"></i></>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
