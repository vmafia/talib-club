import React, { useState, useEffect } from "react"
import { doc, getDoc } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { db, storage } from "../lib/firebase.js"
import { useAuth } from "../hooks/useAuth.js"
import toast from "react-hot-toast"

export default function BookRegistration({ go, ctx }) {
  const authState = useAuth()
  const user = authState?.user
  const campaignId = ctx?.campaignId

  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1) // 1 = Form, 2 = Pay, 3 = Success, 0 = Full/Expired/Error
  const [errorMsg, setErrorMsg] = useState("")

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    zipcode: "",
    contact: ""
  })

  // Timer state
  const [expiresAt, setExpiresAt] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)

  // Slip upload
  const [slipFile, setSlipFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    if (!campaignId) {
      setErrorMsg("ไม่พบข้อมูลแคมเปญ")
      setLoading(false)
      return
    }

    const loadData = async () => {
      try {
        const docSnap = await getDoc(doc(db, "book_campaigns", campaignId))
        if (!docSnap.exists()) {
          setErrorMsg("ไม่พบแคมเปญแจกหนังสือนี้")
          return
        }
        const campData = docSnap.data()
        setCampaign(campData)

        if (user) {
          // Pre-fill form
          setFormData(prev => ({
            ...prev,
            name: user.displayName || "",
            phone: user.phone || "" // assuming phone might exist
          }))


        }
      } catch (err) {
        console.error(err)
        setErrorMsg("เกิดข้อผิดพลาดในการโหลดข้อมูล")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [campaignId, user])

  // Countdown timer effect
  useEffect(() => {
    if (step === 2 && expiresAt) {
      const interval = setInterval(() => {
        const now = new Date().getTime()
        const distance = expiresAt.getTime() - now
        if (distance <= 0) {
          clearInterval(interval)
          setStep(0)
          setErrorMsg("หมดเวลาชำระเงิน สิทธิ์ของคุณถูกยกเลิกแล้ว")
        } else {
          setTimeLeft(distance)
        }
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [step, expiresAt])

  const handleReserve = async (e) => {
    e.preventDefault()
    if (!user) return

    // Ensure phone is 10 digits
    const phoneClean = formData.phone.replace(/\D/g, '')
    if (phoneClean.length !== 10) {
      toast.error("กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก")
      return
    }

    setLoading(true)
    try {
      const idToken = await user.getIdToken()
      const response = await fetch("/api/reserve-book-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ campaignId, name: formData.name })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Could not reserve campaign")

      if (data.hold?.status === "completed") {
        setStep(3)
        return
      }

      const expDate = new Date(data.hold?.expiresAt)
      if (Number.isNaN(expDate.getTime())) throw new Error("Invalid reservation expiry")
      setExpiresAt(expDate)
      setStep(2)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error && err.message ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่")
    } finally {
      setLoading(false)
    }
  }

  const handleUploadAndSubmit = async (e) => {
    e.preventDefault()
    if (!slipFile) {
      toast.error("กรุณาแนบสลิปโอนเงิน")
      return
    }

    setUploading(true)
    try {
      // Upload slip
      const ext = slipFile.name.split('.').pop()
      const fileName = `${user.uid}_${campaignId}_${Date.now()}.${ext}`
      const storageRef = ref(storage, `slips/${fileName}`)
      await uploadBytes(storageRef, slipFile)
      const slipUrl = await getDownloadURL(storageRef)

      const idToken = await user.getIdToken()
      const res = await fetch("/api/submit-book-registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          campaignId,
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          zipcode: formData.zipcode,
          contact: formData.contact,
          slipUrl,
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Registration failed (${res.status})`)
      }

      setStep(3)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error && err.message ? err.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูล")
    } finally {
      setUploading(false)
    }
  }

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  if (loading && !campaign) {
    return <div style={{ padding: 40, textAlign: "center" }}><i className="ti ti-loader-2 spin"></i> กำลังโหลด...</div>
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 500, margin: "60px auto", padding: "0 20px" }}>
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 64, height: 64, background: "var(--bg3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--teal)" }}>
            <i className="ti ti-lock" style={{ fontSize: 28 }}></i>
          </div>
          <h2>กรุณาเข้าสู่ระบบ</h2>
          <p style={{ color: "var(--t2)", marginBottom: 24 }}>คุณต้องเข้าสู่ระบบก่อนจึงจะสามารถลงทะเบียนรับ/สั่งซื้อหนังสือได้</p>
          <button className="btn btn-teal" onClick={() => go("auth")} style={{ width: "100%", justifyContent: "center" }}>
            <i className="ti ti-login"></i> ไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
      <button className="btn btn-outline" onClick={() => go("books")} style={{ marginBottom: 24 }}>
        <i className="ti ti-arrow-left"></i> กลับไปหน้ารวมหนังสือ
      </button>

      {campaign && (
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8, color: "var(--teal)" }}>{campaign.title}</h1>
          <div style={{ display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
            <span style={{ color: "var(--amber)" }}><i className="ti ti-ticket"></i> โควตาทั้งหมด {campaign.quota} สิทธิ์</span>
            <span style={{ color: "var(--t2)" }}><i className="ti ti-truck-delivery"></i> ค่าจัดส่ง {campaign.shippingFee > 0 ? `${campaign.shippingFee} บาท` : "ฟรี"}</span>
          </div>
        </div>
      )}

      {step === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center", border: "1px solid var(--red2)" }}>
          <div style={{ width: 64, height: 64, background: "rgba(224,85,85,0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--red)" }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 28 }}></i>
          </div>
          <h2 style={{ color: "var(--red)" }}>ไม่สามารถลงทะเบียนได้</h2>
          <p style={{ color: "var(--t2)" }}>{errorMsg}</p>
          <button className="btn btn-outline" onClick={() => go("books")} style={{ marginTop: 24 }}>กลับ</button>
        </div>
      )}

      {step === 1 && (
        <form className="card" onSubmit={handleReserve} style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--br)" }}>
            <div style={{ width: 32, height: 32, background: "var(--teal)", color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>1</div>
            <h2 style={{ margin: 0 }}>กรอกข้อมูลเพื่อจองสิทธิ์</h2>
          </div>

          <p style={{ color: "var(--t2)", fontSize: 14, marginBottom: 24 }}>
            กรุณากรอกข้อมูลให้ครบถ้วนเพื่อทำการ <strong>ล็อกโควตา</strong> หลังจากกดปุ่มยืนยัน ระบบจะให้เวลาคุณ <strong>{campaign.timeLimit} นาที</strong> ในการโอนเงินและแนบสลิป
          </p>

          <div className="grid2" style={{ gap: 16 }}>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span className="label-text">ชื่อ - นามสกุล *</span>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="นาย ซื่อตรง รักความดี" />
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span className="label-text">เบอร์โทรศัพท์ (10 หลัก) *</span>
              <input type="tel" required pattern="[0-9]{10}" maxLength="10" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} placeholder="0812345678" />
            </label>
          </div>

          <label style={{ display: "block", marginBottom: 16 }}>
            <span className="label-text">ที่อยู่จัดส่งพัสดุ *</span>
            <textarea rows={3} required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด"></textarea>
          </label>

          <div className="grid2" style={{ gap: 16 }}>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span className="label-text">รหัสไปรษณีย์ *</span>
              <input type="text" required pattern="[0-9]{5}" maxLength="5" value={formData.zipcode} onChange={e => setFormData({...formData, zipcode: e.target.value.replace(/\D/g, '')})} placeholder="10110" />
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span className="label-text">ช่องทางติดต่อ (Line ID หรือ ลิงก์เฟสบุ๊ค)</span>
              <input type="text" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} placeholder="เผื่อทีมงานติดต่อกลับกรณีฉุกเฉิน" />
            </label>
          </div>

          <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-teal" disabled={loading}>
              {loading ? "กำลังเช็คโควตา..." : "ยืนยันเพื่อจองสิทธิ์"} <i className="ti ti-lock"></i>
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form className="card" onSubmit={handleUploadAndSubmit} style={{ padding: 32, border: "2px solid var(--teal)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--br)" }}>
            <div style={{ width: 32, height: 32, background: "var(--teal)", color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>2</div>
            <h2 style={{ margin: 0 }}>ชำระเงินและแนบสลิป</h2>
            <div style={{ marginLeft: "auto", background: "var(--bg)", padding: "8px 16px", borderRadius: 20, color: "var(--amber)", fontWeight: "bold", border: "1px solid var(--amber)", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-clock"></i> เหลือเวลา {formatTime(timeLeft)}
            </div>
          </div>

          <div style={{ background: "var(--bg2)", padding: 24, borderRadius: 12, textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 16, color: "var(--t2)", marginBottom: 8 }}>ยอดที่ต้องชำระ</div>
            <div style={{ fontSize: 36, fontWeight: "bold", color: "var(--teal)", marginBottom: 24 }}>{campaign.shippingFee} บาท</div>
            
            <div style={{ display: "inline-block", textAlign: "left", background: "var(--bg)", padding: 20, borderRadius: 12, border: "1px solid var(--br)" }}>
              {campaign.qrCodeUrl && (
                <div style={{ marginBottom: 16, textAlign: "center" }}>
                  <img src={campaign.qrCodeUrl} alt="QR Code" style={{ maxWidth: 200, width: "100%", borderRadius: 8, border: "1px solid var(--br)" }} />
                </div>
              )}
              <div style={{ fontSize: 14, color: "var(--t2)", marginBottom: 4 }}>โอนเงินเข้าบัญชี:</div>
              <div style={{ fontSize: 18, fontWeight: 500, whiteSpace: "pre-wrap" }}>{campaign.bankAccount}</div>
            </div>
          </div>

          <label style={{ display: "block", marginBottom: 24 }}>
            <span className="label-text">แนบหลักฐานการโอนเงิน (สลิป) *</span>
            <input type="file" required accept="image/*" onChange={e => setSlipFile(e.target.files[0])} style={{ width: "100%", padding: 12, background: "var(--bg2)", border: "1px dashed var(--br)", borderRadius: 8 }} />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-teal" disabled={uploading}>
              {uploading ? "กำลังอัปโหลด..." : "ยืนยันการชำระเงิน"} <i className="ti ti-check"></i>
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="card" style={{ padding: 40, textAlign: "center", border: "1px solid var(--teal)" }}>
          <div style={{ width: 80, height: 80, background: "var(--teal-bg)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", color: "var(--teal)" }}>
            <i className="ti ti-circle-check" style={{ fontSize: 40 }}></i>
          </div>
          <h2 style={{ color: "var(--teal)", marginBottom: 16 }}>ลงทะเบียนสำเร็จ!</h2>
          <p style={{ color: "var(--text)", fontSize: 16 }}>ระบบได้รับข้อมูลและการชำระเงินของคุณเรียบร้อยแล้ว</p>
          <p style={{ color: "var(--t2)", marginTop: 8 }}>ทีมงานจะทำการตรวจสอบสลิปและจัดส่งพัสดุให้คุณตามที่อยู่จัดส่ง คุณสามารถตรวจสอบสถานะพัสดุได้ในเมนู Tracking</p>
          <div style={{ marginTop: 32, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-teal" onClick={() => go("tracking-system")} style={{ padding: "12px 24px", fontSize: 16, fontWeight: 600 }}>
              <i className="ti ti-list-search" style={{ marginRight: 8 }}></i> เช็ครายชื่อและสถานะ
            </button>
            <button className="btn btn-outline" onClick={() => go("home")} style={{ padding: "12px 24px", fontSize: 16 }}>
              กลับสู่หน้าหลัก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
