import { useState, useEffect, useMemo } from "react"
import { ARTICLES, DEFAULT_TAXONOMY } from "../../data/index.js"
import { useContentCollection, useTaxonomySettings, bulkDeleteItems, bulkSaveItems } from "../../lib/contentStore.js"
import { confirmAction, notifyError, notifySuccess } from "../../utils/feedback.jsx"
import ContentStatusBanner from "../../components/ContentStatusBanner.jsx"
import { clampPage } from "../../utils/pagination.js"
import { getDownloadURL, ref, uploadBytes, getStorage } from "firebase/storage"
import { storage, app } from "../../lib/firebase.js"
import { compressImage } from "../../utils/image.js"

const EMPTY = {
  type: "general",
  seriesId: "",
  seriesName: "",
  part: "",
  title: "",
  category: "aqeedah",
  excerpt: "",
  author: "Talib Club",
  date: `${new Date().getFullYear() + 543}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
  tags: [],
  body: "",
  coverUrl: "",
  coverEmoji: "📖",
}

// ตัวช่วยเช็คประเภทให้ยืดหยุ่นขึ้น (รองรับทั้งภาษาไทยและอังกฤษ)
const isSeriesType = (typeVal) => {
  if (!typeVal) return false;
  const str = String(typeVal).toLowerCase();
  return str === "series" || str === "ซีรีส์";
};

export default function AdminArticles() {
  const adminQueryOptions = useMemo(() => ({ live: false }), [])
  const { items, loading, error, saveItem, deleteItem, isUsingFallback } = useContentCollection("articles", ARTICLES, null, adminQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)

  const [editing, setEdit] = useState(null)

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [seriesFilter, setSeriesFilter] = useState("all") // ✅ เพิ่ม State สำหรับกรองซีรีส์
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sortOrder, setSortOrder] = useState("newest")

  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)

  const [bulkType, setBulkType] = useState("")
  const [bulkCategory, setBulkCategory] = useState("")
  const [bulkSeries, setBulkSeries] = useState("")
  const [bulkAuthor, setBulkAuthor] = useState("")
  const [bulkDate, setBulkDate] = useState("")

  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 20

  // รีเซ็ตซีรีส์เป็นทั้งหมด ถ้าเปลี่ยนประเภทเป็นอย่างอื่นที่ไม่ใช่ซีรีส์
  useEffect(() => {
    if (!isSeriesType(typeFilter)) {
      setSeriesFilter("all")
    }
  }, [typeFilter])

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, categoryFilter, seriesFilter, sortOrder])

  const filtered = items.filter(a => {
    const matchSearch = String(a.title || "").toLowerCase().includes(search.toLowerCase()) ||
      String(a.author || "").toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === "all" ||
      (isSeriesType(typeFilter) ? isSeriesType(a.type) : String(a.type) === typeFilter)
    const matchCat = categoryFilter === "all" || a.category === categoryFilter
    const matchSeries = seriesFilter === "all" || a.seriesId === seriesFilter // ✅ กรองด้วย seriesId

    return matchSearch && matchType && matchCat && matchSeries
  })

  // เรียงข้อมูลจากใหม่ไปเก่า (เรียงตามวันที่ หรือ ID ถ้าวันที่เหมือนกัน)
  const sorted = [...filtered].sort((a, b) => {
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE) || 1)
  const safePage = clampPage(page, totalPages)
  const currentItems = sorted.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleAll = () => {
    if (selected.length === sorted.length) setSelected([])
    else setSelected(sorted.map(a => a.id))
  }

  function openNew() {
    setEdit({ ...EMPTY, id: crypto.randomUUID() })
  }

  function openEdit(article) {
    setEdit({ ...article, tags: [...(article.tags || [])] })
  }

  async function save() {
    if (!editing.title?.trim()) return notifyError("กรุณาใส่ชื่อบทความ")
    if (isSeriesType(editing.type) && (!editing.seriesId?.trim() || !editing.part)) {
      return notifyError("บทความซีรีส์ต้องระบุรหัสซีรีส์และหมายเลขตอน")
    }

    // เช็คประเภทซีรีส์ให้ยืดหยุ่นขึ้น
    const payload = { ...editing, part: isSeriesType(editing.type) && editing.part ? Number(editing.part) : null }
    delete payload.readTime;

    setBusy(true)
    try {
      await saveItem(payload)
      setEdit(null)
      notifySuccess("บันทึกบทความขึ้นเว็บไซต์เรียบร้อยแล้ว")
    } catch (err) {
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function remove(article) {
    if (busy) return
    const ok = await confirmAction({ title: "ลบบทความนี้?", message: `บทความ "${article.title}" จะถูกซ่อนจากหน้าเว็บไซต์`, confirmText: "ลบบทความ", danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await deleteItem(article.id)
      setSelected(prev => prev.filter(id => id !== article.id))
      notifySuccess("ลบบทความเรียบร้อยแล้ว")
    } catch (err) {
      notifyError("ลบไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function removeSelected() {
    const ok = await confirmAction({ title: `ยืนยันการลบ ${selected.length} รายการ?`, message: "ข้อมูลที่ถูกเลือกรวมถึงเนื้อหาทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้", confirmText: "ยืนยันการลบ", danger: true })
    if (!ok) return
    setBusy(true)
    const toDelete = [...selected]
    try {
      const { deleted, failed } = await bulkDeleteItems("articles", toDelete)
      setSelected([])
      if (failed === 0) {
        notifySuccess(`ลบ ${deleted} บทความเรียบร้อยแล้ว`)
      } else {
        notifyError(`ลบสำเร็จ ${deleted} รายการ แต่ล้มเหลว ${failed} รายการ — กรุณาตรวจสิทธิ์ Firestore`)
      }
    } catch (err) {
      notifyError("เกิดข้อผิดพลาดในการลบข้อมูล")
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkUpdate() {
    if (selected.length === 0) return
    const ok = await confirmAction({
      title: `ยืนยันการแก้ไข ${selected.length} รายการ?`,
      message: "ฟิลด์ที่กรอก/เลือกไว้จะถูกอัปเดตทดแทนค่าเดิมในบทความทั้งหมดที่เลือก",
      confirmText: "ยืนยันการอัปเดต",
      confirmColor: "var(--teal)"
    })
    if (!ok) return

    setBusy(true)
    try {
      const updatedItems = selected.map(id => {
        const original = items.find(a => String(a.id) === String(id))
        if (!original) return null
        const next = { ...original }
        if (bulkType) {
          next.type = bulkType
          if (isSeriesType(bulkType)) {
            next.seriesId = bulkSeries || original.seriesId || ""
          } else {
            next.seriesId = ""
            next.part = null
          }
        }
        if (bulkCategory) next.category = bulkCategory
        if (bulkAuthor !== undefined && bulkAuthor !== "") next.author = bulkAuthor
        if (bulkDate) next.date = bulkDate
        delete next.readTime
        return next
      }).filter(Boolean)

      const { saved, failed } = await bulkSaveItems("articles", updatedItems)
      setBulkType("")
      setBulkCategory("")
      setBulkSeries("")
      setBulkAuthor("")
      setBulkDate("")
      setSelected([])
      if (failed === 0) {
        notifySuccess(`อัปเดตข้อมูลบทความ ${saved} รายการเรียบร้อยแล้ว`)
      } else {
        notifyError(`อัปเดตสำเร็จ ${saved} รายการ แต่ล้มเหลว ${failed} รายการ`)
      }
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการอัปเดตข้อมูล")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return <ArticleForm item={editing} setItem={setEdit} onSave={save} onCancel={() => setEdit(null)} taxonomy={taxonomy} busy={busy} />
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ minWidth: 150 }}>บทความ <span style={{ fontSize: 12, color: "var(--t3)" }}>({sorted.length} รายการ)</span></h2>
          <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>
            บทความวิชาการอิสลามทั้งหมดของ Talib Club {totalPages > 0 && `(หน้า ${safePage}/${totalPages})`}
          </p>
          <ContentStatusBanner loading={loading} error={error} isUsingFallback={isUsingFallback} />
        </div>
        <button className="btn btn-teal" onClick={openNew} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
          <i className="ti ti-plus" style={{ marginRight: 6 }}></i>เพิ่มใหม่
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: showAdvanced ? 12 : 24 }}>
        <div style={{ flex: "1 1 250px", position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 16 }}></i>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อบทความ, ผู้เขียน..."
            style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "10px 16px 10px 42px", background: "var(--bg2)", border: "none" }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setTypeFilter("all")} className={`pill ${typeFilter === "all" ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>ทั้งหมด</button>
          {(taxonomy.articleTypes || []).map(type => (
            <button key={type.id} onClick={() => setTypeFilter(type.id)} className={`pill ${typeFilter === type.id ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>
              {type.label}
            </button>
          ))}
        </div>

        {/* ✅ กล่องตัวกรองซีรีส์ (แสดงเมื่อเลือกประเภทซีรีส์) */}
        {isSeriesType(typeFilter) && (
          <select 
            value={seriesFilter} 
            onChange={e => setSeriesFilter(e.target.value)} 
            style={{ 
              background: "var(--bg2)", 
              border: "1px solid var(--br)", 
              borderRadius: 24, 
              padding: "8px 16px", 
              fontSize: 13, 
              color: "var(--text)",
              height: 38,
              cursor: "pointer"
            }}
          >
            <option value="all">-- ทุกซีรีส์ --</option>
            {(taxonomy.articleSeries || []).map(series => (
              <option key={series.id} value={series.id}>{series.name}</option>
            ))}
          </select>
        )}

        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ width: "auto", height: 38, borderRadius: 24, padding: "0 16px", background: "var(--bg2)", border: "none", color: "var(--text)" }}>
          <option value="newest">ใหม่ไปเก่า</option>
          <option value="oldest">เก่าไปใหม่</option>
        </select>

        <button
          className={`btn ${showAdvanced ? "btn-teal" : "btn-outline"}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ padding: "8px 16px", borderRadius: 24 }}
        >
          <i className="ti ti-filter" style={{ marginRight: 6 }}></i>ตัวกรองเพิ่มเติม
        </button>
      </div>

      {showAdvanced && (
        <div style={{ background: "var(--bg2)", padding: "16px 20px", borderRadius: 16, marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>หมวดหมู่บทความ</span>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ background: "var(--card)", border: "none" }}>
              <option value="all">-- ทุกหมวดหมู่ --</option>
              {(taxonomy.articleCategories || []).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selected.length > 0 && (
        <div className="card" style={{ border: "1.5px solid var(--teal)", padding: 20, borderRadius: 16, marginBottom: 20, background: "var(--teal-bg)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: "var(--teal)", fontWeight: 600 }}>
              <i className="ti ti-checkbox" style={{ marginRight: 6 }}></i>
              เลือกอยู่ {selected.length} รายการ
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setSelected([])} style={{ fontSize: 12, padding: "6px 12px" }}>
                ยกเลิกการเลือก
              </button>
              <button className="btn" style={{ background: "#e05555", color: "#fff", padding: "6px 12px", fontSize: 12 }} onClick={removeSelected} disabled={busy}>
                <i className={busy ? "ti ti-loader-2 spin" : "ti ti-trash"} style={{ marginRight: 6 }}></i>
                {busy ? "กำลังลบ..." : "ลบที่เลือก"}
              </button>
            </div>
          </div>

          <div className="divider" style={{ margin: "0 0 16px" }} />

          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
            <i className="ti ti-edit" style={{ marginRight: 6, color: "var(--teal)" }}></i>
            แก้ไขข้อมูลพร้อมกันทั้งหมด (Bulk Edit)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนประเภท</span>
              <select value={bulkType} onChange={e => {
                setBulkType(e.target.value);
                if (!isSeriesType(e.target.value)) setBulkSeries("");
              }} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                {(taxonomy.articleTypes || []).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนหมวดหมู่</span>
              <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                {(taxonomy.articleCategories || []).map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
              </select>
            </label>

            {isSeriesType(bulkType) && (
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>ย้ายเข้าซีรีส์</span>
                <select value={bulkSeries} onChange={e => setBulkSeries(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                  <option value="">-- เลือกซีรีส์ --</option>
                  {(taxonomy.articleSeries || []).map(series => <option key={series.id} value={series.id}>{series.name}</option>)}
                </select>
              </label>
            )}

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนชื่อผู้เขียน</span>
              <input value={bulkAuthor} onChange={e => setBulkAuthor(e.target.value)} placeholder="เช่น Talib Club" style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนวันที่</span>
              <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <button
              className="btn btn-teal"
              onClick={handleBulkUpdate}
              disabled={busy || (!bulkType && !bulkCategory && !bulkAuthor && !bulkDate)}
              style={{ padding: "8px 16px", fontSize: 12, height: "34px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <i className={busy ? "ti ti-loader-2 spin" : "ti ti-device-floppy"}></i>
              {busy ? "กำลังอัปเดต..." : "อัปเดตข้อมูลที่เลือก"}
            </button>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 12, color: "var(--t2)" }}>
            <input type="checkbox" checked={selected.length === sorted.length && sorted.length > 0} onChange={toggleAll} disabled={busy} style={{ width: 16, height: 16, cursor: busy ? "not-allowed" : "pointer" }} />
            เลือกทั้งหมด {sorted.length} รายการที่ค้นเจอ
          </label>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {currentItems.map(article => {
          // หากเป็นบทความซีรีส์ ให้ดึงชื่อซีรีส์มาแสดง
          const seriesInfo = isSeriesType(article.type) && taxonomy.articleSeries?.find(s => s.id === article.seriesId);

          return (
            <div key={article.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: busy ? 0.6 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={selected.includes(article.id)} onChange={() => toggleSelect(article.id)} disabled={busy} style={{ width: 18, height: 18, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="tag tag-teal">{article.category}</span>
                    {/* เช็คประเภทซีรีส์ให้ยืดหยุ่นขึ้น และแสดงชื่อซีรีส์ถ้ามี */}
                    {isSeriesType(article.type) && (
                      <span className="tag" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {seriesInfo?.name || "ซีรีส์"}
                        {article.part && <span style={{ opacity: 0.8 }}>ตอนที่ {article.part}</span>}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{article.title}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300, marginTop: 4 }}>{article.author} · {article.date}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="btn btn-outline" onClick={() => openEdit(article)} disabled={busy} style={{ padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}><i className="ti ti-pencil"></i></button>
                <button className="btn btn-outline" style={{ color: "#e05555", borderColor: "rgba(224,85,85,.3)", padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => remove(article)} disabled={busy}><i className="ti ti-trash"></i></button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <div className="empty">ไม่พบบทความที่ตรงกับเงื่อนไข</div>}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 32, flexWrap: "wrap" }}>
          <button className="btn btn-outline" disabled={page === 1} onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }} style={{ padding: "6px 12px", fontSize: 12 }}>ก่อนหน้า</button>
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
              return <button key={p} onClick={() => { setPage(p); window.scrollTo(0, 0); }} className={page === p ? "btn btn-teal" : "btn btn-outline"} style={{ padding: "6px 14px", fontSize: 12 }}>{p}</button>
            }
            if (p === page - 2 || p === page + 2) return <span key={p} style={{ color: "var(--t3)", padding: "0 4px" }}>...</span>
            return null;
          })}
          <button className="btn btn-outline" disabled={page === totalPages} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }} style={{ padding: "6px 12px", fontSize: 12 }}>ถัดไป</button>
        </div>
      )}
    </div>
  )
}

function ArticleForm({ item, setItem, onSave, onCancel, taxonomy, busy }) {
  const set = (key, value) => setItem(prev => ({ ...prev, [key]: value }))
  const [uploadingImage, setUploadingImage] = useState(false)

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    console.log("Starting Article Image Upload: v4 Diagnostic Logger active.");
    console.log("Original File Name:", file.name, "Size:", file.size, "Type:", file.type);
    
    setUploadingImage(true)
    try {
      console.log("Compressing image...");
      const compressedFile = await compressImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.75 })
      console.log("Image compression complete. Output Name:", compressedFile.name, "Size:", compressedFile.size);
      
      const safeName = compressedFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")
      const usedStorage = storage || getStorage(app)
      let storageRef = null
      try {
        storageRef = ref(usedStorage, `article_covers/${Date.now()}_${safeName}`)
        console.log("Uploading bytes to Firebase Storage reference:", storageRef.fullPath);
        await uploadBytes(storageRef, compressedFile)
      } catch (uploadErr) {
        console.error("Upload error (storageRef):", uploadErr?.code || "-", uploadErr?.message || uploadErr, "ref:", storageRef?.fullPath)
        throw uploadErr
      }

      console.log("Firebase upload completed. Retrieving download URL...");
      const url = await getDownloadURL(storageRef)
      console.log("Success! Cover URL obtained:", url);
      set("coverUrl", url)
      notifySuccess("อัปโหลดรูปภาพปกเรียบร้อยแล้ว")
    } catch (err) {
      console.error("Diagnostic error caught inside handleUploadImage:", err?.code || "-", err?.message || err)
      notifyError("อัปโหลดรูปภาพล้มเหลว")
    } finally {
      console.log("Finally block executed. Setting uploadingImage back to false.");
      setUploadingImage(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <button className="btn btn-outline" style={{ marginBottom: 18 }} onClick={onCancel}><i className="ti ti-arrow-left" style={{ marginRight: 6 }}></i>กลับ</button>
      <h2 style={{ marginBottom: 20 }}>{item.id ? "แก้ไขบทความ" : "เพิ่มบทความใหม่"}</h2>

      <div className="card" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ชื่อบทความ *" span><input value={item.title || ""} onChange={e => set("title", e.target.value)} placeholder="ชื่อบทความ" /></Field>
        <Field label="ประเภท">
          <select value={item.type || "general"} onChange={e => set("type", e.target.value)}>
            {(taxonomy.articleTypes || []).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </Field>
        <Field label="หมวดหมู่">
          <select value={item.category || ""} onChange={e => set("category", e.target.value)}>
            {(taxonomy.articleCategories || []).map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </Field>

        {/* เช็คประเภทซีรีส์ให้ยืดหยุ่นขึ้น */}
        {isSeriesType(item.type) && (
          <>
            <Field label="ซีรีส์">
              <select value={item.seriesId || ""} onChange={e => set("seriesId", e.target.value)}>
                <option value="">เลือกซีรีส์</option>
                {(taxonomy.articleSeries || []).map(series => <option key={series.id} value={series.id}>{series.name}</option>)}
              </select>
            </Field>
            <Field label="ตอนที่"><input type="number" value={item.part || ""} onChange={e => set("part", e.target.value)} min="1" /></Field>
          </>
        )}

        {item.type === "specific" && <Field label="ชื่อหัวข้อย่อย" span><input value={item.seriesName || ""} onChange={e => set("seriesName", e.target.value)} /></Field>}
        <Field label="ผู้เขียน"><input value={item.author || ""} onChange={e => set("author", e.target.value)} /></Field>
        <Field label="วันที่เผยแพร่"><input type="date" value={item.date || ""} onChange={e => set("date", e.target.value)} /></Field>

        <Field label="รูปภาพปกบทความ (URL)" span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={item.coverUrl || ""}
              onChange={e => set("coverUrl", e.target.value)}
              placeholder="https://example.com/image.jpg หรืออัปโหลดไฟล์..."
              style={{ flex: 1 }}
            />
            <label className="btn btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, padding: "10px 16px" }}>
              <i className={uploadingImage ? "ti ti-loader-2 spin" : "ti ti-upload"}></i>
              {uploadingImage ? "กำลังอัปโหลด..." : "อัปโหลดรูปภาพ"}
              <input type="file" accept="image/*" onChange={handleUploadImage} disabled={uploadingImage} style={{ display: "none" }} />
            </label>
          </div>
          {item.coverUrl && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative", width: 120, height: 75, borderRadius: 8, overflow: "hidden", border: "1px solid var(--br2)", flexShrink: 0 }}>
                <img src={item.coverUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  type="button"
                  onClick={() => set("coverUrl", "")}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 10
                  }}
                >
                  ✕
                </button>
              </div>
              <span style={{ fontSize: 12, color: "var(--t3)" }}>ตัวอย่างรูปภาพปก</span>
            </div>
          )}
        </Field>

        <Field label="อิโมจิประดับการ์ด (coverEmoji - แสดงผลเมื่อไม่มีรูปภาพปก)">
          <input
            value={item.coverEmoji || ""}
            onChange={e => set("coverEmoji", e.target.value)}
            placeholder="📖"
            maxLength={4}
          />
        </Field>

        <div />

        <Field label="บทคัดย่อ (แสดงหน้าการ์ด)" span><textarea value={item.excerpt || ""} onChange={e => set("excerpt", e.target.value)} rows={2} placeholder="เนื้อหาสรุปสั้นๆ..." /></Field>
        <Field label="Tags (คั่นด้วยลูกน้ำ ,)" span><input value={(item.tags || []).join(", ")} onChange={e => set("tags", e.target.value.split(",").map(tag => tag.trim()).filter(Boolean))} placeholder="เช่น ฟิกฮ์, อะกีดะฮ์" /></Field>
        <Field label="เนื้อหาบทความแบบเต็ม" span><textarea value={item.body || ""} onChange={e => set("body", e.target.value)} rows={12} placeholder="พิมพ์เนื้อหาที่นี่..." style={{ lineHeight: 1.6 }} /></Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="btn btn-outline" onClick={onCancel}>ยกเลิก</button>
        <button className="btn btn-teal" onClick={onSave} disabled={busy}>
          <i className={`ti ${busy ? "ti-loader-2 spin" : "ti-check"}`} style={{ marginRight: 6 }}></i>{busy ? "กำลังบันทึก..." : "บันทึกบทความ"}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children, span }) {
  return (
    <label style={span ? { gridColumn: "1 / -1" } : undefined}>
      <span style={{ display: "block", fontSize: 13, color: "var(--t2)", marginBottom: 8, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  )
}
