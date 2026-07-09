import { useState, useEffect, useMemo, useRef } from "react"
import ReactQuill from "react-quill"
import "react-quill/dist/quill.snow.css"

const Quill = ReactQuill.Quill;
if (Quill) {
  const Inline = Quill.import('blots/inline');
  class NumberCircleBlot extends Inline { }
  NumberCircleBlot.blotName = 'numberCircle';
  NumberCircleBlot.tagName = 'span';
  NumberCircleBlot.className = 'numberCircleBlue';
  Quill.register(NumberCircleBlot, true);

  class HighlightTextBlot extends Inline { }
  HighlightTextBlot.blotName = 'highlightText';
  HighlightTextBlot.tagName = 'span';
  HighlightTextBlot.className = 'text-highlight-yellow';
  Quill.register(HighlightTextBlot, true);

  class DropCapBlot extends Inline { }
  DropCapBlot.blotName = 'dropCap';
  DropCapBlot.tagName = 'span';
  DropCapBlot.className = 'drop-cap';
  Quill.register(DropCapBlot, true);

  const BlockEmbed = Quill.import('blots/block/embed');
  class PdfAttachmentBlot extends BlockEmbed {
    static create(value) {
      let node = super.create();
      node.setAttribute('href', value.url || '#');
      node.setAttribute('target', '_blank');
      node.setAttribute('contenteditable', 'false');
      
      node.innerHTML = `
        <div class="pdf-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" /><path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6" /><path d="M17 18h2" /><path d="M20 15h-3v6" /><path d="M11 15l-1.9 6h1.9" /><path d="M9 15l1.9 6" /></svg>
        </div>
        <div class="pdf-details">
          <div class="pdf-title">${value.title || 'PDF Document'}</div>
          <div class="pdf-action">View PDF File</div>
          ${value.pages ? `<div class="pdf-meta">${value.pages}</div>` : ''}
        </div>
      `;
      return node;
    }

    static value(node) {
      return {
        url: node.getAttribute('href'),
        title: node.querySelector('.pdf-title')?.innerText || '',
        pages: node.querySelector('.pdf-meta')?.innerText || ''
      };
    }
  }
  PdfAttachmentBlot.blotName = 'pdfAttachment';
  PdfAttachmentBlot.tagName = 'a';
  PdfAttachmentBlot.className = 'pdf-attachment-block';
  Quill.register(PdfAttachmentBlot, true);

  const Block = Quill.import('blots/block');
  
  class ArabicBlock extends Block { }
  ArabicBlock.blotName = 'arabicBlock';
  ArabicBlock.tagName = 'div';
  ArabicBlock.className = 'arabic-text-block';
  Quill.register(ArabicBlock, true);

  class CalloutInfo extends Block { }
  CalloutInfo.blotName = 'calloutInfo';
  CalloutInfo.tagName = 'div';
  CalloutInfo.className = 'callout-info';
  Quill.register(CalloutInfo, true);

  class CalloutWarn extends Block { }
  CalloutWarn.blotName = 'calloutWarn';
  CalloutWarn.tagName = 'div';
  CalloutWarn.className = 'callout-warn';
  Quill.register(CalloutWarn, true);

  class DividerBlot extends BlockEmbed { }
  DividerBlot.blotName = 'divider';
  DividerBlot.tagName = 'hr';
  Quill.register(DividerBlot, true);

  const ImageFormat = Quill.import('formats/image');
  class FloatRightImageBlot extends ImageFormat {
    static create(value) {
      let node = super.create(value);
      node.setAttribute('class', 'float-right-image');
      return node;
    }
  }
  FloatRightImageBlot.blotName = 'floatRightImage';
  FloatRightImageBlot.tagName = 'img';
  Quill.register(FloatRightImageBlot, true);

  class AudioBlot extends BlockEmbed {
    static create(value) {
      let node = super.create();
      node.setAttribute('controls', '');
      node.setAttribute('src', value);
      node.style.width = '100%';
      node.style.maxWidth = '400px';
      node.style.margin = '16px 0';
      node.style.display = 'block';
      return node;
    }
    static value(node) {
      return node.getAttribute('src');
    }
  }
  AudioBlot.blotName = 'audio';
  AudioBlot.tagName = 'audio';
  Quill.register(AudioBlot, true);
}

import { ARTICLES, DEFAULT_TAXONOMY } from "../../data/index.js"
import { useContentCollection, useTaxonomySettings, bulkDeleteItems, bulkSaveItems } from "../../lib/contentStore.js"
import { confirmAction, notifyError, notifySuccess } from "../../utils/feedback.jsx"
import ContentStatusBanner from "../../components/ContentStatusBanner.jsx"
import BroadcastModal from "./components/BroadcastModal.jsx"
import { clampPage } from "../../utils/pagination.js"
import { getDownloadURL, ref, uploadBytes, getStorage } from "firebase/storage"
import { storage, app } from "../../lib/firebase.js"
import { compressImage } from "../../utils/image.js"
import { triggerPushNotification } from "../../utils/pushNotifications.js"

const EMPTY = {
  type: "general",
  seriesId: "",
  seriesName: "",
  part: "",
  title: "",
  category: "aqeedah",
  excerpt: "",
  author: "Talib Club",
  date: `${new Date().getFullYear() + 543}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
  tags: [],
  body: "",
  coverUrl: "",
  coverEmoji: "📖",
}

// ตัวช่วยเช็คประเภทให้ยืดหยุ่นขึ้น (รองรับทั้งภาษาไทยและอังกฤษ)
const isSeriesType = (typeVal) => {
  if (!typeVal) return false;
  const str = String(typeVal).toLowerCase();
  return str === "series" || str === "ซีรีส์";
};

export default function AdminArticles() {
  const adminQueryOptions = useMemo(() => ({ live: false }), [])
  const { items, loading, error, saveItem, deleteItem, isUsingFallback } = useContentCollection("articles", ARTICLES, null, adminQueryOptions)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)

  const [editing, setEdit] = useState(null)

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [seriesFilter, setSeriesFilter] = useState("all") // ✅ เพิ่ม State สำหรับกรองซีรีส์
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sortOrder, setSortOrder] = useState("newest")

  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)

  const [bulkType, setBulkType] = useState("")
  const [bulkCategory, setBulkCategory] = useState("")
  const [bulkSeries, setBulkSeries] = useState("")
  const [bulkAuthor, setBulkAuthor] = useState("")
  const [bulkDate, setBulkDate] = useState("")

  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 20

  // รีเซ็ตซีรีส์เป็นทั้งหมด ถ้าเปลี่ยนประเภทเป็นอย่างอื่นที่ไม่ใช่ซีรีส์
  useEffect(() => {
    if (!isSeriesType(typeFilter)) {
      setSeriesFilter("all")
    }
  }, [typeFilter])

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, categoryFilter, seriesFilter, sortOrder])

  const filtered = items.filter(a => {
    const matchSearch = String(a.title || "").toLowerCase().includes(search.toLowerCase()) ||
      String(a.author || "").toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === "all" ||
      (isSeriesType(typeFilter) ? isSeriesType(a.type) : String(a.type) === typeFilter)
    const matchCat = categoryFilter === "all" || a.category === categoryFilter
    const matchSeries = seriesFilter === "all" || a.seriesId === seriesFilter // ✅ กรองด้วย seriesId

    return matchSearch && matchType && matchCat && matchSeries
  })

  // เรียงข้อมูลจากใหม่ไปเก่า (เรียงตามวันที่ หรือ ID ถ้าวันที่เหมือนกัน)
  const sorted = [...filtered].sort((a, b) => {
    const parseDateToMs = (dateStr) => {
      if (!dateStr || typeof dateStr !== "string") return 0
      const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (match) {
        let year = parseInt(match[1], 10)
        const month = parseInt(match[2], 10) - 1
        const day = parseInt(match[3], 10)
        if (year > 2400) year -= 543
        return new Date(year, month, day).getTime()
      }
      const parsed = Date.parse(dateStr)
      return isNaN(parsed) ? 0 : parsed
    }

    const dateA = a.date || ""
    const dateB = b.date || ""
    const timeA = parseDateToMs(dateA)
    const timeB = parseDateToMs(dateB)
    if (sortOrder === "newest") {
      if (timeA !== timeB) return timeB - timeA
      return String(b.id || "").localeCompare(String(a.id || ""))
    } else {
      if (timeA !== timeB) return timeA - timeB
      return String(a.id || "").localeCompare(String(b.id || ""))
    }
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE) || 1)
  const safePage = clampPage(page, totalPages)
  const currentItems = sorted.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleAll = () => {
    if (selected.length === sorted.length) setSelected([])
    else setSelected(sorted.map(a => a.id))
  }

  function openNew() {
    setEdit({ ...EMPTY, id: crypto.randomUUID() })
  }

  function openEdit(article) {
    setEdit({ ...article, tags: [...(article.tags || [])] })
  }

  async function save() {
    if (!editing.title?.trim()) return notifyError("กรุณาใส่ชื่อบทความ")
    if (isSeriesType(editing.type) && (!editing.seriesId?.trim() || !editing.part)) {
      return notifyError("บทความซีรีส์ต้องระบุรหัสซีรีส์และหมายเลขตอน")
    }

    // เช็คประเภทซีรีส์ให้ยืดหยุ่นขึ้น
    const payload = { ...editing, part: isSeriesType(editing.type) && editing.part ? Number(editing.part) : null }
    delete payload.readTime;

    setBusy(true)
    try {
      await saveItem(payload)
      setEdit(null)
      notifySuccess("บันทึกบทความขึ้นเว็บไซต์เรียบร้อยแล้ว")
    } catch (err) {
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function remove(article) {
    if (busy) return
    const ok = await confirmAction({ title: "ลบบทความนี้?", message: `บทความ "${article.title}" จะถูกซ่อนจากหน้าเว็บไซต์`, confirmText: "ลบบทความ", danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await deleteItem(article.id)
      setSelected(prev => prev.filter(id => id !== article.id))
      notifySuccess("ลบบทความเรียบร้อยแล้ว")
    } catch (err) {
      notifyError("ลบไม่สำเร็จ กรุณาตรวจสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function removeSelected() {
    const ok = await confirmAction({ title: `ยืนยันการลบ ${selected.length} รายการ?`, message: "ข้อมูลที่ถูกเลือกรวมถึงเนื้อหาทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้", confirmText: "ยืนยันการลบ", danger: true })
    if (!ok) return
    setBusy(true)
    const toDelete = [...selected]
    try {
      const { deleted, failed } = await bulkDeleteItems("articles", toDelete)
      setSelected([])
      if (failed === 0) {
        notifySuccess(`ลบ ${deleted} บทความเรียบร้อยแล้ว`)
      } else {
        notifyError(`ลบสำเร็จ ${deleted} รายการ แต่ล้มเหลว ${failed} รายการ — กรุณาตรวจสิทธิ์ Firestore`)
      }
    } catch (err) {
      notifyError("เกิดข้อผิดพลาดในการลบข้อมูล")
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkUpdate() {
    if (selected.length === 0) return
    const ok = await confirmAction({
      title: `ยืนยันการแก้ไข ${selected.length} รายการ?`,
      message: "ฟิลด์ที่กรอก/เลือกไว้จะถูกอัปเดตทดแทนค่าเดิมในบทความทั้งหมดที่เลือก",
      confirmText: "ยืนยันการอัปเดต",
      confirmColor: "var(--teal)"
    })
    if (!ok) return

    setBusy(true)
    try {
      const updatedItems = selected.map(id => {
        const original = items.find(a => String(a.id) === String(id))
        if (!original) return null
        const next = { ...original }
        if (bulkType) {
          next.type = bulkType
          if (isSeriesType(bulkType)) {
            next.seriesId = bulkSeries || original.seriesId || ""
          } else {
            next.seriesId = ""
            next.part = null
          }
        }
        if (bulkCategory) next.category = bulkCategory
        if (bulkAuthor !== undefined && bulkAuthor !== "") next.author = bulkAuthor
        if (bulkDate) next.date = bulkDate
        delete next.readTime
        return next
      }).filter(Boolean)

      const { saved, failed } = await bulkSaveItems("articles", updatedItems)
      setBulkType("")
      setBulkCategory("")
      setBulkSeries("")
      setBulkAuthor("")
      setBulkDate("")
      setSelected([])
      if (failed === 0) {
        notifySuccess(`อัปเดตข้อมูลบทความ ${saved} รายการเรียบร้อยแล้ว`)
      } else {
        notifyError(`อัปเดตสำเร็จ ${saved} รายการ แต่ล้มเหลว ${failed} รายการ`)
      }
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการอัปเดตข้อมูล")
    } finally {
      setBusy(false)
    }
  }

  const [showBroadcastModal, setShowBroadcastModal] = useState(false)

  const handleBroadcast = () => {
    setShowBroadcastModal(true)
  }

  const submitBroadcast = async (title, body) => {
    setShowBroadcastModal(false)
    
    const confirmed = await confirmAction(`ยืนยันการส่ง Push Notification ไปยังทุกคนใช่หรือไม่?`)
    if (!confirmed) return

    setBusy(true)
    try {
      const result = await triggerPushNotification(title, body, "/articles")
      if (result.success) {
        notifySuccess(`ส่งแจ้งเตือนสำเร็จไปยัง ${result.count} อุปกรณ์`)
      } else {
        notifyError(`ส่งแจ้งเตือนล้มเหลว: ${result.error}`)
      }
    } catch (err) {
      notifyError("เกิดข้อผิดพลาดในการส่งแจ้งเตือน")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return <ArticleForm item={editing} setItem={setEdit} onSave={save} onCancel={() => setEdit(null)} taxonomy={taxonomy} busy={busy} />
  }

  return (
    <div>
      {/* ━━━ HEADER SECTION ━━━ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <h2 style={{ fontSize: 20, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            บทความ <span style={{ fontSize: 13, color: "var(--t3)", fontWeight: 400 }}>({sorted.length})</span>
          </h2>
          <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 4, marginBottom: 0 }}>
            {totalPages > 0 ? `หน้า ${safePage}/${totalPages}` : "จัดการบทความทั้งหมด"}
          </p>
          <ContentStatusBanner loading={loading} error={error} isUsingFallback={isUsingFallback} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={handleBroadcast} disabled={busy} title="บรอดแคสต์" style={{ padding: "8px 12px", borderRadius: 10, opacity: busy ? 0.6 : 1, color: "var(--teal)", borderColor: "var(--teal)" }}>
            <i className="ti ti-bell-ringing" style={{ fontSize: 18 }}></i>
          </button>
          <button className="btn btn-teal" onClick={openNew} disabled={busy} style={{ padding: "8px 16px", borderRadius: 10, opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-plus" style={{ fontSize: 18 }}></i>
            <span style={{ fontSize: 14 }}>เพิ่มใหม่</span>
          </button>
        </div>
      </div>

      {/* ━━━ SEARCH & FILTER BAR ━━━ */}
      <div style={{ display: "flex", gap: 8, marginBottom: showAdvanced ? 12 : 24 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 16 }}></i>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อบทความ, ผู้เขียน..."
            style={{ width: "100%", paddingLeft: 42, borderRadius: 24, padding: "12px 16px 12px 42px", background: "var(--bg2)", border: "1px solid transparent", fontSize: 14, outline: "none", transition: "border 0.2s" }}
            onFocus={(e) => e.target.style.border = "1px solid var(--teal)"}
            onBlur={(e) => e.target.style.border = "1px solid transparent"}
          />
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ 
            padding: "0 18px", 
            borderRadius: 24, 
            background: showAdvanced ? "var(--teal)" : "var(--bg2)", 
            color: showAdvanced ? "#fff" : "var(--text)", 
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s"
          }}
          title="ตัวกรองเพิ่มเติม"
        >
          <i className="ti ti-filter" style={{ fontSize: 18 }}></i>
        </button>
      </div>

      {/* ━━━ EXPANDABLE FILTERS ━━━ */}
      {showAdvanced && (
        <div style={{ background: "var(--bg2)", padding: "16px", borderRadius: 16, marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>ประเภท</span>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              <option value="all">-- ทุกประเภท --</option>
              {(taxonomy.articleTypes || []).map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </label>

          {isSeriesType(typeFilter) && (
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>ซีรีส์</span>
              <select value={seriesFilter} onChange={e => setSeriesFilter(e.target.value)} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                <option value="all">-- ทุกซีรีส์ --</option>
                {(taxonomy.articleSeries || []).map(series => (
                  <option key={series.id} value={series.id}>{series.name}</option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>หมวดหมู่</span>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              <option value="all">-- ทุกหมวดหมู่ --</option>
              {(taxonomy.articleCategories || []).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>การเรียงลำดับ</span>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ background: "var(--card)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              <option value="newest">ใหม่ไปเก่า</option>
              <option value="oldest">เก่าไปใหม่</option>
            </select>
          </label>
        </div>
      )}

      {selected.length > 0 && (
        <div className="card" style={{ border: "1.5px solid var(--teal)", padding: 20, borderRadius: 16, marginBottom: 20, background: "var(--teal-bg)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: "var(--teal)", fontWeight: 600 }}>
              <i className="ti ti-checkbox" style={{ marginRight: 6 }}></i>
              เลือกอยู่ {selected.length} รายการ
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setSelected([])} style={{ fontSize: 12, padding: "6px 12px" }}>
                ยกเลิกการเลือก
              </button>
              <button className="btn" style={{ background: "#e05555", color: "#fff", padding: "6px 12px", fontSize: 12 }} onClick={removeSelected} disabled={busy}>
                <i className={busy ? "ti ti-loader-2 spin" : "ti ti-trash"} style={{ marginRight: 6 }}></i>
                {busy ? "กำลังลบ..." : "ลบที่เลือก"}
              </button>
            </div>
          </div>

          <div className="divider" style={{ margin: "0 0 16px" }} />

          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
            <i className="ti ti-edit" style={{ marginRight: 6, color: "var(--teal)" }}></i>
            แก้ไขข้อมูลพร้อมกันทั้งหมด (Bulk Edit)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนประเภท</span>
              <select value={bulkType} onChange={e => {
                setBulkType(e.target.value);
                if (!isSeriesType(e.target.value)) setBulkSeries("");
              }} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                {(taxonomy.articleTypes || []).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนหมวดหมู่</span>
              <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                <option value="">-- ไม่เปลี่ยน --</option>
                {(taxonomy.articleCategories || []).map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
              </select>
            </label>

            {isSeriesType(bulkType) && (
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>ย้ายเข้าซีรีส์</span>
                <select value={bulkSeries} onChange={e => setBulkSeries(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--card)" }}>
                  <option value="">-- เลือกซีรีส์ --</option>
                  {(taxonomy.articleSeries || []).map(series => <option key={series.id} value={series.id}>{series.name}</option>)}
                </select>
              </label>
            )}

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนชื่อผู้เขียน</span>
              <input value={bulkAuthor} onChange={e => setBulkAuthor(e.target.value)} placeholder="เช่น Talib Club" style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>เปลี่ยนวันที่</span>
              <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--br)" }} />
            </label>

            <button
              className="btn btn-teal"
              onClick={handleBulkUpdate}
              disabled={busy || (!bulkType && !bulkCategory && !bulkAuthor && !bulkDate)}
              style={{ padding: "8px 16px", fontSize: 12, height: "34px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <i className={busy ? "ti ti-loader-2 spin" : "ti ti-device-floppy"}></i>
              {busy ? "กำลังอัปเดต..." : "อัปเดตข้อมูลที่เลือก"}
            </button>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 12, color: "var(--t2)" }}>
            <input type="checkbox" checked={selected.length === sorted.length && sorted.length > 0} onChange={toggleAll} disabled={busy} style={{ width: 16, height: 16, cursor: busy ? "not-allowed" : "pointer" }} />
            เลือกทั้งหมด {sorted.length} รายการที่ค้นเจอ
          </label>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {currentItems.map(article => {
          // หากเป็นบทความซีรีส์ ให้ดึงชื่อซีรีส์มาแสดง
          const seriesInfo = isSeriesType(article.type) && taxonomy.articleSeries?.find(s => s.id === article.seriesId);

          return (
            <div key={article.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: busy ? 0.6 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={selected.includes(article.id)} onChange={() => toggleSelect(article.id)} disabled={busy} style={{ width: 18, height: 18, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="tag tag-teal">{article.category}</span>
                    {/* เช็คประเภทซีรีส์ให้ยืดหยุ่นขึ้น และแสดงชื่อซีรีส์ถ้ามี */}
                    {isSeriesType(article.type) && (
                      <span className="tag" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {seriesInfo?.name || "ซีรีส์"}
                        {article.part && <span style={{ opacity: 0.8 }}>ตอนที่ {article.part}</span>}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{article.title}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300, marginTop: 4 }}>{article.author} · {article.date}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="btn btn-outline" onClick={() => openEdit(article)} disabled={busy} style={{ padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}><i className="ti ti-pencil"></i></button>
                <button className="btn btn-outline" style={{ color: "#e05555", borderColor: "rgba(224,85,85,.3)", padding: "6px 12px", fontSize: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => remove(article)} disabled={busy}><i className="ti ti-trash"></i></button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <div className="empty">ไม่พบบทความที่ตรงกับเงื่อนไข</div>}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 32, flexWrap: "wrap" }}>
          <button className="btn btn-outline" disabled={page === 1} onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }} style={{ padding: "6px 12px", fontSize: 12 }}>ก่อนหน้า</button>
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
              return <button key={p} onClick={() => { setPage(p); window.scrollTo(0, 0); }} className={page === p ? "btn btn-teal" : "btn btn-outline"} style={{ padding: "6px 14px", fontSize: 12 }}>{p}</button>
            }
            if (p === page - 2 || p === page + 2) return <span key={p} style={{ color: "var(--t3)", padding: "0 4px" }}>...</span>
            return null;
          })}
          <button className="btn btn-outline" disabled={page === totalPages} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }} style={{ padding: "6px 12px", fontSize: 12 }}>ถัดไป</button>
        </div>
      )}
      
      <BroadcastModal 
        isOpen={showBroadcastModal} 
        onClose={() => setShowBroadcastModal(false)}
        onSubmit={submitBroadcast}
        defaultTitle="บทความใหม่!"
      />
    </div>
  )
}

const QuillPromptModal = ({ isOpen, type, onClose, onSubmit }) => {
  const [data, setData] = useState({ text1: '', text2: '', text3: '' });

  useEffect(() => {
    if (isOpen) setData({ text1: '', text2: '', text3: '' });
  }, [isOpen, type]);

  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSubmit(data);
    if (e.key === 'Escape') onClose();
  }

  let title = '';
  let input1 = null, input2 = null, input3 = null;

  if (type === 'numberCircle') {
    title = 'ตัวเลขวงกลม';
    input1 = { label: 'กรุณาใส่ตัวเลข (เช่น 01, 02)', key: 'text1', placeholder: '01' };
  } else if (type === 'pdf') {
    title = 'แนบไฟล์ PDF';
    input1 = { label: 'ลิงก์ไฟล์ PDF (URL)', key: 'text1', placeholder: 'https://...' };
    input2 = { label: 'หัวข้อไฟล์ [เว้นว่างได้]', key: 'text2', placeholder: 'เช่น Arabic, English Translation' };
    input3 = { label: 'จำนวนหน้า [เว้นว่างได้]', key: 'text3', placeholder: 'เช่น 2 pages' };
  } else if (type === 'floatImage') {
    title = 'แทรกรูปภาพชิดขวา';
    input1 = { label: 'ลิงก์รูปภาพ (URL)', key: 'text1', placeholder: 'https://...' };
  } else if (type === 'audio') {
    title = 'แทรกไฟล์เสียง';
    input1 = { label: 'ลิงก์ไฟล์เสียง (เช่น .mp3 URL)', key: 'text1', placeholder: 'https://...' };
  } else if (type === 'quran') {
    title = 'แทรกอัลกุรอาน';
    input1 = { label: 'เลขซูเราะห์ (เช่น 2 สำหรับอัล-บะเกาะเราะฮฺ)', key: 'text1', placeholder: '2' };
    input2 = { label: 'เลขอายะฮ์', key: 'text2', placeholder: '255' };
  } else if (type === 'footnote') {
    title = 'เพิ่มเชิงอรรถ (Footnote)';
    input1 = { label: 'กรุณาพิมพ์คำอธิบายเชิงอรรถสำหรับจุดนี้', key: 'text1', placeholder: 'คำอธิบาย...' };
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 400, maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text)' }}>{title}</h3>
        {input1 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--t2)' }}>{input1.label}</label>
            <input type="text" className="input" autoFocus value={data.text1} onChange={e => setData({...data, text1: e.target.value})} onKeyDown={handleKeyDown} placeholder={input1.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--br)', borderRadius: 6 }} />
          </div>
        )}
        {input2 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--t2)' }}>{input2.label}</label>
            <input type="text" className="input" value={data.text2} onChange={e => setData({...data, text2: e.target.value})} onKeyDown={handleKeyDown} placeholder={input2.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--br)', borderRadius: 6 }} />
          </div>
        )}
        {input3 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--t2)' }}>{input3.label}</label>
            <input type="text" className="input" value={data.text3} onChange={e => setData({...data, text3: e.target.value})} onKeyDown={handleKeyDown} placeholder={input3.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--br)', borderRadius: 6 }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button className="btn btn-outline" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6 }}>ยกเลิก</button>
          <button className="btn btn-teal" onClick={() => onSubmit(data)} style={{ padding: '8px 16px', borderRadius: 6 }}>ตกลง</button>
        </div>
      </div>
    </div>
  )
}

const CustomToolbar = React.memo(() => (
  <div id="admin-article-toolbar">
    <span className="ql-formats">
      <select className="ql-header" defaultValue="">
        <option value="2" />
        <option value="3" />
        <option value="" />
      </select>
    </span>
    <span className="ql-formats">
      <button className="ql-bold" />
      <button className="ql-italic" />
      <button className="ql-underline" />
      <button className="ql-align" value="right" data-title="ชิดขวา" />
      <button className="ql-align" value="justify" data-title="กระจาย" />
    </span>
    <span className="ql-formats">
      <button className="ql-blockquote" />
      <button className="ql-arabicBlock" data-title="จัดข้อความภาษาอาหรับ" />
      <button className="ql-calloutInfo" data-title="กล่องข้อมูล (สีเขียว)" />
      <button className="ql-calloutWarn" data-title="กล่องคำเตือน (สีแดง)" />
    </span>
    <span className="ql-formats">
      <button className="ql-list" value="ordered" />
      <button className="ql-list" value="bullet" />
    </span>
    <span className="ql-formats">
      <button className="ql-script" value="sub" />
      <button className="ql-script" value="super" />
    </span>
    <span className="ql-formats">
      <select className="ql-color" />
      <select className="ql-background" />
      <button className="ql-highlightText" data-title="ไฮไลต์เน้นคำ (HL)" />
      <button className="ql-dropCap" data-title="ตัวอักษรใหญ่ (Drop Cap)" />
    </span>
    <span className="ql-formats">
      <button className="ql-link" />
      <button className="ql-image" />
      <button className="ql-insertFloatImage" data-title="แทรกรูปภาพชิดขวา" />
      <button className="ql-insertAudio" data-title="แทรกไฟล์เสียง (Audio)" />
    </span>
    <span className="ql-formats">
      <button className="ql-clean" />
      <button className="ql-insertDivider" data-title="แทรกเส้นคั่น (Divider)" />
    </span>
    <span className="ql-formats">
      <button className="ql-numberCircle" data-title="ตัวเลขวงกลม (เช่น 01)" />
    </span>
    <span className="ql-formats">
      <button className="ql-insertFootnote" data-title="เพิ่มเชิงอรรถ (FN)" />
      <button className="ql-insertQuran" data-title="แทรกอัลกุรอาน (QR)" />
      <button className="ql-insertPdf" data-title="แนบไฟล์ PDF" />
    </span>
  </div>
), () => true);

function ArticleForm({ item, setItem, onSave, onCancel, taxonomy, busy }) {
  const set = (key, value) => setItem(prev => ({ ...prev, [key]: value }))
  const [uploadingImage, setUploadingImage] = useState(false)
  
  const promptHandlerRef = useRef(null);
  const [promptState, setPromptState] = useState(null);
  const reactQuillRef = useRef(null);

  useEffect(() => {
    promptHandlerRef.current = (type) => {
      return new Promise((resolve) => {
        setPromptState({
          type,
          onSubmit: (data) => {
            setPromptState(null);
            resolve(data);
          },
          onClose: () => {
            setPromptState(null);
            resolve(null);
          }
        });
      });
    };
  }, []);

  const quillModules = useMemo(() => ({
    toolbar: {
      container: "#admin-article-toolbar",
      handlers: {
        numberCircle: async function() {
          const quill = this.quill;
          const range = quill.getSelection();
          if (range && range.length > 0) {
            const currentFormat = quill.getFormat(range);
            quill.format('numberCircle', !currentFormat.numberCircle);
          } else {
            const data = await promptHandlerRef.current('numberCircle');
            if (!data || !data.text1) return;
            const insertRange = quill.getSelection(true);
            quill.insertText(insertRange.index, data.text1, 'numberCircle', true);
            quill.setSelection(insertRange.index + data.text1.length);
          }
        },
        highlightText: function() {
          const quill = this.quill;
          const range = quill.getSelection();
          if (range && range.length > 0) {
            const currentFormat = quill.getFormat(range);
            quill.format('highlightText', !currentFormat.highlightText);
          } else {
            window.alert("กรุณาคลุมดำข้อความที่ต้องการไฮไลต์ก่อนครับ");
          }
        },
        dropCap: function() {
          const quill = this.quill;
          const range = quill.getSelection();
          if (range && range.length > 0) {
            const currentFormat = quill.getFormat(range);
            quill.format('dropCap', !currentFormat.dropCap);
          } else {
            window.alert("กรุณาคลุมดำตัวอักษร 1 ตัวที่ต้องการทำ Drop Cap ก่อนครับ");
          }
        },
        arabicBlock: function() {
          const quill = this.quill;
          const range = quill.getSelection(true);
          const currentFormat = quill.getFormat(range);
          quill.format('arabicBlock', !currentFormat.arabicBlock);
        },
        calloutInfo: function() {
          const quill = this.quill;
          const range = quill.getSelection(true);
          const currentFormat = quill.getFormat(range);
          quill.format('calloutInfo', !currentFormat.calloutInfo);
        },
        calloutWarn: function() {
          const quill = this.quill;
          const range = quill.getSelection(true);
          const currentFormat = quill.getFormat(range);
          quill.format('calloutWarn', !currentFormat.calloutWarn);
        },
        insertDivider: function() {
          const quill = this.quill;
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'divider', true, 'user');
          quill.setSelection(range.index + 1);
        },
        insertPdf: async function() {
          const quill = this.quill;
          const data = await promptHandlerRef.current('pdf');
          if (!data || !data.text1) return;
          const url = data.text1;
          const title = data.text2 || "PDF Document";
          const pages = data.text3;

          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'pdfAttachment', { url, title, pages }, 'user');
          quill.setSelection(range.index + 1);
        },
        insertFloatImage: async function() {
          const quill = this.quill;
          const data = await promptHandlerRef.current('floatImage');
          if (!data || !data.text1) return;
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'floatRightImage', data.text1, 'user');
          quill.setSelection(range.index + 1);
        },
        insertAudio: async function() {
          const quill = this.quill;
          const data = await promptHandlerRef.current('audio');
          if (!data || !data.text1) return;
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'audio', data.text1, 'user');
          quill.setSelection(range.index + 1);
        },
        insertQuran: async function() {
          const quill = this.quill;
          const data = await promptHandlerRef.current('quran');
          if (!data || !data.text1 || !data.text2) return;
          const sura = data.text1;
          const ayah = data.text2;

          const range = quill.getSelection(true);
          const linkText = `[อัลกุรอาน ${sura}:${ayah}]`;
          
          quill.insertText(range.index, linkText, 'link', `/quran?sura=${sura}&ayah=${ayah}`);
          quill.setSelection(range.index + linkText.length);
        },
        insertFootnote: async function() {
          const quill = this.quill;
          const data = await promptHandlerRef.current('footnote');
          if (!data || !data.text1) return;
          const text = data.text1;

          const range = quill.getSelection(true);
          const content = quill.getText();
          
          let nextNum = 1;
          const matches = content.match(/\[(\d+)\]/g);
          if (matches && matches.length > 0) {
            const nums = matches.map(m => parseInt(m.replace(/[\[\]]/g, '')));
            nextNum = Math.max(...nums) + 1;
          }

          quill.insertText(range.index, `[${nextNum}]`);
          quill.setSelection(range.index + `[${nextNum}]`.length + 1);
          
          const html = quill.root.innerHTML;
          if (!html.includes('Notes')) {
            quill.clipboard.dangerouslyPasteHTML(quill.getLength(), `<p><br></p><h2>Notes</h2><p>${nextNum}. ${text}</p>`);
          } else {
            quill.clipboard.dangerouslyPasteHTML(quill.getLength(), `<p>${nextNum}. ${text}</p>`);
          }
        }
      }
    }
  }), []);

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    console.log("Starting Article Image Upload: v4 Diagnostic Logger active.");
    console.log("Original File Name:", file.name, "Size:", file.size, "Type:", file.type);
    
    setUploadingImage(true)
    try {
      console.log("Compressing image...");
      const compressedFile = await compressImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.75 })
      console.log("Image compression complete. Output Name:", compressedFile.name, "Size:", compressedFile.size);
      
      const safeName = compressedFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")
      const usedStorage = storage || getStorage(app)
      let storageRef = null
      try {
        storageRef = ref(usedStorage, `article_covers/${Date.now()}_${safeName}`)
        console.log("Uploading bytes to Firebase Storage reference:", storageRef.fullPath);
        await uploadBytes(storageRef, compressedFile)
      } catch (uploadErr) {
        console.error("Upload error (storageRef):", uploadErr?.code || "-", uploadErr?.message || uploadErr, "ref:", storageRef?.fullPath)
        throw uploadErr
      }

      console.log("Firebase upload completed. Retrieving download URL...");
      const url = await getDownloadURL(storageRef)
      console.log("Success! Cover URL obtained:", url);
      set("coverUrl", url)
      notifySuccess("อัปโหลดรูปภาพปกเรียบร้อยแล้ว")
    } catch (err) {
      console.error("Diagnostic error caught inside handleUploadImage:", err?.code || "-", err?.message || err)
      notifyError("อัปโหลดรูปภาพล้มเหลว")
    } finally {
      console.log("Finally block executed. Setting uploadingImage back to false.");
      setUploadingImage(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <button className="btn btn-outline" style={{ marginBottom: 18 }} onClick={onCancel}><i className="ti ti-arrow-left" style={{ marginRight: 6 }}></i>กลับ</button>
      <h2 style={{ marginBottom: 20 }}>{item.id ? "แก้ไขบทความ" : "เพิ่มบทความใหม่"}</h2>

      <div className="card" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ชื่อบทความ *" span><input value={item.title || ""} onChange={e => set("title", e.target.value)} placeholder="ชื่อบทความ" /></Field>
        <Field label="ประเภท">
          <select value={item.type || "general"} onChange={e => set("type", e.target.value)}>
            {(taxonomy.articleTypes || []).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </Field>
        <Field label="หมวดหมู่">
          <select value={item.category || ""} onChange={e => set("category", e.target.value)}>
            {(taxonomy.articleCategories || []).map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </Field>

        {/* เช็คประเภทซีรีส์ให้ยืดหยุ่นขึ้น */}
        {isSeriesType(item.type) && (
          <>
            <Field label="ซีรีส์">
              <select value={item.seriesId || ""} onChange={e => set("seriesId", e.target.value)}>
                <option value="">เลือกซีรีส์</option>
                {(taxonomy.articleSeries || []).map(series => <option key={series.id} value={series.id}>{series.name}</option>)}
              </select>
            </Field>
            <Field label="ตอนที่"><input type="number" value={item.part || ""} onChange={e => set("part", e.target.value)} min="1" /></Field>
          </>
        )}

        {item.type === "specific" && <Field label="ชื่อหัวข้อย่อย" span><input value={item.seriesName || ""} onChange={e => set("seriesName", e.target.value)} /></Field>}
        <Field label="ผู้เขียน"><input value={item.author || ""} onChange={e => set("author", e.target.value)} /></Field>
        <Field label="วันที่เผยแพร่"><input type="date" value={item.date || ""} onChange={e => set("date", e.target.value)} /></Field>

        <Field label="รูปภาพปกบทความ (URL)" span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={item.coverUrl || ""}
              onChange={e => set("coverUrl", e.target.value)}
              placeholder="https://example.com/image.jpg หรืออัปโหลดไฟล์..."
              style={{ flex: 1 }}
            />
            <label className="btn btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, padding: "10px 16px" }}>
              <i className={uploadingImage ? "ti ti-loader-2 spin" : "ti ti-upload"}></i>
              {uploadingImage ? "กำลังอัปโหลด..." : "อัปโหลดรูปภาพ"}
              <input type="file" accept="image/*" onChange={handleUploadImage} disabled={uploadingImage} style={{ display: "none" }} />
            </label>
          </div>
          {item.coverUrl && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative", width: 120, height: 75, borderRadius: 8, overflow: "hidden", border: "1px solid var(--br2)", flexShrink: 0 }}>
                <img src={item.coverUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  type="button"
                  onClick={() => set("coverUrl", "")}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 10
                  }}
                >
                  ✕
                </button>
              </div>
              <span style={{ fontSize: 12, color: "var(--t3)" }}>ตัวอย่างรูปภาพปก</span>
            </div>
          )}
        </Field>

        <Field label="อิโมจิประดับการ์ด (coverEmoji - แสดงผลเมื่อไม่มีรูปภาพปก)">
          <input
            value={item.coverEmoji || ""}
            onChange={e => set("coverEmoji", e.target.value)}
            placeholder="📖"
            maxLength={4}
          />
        </Field>

        <div />

        <Field label="บทคัดย่อ (แสดงหน้าการ์ด)" span><textarea value={item.excerpt || ""} onChange={e => set("excerpt", e.target.value)} rows={2} placeholder="เนื้อหาสรุปสั้นๆ..." /></Field>
        <Field label="Tags (คั่นด้วยลูกน้ำ ,)" span><input value={(item.tags || []).join(", ")} onChange={e => set("tags", e.target.value.split(",").map(tag => tag.trim()).filter(Boolean))} placeholder="เช่น ฟิกฮ์, อะกีดะฮ์" /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ display: "block", fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>เนื้อหาบทความแบบเต็ม</span>
            <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 400, background: "rgba(20,184,166,0.1)", padding: "4px 8px", borderRadius: 12 }}>
              <i className="ti ti-bulb" style={{ marginRight: 4 }}></i>รองรับทั้งรูปแบบใหม่ (WYSIWYG) และแบบข้อความดั้งเดิม
            </span>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid var(--br)", minHeight: 400 }}>
            <CustomToolbar />
            <ReactQuill 
              ref={reactQuillRef}
              theme="snow"
              value={item.body || ""} 
              onChange={val => set("body", val)}
              modules={quillModules}
              style={{ minHeight: 360 }}
              placeholder="พิมพ์เนื้อหาบทความที่นี่..."
            />
          </div>
          <style>{`
            .ql-editor { min-height: 360px; font-size: 15px; font-family: inherit; line-height: 1.6; }
            .ql-toolbar.ql-snow { border: none; border-bottom: 1px solid var(--br); background: #f8f9fa; }
            .ql-container.ql-snow { border: none; }
            #admin-article-toolbar button.ql-insertFootnote, #admin-article-toolbar button.ql-insertQuran, #admin-article-toolbar button.ql-numberCircle, #admin-article-toolbar button.ql-insertPdf, #admin-article-toolbar button.ql-highlightText, #admin-article-toolbar button.ql-insertDivider, #admin-article-toolbar button.ql-arabicBlock, #admin-article-toolbar button.ql-calloutInfo, #admin-article-toolbar button.ql-calloutWarn, #admin-article-toolbar button.ql-dropCap, #admin-article-toolbar button.ql-insertFloatImage, #admin-article-toolbar button.ql-insertAudio { width: auto; padding: 0 6px; }
            #admin-article-toolbar button.ql-insertFootnote::after { content: "FN"; font-weight: 700; font-size: 13px; color: var(--teal); }
            #admin-article-toolbar button.ql-insertQuran::after { content: "QR"; font-weight: 700; font-size: 13px; color: var(--teal); }
            #admin-article-toolbar button.ql-numberCircle::after { content: "01"; font-weight: 700; font-size: 13px; color: var(--teal); border-radius: 50%; border: 1px solid var(--teal); padding: 1px 4px; }
            #admin-article-toolbar button.ql-insertPdf::after { content: "PDF"; font-weight: 700; font-size: 13px; color: #dc2626; }
            #admin-article-toolbar button.ql-highlightText::after { content: "HL"; font-weight: 700; font-size: 13px; color: #ca8a04; background: #fef08a; padding: 2px 4px; border-radius: 4px; }
            #admin-article-toolbar button.ql-dropCap::after { content: "A"; font-weight: 700; font-size: 15px; font-family: serif; }
            #admin-article-toolbar button.ql-insertDivider::after { content: "—"; font-weight: 700; font-size: 14px; color: var(--text); }
            #admin-article-toolbar button.ql-arabicBlock::after { content: "ع"; font-weight: 700; font-size: 16px; color: var(--teal); }
            #admin-article-toolbar button.ql-calloutInfo::after { content: "i"; font-weight: 700; font-size: 12px; color: #10b981; border: 1px solid #10b981; border-radius: 50%; padding: 0 4px; }
            #admin-article-toolbar button.ql-calloutWarn::after { content: "!"; font-weight: 700; font-size: 12px; color: #ef4444; border: 1px solid #ef4444; border-radius: 50%; padding: 0 5px; }
            #admin-article-toolbar button.ql-insertFloatImage::after { content: "IMG→"; font-weight: 700; font-size: 12px; color: var(--teal); }
            #admin-article-toolbar button.ql-insertAudio::after { content: "♫"; font-weight: 700; font-size: 16px; color: var(--teal); }
            #admin-article-toolbar button.ql-insertFootnote:hover::after, #admin-article-toolbar button.ql-insertQuran:hover::after, #admin-article-toolbar button.ql-numberCircle:hover::after, #admin-article-toolbar button.ql-insertPdf:hover::after, #admin-article-toolbar button.ql-highlightText:hover::after, #admin-article-toolbar button.ql-insertDivider:hover::after, #admin-article-toolbar button.ql-arabicBlock:hover::after, #admin-article-toolbar button.ql-calloutInfo:hover::after, #admin-article-toolbar button.ql-calloutWarn:hover::after, #admin-article-toolbar button.ql-dropCap:hover::after, #admin-article-toolbar button.ql-insertFloatImage:hover::after, #admin-article-toolbar button.ql-insertAudio:hover::after { color: var(--t2); }
          `}</style>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="btn btn-outline" onClick={onCancel}>ยกเลิก</button>
        <button className="btn btn-teal" onClick={onSave} disabled={busy}>
          <i className={`ti ${busy ? "ti-loader-2 spin" : "ti-check"}`} style={{ marginRight: 6 }}></i>{busy ? "กำลังบันทึก..." : "บันทึกบทความ"}
        </button>
      </div>

      <QuillPromptModal 
        isOpen={!!promptState}
        type={promptState?.type}
        onClose={promptState?.onClose || (() => setPromptState(null))}
        onSubmit={promptState?.onSubmit}
      />
    </div>
  )
}

function Field({ label, children, span }) {
  return (
    <label style={span ? { gridColumn: "1 / -1" } : undefined}>
      <span style={{ display: "block", fontSize: 13, color: "var(--t2)", marginBottom: 8, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  )
}
