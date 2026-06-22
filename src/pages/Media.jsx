import { useState, useMemo, useEffect } from "react"
import { MEDIA, DEFAULT_TAXONOMY, SITE } from "../data/index.js"
import { useContentCollection, useTaxonomySettings, useSiteSettings } from "../lib/contentStore.js"
import { clampPage } from "../utils/pagination.js"
import PaginationBar from "../components/PaginationBar.jsx"
import ContentStatusBanner from "../components/ContentStatusBanner.jsx"
import ImageWithFallback from "../components/ImageWithFallback.jsx"

export default function Media({ go, ctx }) {
  const mediaQueryOptions = useMemo(() => ({ live: false, limit: 200 }), [])
  const { items: media, loading, error, isUsingFallback } = useContentCollection("media", MEDIA, null, mediaQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  const { site } = useSiteSettings(SITE)

  const filter = ctx?.filter || "all"
  const sortOrder = ctx?.sort || "newest"
  const page = parseInt(ctx?.page, 10) || 1

  const [searchPlaylist, setSearchPlaylist] = useState(() => ctx?.searchPlaylist || "")
  const [searchClip, setSearchClip] = useState(() => ctx?.searchClip || "")

  useEffect(() => {
    setSearchPlaylist(ctx?.searchPlaylist || "")
  }, [ctx?.searchPlaylist])

  useEffect(() => {
    setSearchClip(ctx?.searchClip || "")
  }, [ctx?.searchClip])

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
  const playlists = useMemo(() => {
    const list = []
    media.forEach(item => {
      const playlistName = item.series || "วิดีโอทั่วไป"
      const teacherName = item.channel || "Talib Club"
      let pl = list.find(p => p.name === playlistName && p.teacher === teacherName)
      if (!pl) {
        pl = {
          name: playlistName,
          teacher: teacherName,
          type: String(item.type || "").toLowerCase(),
          items: []
        }
        list.push(pl)
      }
      pl.items.push(item)
    })
    return list
  }, [media])

  const selectedPlaylist = useMemo(() => {
    if (!ctx?.playlist) return null
    return playlists.find(p =>
      String(p.name).toLowerCase() === String(ctx.playlist).toLowerCase() &&
      (!ctx.teacher || String(p.teacher).toLowerCase() === String(ctx.teacher).toLowerCase())
    ) || null
  }, [ctx?.playlist, ctx?.teacher, playlists])

  const updateFilters = (newParams) => {
    const updated = {
      filter,
      searchPlaylist,
      playlist: ctx?.playlist || "",
      teacher: ctx?.teacher || "",
      searchClip,
      sort: sortOrder,
      page,
      ...newParams
    }
    if (newParams.filter !== undefined || newParams.searchPlaylist !== undefined || newParams.playlist !== undefined || newParams.sort !== undefined) {
      updated.page = 1
      updated.searchClip = ""
    } else if (newParams.searchClip !== undefined) {
      updated.page = 1
    }
    go("media", updated, { replace: true, noScroll: true })
  }

  // 2. กรองเพลย์ลิสต์หน้าแรก (ค้นหา + ประเภท)
  const filteredPlaylists = useMemo(() => {
    return playlists.filter(pl => {
      const matchType = filter === "all" || String(pl.type).toLowerCase() === String(filter).toLowerCase();
      const matchSearch = String(pl.name).toLowerCase().includes(searchPlaylist.toLowerCase()) ||
        String(pl.teacher).toLowerCase().includes(searchPlaylist.toLowerCase());
      return matchType && matchSearch;
    })
  }, [playlists, filter, searchPlaylist])

  // จัดเรียงเพลย์ลิสต์หน้าแรกตามวันล่าสุด/เก่าสุดของคลิปที่อยู่ในเพลย์ลิสต์
  const sortedPlaylists = useMemo(() => {
    return [...filteredPlaylists].sort((a, b) => {
      const datesA = a.items.map(item => item.date || "").filter(Boolean)
      const datesB = b.items.map(item => item.date || "").filter(Boolean)

      const maxDateA = datesA.length > 0 ? (sortOrder === "newest" ? datesA.reduce((x, y) => x > y ? x : y) : datesA.reduce((x, y) => x < y ? x : y)) : ""
      const maxDateB = datesB.length > 0 ? (sortOrder === "newest" ? datesB.reduce((x, y) => x > y ? x : y) : datesB.reduce((x, y) => x < y ? x : y)) : ""

      if (sortOrder === "newest") {
        if (maxDateA !== maxDateB) return maxDateB.localeCompare(maxDateA)
        return String(b.name).localeCompare(String(a.name))
      } else {
        if (maxDateA !== maxDateB) return maxDateA.localeCompare(maxDateB)
        return String(a.name).localeCompare(String(b.name))
      }
    })
  }, [filteredPlaylists, sortOrder])

  // 3. กรองคลิปเมื่ออยู่ด้านใน Playlist (ค้นหาชื่อคลิป)
  const filteredClips = useMemo(() => {
    if (!selectedPlaylist) return []
    const items = [...selectedPlaylist.items]

    const matched = !searchClip.trim() ? items : items.filter(item =>
      String(item.title).toLowerCase().includes(searchClip.toLowerCase()) ||
      String(item.channel).toLowerCase().includes(searchClip.toLowerCase())
    )

    return matched.sort((a, b) => {
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
  }, [selectedPlaylist, searchClip, sortOrder])

  const totalPages = Math.max(1, Math.ceil(filteredClips.length / ITEMS_PER_PAGE) || 1)
  const currentPage = clampPage(page, totalPages)

  useEffect(() => {
    if (page !== currentPage) updateFilters({ page: currentPage })
  }, [currentPage, page, totalPages])

  const currentItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredClips.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredClips, currentPage])

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>มีเดีย</h1>
        <p>วิดีโอ YouTube และพอดแคสต์ Spotify จาก Talib Club</p>
        <ContentStatusBanner loading={loading} error={error} isUsingFallback={isUsingFallback} />
      </div>

      {!selectedPlaylist ? (
        <>
          {/* แถบค้นหา และ กรองเพลย์ลิสต์ */}
          <div className="filter-bar">
            <div className="filter-search">
              <i className="ti ti-search"></i>
              <input
                value={searchPlaylist}
                onChange={e => { setSearchPlaylist(e.target.value); updateFilters({ searchPlaylist: e.target.value }) }}
                placeholder="ค้นหาเพลย์ลิสต์ หรือ ชื่อช่อง..."
              />
            </div>
            <select className="filter-select" value={sortOrder} onChange={e => updateFilters({ sort: e.target.value })}>
              <option value="newest">ใหม่ไปเก่า</option>
              <option value="oldest">เก่าไปใหม่</option>
            </select>
          </div>

          <div className="filter-pills">
            {filters.map(item => (
              <button
                key={item.id}
                className={`filter-pill ${filter === item.id ? 'active' : ''}`}
                onClick={() => updateFilters({ filter: item.id })}
              >
                <i className={`ti ${item.icon}`} style={{ marginRight: 6 }}></i>{item.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 14 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="card" style={{ padding: 16, height: 260, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="skeleton-shimmer" style={{ width: "100%", height: 130, borderRadius: 8 }}></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="skeleton-shimmer" style={{ height: 14, width: "40%", borderRadius: 4 }}></div>
                    <div className="skeleton-shimmer" style={{ height: 16, width: "90%", borderRadius: 4 }}></div>
                    <div className="skeleton-shimmer" style={{ height: 12, width: "60%", borderRadius: 4 }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : sortedPlaylists.length === 0 ? (
            <div className="empty">ไม่พบเพลย์ลิสต์ที่ตรงกับการค้นหา</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 14 }}>
              {sortedPlaylists.map((pl, idx) => (
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
                      onClick={() => updateFilters({ playlist: pl.name, teacher: pl.teacher, page: 1, searchClip: "" })}
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
          <button className="btn btn-outline" style={{ marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px" }} onClick={() => updateFilters({ playlist: "", teacher: "", page: 1, searchClip: "" })}>
            <i className="ti ti-arrow-left"></i> กลับหน้ารวมมีเดีย
          </button>

          <div className="card" style={{ padding: 18, marginBottom: 24, background: "var(--acc2)" }}>
            <div style={{ fontSize: 12, color: "var(--teal)", marginBottom: 4, fontWeight: 500 }}>จากช่อง: {selectedPlaylist.teacher}</div>
            <h2 style={{ fontSize: 18, fontWeight: 500 }}>{selectedPlaylist.name}</h2>
            <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 4 }}>
              รวมเนื้อหาทั้งหมด {filteredClips.length} คลิป {totalPages > 1 && `(หน้า ${currentPage}/${totalPages})`}
            </p>
          </div>

          {/* แถบค้นหาคลิปภายในเพลย์ลิสต์ */}
          <div className="filter-bar">
            <div className="filter-search" style={{ maxWidth: 400 }}>
              <i className="ti ti-search"></i>
              <input
                value={searchClip}
                onChange={e => { setSearchClip(e.target.value); updateFilters({ searchClip: e.target.value }) }}
                placeholder={`ค้นหาคลิปใน ${selectedPlaylist.name}...`}
              />
            </div>
            <select className="filter-select" value={sortOrder} onChange={e => updateFilters({ sort: e.target.value })}>
              <option value="newest">ใหม่ไปเก่า</option>
              <option value="oldest">เก่าไปใหม่</option>
            </select>
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="card" style={{ padding: 16, height: 220, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="skeleton-shimmer" style={{ width: "100%", height: 120, borderRadius: 8 }}></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="skeleton-shimmer" style={{ height: 14, width: "90%", borderRadius: 4 }}></div>
                    <div className="skeleton-shimmer" style={{ height: 12, width: "50%", borderRadius: 4 }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredClips.length === 0 ? (
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
                    onClick={() => go?.("media-detail", {
                      ...item,
                      playlist: ctx?.playlist || "",
                      teacher: ctx?.teacher || "",
                      filter: ctx?.filter,
                      page: currentPage,
                    })}
                  >
                    <div style={{ height: 150, background: "var(--acc2)", position: "relative" }}>
                      {thumbUrl ? (
                        <ImageWithFallback src={thumbUrl} alt={item.title} fallbackEmoji="🎬" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
          <PaginationBar currentPage={currentPage} totalPages={totalPages} onPageChange={p => updateFilters({ page: p })} />
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
        Quran, Sunnah <span style={{ fontWeight: 300, fontSize: "13px" }}>and the understanding of Salaf</span>
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
