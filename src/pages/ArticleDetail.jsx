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
      bumpContentMetric("articles", displayItem.id, "views")
    }
  }, [displayItem, loadingArticles])

  // บันทึกประวัติการอ่านบทความ
  useEffect(() => {
    if (displayItem && authState?.user?.uid && hasSavedHistory.current !== displayItem.id) {
      hasSavedHistory.current = displayItem.id
      const uid = authState.user.uid;
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

  // ระบบแกะข้อความสร้างสารบัญอัตโนมัติ
  const toc = [];
  const parsedBody = [];
  let currentParagraphLines = [];

  const flushParagraph = (keyIndex) => {
    if (currentParagraphLines.length > 0) {
      parsedBody.push(
        <p key={`p-${keyIndex}`}>
          {currentParagraphLines.map((line, idx) => (
            <span key={idx}>
              {line}
              {idx < currentParagraphLines.length - 1 && <br />}
            </span>
          ))}
        </p>
      );
      currentParagraphLines = [];
    }
  };

  const lines = (displayItem.body || "").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const matchH3 = trimmed.match(/^###([^#].*)$/);
    if (matchH3) {
      flushParagraph(index);
      const title = matchH3[1].trim();
      const id = `toc-${index}`;
      toc.push({ id, title, level: 3 });
      parsedBody.push(<h3 key={`h3-${index}`} id={id} style={{ marginTop: 24, marginBottom: 12, fontSize: 18 }}>{title}</h3>);
      return;
    }
    const matchH2 = trimmed.match(/^##([^#].*)$/);
    if (matchH2) {
      flushParagraph(index);
      const title = matchH2[1].trim();
      const id = `toc-${index}`;
      toc.push({ id, title, level: 2 });
      parsedBody.push(<h2 key={`h2-${index}`} id={id} style={{ marginTop: 36, marginBottom: 16, fontSize: 22, color: "var(--teal)" }}>{title}</h2>);
      return;
    }

    if (trimmed === "") {
      flushParagraph(index);
    } else {
      currentParagraphLines.push(line);
    }
  });
  flushParagraph(lines.length);

  const related = relatedArticles
  const readerClass = `article-body reader-size-${readerPrefs.size} reader-tone-${readerPrefs.tone}`

  return (
    <div className="article-page" style={{ maxWidth: 720, margin: "0 auto" }}>
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

      {displayItem.coverUrl && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28, width: "100%" }}>
          <ImageWithFallback
            src={displayItem.coverUrl}
            alt={displayItem.title}
            style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", objectFit: "contain", border: ".5px solid var(--br2)" }}
          />
        </div>
      )}

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

      <div className={readerClass} style={{ scrollBehavior: "smooth" }}>{parsedBody}</div>

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
    </div>
  )
}

function getSavedReaderPrefs() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(READER_STORAGE_KEY) || "{}")
    return { size: READER_SIZE_LABELS[saved.size] ? saved.size : READER_DEFAULTS.size, tone: READER_TONE_LABELS[saved.tone] ? saved.tone : READER_DEFAULTS.tone }
  } catch { return READER_DEFAULTS }
}
