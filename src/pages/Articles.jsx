import { useState, useMemo, useEffect, useRef } from "react"
import { ARTICLES, DEFAULT_TAXONOMY } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"
import { clampPage } from "../utils/pagination.js"
import PaginationBar from "../components/PaginationBar.jsx"
import ContentStatusBanner from "../components/ContentStatusBanner.jsx"
import ImageWithFallback from "../components/ImageWithFallback.jsx"

export default function Articles({ go, authState, ctx }) {
  // Keep the public article list fresh so it reflects the current Firestore state.
  const articlesQueryOptions = useMemo(() => ({ live: true }), [])
  const { items: articles, loading, error, isUsingFallback } = useContentCollection("articles", ARTICLES, null, articlesQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)

  const cat = ctx?.cat || "all"
  const type = ctx?.type || "all"
  const sortOrder = ctx?.sort || "newest"
  const showAllBrowse = ctx?.showAllBrowse === "true" || ctx?.showAllBrowse === true || false
  const requestedPage = parseInt(ctx?.page, 10) || 1

  const [search, setSearch] = useState(() => ctx?.search || "")

  useEffect(() => {
    setSearch(ctx?.search || "")
  }, [ctx?.search])

  const isLoggedIn = !!authState?.user;

  const types = [{ id: "all", label: "ทั้งหมด" }, ...(taxonomy.articleTypes || [])]
  const categories = [{ id: "all", label: "ทั้งหมด" }, ...(taxonomy.articleCategories || [])]

  const filtered = articles.filter(a => {
    const matchCat = cat === "all" || String(a.category).toLowerCase() === String(cat).toLowerCase()
    const matchType = type === "all" || String(a.type).toLowerCase() === String(type).toLowerCase()
    const matchSearch = !search || String(a.title).toLowerCase().includes(search.toLowerCase())
    return matchCat && matchType && matchSearch
  })

  const sortedFiltered = useMemo(() => {
    const parseDateToMs = (dateStr) => {
      if (!dateStr || typeof dateStr !== "string") return 0
      const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (match) {
        let year = parseInt(match[1], 10)
        const month = parseInt(match[2], 10) - 1
        const day = parseInt(match[3], 10)
        if (year > 2400) year -= 543
        return new Date(year, month, day).getTime()
      }
      const parsed = Date.parse(dateStr)
      return isNaN(parsed) ? 0 : parsed
    }

    return [...filtered].sort((a, b) => {
      const dateA = a.date || ""
      const dateB = b.date || ""
      const timeA = parseDateToMs(dateA)
      const timeB = parseDateToMs(dateB)
      if (sortOrder === "newest") {
        if (timeA !== timeB) return timeB - timeA
        return String(b.id || "").localeCompare(String(a.id || ""))
      } else {
        if (timeA !== timeB) return timeA - timeB
        return String(a.id || "").localeCompare(String(b.id || ""))
      }
    })
  }, [filtered, sortOrder])

  const ITEMS_PER_PAGE = 12

  const updateFilters = (newParams) => {
    const updated = {
      cat,
      type,
      sort: sortOrder,
      search: newParams.search !== undefined ? newParams.search : search,
      showAllBrowse,
      selectedSeriesId: ctx?.selectedSeriesId || "",
      page: requestedPage,
      ...newParams
    }
    if (
      newParams.cat !== undefined || newParams.type !== undefined || newParams.search !== undefined ||
      newParams.showAllBrowse !== undefined || newParams.selectedSeriesId !== undefined || newParams.sort !== undefined
    ) {
      updated.page = 1
    }
    go("articles", updated, { replace: true, noScroll: true })
  }

  const viewArticle = (article) => {
    go("article", {
      ...article,
      fromFilters: {
        cat,
        type,
        search,
        showAllBrowse,
        selectedSeriesId: selectedSeries?.id || "",
        page: requestedPage
      }
    })
  }

  const filteredGeneral = useMemo(() => {
    return sortedFiltered.filter(a => String(a.type).toLowerCase() !== "series")
  }, [sortedFiltered])

  const browseGeneralMode = showAllBrowse && !search.trim()
  const totalPagesAll = Math.max(1, Math.ceil(sortedFiltered.length / ITEMS_PER_PAGE) || 1)
  const totalGeneralPages = Math.max(1, Math.ceil(filteredGeneral.length / ITEMS_PER_PAGE) || 1)
  const effectiveTotalPages = browseGeneralMode ? totalGeneralPages : totalPagesAll
  const currentPage = clampPage(requestedPage, effectiveTotalPages)

  const paginatedFiltered = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return sortedFiltered.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [sortedFiltered, currentPage])

  useEffect(() => {
    if (requestedPage !== currentPage) {
      updateFilters({ page: currentPage })
    }
  }, [currentPage, requestedPage, effectiveTotalPages])

  const paginatedGeneral = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredGeneral.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredGeneral, currentPage])

  const seriesGroups = useMemo(() => {
    return (taxonomy.articleSeries || []).map(s => {
      const filtered = articles.filter(a => String(a.type).toLowerCase() === "series" && String(a.seriesId).toLowerCase() === String(s.id).toLowerCase())
      const sorted = [...filtered].sort((a, b) => (a.part || 0) - (b.part || 0))
      return {
        ...s,
        articles: sorted
      }
    }).filter(s => s.articles.length > 0)
  }, [taxonomy.articleSeries, articles])

  const selectedSeries = useMemo(() => {
    if (!ctx?.selectedSeriesId) return null
    return seriesGroups.find(s => String(s.id).toLowerCase() === String(ctx.selectedSeriesId).toLowerCase()) || null
  }, [ctx?.selectedSeriesId, seriesGroups])

  const filteredSeries = useMemo(() => {
    const seriesIds = new Set(
      sortedFiltered
        .filter(a => String(a.type).toLowerCase() === "series" && a.seriesId)
        .map(a => String(a.seriesId).toLowerCase())
    );

    return (taxonomy.articleSeries || []).map(s => {
      const seriesArticles = articles.filter(a => String(a.type).toLowerCase() === "series" && String(a.seriesId).toLowerCase() === String(s.id).toLowerCase());
      const sorted = [...seriesArticles].sort((a, b) => (a.part || 0) - (b.part || 0));
      return {
        ...s,
        articles: sorted
      };
    }).filter(s => seriesIds.has(String(s.id).toLowerCase()));
  }, [taxonomy.articleSeries, sortedFiltered, articles]);

  const isDefaultView = !search && cat === "all" && type === "all" && !showAllBrowse
  const recentArticles = sortedFiltered.slice(0, 6)

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>บทความ</h1>
        <p>คลังบทความวิชาการอิสลาม จัดหมวดหมู่และซีรีส์ให้ค้นหาง่าย</p>
        <ContentStatusBanner loading={loading} error={error} isUsingFallback={isUsingFallback} />
      </div>

      {/* ปุ่มลัดเข้าดูคลังส่วนตัว (โชว์เฉพาะคนล็อกอิน) */}
      {isLoggedIn && (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => go("member", { view: "saved-articles" })}
            className="btn btn-outline"
            style={{ padding: "8px 16px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}
          >
            <i className="ti ti-bookmark-filled" style={{ color: "var(--teal)" }}></i>
            เปิดดูบทความที่บันทึกไว้ในคลังส่วนตัว
          </button>
        </div>
      )}

      {selectedSeries ? (
        <div>
          <button
            className="btn btn-outline"
            style={{ marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px" }}
            onClick={() => updateFilters({ selectedSeriesId: "" })}
          >
            <i className="ti ti-arrow-left"></i> กลับหน้ารวมบทความ
          </button>

          <div className="card" style={{ padding: 20, marginBottom: 24, background: "var(--teal-bg)" }}>
            <div style={{ fontSize: 12, color: "var(--teal)", marginBottom: 4, fontWeight: 500 }}>ซีรีส์บทความวิชาการ</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{selectedSeries.name}</h2>
            <p style={{ fontSize: 13, color: "var(--t2)", marginTop: 6, lineHeight: 1.5 }}>
              รวมบทความวิชาการวิเคราะห์เจาะลึก ทั้งหมด {selectedSeries.articles.length} ตอน เรียงตามลำดับเนื้อหาเพื่อความเข้าใจที่ปูพื้นฐานอย่างถูกต้อง
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
            {selectedSeries.articles.map(a => (
              <div key={a.id} className="card" style={{ cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between" }} onClick={() => viewArticle(a)}>
                {a.coverUrl ? (
                  <div style={{ width: "100%", height: 160, overflow: "hidden", borderBottom: ".5px solid var(--br2)" }}>
                    <ImageWithFallback src={a.coverUrl} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ) : (
                  <div style={{ width: "100%", height: 160, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: ".5px solid var(--br2)" }}>
                    <span style={{ fontSize: 40 }}>{a.coverEmoji || "📖"}</span>
                  </div>
                )}
                <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, color: "var(--teal)", fontWeight: 500, background: "var(--teal-bg)", padding: "2px 8px", borderRadius: 4 }}>ตอนที่ {a.part}</span>
                      <span className="tag">{a.category}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.45, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.title}</div>
                    <p style={{ fontSize: 12, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "var(--t2)" }}>{a.excerpt}</p>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300, marginTop: "auto" }}>
                    {a.author} · {a.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="filter-search">
              <i className="ti ti-search"></i>
              <input placeholder="ค้นหาบทความ..." value={search}
                onChange={e => { setSearch(e.target.value); updateFilters({ search: e.target.value, showAllBrowse: e.target.value ? true : showAllBrowse }) }} />
            </div>
            <select className="filter-select" value={type} onChange={e => updateFilters({ type: e.target.value, showAllBrowse: e.target.value !== "all" ? true : showAllBrowse })}>
              {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select className="filter-select" value={sortOrder} onChange={e => updateFilters({ sort: e.target.value })}>
              <option value="newest">ใหม่ไปเก่า</option>
              <option value="oldest">เก่าไปใหม่</option>
            </select>
          </div>

          <div className="filter-pills">
            {categories.map(c => (
              <button key={c.id} onClick={() => updateFilters({ cat: c.id, showAllBrowse: c.id !== "all" ? true : showAllBrowse })}
                className={`filter-pill ${cat === c.id ? 'active' : ''}`}>
                {c.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="card" style={{ padding: 16, height: 280, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div className="skeleton-shimmer" style={{ width: "100%", height: 140, borderRadius: 8 }}></div>
                  <div style={{ flex: 1, marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="skeleton-shimmer" style={{ height: 14, width: "40%", borderRadius: 4 }}></div>
                    <div className="skeleton-shimmer" style={{ height: 18, width: "90%", borderRadius: 4 }}></div>
                    <div className="skeleton-shimmer" style={{ height: 14, width: "70%", borderRadius: 4 }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : isDefaultView ? (
            <div>
              {seriesGroups.length > 0 && (
                <div style={{ marginBottom: 36 }}>
                  <div className="sec-hd"><span className="sec-title">ซีรีส์บทความวิชาการ</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                    {seriesGroups.map(s => (
                      <div key={s.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div
                            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}
                            onClick={() => updateFilters({ selectedSeriesId: s.id })}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <i className="ti ti-list" style={{ color: "var(--teal)", fontSize: 14 }}></i>
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{s.articles.length} ตอน</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {s.articles.slice(0, 3).map(a => (
                              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--bg2)", cursor: "pointer" }} onClick={() => viewArticle(a)}>
                                <span style={{ fontSize: 10, color: "var(--teal)", fontWeight: 500, background: "var(--teal-bg)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>ตอน {a.part}</span>
                                <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => updateFilters({ selectedSeriesId: s.id })}
                          className="btn btn-outline"
                          style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, padding: "6px 0", borderColor: "rgba(15,110,86,0.2)", color: "var(--teal)" }}
                        >
                          ดูทุกตอน ({s.articles.length} ตอน) <i className="ti ti-arrow-right" style={{ fontSize: 11 }}></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="sec-hd"><span className="sec-title">บทความมาใหม่ล่าสุด</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                  {recentArticles.map(a => (
                    <div key={a.id} className="card" style={{ cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={() => viewArticle(a)}>
                      {a.coverUrl ? (
                        <div style={{ width: "100%", height: 160, overflow: "hidden", borderBottom: ".5px solid var(--br2)" }}>
                          <ImageWithFallback src={a.coverUrl} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ) : (
                        <div style={{ width: "100%", height: 160, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: ".5px solid var(--br2)" }}>
                          <span style={{ fontSize: 40 }}>{a.coverEmoji || "📖"}</span>
                        </div>
                      )}
                      <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                            <span className="tag tag-teal">{a.category}</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.45, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.title}</div>
                          <p style={{ fontSize: 12, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "var(--t2)" }}>{a.excerpt}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                          <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{a.author} · {a.date}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {sortedFiltered.length > 6 && (
                  <button className="btn btn-outline" onClick={() => updateFilters({ showAllBrowse: true })} style={{ margin: "28px auto 0", display: "block", fontSize: 12 }}>
                    ดูบทความทั้งหมด ({sortedFiltered.length} บทความ)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="sec-hd" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="sec-title">{sortedFiltered.length} บทความที่พบ</span>
                {!search && cat === "all" && type === "all" && (
                  <button className="sec-link" onClick={() => updateFilters({ showAllBrowse: false })} style={{ fontSize: 12 }}>กลับหน้าสารบัญซีรีส์</button>
                )}
              </div>
              {sortedFiltered.length === 0 ? (
                <div className="empty">ไม่พบบทความที่ตรงกับการค้นหา</div>
              ) : (
                <>
                  {!search ? (
                    <div>
                      {filteredSeries.length > 0 && (
                        <div style={{ marginBottom: 28 }}>
                          <div style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600, marginBottom: 12 }}>ซีรีส์ในหมวดหมู่นี้</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                            {filteredSeries.map(s => (
                              <div key={s.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                <div>
                                  <div
                                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}
                                    onClick={() => updateFilters({ selectedSeriesId: s.id })}
                                  >
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <i className="ti ti-list" style={{ color: "var(--teal)", fontSize: 14 }}></i>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{s.name}</div>
                                      <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{s.articles.length} ตอน</div>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {s.articles.slice(0, 3).map(a => (
                                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--bg2)", cursor: "pointer" }} onClick={() => viewArticle(a)}>
                                        <span style={{ fontSize: 10, color: "var(--teal)", fontWeight: 500, background: "var(--teal-bg)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>ตอน {a.part}</span>
                                        <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <button
                                  onClick={() => updateFilters({ selectedSeriesId: s.id })}
                                  className="btn btn-outline"
                                  style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, padding: "6px 0", borderColor: "rgba(15,110,86,0.2)", color: "var(--teal)" }}
                                >
                                  ดูทุกตอน ({s.articles.length} ตอน) <i className="ti ti-arrow-right" style={{ fontSize: 11 }}></i>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {paginatedGeneral.length > 0 && (
                        <div>
                          <div style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600, marginBottom: 12, marginTop: filteredSeries.length > 0 ? 28 : 0 }}>บทความทั่วไป / บทความเฉพาะเรื่อง</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                            {paginatedGeneral.map(a => (
                              <div key={a.id} className="card" style={{ cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={() => viewArticle(a)}>
                                {a.coverUrl ? (
                                  <div style={{ width: "100%", height: 160, overflow: "hidden", borderBottom: ".5px solid var(--br2)" }}>
                                    <ImageWithFallback src={a.coverUrl} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  </div>
                                ) : (
                                  <div style={{ width: "100%", height: 160, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: ".5px solid var(--br2)" }}>
                                    <span style={{ fontSize: 40 }}>{a.coverEmoji || "📖"}</span>
                                  </div>
                                )}
                                <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                                      <span className="tag tag-teal">{a.category}</span>
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.45, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.title}</div>
                                    <p style={{ fontSize: 12, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "var(--t2)" }}>{a.excerpt}</p>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                                    <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{a.author} · {a.date}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <PaginationBar
                            currentPage={currentPage}
                            totalPages={totalGeneralPages}
                            onPageChange={p => updateFilters({ page: p })}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                        {paginatedFiltered.map(a => (
                          <div key={a.id} className="card" style={{ cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={() => viewArticle(a)}>
                            {a.coverUrl ? (
                              <div style={{ width: "100%", height: 160, overflow: "hidden", borderBottom: ".5px solid var(--br2)" }}>
                                <ImageWithFallback src={a.coverUrl} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                            ) : (
                              <div style={{ width: "100%", height: 160, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: ".5px solid var(--br2)" }}>
                                <span style={{ fontSize: 40 }}>{a.coverEmoji || "📖"}</span>
                              </div>
                            )}
                            <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                                  <span className="tag tag-teal">{a.category}</span>
                                  {a.type === "series" && <span className="tag tag-acc">ซีรีส์ ตอน {a.part}</span>}
                                  {a.type === "specific" && a.seriesName && <span className="tag tag-acc">{a.seriesName}</span>}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.45, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.title}</div>
                                <p style={{ fontSize: 12, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "var(--t2)" }}>{a.excerpt}</p>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                                <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{a.author} · {a.date}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <PaginationBar
                        currentPage={currentPage}
                        totalPages={effectiveTotalPages}
                        onPageChange={p => updateFilters({ page: p })}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
