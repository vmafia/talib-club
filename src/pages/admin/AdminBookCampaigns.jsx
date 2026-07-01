import React, { useState, useEffect } from "react"
import { collection, query, orderBy, getDocs, doc, setDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { db, storage } from "../../lib/firebase.js"

export default function AdminBookCampaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)

  // Form State
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    quota: 100,
    timeLimit: 2,
    shippingFee: 0,
    shippingFee: 0,
    bankAccount: "",
    qrCodeUrl: "",
    status: "active",
    items: [] // { name, imageUrl }
  })

  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, "book_campaigns"), orderBy("createdAt", "desc"))
      const snap = await getDocs(q)
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const handleOpenForm = (campaign = null) => {
    if (campaign) {
      setEditingId(campaign.id)
      setFormData({
        title: campaign.title || "",
        description: campaign.description || "",
        quota: campaign.quota || 100,
        timeLimit: campaign.timeLimit || 2,
        shippingFee: campaign.shippingFee || 0,
        bankAccount: campaign.bankAccount || "",
        qrCodeUrl: campaign.qrCodeUrl || "",
        status: campaign.status || "active",
        items: campaign.items || []
      })
    } else {
      setEditingId(null)
      setFormData({
        title: "",
        description: "",
        quota: 100,
        timeLimit: 2,
        shippingFee: 0,
        bankAccount: "",
        qrCodeUrl: "",
        status: "active",
        items: []
      })
    }
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await updateDoc(doc(db, "book_campaigns", editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        })
      } else {
        const newRef = doc(collection(db, "book_campaigns"))
        await setDoc(newRef, {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      }
      setShowForm(false)
      fetchCampaigns()
      alert("บันทึกข้อมูลเรียบร้อย")
    } catch (err) {
      console.error(err)
      alert("เกิดข้อผิดพลาดในการบันทึก")
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันการลบแคมเปญนี้? ข้อมูลการลงทะเบียนที่ผูกอยู่จะยังคงอยู่ในระบบแต่จะไม่แสดงผลหน้าเว็บ")) return
    try {
      await deleteDoc(doc(db, "book_campaigns", id))
      fetchCampaigns()
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการลบ")
    }
  }

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { name: "", imageUrl: "" }]
    }))
  }

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items]
    newItems[index][field] = value
    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const removeItem = (index) => {
    const newItems = [...formData.items]
    newItems.splice(index, 1)
    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const [uploadingImage, setUploadingImage] = useState(false)

  const handleImageUpload = async (file, onComplete) => {
    if (!file) return
    setUploadingImage(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `campaign_images/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`
      const storageRef = ref(storage, fileName)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      onComplete(url)
    } catch (err) {
      console.error(err)
      alert("เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ")
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2><i className="ti ti-book" style={{ color: "var(--teal)", marginRight: 8 }}></i> ระบบแจก/ขายหนังสือ (Campaigns)</h2>
          <p style={{ marginTop: 8 }}>จัดการแคมเปญแจกหนังสือ หรือขายหนังสือ พร้อมระบบจองโควตาแบบเรียลไทม์</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn btn-outline" href="/books" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <i className="ti ti-external-link" style={{ marginRight: 6 }}></i>หน้าเว็บผู้ใช้ (ไว้แชร์)
          </a>
          <button className="btn btn-teal" onClick={() => handleOpenForm()}>
            <i className="ti ti-plus"></i> สร้างแคมเปญใหม่
          </button>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSave} style={{ marginBottom: 24, padding: 24, background: "var(--bg2)" }}>
          <h3>{editingId ? "แก้ไขแคมเปญ" : "สร้างแคมเปญใหม่"}</h3>
          
          <div className="grid2" style={{ marginTop: 16 }}>
            <label>
              <span className="label-text">ชื่อแคมเปญ / หัวข้อ *</span>
              <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="เช่น ลงทะเบียนรับตัวเล่มวารสาร" />
            </label>
            <label>
              <span className="label-text">สถานะแคมเปญ</span>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="active">เปิดรับลงทะเบียน (Active)</option>
                <option value="closed">ปิดรับลงทะเบียน (Closed)</option>
              </select>
            </label>
          </div>

          <label style={{ display: "block", marginTop: 16 }}>
            <span className="label-text">คำอธิบายแคมเปญ (รองรับข้อความยาว)</span>
            <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="เงื่อนไขการรับหนังสือ, รายละเอียดค่าส่ง..."></textarea>
          </label>

          <div className="grid2" style={{ marginTop: 16 }}>
            <label>
              <span className="label-text">โควตาทั้งหมด (จำนวนเล่ม/สิทธิ์) *</span>
              <input type="number" required min="1" value={formData.quota} onChange={e => setFormData({...formData, quota: Number(e.target.value)})} />
            </label>
            <label>
              <span className="label-text">เวลาจองสิทธิ์ก่อนตัดโควตา (นาที) *</span>
              <input type="number" required min="1" max="60" value={formData.timeLimit} onChange={e => setFormData({...formData, timeLimit: Number(e.target.value)})} />
              <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>เวลาที่ระบบจะล็อกโควตาให้ผู้ใช้เข้าไปโอนเงิน</div>
            </label>
            <label>
              <span className="label-text">ค่าจัดส่ง / ค่าดำเนินการ (บาท) *</span>
              <input type="number" required min="0" value={formData.shippingFee} onChange={e => setFormData({...formData, shippingFee: Number(e.target.value)})} />
              <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>ใส่ 0 ถ้าฟรีทั้งหมด</div>
            </label>
            <label>
              <span className="label-text">ข้อมูลบัญชีธนาคาร (สำหรับโอนเงิน)</span>
              <textarea rows={2} value={formData.bankAccount} onChange={e => setFormData({...formData, bankAccount: e.target.value})} placeholder="กสิกรไทย 123-4-56789-0 ชื่อบัญชี นายเอบีซี"></textarea>
            </label>
            <label>
              <span className="label-text">รูปรหัสคิวอาร์โค้ด (QR Code) (URL หรือ อัปโหลด)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" value={formData.qrCodeUrl} onChange={e => setFormData({...formData, qrCodeUrl: e.target.value})} placeholder="https://..." style={{ flex: 1 }} />
                <label className="btn btn-outline" style={{ cursor: "pointer", padding: "6px 12px", background: "var(--bg)" }}>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleImageUpload(e.target.files[0], url => setFormData({...formData, qrCodeUrl: url}))} />
                  <i className="ti ti-upload"></i> อัปโหลด
                </label>
              </div>
            </label>
          </div>

          {/* Dynamic Books List */}
          <div style={{ marginTop: 24, padding: 16, background: "var(--bg)", border: "1px solid var(--br)", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h4 style={{ margin: 0 }}><i className="ti ti-books"></i> รายการหนังสือที่จะได้รับ (โชว์ในฟอร์ม)</h4>
              <button type="button" className="btn btn-outline" onClick={addItem} style={{ padding: "4px 12px", fontSize: 13 }}>
                <i className="ti ti-plus"></i> เพิ่มหนังสือ
              </button>
            </div>
            
            {formData.items.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--t3)", textAlign: "center", padding: 20 }}>ยังไม่มีหนังสือในรายการ กดเพิ่มหนังสือเพื่อแสดงหน้าปกและชื่อเรื่องให้ผู้ใช้เห็น</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {formData.items.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "var(--bg2)", padding: 12, borderRadius: 8, border: "1px solid var(--br)" }}>
                    <div style={{ width: 60, height: 80, background: "var(--bg)", borderRadius: 4, overflow: "hidden", flexShrink: 0, border: "1px solid var(--br)" }}>
                      {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}><i className="ti ti-photo"></i></div>}
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <input type="text" placeholder="ชื่อหนังสือ / คำอธิบายสั้นๆ" value={item.name} onChange={e => updateItem(idx, "name", e.target.value)} required style={{ padding: "6px 10px", fontSize: 13 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" placeholder="ลิงก์รูปภาพหน้าปก (URL)" value={item.imageUrl} onChange={e => updateItem(idx, "imageUrl", e.target.value)} style={{ padding: "6px 10px", fontSize: 13, flex: 1 }} />
                        <label className="btn btn-outline" style={{ cursor: "pointer", padding: "4px 8px", background: "var(--bg)" }}>
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleImageUpload(e.target.files[0], url => updateItem(idx, "imageUrl", url))} />
                          <i className="ti ti-upload"></i> อัปโหลด
                        </label>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeItem(idx)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: 4 }}>
                      <i className="ti ti-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>ยกเลิก</button>
            <button type="submit" className="btn btn-teal">บันทึกแคมเปญ</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><i className="ti ti-loader-2 spin"></i> กำลังโหลด...</div>
      ) : campaigns.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>
          ยังไม่มีแคมเปญแจกหนังสือ
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {campaigns.map(c => (
            <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{c.title}</h3>
                  <span className="badge" style={{ background: c.status === "active" ? "var(--teal-bg)" : "var(--bg3)", color: c.status === "active" ? "var(--teal)" : "var(--t2)" }}>
                    {c.status === "active" ? "เปิดรับลงทะเบียน" : "ปิดแล้ว"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--t2)" }}>
                  โควตา: {c.quota} สิทธิ์ | เวลาโอน: {c.timeLimit} นาที | หนังสือ: {c.items?.length || 0} เล่ม
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => alert("ระบบดูรายชื่อจะตามมาใน Phase 2")} style={{ padding: "6px 12px", fontSize: 13 }}>
                  <i className="ti ti-users" style={{ marginRight: 6 }}></i> ดูรายชื่อ
                </button>
                <button className="btn btn-outline" onClick={() => handleOpenForm(c)} style={{ padding: "6px 12px", fontSize: 13 }}>
                  แก้ไข
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(c.id)} style={{ background: "none", border: "none", color: "var(--red)", padding: "6px 12px", fontSize: 13 }}>
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
