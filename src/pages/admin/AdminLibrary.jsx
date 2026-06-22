import { useState, useEffect, useMemo } from "react"
import { BOOKS, DEFAULT_TAXONOMY } from "../../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../../lib/contentStore.js"
import { confirmAction, notifyError, notifySuccess } from "../../utils/feedback.jsx"
import { getDownloadURL, ref, uploadBytes, getStorage } from "firebase/storage"
import { storage, app } from "../../lib/firebase.js"
import { compressImage } from "../../utils/image.js"
import ContentStatusBanner from "../../components/ContentStatusBanner.jsx"
import { clampPage } from "../../utils/pagination.js"

const EMPTY = {
  title: "",
  author: "Talib Club",
  source: "Talib Club",
  type: "วารสาร",
  category: "aqeedah",
  year: new Date().getFullYear() + 543,
  fileUrl: "",
  coverUrl: "",
  desc: "",
  issueNumber: "",
}

export default function AdminLibrary() {
  const adminQueryOptions = useMemo(() => ({ live: false }), [])
  const { items, loading, error, saveItem, deleteItem, isUsingFallback } = useContentCollection("books", BOOKS, null, adminQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  
  const [editing, setEdit] = useState(null)
  
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all") 
  const [categoryFilter, setCategoryFilter] = useState("all") 
  const [sourceFilter, setSourceFilter] = useState("all") 
  const [showAdvanced, setShowAdvanced] = useState(false) 
  const [sortOrder, setSortOrder] = useState("newest")

  const [selected, setSelected] = useState([]) 
  const [busy, setBusy] = useState(false)

  const [bulkSource, setBulkSource] = useState("")
  const [bulkType, setBulkType] = useState("")
  const [bulkCategory, setBulkCategory] = useState("")
  const [bulkAuthor, setBulkAuthor] = useState("")
  const [bulkYear, setBulkYear] = useState("")

  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 20

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, categoryFilter, sourceFilter, sortOrder])

  const filtered = items.filter(b => {
    const matchSearch = String(b.title || "").toLowerCase().includes(search.toLowerCase()) || 
                        String(b.author || "").toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === "all" || b.type === typeFilter
    const matchCat = categoryFilter === "all" || b.category === categoryFilter
    const matchSource = sourceFilter === "all" || b.source === sourceFilter
    
    return matchSearch && matchType && matchCat && matchSource
  })

  const sorted = [...filtered].sort((a, b) => {
    const normalizeYear = (yr) => {
      let y = Number(yr) || 0
      if (y > 2400) y -= 543
      return y
    }
    const yearA = normalizeYear(a.year)
    const yearB = normalizeYear(b.year)
    if (sortOrder === "newest") {
      if (yearA !== yearB) return yearB - yearA
      const getMs = (val) => {
        if (!val) return 0
        if (typeof val.toDate === "function") return val.toDate().getTime()
        if (val.seconds) return val.seconds * 1000
        if (typeof val === "number") return val
        const parsed = Date.parse(val)
        return isNaN(parsed) ? 0 : parsed
      }
      const timeA = getMs(a.createdAt) || getMs(a.updatedAt)
      const timeB = getMs(b.createdAt) || getMs(b.updatedAt)
      if (timeA !== timeB) return timeB - timeA
      return String(b.id || "").localeCompare(String(a.id || ""))
    } else {
      if (yearA !== yearB) return yearA - yearB
      const getMs = (val) => {
        if (!val) return 0
        if (typeof val.toDate === "function") return val.toDate().getTime()
        if (val.seconds) return val.seconds * 1000
        if (typeof val === "number") return val
        const parsed = Date.parse(val)
        return isNaN(parsed) ? 0 : parsed
      }
      const timeA = getMs(a.createdAt) || getMs(a.updatedAt)
      const timeB = getMs(b.createdAt) || getMs(b.updatedAt)
      if (timeA !== timeB) return timeA - timeB
      return String(a.id || "").localeCompare(String(a.id || ""))
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
    else setSelected(sorted.map(b => b.id))
  }

  function openNew() {
    const defaultType = taxonomy.bookTypes?.[0] || "วารสาร"
    const defaultSource = taxonomy.bookSources?.[0] || "Talib Club"
    setEdit({ ...EMPTY, type: defaultType, source: defaultSource, id: crypto.randomUUID() })
  }

  // --- ฟังก์ชันที่หายไป เติมกลับมาให้แล้วครับ ---
  function openEdit(book) {
    setEdit({ ...book })
  }

  async function save() {
    if (!editing.title?.trim()) return notifyError("กรุณาใส่ชื่อหนังสือ")
    const payload = { ...editing, year: Number(editing.year || (new Date().getFullYear() + 543)) }
    setBusy(true)
    try {
      await saveItem(payload)
      setEdit(null)
      notifySuccess("บันทึกข้อมูลขึ้นเว็บไซต์เรียบร้อยแล้ว")
    } catch (err) {
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function remove(book) {
    if (busy) return
    const ok = await confirmAction({ title: "ลบรายการนี้?", message: `"${book.title}" จะถูกลบจากหน้าเว็บไซต์`, confirmText: "ลบ", danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await deleteItem(book.id)
      setSelected(prev => prev.filter(id => id !== book.id))
      notifySuccess("ลบเรียบร้อยแล้ว")
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
    try {
      await Promise.all(selected.map(id => deleteItem(id)))
      setSelected([])
      notifySuccess(`ลบ ${selected.length} รายการเรียบร้อยแล้ว`)
    } catch (err) {
      notifyError("เกิดข้อผิดพลาดในการลบข้อมูลบางส่วน")
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkUpdate() {
    if (selected.length === 0) return
    const ok = await confirmAction({ 
      title: `ยืนยันการแก้ไข ${selected.length} รายการ?`, 
      message: "ฟิลด์ที่กรอก/เลือกไว้จะถูกอัปเดตทดแทนค่าเดิมในหนังสือทั้งหมดที่เลือก", 
      confirmText: "ยืนยันการอัปเดต", 
      confirmColor: "var(--teal)" 
    })
    if (!ok) return
    
    setBusy(true)
    try {
      let updatedCount = 0;
      await Promise.all(selected.map(async (id) => {
        const original = items.find(b => String(b.id) === String(id))
        if (!original) return
        
        const next = { ...original }
        if (bulkSource) {
          next.source = bulkSource
        }
        if (bulkType) {
          next.type = bulkType
        }
        if (bulkCategory) {
          next.category = bulkCategory
        }
        if (bulkAuthor !== undefined && bulkAuthor !== "") {
          next.author = bulkAuthor
        }
        if (bulkYear) {
          next.year = Number(bulkYear)
        }
        
        await saveItem(next)
        updatedCount++
      }))
      
      setBulkSource("")
      setBulkType("")
      setBulkCategory("")
      setBulkAuthor("")
      setBulkYear("")
      setSelected([])
      
      notifySuccess(`อัปเดตข้อมูลหนังสือ ${updatedCount} รายการเรียบร้อยแล้ว`)
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการอัปเดตข้อมูลบางส่วน")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return <LibraryForm item={editing} setItem={setEdit} onSave={save} onCancel={() => setEdit(null)} taxonomy={taxonomy} busy={busy} />
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ minWidth: 150 }}>หนังสือและ PDF <span style={{ fontSize: 12, color: "var(--t3)" }}>({sorted.length} รายการ)</span></h2>
          <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>
            หนังสือ วารสาร และสื่อดาวน์โหลดทั้งหมดของ Talib Club {totalPages > 0 && `(หน้า ${safePage}/${totalPages})`}
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
            placeholder="ค้นหาชื่อหนังสือ, ผู้เขียน, หรือเนื้อหา..." 
            style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "10px 16px 10px 42px", background: "var(--bg2)", border: "none" }} 
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setTypeFilter("all")} className={`pill ${typeFilter === "all" ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>ทั้งหมด</button>
          {(taxonomy.bookTypes || []).map(type => (
            <button key={type} onClick={() => setTypeFilter(type)} className={`pill ${typeFilter === type ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>
              {type}
            </button>
          ))}
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ width: "auto", height: 36, borderRadius: 24, padding: "0 16px", background: "var(--bg2)", border: "none", color: "var(--text)" }}>
            <option value="newest">ปีที่พิมพ์ ใหม่ ➜ เก่า</option>
            <option value="oldest">ปีที่พิมพ์ เก่า ➜ ใหม่</option>
          </select>
        </div>

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
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>หมวดหมู่เนื้อหา</span>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ background: "var(--card)", border: "none" }}>
              <option value="all">-- ทุกหมวดหมู่ --</option>
              {(taxonomy.articleCategories || []).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>แหล่งที่มา / สำนักพิมพ์</span>
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ background: "var(--card)", border: "none" }}>
              <option value="all">-- ทุกสำนักพิมพ์ --</option>
              {(taxonomy.bookSources || []).map(src => (
                <option key={src} value={src}>{src}</option>
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
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนแหล่งที่มา</span>
              <select value={bulkSource} onChange={e => setBulkSource(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                {(taxonomy.bookSources || []).map(src => <option key={src} value={src}>{src}</option>)}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนประเภท</span>
              <select value={bulkType} onChange={e => setBulkType(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                {(taxonomy.bookTypes || []).map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนหมวดหมู่</span>
              <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                {(taxonomy.articleCategories || []).map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนชื่อผู้แต่ง/ผู้จัดทำ</span>
              <input value={bulkAuthor} onChange={e => setBulkAuthor(e.target.value)} placeholder="เช่น Talib Club" style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนปีพิมพ์ (พ.ศ.)</span>
              <input type="number" value={bulkYear} onChange={e => setBulkYear(e.target.value)} placeholder="เช่น 2569" style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <button 
              className="btn btn-teal" 
              onClick={handleBulkUpdate} 
              disabled={busy || (!bulkSource && !bulkType && !bulkCategory && !bulkAuthor && !bulkYear)}
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
        {currentItems.map(book => (
          <div key={book.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: busy ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={selected.includes(book.id)} onChange={() => toggleSelect(book.id)} disabled={busy} style={{ width: 18, height: 18, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span className="tag tag-teal">{book.category || "ไม่มีหมวดหมู่"}</span>
                  <span className="tag" style={{ background: "var(--acc2)" }}>{book.type}</span>
                  {book.type === "วารสาร" && book.issueNumber !== undefined && book.issueNumber !== "" && (
                    <span className="tag" style={{ background: "rgba(45, 190, 160, 0.15)", color: "var(--teal)" }}>เล่มที่ {book.issueNumber}</span>
                  )}
                  <span className="tag" style={{ background: "var(--acc2)", color: "var(--t2)", border: ".5px solid var(--br)" }}>{book.source}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{book.title}</div>
                <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300, marginTop: 4 }}>ผู้แต่ง: {book.author} · ปี {book.year}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button className="btn btn-outline" onClick={() => openEdit(book)} disabled={busy} style={{ padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}><i className="ti ti-pencil"></i></button>
              <button className="btn btn-outline" style={{ color: "#e05555", borderColor: "rgba(224,85,85,.3)", padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => remove(book)} disabled={busy}><i className="ti ti-trash"></i></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>}
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

function LibraryForm({ item, setItem, onSave, onCancel, taxonomy, busy }) {
  const set = (key, value) => setItem(prev => ({ ...prev, [key]: value }))
  const [uploadingImage, setUploadingImage] = useState(false)

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    console.log("Starting Library Image Upload: v4 Diagnostic Logger active.");
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
        storageRef = ref(usedStorage, `library_covers/${Date.now()}_${safeName}`)
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
      <h2 style={{ marginBottom: 20 }}>{item.id ? "แก้ไขข้อมูล" : "เพิ่มรายการใหม่"}</h2>

      <div className="card" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ชื่อหนังสือ *" span><input value={item.title || ""} onChange={e => set("title", e.target.value)} placeholder="ชื่อหนังสือหรือเอกสาร" /></Field>
        <Field label="ผู้เขียน/ผู้จัดทำ"><input value={item.author || ""} onChange={e => set("author", e.target.value)} /></Field>
        <Field label="แหล่งที่มา">
          <select value={item.source || ""} onChange={e => set("source", e.target.value)}>
            {(taxonomy.bookSources || []).map(src => <option key={src} value={src}>{src}</option>)}
          </select>
        </Field>
        <Field label="ประเภท">
          <select value={item.type || ""} onChange={e => set("type", e.target.value)}>
            {(taxonomy.bookTypes || []).map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="หมวดหมู่ (ใช้ร่วมกับบทความ)">
          <select value={item.category || ""} onChange={e => set("category", e.target.value)}>
            {(taxonomy.articleCategories || []).map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </Field>
        <Field label="ปีพิมพ์ (พ.ศ.)"><input type="number" value={item.year || ""} onChange={e => set("year", e.target.value)} /></Field>
        {item.type === "วารสาร" && (
          <Field label="ลำดับเล่มที่ (issueNumber)">
            <input 
              type="number" 
              value={item.issueNumber || ""} 
              onChange={e => set("issueNumber", e.target.value ? Number(e.target.value) : "")} 
              placeholder="ตัวอย่าง 1"
            />
          </Field>
        )}
        <Field label="ลิงก์ไฟล์ PDF/Drive" span><input value={item.fileUrl || ""} onChange={e => set("fileUrl", e.target.value)} placeholder="https://..." /></Field>
        <Field label="รูปภาพปกหนังสือ (URL)" span>
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
        <Field label="คำอธิบาย" span><textarea value={item.desc || ""} onChange={e => set("desc", e.target.value)} rows={4} placeholder="รายละเอียดเพิ่มเติม..." style={{ lineHeight: 1.6 }} /></Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="btn btn-outline" onClick={onCancel}>ยกเลิก</button>
        <button className="btn btn-teal" onClick={onSave} disabled={busy}>
          <i className={`ti ${busy ? "ti-loader-2 spin" : "ti-check"}`} style={{ marginRight: 6 }}></i>{busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
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
