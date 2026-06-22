import { useState, useEffect, useMemo } from "react"
import { DEFAULT_TAXONOMY, MEDIA } from "../../data/index.js"
import { useContentCollection, useTaxonomySettings, bulkDeleteItems, bulkSaveItems } from "../../lib/contentStore.js"
import { confirmAction, notifyError, notifySuccess } from "../../utils/feedback.jsx"
import ContentStatusBanner from "../../components/ContentStatusBanner.jsx"
import { clampPage } from "../../utils/pagination.js"

const EMPTY = {
  type: "youtube",
  title: "",
  channel: "Talib Club",
  duration: "",
  embedId: "",
  spotifyUrl: "",
  series: "",
  coverUrl: "",
  date: `${new Date().getFullYear() + 543}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
}

export default function AdminMedia() {
  const adminQueryOptions = useMemo(() => ({ live: false }), [])
  const { items, loading, error, saveItem, deleteItem, isUsingFallback } = useContentCollection("media", MEDIA, null, adminQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  
  const [editing, setEdit] = useState(null)
  
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all") 
  const [playlistFilter, setPlaylistFilter] = useState("all") 
  const [showAdvanced, setShowAdvanced] = useState(false) 
  const [sortOrder, setSortOrder] = useState("newest")

  const [selected, setSelected] = useState([]) 
  const [busy, setBusy] = useState(false)

  const [bulkType, setBulkType] = useState("")
  const [bulkChannel, setBulkChannel] = useState("")
  const [bulkPlaylist, setBulkPlaylist] = useState("")
  const [bulkIsNewPlaylist, setBulkIsNewPlaylist] = useState(false)
  const [bulkDate, setBulkDate] = useState("")

  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 20

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, playlistFilter, sortOrder])

  const existingPlaylists = Array.from(new Set([
    ...(taxonomy.mediaPlaylists || []),
    ...items.map(m => m.series).filter(Boolean)
  ])).sort()

  const filtered = items.filter(m => {
    const matchSearch = String(m.title || "").toLowerCase().includes(search.toLowerCase()) || 
                        String(m.channel || "").toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === "all" || m.type === typeFilter
    const matchPlaylist = playlistFilter === "all" || m.series === playlistFilter
    
    return matchSearch && matchType && matchPlaylist
  })

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
    else setSelected(sorted.map(m => m.id))
  }

  function openNew() {
    const defaultType = taxonomy.mediaTypes?.[0] || "youtube"
    setEdit({ ...EMPTY, type: defaultType, id: crypto.randomUUID() })
  }

  // --- ฟังก์ชันที่หายไป เติมกลับมาให้แล้วครับ ---
  function openEdit(mediaItem) {
    setEdit({ ...mediaItem })
  }

  async function save() {
    if (!editing.title?.trim()) return notifyError("กรุณาใส่ชื่อรายการ/ตอน")
    setBusy(true)
    try {
      await saveItem(editing)
      setEdit(null)
      notifySuccess("บันทึกข้อมูลสื่อขึ้นเว็บไซต์เรียบร้อยแล้ว")
    } catch (err) {
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function remove(mediaItem) {
    if (busy) return
    const ok = await confirmAction({ title: "ลบรายการนี้?", message: `"${mediaItem.title}" จะถูกลบจากหน้าเว็บไซต์`, confirmText: "ลบ", danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await deleteItem(mediaItem.id)
      setSelected(prev => prev.filter(id => id !== mediaItem.id))
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
      const { deleted, failed } = await bulkDeleteItems("media", toDelete)
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

  async function handleBulkUpdate() {
    if (selected.length === 0) return
    const ok = await confirmAction({ 
      title: `ยืนยันการแก้ไข ${selected.length} รายการ?`, 
      message: "ฟิลด์ที่กรอก/เลือกไว้จะถูกอัปเดตทดแทนค่าเดิมในมีเดียทั้งหมดที่เลือก", 
      confirmText: "ยืนยันการอัปเดต", 
      confirmColor: "var(--teal)" 
    })
    if (!ok) return
    
    setBusy(true)
    try {
      const updatedItems = selected.map(id => {
        const original = items.find(m => String(m.id) === String(id))
        if (!original) return null
        const next = { ...original }
        if (bulkType) next.type = bulkType
        if (bulkChannel !== undefined && bulkChannel !== "") next.channel = bulkChannel
        if (bulkPlaylist) {
          next.series = bulkPlaylist === "__none__" ? "" : bulkPlaylist
        }
        if (bulkDate) next.date = bulkDate
        return next
      }).filter(Boolean)

      const { saved, failed } = await bulkSaveItems("media", updatedItems)
      setBulkType("")
      setBulkChannel("")
      setBulkPlaylist("")
      setBulkIsNewPlaylist(false)
      setBulkDate("")
      setSelected([])
      if (failed === 0) {
        notifySuccess(`อัปเดตข้อมูลมีเดีย ${saved} รายการเรียบร้อยแล้ว`)
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
    return <MediaForm item={editing} setItem={setEdit} onSave={save} onCancel={() => setEdit(null)} taxonomy={taxonomy} existingPlaylists={existingPlaylists} busy={busy} />
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ minWidth: 150 }}>มีเดีย <span style={{ fontSize: 12, color: "var(--t3)" }}>({sorted.length} รายการ)</span></h2>
          <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>
            จัดการวิดีโอ YouTube และพอดแคสต์ Spotify {totalPages > 0 && `(หน้า ${safePage}/${totalPages})`}
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
            placeholder="ค้นหาชื่อรายการ, ช่อง..." 
            style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "10px 16px 10px 42px", background: "var(--bg2)", border: "none" }} 
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setTypeFilter("all")} className={`pill ${typeFilter === "all" ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>ทั้งหมด</button>
          <button onClick={() => setTypeFilter("youtube")} className={`pill ${typeFilter === "youtube" ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>YouTube</button>
          <button onClick={() => setTypeFilter("spotify")} className={`pill ${typeFilter === "spotify" ? "on-acc" : ""}`} style={{ padding: "8px 16px" }}>Spotify</button>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ width: "auto", height: 36, borderRadius: 24, padding: "0 16px", background: "var(--bg2)", border: "none", color: "var(--text)" }}>
            <option value="newest">ใหม่ไปเก่า</option>
            <option value="oldest">เก่าไปใหม่</option>
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
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>เพลย์ลิสต์</span>
            <select value={playlistFilter} onChange={e => setPlaylistFilter(e.target.value)} style={{ background: "var(--card)", border: "none" }}>
              <option value="all">-- ทุกเพลย์ลิสต์ --</option>
              {existingPlaylists.map(pl => (
                <option key={pl} value={pl}>{pl}</option>
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
              <select value={bulkType} onChange={e => setBulkType(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนช่อง</span>
              <input value={bulkChannel} onChange={e => setBulkChannel(e.target.value)} placeholder="เช่น Talib Club" style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนเพลย์ลิสต์</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {bulkIsNewPlaylist ? (
                  <input value={bulkPlaylist === "__none__" ? "" : bulkPlaylist} onChange={e => setBulkPlaylist(e.target.value)} placeholder="พิมพ์ชื่อใหม่..." style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)", flex: 1 }} />
                ) : (
                  <select value={bulkPlaylist} onChange={e => setBulkPlaylist(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)", flex: 1 }}>
                    <option value="">-- ไม่เปลี่ยน --</option>
                    <option value="__none__">-- ไม่มีเพลย์ลิสต์ (ล้างค่า) --</option>
                    {existingPlaylists.map(pl => <option key={pl} value={pl}>{pl}</option>)}
                  </select>
                )}
                <button className="btn btn-outline" onClick={() => { setBulkIsNewPlaylist(!bulkIsNewPlaylist); setBulkPlaylist(""); }} style={{ fontSize: 10, padding: "8px", height: "32px", whiteSpace: "nowrap" }}>
                  {bulkIsNewPlaylist ? "เลือกที่มี" : "+ พิมพ์เอง"}
                </button>
              </div>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนวันที่เผยแพร่</span>
              <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <button 
              className="btn btn-teal" 
              onClick={handleBulkUpdate} 
              disabled={busy || (!bulkType && !bulkChannel && !bulkPlaylist && !bulkDate)}
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
        {currentItems.map(item => (
          <div key={item.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: busy ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} disabled={busy} style={{ width: 18, height: 18, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0 }} />
              
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: item.type === "youtube" ? "rgba(255,50,50,.1)" : "rgba(30,215,96,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className={`ti ${item.type === "youtube" ? "ti-brand-youtube" : "ti-brand-spotify"}`} style={{ color: item.type === "youtube" ? "#ff4444" : "#1ed760", fontSize: 14 }}></i>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{item.title}</div>
                <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300, marginTop: 4 }}>
                  จากช่อง: {item.channel} {item.series && ` · เพลย์ลิสต์: ${item.series}`} {item.duration && ` · ${item.duration}`}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button className="btn btn-outline" onClick={() => openEdit(item)} disabled={busy} style={{ padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}><i className="ti ti-pencil"></i></button>
              <button className="btn btn-outline" style={{ color: "#e05555", borderColor: "rgba(224,85,85,.3)", padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => remove(item)} disabled={busy}><i className="ti ti-trash"></i></button>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <div className="empty">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>}
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

function MediaForm({ item, setItem, onSave, onCancel, taxonomy, existingPlaylists, busy }) {
  const set = (key, value) => setItem(prev => ({ ...prev, [key]: value }))
  const [isNewPlaylist, setIsNewPlaylist] = useState(false)

  const handleFetchDuration = () => {
    notifyError("ระบบยังไม่เชื่อม YouTube API กรุณากรอกความยาวคลิป (mm:ss) ด้วยตนเอง")
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <button className="btn btn-outline" style={{ marginBottom: 18 }} onClick={onCancel}><i className="ti ti-arrow-left" style={{ marginRight: 6 }}></i>กลับ</button>
      <h2 style={{ marginBottom: 20 }}>{item.id ? "แก้ไขมีเดีย" : "เพิ่มมีเดียใหม่"}</h2>

      <div className="card" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ชื่อรายการ/ตอน *" span><input value={item.title || ""} onChange={e => set("title", e.target.value)} placeholder="เช่น ปรัชญาอิสลาม Ep.1" /></Field>
        <Field label="ประเภท">
          <select value={item.type || "youtube"} onChange={e => set("type", e.target.value)}>
            {(taxonomy.mediaTypes || []).map(type => <option key={type} value={type}>{type === "youtube" ? "YouTube" : "Spotify"}</option>)}
          </select>
        </Field>
        <Field label="จากช่อง"><input value={item.channel || ""} onChange={e => set("channel", e.target.value)} placeholder="เช่น Talib Club" /></Field>
        
        <Field label="เพลย์ลิสต์" span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isNewPlaylist ? (
               <input value={item.series || ""} onChange={e => set("series", e.target.value)} placeholder="พิมพ์ชื่อเพลย์ลิสต์ใหม่ (และอย่าลืมไปตั้งค่าเพิ่มในเมนูหมวดตัวเลือกด้วยนะครับ)..." style={{ flex: 1 }} />
            ) : (
               <select value={item.series || ""} onChange={e => set("series", e.target.value)} style={{ flex: 1 }}>
                 <option value="">-- ไม่จัดลงเพลย์ลิสต์ --</option>
                 {existingPlaylists.map(pl => <option key={pl} value={pl}>{pl}</option>)}
               </select>
            )}
            <button className="btn btn-outline" onClick={() => { setIsNewPlaylist(!isNewPlaylist); set("series", ""); }} style={{ fontSize: 11, padding: "8px 12px", whiteSpace: "nowrap" }}>
              {isNewPlaylist ? "เลือกที่มีอยู่" : "+ สร้างพิมพ์เอง"}
            </button>
          </div>
        </Field>

        {item.type === "youtube" && (
          <Field label="YouTube Video ID (ตัวอักษร 11 ตัวท้าย URL)" span>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={item.embedId || ""} onChange={e => set("embedId", e.target.value)} placeholder="เช่น dQw4w9WgXcQ" style={{ flex: 1 }} />
              <button className="btn btn-teal" onClick={handleFetchDuration} style={{ fontSize: 12, padding: "0 14px", whiteSpace: "nowrap" }}><i className="ti ti-download" style={{ marginRight: 4 }}></i>ดึงความยาว</button>
            </div>
            {item.duration && <div style={{ fontSize: 11, color: "var(--teal)", marginTop: 6 }}>ความยาวที่ดึงมาได้: {item.duration} นาที</div>}
          </Field>
        )}

        {item.type === "spotify" && <Field label="Spotify URL" span><input value={item.spotifyUrl || ""} onChange={e => set("spotifyUrl", e.target.value)} placeholder="https://open.spotify.com/episode/..." /></Field>}
        <Field label="วันที่เผยแพร่"><input type="date" value={item.date || ""} onChange={e => set("date", e.target.value)} /></Field>
        <Field label="ลิงก์รูปปก (ใส่เฉพาะถ้าต้องการใช้รูปอื่นแทนของ YouTube)"><input value={item.coverUrl || ""} onChange={e => set("coverUrl", e.target.value)} placeholder="https://..." /></Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="btn btn-outline" onClick={onCancel}>ยกเลิก</button>
        <button className="btn btn-teal" onClick={onSave} disabled={busy}><i className={`ti ${busy ? "ti-loader-2 spin" : "ti-check"}`} style={{ marginRight: 6 }}></i>{busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</button>
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
