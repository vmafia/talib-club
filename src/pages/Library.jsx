import { useState, useEffect, useMemo } from "react"
import { BOOKS, DEFAULT_TAXONOMY } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"
import toast from "react-hot-toast"
import { bumpContentMetric } from "../utils/contentMetrics.js"
import { clampPage } from "../utils/pagination.js"
import PaginationBar from "../components/PaginationBar.jsx"
import ContentStatusBanner from "../components/ContentStatusBanner.jsx"
import ImageWithFallback from "../components/ImageWithFallback.jsx"

// ฟังก์ชันดึงรูปปก
function getDirectUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`
  }
  return url
}

// ฟังก์ชันแปลงลิงก์ดาวน์โหลด
function getDownloadUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`
  }
  return url
}

export default function Library({ go, authState, ctx }) {
  const booksQueryOptions = useMemo(() => ({ live: false, limit: 200 }), [])
  const { items: books, loading, error, isUsingFallback } = useContentCollection("books", BOOKS, null, booksQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)

  const filter = ctx?.filter || "all"
  const categoryFilter = ctx?.cat || "all"
  const sourceFilter = ctx?.source || "all"
  const sortBy = ctx?.sortBy || (filter === "วารสาร" ? "issue-desc" : "newest")
  const showAdvancedFilters = ctx?.showAdv === "true"
  const requestedPage = parseInt(ctx?.page, 10) || 1
  const ITEMS_PER_PAGE = 12

  const [search, setSearch] = useState(() => ctx?.search || "")

  useEffect(() => {
    setSearch(ctx?.search || "")
  }, [ctx?.search])

  const types = ["all", ...(taxonomy.bookTypes || [])]

  const availableCategories = useMemo(() => {
    const cats = new Set(books.map(b => b.category).filter(Boolean))
    return ["all", ...Array.from(cats).sort()]
  }, [books])

  const availableSources = useMemo(() => {
    const sources = new Set(books.map(b => b.source).filter(Boolean))
    return ["all", ...Array.from(sources).sort()]
  }, [books])

  const updateFilters = (newParams) => {
    const updated = {
      filter,
      cat: categoryFilter,
      source: sourceFilter,
      sortBy,
      search: newParams.search !== undefined ? newParams.search : search,
      showAdv: showAdvancedFilters ? "true" : "false",
      page: requestedPage,
      ...newParams
    }
    if (newParams.filter !== undefined || newParams.cat !== undefined || newParams.source !== undefined || newParams.search !== undefined || newParams.showAdv !== undefined || newParams.sortBy !== undefined) {
      updated.page = 1
    }
    if (newParams.filter === "วารสาร" && newParams.sortBy === undefined) {
      updated.sortBy = "issue-desc"
    } else if (newParams.filter !== undefined && newParams.filter !== "วารสาร" && newParams.sortBy === undefined) {
      updated.sortBy = "newest"
    }
    go("library", updated, { replace: true, noScroll: true })
  }

  const handleDownloadClick = async (b) => {
    if (!b?.id) return
    try {
      await bumpContentMetric("books", b.id, "downloads")
    } catch (err) {
      console.error("ไม่สามารถอัปเดตยอดดาวน์โหลดได้:", err)
    }
  }

  const filtered = useMemo(() => {
    const result = books.filter(b => {
      const matchType = filter === "all" || b.type === filter
      const matchCategory = categoryFilter === "all" || b.category === categoryFilter
      const matchSource = sourceFilter === "all" || b.source === sourceFilter
      const matchSearch =
        !search ||
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        (b.desc && b.desc.toLowerCase().includes(search.toLowerCase())) ||
        (b.author && b.author.toLowerCase().includes(search.toLowerCase()))
      return matchType && matchCategory && matchSource && matchSearch
    })

    return [...result].sort((a, b) => {
      if (filter === "วารสาร") {
        const issueA = Number(a.issueNumber) || 0
        const issueB = Number(b.issueNumber) || 0
        if (sortBy === "issue-asc") {
          return issueA - issueB
        } else {
          return issueB - issueA
        }
      }
      const normalizeYear = (yr) => {
        let y = Number(yr) || 0
        if (y > 2400) y -= 543
        return y
      }
      const yearA = normalizeYear(a.year)
      const yearB = normalizeYear(b.year)
      if (sortBy === "oldest") {
        if (yearA !== yearB) return yearA - yearB
        
        // If years are equal, try to sort by issueNumber if available
        const issueA = Number(a.issueNumber) || 0
        const issueB = Number(b.issueNumber) || 0
        if (issueA !== issueB && (issueA > 0 || issueB > 0)) {
          return issueA - issueB
        }
        
        // Fallback to creation time
        const timeA = a.createdAt?.seconds || a.createdAt?.seconds || 0
        const timeB = b.createdAt?.seconds || b.createdAt?.seconds || 0
        if (timeA !== timeB) return timeA - timeB
        
        return String(a.id || "").localeCompare(String(b.id || ""))
      } else {
        if (yearA !== yearB) return yearB - yearA
        
        // If years are equal, try to sort by issueNumber (descending) if available
        const issueA = Number(a.issueNumber) || 0
        const issueB = Number(b.issueNumber) || 0
        if (issueA !== issueB && (issueA > 0 || issueB > 0)) {
          return issueB - issueA
        }
        
        // Fallback to creation time (newest first)
        const timeA = a.createdAt?.seconds || 0
        const timeB = b.createdAt?.seconds || 0
        if (timeA !== timeB) return timeB - timeA
        
        return String(b.id || "").localeCompare(String(a.id || ""))
      }
    })
  }, [books, filter, categoryFilter, sourceFilter, search, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1)
  const currentPage = clampPage(requestedPage, totalPages)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const currentItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  useEffect(() => {
    if (totalPages > 0 && requestedPage !== currentPage) {
      updateFilters({ page: currentPage })
    }
  }, [currentPage, requestedPage, totalPages])

  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ marginBottom: 8 }}>ห้องสมุด</h1>
      <p style={{ marginBottom: loading ? 4 : 24 }}>หนังสือ วารสาร และสื่อดาวน์โหลดทั้งหมดของ Talib Club</p>
      <ContentStatusBanner loading={loading} error={error} isUsingFallback={isUsingFallback} />

      {/* SEARCH + MAIN FILTER */}
      <div className="filter-bar">
        <div className="filter-search">
          <i className="ti ti-search"></i>
          <input
            placeholder="ค้นหาชื่อหนังสือ, ผู้เขียน, หรือเนื้อหา..."
            value={search}
            onChange={e => { setSearch(e.target.value); updateFilters({ search: e.target.value }) }}
          />
        </div>
        {filter === "วารสาร" ? (
          <select
            className="filter-select"
            value={sortBy}
            onChange={e => updateFilters({ sortBy: e.target.value })}
          >
            <option value="issue-desc">เล่มใหม่ล่าสุด ➜ เล่มเก่า</option>
            <option value="issue-asc">เล่มเก่าสุด ➜ เล่มใหม่</option>
          </select>
        ) : (
          <select
            className="filter-select"
            value={sortBy}
            onChange={e => updateFilters({ sortBy: e.target.value })}
          >
            <option value="newest">ปีที่พิมพ์ ใหม่ ➜ เก่า</option>
            <option value="oldest">ปีที่พิมพ์ เก่า ➜ ใหม่</option>
          </select>
        )}

        <button
          onClick={() => updateFilters({ showAdv: !showAdvancedFilters ? "true" : "false" })}
          className={showAdvancedFilters ? "btn btn-teal" : "btn btn-outline"}
          style={{
            padding: "0 16px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            height: 40,
            borderRadius: 12,
            boxSizing: "border-box"
          }}
        >
          <i className="ti ti-filter"></i> ตัวกรองเพิ่มเติม
        </button>
      </div>

      <div className="filter-pills">
        {types.map(t => (
          <button
            key={t}
            onClick={() => updateFilters({ filter: t })}
            className={`filter-pill ${filter === t ? 'active' : ''}`}
          >
            {t === "all" ? "ทั้งหมด" : t}
          </button>
        ))}
      </div>

      {/* ADVANCED FILTERS */}
      {showAdvancedFilters && (
        <div className="card" style={{ padding: 16, marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, background: "var(--acc2)" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--t2)", marginBottom: 6, fontWeight: 500 }}>หมวดหมู่เนื้อหา</label>
            <select value={categoryFilter} onChange={e => updateFilters({ cat: e.target.value })} style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)" }}>
              <option value="all">-- ทุกหมวดหมู่ --</option>
              {availableCategories.filter(c => c !== "all").map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--t2)", marginBottom: 6, fontWeight: 500 }}>แหล่งที่มา / สำนักพิมพ์</label>
            <select value={sourceFilter} onChange={e => updateFilters({ source: e.target.value })} style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)" }}>
              <option value="all">-- ทุกสำนักพิมพ์ --</option>
              {availableSources.filter(s => s !== "all").map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* BOOKS GRID */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card" style={{ padding: 16, display: "flex", gap: 16 }}>
              <div className="skeleton-shimmer" style={{ width: 90, height: 120, borderRadius: 6, flexShrink: 0 }}></div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="skeleton-shimmer" style={{ height: 12, width: "30%", borderRadius: 4 }}></div>
                <div className="skeleton-shimmer" style={{ height: 16, width: "90%", borderRadius: 4 }}></div>
                <div className="skeleton-shimmer" style={{ height: 12, width: "60%", borderRadius: 4 }}></div>
                <div className="skeleton-shimmer" style={{ height: 12, width: "80%", borderRadius: 4, marginTop: 4 }}></div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">ไม่พบรายการที่ตรงกับการค้นหา หรือตัวกรองที่เลือก</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {currentItems.map(b => {
            const descText = b.desc || ""
            const urlRegex = /(https?:\/\/[^\s]+)/gi
            const match = descText.match(urlRegex)
            let cleanDesc = descText
            let onlineUrl = null

            if (match) {
              onlineUrl = match[0]
              cleanDesc = descText.replace(urlRegex, "")
              cleanDesc = cleanDesc.replace(/อ่านได้ที่\s*:\s*/gi, "")
              cleanDesc = cleanDesc.trim()
            }
            if (!cleanDesc) {
              cleanDesc = "คลิกเพื่อเปิดอ่านหนังสือออนไลน์หรือดาวน์โหลดเพื่อศึกษาเพิ่มเติม"
            }

            return (
              <div
                key={b.id}
                className="card"
                style={{ padding: 16, display: "flex", gap: 16, cursor: "pointer" }}
                onClick={() => {
                  if (!authState?.user) {
                    toast.error("กรุณาเข้าสู่ระบบก่อนดาวน์โหลดหรือดูหนังสือ")
                    go("auth")
                    return
                  }
                  go("library-detail", b)
                }}
              >
                <div style={{ width: 90, flexShrink: 0 }}>
                  {b.coverUrl ? (
                    <ImageWithFallback src={getDirectUrl(b.coverUrl)} alt={b.title} fallbackEmoji="📚" style={{ width: "100%", borderRadius: 6, objectFit: "cover", aspectRatio: "3/4", border: ".5px solid var(--br2)", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "3/4", borderRadius: 6, background: "var(--acc2)", display: "flex", alignItems: "center", justifyContent: "center", border: ".5px solid var(--br2)" }}>
                      <i className={`ti ${b.type === "วารสาร" ? "ti-news" : b.type === "PDF" ? "ti-file-text" : "ti-book"}`} style={{ fontSize: 24, color: "var(--acc)" }}></i>
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <span className="tag tag-acc" style={{ fontSize: 10 }}>{b.type}</span>
                      {b.type === "วารสาร" && b.issueNumber !== undefined && b.issueNumber !== "" && (
                        <span className="tag" style={{ fontSize: 10, background: "rgba(45, 190, 160, 0.15)", color: "var(--teal)" }}>เล่มที่ {b.issueNumber}</span>
                      )}
                      {b.category && <span className="tag" style={{ fontSize: 10, background: "var(--bg2)", color: "var(--t2)" }}>{b.category}</span>}
                    </div>
                    {b.isNew && <span className="tag tag-new" style={{ fontSize: 10 }}>ใหม่</span>}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.4, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {b.title}
                  </div>

                  {b.author && (
                    <div style={{ fontSize: 11, color: "var(--teal)", marginBottom: 6, fontWeight: 400 }}>
                      <i className="ti ti-pencil" style={{ marginRight: 4 }}></i>{b.author}
                    </div>
                  )}

                  <p style={{ fontSize: 11, lineHeight: 1.6, marginBottom: 8, color: "var(--t2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {cleanDesc}
                  </p>

                  <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
                    {!authState?.user ? (
                      <button
                        className="btn btn-outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          toast.error("กรุณาเข้าสู่ระบบก่อนดาวน์โหลดหรือดูหนังสือ")
                          go("auth")
                        }}
                        style={{
                          width: "100%",
                          fontSize: 11,
                          padding: "6px 0",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          borderColor: "var(--br)",
                          color: "var(--t2)",
                          cursor: "pointer"
                        }}
                      >
                        <i className="ti ti-lock" style={{ fontSize: 12 }}></i>
                        เข้าสู่ระบบเพื่อดาวน์โหลด
                      </button>
                    ) : (
                      <>
                        <a
                          className="btn btn-teal"
                          href={getDownloadUrl(b.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownloadClick(b)
                          }}
                          style={{ flex: 1, fontSize: 11, padding: "6px 0", textDecoration: "none", textAlign: "center", pointerEvents: b.fileUrl ? "auto" : "none", opacity: b.fileUrl ? 1 : 0.55 }}
                        >
                          <i className="ti ti-download" style={{ marginRight: 4, fontSize: 12 }}></i>โหลด
                        </a>
                        <a
                          className="btn btn-outline"
                          href={onlineUrl || b.fileUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                          style={{ fontSize: 11, padding: "6px 10px", textDecoration: "none", pointerEvents: (onlineUrl || b.fileUrl) ? "auto" : "none", opacity: (onlineUrl || b.fileUrl) ? 1 : 0.55, display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <i className={`ti ${onlineUrl ? "ti-book-open" : "ti-eye"}`} style={{ fontSize: 12 }}></i>
                          {onlineUrl && <span style={{ fontSize: 11 }}>อ่านออนไลน์</span>}
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* PAGINATION CONTROLS */}
      <PaginationBar currentPage={currentPage} totalPages={totalPages} onPageChange={p => updateFilters({ page: p })} />

      {/* DONATE */}
      <div style={{ marginTop: 40, padding: "20px 24px", background: "var(--acc2)", border: ".5px solid var(--acc-br)", borderRadius: 14, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>ต้องการบริจาคหนังสือหรือวารสาร?</div>
        <p style={{ fontSize: 12, marginBottom: 14 }}>ติดต่อทีม Talib Club เพื่อนำเนื้อหาของท่านมาเผยแพร่</p>
        <a href="https://www.facebook.com/TalibPublisher" target="_blank" rel="noreferrer" className="btn btn-main" style={{ fontSize: 12, textDecoration: "none", display: "inline-block" }}>
          ติดต่อเรา
        </a>
      </div>
    </div>
  )
}
