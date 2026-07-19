import { useEffect, useState, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import DOMPurify from "dompurify"
import { ARTICLES, SERIES } from "../data/index.js"
import { useContentCollection, useContentDoc, saveContentItem } from "../lib/contentStore.js"
import { collection, getDocs, query, where, limit } from "firebase/firestore"
import { db } from "../lib/firebase.js"
import { bumpContentMetric } from "../utils/contentMetrics.js"
import ImageWithFallback from "../components/ImageWithFallback.jsx"
import SEOHead, { stripHtml, truncate, BASE_URL } from '../components/SEOHead.jsx'

const READER_DEFAULTS = { size: "md", tone: "3" }
const READER_STORAGE_KEY = "talibReaderPrefs"
const READER_SIZE_LABELS = { sm: "ก-", md: "ก", lg: "ก+" }
const READER_TONE_LABELS = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" }


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



  const isSeries = displayItem?.type === "series" || displayItem?.type === "ซีรีส์";

  useEffect(() => {
    if (!displayItem) return

    // 1. Fetch related articles (Check sessionStorage cache first)
    const cacheKeyRelated = `talib_related_${displayItem.category}`
    let cachedRelatedData = null
    try {
      const cached = sessionStorage.getItem(cacheKeyRelated)
      if (cached) cachedRelatedData = JSON.parse(cached)
    } catch {
      /* Ignore invalid related-article cache. */
    }

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
          } catch {
              /* Ignore sessionStorage quota errors. */
            }
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

    // 2. Fetch series articles if applicable
    const seriesTypes = ["series", "ซีรีส์", "ซีรีย์", "ซีรี่ส์", "ซีรี่ย์"];
    const isSeriesLocal = seriesTypes.includes(String(displayItem.type || "").toLowerCase());
    if (isSeriesLocal && displayItem.seriesId) {
      const seriesQ = query(
        collection(db, "content_articles"),
        where("seriesId", "==", displayItem.seriesId)
      )
      getDocs(seriesQ)
        .then(snap => {
          const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }))
          const sorted = docs
            .filter(a => !a.deleted && seriesTypes.includes(String(a.type || "").toLowerCase()))
            .sort((a, b) => (a.part || 0) - (b.part || 0))
          setSeriesArticles(sorted)
        })
          .catch(err => {
            console.error("Failed to load series articles from Firebase", err)
            // Fallback to static articles
            const staticSeries = ARTICLES.filter(
              a => !a.deleted && seriesTypes.includes(String(a.type || "").toLowerCase()) && String(a.seriesId || "").toLowerCase() === String(displayItem.seriesId).toLowerCase()
            ).sort((a, b) => (a.part || 0) - (b.part || 0))
            setSeriesArticles(staticSeries)
          })
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


  const [modalImage, setModalImage] = useState(null);
  const [showFloatingTOC, setShowFloatingTOC] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  const autoExpanded = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      const pastThreshold = window.scrollY > 300;
      setShowBackToTop(pastThreshold);
      
      // Auto expand FABs once when scrolling past threshold on mobile
      if (pastThreshold && !autoExpanded.current && window.innerWidth < 768) {
        setFabExpanded(true);
        autoExpanded.current = true;
      }
      
      // Reset auto-expand if they scroll back to top
      if (!pastThreshold && autoExpanded.current) {
        autoExpanded.current = false;
        if (window.innerWidth < 768) {
          setFabExpanded(false);
          setShowFloatingTOC(false);
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ระบบแกะข้อความสร้างสารบัญ และจัดรูปแบบบทความ (รองรับทั้ง Plaintext เดิม และ HTML จาก Quill)
  const { toc, finalHtml } = useMemo(() => {
    let body = displayItem?.body || "";
    
    // Fix broken PDF SVG icons in older articles
    body = body.replace(/<path\s+d="M11\s+15l-1\.9\s+6h1\.9"\s*\/>\s*<path\s+d="M9\s+15l1\.9\s+6"\s*\/>/g, '<path d="M11 15h1a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-1v-6z" />');

    // Auto-convert legacy plain text to HTML paragraphs and line breaks
    if (body && !body.includes('<p') && !body.includes('<div') && !body.includes('<br')) {
      body = body.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
    }

    let isHtml = /<[a-z][\s\S]*>/i.test(body);
    const tocList = [];
    
    // 1. จัดการ Notes (ดึงข้อความมาทำ Tooltip)
    const notesRegex = /(?:<(h[1-6]|div|p)[^>]*>\s*(?:<[^>]+>\s*)*|##\s*|^\s*|\n\s*|<br\s*\/?>\s*)(?:Notes|เชิงอรรถ|Footnotes)\s*(?:<\/[^>]+>\s*)*(?:<\/(?:h[1-6]|div|p)>|<br\s*\/?>|\n)[\s\S]*$/i;
    const notesMatch = body.match(notesRegex);
    let notesDict = {};
    if (notesMatch) {
      const notesSection = notesMatch[0];
      body = body.replace(notesMatch[0], ""); // เอาออกจากเนื้อหาหลักก่อน
      
      // แปลงเนื้อหา note ให้เป็นบรรทัดๆ 
      // แปลง <li... > ให้กลายเป็นเลข 1. 2. 3. เพื่อให้ regex หาเจอเวลา Quill ทำ Auto-format เป็น Ordered List
      let liCounter = 1;
      let processedNotes = notesSection.replace(/<li[^>]*>/gi, () => `\n${liCounter++}. `);
      
      // เก็บ HTML ไว้ แต่เปลี่ยน tags ที่เป็น block ให้กลายเป็นบรรทัดใหม่
      const htmlText = processedNotes.replace(/<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/div>|<\/li>|<\/?ol[^>]*>|<\/?ul[^>]*>/gi, '\n')
                                     .replace(/<p[^>]*>|<div[^>]*>|<h[1-6][^>]*>/gi, '')
                                     .replace(/&nbsp;|&#160;|\u200B/gi, ' ');
      
      const noteLines = htmlText.split('\n');
      noteLines.forEach(line => {
        if (!line.trim()) return;
        const plainLine = line.replace(/<[^>]+>/g, '').trim();
        const plainMatch = plainLine.match(/^\s*(?:\[|\()?(\d+)(?:\.|\)|\])?\s+(.*)/);
        if (plainMatch) {
          const num = plainMatch[1];
          // Use DOM to safely remove the number at the beginning while preserving all HTML tags (like <a>)
          const div = document.createElement('div');
          div.innerHTML = line;
          let found = false;
          const walk = (node) => {
            if (found) return;
            if (node.nodeType === 3) {
               const text = node.nodeValue;
               if (text.trim() === '') return; // Skip leading whitespace
               const match = text.match(/^\s*(?:\[|\()?(\d+)(?:\.|\)|\])?\s*(.*)/);
               if (match && match[1] === num) {
                 node.nodeValue = match[2] || '';
                 found = true;
               } else {
                 found = true; // Stop if first non-empty text isn't the number
               }
            } else if (node.nodeType === 1) {
               for (let i = 0; i < node.childNodes.length; i++) {
                 walk(node.childNodes[i]);
                 if (found) break;
               }
            }
          };
          walk(div);
          notesDict[num] = div.innerHTML.trim();
        }
      });
    }

    if (!isHtml) {
      // แปลง Markdown-like headers (ข้ามบรรทัดที่ว่างเปล่า)
      body = body.replace(/^###\s+(.*)$/gm, (match, p1) => {
        if (!p1 || p1.trim() === '') return '<br/>';
        return `<h3>${p1}</h3>`;
      });
      body = body.replace(/^##\s+(.*)$/gm, (match, p1) => {
        if (!p1 || p1.trim() === '') return '<br/>';
        return `<h2>${p1}</h2>`;
      });
      
      // แปลง Blockquotes และดักจับ กุรอาน/หะดีษ แบบง่ายๆ (ข้ามบรรทัดว่าง)
      body = body.replace(/^>\s+(.*)$/gm, (match, p1) => {
        if (!p1 || p1.trim() === '') return '<br/>';
        if (p1.includes('อัลลอฮฺตรัส') || p1.includes('อัลกุรอาน')) {
          return `<blockquote class="quran-block">${p1}</blockquote>`;
        } else if (p1.includes('ร่อซูล') || p1.includes('นบี') || p1.includes('หะดีษ')) {
          return `<blockquote class="hadith-block">${p1}</blockquote>`;
        }
        return `<blockquote>${p1}</blockquote>`;
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
    }
    
    // ทำการแทนที่เชิงอรรถทั้งแบบ [1] และ <sup>1</sup> ให้กลายเป็น Tooltip Link
    body = body.replace(/<a[^>]*>\s*\[(\d+)\]\s*<\/a>|<sup>\s*<a[^>]*>(\d+)<\/a>\s*<\/sup>|<sup>\s*(\d+)\s*<\/sup>|\[(\d+)\]/gi, (match, p0, p1, p2, p3) => {
      const num = p0 || p1 || p2 || p3;
      if (!num) return match;
      const cleanNote = notesDict[num] ? notesDict[num].replace(/<[^>]*>?/gm, '') : '';
      const tooltip = cleanNote ? `data-footnote="${cleanNote.replace(/"/g, '&quot;')}"` : '';
      return `<sup><a href="#note-${num}" class="footnote-link" ${tooltip}>${num}</a></sup>`;
    });

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

    // แปลงอ้างอิงอัลกุรอาน (67:5) เป็นลิงก์ที่สามารถคลิกไปหน้า Quran ได้
    body = body.replace(/\((\d{1,3}):(\d{1,3})\)/g, (match, sura, ayah) => {
      if (Number(sura) >= 1 && Number(sura) <= 114) {
        return `(<a href="/quran?sura=${sura}&ayah=${ayah}" class="quran-ref-link" data-sura="${sura}" data-ayah="${ayah}" style="color: var(--teal); font-weight: 500; text-decoration: none;" title="เปิดดูอัลกุรอาน ซูเราะห์ที่ ${sura} อายะห์ที่ ${ayah}">${sura}:${ayah}</a>)`;
      }
      return match;
    });

    // ต่อท้ายด้วยส่วนประกอบ Notes สวยๆ
    if (notesMatch && Object.keys(notesDict).length > 0) {
       let notesHtml = '<div class="article-notes-section"><div class="notes-title">Footnotes / อ้างอิง</div>';
       for (const [key, val] of Object.entries(notesDict)) {
          let noteText = val.replace(/(<a\b[^>]*>[\s\S]*?<\/a>)|(<[^>]+>)|(\((?:Arabic text|ข้อความภาษาอาหรับ)\))/gi, (match, aTag, otherTag, arabic) => {
            if (aTag) return aTag;
            if (otherTag) return otherTag;
            if (arabic) return '<a href="#">(Arabic text)</a>';
            return match;
          });
          noteText = noteText.replace(/(<a\b[^>]*>[\s\S]*?<\/a>)|(<[^>]+>)|(https?:\/\/[^\s<"']+)/gi, (match, aTag, otherTag, url) => {
            if (aTag) return aTag;
            if (otherTag) return otherTag;
            if (url) return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
            return match;
          });
         notesHtml += `<div class="article-note-item" id="note-${key}" style="transition: background-color 0.5s"><span class="article-note-badge">${key}</span><div>${noteText}</div></div>`;
       }
       notesHtml += '</div>';
       body += notesHtml;
    }

    return { toc: tocList, finalHtml: body };
  }, [displayItem?.body]);

  const safeFinalHtml = useMemo(() => DOMPurify.sanitize(finalHtml, {
    ADD_TAGS: ["svg", "path"],
    ADD_ATTR: [
      "class",
      "style",
      "target",
      "rel",
      "data-footnote",
      "data-sura",
      "data-ayah",
      "viewBox",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "d",
    ],
  }), [finalHtml]);

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
      // 3. เช็คว่าเป็นลิงก์อัลกุรอาน (Quran Reference)
      else if (a.classList.contains('quran-ref-link') || (href && href.includes('/quran?sura='))) {
        e.preventDefault();
        const sura = a.getAttribute('data-sura');
        const ayah = a.getAttribute('data-ayah');
        if (sura && ayah) {
          go("quran", { sura: Number(sura), ayah: Number(ayah) });
        }
      }
    }
  };

  const related = relatedArticles
  const readerClass = `article-body reader-size-${readerPrefs.size} reader-tone-${readerPrefs.tone}`

  if (loadingArticles && !displayItem) {
    return <div className="article-page" style={{ textAlign: "center", padding: "100px 0" }}><i className="ti ti-loader-2 spin" style={{ fontSize: 32, color: "var(--teal)" }}></i></div>
  }

  return (
    <article className="article-page animate-float-cute" style={{ maxWidth: 720, margin: "0 auto" }}>
      {displayItem && (
        <SEOHead
          title={`${displayItem.title} | Talib Club`}
          description={truncate(stripHtml(displayItem.body || displayItem.excerpt || ''), 160)}
          canonical={`${BASE_URL}/article?id=${displayItem.id}`}
          ogImage={displayItem.coverUrl || null}
          ogType="article"
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": displayItem.title,
            "author": { "@type": "Person", "name": displayItem.author || "Talib Club" },
            "datePublished": displayItem.date || undefined,
            "image": displayItem.coverUrl || undefined,
            "publisher": {
              "@type": "Organization",
              "name": "Talib Club",
              "logo": { "@type": "ImageObject", "url": `${BASE_URL}/logo.png` }
            },
            "description": truncate(stripHtml(displayItem.body || ''), 200),
            "mainEntityOfPage": { "@type": "WebPage", "@id": `${BASE_URL}/article?id=${displayItem.id}` }
          }}
        />
      )}
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
          {isSeries && <span style={{ padding: "4px 12px", background: "linear-gradient(135deg, var(--acc), #d97706)", color: "#fff", borderRadius: 20, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 10px rgba(245,158,11,0.3)" }}>ซีรีส์ {displayItem.seriesId} ตอนที่ {displayItem.part}</span>}
          {displayItem.type === "specific" && displayItem.seriesName && <span style={{ padding: "4px 12px", background: "linear-gradient(135deg, var(--acc), #d97706)", color: "#fff", borderRadius: 20, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 10px rgba(245,158,11,0.3)" }}>{displayItem.seriesName}</span>}
        </div>
        <h1 className="article-title" style={{ position: "relative", zIndex: 1, fontSize: 32, lineHeight: 1.4, background: "linear-gradient(to right, var(--text), var(--teal))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {displayItem.title}
        </h1>

        <div style={{ display: "flex", gap: 16, color: "var(--t3)", fontSize: 12, fontWeight: 300, flexWrap: "wrap", marginTop: 12 }}>
          <span><i className="ti ti-user" style={{ marginRight: 4, fontSize: 13 }}></i>{displayItem.author}</span>
          <span><i className="ti ti-calendar" style={{ marginRight: 4, fontSize: 13 }}></i><time dateTime={displayItem.date}>{displayItem.date}</time></span>
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

      {/* Table of Contents (static) */}
      {toc.length > 0 && (
        <div className="article-toc animate-float-cute" style={{ animationDelay: "0.3s", marginBottom: 32, padding: "20px 24px", background: "var(--card)", borderRadius: 16, border: "1px solid var(--br)", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: "var(--teal)", display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-list" style={{ fontSize: 18 }}></i>
            สารบัญเนื้อหา
          </h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {toc.map((t, i) => (
              <li key={i} style={{ paddingLeft: t.level === 3 ? 16 : 0 }}>
                <a
                  href={`#${t.id}`}
                  style={{ color: "var(--t2)", textDecoration: "none", fontSize: t.level === 2 ? 14 : 13, fontWeight: t.level === 2 ? 500 : 400, display: "inline-flex", alignItems: "flex-start", gap: 8 }}
                  className="hover-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <i className="ti ti-chevron-right" style={{ fontSize: 12, marginTop: 3, opacity: 0.5, flexShrink: 0 }}></i>
                  <span>{t.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div 
        className={`${readerClass} animate-float-cute`} 
        style={{ scrollBehavior: "smooth", animationDelay: "0.4s", padding: "16px 20px" }}
        onClick={handleArticleClick}
        dangerouslySetInnerHTML={{ __html: safeFinalHtml }}
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
            <i className="ti ti-list-numbers" style={{ fontSize: 18 }}></i> ตอนทั้งหมดในซีรีส์ &quot;{seriesName}&quot; ({seriesArticles.length} ตอน)
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
              <div key={r.id} className="card" style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }} onClick={() => go("article", { ...r, fromFilters: displayItem?.fromFilters || item?.fromFilters })}>
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
            <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", background: "rgba(0,0,0,0.5)", padding: "4px 12px", borderRadius: 20, fontSize: 12 }}>
            กดปุ่ม ESC เพื่อปิด
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Buttons */}
      {(showBackToTop || toc.length > 0) && createPortal(
        <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 12, zIndex: 2147483647, alignItems: "center" }}>
          {fabExpanded && (
            <>
              {showBackToTop && (
                <button 
                  className="btn btn-teal hover-wiggle animate-fade-in-up"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  title="กลับขึ้นบนสุด"
                  style={{ width: 48, height: 48, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(20,184,166,0.4)" }}
                >
                  <i className="ti ti-arrow-up" style={{ fontSize: 24 }}></i>
                </button>
              )}

              {toc.length > 0 && (
                <button 
                  className="btn btn-acc hover-wiggle animate-fade-in-up"
                  onClick={() => setShowFloatingTOC(true)}
                  title="สารบัญเนื้อหา"
                  style={{ width: 48, height: 48, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(245,158,11,0.4)" }}
                >
                  <i className="ti ti-list" style={{ fontSize: 24 }}></i>
                </button>
              )}
            </>
          )}

          <button 
            className="btn btn-outline hover-opacity"
            onClick={() => {
              if (fabExpanded) {
                setShowFloatingTOC(false);
              }
              setFabExpanded(!fabExpanded);
            }}
            title={fabExpanded ? "ซ่อนเมนู" : "แสดงเมนู"}
            style={{ width: 40, height: 40, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", border: "1px solid var(--br)", color: "var(--t3)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", marginTop: fabExpanded ? 4 : 0 }}
          >
            <i className={`ti ti-chevron-${fabExpanded ? "down" : "up"}`} style={{ fontSize: 18 }}></i>
          </button>
        </div>,
        document.body
      )}

      {/* Floating TOC Panel (No dark overlay) */}
      {showFloatingTOC && createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2147483646 }} onClick={() => setShowFloatingTOC(false)}>
          <div 
            className="animate-fade-in-up"
            style={{ position: "absolute", bottom: 90, right: 24, background: "var(--bg)", width: 300, maxHeight: "60vh", borderRadius: 16, padding: 20, overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.15)", border: "1px solid var(--br)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "var(--teal)", display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-list" style={{ fontSize: 18 }}></i>
                สารบัญ
              </h3>
              <button className="btn btn-outline" onClick={() => setShowFloatingTOC(false)} style={{ width: 28, height: 28, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-x" style={{ fontSize: 14 }}></i>
              </button>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {toc.map((t, i) => (
                <li key={i} style={{ paddingLeft: t.level === 3 ? 16 : 0 }}>
                  <a
                    href={`#${t.id}`}
                    style={{ color: "var(--t2)", textDecoration: "none", fontSize: t.level === 2 ? 13 : 12, fontWeight: t.level === 2 ? 500 : 400, display: "inline-flex", alignItems: "flex-start", gap: 6 }}
                    className="hover-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowFloatingTOC(false);
                      document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize: 10, marginTop: 3, opacity: 0.5, flexShrink: 0 }}></i>
                    <span>{t.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body
      )}

    </article>
  )
}

function getSavedReaderPrefs() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(READER_STORAGE_KEY) || "{}")
    return { size: READER_SIZE_LABELS[saved.size] ? saved.size : READER_DEFAULTS.size, tone: READER_TONE_LABELS[saved.tone] ? saved.tone : READER_DEFAULTS.tone }
  } catch { return READER_DEFAULTS }
}
