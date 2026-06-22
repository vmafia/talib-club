import { useEffect, useMemo, useRef } from "react"
import toast from "react-hot-toast"
import { BOOKS } from "../data/index.js"
import { useContentCollection, useContentDoc, saveContentItem } from "../lib/contentStore.js"
import { bumpContentMetric } from "../utils/contentMetrics.js"
import ImageWithFallback from "../components/ImageWithFallback.jsx"

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
  const uid = authState?.user?.uid;
  const urlId = new URLSearchParams(window.location.search).get("id")
  const bookId = urlId || item?.id
  const fallbackBook = useMemo(
    () => (bookId ? BOOKS.find(b => String(b.id) === String(bookId)) : null) ?? null,
    [bookId]
  )
  const { item: remoteBook, loading } = useContentDoc("books", bookId, fallbackBook)

  const hasIncrementedView = useRef(null)
  const hasSavedHistory = useRef(null)

  const displayItem = useMemo(() => {
    if (remoteBook) return remoteBook
    if (item?.title) return item
    return null
  }, [item, remoteBook])

  useEffect(() => {
    if (displayItem?.title) {
      document.title = `${displayItem.title} | Talib Club`
    }
  }, [displayItem])

  // บันทึกประวัติการดูหนังสือ
  useEffect(() => {
    if (displayItem && authState?.user?.uid && hasSavedHistory.current !== displayItem.id) {
      hasSavedHistory.current = displayItem.id
      const uid = authState.user.uid;
      const historyId = `${uid}_book_${displayItem.id}`;
      saveContentItem("history", {
        id: historyId,
        uid,
        itemId: displayItem.id,
        type: "book",
        title: displayItem.title,
        timestamp: Date.now()
      }, uid).catch(err => console.error("Failed to save book history to Firebase", err));
    }
  }, [displayItem, authState?.user?.uid])

  // --- ระบบนับยอดเข้าชมของจริง (ยิงขึ้น Firebase) ---
  useEffect(() => {
    if (displayItem && !loading && hasIncrementedView.current !== displayItem.id) {
      hasIncrementedView.current = displayItem.id
      bumpContentMetric("books", displayItem.id, "views")
    }
  }, [displayItem, loading])

  useEffect(() => {
    if (!loading && !displayItem) {
      go("library")
    }
  }, [displayItem, loading, go])

  // --- ระบบนับยอดดาวน์โหลดของจริง (ยิงขึ้น Firebase) ---
  const handleDownloadClick = async () => {
    if (!displayItem) return
    
    try {
      await bumpContentMetric("books", displayItem.id, "downloads")
    } catch (err) {
      console.error("ไม่สามารถอัปเดตยอดดาวน์โหลดได้:", err)
    }
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("คัดลอกลิงก์เรียบร้อยแล้ว นำไปแชร์ให้เพื่อนได้เลย!")
    } catch {
      toast.error("คัดลอกลิงก์ไม่สำเร็จ")
    }
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
          <ImageWithFallback 
            src={getDirectUrl(displayItem.coverUrl)} 
            alt={displayItem.title} 
            fallbackEmoji="📚"
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

        {(() => {
          const descText = displayItem.desc || ""
          const urlRegex = /(https?:\/\/[^\s]+)/gi
          const match = descText.match(urlRegex)
          let cleanDesc = descText
          let onlineUrl = null

          if (match) {
            onlineUrl = match[0]
            cleanDesc = descText.replace(urlRegex, "")
            cleanDesc = cleanDesc.replace(/อ่านได้ที่\s*:\s*/gi, "")
            cleanDesc = cleanDesc.trim()
          }
          if (!cleanDesc) {
            cleanDesc = "สามารถเปิดอ่านหนังสือเล่มนี้แบบออนไลน์หรือดาวน์โหลดไฟล์เพื่อศึกษาเนื้อหาเพิ่มเติม"
          }

          return (
            <>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", marginBottom: 24, fontWeight: 300 }}>
                {cleanDesc}
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {onlineUrl && (
                  <a 
                    href={onlineUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="btn btn-teal" 
                    style={{ flex: 1, minWidth: 160, textAlign: "center", textDecoration: "none" }}
                  >
                    <i className="ti ti-book-open" style={{ marginRight: 6 }}></i>อ่านออนไลน์ (Flipbook)
                  </a>
                )}
                <a 
                  href={getDownloadUrl(displayItem.fileUrl)} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={onlineUrl ? "btn btn-outline" : "btn btn-teal"} 
                  onClick={handleDownloadClick} // บันทึกยอดดาวน์โหลดเมื่อถูกคลิก
                  style={{ flex: 1, minWidth: 160, textAlign: "center", textDecoration: "none", pointerEvents: displayItem.fileUrl ? "auto" : "none", opacity: displayItem.fileUrl ? 1 : 0.5 }}
                >
                  <i className="ti ti-download" style={{ marginRight: 6 }}></i>ดาวน์โหลดไฟล์
                </a>
                <button onClick={handleShare} className="btn btn-outline" style={{ flex: 1, minWidth: 160 }}>
                  <i className="ti ti-share" style={{ marginRight: 6 }}></i>แชร์เนื้อหานี้
                </button>
              </div>
            </>
          );
        })()}
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