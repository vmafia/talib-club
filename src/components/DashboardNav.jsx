import React from "react"

const navItems = [
  {
    icon: "ti ti-device-desktop",
    label: "ห้องอ่านหนังสือ & สถิติ",
    desc: "จับเวลาสะสม Streak, ทำภารกิจประจำวัน และร้านค้าไอเทม",
    view: "reader",
    colorVar: "var(--teal)",
    bgVar: "var(--teal-bg)",
  },
  {
    icon: "ti ti-book-2",
    label: "อัลกุรอานของฉัน",
    desc: "อ่าน แปลไทย ตัฟซีรย่อ และค้นหาคำสำคัญ",
    view: "quran",
    colorVar: "#f97316",
    bgVar: "rgba(249,115,22,0.1)",
  },
  {
    icon: "ti ti-notebook",
    label: "อายะฮ์ที่บันทึกไว้",
    desc: "ข้อคิดและประโยชน์จากอัลกุรอาน",
    view: "saved-verses",
    colorVar: "#60a5fa",
    bgVar: "rgba(96,165,250,0.1)",
  },
  {
    icon: "ti ti-bookmark",
    label: "บทความที่บันทึกไว้",
    desc: "บทความที่กดบันทึกไว้เพื่ออ่านภายหลัง",
    view: "saved-articles",
    colorVar: "#f59e0b",
    bgVar: "rgba(245,158,11,0.1)",
  },
  {
    icon: "ti ti-user-circle",
    label: "โปรไฟล์ของฉัน",
    desc: "จัดการข้อมูลบัญชีและรหัสสมาชิก",
    view: "profile",
    colorVar: "#818cf8",
    bgVar: "rgba(129,140,248,0.1)",
  },
]

export default function DashboardNav({ setView, go }) {
  function handleClick(view) {
    if (view === "quran") {
      go("quran", { sura: 1, ayah: null })
    } else if (view === "reader") {
      go("reader")
    } else {
      setView(view)
    }
  }

  return (
    <div className="dashboard-nav-grid">
      {navItems.map((item) => (
        <button
          key={item.view}
          className="dashboard-nav-item"
          onClick={() => handleClick(item.view)}
        >
          <div
            className="dashboard-nav-icon"
            style={{ background: item.bgVar, color: item.colorVar }}
          >
            <i className={item.icon} />
          </div>
          <div className="dashboard-nav-text">
            <span className="dashboard-nav-label">{item.label}</span>
            <span className="dashboard-nav-desc">{item.desc}</span>
          </div>
          <i className="ti ti-chevron-right dashboard-nav-arrow" />
        </button>
      ))}
    </div>
  )
}
