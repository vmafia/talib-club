import { useMemo, useState } from "react"
import { useContentCollection } from "../../lib/contentStore.js"
import { confirmAction, notifyError, notifySuccess } from "../../utils/feedback.jsx"

export default function AdminDraftList({ title, collectionName, initialItems = [], fields = [], emptyItem = {} }) {
  const { items, loading, error, saveItem, deleteItem, isUsingFallback } = useContentCollection(collectionName, initialItems)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(item => fields.some(f => String(item[f.key] || "").toLowerCase().includes(q)))
  }, [items, search, fields])

  function openNew() {
    setEditing({ ...emptyItem })
  }

  async function save() {
    const required = fields.find(f => String(f.label || "").includes("*"))
    const key = required?.key || fields[0]?.key
    if (key && !String(editing?.[key] || "").trim()) {
      notifyError(`กรุณากรอก${required?.label || key}`)
      return
    }
    setBusy(true)
    try {
      await saveItem({ ...editing })
      setEditing(null)
      notifySuccess("บันทึกข้อมูลขึ้นเว็บไซต์เรียบร้อยแล้ว")
    } catch (err) {
      console.error(err)
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function remove(item) {
    if (busy) return
    const ok = await confirmAction({
      title: "ลบรายการนี้?",
      message: `รายการ "${item.title || item.name || item.channel || item.id}" จะถูกซ่อนจากหน้าเว็บไซต์`,
      confirmText: "ลบรายการ",
      danger: true,
    })
    if (!ok) return

    setBusy(true)
    try {
      await deleteItem(item.id)
      notifySuccess("ลบรายการเรียบร้อยแล้ว")
    } catch (err) {
      console.error(err)
      notifyError("ลบไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <button className="btn btn-outline" style={{ marginBottom: 18 }} onClick={() => setEditing(null)}>
          <i className="ti ti-arrow-left" style={{ marginRight: 6 }}></i>กลับ
        </button>
        <h2 style={{ marginBottom: 16 }}>{title}</h2>
        <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
          {fields.map(field => (
            <label key={field.key}>
              <span style={labelStyle}>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea rows={field.rows || 4} value={editing[field.key] || ""} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} />
              ) : field.type === "select" ? (
                <select value={editing[field.key] || ""} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })}>
                  {(field.options || []).map(option => {
                    const value = typeof option === "object" ? option.value : option
                    const label = typeof option === "object" ? option.label : option
                    return <option key={value} value={value}>{label}</option>
                  })}
                </select>
              ) : (
                <input type={field.type || "text"} value={editing[field.key] || ""} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} />
              )}
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn btn-teal" onClick={save} disabled={busy}>
              <i className={`ti ${busy ? "ti-loader-2" : "ti-check"}`} style={{ marginRight: 6 }}></i>
              {busy ? "กำลังบันทึก..." : "บันทึกขึ้นเว็บ"}
            </button>
            <button className="btn btn-outline" onClick={() => setEditing(null)}>ยกเลิก</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ flex: 1 }}>{title} <span style={{ fontSize: 12, color: "var(--t3)" }}>({items.length})</span></h2>
        {loading && <span style={{ fontSize: 12, color: "var(--t3)" }}>กำลังโหลดข้อมูล...</span>}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." style={{ maxWidth: 200 }} />
        <button className="btn btn-teal" onClick={openNew} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
          <i className="ti ti-plus" style={{ marginRight: 6 }}></i>เพิ่มใหม่
        </button>
      </div>

      <div className="flex-col">
        {filtered.map(item => (
          <div key={item.id} className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: busy ? 0.6 : 1 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || item.name || item.channel || "Untitled"}</h3>
              <p style={{ marginTop: 4 }}>{fields.slice(1, 4).map(f => item[f.key]).filter(Boolean).join(" · ") || "ยังไม่มีรายละเอียด"}</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-outline" onClick={() => setEditing(item)} disabled={busy} style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
                <i className="ti ti-pencil" style={{ marginRight: 5 }}></i>แก้ไข
              </button>
              <button className="btn btn-outline" style={{ color: "#e05555", borderColor: "rgba(224,85,85,.3)", opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => remove(item)} disabled={busy}>
                <i className="ti ti-trash" style={{ marginRight: 5 }}></i>ลบ
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty">ไม่พบรายการ</div>}
      </div>

      {(error || isUsingFallback) && (
        <div className="card" style={{ marginTop: 24, padding: 16 }}>
          <h3>{error ? "ใช้ข้อมูลสำรองอยู่" : "ยังไม่มีข้อมูลใน Firestore"}</h3>
          <p style={{ marginTop: 6 }}>
            {error
              ? "ระบบโหลดข้อมูลจาก Firestore ไม่ได้ จึงแสดงข้อมูลตั้งต้นจากโปรเจกต์ก่อน"
              : "ตอนนี้แสดงข้อมูลตั้งต้นจากไฟล์เดิม เมื่อบันทึกรายการแรก ระบบจะเผยแพร่ผ่าน Firestore และหน้า member จะเห็นข้อมูลชุดเดียวกัน"}
          </p>
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  color: "var(--t2)",
  marginBottom: 6,
}