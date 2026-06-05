const STAFF_TOOLS = [
  {
    title: "งานสตาฟ",
    desc: "ส่งงาน ตรวจงาน ติดตามกำหนดลง และดูคิววารสารของทีม",
    icon: "ti-clipboard-check",
    status: "พร้อมใช้งาน",
    page: "staff-work",
  },
  {
    title: "แอพแปลบทความ",
    desc: "กวาดบทความจาก abuiyaad.com เข้าฐานข้อมูล และติดตามสถานะงานแปลของทีม",
    icon: "ti-language",
    status: "พร้อมสแกน/ติดตาม",
    page: "staff-translation",
  },
]

export default function StaffDashboard({ authState, go }) {
  if (!authState.isStaff) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: "44px auto", padding: 24, textAlign: "center" }}>
        <i className="ti ti-lock" style={{ fontSize: 34, color: "var(--t3)" }}></i>
        <h1 style={{ fontSize: 24, marginTop: 12 }}>พื้นที่นี้สำหรับสตาฟ</h1>
        <p style={{ marginTop: 8 }}>บัญชีของคุณยังเป็นสมาชิกทั่วไป หากต้องการสิทธิ์สตาฟ ให้ผู้ดูแลเพิ่ม role เป็น staff ใน Firestore</p>
        <button className="btn btn-main" style={{ marginTop: 18 }} onClick={() => go(authState.user ? "member" : "auth")}>กลับ</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <span className="badge badge-teal">Staff</span>
          <h1 style={{ marginTop: 10, fontSize: 28 }}>Staff Workspace</h1>
          <p style={{ marginTop: 6 }}>จัดการเนื้อหา ตรวจงาน และใช้เครื่องมือทำงานของทีม Talib Club</p>
        </div>
        <button className="btn btn-outline" onClick={authState.logout}>
          <i className="ti ti-logout" style={{ marginRight: 6 }}></i>ออกจากระบบ
        </button>
      </div>

      <div className="grid3">
        <ActionCard icon="ti-file-text" title="จัดการเนื้อหา" text="เพิ่ม/แก้บทความ หนังสือ มีเดีย อุลามาอฺ และข้อมูลเว็บ" onClick={() => go("admin")} />
        <ActionCard icon="ti-package" title="Tracking" text="ตรวจสอบและจัดการข้อมูลการจัดส่ง" onClick={() => go("admin", { tab: "tracking" })} />
        <ActionCard icon="ti-users" title="สมาชิก" text="ดูแลสมาชิก สิทธิ์ผู้ใช้งาน และตรวจสอบสถิติการเรียนรู้สะสม" onClick={() => go("staff-members")} />
      </div>

      <h2 style={{ marginTop: 28, marginBottom: 12 }}>เครื่องมือของสตาฟ</h2>
      <div className="grid2 staff-tool-grid">
        {STAFF_TOOLS.map(tool => (
          <button key={tool.title} className="card" onClick={() => tool.page && go(tool.page)} style={{
            padding: 18,
            textAlign: "left",
            cursor: tool.page ? "pointer" : "default",
            color: "var(--text)",
            fontFamily: "'Prompt',sans-serif",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <i className={`ti ${tool.icon}`} style={{ fontSize: 24, color: "var(--teal)" }}></i>
              <span className="badge badge-acc">{tool.status}</span>
            </div>
            <h2 style={{ marginTop: 14 }}>{tool.title}</h2>
            <p style={{ marginTop: 8 }}>{tool.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function ActionCard({ icon, title, text, onClick, disabled }) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} className="card" style={{
      padding: 18,
      minHeight: 160,
      textAlign: "left",
      cursor: onClick && !disabled ? "pointer" : "default",
      opacity: disabled ? 0.65 : 1,
      color: "var(--text)",
      fontFamily: "'Prompt',sans-serif",
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 24, color: "var(--teal)" }}></i>
      <h2 style={{ marginTop: 14 }}>{title}</h2>
      <p style={{ marginTop: 8 }}>{text}</p>
    </button>
  )
}
