import { useEffect, useState, useMemo, useRef } from "react"
import toast from "react-hot-toast"
import { ARTICLES } from "../data/index.js"
import { useContentCollection } from "../lib/contentStore.js"
import { serverTimestamp } from "firebase/firestore"

const READER_DEFAULTS = { size: "md", tone: "3" }
const READER_STORAGE_KEY = "talibReaderPrefs"
const READER_SIZE_LABELS = { sm: "ก-", md: "ก", lg: "ก+" }
const READER_TONE_LABELS = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" }

export default function ArticleDetail({ item, go, authState }) {
  const { items: articles, loading: loadingArticles, saveItem } = useContentCollection("articles", ARTICLES)
  
  // 💡 เชื่อมต่อกับคอลเลกชัน bookmarks ใน Firestore
  const { items: bookmarks, saveItem: saveBookmark, deleteItem: deleteBookmark } = useContentCollection("bookmarks", [])
  
  const urlId = new URLSearchParams(window.location.search).get("id")
  const hasIncrementedView = useRef(null)

  const displayItem = useMemo(() => {
    if (item && !item.viewMode) return item;
    if (urlId && articles.length > 0) return articles.find(a => String(a.id) === String(urlId));
    if (item && item.id) return item;
    return null;
  }, [item, urlId, articles])

  // อัปเดตยอดวิวขึ้น Firestore
  useEffect(() => {
    if (displayItem && !loadingArticles && saveItem && hasIncrementedView.current !== displayItem.id) {
      hasIncrementedView.current = displayItem.id;
      const updatedItem = { ...displayItem, views: (displayItem.views || 0) + 1 };
      saveItem(updatedItem).catch(e => console.error("อัปเดตยอดวิวไม่สำเร็จ", e));
    }
  }, [displayItem, loadingArticles, saveItem])

  useEffect(() => {
    if (!loadingArticles && !displayItem) go("articles")
  }, [displayItem, loadingArticles, go])

  const [readerPrefs, setReaderPrefs] = useState(() => getSavedReaderPrefs())
  useEffect(() => {
    window.localStorage.setItem(READER_STORAGE_KEY, JSON.stringify(readerPrefs))
  }, [readerPrefs])

  // --- ระบบเช็คสถานะการบันทึกจาก Firestore (อิงตาม UID) ---
  const uid = authState?.user?.uid;
  
  const savedList = useMemo(() => {
    if (!uid) return [];
    return bookmarks.filter(b => b.uid === uid).map(b => b.articleId);
  }, [bookmarks, uid])

  const isSaved = displayItem ? savedList.includes(displayItem.id) : false;

  // ในหน้า ArticleDetail.jsx
// แทนที่ฟังก์ชัน toggleSave ด้วยอันนี้ครับ
const toggleSave = async () => {
  if (!uid) {
    toast.error("กรุณาเข้าสู่ระบบก่อนบันทึกบทความ");
    go("auth");
    return;
  }
  
  // สร้าง ID เฉพาะ: uid + articleId
  const bookmarkId = `${uid}_${displayItem.id}`; 
  
  try {
    if (isSaved) {
      await deleteBookmark(bookmarkId); // ใช้ฟังก์ชัน deleteBookmark จาก useContentCollection
      toast.success("ยกเลิกการบันทึกแล้ว");
    } else {
      await saveBookmark({
        id: bookmarkId,
        uid: uid,
        articleId: displayItem.id,
        savedAt: serverTimestamp()
      });
      toast.success("บันทึกบทความแล้ว!");
    }
  } catch (err) {
    console.error("Save bookmark failed:", err);
    toast.error("บันทึกไม่สำเร็จ");
  }
}

  const handleShare = async () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("คัดลอกลิงก์สำหรับแชร์แล้ว");
    if (saveItem && displayItem) {
      saveItem({ ...displayItem, shares: (displayItem.shares || 0) + 1 }).catch(e => console.error(e));
    }
  }

  const handlePrint = () => window.print();

  if (loadingArticles && !displayItem) {
    return <div className="article-page" style={{textAlign: "center", padding: "100px 0"}}><i className="ti ti-loader-2 spin" style={{fontSize:32, color:"var(--teal)"}}></i></div>
  }
  if (!displayItem) return null

  // ระบบแกะข้อความสร้างสารบัญอัตโนมัติ
  const toc = [];
  const parsedBody = (displayItem.body || "").split("\n\n").map((para, index) => {
    if (para.startsWith("## ")) {
      const title = para.replace("## ", "");
      const id = `toc-${index}`;
      toc.push({ id, title, level: 2 });
      return <h2 key={index} id={id} style={{ marginTop: 36, marginBottom: 16, fontSize: 22, color: "var(--teal)" }}>{title}</h2>;
    }
    if (para.startsWith("### ")) {
      const title = para.replace("### ", "");
      const id = `toc-${index}`;
      toc.push({ id, title, level: 3 });
      return <h3 key={index} id={id} style={{ marginTop: 24, marginBottom: 12, fontSize: 18 }}>{title}</h3>;
    }
    return <p key={index}>{para}</p>;
  });

  const related = articles.filter(a => a.id !== displayItem.id && a.category === displayItem.category).slice(0, 3)
  const readerClass = `article-body reader-size-${readerPrefs.size} reader-tone-${readerPrefs.tone}`

  return (
    <div className="article-page" style={{ maxWidth: 800, margin: "0 auto" }}>
      <button className="btn btn-outline" onClick={() => go("articles")} style={{ marginBottom: 24, padding: "6px 14px", fontSize: 12 }}>
        <i className="ti ti-arrow-left" style={{ marginRight: 6, fontSize: 12 }}></i>กลับหน้าบทความ
      </button>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <span className="tag tag-teal">{displayItem.category}</span>
          {displayItem.type === "series" && <span className="tag tag-acc">ซีรีส์ {displayItem.seriesId} ตอน {displayItem.part}</span>}
          {displayItem.type === "specific" && displayItem.seriesName && <span className="tag tag-acc">{displayItem.seriesName}</span>}
        </div>
        <h1 className="article-title">{displayItem.title}</h1>
        
        <div style={{ display: "flex", gap: 16, color: "var(--t3)", fontSize: 12, fontWeight: 300, flexWrap: "wrap", marginTop: 12 }}>
          <span><i className="ti ti-user" style={{ marginRight: 4, fontSize: 13 }}></i>{displayItem.author}</span>
          <span><i className="ti ti-calendar" style={{ marginRight: 4, fontSize: 13 }}></i>{displayItem.date}</span>
          <span title="ผู้เข้าชม"><i className="ti ti-eye" style={{ marginRight: 4, fontSize: 13 }}></i>{(displayItem.views || 0).toLocaleString()}</span>
          <span title="แชร์"><i className="ti ti-share" style={{ marginRight: 4, fontSize: 13 }}></i>{(displayItem.shares || 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="divider" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <button onClick={handleShare} className="btn btn-outline" style={{ fontSize: 12, flex: "1 1 100px", padding: "8px 0" }}>
          <i className="ti ti-share" style={{ marginRight: 6, fontSize: 14 }}></i> คัดลอกลิงก์
        </button>
        <button onClick={handlePrint} className="btn btn-outline" style={{ fontSize: 12, flex: "1 1 100px", padding: "8px 0" }}>
          <i className="ti ti-printer" style={{ marginRight: 6, fontSize: 14 }}></i> ปริ้น / PDF
        </button>
        <button onClick={toggleSave} className={`btn ${isSaved ? "btn-teal" : "btn-outline"}`} style={{ fontSize: 12, flex: "1 1 100px", padding: "8px 0" }}>
          <i className={`ti ${isSaved ? "ti-bookmark-filled" : "ti-bookmark"}`} style={{ marginRight: 6, fontSize: 14 }}></i> 
          {isSaved ? "บันทึกแล้ว" : "บันทึกไว้อ่าน"}
        </button>
      </div>

      <div className="reader-tools" aria-label="ตัวเลือกการอ่าน">
        <div className="reader-control" aria-label="ขนาดตัวอักษร">
          {Object.entries(READER_SIZE_LABELS).map(([value, label]) => (
            <button key={value} type="button" className={`reader-btn ${readerPrefs.size === value ? "on" : ""}`} onClick={() => setReaderPrefs(prev => ({ ...prev, size: value }))}>{label}</button>
          ))}
        </div>
        <div className="reader-control" aria-label="ความเข้มตัวอักษร">
          {Object.entries(READER_TONE_LABELS).map(([value, label]) => (
            <button key={value} type="button" className={`reader-btn ${readerPrefs.tone === value ? "on" : ""}`} onClick={() => setReaderPrefs(prev => ({ ...prev, tone: value }))}>{label}</button>
          ))}
        </div>
      </div>

      {toc.length > 0 && (
        <div className="card" style={{ padding: "20px 24px", marginBottom: 32, background: "var(--bg2)", border: ".5px solid var(--br2)" }}>
          <h3 style={{ fontSize: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-list" style={{ color: "var(--teal)" }}></i> สารบัญเนื้อหา (Table Of Contents)
          </h3>
          <ul style={{ margin: 0, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            {toc.map(t => (
              <li key={t.id} style={{ fontSize: t.level === 2 ? 14 : 13, color: "var(--text)" }}>
                <a href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); }} style={{ color: "var(--teal)", textDecoration: "none", opacity: t.level === 3 ? 0.8 : 1 }}>
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="article-excerpt"><p>{displayItem.excerpt}</p></div>
      <div className={readerClass} style={{ scrollBehavior: "smooth" }}>{parsedBody}</div>

      {displayItem.tags && displayItem.tags.length > 0 && (
        <div style={{ marginTop: 32, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {displayItem.tags.map(t => (
            <span key={t} className="tag tag-acc" style={{ fontSize: 11 }}>#{t}</span>
          ))}
        </div>
      )}

      {related.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div className="divider" />
          <div className="sec-hd" style={{ marginBottom: 14 }}><span className="sec-title">บทความที่เกี่ยวข้อง</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {related.map(r => (
              <div key={r.id} className="card" style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }} onClick={() => go("article", r)}>
                <div>
                  <span className="tag tag-teal" style={{ marginRight: 8 }}>{r.category}</span>
                  <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 400 }}>{r.title}</span>
                </div>
                <i className="ti ti-arrow-right" style={{ color: "var(--t3)", flexShrink: 0 }}></i>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function getSavedReaderPrefs() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(READER_STORAGE_KEY) || "{}")
    return { size: READER_SIZE_LABELS[saved.size] ? saved.size : READER_DEFAULTS.size, tone: READER_TONE_LABELS[saved.tone] ? saved.tone : READER_DEFAULTS.tone }
  } catch { return READER_DEFAULTS }
}