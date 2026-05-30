import React from "react"
import { toast } from "react-hot-toast"

export default function Donation() {
  // ข้อมูลบัญชีธนาคารจากโปสเตอร์
  const bankAccounts = [
    {
      id: 1,
      bankName: "ธนาคารไทยพาณิชย์ (SCB)",
      accountName: "นายสอบรีย์ บิลังโหลด",
      accountNumber: "704-287501-5",
      tag: "สมทบทุน",
      logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Siam_Commercial_Bank_Logo.svg/256px-Siam_Commercial_Bank_Logo.svg.png" 
    }
  ]

  // ฟังก์ชันกดคัดลอกเลขบัญชี
  const handleCopy = (number) => {
    navigator.clipboard.writeText(number.replace(/-/g, ""))
    toast.success("คัดลอกเลขบัญชีเรียบร้อยแล้ว", {
      icon: '✅',
      style: {
        background: '#e0f2f1',
        color: '#047857',
        border: '1px solid #10b981'
      },
    })
  }

  return (
    <div style={{ maxWidth: 1000, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, color: "var(--teal)", marginBottom: 8 }}>ร่วมสมทบทุน</h1>
        <p style={{ color: "#666", fontSize: 16 }}>เป็นส่วนหนึ่งในการทำงานดะวะฮฺของกลุ่มฏอลิบ</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 30 }}>
        
        {/* ฝั่งซ้าย: บัญชีธนาคาร และ วัตถุประสงค์ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* Card บัญชีธนาคาร */}
          {bankAccounts.map((acc) => (
            <div key={acc.id} style={{ 
              border: "1px solid #bbf7d0", 
              borderRadius: 12, 
              padding: 20, 
              background: "#f0fdf4",
              display: "flex",
              alignItems: "flex-start",
              gap: 16
            }}>
              <img src={acc.logo} alt={acc.bankName} style={{ width: 50, height: 50, objectFit: "contain", background: "#fff", padding: 4, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 16, color: "#1f2937" }}>{acc.bankName}</h3>
                  <span style={{ fontSize: 12, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 12 }}>{acc.tag}</span>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, fontSize: 14, marginTop: 12 }}>
                  <span style={{ color: "#6b7280" }}>ชื่อบัญชี:</span>
                  <strong style={{ color: "#1f2937" }}>{acc.accountName}</strong>
                  
                  <span style={{ color: "#6b7280", alignSelf: "center" }}>เลขบัญชี:</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ fontSize: 16, color: "#1f2937" }}>{acc.accountNumber}</strong>
                    <button 
                      onClick={() => handleCopy(acc.accountNumber)}
                      style={{ 
                        background: "none", border: "none", color: "#059669", cursor: "pointer", 
                        display: "flex", alignItems: "center", gap: 4, fontSize: 13, padding: 0
                      }}
                    >
                      <i className="ti ti-copy"></i> คัดลอก
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Card วัตถุประสงค์ (ดึงจากโปสเตอร์) */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, background: "#fff" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: "#1f2937" }}>
              เงินบริจาคจะถูกนำไปใช้ในการ:
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#4b5563", fontSize: 14, lineHeight: 1.8 }}>
              <li>แปลและแจกหนังสือ</li>
              <li>แจกรูปเล่มวารสาร</li>
              <li>จัดทำวารสารออนไลน์รายเดือน</li>
              <li>ผลิตเนื้อหาออนไลน์</li>
              <li>พัฒนากลุ่มและอุปกรณ์สำหรับงานดะวะฮฺ</li>
              <li>และอื่นๆ</li>
            </ul>
          </div>

        </div>

        {/* ฝั่งขวา: ขั้นตอนการบริจาคและช่องทางติดตาม */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, background: "#fff", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: 18, color: "#1f2937", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-check" style={{ color: "#059669" }}></i> วิธีการบริจาค
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <StepItem number="1" title="โอนเงินผ่านแอปพลิเคชันธนาคาร" desc="คัดลอกเลขบัญชี SCB ด้านซ้ายเพื่อทำการโอนเงินร่วมสมทบทุน" />
              <StepItem number="2" title="สนับสนุนการทำงานของกลุ่ม" desc="ญะซากุมุลลอฮุค็อยร็อน (ขออัลลอฮฺทรงตอบแทนความดีงามแก่ท่าน) สำหรับการมีส่วนร่วมในงานดะวะฮฺ" />
            </div>
          </div>

          {/* Card ช่องทางติดตามผลงาน */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, background: "#f8fafc" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 15, color: "#1f2937" }}>
              ติดตามผลงานของเราได้ตามช่องทาง
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 20, color: "#334155" }}>
              <i className="ti ti-brand-facebook"></i>
              <i className="ti ti-brand-instagram"></i>
              <i className="ti ti-brand-tiktok"></i>
              <i className="ti ti-brand-youtube"></i>
              <i className="ti ti-brand-spotify"></i>
              <span style={{ fontSize: 16, fontWeight: "bold", marginLeft: 4, color: "#1f2937" }}>Talib Club</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}

// Component ย่อยสำหรับแสดงตัวเลขขั้นตอน
function StepItem({ number, title, desc }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ 
        width: 28, height: 28, borderRadius: "50%", background: "#047857", color: "#fff", 
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: "bold", flexShrink: 0 
      }}>
        {number}
      </div>
      <div>
        <h4 style={{ margin: "0 0 4px 0", fontSize: 15, color: "#1f2937" }}>{title}</h4>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{desc}</p>
      </div>
    </div>
  )
}