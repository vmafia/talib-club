import { useState } from "react"
import { DEFAULT_TAXONOMY, MEDIA } from "../data/index.js"
import { useContentCollection, useTaxonomySettings } from "../lib/contentStore.js"

export default function Media({ go }) {
  const { items: media, loading } = useContentCollection("media", MEDIA)
  const { taxonomy } = useTaxonomySettings(DEFAULT_TAXONOMY)
  const [filter, setFilter] = useState("all")

  const filtered = media.filter(m=>filter==="all"||m.type===filter)

  return (
    <div>
      <div style={{marginBottom:28}}>
        <h1 style={{marginBottom:8}}>มีเดีย</h1>
        <p>วิดีโอ YouTube และพอดแคสต์ Spotify จาก Talib Club</p>
        {loading && <p style={{ marginTop: 8, fontSize: 12 }}>กำลังโหลดมีเดียล่าสุด...</p>}
      </div>

      {/* FILTER */}
      <div style={{display:"flex",gap:6,marginBottom:24}}>
        {[{id:"all",label:"ทั้งหมด",icon:"ti-layout-grid"}, ...(taxonomy.mediaTypes || []).map(item => ({
          id: item, label: item === "youtube" ? "YouTube" : item === "spotify" ? "Spotify" : item,
          icon: item === "youtube" ? "ti-brand-youtube" : item === "spotify" ? "ti-brand-spotify" : "ti-player-play",
        }))].map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)} style={{
            fontFamily:"'Prompt',sans-serif",fontSize:12,fontWeight:300,
            padding:"6px 14px",borderRadius:20,border:".5px solid var(--br)",
            cursor:"pointer",display:"flex",alignItems:"center",gap:6,
            background:filter===f.id?"var(--acc)":"var(--card)",
            color:filter===f.id?"var(--bg)":"var(--t2)"}}>
            <i className={`ti ${f.icon}`} style={{fontSize:12}}></i>{f.label}
          </button>
        ))}
      </div>

      {/* GRID (ปรับให้คลิกแล้วไปหน้า MediaDetail) */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {filtered.map(m=>(
          <div key={m.id} className="card" style={{cursor:"pointer",overflow:"hidden"}}
            onClick={() => go("media-detail", m)}>
            {/* Thumbnail */}
            <div style={{height:120,background:m.type==="youtube"
              ?"rgba(255,50,50,.08)":"rgba(30,215,96,.08)",
              display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              <i className={`ti ${m.type==="youtube"?"ti-brand-youtube":"ti-brand-spotify"}`}
                style={{fontSize:40,color:m.type==="youtube"?"#ff4444":"#1ed760",opacity:.7}}></i>
              {m.type==="youtube" && (
                <div style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.7)",
                  color:"#fff",fontSize:11,padding:"2px 6px",borderRadius:4,fontFamily:"'Prompt',sans-serif"}}>
                  {m.duration}
                </div>
              )}
            </div>
            <div style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span className="tag" style={{
                  background:m.type==="youtube"?"rgba(255,50,50,.08)":"rgba(30,215,96,.08)",
                  color:m.type==="youtube"?"#ff4444":"#1ed760",fontSize:9}}>
                  {m.type==="youtube"?"YouTube":"Spotify"}
                </span>
                <span style={{fontSize:10,color:"var(--t3)",fontWeight:300}}>{m.series}</span>
              </div>
              <div style={{fontSize:13,fontWeight:500,color:"var(--text)",lineHeight:1.4,marginBottom:8}}>
                {m.title}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:11,color:"var(--t3)",fontWeight:300}}>{m.channel}</div>
                <div style={{fontSize:11,color:"var(--t3)",fontWeight:300}}>
                  <i className="ti ti-clock" style={{marginRight:3,fontSize:11}}></i>{m.duration}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* LINKS */}
      <div style={{marginTop:32,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <a href="https://www.youtube.com/@TalibClub" target="_blank" rel="noopener noreferrer"
          style={{textDecoration:"none"}}>
          <div className="card" style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
            <i className="ti ti-brand-youtube" style={{fontSize:24,color:"#ff4444"}}></i>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>YouTube Channel</div>
              <div style={{fontSize:11,color:"var(--t3)",fontWeight:300}}>@TalibClub</div>
            </div>
            <i className="ti ti-external-link" style={{marginLeft:"auto",color:"var(--t3)",fontSize:14}}></i>
          </div>
        </a>
        <a href="https://open.spotify.com/show/TalibClub" target="_blank" rel="noopener noreferrer"
          style={{textDecoration:"none"}}>
          <div className="card" style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
            <i className="ti ti-brand-spotify" style={{fontSize:24,color:"#1ed760"}}></i>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>Spotify Podcast</div>
              <div style={{fontSize:11,color:"var(--t3)",fontWeight:300}}>Talib Club Podcast</div>
            </div>
            <i className="ti ti-external-link" style={{marginLeft:"auto",color:"var(--t3)",fontSize:14}}></i>
          </div>
        </a>
      </div>
    </div>
  )
}
