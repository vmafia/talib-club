import { useEffect, useMemo, useRef } from "react"
import toast from "react-hot-toast"
import { BOOKS } from "../data/index.js"
import { useContentCollection } from "../lib/contentStore.js"

function getDirectUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`
  return url
}

function getDownloadUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) return `https://drive.google.com/uc?export=download&id=${match[1]}`
  return url
}

function getPreviewUrl(url) {
  if (!url) return ""
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//)
  if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`
  return url
}

export default function LibraryDetail({ item, go, authState }) {
  // ดึง saveItem ออกมาจากคอลเล็กชันเพื่อใช้อัปเดตข้อมูลขึ้น Firebase
  const { items: books, loading, saveItem } = useContentCollection("books", BOOKS)
  
  // 💡 เชื่อมต่อกับคอลเลกชัน history ใน Firestore
  const { saveItem: saveHistory } = useContentCollection("history", [])
  
  const urlId = new URLSearchParams(window.location.search).get("id")
  const hasIncrementedView = useRef(null) // ตัวรั้งสำหรับป้องกันการบวกยอดวิวซ้ำตอนเรนเดอร์

  const displayItem = useMemo(() => {
    if (item && item.title) return item;
    if (urlId && books.length > 0) return books.find(b => String(b.id) === String(urlId));
    if (item && item.id && books.length > 0) return books.find(b => String(b.id) === String(item.id));
    return null;
  }, [item, urlId, books])

  // บันทึกประวัติการดูหนังสือ
  useEffect(() => {
    if (displayItem && authState?.user?.uid && saveHistory) {
      const uid = authState.user.uid;
      const historyId = `${uid}_book_${displayItem.id}`;
      saveHistory({
        id: historyId,
        uid,
        itemId: displayItem.id,
        type: "book",
        title: displayItem.title,
        timestamp: Date.now()
      }).catch(err => console.error("Failed to save book history to Firebase", err));
    }
  }, [displayItem, authState?.user?.uid, saveHistory])

  // --- ระบบนับยอดเข้าชมของจริง (ยิงขึ้น Firebase) ---
  useEffect(() => {
    if (displayItem && !loading && saveItem && hasIncrementedView.current !== displayItem.id) {
      hasIncrementedView.current = displayItem.id // ล็อค ID ไว้ว่าเล่มนี้ถูกนับวิวในรอบนี้แล้ว
      
      const updatedItem = {
        ...displayItem,
        views: (displayItem.views || 0) + 1
      }
      
      saveItem(updatedItem).catch(err => {
        console.error("ไม่สามารถอัปเดตยอดเข้าชมได้:", err)
      })
    }
  }, [displayItem, loading, saveItem])

  useEffect(() => {
    if (!loading && !displayItem) {
      go("library")
    }
  }, [displayItem, loading, go])

  // --- ระบบนับยอดดาวน์โหลดของจริง (ยิงขึ้น Firebase) ---
  const handleDownloadClick = async () => {
    if (!displayItem || !saveItem) return
    
    try {
      const updatedItem = {
        ...displayItem,
        downloads: (displayItem.downloads || 0) + 1
      }
      await saveItem(updatedItem)
    } catch (err) {
      console.error("ไม่สามารถอัปเดตยอดดาวน์โหลดได้:", err)
    }
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success("คัดลอกลิงก์เรียบร้อยแล้ว นำไปแชร์ให้เพื่อนได้เลย!")
  }

  if (loading && !displayItem) {
    return (
      <div style={{ textAlign: "center", padding: "100px 20px" }}>
        <i className="ti ti-loader-2 spin" style={{ fontSize: 32, color: "var(--teal)", marginBottom: 10 }}></i>
        <p>กำลังโหลดข้อมูลหนังสือ...</p>
      </div>
    )
  }

  if (!displayItem) return null

  return (
    <div className="article-page" style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 40, width: "100%" }}>
      <button 
        onClick={() => go("library")}
        className="sec-link" 
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer" }}
      >
        <i className="ti ti-arrow-left"></i> กลับห้องสมุด
      </button>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, marginBottom: 16, lineHeight: 1.4, wordBreak: "break-word" }}>{displayItem.title}</h1>
        
        {/* แสดงผลตัวเลขจริงจาก Firebase Firestore */}
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 16, color: "var(--t3)", fontSize: 12 }}>
          <span title="ผู้เข้าชม"><i className="ti ti-eye" style={{ marginRight: 4 }}></i>{(displayItem.views || 0).toLocaleString()}</span>
          <span title="ดาวน์โหลด"><i className="ti ti-download" style={{ marginRight: 4 }}></i>{(displayItem.downloads || 0).toLocaleString()}</span>
          <span title="ปีที่พิมพ์"><i className="ti ti-calendar" style={{ marginRight: 4 }}></i>ปี {displayItem.year}</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
        {displayItem.coverUrl ? (
          <img 
            src={getDirectUrl(displayItem.coverUrl)} 
            alt={displayItem.title} 
            style={{ maxWidth: 320, width: "100%", borderRadius: 12, boxShadow: "0 14px 30px rgba(0,0,0,0.15)", objectFit: "cover", border: ".5px solid var(--br2)" }} 
          />
        ) : (
          <div style={{ width: 280, aspectRatio: "3/4", background: "var(--acc2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", border: ".5px solid var(--br2)" }}>
            <i className={`ti ${displayItem.type === "วารสาร" ? "ti-news" : displayItem.type === "PDF" ? "ti-file-text" : "ti-book"}`} style={{ fontSize: 64, color: "var(--acc)" }}></i>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 32, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <span className="tag tag-acc">{displayItem.type}</span>
          {displayItem.category && <span className="tag tag-teal">{displayItem.category}</span>}
          {displayItem.source && <span className="tag" style={{ background: "var(--bg2)", color: "var(--t2)" }}>{displayItem.source}</span>}
        </div>

        {displayItem.author && (
          <div style={{ fontSize: 15, color: "var(--teal)", marginBottom: 14, fontWeight: 500 }}>
            <i className="ti ti-pencil" style={{ marginRight: 6 }}></i>{displayItem.author}
          </div>
        )}

        <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", marginBottom: 24, fontWeight: 300 }}>
          {displayItem.desc || "ไม่มีคำอธิบายเพิ่มเติม"}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a 
            href={getDownloadUrl(displayItem.fileUrl)} 
            target="_blank" 
            rel="noreferrer" 
            className="btn btn-teal" 
            onClick={handleDownloadClick} // บันทึกยอดดาวน์โหลดเมื่อถูกคลิก
            style={{ flex: 1, minWidth: 160, textAlign: "center", textDecoration: "none", pointerEvents: displayItem.fileUrl ? "auto" : "none", opacity: displayItem.fileUrl ? 1 : 0.5 }}
          >
            <i className="ti ti-download" style={{ marginRight: 6 }}></i>ดาวน์โหลดไฟล์
          </a>
          <button onClick={handleShare} className="btn btn-outline" style={{ flex: 1, minWidth: 160 }}>
            <i className="ti ti-share" style={{ marginRight: 6 }}></i>แชร์เนื้อหานี้
          </button>
        </div>
      </div>

      {displayItem.fileUrl && (
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-device-desktop" style={{ color: "var(--t2)" }}></i> ตัวอย่างเนื้อหา (Preview)
          </h3>
          <div style={{ borderRadius: 16, overflow: "hidden", border: ".5px solid var(--br2)", height: "70vh", minHeight: 500, background: "var(--bg2)" }}>
            <iframe 
              src={getPreviewUrl(displayItem.fileUrl)} 
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