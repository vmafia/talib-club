import { useEffect, useState, useMemo, useRef } from "react"
import toast from "react-hot-toast"
import { ARTICLES, SERIES } from "../data/index.js"
import { useContentCollection, useContentDoc, CONTENT_COLLECTIONS, saveContentItem } from "../lib/contentStore.js"
import { collection, getDocs, query, where, serverTimestamp, limit } from "firebase/firestore"
import { db } from "../lib/firebase.js"
import { bumpContentMetric } from "../utils/contentMetrics.js"
import ImageWithFallback from "../components/ImageWithFallback.jsx"

const READER_DEFAULTS = { size: "md", tone: "3" }
const READER_STORAGE_KEY = "talibReaderPrefs"
const READER_SIZE_LABELS = { sm: "ก-", md: "ก", lg: "ก+" }
const READER_TONE_LABELS = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" }

function sanitizeArticleForStore(article) {
  if (!article) return article
  const clean = { ...article }
  delete clean.fromFilters
  delete clean.viewMode
  return clean
}

export default function ArticleDetail({ item, go, authState }) {
  const uid = authState?.user?.uid;
  const urlId = new URLSearchParams(window.location.search).get("id")
  const articleId = urlId || item?.id
  const fallbackArticle = useMemo(
    () => (articleId ? ARTICLES.find(a => String(a.id) === String(articleId)) : null) ?? null,
    [articleId]
  )
  const { item: remoteArticle, loading: loadingArticles } = useContentDoc("articles", articleId, fallbackArticle)
  const bookmarksQueryOptions = useMemo(() => ({ live: false }), [])

  const [relatedArticles, setRelatedArticles] = useState([])
  const [seriesArticles, setSeriesArticles] = useState([])
  const { items: bookmarks, saveItem: saveBookmark, deleteItem: deleteBookmark } = useContentCollection("bookmarks", [], uid, bookmarksQueryOptions)

  const hasIncrementedView = useRef(null)
  const hasSavedHistory = useRef(null)

  const displayItem = useMemo(() => {
    const fromFilters = item?.fromFilters
    if (remoteArticle) {
      return fromFilters ? { ...remoteArticle, fromFilters } : remoteArticle
    }
    if (item?.title && !item.viewMode) return item
    return null
  }, [item, remoteArticle])

  useEffect(() => {
    if (displayItem?.title) {
      document.title = `${displayItem.title} | Talib Club`
    }
  }, [displayItem])

  useEffect(() => {
    if (!displayItem) return

    // 1. Fetch related articles (Check sessionStorage cache first)
    const cacheKeyRelated = `talib_related_${displayItem.category}`
    let cachedRelatedData = null
    try {
      const cached = sessionStorage.getItem(cacheKeyRelated)
      if (cached) cachedRelatedData = JSON.parse(cached)
    } catch (e) { }

    if (cachedRelatedData) {
      const docs = cachedRelatedData
        .filter(a => String(a.id) !== String(displayItem.id) && !a.deleted)
        .slice(0, 3)
      setRelatedArticles(docs)
    } else {
      const relatedQ = query(
        collection(db, "content_articles"),
        where("category", "==", displayItem.category || ""),
        limit(4)
      )
      getDocs(relatedQ)
        .then(snap => {
          const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }))
          try {
            sessionStorage.setItem(cacheKeyRelated, JSON.stringify(docs))
          } catch (e) { }
          const filtered = docs
            .filter(a => String(a.id) !== String(displayItem.id) && !a.deleted)
            .slice(0, 3)
          setRelatedArticles(filtered)
        })
        .catch(err => {
          console.error("Failed to load related articles from Firebase", err)
          // Fallback to static articles
          const staticRelated = ARTICLES.filter(
            a => String(a.id) !== String(displayItem.id) && String(a.category || "").toLowerCase() === String(displayItem.category || "").toLowerCase()
          ).slice(0, 3)
          setRelatedArticles(staticRelated)
        })
    }

    // 2. Fetch series articles if applicable (Check sessionStorage cache first)
    if (displayItem.type === "series" && displayItem.seriesId) {
      const cacheKeySeries = `talib_series_${displayItem.seriesId}`
      let cachedSeriesData = null
      try {
        const cached = sessionStorage.getItem(cacheKeySeries)
        if (cached) cachedSeriesData = JSON.parse(cached)
      } catch (e) { }

      if (cachedSeriesData) {
        const docs = cachedSeriesData
          .filter(a => !a.deleted)
          .sort((a, b) => (a.part || 0) - (b.part || 0))
        setSeriesArticles(docs)
      } else {
        const seriesQ = query(
          collection(db, "content_articles"),
          where("type", "==", "series"),
          where("seriesId", "==", displayItem.seriesId)
        )
        getDocs(seriesQ)
          .then(snap => {
            const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }))
            try {
              sessionStorage.setItem(cacheKeySeries, JSON.stringify(docs))
            } catch (e) { }
            const sorted = docs
              .filter(a => !a.deleted)
              .sort((a, b) => (a.part || 0) - (b.part || 0))
            setSeriesArticles(sorted)
          })
          .catch(err => {
            console.error("Failed to load series articles from Firebase", err)
            // Fallback to static articles
            const staticSeries = ARTICLES.filter(
              a => !a.deleted && String(a.type).toLowerCase() === "series" && String(a.seriesId || "").toLowerCase() === String(displayItem.seriesId).toLowerCase()
            ).sort((a, b) => (a.part || 0) - (b.part || 0))
            setSeriesArticles(staticSeries)
          })
      }
    } else {
      setSeriesArticles([])
    }
  }, [displayItem])

  const seriesName = useMemo(() => {
    if (displayItem?.seriesId) {
      const s = SERIES.find(x => String(x.id).toLowerCase() === String(displayItem.seriesId).toLowerCase());
      return s ? s.name : displayItem.seriesId;
    }
    return "";
  }, [displayItem]);

  const currentIdx = seriesArticles.findIndex(a => String(a.id) === String(displayItem?.id));
  const prevEpisode = currentIdx > 0 ? seriesArticles[currentIdx - 1] : null;
  const nextEpisode = currentIdx >= 0 && currentIdx < seriesArticles.length - 1 ? seriesArticles[currentIdx + 1] : null;

  // อัปเดตยอดวิวขึ้น Firestore
  useEffect(() => {
    if (displayItem && !loadingArticles && hasIncrementedView.current !== displayItem.id) {
      hasIncrementedView.current = displayItem.id
      const viewKey = `talib_viewed_article_${displayItem.id}`
      if (!sessionStorage.getItem(viewKey)) {
        sessionStorage.setItem(viewKey, "1")
        bumpContentMetric("articles", displayItem.id, "views")
      }
    }
  }, [displayItem, loadingArticles])

  // บันทึกประวัติการอ่านบทความ
  useEffect(() => {
    if (displayItem && authState?.user?.uid && hasSavedHistory.current !== displayItem.id) {
      hasSavedHistory.current = displayItem.id
      const uid = authState.user.uid;
      const historyKey = `talib_history_article_${displayItem.id}`;
      if (!sessionStorage.getItem(historyKey)) {
        sessionStorage.setItem(historyKey, "1");
        const historyId = `${uid}_article_${displayItem.id}`;
        saveContentItem("history", {
          id: historyId,
          uid,
          itemId: displayItem.id,
          type: "article",
          title: displayItem.title,
          timestamp: Date.now()
        }, uid).catch(err => console.error("Failed to save read history to Firebase", err));
      }
    }
  }, [displayItem, authState?.user?.uid])

  useEffect(() => {
    if (!loadingArticles && !displayItem) go("articles")
  }, [displayItem, loadingArticles, go])

  const [readerPrefs, setReaderPrefs] = useState(() => getSavedReaderPrefs())
  useEffect(() => {
    window.localStorage.setItem(READER_STORAGE_KEY, JSON.stringify(readerPrefs))
  }, [readerPrefs])

  // --- ระบบเช็คสถานะการบันทึกจาก Firestore (อิงตาม UID) ---

  const savedList = useMemo(() => {
    if (!uid) return [];
    return bookmarks.filter(b => b.uid === uid).map(b => String(b.articleId));
  }, [bookmarks, uid])

  const isSaved = displayItem ? savedList.includes(String(displayItem.id)) : false;

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
        deleteBookmark(bookmarkId);
        toast.success("ยกเลิกการบันทึกแล้ว");
      } else {
        saveBookmark({
          id: bookmarkId,
          uid: uid,
          articleId: String(displayItem.id),
          savedAt: new Date()
        });
        toast.success("บันทึกบทความแล้ว!");
      }
    } catch (err) {
      console.error("Save bookmark failed:", err);
      toast.error("บันทึกไม่สำเร็จ");
    }
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("คัดลอกลิงก์สำหรับแชร์แล้ว")
      if (displayItem) bumpContentMetric("articles", displayItem.id, "shares")
    } catch {
      toast.error("คัดลอกลิงก์ไม่สำเร็จ กรุณาคัดลอกจากแถบที่อยู่ด้วยตนเอง")
    }
  }

  const handlePrint = () => window.print();

  if (loadingArticles && !displayItem) {
    return <div className="article-page" style={{ textAlign: "center", padding: "100px 0" }}><i className="ti ti-loader-2 spin" style={{ fontSize: 32, color: "var(--teal)" }}></i></div>
  }
  if (!displayItem) return null

  const [modalImage, setModalImage] = useState(null);

  // ระบบแกะข้อความสร้างสารบัญ และจัดรูปแบบบทความ (รองรับทั้ง Plaintext เดิม และ HTML จาก Quill)
  const { toc, finalHtml } = useMemo(() => {
    let body = displayItem.body || "";
    let isHtml = /<[a-z][\s\S]*>/i.test(body);
    const tocList = [];
    
    if (!isHtml) {
      // 1. จัดการ Notes ที่อยู่ท้ายบทความ (ดึงข้อความมาทำ Tooltip)
      const notesMatch = body.match(/## Notes\s*([\s\S]*)$/i);
      let notesDict = {};
      if (notesMatch) {
        const notesStr = notesMatch[1];
        const noteLines = notesStr.split('\n');
        noteLines.forEach(line => {
          const match = line.match(/^(\d+)\.\s*(.*)/);
          if (match) {
            notesDict[match[1]] = match[2].trim();
          }
        });
      }

      // แปลง Markdown-like headers
      body = body.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
      body = body.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
      
      // แปลง Blockquotes และดักจับ กุรอาน/หะดีษ แบบง่ายๆ
      body = body.replace(/^>\s+(.*)$/gm, (match, p1) => {
        if (p1.includes('อัลลอฮฺตรัส') || p1.includes('อัลกุรอาน')) {
          return `<blockquote class="quran-block">${p1}</blockquote>`;
        } else if (p1.includes('ร่อซูล') || p1.includes('นบี') || p1.includes('หะดีษ')) {
          return `<blockquote class="hadith-block">${p1}</blockquote>`;
        }
        return `<blockquote>${p1}</blockquote>`;
      });
      
      // แปลง [1] เป็นเชิงอรรถ พร้อม tooltip
      body = body.replace(/\[(\d+)\]/g, (match, p1) => {
        const tooltip = notesDict[p1] ? `title="${notesDict[p1].replace(/"/g, '&quot;')}"` : '';
        return `<sup ${tooltip}><a href="#note-${p1}" class="footnote-link">${p1}</a></sup>`;
      });
      
      // จัด Paragraph (บรรทัดที่ไม่มี tag ให้ครอบ p)
      const lines = body.split(/\r?\n/);
      let inP = false;
      let htmlLines = [];
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed === "") {
          if (inP) { htmlLines.push('</p>'); inP = false; }
          return;
        }
        if (trimmed.startsWith('<h') || trimmed.startsWith('<block') || trimmed.startsWith('<div')) {
          if (inP) { htmlLines.push('</p>'); inP = false; }
          htmlLines.push(line);
        } else {
          if (!inP) { htmlLines.push('<p>'); inP = true; }
          htmlLines.push(line + '<br/>');
        }
      });
      if (inP) htmlLines.push('</p>');
      
      body = htmlLines.join('\n');
      
      // แปลงส่วน ## Notes ให้เป็น HTML Section สวยๆ
      if (notesMatch) {
         body = body.replace(/<h2>Notes<\/h2>[\s\S]*$/, '');
         let notesHtml = '<div class="article-notes-section"><div class="notes-title">Footnotes / อ้างอิง</div>';
         for (const [key, val] of Object.entries(notesDict)) {
           // ทำให้ลิงก์ (Arabic text) ใน Notes เป็นลิงก์ที่คลิกแล้วรูปเด้ง
           let noteText = val.replace(/\((Arabic text|ข้อความภาษาอาหรับ)\)/gi, '<a href="#">(Arabic text)</a>');
           // แปลงลิงก์ http ธรรมดาเป็น a href
           noteText = noteText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
           notesHtml += `<div class="article-note-item" id="note-${key}" style="transition: background-color 0.5s"><span class="article-note-badge">${key}</span><div>${noteText}</div></div>`;
         }
         notesHtml += '</div>';
         body += notesHtml;
      }
    }
    
    // สร้าง TOC และใส่ id ให้ h2, h3
    let counter = 0;
    body = body.replace(/<(h[23])([^>]*)>(.*?)<\/\1>/gi, (match, tag, attrs, content) => {
      const id = `toc-${counter++}`;
      const level = tag.toLowerCase() === 'h2' ? 2 : 3;
      const title = content.replace(/<[^>]+>/g, '');
      tocList.push({ id, title, level });
      
      if (!isHtml) { // ใส่สไตล์ให้ Plaintext เดิม
        if (level === 2 && !attrs.includes('id=')) {
           return `<${tag} id="${id}" style="margin-top: 40px; margin-bottom: 20px; font-size: 24px; color: var(--teal); font-weight: 700; background: linear-gradient(90deg, rgba(20,184,166,0.15) 0%, transparent 100%); padding: 10px 16px; border-radius: 12px; border-left: 5px solid var(--teal)">${content}</${tag}>`;
        } else if (level === 3 && !attrs.includes('id=')) {
           return `<${tag} id="${id}" style="margin-top: 28px; margin-bottom: 12px; font-size: 19px; color: var(--text); font-weight: 600"><span style="color: var(--acc); margin-right: 8px">✿</span>${content}</${tag}>`;
        }
      } else { // HTML จาก Quill
        if (!attrs.includes('id=')) {
           return `<${tag} id="${id}" ${attrs}>${content}</${tag}>`;
        }
      }
      return match;
    });

    return { toc: tocList, finalHtml: body };
  }, [displayItem.body]);

  // ระบบดักจับการคลิก (Smart Click Interceptor)
  const handleArticleClick = (e) => {
    const a = e.target.closest('a');
    if (a) {
      const href = a.getAttribute('href');
      const text = a.textContent.toLowerCase();
      // 1. เช็คว่าเป็น Image หรือคำว่า Arabic text
      if (text.includes('arabic text') || text.includes('อาหรับ') || (href && href.match(/\.(jpeg|jpg|gif|png)$/i))) {
        e.preventDefault();
        // ถ้าระบุลิงก์รูปมาให้ใช้ลิงก์นั้น ถ้าไม่ให้ใช้รูป dummy ไปก่อน
        setModalImage(href && href.startsWith('http') ? href : '/placeholder-arabic.jpg');
      }
      // 2. เช็คว่าเป็นลิงก์เชิงอรรถ (#note-1)
      else if (href && href.startsWith('#note-')) {
        e.preventDefault();
        const el = document.getElementById(href.substring(1));
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo({ top: y, behavior: 'smooth' });
          el.style.backgroundColor = 'rgba(245,158,11,0.2)';
          setTimeout(() => el.style.backgroundColor = 'transparent', 2000);
        }
      }
    }
  };

  const related = relatedArticles
  const readerClass = `article-body reader-size-${readerPrefs.size} reader-tone-${readerPrefs.tone}`

  return (
    <div className="article-page animate-float-cute" style={{ maxWidth: 720, margin: "0 auto" }}>
      <button className="btn btn-outline" onClick={() => {
        if (displayItem?.fromFilters) {
          go("articles", displayItem.fromFilters)
        } else if (item?.fromFilters) {
          go("articles", item.fromFilters)
        } else {
          go("articles")
        }
      }} style={{ marginBottom: 24, padding: "6px 14px", fontSize: 12 }}>
        <i className="ti ti-arrow-left" style={{ marginRight: 6, fontSize: 12 }}></i>กลับหน้าบทความ
      </button>

      <div style={{ marginBottom: 24, position: "relative" }}>
        <div style={{ position: "absolute", top: -40, left: -40, width: 120, height: 120, background: "var(--acc)", opacity: 0.1, filter: "blur(40px)", borderRadius: "50%", zIndex: 0 }}></div>
        <div style={{ position: "absolute", bottom: -20, right: 0, width: 100, height: 100, background: "var(--teal)", opacity: 0.1, filter: "blur(40px)", borderRadius: "50%", zIndex: 0 }}></div>
        
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          <span style={{ padding: "4px 12px", background: "linear-gradient(135deg, var(--teal), #0d9488)", color: "#fff", borderRadius: 20, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 10px rgba(20,184,166,0.3)" }}>{displayItem.category}</span>
          {displayItem.type === "series" && <span style={{ padding: "4px 12px", background: "linear-gradient(135deg, var(--acc), #d97706)", color: "#fff", borderRadius: 20, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 10px rgba(245,158,11,0.3)" }}>ซีรีส์ {displayItem.seriesId} ตอน {displayItem.part}</span>}
          {displayItem.type === "specific" && displayItem.seriesName && <span style={{ padding: "4px 12px", background: "linear-gradient(135deg, var(--acc), #d97706)", color: "#fff", borderRadius: 20, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 10px rgba(245,158,11,0.3)" }}>{displayItem.seriesName}</span>}
        </div>
        <h1 className="article-title" style={{ position: "relative", zIndex: 1, fontSize: 32, lineHeight: 1.4, background: "linear-gradient(to right, var(--text), var(--teal))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {displayItem.title}
        </h1>

        <div style={{ display: "flex", gap: 16, color: "var(--t3)", fontSize: 12, fontWeight: 300, flexWrap: "wrap", marginTop: 12 }}>
          <span><i className="ti ti-user" style={{ marginRight: 4, fontSize: 13 }}></i>{displayItem.author}</span>
          <span><i className="ti ti-calendar" style={{ marginRight: 4, fontSize: 13 }}></i>{displayItem.date}</span>
          <span title="ผู้เข้าชม"><i className="ti ti-eye" style={{ marginRight: 4, fontSize: 13 }}></i>{(displayItem.views || 0).toLocaleString()}</span>
          <span title="แชร์"><i className="ti ti-share" style={{ marginRight: 4, fontSize: 13 }}></i>{(displayItem.shares || 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="divider" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <button onClick={handleShare} className="btn btn-outline hover-wiggle" style={{ fontSize: 12, flex: "1 1 100px", padding: "8px 0" }}>
          <i className="ti ti-share" style={{ marginRight: 6, fontSize: 14 }}></i> คัดลอกลิงก์
        </button>
        <button onClick={handlePrint} className="btn btn-outline hover-wiggle" style={{ fontSize: 12, flex: "1 1 100px", padding: "8px 0" }}>
          <i className="ti ti-printer" style={{ marginRight: 6, fontSize: 14 }}></i> ปริ้น / PDF
        </button>
        <button onClick={toggleSave} className={`btn ${isSaved ? "btn-teal" : "btn-outline"} hover-wiggle`} style={{ fontSize: 12, flex: "1 1 100px", padding: "8px 0" }}>
          <i className={`ti ${isSaved ? "ti-bookmark-filled animate-pulse-cute" : "ti-bookmark"}`} style={{ marginRight: 6, fontSize: 14 }}></i>
          {isSaved ? "บันทึกแล้ว" : "บันทึกไว้อ่าน"}
        </button>
      </div>

      {displayItem.coverUrl && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36, width: "100%", position: "relative" }}>
          <div style={{ position: "absolute", top: "10%", left: "5%", right: "5%", bottom: "-10%", background: "linear-gradient(45deg, var(--teal), var(--acc))", filter: "blur(30px)", opacity: 0.2, zIndex: 0, borderRadius: 30 }}></div>
          <ImageWithFallback
            src={displayItem.coverUrl}
            alt={displayItem.title}
            style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 16, boxShadow: "0 20px 40px rgba(0,0,0,0.15)", objectFit: "contain", border: "2px solid rgba(255,255,255,0.5)", zIndex: 1, position: "relative", background: "var(--bg)" }}
          />
        </div>
      )}

      <div className="reader-tools animate-float-cute" aria-label="ตัวเลือกการอ่าน" style={{ animationDelay: "0.2s" }}>
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
        <div className="card" style={{ padding: "24px 28px", marginBottom: 32, background: "var(--bg2)", border: ".5px solid var(--br2)", borderRadius: 16 }}>
          <style>{`
            .toc-link {
              transition: all 0.2s ease;
            }
            .toc-link:hover {
              color: var(--teal) !important;
              transform: translateX(4px);
            }
          `}</style>
          <h3 style={{ fontSize: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
            <i className="ti ti-list" style={{ color: "var(--teal)", fontSize: 18 }}></i> สารบัญเนื้อหา (Table Of Contents)
          </h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {toc.map(t => {
              const isH3 = t.level === 3;
              return (
                <li key={t.id} style={{ 
                  paddingLeft: isH3 ? 24 : 0, 
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-start",
                  lineHeight: 1.5
                }}>
                  {isH3 ? (
                    <span style={{
                      position: "absolute",
                      left: 8,
                      top: 0,
                      width: 8,
                      height: 10,
                      borderLeft: "1.5px solid rgba(128,128,128,0.25)",
                      borderBottom: "1.5px solid rgba(128,128,128,0.25)",
                      borderBottomLeftRadius: 4,
                    }} />
                  ) : (
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--teal)",
                      marginTop: 8,
                      marginRight: 12,
                      flexShrink: 0
                    }} />
                  )}
                  <a 
                    href={`#${t.id}`} 
                    onClick={(e) => { 
                      e.preventDefault(); 
                      document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); 
                    }} 
                    className="toc-link"
                    style={{ 
                      fontSize: isH3 ? 13 : 14, 
                      color: isH3 ? "var(--t3)" : "var(--text)", 
                      fontWeight: isH3 ? 300 : 500,
                      textDecoration: "none",
                      display: "inline-block"
                    }}
                  >
                    {t.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div 
        className={`${readerClass} animate-float-cute`} 
        style={{ scrollBehavior: "smooth", animationDelay: "0.4s", padding: "16px 20px" }}
        onClick={handleArticleClick}
        dangerouslySetInnerHTML={{ __html: finalHtml }} 
      />

      {displayItem.tags && displayItem.tags.length > 0 && (
        <div style={{ marginTop: 32, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {displayItem.tags.map(t => (
            <span key={t} className="tag tag-acc" style={{ fontSize: 11 }}>#{t}</span>
          ))}
        </div>
      )}

      {/* ตอนก่อนหน้า / ตอนถัดไป */}
      {(prevEpisode || nextEpisode) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 40, flexWrap: "wrap" }}>
          {prevEpisode ? (
            <button
              onClick={() => go("article", { ...prevEpisode, fromFilters: item?.fromFilters })}
              className="btn btn-outline"
              style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", textDecoration: "none", color: "var(--text)", textAlign: "left", justifyContent: "flex-start" }}
            >
              <i className="ti ti-arrow-left" style={{ color: "var(--teal)" }}></i>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "var(--teal)", fontWeight: 500 }}>ตอนก่อนหน้า</div>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>ตอนที่ {prevEpisode.part}: {prevEpisode.title}</div>
              </div>
            </button>
          ) : <div style={{ flex: 1 }} />}

          {nextEpisode ? (
            <button
              onClick={() => go("article", { ...nextEpisode, fromFilters: item?.fromFilters })}
              className="btn btn-outline"
              style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", textDecoration: "none", color: "var(--text)", textAlign: "right", justifyContent: "flex-end" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "var(--teal)", fontWeight: 500 }}>ตอนถัดไป</div>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>ตอนที่ {nextEpisode.part}: {nextEpisode.title}</div>
              </div>
              <i className="ti ti-arrow-right" style={{ color: "var(--teal)" }}></i>
            </button>
          ) : <div style={{ flex: 1 }} />}
        </div>
      )}

      {/* สารบัญตอนทั้งหมดในซีรีส์ */}
      {seriesArticles.length > 0 && (
        <div className="card" style={{ padding: "20px 24px", marginTop: 32, background: "var(--teal-bg)", border: ".5px solid rgba(15,110,86,0.2)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, color: "var(--teal)", fontWeight: 600 }}>
            <i className="ti ti-list-numbers" style={{ fontSize: 18 }}></i> ตอนทั้งหมดในซีรีส์ "{seriesName}" ({seriesArticles.length} ตอน)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {seriesArticles.map(a => {
              const isCurrent = String(a.id) === String(displayItem.id);
              return (
                <button
                  key={a.id}
                  onClick={() => go("article", { ...a, fromFilters: item?.fromFilters })}
                  className={`btn ${isCurrent ? 'btn-teal' : 'btn-outline'}`}
                  style={{
                    justifyContent: "flex-start",
                    fontSize: 12,
                    padding: "8px 12px",
                    textAlign: "left",
                    fontWeight: isCurrent ? 600 : 300,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "block",
                    width: "100%",
                    borderColor: isCurrent ? "var(--teal)" : "var(--br)"
                  }}
                  title={a.title}
                >
                  <span style={{ fontWeight: 600, marginRight: 6 }}>ตอน {a.part}:</span>
                  {a.title}
                </button>
              );
            })}
          </div>
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

      {/* Image Modal for Arabic Text and Image Links */}
      {modalImage && (
        <div className="image-modal-overlay" onClick={() => setModalImage(null)}>
          <div className="image-modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ background: "#fff", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>รูปภาพอ้างอิง</span>
              <button onClick={() => setModalImage(null)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--t2)" }}>✕</button>
            </div>
            {/* ถ้าเป็น placeholder ให้แสดงข้อความแทน */}
            {modalImage === '/placeholder-arabic.jpg' ? (
              <div style={{ padding: 40, background: "#fff", textAlign: "center", borderBottomLeftRadius: 8, borderBottomRightRadius: 8, minWidth: 300 }}>
                <i className="ti ti-photo" style={{ fontSize: 40, color: "var(--t3)", marginBottom: 16 }}></i>
                <div style={{ fontSize: 16, fontWeight: 500 }}>ระบบแสดงรูปภาพพร้อมใช้งาน</div>
                <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 8 }}>แอดมินสามารถแนบลิงก์รูปภาพในหน้าจัดการบทความได้เลย</div>
              </div>
            ) : (
              <img src={modalImage} alt="Reference" style={{ display: "block", maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }} />
            )}
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
