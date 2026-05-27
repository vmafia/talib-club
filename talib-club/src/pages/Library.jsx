import { useState } from "react"
import { BOOKS, DEFAULT_TAXONOMY } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"

export default function Library() {
  const { items: books, loading } = useContentCollection("books", BOOKS)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const types = ["all", ...(taxonomy.bookTypes || [])]

  const filtered = books.filter(b=>{
    const matchType = filter==="all"||b.type===filter
    const matchSearch = !search||b.title.toLowerCase().includes(search.toLowerCase())||b.desc.includes(search)
    return matchType && matchSearch
  })

  return (
    <div>
      <div style={{marginBottom:28}}>
        <h1 style={{marginBottom:8}}>ห้องสมุด</h1>
        <p>หนังสือ วารสาร และสื่อดาวน์โหลดทั้งหมดของ Talib Club</p>
        {loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดรายการล่าสุด...</p>}
      </div>

      {/* SEARCH + FILTER */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:1,minWidth:200}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",
            transform:"translateY(-50%)",color:"var(--t3)",fontSize:14}}></i>
          <input placeholder="ค้นหาหนังสือ..." value={search}
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
        </div>
      </div>

      {/* BOOKS GRID */}
      {filtered.length===0
        ? <div className="empty">ไม่พบรายการที่ตรงกับการค้นหา</div>
        : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
            {filtered.map(b=>(
              <div key={b.id} className="card" style={{padding:18,display:"flex",flexDirection:"column",gap:12}}>
                {/* Icon + Type */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{width:44,height:44,borderRadius:10,
                    background:b.type==="วารสาร"?"var(--teal-bg)":"var(--acc2)",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <i className={`ti ${b.type==="วารสาร"?"ti-news":b.type==="PDF"?"ti-file-text":"ti-book"}`}
                      style={{fontSize:20,color:b.type==="วารสาร"?"var(--teal)":"var(--acc)"}}></i>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {b.isNew && <span className="tag tag-new">ใหม่</span>}
                    <span className="tag tag-acc">{b.type}</span>
                  </div>
                </div>

                {/* Info */}
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:500,color:"var(--text)",
                    lineHeight:1.4,marginBottom:6}}>{b.title}</div>
                  <p style={{fontSize:12,lineHeight:1.6,marginBottom:8,
                    display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                    {b.desc}
                  </p>
                  <div style={{fontSize:11,color:"var(--t3)",fontWeight:300}}>
                    {b.category} · {b.year}
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:"flex",gap:8}}>
                  <a className="btn btn-teal" href={b.fileUrl || "#"} target="_blank" rel="noopener noreferrer"
                    style={{flex:1,fontSize:12,padding:"8px 0",textDecoration:"none",textAlign:"center",
                      pointerEvents:b.fileUrl?"auto":"none",opacity:b.fileUrl?1:.55}}>
                    <i className="ti ti-download" style={{marginRight:5,fontSize:12}}></i>ดาวน์โหลด
                  </a>
                  <a className="btn btn-outline" href={b.fileUrl || "#"} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:12,padding:"8px 12px",textDecoration:"none",
                      pointerEvents:b.fileUrl?"auto":"none",opacity:b.fileUrl?1:.55}}>
                    <i className="ti ti-eye" style={{fontSize:12}}></i>
                  </a>
                </div>
              </div>
            ))}
          </div>
      }

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
