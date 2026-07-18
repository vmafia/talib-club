import React from "react"

export default function DashboardNav({ 
  setView, 
  go, 
  lastRead, 
  onOpenQuran, 
  activeBooksCount = 0, 
  userSavedVersesCount = 0 
}) {
  const navItems = [
    {
      icon: "ti ti-device-desktop",
      label: "ห้องอ่านหนังสือ & สถิติ",
      desc: activeBooksCount > 0 
        ? `กำลังอ่านค้างอยู่ ${activeBooksCount} เล่ม · จับเวลาสะสมไฟและทำภารกิจ` 
        : "จับเวลาสะสม Streak, ทำภารกิจประจำวัน และร้านค้าไอเทม",
      view: "reader",
      colorVar: "var(--teal)",
      bgVar: "var(--teal-bg)",
    },
    {
      icon: "ti ti-book-2",
      label: "อัลกุรอานของฉัน",
      desc: lastRead 
        ? `อ่านค้างไว้: ซูเราะฮ์ ${lastRead.suraName || lastRead.sura} อายะฮ์ ${lastRead.aya}` 
        : "อ่าน แปลไทย ตัฟซีรย่อ และค้นหาคำสำคัญ",
      view: "quran",
      colorVar: "#f97316",
      bgVar: "rgba(249,115,22,0.1)",
    },
    {
      icon: "ti ti-notebook",
      label: "อายะฮ์ที่บันทึกไว้",
      desc: userSavedVersesCount > 0 
        ? `บันทึกข้อคิดไว้แล้ว ${userSavedVersesCount} อายะฮ์` 
        : "ข้อคิดและประโยชน์จากอัลกุรอาน",
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
      icon: "ti ti-crown",
      label: "ตารางอันดับ (Leaderboard)",
      desc: "ดูอันดับการรักษาวินัยการอ่านของสมาชิกยอดเยี่ยม",
      view: "leaderboard",
      colorVar: "#ec4899",
      bgVar: "rgba(236,72,153,0.1)",
    },
    {
      icon: "ti ti-feather",
      label: "สมุดบันทึกข้อคิด (Reflections)",
      desc: "รวบรวมข้อคิดจากการอ่านหนังสือและอายะฮ์อัลกุรอาน พร้อมการ์ดแบ่งปัน",
      view: "reflections",
      colorVar: "#a855f7",
      bgVar: "rgba(168,85,247,0.1)",
    },
    {
      icon: "ti ti-user-circle",
      label: "โปรไฟล์ของฉัน",
      desc: "จัดการข้อมูลบัญชีและรหัสสมาชิก",
      view: "profile",
      colorVar: "#818cf8",
      bgVar: "rgba(129,140,248,0.1)",
    },
    {
      icon: "ti ti-book",
      label: "แจกหนังสือ",
      desc: "ลงทะเบียนรับหนังสือจาก Talib Club",
      view: "books",
      colorVar: "#10b981",
      bgVar: "rgba(16,185,129,0.1)",
    },
    {
      icon: "ti ti-package",
      label: "ตรวจสอบสถานะพัสดุ",
      desc: "ติดตามการจัดส่งหนังสือหรือของรางวัลของคุณ",
      view: "tracking",
      colorVar: "#8b5cf6",
      bgVar: "rgba(139,92,246,0.1)",
    },
  ]

  function handleClick(view) {
    if (view === "quran") {
      if (onOpenQuran) {
        onOpenQuran(lastRead?.sura || 1, lastRead?.aya || null)
      } else {
        go("quran", { sura: 1, ayah: null })
      }
    } else if (view === "reader") {
      go("reader")
    } else if (view === "books") {
      go("books")
    } else if (view === "tracking") {
      go("tracking")
    } else {
      setView(view)
    }
  }

  return (
    <div className="grid3" style={{ gap: 12 }}>
      {navItems.map((item, index) => (
        <button
          key={item.view}
          className="card dashboard-card"
          onClick={() => handleClick(item.view)}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: item.bgVar,
              color: item.colorVar,
              display: "grid",
              placeItems: "center",
              fontSize: 22,
              marginBottom: 4,
            }}
          >
            <i className={item.icon} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
            {item.label}
          </h2>
          <p style={{ fontSize: 12, fontWeight: 300, color: "var(--t2)", lineHeight: 1.4 }}>
            {item.desc}
          </p>
        </button>
      ))}
    </div>
  )
}
