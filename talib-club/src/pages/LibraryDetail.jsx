import { useEffect } from "react"
import toast from "react-hot-toast"

// ฟังก์ชันดึงรูปปก Google Drive
function getDirectUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`
  }
  return url
}

// ฟังก์ชันสร้างลิงก์ดาวน์โหลด
function getDownloadUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`
  }
  return url
}

// ฟังก์ชันแปลงลิงก์ Drive ให้เป็นโหมด Preview สำหรับฝัง iframe
function getPreviewUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`
  }
  return url
}

export default function LibraryDetail({ item, go }) {
  useEffect(() => {
    // ถ้ารีเฟรชหน้าแล้วข้อมูลหาย ให้กลับไปหน้าห้องสมุดหลัก
    if (!item) go("library")
  }, [item, go])

  if (!item) return null

  // จำลองตัวเลขสถิติ (Mock Data) เนื่องจากระบบยังไม่มีฐานข้อมูลนับยอดจริง
  // สามารถลบหรือแก้ให้เป็นค่าว่างได้ถ้าไม่ต้องการให้สุ่ม
  const mockViews = Math.floor(Math.random() * 3000) + 500;
  const mockDownloads = Math.floor(mockViews * 0.4);

  const handleShare = () => {
    // คัดลอกลิงก์หน้าปัจจุบัน
    navigator.clipboard.writeText(window.location.href)
    toast.success("คัดลอกลิงก์เรียบร้อยแล้ว สามารถนำไปแชร์ได้เลย!")
  }

  return (
    <div className="article-page" style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 40, width: "100%" }}>
      {/* ปุ่มย้อนกลับ */}
      <button 
        onClick={() => go("library")}
        className="sec-link" 
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer" }}
      >
        <i className="ti ti-arrow-left"></i> กลับห้องสมุด
      </button>

      {/* หัวข้อและสถิติ */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, marginBottom: 16, lineHeight: 1.4, wordBreak: "break-word" }}>{item.title}</h1>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 16, color: "var(--t3)", fontSize: 12 }}>
          <span title="ผู้เข้าชม"><i className="ti ti-eye" style={{ marginRight: 4 }}></i>{mockViews.toLocaleString()}</span>
          <span title="ดาวน์โหลด"><i className="ti ti-download" style={{ marginRight: 4 }}></i>{mockDownloads.toLocaleString()}</span>
          <span title="ปีที่พิมพ์"><i className="ti ti-calendar" style={{ marginRight: 4 }}></i>ปี {item.year}</span>
        </div>
      </div>

      {/* รูปปกขนาดใหญ่ */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
        {item.coverUrl ? (
          <img 
            src={getDirectUrl(item.coverUrl)} 
            alt={item.title} 
            style={{ maxWidth: 320, width: "100%", borderRadius: 12, boxShadow: "0 14px 30px rgba(0,0,0,0.15)", objectFit: "cover", border: ".5px solid var(--br2)" }} 
          />
        ) : (
          <div style={{ width: 280, aspectRatio: "3/4", background: "var(--acc2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", border: ".5px solid var(--br2)" }}>
            <i className={`ti ${item.type === "วารสาร" ? "ti-news" : item.type === "PDF" ? "ti-file-text" : "ti-book"}`} style={{ fontSize: 64, color: "var(--acc)" }}></i>
          </div>
        )}
      </div>

      {/* กล่องข้อมูลและปุ่ม Action */}
      <div className="card" style={{ padding: 24, marginBottom: 32, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <span className="tag tag-acc">{item.type}</span>
          {item.category && <span className="tag tag-teal">{item.category}</span>}
          {item.source && <span className="tag" style={{ background: "var(--bg2)", color: "var(--t2)" }}>{item.source}</span>}
        </div>

        {item.author && (
          <div style={{ fontSize: 15, color: "var(--teal)", marginBottom: 14, fontWeight: 500 }}>
            <i className="ti ti-pencil" style={{ marginRight: 6 }}></i>{item.author}
          </div>
        )}

        <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", marginBottom: 24, fontWeight: 300 }}>
          {item.desc || "ไม่มีคำอธิบายเพิ่มเติม"}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a 
            href={getDownloadUrl(item.fileUrl)} 
            target="_blank" 
            rel="noreferrer" 
            className="btn btn-teal" 
            style={{ flex: 1, minWidth: 160, textAlign: "center", textDecoration: "none", pointerEvents: item.fileUrl ? "auto" : "none", opacity: item.fileUrl ? 1 : 0.5 }}
          >
            <i className="ti ti-download" style={{ marginRight: 6 }}></i>ดาวน์โหลดไฟล์
          </a>
          <button onClick={handleShare} className="btn btn-outline" style={{ flex: 1, minWidth: 160 }}>
            <i className="ti ti-share" style={{ marginRight: 6 }}></i>แชร์เนื้อหานี้
          </button>
        </div>
      </div>

      {/* หน้าต่าง Preview ไฟล์ (ฝัง iframe) */}
      {item.fileUrl && (
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-device-desktop" style={{ color: "var(--t2)" }}></i> ตัวอย่างเนื้อหา (Preview)
          </h3>
          <div style={{ borderRadius: 16, overflow: "hidden", border: ".5px solid var(--br2)", height: "70vh", minHeight: 500, background: "var(--bg2)" }}>
            <iframe 
              src={getPreviewUrl(item.fileUrl)} 
              style={{ width: "100%", height: "100%", border: "none" }} 
              title="PDF Preview"
              allow="autoplay"
            ></iframe>
          </div>
        </div>
      )}
    </div>
  )
}