import React, { useState, useEffect } from "react"
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore"
import { db } from "../../lib/firebase.js"
import { toast } from "react-hot-toast"
import { confirmAction } from "../../utils/feedback.jsx"

const notifySuccess = (msg) => toast.success(msg)
const notifyError = (msg) => toast.error(msg)

export default function AdminOpenHouse() {
  const [booths, setBooths] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBoothForm, setShowBoothForm] = useState(false)
  const [editingBoothId, setEditingBoothId] = useState(null)
  const [boothForm, setBoothForm] = useState({ name: "", platforms: ["YouTube"], socialLinks: {}, language: "Thai", description: "", logoUrl: "", themeColor: "#1a5f7a", order: 1, networks: [] })

  // Campus Management State
  const [activeBooth, setActiveBooth] = useState(null)
  const [campuses, setCampuses] = useState([])
  const [showCampusForm, setShowCampusForm] = useState(false)
  const [editingCampusId, setEditingCampusId] = useState(null)
  const [campusForm, setCampusForm] = useState({ name: "", description: "", order: 1 })
  
  // Link Management State
  const [editingLinksFor, setEditingLinksFor] = useState(null) // campus id
  const [linkForm, setLinkForm] = useState({ title: "", url: "" })

  useEffect(() => {
    const q = query(collection(db, "openhouse_booths"), orderBy("order", "asc"))
    const unsub = onSnapshot(q, (snap) => {
      setBooths(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error("Fetch booths error", err)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!activeBooth) return
    const q = query(collection(db, `openhouse_booths/${activeBooth.id}/campuses`), orderBy("order", "asc"))
    const unsub = onSnapshot(q, (snap) => {
      setCampuses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => {
      console.error("Fetch campuses error", err)
    })
    return () => unsub()
  }, [activeBooth])

  const handleSaveBooth = async (e) => {
    e.preventDefault()
    if (!boothForm.name || !boothForm.platforms || boothForm.platforms.length === 0) {
      notifyError("กรุณากรอกชื่อและเลือกอย่างน้อย 1 แพลตฟอร์ม")
      return
    }
    try {
      const data = { ...boothForm, updatedAt: serverTimestamp() }
      if (editingBoothId) {
        await updateDoc(doc(db, "openhouse_booths", editingBoothId), data)
        notifySuccess("บันทึกการแก้ไขแล้ว")
      } else {
        data.createdAt = serverTimestamp()
        await addDoc(collection(db, "openhouse_booths"), data)
        notifySuccess("เพิ่มบูธใหม่แล้ว")
      }
      setShowBoothForm(false)
      setEditingBoothId(null)
      setBoothForm({ name: "", platforms: ["YouTube"], socialLinks: {}, language: "Thai", description: "", logoUrl: "", themeColor: "#1a5f7a", order: 1, networks: [] })
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการบันทึก")
    }
  }

  const handleDeleteBooth = async (id) => {
    const ok = await confirmAction({
      title: "ยืนยันการลบบูธ",
      message: "ต้องการลบบูธและข้อมูลทั้งหมดในบูธนี้ใช่หรือไม่? (ไม่สามารถกู้คืนได้)",
      confirmText: "ลบทิ้ง",
      danger: true
    })
    if (ok) {
      await deleteDoc(doc(db, "openhouse_booths", id))
      // Note: In a real app, we should also delete sub-collections or associated campuses
      notifySuccess("ลบบูธแล้ว")
    }
  }

  const openEditBooth = (b) => {
    setEditingBoothId(b.id)
    const plats = b.platforms || (b.platform ? [b.platform] : ["YouTube"])
    setBoothForm({ name: b.name, platforms: plats, socialLinks: b.socialLinks || {}, language: b.language || "", description: b.description || "", logoUrl: b.logoUrl || "", themeColor: b.themeColor || "#1a5f7a", order: b.order || 1, networks: b.networks || [] })
    setShowBoothForm(true)
  }

  // --- Campus Functions ---
  const handleSaveCampus = async (e) => {
    e.preventDefault()
    if (!campusForm.name) return
    try {
      const data = { ...campusForm, updatedAt: serverTimestamp() }
      if (editingCampusId) {
        await updateDoc(doc(db, `openhouse_booths/${activeBooth.id}/campuses`, editingCampusId), data)
        notifySuccess("บันทึกอาคารแล้ว")
      } else {
        data.links = []
        data.createdAt = serverTimestamp()
        await addDoc(collection(db, `openhouse_booths/${activeBooth.id}/campuses`), data)
        notifySuccess("เพิ่มอาคารใหม่แล้ว")
      }
      setShowCampusForm(false)
      setEditingCampusId(null)
      setCampusForm({ name: "", description: "", order: 1 })
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการบันทึกอาคาร")
    }
  }

  const handleDeleteCampus = async (id) => {
    const ok = await confirmAction({
      title: "ยืนยันการลบอาคาร",
      message: "ต้องการลบอาคารและข้อมูลลิงก์ทั้งหมดข้างในใช่หรือไม่?",
      confirmText: "ลบทิ้ง",
      danger: true
    })
    if (ok) {
      await deleteDoc(doc(db, `openhouse_booths/${activeBooth.id}/campuses`, id))
      notifySuccess("ลบอาคารแล้ว")
    }
  }

  const handleAddLink = async (campusId, currentLinks) => {
    if (!linkForm.title || !linkForm.url) return
    try {
      const newLinks = [...(currentLinks || []), { ...linkForm, id: Date.now().toString() }]
      await updateDoc(doc(db, `openhouse_booths/${activeBooth.id}/campuses`, campusId), {
        links: newLinks,
        updatedAt: serverTimestamp()
      })
      setLinkForm({ title: "", url: "" })
      notifySuccess("เพิ่มลิงก์แล้ว")
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteLink = async (campusId, currentLinks, linkId) => {
    try {
      const newLinks = currentLinks.filter(l => l.id !== linkId)
      await updateDoc(doc(db, `openhouse_booths/${activeBooth.id}/campuses`, campusId), {
        links: newLinks,
        updatedAt: serverTimestamp()
      })
      notifySuccess("ลบลิงก์แล้ว")
    } catch (err) {
      console.error(err)
    }
  }

  if (activeBooth) {
    return (
      <div className="card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setActiveBooth(null)} style={{ padding: "4px 8px" }}>
              <i className="ti ti-arrow-left"></i> กลับ
            </button>
            <i className="ti ti-folder" style={{ color: "var(--teal)" }}></i> จัดการหมวดหมู่: {activeBooth.name}
          </h2>
          <button className="btn btn-teal" onClick={() => { setShowCampusForm(true); setEditingCampusId(null); setCampusForm({ name: "", description: "", order: campuses.length + 1 }); }} style={{ padding: "6px 12px", fontSize: 13 }}>
            + สร้างหมวดหมู่ใหม่
          </button>
        </div>

        {showCampusForm && (
          <form onSubmit={handleSaveCampus} className="card" style={{ background: "var(--bg2)", padding: 20, marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>{editingCampusId ? "แก้ไขหมวดหมู่" : "สร้างหมวดหมู่ใหม่"}</h3>
            <div className="grid2">
              <label>
                <span className="label-text">ชื่อหมวดหมู่ / ซีรีส์ *</span>
                <input required type="text" value={campusForm.name} onChange={e => setCampusForm({...campusForm, name: e.target.value})} placeholder="เช่น หมวดตัฟซีร, เพลย์ลิสต์อัลกุรอาน" />
              </label>
              <label>
                <span className="label-text">ลำดับการแสดงผล</span>
                <input type="number" value={campusForm.order} onChange={e => setCampusForm({...campusForm, order: Number(e.target.value)})} />
              </label>
            </div>
            <label style={{ marginTop: 16, display: "block" }}>
              <span className="label-text">คำอธิบายสั้นๆ (ไม่บังคับ)</span>
              <input type="text" value={campusForm.description} onChange={e => setCampusForm({...campusForm, description: e.target.value})} placeholder="รวบรวมคลิปวิดีโออธิบาย..." />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button type="submit" className="btn btn-teal">บันทึกข้อมูลหมวดหมู่</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowCampusForm(false)}>ยกเลิก</button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {campuses.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>ยังไม่มีหมวดหมู่ย่อยในแหล่งเรียนรู้นี้</div>
          ) : campuses.map(campus => (
            <div key={campus.id} className="card" style={{ padding: 16, background: "var(--bg2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>
                    <i className="ti ti-folder" style={{ marginRight: 8, color: "var(--teal)" }}></i>{campus.name}
                  </h4>
                  {campus.description && <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 4 }}>{campus.description}</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => { setEditingCampusId(campus.id); setCampusForm({ name: campus.name, description: campus.description || "", order: campus.order || 1 }); setShowCampusForm(true); }} style={{ padding: "4px 8px", fontSize: 12 }}>แก้ไข</button>
                  <button className="btn btn-danger" onClick={() => handleDeleteCampus(campus.id)} style={{ padding: "4px 8px", fontSize: 12, background: "none", color: "var(--red)", border: "none" }}>ลบ</button>
                </div>
              </div>

              <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
                <h5 style={{ margin: "0 0 12px 0", fontSize: 13, color: "var(--t2)" }}>เนื้อหา/ลิงก์ภายในหมวดหมู่ ({campus.links?.length || 0})</h5>
                
                {campus.links && campus.links.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {campus.links.map(link => (
                      <div key={link.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg2)", border: "1px solid var(--br)", borderRadius: 6 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{link.title}</div>
                          <a href={link.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--teal)" }}>{link.url}</a>
                        </div>
                        <button className="btn btn-outline" onClick={() => handleDeleteLink(campus.id, campus.links, link.id)} style={{ padding: "2px 6px", fontSize: 12, color: "var(--red)", border: "none" }}>
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {editingLinksFor === campus.id ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label style={{ flex: 1, minWidth: 150 }}>
                      <span className="label-text" style={{ fontSize: 11 }}>ชื่อลิงก์</span>
                      <input type="text" value={linkForm.title} onChange={e => setLinkForm({...linkForm, title: e.target.value})} placeholder="เช่น ซีรีส์ 1" style={{ height: 32, fontSize: 13 }} />
                    </label>
                    <label style={{ flex: 2, minWidth: 200 }}>
                      <span className="label-text" style={{ fontSize: 11 }}>URL (ลิงก์ปลายทาง)</span>
                      <input type="text" value={linkForm.url} onChange={e => setLinkForm({...linkForm, url: e.target.value})} placeholder="https://..." style={{ height: 32, fontSize: 13 }} />
                    </label>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-teal" onClick={() => handleAddLink(campus.id, campus.links)} style={{ height: 32, padding: "0 12px", fontSize: 12 }}>เพิ่ม</button>
                      <button className="btn btn-outline" onClick={() => setEditingLinksFor(null)} style={{ height: 32, padding: "0 12px", fontSize: 12 }}>ปิด</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-outline" onClick={() => { setEditingLinksFor(campus.id); setLinkForm({ title: "", url: "" }); }} style={{ padding: "4px 12px", fontSize: 12, borderStyle: "dashed" }}>
                    + เพิ่มลิงก์ใหม่
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-book-2" style={{ color: "var(--teal)" }}></i> จัดการแหล่งเรียนรู้ (Open House)
        </h2>
        <button className="btn btn-teal" onClick={() => { setShowBoothForm(true); setEditingBoothId(null); setBoothForm({ name: "", platforms: ["YouTube"], socialLinks: {}, language: "Thai", description: "", logoUrl: "", themeColor: "#1a5f7a", order: 1, networks: [] }); }} style={{ padding: "6px 12px", fontSize: 13 }}>
          + เพิ่มแหล่งเรียนรู้ใหม่
        </button>
      </div>

      {showBoothForm && (
        <form onSubmit={handleSaveBooth} className="card" style={{ background: "var(--bg)", padding: 0, marginBottom: 24, overflow: "hidden" }}>
          <div style={{ background: "var(--bg2)", padding: "16px 20px", borderBottom: "1px solid var(--br)", display: "flex", alignItems: "center", gap: 8 }}>
            <i className={`ti ${editingBoothId ? 'ti-edit' : 'ti-plus'}`} style={{ color: "var(--teal)", fontSize: 18 }}></i>
            <h3 style={{ margin: 0, fontSize: 16 }}>{editingBoothId ? "แก้ไขข้อมูล" : "สร้างแหล่งเรียนรู้ / ช่องใหม่"}</h3>
          </div>

          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Section 1: General Info */}
            <div style={{ background: "var(--bg2)", padding: 16, borderRadius: 12, border: "1px solid var(--br)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--teal)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-info-circle"></i> ข้อมูลทั่วไป
              </div>
              <div className="grid2">
                <label>
                  <span className="label-text">ชื่อช่อง / แหล่งเรียนรู้ *</span>
                  <input required type="text" value={boothForm.name} onChange={e => setBoothForm({...boothForm, name: e.target.value})} placeholder="เช่น Salafi Publications" />
                </label>
                <label>
                  <span className="label-text">ภาษาหลัก</span>
                  <select value={boothForm.language} onChange={e => setBoothForm({...boothForm, language: e.target.value})}>
                    <option value="Thai">ภาษาไทย</option>
                    <option value="English">ภาษาอังกฤษ</option>
                    <option value="Arabic">ภาษาอาหรับ</option>
                    <option value="Indonesian">ภาษาอินโด</option>
                    <option value="Malay">ภาษามลายู</option>
                  </select>
                </label>
              </div>
              <label style={{ marginTop: 12, display: "block" }}>
                <span className="label-text">คำอธิบายสั้นๆ เกี่ยวกับช่อง</span>
                <textarea value={boothForm.description} onChange={e => setBoothForm({...boothForm, description: e.target.value})} rows={2} placeholder="จุดเด่นของช่องนี้คืออะไร..."></textarea>
              </label>
            </div>

            {/* Section 2: Platforms & Links */}
            <div style={{ background: "var(--bg2)", padding: 16, borderRadius: 12, border: "1px solid var(--br)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--teal)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-link"></i> แพลตฟอร์มและโซเชียลมีเดีย *
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {["YouTube", "Website", "Facebook", "Telegram", "Podcast", "TikTok", "Instagram", "Other"].map(p => {
                  const isChecked = boothForm.platforms.includes(p)
                  return (
                    <div key={p} style={{ background: "var(--bg)", padding: 12, borderRadius: 8, border: isChecked ? "1px solid var(--teal)" : "1px solid var(--br)", transition: "all 0.2s" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: isChecked ? 8 : 0 }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setBoothForm({...boothForm, platforms: [...boothForm.platforms, p]})
                            } else {
                              const newLinks = {...boothForm.socialLinks}
                              delete newLinks[p]
                              setBoothForm({...boothForm, platforms: boothForm.platforms.filter(plat => plat !== p), socialLinks: newLinks})
                            }
                          }}
                          style={{ margin: 0, accentColor: "var(--teal)", width: 16, height: 16 }}
                        />
                        <span style={{ fontSize: 14, fontWeight: isChecked ? 600 : 400, color: isChecked ? "var(--teal)" : "var(--text)" }}>{p}</span>
                      </label>
                      {isChecked && (
                        <div style={{ paddingLeft: 24 }}>
                          <input 
                            type="text" 
                            placeholder={`https://...`} 
                            value={boothForm.socialLinks[p] || ""}
                            onChange={e => setBoothForm({...boothForm, socialLinks: {...boothForm.socialLinks, [p]: e.target.value}})}
                            style={{ height: 36, fontSize: 13, width: "100%", background: "var(--bg2)" }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Section 3: Branding */}
            <div style={{ background: "var(--bg2)", padding: 16, borderRadius: 12, border: "1px solid var(--br)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--teal)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-palette"></i> การตกแต่ง (Branding)
              </div>
              <div className="grid2">
                <label>
                  <span className="label-text">ลิงก์ภาพ Logo (URL)</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: boothForm.themeColor || "var(--br)", flexShrink: 0, overflow: "hidden", border: "1px solid var(--br)" }}>
                      {boothForm.logoUrl && <img src={boothForm.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                    <input type="text" value={boothForm.logoUrl} onChange={e => setBoothForm({...boothForm, logoUrl: e.target.value})} placeholder="https://..." style={{ flex: 1 }} />
                  </div>
                </label>
                <label>
                  <span className="label-text">สีประจำช่อง (Theme Color)</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="color" value={boothForm.themeColor} onChange={e => setBoothForm({...boothForm, themeColor: e.target.value})} style={{ width: 40, height: 40, padding: 0, border: "none", borderRadius: 8, cursor: "pointer", background: "none" }} />
                    <input type="text" value={boothForm.themeColor} onChange={e => setBoothForm({...boothForm, themeColor: e.target.value})} style={{ flex: 1, textTransform: "uppercase" }} />
                  </div>
                </label>
              </div>
            </div>

            {/* Section 4: Advanced */}
            <div style={{ background: "var(--bg2)", padding: 16, borderRadius: 12, border: "1px solid var(--br)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--teal)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-settings"></i> การตั้งค่าเพิ่มเติม
              </div>
              
              <label>
                <span className="label-text">เครือข่าย / พันธมิตร (เลือกช่องอื่นๆ ที่เป็นเครือข่ายเดียวกัน)</span>
                {booths.filter(b => b.id !== editingBoothId).length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 4, padding: "12px", background: "var(--bg)", borderRadius: 8, border: "1px dashed var(--br)" }}>
                    ยังไม่มีช่องอื่นๆ ในระบบให้เลือก
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginTop: 8 }}>
                    {booths.filter(b => b.id !== editingBoothId).map(b => (
                      <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg)", padding: "8px 12px", borderRadius: 8, border: boothForm.networks.includes(b.id) ? "1px solid var(--teal)" : "1px solid var(--br)", cursor: "pointer", transition: "all 0.2s" }}>
                        <input 
                          type="checkbox"
                          checked={boothForm.networks.includes(b.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setBoothForm({...boothForm, networks: [...boothForm.networks, b.id]})
                            } else {
                              setBoothForm({...boothForm, networks: boothForm.networks.filter(id => id !== b.id)})
                            }
                          }}
                          style={{ margin: 0, accentColor: "var(--teal)", width: 16, height: 16 }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: b.themeColor || "var(--br)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {b.logoUrl ? <img src={b.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <i className="ti ti-photo" style={{ fontSize: 12, color: "#fff" }}></i>}
                          </div>
                          <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: boothForm.networks.includes(b.id) ? 500 : 400 }}>{b.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </label>

              <label style={{ marginTop: 16, display: "block" }}>
                <span className="label-text">ลำดับการแสดงผล</span>
                <input type="number" value={boothForm.order} onChange={e => setBoothForm({...boothForm, order: Number(e.target.value)})} style={{ width: 120 }} />
                <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>ตัวเลขยิ่งน้อยยิ่งอยู่ลำดับแรกๆ</div>
              </label>
            </div>
          </div>

          <div style={{ background: "var(--bg2)", padding: "16px 20px", borderTop: "1px solid var(--br)", display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-outline" onClick={() => setShowBoothForm(false)}>ยกเลิก</button>
            <button type="submit" className="btn btn-teal" style={{ padding: "0 24px" }}>
              <i className="ti ti-device-floppy" style={{ marginRight: 6 }}></i> บันทึกข้อมูล
            </button>
          </div>
        </form>
      )}
      
      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><i className="ti ti-loader-2 spin"></i> กำลังโหลด...</div>
      ) : booths.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>
          ยังไม่มีแหล่งเรียนรู้ในระบบ
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {booths.map(b => (
            <div key={b.id} className="card" style={{ background: "var(--bg2)", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: b.themeColor || "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {b.logoUrl ? (
                    <img src={b.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <i className="ti ti-photo" style={{ color: "#fff" }}></i>
                  )}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 15 }}>{b.name}</h4>
                  <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(b.platforms || (b.platform ? [b.platform] : [])).map(p => (
                      <span key={p} className="badge" style={{ marginRight: 2 }}>{p}</span>
                    ))}
                    {b.language && <span className="badge" style={{ marginLeft: 4 }}>{b.language}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setActiveBooth(b)} style={{ padding: "4px 8px", fontSize: 12 }}>
                  <i className="ti ti-folder" style={{ marginRight: 4 }}></i>จัดการหมวดหมู่เนื้อหา
                </button>
                <button className="btn btn-outline" onClick={() => openEditBooth(b)} style={{ padding: "4px 8px", fontSize: 12 }}>แก้ไข</button>
                <button className="btn btn-danger" onClick={() => handleDeleteBooth(b.id)} style={{ padding: "4px 8px", fontSize: 12, background: "none", color: "var(--red)", border: "none" }}>ลบ</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
