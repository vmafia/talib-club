import { useState, useEffect, useMemo } from "react"
import { DEFAULT_TAXONOMY, SCHOLARS } from "../../data/index.js"
import { useContentCollection, useTaxonomySettings, bulkDeleteItems } from "../../lib/contentStore.js"
import { confirmAction, notifyError, notifySuccess } from "../../utils/feedback.jsx"
import ContentStatusBanner from "../../components/ContentStatusBanner.jsx"
import { clampPage } from "../../utils/pagination.js"

const EMPTY = {
  name: "",
  hijri: "",
  ad: "",
  era: "",
  field: "",
  note: "",
  refs: "",
  aq: "",
  mh: "",
  mz: "",
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

export default function AdminScholars() {
  const adminQueryOptions = useMemo(() => ({ live: false }), [])
  const { items, loading, error, saveItem, deleteItem, isUsingFallback } = useContentCollection("scholars", SCHOLARS, null, adminQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  
  const [editing, setEdit] = useState(null)
  
  // States สำหรับค้นหาและตัวกรอง
  const [search, setSearch] = useState("")
  const [fieldFilter, setFieldFilter] = useState("all") // สำหรับปุ่ม Pill
  const [eraFilter, setEraFilter] = useState("all") // สำหรับ Dropdown
  const [showAdvanced, setShowAdvanced] = useState(false) 

  const [selected, setSelected] = useState([]) 
  const [busy, setBusy] = useState(false)

  // Pagination States
  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 20

  // รีเซ็ตหน้าเป็น 1 เสมอเมื่อมีการค้นหาหรือเปลี่ยนตัวกรอง
  useEffect(() => {
    setPage(1)
  }, [search, fieldFilter, eraFilter])

  // กรองข้อมูล
  const filtered = items.filter(s => {
    const matchSearch = String(s.name || "").toLowerCase().includes(search.toLowerCase())
    const matchField = fieldFilter === "all" || s.field === fieldFilter
    const matchEra = eraFilter === "all" || mapEraValue(s.era) === mapEraValue(eraFilter)
    
    return matchSearch && matchField && matchEra
  })

  const sorted = [...filtered].sort((a, b) => {
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
    if (timeA || timeB) {
      if (timeA && timeB) return timeB - timeA
      return timeA ? -1 : 1
    }
    const yearA = parseInt(String(a.hijri || a.ad || "").replace(/\D/g, "")) || 0
    const yearB = parseInt(String(b.hijri || b.ad || "").replace(/\D/g, "")) || 0
    if (yearA !== yearB) return yearB - yearA
    return String(b.id || "").localeCompare(String(a.id || ""))
  })

  // คำนวณข้อมูลสำหรับหน้าปัจจุบัน
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
    else setSelected(sorted.map(s => s.id))
  }

  function openNew() {
    const defaultEra = taxonomy.scholarEras?.[0]?.id || "1"
    const defaultField = taxonomy.scholarFields?.[0] || ""
    setEdit({ ...EMPTY, era: defaultEra, field: defaultField, id: crypto.randomUUID() })
  }

  function openEdit(scholar) {
    setEdit({ ...scholar })
  }

  async function save() {
    if (!editing.name?.trim()) return notifyError("กรุณาใส่ชื่ออุลามาอฺ")

    setBusy(true)
    try {
      await saveItem(editing)
      setEdit(null)
      notifySuccess("บันทึกข้อมูลเรียบร้อยแล้ว")
    } catch (err) {
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function remove(scholar) {
    if (busy) return
    const ok = await confirmAction({ title: "ลบรายการนี้?", message: `ข้อมูลของ "${scholar.name}" จะถูกลบจากหน้าเว็บไซต์`, confirmText: "ลบ", danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await deleteItem(scholar.id)
      setSelected(prev => prev.filter(id => id !== scholar.id))
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
    const toDelete = [...selected]
    try {
      const { deleted, failed } = await bulkDeleteItems("scholars", toDelete)
      setSelected([])
      if (failed === 0) {
        notifySuccess(`ลบ ${deleted} รายการเรียบร้อยแล้ว`)
      } else {
        notifyError(`ลบสำเร็จ ${deleted} รายการ แต่ล้มเหลว ${failed} รายการ — กรุณาตรวจสิทธิ์ Firestore`)
      }
    } catch (err) {
      notifyError("เกิดข้อผิดพลาดในการลบข้อมูล")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return <ScholarForm item={editing} setItem={setEdit} onSave={save} onCancel={() => setEdit(null)} taxonomy={taxonomy} busy={busy} />
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ minWidth: 150 }}>รายชื่ออุลามาอฺ <span style={{ fontSize: 12, color: "var(--t3)" }}>({sorted.length} รายการ)</span></h2>
          <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>
            จัดการฐานข้อมูลประวัติและรายชื่อบรรดาอุลามาอฺ {totalPages > 0 && `(หน้า ${safePage}/${totalPages})`}
          </p>
          <ContentStatusBanner loading={loading} error={error} isUsingFallback={isUsingFallback} />
        </div>
        <button className="btn btn-teal" onClick={openNew} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
          <i className="ti ti-plus" style={{ marginRight: 6 }}></i>เพิ่มใหม่
        </button>
      </div>

      {/* แถบค้นหา และ ปุ่มกรอง */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: showAdvanced ? 12 : 24 }}>
        <div style={{ flex: "1 1 250px", position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 16 }}></i>
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="ค้นหาชื่ออุลามาอฺ..." 
            style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "10px 16px 10px 42px", background: "var(--bg2)", border: "none" }} 
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setFieldFilter("all")} className={`pill ${fieldFilter === "all" ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>ทั้งหมด</button>
          {(taxonomy.scholarFields || []).map(field => (
            <button key={field} onClick={() => setFieldFilter(field)} className={`pill ${fieldFilter === field ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>
              {field}
            </button>
          ))}
        </div>

        <button 
          className={`btn ${showAdvanced ? "btn-teal" : "btn-outline"}`} 
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ padding: "8px 16px", borderRadius: 24 }}
        >
          <i className="ti ti-filter" style={{ marginRight: 6 }}></i>ตัวกรองเพิ่มเติม
        </button>
      </div>

      {/* แถบตัวกรองเพิ่มเติม */}
      {showAdvanced && (
        <div style={{ background: "var(--bg2)", padding: "16px 20px", borderRadius: 16, marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>ยุคสมัย</span>
            <select value={eraFilter} onChange={e => setEraFilter(e.target.value)} style={{ background: "var(--card)", border: "none" }}>
              <option value="all">-- ทุกยุคสมัย --</option>
              {(taxonomy.scholarEras || []).map(era => (
                <option key={era.id} value={era.id}>{era.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* แถบเครื่องมือจัดการหลายรายการ */}
      {selected.length > 0 && (
        <div style={{ background: "rgba(45,190,160,0.1)", border: "1px solid var(--teal)", padding: "10px 16px", borderRadius: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 500 }}>เลือกอยู่ {selected.length} รายการ</span>
          <button className="btn" style={{ background: "#e05555", color: "#fff", padding: "6px 14px", fontSize: 12 }} onClick={removeSelected} disabled={busy}>
            <i className={busy ? "ti ti-loader-2 spin" : "ti ti-trash"} style={{ marginRight: 6 }}></i> {busy ? "กำลังลบ..." : "ลบที่เลือกทั้งหมด"}
          </button>
        </div>
      )}

      {/* เลือกทั้งหมด */}
      {sorted.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 12, color: "var(--t2)" }}>
            <input type="checkbox" checked={selected.length === sorted.length && sorted.length > 0} onChange={toggleAll} disabled={busy} style={{ width: 16, height: 16, cursor: busy ? "not-allowed" : "pointer" }} />
            เลือกทั้งหมด {sorted.length} รายการที่ค้นเจอ
          </label>
        </div>
      )}

      {/* รายการข้อมูล */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {currentItems.map(scholar => {
          // หาชื่อยุคจาก ID
          const eraLabel = (taxonomy.scholarEras || []).find(e => mapEraValue(e.id) === mapEraValue(scholar.era))?.label || scholar.era
          
          return (
            <div key={scholar.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: busy ? 0.6 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={selected.includes(scholar.id)} onChange={() => toggleSelect(scholar.id)} disabled={busy} style={{ width: 18, height: 18, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0 }} />
                
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className="ti ti-user" style={{ color: "var(--teal)", fontSize: 16 }}></i>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                    {scholar.field && <span className="tag tag-teal">{scholar.field}</span>}
                    {eraLabel && <span className="tag" style={{ background: "var(--acc2)", color: "var(--text)" }}>ยุค: {eraLabel}</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {scholar.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t3)", fontWeight: 300, marginTop: 4 }}>
                    {scholar.hijri && `ฮ.ศ. ${scholar.hijri}`} {scholar.hijri && scholar.ad && " / "} {scholar.ad && `ค.ศ. ${scholar.ad}`}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="btn btn-outline" onClick={() => openEdit(scholar)} disabled={busy} style={{ padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}><i className="ti ti-pencil"></i></button>
                <button className="btn btn-outline" style={{ color: "#e05555", borderColor: "rgba(224,85,85,.3)", padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => remove(scholar)} disabled={busy}><i className="ti ti-trash"></i></button>
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && <div className="empty">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 32, flexWrap: "wrap" }}>
          <button className="btn btn-outline" disabled={page === 1} onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }} style={{ padding: "6px 12px", fontSize: 12 }}>ก่อนหน้า</button>
          
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            // แสดงเฉพาะหน้าแรก หน้าสุดท้าย และหน้าใกล้เคียง
            if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
              return (
                <button key={p} onClick={() => { setPage(p); window.scrollTo(0, 0); }} className={page === p ? "btn btn-teal" : "btn btn-outline"} style={{ padding: "6px 14px", fontSize: 12 }}>{p}</button>
              )
            }
            if (p === page - 2 || p === page + 2) {
              return <span key={p} style={{ color: "var(--t3)", padding: "0 4px" }}>...</span>
            }
            return null;
          })}
          
          <button className="btn btn-outline" disabled={page === totalPages} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }} style={{ padding: "6px 12px", fontSize: 12 }}>ถัดไป</button>
        </div>
      )}
    </div>
  )
}

function ScholarForm({ item, setItem, onSave, onCancel, taxonomy, busy }) {
  const set = (key, value) => setItem(prev => ({ ...prev, [key]: value }))

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <button className="btn btn-outline" style={{ marginBottom: 18 }} onClick={onCancel}>
        <i className="ti ti-arrow-left" style={{ marginRight: 6 }}></i>กลับ
      </button>
      <h2 style={{ marginBottom: 20 }}>{item.id ? "แก้ไขข้อมูลอุลามาอฺ" : "เพิ่มรายชื่อใหม่"}</h2>

      <div className="card" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ชื่ออุลามาอฺ *" span>
          <input value={item.name || ""} onChange={e => set("name", e.target.value)} placeholder="ระบุชื่อ..." />
        </Field>
        
        <Field label="ปีฮิจเราะห์">
          <input value={item.hijri || ""} onChange={e => set("hijri", e.target.value)} placeholder="เช่น 1115-1206 AH" />
        </Field>

        <Field label="ปีคริสต์ศักราช">
          <input value={item.ad || ""} onChange={e => set("ad", e.target.value)} placeholder="เช่น 1703-1792 CE" />
        </Field>

        <Field label="ยุคสมัย">
          <select value={item.era || ""} onChange={e => set("era", e.target.value)}>
            {(taxonomy.scholarEras || []).map(era => <option key={era.id} value={era.id}>{era.label}</option>)}
          </select>
        </Field>
        
        <Field label="สาขาความรู้">
          <select value={item.field || ""} onChange={e => set("field", e.target.value)}>
             <option value="">-- ไม่ระบุ --</option>
            {(taxonomy.scholarFields || []).map(field => <option key={field} value={field}>{field}</option>)}
          </select>
        </Field>
        
        <Field label="อากีดะฮฺ (Aqidah)">
          <select value={item.aq || ""} onChange={e => set("aq", e.target.value)}>
            <option value="">-- ไม่ระบุ --</option>
            <option value="สะลัฟ">สะลัฟ / อะฮฺลุสสุนนะฮฺ</option>
            <option value="อะชะอะรี">อะชะอะรี</option>
            <option value="มาตุรีดี">มาตุรีดี</option>
          </select>
        </Field>
        
        <Field label="มันฮัจญ์ (Manhaj)">
          <select value={item.mh || ""} onChange={e => set("mh", e.target.value)}>
            <option value="">-- ไม่ระบุ --</option>
            <option value="สะลัฟี">สะลัฟี</option>
            <option value="ศูฟี">ศูฟี / ตะเซาวุฟ</option>
            <option value="เดโอบันดี">เดโอบันดี</option>
            <option value="บะเรลวี">บะเรลวี</option>
            <option value="ตับลีฆ">ตับลีฆ</option>
            <option value="อิควาน">อิควาน</option>
            <option value="กลาสสิก">กลาสสิก / อะชะอะรี</option>
          </select>
        </Field>

        <Field label="มัซฮับ (Madhhab)">
          <select value={item.mz || ""} onChange={e => set("mz", e.target.value)}>
            <option value="">-- ไม่ระบุ --</option>
            <option value="หัมบะลี">หัมบะลี</option>
            <option value="ชาฟิอี">ชาฟิอี</option>
            <option value="มาลิกี">มาลิกี</option>
            <option value="หะนะฟี">หะนะฟี</option>
            <option value="ซอฮิรี">ซอฮิรี</option>
          </select>
        </Field>
        
        <Field label="ประวัติ/หมายเหตุ" span>
          <textarea value={item.note || ""} onChange={e => set("note", e.target.value)} rows={5} placeholder="พิมพ์รายละเอียดประวัติหรือผลงานที่สำคัญ..." style={{ lineHeight: 1.6 }} />
        </Field>

        <Field label="ลิงก์อ้างอิง" span>
          <input value={item.refs || ""} onChange={e => set("refs", e.target.value)} placeholder="https://..." />
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
