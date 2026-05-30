import { useState, useEffect } from "react"
import { ARTICLES, DEFAULT_TAXONOMY } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"

const SAVED_ARTICLES_KEY = "talibSavedArticles"

export default function Articles({ go }) {
  const { items: articles, loading } = useContentCollection("articles", ARTICLES)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  
  const [viewMode, setViewMode] = useState("all") // โหมด "ทั้งหมด" หรือ "บันทึกไว้"
  const [cat, setCat] = useState("all")
  const [search, setSearch] = useState("")
  const [type, setType] = useState("all")
  const [showAllBrowse, setShowAllBrowse] = useState(false)
  
  const [savedList, setSavedList] = useState([])

  // ดึงรายการที่บันทึกไว้เมื่อเปิดหน้านี้
  useEffect(() => {
    try { setSavedList(JSON.parse(window.localStorage.getItem(SAVED_ARTICLES_KEY) || "[]")) } 
    catch { setSavedList([]) }
  }, [])

  const types = [{ id: "all", label: "ทั้งหมด" }, ...(taxonomy.articleTypes || [])]
  const categories = [{ id: "all", label: "ทั้งหมด" }, ...(taxonomy.articleCategories || [])]

  // กรองบทความ
  const filtered = articles.filter(a => {
    if (viewMode === "saved" && !savedList.includes(a.id)) return false;
    
    const matchCat = cat === "all" || a.category === cat
    const matchType = type === "all" || a.type === type
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchType && matchSearch
  })

  const seriesGroups = (taxonomy.articleSeries || []).map(s => ({
    ...s, articles: articles.filter(a => a.type === "series" && a.seriesId === s.id && (viewMode === "all" || savedList.includes(a.id)))
  })).filter(s => s.articles.length > 0)

  // เงื่อนไขในการตัดหน้าแสดงผล (ไม่โชว์หมวดหมู่คลีนถ้าย้ายไปแท็บ "บันทึกไว้")
  const isDefaultView = viewMode === "all" && !search && cat === "all" && type === "all" && !showAllBrowse
  const recentArticles = filtered.slice(0, 6)

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>บทความ</h1>
        <p>คลังบทความวิชาการอิสลาม จัดหมวดหมู่และซีรีส์ให้ค้นหาง่าย</p>
        {loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดบทความล่าสุด...</p>}
      </div>

      {/* แถบสลับโหมด "ทั้งหมด" กับ "บทความที่บันทึกไว้" */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: ".5px solid var(--br2)", paddingBottom: 16 }}>
        <button 
          onClick={() => { setViewMode("all"); setShowAllBrowse(false); }} 
          className={`btn ${viewMode === "all" ? "btn-teal" : "btn-outline"}`}
          style={{ padding: "8px 16px", borderRadius: 8 }}
        >
          <i className="ti ti-file-text" style={{ marginRight: 6 }}></i> บทความทั้งหมด
        </button>
        <button 
          onClick={() => { setViewMode("saved"); setShowAllBrowse(true); }} 
          className={`btn ${viewMode === "saved" ? "btn-teal" : "btn-outline"}`}
          style={{ padding: "8px 16px", borderRadius: 8 }}
        >
          <i className={`ti ${viewMode === "saved" ? "ti-bookmark-filled" : "ti-bookmark"}`} style={{ marginRight: 6 }}></i> 
          บทความที่บันทึกไว้ {savedList.length > 0 && `(${savedList.length})`}
        </button>
      </div>

      {/* SEARCH + FILTER */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 14 }}></i>
          <input placeholder="ค้นหาบทความ..." value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setShowAllBrowse(true) }}
            style={{ paddingLeft: 32 }} />
        </div>
        <select value={type} onChange={e => { setType(e.target.value); if (e.target.value !== "all") setShowAllBrowse(true) }} style={{ width: "auto", flex: "0 0 auto" }}>
          {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {/* CATEGORY TABS */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {categories.map(c => (
          <button key={c.id} onClick={() => { setCat(c.id); if (c.id !== "all") setShowAllBrowse(true) }} style={{
            fontFamily: "'Prompt',sans-serif", fontSize: 12, fontWeight: 300,
            padding: "5px 12px", borderRadius: 20, border: ".5px solid var(--br)",
            cursor: "pointer", transition: "all .15s",
            background: cat === c.id ? "var(--teal)" : "var(--card)",
            color: cat === c.id ? "#fff" : "var(--t2)"
          }}>
            {c.label}
          </button>
        ))}
      </div>

      {isDefaultView ? (
        /* โหมดลดความแออัด (UX Clean View): แยกเป็นหมวดหมู่ซีรีส์ และบทความมาใหม่ */
        <div>
          {/* SERIES SECTION */}
          {seriesGroups.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <div className="sec-hd"><span className="sec-title">ซีรีส์บทความวิชาการ</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                {seriesGroups.map(s => (
                  <div key={s.id} className="card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
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
                        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--bg2)", cursor: "pointer" }} onClick={() => go("article", a)}>
                          <span style={{ fontSize: 10, color: "var(--teal)", fontWeight: 500, background: "var(--teal-bg)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>ตอน {a.part}</span>
                          <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RECENT ARTICLES */}
          <div>
            <div className="sec-hd">
              <span className="sec-title">บทความมาใหม่ล่าสุด</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
              {recentArticles.map(a => (
                <div key={a.id} className="card" style={{ cursor: "pointer" }} onClick={() => go("article", a)}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <span className="tag tag-teal">{a.category}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.45, marginBottom: 8 }}>{a.title}</div>
                    <p style={{ fontSize: 12, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.excerpt}</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{a.author} · {a.date}</div>
                      <div style={{ fontSize: 11, color: "var(--teal)", fontWeight: 300 }}><i className="ti ti-clock" style={{ marginRight: 3, fontSize: 11 }}></i>{a.readTime} นาที</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > 6 && (
              <button className="btn btn-outline" onClick={() => setShowAllBrowse(true)} style={{ margin: "28px auto 0", display: "block", fontSize: 12 }}>
                ดูบทความทั้งหมด ({filtered.length} บทความ)
              </button>
            )}
          </div>
        </div>
      ) : (
        /* โหมดผลลัพธ์การค้นหา / หมวดหมู่เฉพาะ / หมวดบันทึกไว้ (Grid View) */
        <div>
          <div className="sec-hd" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="sec-title">{viewMode === "saved" ? `บทความที่บันทึกไว้ (${filtered.length})` : `${filtered.length} บทความที่พบ`}</span>
            {!search && cat === "all" && type === "all" && viewMode !== "saved" && (
              <button className="sec-link" onClick={() => { setShowAllBrowse(false) }} style={{ fontSize: 12 }}>กลับหน้าสารบัญซีรีส์</button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="empty">{viewMode === "saved" ? "คุณยังไม่ได้บันทึกบทความใดๆ ไว้เลย" : "ไม่พบบทความที่ตรงกับการค้นหา"}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
              {filtered.map(a => (
                <div key={a.id} className="card" style={{ cursor: "pointer" }} onClick={() => go("article", a)}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <span className="tag tag-teal">{a.category}</span>
                      {a.type === "series" && <span className="tag tag-acc">ซีรีส์ ตอน {a.part}</span>}
                      {a.type === "specific" && a.seriesName && <span className="tag tag-acc">{a.seriesName}</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.45, marginBottom: 8 }}>{a.title}</div>
                    <p style={{ fontSize: 12, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.excerpt}</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>{a.author} · {a.date}</div>
                      <div style={{ fontSize: 11, color: "var(--teal)", fontWeight: 300 }}>
                         {viewMode === "saved" && <i className="ti ti-bookmark-filled" style={{ marginRight: 6 }}></i>}
                         <i className="ti ti-clock" style={{ marginRight: 3, fontSize: 11 }}></i>{a.readTime} นาที
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}