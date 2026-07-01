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
  const [boothForm, setBoothForm] = useState({ name: "", platforms: ["YouTube"], language: "Thai", description: "", logoUrl: "", themeColor: "#1a5f7a", order: 1, networks: [] })

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
      setBoothForm({ name: "", platforms: ["YouTube"], language: "Thai", description: "", logoUrl: "", themeColor: "#1a5f7a", order: 1, networks: [] })
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
    setBoothForm({ name: b.name, platforms: plats, language: b.language || "", description: b.description || "", logoUrl: b.logoUrl || "", themeColor: b.themeColor || "#1a5f7a", order: b.order || 1, networks: b.networks || [] })
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
            <i className="ti ti-building" style={{ color: "var(--teal)" }}></i> จัดการอาคาร: {activeBooth.name}
          </h2>
          <button className="btn btn-teal" onClick={() => { setShowCampusForm(true); setEditingCampusId(null); setCampusForm({ name: "", description: "", order: campuses.length + 1 }); }} style={{ padding: "6px 12px", fontSize: 13 }}>
            + สร้างอาคาร/คณะใหม่
          </button>
        </div>

        {showCampusForm && (
          <form onSubmit={handleSaveCampus} className="card" style={{ background: "var(--bg2)", padding: 20, marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>{editingCampusId ? "แก้ไขอาคาร" : "สร้างอาคารใหม่"}</h3>
            <div className="grid2">
              <label>
                <span className="label-text">ชื่ออาคาร / คณะ *</span>
                <input required type="text" value={campusForm.name} onChange={e => setCampusForm({...campusForm, name: e.target.value})} placeholder="เช่น คณะตัฟซีร, หมวดอัลกุรอาน" />
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
              <button type="submit" className="btn btn-teal">บันทึกข้อมูลอาคาร</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowCampusForm(false)}>ยกเลิก</button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {campuses.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>ยังไม่มีอาคารในบูธนี้</div>
          ) : campuses.map(campus => (
            <div key={campus.id} className="card" style={{ padding: 16, background: "var(--bg2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>
                    <i className="ti ti-books" style={{ marginRight: 8, color: "var(--teal)" }}></i>{campus.name}
                  </h4>
                  {campus.description && <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 4 }}>{campus.description}</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => { setEditingCampusId(campus.id); setCampusForm({ name: campus.name, description: campus.description || "", order: campus.order || 1 }); setShowCampusForm(true); }} style={{ padding: "4px 8px", fontSize: 12 }}>แก้ไข</button>
                  <button className="btn btn-danger" onClick={() => handleDeleteCampus(campus.id)} style={{ padding: "4px 8px", fontSize: 12, background: "none", color: "var(--red)", border: "none" }}>ลบ</button>
                </div>
              </div>

              <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
                <h5 style={{ margin: "0 0 12px 0", fontSize: 13, color: "var(--t2)" }}>เนื้อหา/ลิงก์ภายในอาคาร ({campus.links?.length || 0})</h5>
                
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
          <i className="ti ti-map" style={{ color: "var(--teal)" }}></i> ระบบนิทรรศการ (Open House)
        </h2>
        <button className="btn btn-teal" onClick={() => { setShowBoothForm(true); setEditingBoothId(null); setBoothForm({ name: "", platform: "YouTube", language: "Thai", description: "", logoUrl: "", themeColor: "#1a5f7a", order: 1 }); }} style={{ padding: "6px 12px", fontSize: 13 }}>
          + เพิ่มบูธใหม่
        </button>
      </div>

      {showBoothForm && (
        <form onSubmit={handleSaveBooth} className="card" style={{ background: "var(--bg2)", padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>{editingBoothId ? "แก้ไขบูธ" : "สร้างบูธใหม่"}</h3>
          <div className="grid2">
            <label>
              <span className="label-text">ชื่อบูธ / ชื่อช่อง *</span>
              <input required type="text" value={boothForm.name} onChange={e => setBoothForm({...boothForm, name: e.target.value})} placeholder="เช่น Salafi Publications" />
            </label>
            <label>
              <span className="label-text">แพลตฟอร์ม (เลือกได้หลายอัน) *</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                {["YouTube", "Website", "Facebook", "Telegram", "Podcast", "TikTok", "Instagram", "Other"].map(p => (
                  <label key={p} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "var(--bg)", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--br)" }}>
                    <input 
                      type="checkbox" 
                      checked={boothForm.platforms.includes(p)}
                      onChange={e => {
                        if (e.target.checked) {
                          setBoothForm({...boothForm, platforms: [...boothForm.platforms, p]})
                        } else {
                          setBoothForm({...boothForm, platforms: boothForm.platforms.filter(plat => plat !== p)})
                        }
                      }}
                      style={{ margin: 0, accentColor: "var(--teal)" }}
                    />
                    <span style={{ fontSize: 13 }}>{p}</span>
                  </label>
                ))}
              </div>
            </label>
            <label>
              <span className="label-text">ภาษา</span>
              <select value={boothForm.language} onChange={e => setBoothForm({...boothForm, language: e.target.value})}>
                <option value="Thai">ภาษาไทย</option>
                <option value="English">ภาษาอังกฤษ</option>
                <option value="Arabic">ภาษาอาหรับ</option>
                <option value="Indonesian">ภาษาอินโด</option>
                <option value="Malay">ภาษามลายู</option>
              </select>
            </label>
            <label>
              <span className="label-text">ลิงก์ Logo (URL)</span>
              <input type="text" value={boothForm.logoUrl} onChange={e => setBoothForm({...boothForm, logoUrl: e.target.value})} placeholder="https://..." />
            </label>
            <label>
              <span className="label-text">สีประจำบูธ (Theme Color)</span>
              <input type="color" value={boothForm.themeColor} onChange={e => setBoothForm({...boothForm, themeColor: e.target.value})} style={{ width: "100%", height: 42, padding: 0, border: "none" }} />
            </label>
            <label>
              <span className="label-text">ลำดับการแสดงผล</span>
              <input type="number" value={boothForm.order} onChange={e => setBoothForm({...boothForm, order: Number(e.target.value)})} />
            </label>
          </div>
          <label style={{ marginTop: 16, display: "block" }}>
            <span className="label-text">คำอธิบายสั้นๆ เกี่ยวกับช่อง</span>
            <textarea value={boothForm.description} onChange={e => setBoothForm({...boothForm, description: e.target.value})} rows={2} placeholder="จุดเด่นของช่องนี้คืออะไร..."></textarea>
          </label>
          
          <label style={{ marginTop: 16, display: "block" }}>
            <span className="label-text">เครือข่าย / พันธมิตร (เลือกช่องอื่นๆ ที่เป็นเครือข่ายเดียวกัน)</span>
            {booths.filter(b => b.id !== editingBoothId).length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 4 }}>ยังไม่มีช่องอื่นๆ ในระบบให้เลือก</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginTop: 8 }}>
                {booths.filter(b => b.id !== editingBoothId).map(b => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--br)", cursor: "pointer" }}>
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
                      style={{ margin: 0, accentColor: "var(--teal)" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: b.themeColor, flexShrink: 0, overflow: "hidden" }}>
                        {b.logoUrl && <img src={b.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button type="submit" className="btn btn-teal">บันทึกข้อมูลบูธ</button>
            <button type="button" className="btn btn-outline" onClick={() => setShowBoothForm(false)}>ยกเลิก</button>
          </div>
        </form>
      )}
      
      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><i className="ti ti-loader-2 spin"></i> กำลังโหลด...</div>
      ) : booths.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>
          ยังไม่มีบูธในระบบ
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
                  <i className="ti ti-building" style={{ marginRight: 4 }}></i>จัดการอาคาร (หมวดหมู่)
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
