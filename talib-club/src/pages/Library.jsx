import { useState, useEffect, useMemo } from "react"


import { BOOKS, DEFAULT_TAXONOMY } from "../data/index.js"


import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"

// 💡 1. ฟังก์ชันดึงรูปปก (ทะลุบล็อก Google Drive)
function getDirectUrl(url) {
if (!url) return "";
const match = url.match(//file/d/([a-zA-Z0-9_-]+)/);
if (match && match[1]) {
return https://drive.google.com/thumbnail?id=${match[1]}&sz=w800;
}
return url;
}

// 💡 2. ฟังก์ชันแปลงลิงก์ให้เป็นแบบ "ดาวน์โหลดไฟล์ลงเครื่อง" อัตโนมัติ
function getDownloadUrl(url) {
if (!url) return "";
const match = url.match(//file/d/([a-zA-Z0-9_-]+)/);
if (match && match[1]) {
return https://drive.google.com/uc?export=download&id=${match[1]};
}
return url;
}

export default function Library() {
const { items: books, loading } = useContentCollection("books", BOOKS)
const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)

const [filter, setFilter] = useState("all") // สำหรับปุ่มประเภทหลัก
const [search, setSearch] = useState("")

// --- State สำหรับตัวกรองขั้นสูง ---
const [categoryFilter, setCategoryFilter] = useState("all")
const [sourceFilter, setSourceFilter] = useState("all")
const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

// --- ระบบ Pagination ---
const [currentPage, setCurrentPage] = useState(1)
const ITEMS_PER_PAGE = 12

const types = ["all", ...(taxonomy.bookTypes || [])]

// สกัดรายชื่อ หมวดหมู่ และ แหล่งที่มา ทั้งหมดจากหนังสือที่มีอยู่ (ไม่ให้ซ้ำกัน)
const availableCategories = useMemo(() => {
const cats = new Set(books.map(b => b.category).filter(Boolean))
return ["all", ...Array.from(cats).sort()]
}, [books])

const availableSources = useMemo(() => {
const sources = new Set(books.map(b => b.source).filter(Boolean))
return ["all", ...Array.from(sources).sort()]
}, [books])

// รีเซ็ตหน้า 1 ทุกครั้งที่มีการเปลี่ยนตัวกรอง
useEffect(() => {
setCurrentPage(1)
}, [search, filter, categoryFilter, sourceFilter])

// กรองข้อมูลตามที่เลือกไว้ทั้งหมด
const filtered = useMemo(() => {
return books.filter(b => {
const matchType = filter === "all" || b.type === filter
const matchCategory = categoryFilter === "all" || b.category === categoryFilter
const matchSource = sourceFilter === "all" || b.source === sourceFilter
const matchSearch = !search ||
b.title.toLowerCase().includes(search.toLowerCase()) ||
(b.desc && b.desc.toLowerCase().includes(search.toLowerCase())) ||
(b.author && b.author.toLowerCase().includes(search.toLowerCase()))

  return matchType && matchCategory && matchSource && matchSearch
})


}, [books, filter, categoryFilter, sourceFilter, search])

// คำนวณข้อมูลหน้าปัจจุบัน
const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
const currentItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

return (


ห้องสมุด
หนังสือ วารสาร และสื่อดาวน์โหลดทั้งหมดของ Talib Club
{loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดรายการล่าสุด...}


  {/* SEARCH + MAIN FILTER */}
  <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
    <div style={{position:"relative",flex:1,minWidth:250}}>
      <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",
        transform:"translateY(-50%)",color:"var(--t3)",fontSize:14}}></i>
      <input placeholder="ค้นหาชื่อหนังสือ, ผู้เขียน, หรือเนื้อหา..." value={search}
        onChange={e=>setSearch(e.target.value)} style={{paddingLeft:32}}/>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {types.map(t=>(
        <button key={t} onClick={()=>setFilter(t)} style={{
          fontFamily:"'Prompt',sans-serif",fontSize:12,fontWeight:300,
          padding:"5px 12px",borderRadius:20,border:".5px solid var(--br)",
          cursor:"pointer",transition:"all .15s",
          background:filter===t?"var(--acc)":"var(--card)",
          color:filter===t?"var(--bg)":"var(--t2)"}}>
          {t==="all"?"ทั้งหมด":t}
        </button>
      ))}
      
      {/* ปุ่มเปิด/ปิด ตัวกรองขั้นสูง */}
      <button 
        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
        className={showAdvancedFilters ? "btn btn-teal" : "btn btn-outline"}
        style={{ padding: "5px 12px", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <i className="ti ti-filter"></i> ตัวกรองเพิ่มเติม
      </button>
    </div>
  </div>

  {/* ADVANCED FILTERS (ซ่อน/แสดง) */}
  {showAdvancedFilters && (
    <div className="card" style={{ padding: 16, marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, background: "var(--acc2)" }}>
      
      {/* ตัวกรองหมวดหมู่ */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--t2)", marginBottom: 6, fontWeight: 500 }}>หมวดหมู่เนื้อหา</label>
        <select 
          value={categoryFilter} 
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)" }}
        >
          <option value="all">-- ทุกหมวดหมู่ --</option>
          {availableCategories.filter(c => c !== "all").map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* ตัวกรองแหล่งที่มา / ผู้เขียน */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--t2)", marginBottom: 6, fontWeight: 500 }}>แหล่งที่มา / สำนักพิมพ์</label>
        <select 
          value={sourceFilter} 
          onChange={(e) => setSourceFilter(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)" }}
        >
          <option value="all">-- ทุกสำนักพิมพ์ --</option>
          {availableSources.filter(s => s !== "all").map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

    </div>
  )}

  {/* แสดงจำนวนผลลัพธ์ */}
  {(search || filter !== "all" || categoryFilter !== "all" || sourceFilter !== "all") && (
    <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16 }}>
      พบหนังสือ {filtered.length} เล่ม
    </div>
  )}

  {/* BOOKS GRID */}
  {filtered.length===0
    ? <div className="empty">ไม่พบรายการที่ตรงกับการค้นหา หรือตัวกรองที่เลือก</div>
    : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:16}}>
        {currentItems.map(b=>(
          <div key={b.id} className="card" style={{padding:16,display:"flex",gap:16}}>
            
            {/* Left: Cover Image */}
            <div style={{width: 90, flexShrink: 0}}>
              {b.coverUrl ? (
                <img src={getDirectUrl(b.coverUrl)} alt={b.title} style={{width:"100%", borderRadius:6, objectFit:"cover", aspectRatio:"3/4", border:".5px solid var(--br2)", boxShadow:"0 4px 6px rgba(0,0,0,0.05)"}} />
              ) : (
                <div style={{width:"100%", aspectRatio:"3/4", borderRadius:6, background:"var(--acc2)", display:"flex", alignItems:"center", justifyContent:"center", border:".5px solid var(--br2)"}}>
                  <i className={`ti ${b.type==="วารสาร"?"ti-news":b.type==="PDF"?"ti-file-text":"ti-book"}`} style={{fontSize:24, color:"var(--acc)"}}></i>
                </div>
              )}
            </div>

            {/* Right: Info & Actions */}
            <div style={{flex: 1, display: "flex", flexDirection: "column", minWidth: 0}}>
              <div style={{display:"flex", justifyContent:"space-between", marginBottom:4, flexWrap:"wrap", gap:4}}>
                <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
                  <span className="tag tag-acc" style={{fontSize:10}}>{b.type}</span>
                  {b.category && <span className="tag" style={{fontSize:10, background:"var(--bg2)", color:"var(--t2)"}}>{b.category}</span>}
                </div>
                {b.isNew && <span className="tag tag-new" style={{fontSize:10}}>ใหม่</span>}
              </div>
              
              <div style={{fontSize:14,fontWeight:500,color:"var(--text)",lineHeight:1.4,marginBottom:4, display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{b.title}</div>
              
              {b.author && (
                <div style={{fontSize: 11, color: "var(--teal)", marginBottom: 6, fontWeight: 400}}>
                  <i className="ti ti-pencil" style={{marginRight: 4}}></i>{b.author}
                </div>
              )}

              <p style={{fontSize:11,lineHeight:1.6,marginBottom:8,color:"var(--t2)",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                {b.desc || "ไม่มีคำอธิบายเพิ่มเติม"}
              </p>
              
              {/* Actions */}
              <div style={{marginTop:"auto", display:"flex", gap:8}}>
                <a className="btn btn-teal" href={getDownloadUrl(b.fileUrl)} target="_blank" rel="noopener noreferrer"
                  style={{flex:1,fontSize:11,padding:"6px 0",textDecoration:"none",textAlign:"center",
                    pointerEvents:b.fileUrl?"auto":"none",opacity:b.fileUrl?1:.55}}>
                  <i className="ti ti-download" style={{marginRight:4,fontSize:12}}></i>โหลด
                </a>
                <a className="btn btn-outline" href={b.fileUrl || "#"} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:11,padding:"6px 10px",textDecoration:"none",
                    pointerEvents:b.fileUrl?"auto":"none",opacity:b.fileUrl?1:.55}}>
                  <i className="ti ti-eye" style={{fontSize:12}}></i>
                </a>
              </div>
            </div>

          </div>
        ))}
      </div>
  }

  {/* PAGINATION CONTROLS */}
  {totalPages > 1 && (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 32 }}>
      <button 
        onClick={() => { setCurrentPage(prev => Math.max(prev - 1, 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        disabled={currentPage === 1}
        className="btn btn-outline"
        style={{ padding: "6px 12px", opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
      >
        <i className="ti ti-chevron-left" style={{ fontSize: 14 }}></i>
      </button>
      
      {Array.from({ length: totalPages }).map((_, i) => (
        <button 
          key={i} 
          onClick={() => { setCurrentPage(i + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className={currentPage === i + 1 ? "btn btn-teal" : "btn btn-outline"} 
          style={{ padding: "6px 14px", fontSize: 12, minWidth: 32 }}
        >
          {i + 1}
        </button>
      ))}

      <button 
        onClick={() => { setCurrentPage(prev => Math.min(prev + 1, totalPages)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        disabled={currentPage === totalPages}
        className="btn btn-outline"
        style={{ padding: "6px 12px", opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
      >
        <i className="ti ti-chevron-right" style={{ fontSize: 14 }}></i>
      </button>
    </div>
  )}

  {/* DONATE */}
  <div style={{marginTop:40,padding:"20px 24px",background:"var(--acc2)",
    border:".5px solid var(--acc-br)",borderRadius:14,textAlign:"center"}}>
    <div style={{fontSize:14,fontWeight:500,color:"var(--text)",marginBottom:6}}>
      ต้องการบริจาคหนังสือหรือวารสาร?
    </div>
    <p style={{fontSize:12,marginBottom:14}}>ติดต่อทีม Talib Club เพื่อนำเนื้อหาของท่านมาเผยแพร่</p>
    <a 
      href="https://www.facebook.com/TalibPublisher" 
      target="_blank" 
      rel="noreferrer" 
      className="btn btn-main" 
      style={{fontSize:12, textDecoration:"none", display:"inline-block"}}
    >
      ติดต่อเรา
    </a>
  </div>
</div>


)
}