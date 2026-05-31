import { useState, useMemo, useEffect } from "react"
import { SCHOLARS } from "../data/scholars.js"
import { useContentCollection } from "../lib/contentStore.js"

export default function Scholars() {
  const { items: scholars, loading } = useContentCollection("scholars", SCHOLARS)

  const [search, setSearch] = useState("")
  const [aqFilter, setAqFilter] = useState("")
  const [mhFilter, setMhFilter] = useState("")
  const [mzFilter, setMzFilter] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 24

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, aqFilter, mhFilter, mzFilter])

  // Filter scholars list
  const filtered = useMemo(() => {
    return scholars.filter(s => {
      const term = search.toLowerCase().trim()
      const matchSearch = !term ||
        (s.name && s.name.toLowerCase().includes(term)) ||
        (s.latin && s.latin.toLowerCase().includes(term)) ||
        (s.note && s.note.toLowerCase().includes(term))

      const matchAq = !aqFilter || s.aq === aqFilter
      const matchMh = !mhFilter || s.mh === mhFilter
      const matchMz = !mzFilter || s.mz === mzFilter

      return matchSearch && matchAq && matchMh && matchMz
    })
  }, [scholars, search, aqFilter, mhFilter, mzFilter])

  // Dynamic counts for stats bar
  const stats = useMemo(() => {
    const total = filtered.length
    const aqCounts = {
      "สะลัฟ": 0,
      "อะชะอะรี": 0,
      "มาตุรีดี": 0,
      "ไม่ระบุ": 0
    }
    filtered.forEach(s => {
      const aqVal = s.aq || "ไม่ระบุ"
      if (aqCounts[aqVal] !== undefined) {
        aqCounts[aqVal]++
      } else {
        aqCounts["ไม่ระบุ"]++
      }
    })
    return { total, aqCounts }
  }, [filtered])

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filtered.slice(start, start + itemsPerPage)
  }, [filtered, currentPage])

  // Generate page buttons array with ellipses
  const pageNumbers = useMemo(() => {
    const pages = []
    const maxVisible = 5
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      let start = Math.max(2, currentPage - 1)
      let end = Math.min(totalPages - 1, currentPage + 1)

      if (currentPage <= 2) {
        end = 4
      } else if (currentPage >= totalPages - 1) {
        start = totalPages - 3
      }

      if (start > 2) pages.push("...")
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push("...")
      pages.push(totalPages)
    }
    return pages;
  }, [currentPage, totalPages])

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Map values to CSS classes
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
      <header style={{ padding: "0 0 1.5rem 0", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end", justifyContent: "space-between", borderBottom: "1px solid var(--br)" }}>
        <div className="header-title">
          <h1 style={{ fontSize: "1.6rem", fontWeight: 600, color: "var(--text)" }}>ฐานข้อมูลนักวิชาการอิสลาม</h1>
          <p style={{ fontSize: "0.78rem", color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
            Emaanlibrary.com — อะกีดะฮฺ · มันฮัจญ์ · มัซฮับ
          </p>
        </div>
        {loading && <p style={{ fontSize: 12, color: "var(--t3)", margin: 0 }}>กำลังโหลดรายชื่อนักวิชาการ...</p>}
      </header>

      {/* CONTROLS */}
      <div className="controls" style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 0", borderBottom: "1px solid var(--br)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 100 }}>
        <input 
          type="text" 
          id="search" 
          placeholder="ค้นหาชื่อ (ไทย/English)..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select 
          id="f-aq" 
          value={aqFilter} 
          onChange={e => setAqFilter(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">อะกีดะฮฺทั้งหมด</option>
          <option value="สะลัฟ">สะลัฟ / อะฮฺลุสสุนนะฮฺ</option>
          <option value="อะชะอะรี">อะชะอะรี</option>
          <option value="มาตุรีดี">มาตุรีดี</option>
          <option value="ไม่ระบุ">ไม่ระบุ</option>
        </select>
        <select 
          id="f-mh" 
          value={mhFilter} 
          onChange={e => setMhFilter(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">มันฮัจญ์ทั้งหมด</option>
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
          id="f-mz" 
          value={mzFilter} 
          onChange={e => setMzFilter(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">มัซฮับทั้งหมด</option>
          <option value="หัมบะลี">หัมบะลี</option>
          <option value="ชาฟิอี">ชาฟิอี</option>
          <option value="มาลิกี">มาลิกี</option>
          <option value="หะนะฟี">หะนะฟี</option>
          <option value="ซอฮิรี">ซอฮิรี</option>
          <option value="ไม่ระบุ">ไม่ระบุ</option>
        </select>
      </div>

      {/* STATS BAR */}
      <div className="stats-bar" style={{ padding: "8px 0", fontSize: 12, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace", borderBottom: "1px solid var(--br)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span id="stats-count">แสดง {stats.total} จาก {scholars.length} รายชื่อ</span>
        <span id="stats-aq">
          สะลัฟ: {stats.aqCounts["สะลัฟ"]} • อะชะอะรี: {stats.aqCounts["อะชะอะรี"]} • มาตุรีดี: {stats.aqCounts["มาตุรีดี"]} • ไม่ระบุ: {stats.aqCounts["ไม่ระบุ"]}
        </span>
      </div>

      {/* LEGEND */}
      <div className="legend" style={{ padding: "10px 0", display: "flex", flexWrap: "wrap", gap: 6, borderBottom: "1px solid var(--br)", alignItems: "center" }}>
        <span className="leg-label" style={{ fontSize: 11, color: "var(--t3)", marginRight: 4 }}>อะกีดะฮฺ</span>
        <span className="badge-mockup baq-salafi">สะลัฟ</span>
        <span className="badge-mockup baq-ashari">อะชะอะรี</span>
        <span className="badge-mockup baq-maturidi">มาตุรีดี</span>
        <span className="badge-mockup baq-unknown">ไม่ระบุ</span>
        
        <span style={{ margin: "0 8px", color: "var(--br)" }}>|</span>
        
        <span className="leg-label" style={{ fontSize: 11, color: "var(--t3)", marginRight: 4 }}>มันฮัจญ์</span>
        <span className="badge-mockup bmh-salafi">สะลัฟี</span>
        <span className="badge-mockup bmh-sufi">ศูฟี</span>
        <span className="badge-mockup bmh-deobandi">เดโอบันดี</span>
        <span className="badge-mockup bmh-tabligh">ตับลีฆ</span>
        <span className="badge-mockup bmh-ikhwan">อิควาน</span>
        <span className="badge-mockup bmh-classic">กลาสสิก</span>
        <span className="badge-mockup bmh-unknown">ไม่ระบุ</span>
        
        <span style={{ margin: "0 8px", color: "var(--br)" }}>|</span>
        
        <span className="leg-label" style={{ fontSize: 11, color: "var(--t3)", marginRight: 4 }}>มัซฮับ</span>
        <span className="badge-mockup bmz-hanbali">หัมบะลี</span>
        <span className="badge-mockup bmz-shafii">ชาฟิอี</span>
        <span className="badge-mockup bmz-maliki">มาลิกี</span>
        <span className="badge-mockup bmz-hanafi">หะนะฟี</span>
        <span className="badge-mockup bmz-zahiri">ซอฮิรี</span>
      </div>

      {/* GRID */}
      <div 
        key={currentPage + "_" + search + "_" + aqFilter + "_" + mhFilter + "_" + mzFilter} 
        className="grid-mockup fade-in-active" 
        style={{ marginTop: "1rem" }}
      >
        {currentItems.map(s => (
          <div key={s.id} className="card-mockup">
            <div className="card-name-mockup">{s.name}</div>
            <div className="card-latin-mockup">{s.latin}</div>
            <div className="card-dates-mockup">
              ฮ.ศ. {s.hijri} · ค.ศ. {s.ad}
            </div>
            <div className="badges-mockup">
              <span className={`badge-mockup ${getAqClass(s.aq)}`}>{s.aq}</span>
              <span className={`badge-mockup ${getMhClass(s.mh)}`}>{s.mh}</span>
              <span className={`badge-mockup ${getMzClass(s.mz)}`}>{s.mz}</span>
            </div>
            <div className="card-desc-mockup">{s.note}</div>
          </div>
        ))}
        {currentItems.length === 0 && (
          <div className="empty">ไม่พบข้อมูลปราชญ์ตามเงื่อนไขที่เลือก</div>
        )}
      </div>

      {/* PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="pagination-container">
          <button 
            className={`pagination-btn ${currentPage === 1 ? "disabled" : ""}`}
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ก่อนหน้า
          </button>
          
          {pageNumbers.map((p, idx) => (
            p === "..." ? (
              <span key={`dots_${idx}`} style={{ color: "var(--t3)", padding: "0 6px" }}>...</span>
            ) : (
              <button 
                key={`page_${p}`}
                className={`pagination-btn ${currentPage === p ? "active" : ""}`}
                onClick={() => handlePageChange(p)}
              >
                {p}
              </button>
            )
          ))}

          <button 
            className={`pagination-btn ${currentPage === totalPages ? "disabled" : ""}`}
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  )
}