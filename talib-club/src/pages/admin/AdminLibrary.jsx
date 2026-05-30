import { useState } from "react"
import { BOOKS, DEFAULT_TAXONOMY } from "../../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../../lib/contentStore.js"
import { confirmAction, notifyError, notifySuccess } from "../../utils/feedback.jsx"

const EMPTY = {
  title: "",
  author: "Talib Club",
  source: "Talib Club",
  type: "วารสาร",
  category: "aqeedah", // ใช้ค่าเริ่มต้นให้ตรงกับหมวดบทความ
  year: new Date().getFullYear() + 543,
  fileUrl: "",
  coverUrl: "",
  desc: "",
}

export default function AdminLibrary() {
  const { items, loading, error, saveItem, deleteItem, isUsingFallback } = useContentCollection("books", BOOKS)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  
  const [editing, setEdit] = useState(null)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all") 
  const [selected, setSelected] = useState([]) 
  const [busy, setBusy] = useState(false)

  // กรองข้อมูลด้วย คำค้นหา + หมวดหมู่
  const filtered = items.filter(b => {
    const matchSearch = String(b.title || "").toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === "all" || b.category === categoryFilter
    return matchSearch && matchCat
  })

  // จัดการ Checkbox
  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  
  const toggleAll = () => {
    if (selected.length === filtered.length) {
      setSelected([])
    } else {
      setSelected(filtered.map(b => b.id))
    }
  }

  function openNew() {
    // กำหนดค่าตั้งต้นให้ประเภท ดึงมาจาก taxonomy
    const defaultType = taxonomy.bookTypes?.[0] || "วารสาร"
    setEdit({ ...EMPTY, type: defaultType, id: crypto.randomUUID() })
  }

  function openEdit(book) {
    setEdit({ ...book })
  }

  async function save() {
    if (!editing.title?.trim()) {
      notifyError("กรุณาใส่ชื่อหนังสือ")
      return
    }

    const payload = {
      ...editing,
      year: Number(editing.year || (new Date().getFullYear() + 543)),
    }

    setBusy(true)
    try {
      await saveItem(payload)
      setEdit(null)
      notifySuccess("บันทึกข้อมูลขึ้นเว็บไซต์เรียบร้อยแล้ว")
    } catch (err) {
      console.error(err)
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  // ลบรายการเดียว
  async function remove(book) {
    const ok = await confirmAction({
      title: "ลบรายการนี้?",
      message: `"${book.title}" จะถูกลบจากหน้าเว็บไซต์`,
      confirmText: "ลบ",
      danger: true,
    })
    if (!ok) return

    try {
      await deleteItem(book.id)
      setSelected(prev => prev.filter(id => id !== book.id))
      notifySuccess("ลบเรียบร้อยแล้ว")
    } catch (err) {
      console.error(err)
      notifyError("ลบไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    }
  }

  // ลบหลายรายการพร้อมกัน (Bulk Delete)
  async function removeSelected() {
    const ok = await confirmAction({
      title: `ยืนยันการลบ ${selected.length} รายการ?`,
      message: "ข้อมูลที่ถูกเลือกรวมถึงเนื้อหาทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้",
      confirmText: "ยืนยันการลบ",
      danger: true,
    })
    if (!ok) return

    setBusy(true)
    try {
      await Promise.all(selected.map(id => deleteItem(id)))
      setSelected([])
      notifySuccess(`ลบ ${selected.length} รายการเรียบร้อยแล้ว`)
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการลบข้อมูลบางส่วน")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return <LibraryForm item={editing} setItem={setEdit} onSave={save} onCancel={() => setEdit(null)} taxonomy={taxonomy} busy={busy} />
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ flex: 1, minWidth: 150 }}>หนังสือและ PDF <span style={{ fontSize: 12, color: "var(--t3)" }}>({filtered.length})</span></h2>
        
        {/* กล่องค้นหาและตัวกรอง */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 2, justifyContent: "flex-end" }}>
          <select 
            value={categoryFilter} 
            onChange={e => { setCategoryFilter(e.target.value); setSelected([]); }}
            style={{ maxWidth: 180 }}
          >
            <option value="all">ทุกหมวดหมู่</option>
            {/* ดึงข้อมูลหมวดหมู่เดียวกับบทความมาใช้ */}
            {(taxonomy.articleCategories || []).map(cat => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
          <input 
            value={search} 
            onChange={e => { setSearch(e.target.value); setSelected([]); }} 
            placeholder="ค้นหาชื่อหนังสือ..." 
            style={{ maxWidth: 200 }} 
          />
          <button className="btn btn-teal" onClick={openNew}>
            <i className="ti ti-plus" style={{ marginRight: 6 }}></i>เพิ่มใหม่
          </button>
        </div>
      </div>

      {/* แถบเครื่องมือจัดการหลายรายการ (Bulk Actions) */}
      {selected.length > 0 && (
        <div style={{ background: "rgba(45,190,160,0.1)", border: "1px solid var(--teal)", padding: "10px 16px", borderRadius: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 500 }}>
            เลือกอยู่ {selected.length} รายการ
          </span>
          <button className="btn" style={{ background: "#e05555", color: "#fff", padding: "6px 14px", fontSize: 12 }} onClick={removeSelected} disabled={busy}>
            <i className={busy ? "ti ti-loader-2 spin" : "ti ti-trash"} style={{ marginRight: 6 }}></i>
            {busy ? "กำลังลบ..." : "ลบที่เลือก"}
          </button>
        </div>
      )}

      {/* หัวตารางจำลอง สำหรับเลือกทั้งหมด */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--t2)" }}>
            <input 
              type="checkbox" 
              checked={selected.length === filtered.length && filtered.length > 0} 
              onChange={toggleAll}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            เลือกทั้งหมด
          </label>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(book => (
          <div key={book.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            
            <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
              <input 
                type="checkbox" 
                checked={selected.includes(book.id)}
                onChange={() => toggleSelect(book.id)}
                style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
              />
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span className="tag tag-teal">{book.category || "ไม่มีหมวดหมู่"}</span>
                  <span className="tag" style={{ background: "var(--acc2)" }}>{book.type}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {book.title}
                </div>
                <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300, marginTop: 4 }}>
                  {book.author} · {book.source} · {book.year}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button className="btn btn-outline" onClick={() => openEdit(book)} style={{ padding: "6px 12px", fontSize: 12 }}>
                <i className="ti ti-pencil"></i>
              </button>
              <button className="btn btn-outline" style={{ color: "#e05555", borderColor: "rgba(224,85,85,.3)", padding: "6px 12px", fontSize: 12 }} onClick={() => remove(book)}>
                <i className="ti ti-trash"></i>
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>}
      </div>

      {(error || isUsingFallback) && (
        <div className="card" style={{ marginTop: 24, padding: 16 }}>
          <h3>{error ? "ใช้ข้อมูลสำรองอยู่" : "ยังไม่มีข้อมูลใน Firestore"}</h3>
          <p style={{ marginTop: 6 }}>
            {error
              ? "ระบบโหลดข้อมูลจาก Firestore ไม่ได้ จึงแสดงข้อมูลตั้งต้นจากโปรเจกต์ก่อน"
              : "เมื่อบันทึกข้อมูลจากหน้านี้ หน้า member จะอ่านจาก Firestore ชุดเดียวกันทันที"}
          </p>
        </div>
      )}
    </div>
  )
}

function LibraryForm({ item, setItem, onSave, onCancel, taxonomy, busy }) {
  const set = (key, value) => setItem(prev => ({ ...prev, [key]: value }))

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <button className="btn btn-outline" style={{ marginBottom: 18 }} onClick={onCancel}>
        <i className="ti ti-arrow-left" style={{ marginRight: 6 }}></i>กลับ
      </button>
      <h2 style={{ marginBottom: 20 }}>{item.id ? "แก้ไขข้อมูล" : "เพิ่มรายการใหม่"}</h2>

      <div className="card" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ชื่อหนังสือ *" span>
          <input value={item.title || ""} onChange={e => set("title", e.target.value)} placeholder="ชื่อหนังสือหรือเอกสาร" />
        </Field>
        
        <Field label="ผู้เขียน/ผู้จัดทำ">
          <input value={item.author || ""} onChange={e => set("author", e.target.value)} />
        </Field>

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

        <Field label="ปีพิมพ์ (พ.ศ.)">
          <input type="number" value={item.year || ""} onChange={e => set("year", e.target.value)} />
        </Field>

        <Field label="ลิงก์ไฟล์ PDF/Drive" span>
          <input value={item.fileUrl || ""} onChange={e => set("fileUrl", e.target.value)} placeholder="https://..." />
        </Field>

        <Field label="ลิงก์รูปปก" span>
          <input value={item.coverUrl || ""} onChange={e => set("coverUrl", e.target.value)} placeholder="https://..." />
        </Field>
        
        <Field label="คำอธิบาย" span>
          <textarea value={item.desc || ""} onChange={e => set("desc", e.target.value)} rows={4} placeholder="รายละเอียดเพิ่มเติม..." style={{ lineHeight: 1.6 }} />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="btn btn-outline" onClick={onCancel}>ยกเลิก</button>
        <button className="btn btn-teal" onClick={onSave} disabled={busy}>
          <i className={`ti ${busy ? "ti-loader-2 spin" : "ti-check"}`} style={{ marginRight: 6 }}></i>
          {busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
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