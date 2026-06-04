import { useState, useEffect } from "react"
import { ARTICLES, BOOKS, MEDIA, SITE } from "../data/index.js"
import { useContentCollection, useSiteSettings, useCollectionCount } from "../lib/contentStore.js"

const QURAN_DUAS = [
  { sura: 1, aya: 6 },
  { sura: 2, aya: 127 },
  { sura: 2, aya: 128 },
  { sura: 2, aya: 201 },
  { sura: 2, aya: 250 },
  { sura: 2, aya: 286 },
  { sura: 3, aya: 8 },
  { sura: 3, aya: 9 },
  { sura: 3, aya: 16 },
  { sura: 3, aya: 147 },
  { sura: 3, aya: 191 },
  { sura: 3, aya: 193 },
  { sura: 3, aya: 194 },
  { sura: 7, aya: 23 },
  { sura: 7, aya: 47 },
  { sura: 7, aya: 126 },
  { sura: 10, aya: 85 },
  { sura: 14, aya: 38 },
  { sura: 14, aya: 40 },
  { sura: 14, aya: 41 },
  { sura: 18, aya: 10 },
  { sura: 20, aya: 25 },
  { sura: 20, aya: 114 },
  { sura: 21, aya: 87 },
  { sura: 23, aya: 109 },
  { sura: 23, aya: 118 },
  { sura: 25, aya: 65 },
  { sura: 25, aya: 74 },
  { sura: 27, aya: 19 },
  { sura: 28, aya: 24 },
  { sura: 60, aya: 4 }
]

const SURAH_NAMES = {
  1: "อัล-ฟาติฮะฮ์",
  2: "อัล-บะเกาะเราะฮ์",
  3: "อาลิ อิมรอน",
  7: "อัล-อะอ์รอฟ",
  10: "ยูนุส",
  14: "อิบรอฮีม",
  18: "อัล-กะฮ์ฟ",
  20: "ฏอฮา",
  21: "อัล-อันบิยาอ์",
  23: "อัล-มุอ์มินูน",
  25: "อัล-ฟุรกอน",
  27: "อัน-นัมลฺ",
  28: "อัล-เกาะศ็อศ",
  60: "อัล-มุมตะหะนะฮ์"
}

export default function Home({ go }) {
  const { items: articles, loading: loadingArticles } = useContentCollection("articles", ARTICLES, null, { limit: 3, orderByField: "createdAt", orderDirection: "desc", live: false })
  const { items: books, loading: loadingBooks } = useContentCollection("books", BOOKS, null, { limit: 4, orderByField: "createdAt", orderDirection: "desc", live: false })
  const { items: media, loading: loadingMedia } = useContentCollection("media", MEDIA, null, { limit: 3, orderByField: "createdAt", orderDirection: "desc", live: false })
  const { count: scholarCount } = useCollectionCount("scholars")
  const { count: articleCount } = useCollectionCount("articles")
  const { count: bookCount } = useCollectionCount("books")
  const { count: mediaCount } = useCollectionCount("media")
  const { site } = useSiteSettings(SITE)
  const recent     = articles.slice(0, 3)
  const newBooks   = books.slice(0, 4)
  const recentMedia= media.slice(0, 3)

  const [dailyDua, setDailyDua] = useState(null)

  useEffect(() => {
    if (!site) return

    const todayStr = new Date().toDateString()
    const cached = localStorage.getItem("talib_club_daily_dua")
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (parsed.dateString === todayStr) {
          setDailyDua({
            ar: parsed.ar,
            th: parsed.th,
            ref: parsed.ref
          })
          return
        }
      } catch (e) {
        console.error("Error parsing cached dua:", e)
      }
    }

    const today = new Date().getDate()
    const index = (today - 1) % QURAN_DUAS.length
    const dua = QURAN_DUAS[index]

    fetch(`https://quranenc.com/api/v1/translation/aya/thai_rwwad/${dua.sura}/${dua.aya}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data && data.result) {
          const fetchedDua = {
            dateString: todayStr,
            ar: data.result.arabic_text,
            th: data.result.translation,
            ref: `${SURAH_NAMES[dua.sura] || `ซูเราะฮ์ที่ ${dua.sura}`} ${dua.sura}:${dua.aya}`
          }
          localStorage.setItem("talib_club_daily_dua", JSON.stringify(fetchedDua))
          setDailyDua({
            ar: fetchedDua.ar,
            th: fetchedDua.th,
            ref: fetchedDua.ref
          })
        } else {
          setDailyDua({
            ar: site.ayah?.ar,
            th: site.ayah?.th,
            ref: site.ayah?.ref
          })
        }
      })
      .catch(err => {
        console.error("Failed to fetch daily dua:", err)
        setDailyDua({
          ar: site.ayah?.ar,
          th: site.ayah?.th,
          ref: site.ayah?.ref
        })
      })
  }, [site])

  const displayDua = dailyDua || {
    ar: site?.ayah?.ar || "",
    th: site?.ayah?.th || "",
    ref: site?.ayah?.ref || ""
  }


  return (
    <div>
      {/* HERO */}
      <div style={{ padding: "40px 0 36px", borderBottom: ".5px solid var(--br2)", marginBottom: 32 }}>
        <div className="badge badge-acc" style={{ marginBottom: 16 }}>
          <span style={{ width:5, height:5, background:"var(--teal)", borderRadius:"50%", display:"inline-block" }}></span>
          {site.location} · {site.tagline}
        </div>
        <h1 style={{ marginBottom: 10 }}>
          ศึกษาอิสลาม<br/>
          <span style={{ color:"var(--teal)" }}>อย่างจริงจัง</span>
        </h1>
        <p style={{ maxWidth: 480, marginBottom: 24 }}>{site.desc}</p>
        <div className="hero-actions" style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <button className="btn btn-main" onClick={() => go("articles")}>
            <i className="ti ti-book" style={{ marginRight:6, fontSize:13 }}></i>เริ่มอ่าน
          </button>
          <button className="btn btn-outline" onClick={() => go("library")}>
            <i className="ti ti-download" style={{ marginRight:6, fontSize:13 }}></i>ห้องสมุด
          </button>
          <button className="btn btn-outline" onClick={() => go("media")}>
            <i className="ti ti-player-play" style={{ marginRight:6, fontSize:13 }}></i>คลังคลิป
          </button>
        </div>
      </div>

      {/* AYAH */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <i className="ti ti-bookmark" style={{ color: "var(--teal)", fontSize: 15 }}></i>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>อายะฮ์และบทดุอาอ์ประจำวัน</span>
      </div>
      <div className="ayah-block" style={{
        background:"var(--acc2)", border:".5px solid var(--acc-br)", borderRadius:14,
        padding:"18px 22px", marginBottom:32, display:"flex", gap:14, alignItems:"center"
      }}>
        <div style={{ width:3, minHeight:44, background:"var(--acc)", borderRadius:2, opacity:.4, flexShrink:0 }}></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="ayah-ar" style={{
            fontSize:18, color:"var(--text)", direction:"rtl", textAlign:"right",
            lineHeight:1.7, marginBottom:6, fontFamily:"serif"
          }}>{displayDua.ar}</div>
          <div style={{ fontSize:12, color:"var(--t2)", fontWeight:300, lineHeight:1.5 }}>
            {displayDua.th} — {displayDua.ref}
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid4" style={{ marginBottom:32 }}>
        {[
          { n: scholarCount + "+", l: "ทำเนียบบุคคล", icon: "ti-address-book" },
          { n: articleCount + "+", l: "บทความ", icon: "ti-file-text" },
          { n: bookCount + "+", l: "หนังสือ/วารสาร", icon: "ti-books" },
          { n: mediaCount + "+", l: "มีเดีย", icon: "ti-player-play" },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding:"16px", textAlign:"center" }}>
            <i className={`ti ${s.icon}`} style={{ fontSize:20, color:"var(--teal)", display:"block", marginBottom:6 }}></i>
            <div style={{ fontSize:20, fontWeight:600, color:"var(--text)", lineHeight:1 }}>{s.n}</div>
            <div style={{ fontSize:11, color:"var(--t3)", fontWeight:300, marginTop:4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* RECENT ARTICLES */}
      <div style={{ marginBottom:32 }}>
        <div className="sec-hd">
          <span className="sec-title">บทความล่าสุด</span>
          <button className="sec-link" onClick={() => go("articles")}>ดูทั้งหมด →</button>
        </div>
        {loadingArticles ? (
          <div className="grid-art">
            {[1, 2, 3].map(i => (
              <div key={i} className="card" style={{ padding: 16, height: 280, display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: 0.6 }}>
                <div style={{ width: "100%", height: 140, background: "var(--bg3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i>
                </div>
                <div style={{ flex: 1, marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ height: 14, background: "var(--bg3)", width: "40%", borderRadius: 4 }}></div>
                  <div style={{ height: 18, background: "var(--bg3)", width: "90%", borderRadius: 4 }}></div>
                  <div style={{ height: 14, background: "var(--bg3)", width: "70%", borderRadius: 4 }}></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid-art">
            {recent.map(a => (
              <div key={a.id} className="card" style={{ cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column" }}
                onClick={() => go("article", a)}>
                {a.coverUrl ? (
                  <div style={{ width: "100%", height: 140, overflow: "hidden", borderBottom: ".5px solid var(--br2)" }}>
                    <img src={a.coverUrl} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ) : (
                  <div style={{ width: "100%", height: 140, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: ".5px solid var(--br2)" }}>
                    <span style={{ fontSize: 36 }}>{a.coverEmoji || "📖"}</span>
                  </div>
                )}
                <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span className="tag tag-teal" style={{ fontSize: 10 }}>{a.category}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.45, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {a.title}
                    </div>
                    <p style={{ fontSize: 12, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "var(--t2)" }}>
                      {a.excerpt}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 300 }}>
                      {a.author} · {a.date}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MEDIA + LIBRARY */}
      <div className="grid2" style={{ marginBottom:32 }}>
        {/* Media */}
        <div>
          <div className="sec-hd">
            <span className="sec-title">มีเดียล่าสุด</span>
            <button className="sec-link" onClick={() => go("media")}>ดูทั้งหมด →</button>
          </div>
          {loadingMedia ? (
            <div className="flex-col">
              {[1, 2, 3].map(i => (
                <div key={i} className="card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, opacity: 0.6 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <i className="ti ti-loader-2 spin" style={{ fontSize: 14, color: "var(--teal)" }}></i>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ height: 12, background: "var(--bg3)", width: "70%", borderRadius: 4 }}></div>
                    <div style={{ height: 10, background: "var(--bg3)", width: "40%", borderRadius: 4 }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-col">
              {recentMedia.map(m => (
                <div key={m.id} className="card" style={{ padding:"11px 14px", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}
                  onClick={() => go("media")}>
                  <div style={{
                    width:32, height:32, borderRadius:"50%", background:"var(--acc2)",
                    border:".5px solid var(--acc-br)", display:"flex", alignItems:"center",
                    justifyContent:"center", flexShrink:0,
                  }}>
                    <i className={`ti ${m.type==="youtube" ? "ti-brand-youtube" : "ti-brand-spotify"}`}
                      style={{ fontSize:14, color: m.type==="youtube" ? "#ff4444" : "#1ed760" }}></i>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:"var(--text)",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.title}</div>
                    <div style={{ fontSize:10, color:"var(--t3)", fontWeight:300, marginTop:2 }}>
                      {m.series} · {m.duration}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Library */}
        <div>
          <div className="sec-hd">
            <span className="sec-title">ห้องสมุด</span>
            <button className="sec-link" onClick={() => go("library")}>ดูทั้งหมด →</button>
          </div>
          {loadingBooks ? (
            <div className="flex-col">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: 0.6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 4, background: "var(--bg3)", display: "grid", placeItems: "center" }}>
                      <i className="ti ti-loader-2 spin" style={{ fontSize: 12, color: "var(--teal)" }}></i>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ height: 12, background: "var(--bg3)", width: "60%", borderRadius: 4 }}></div>
                      <div style={{ height: 10, background: "var(--bg3)", width: "30%", borderRadius: 4 }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-col">
              {newBooks.map(b => (
                <div key={b.id} className="card" style={{
                  padding:"11px 14px", display:"flex", alignItems:"center",
                  justifyContent:"space-between", gap:10, cursor:"pointer"
                }} onClick={() => go("library")}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <i className={`ti ${b.type==="วารสาร" ? "ti-news" : b.type==="PDF" ? "ti-file-text" : "ti-book"}`}
                      style={{ fontSize:16, color:"var(--teal)", flexShrink:0 }}></i>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500, color:"var(--text)" }}>{b.title}</div>
                      <div style={{ fontSize:10, color:"var(--t3)", fontWeight:300 }}>{b.type} · {b.year}</div>
                    </div>
                  </div>
                  {b.isNew && <span className="tag tag-new" style={{ flexShrink:0 }}>ใหม่</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DONATE */}
      <div style={{
        background:"var(--acc2)", border:".5px solid var(--acc-br)", borderRadius:14,
        padding:"18px 20px", display:"flex", alignItems:"center",
        justifyContent:"space-between", gap:16, flexWrap:"wrap"
      }}>
        <div>
          <div style={{ fontSize:14, fontWeight:500, color:"var(--text)", marginBottom:4 }}>
            <i className="ti ti-heart" style={{ marginRight:6, color:"var(--teal)" }}></i>
            ร่วมสนับสนุน Talib Club
          </div>
          <div style={{ fontSize:12, color:"var(--t2)", fontWeight:300 }}>
            เงินบริจาคของท่านช่วยเผยแพร่ความรู้อิสลามในภาษาไทย
          </div>
        </div>
     <button 
  onClick={() => go('donate')} 
  className="btn btn-teal"
>
  ร่วมสมทบทุน
</button>
      </div>

      {/* FOOTER */}
      <Footer site={site} />
    </div>
  )
}

function Footer({ site }) {
  const links = [
    { key: "facebook", icon: "ti-brand-facebook" },
    { key: "youtube", icon: "ti-brand-youtube" },
    { key: "spotify", icon: "ti-brand-spotify" },
    { key: "instagram", icon: "ti-brand-instagram" },
    { key: "tiktok", icon: "ti-brand-tiktok" },
  ].map(item => ({ ...item, url: site?.social?.[item.key] })).filter(item => item.url)

  return (
    <footer style={{ padding: "32px 0 20px", marginTop: "40px", textAlign: "center", borderTop: ".5px solid var(--br2)" }}>
      
      {/* ส่วนคำขวัญ QURAN SUNNAH */}
      <div style={{ fontSize: "14px", color: "var(--text)", fontWeight: 500, letterSpacing: "0.5px", marginBottom: "6px", textTransform: "uppercase" }}>
        Quran, Sunnah <span style={{fontWeight: 300, fontSize: "13px"}}>and the understanding of Salaf</span>
      </div>

      {/* Copyright */}
      <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "20px", fontWeight: 300 }}>
        All Rights Reserved for Talib Club {new Date().getFullYear()} ©
      </div>

      {/* กลุ่มปุ่มโซเชียล และ ปุ่มขึ้นบน (จัดให้อยู่ด้วยกัน) */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {links.map(item => (
          <a key={item.key} href={item.url} target="_blank" rel="noreferrer" 
             style={{ width: "36px", height: "36px", backgroundColor: "var(--card)", border: ".5px solid var(--br)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t2)", textDecoration: "none", transition: "0.2s" }}
             onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--teal)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--teal)"; }}
             onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; e.currentTarget.style.color = "var(--t2)"; e.currentTarget.style.borderColor = "var(--br)"; }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: "16px" }}></i>
          </a>
        ))}

        {/* ปุ่มลูกศรขึ้นบน (เอา absolute ออก แล้วเรียงต่อกันแทน) */}
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
                style={{ width: "36px", height: "36px", backgroundColor: "var(--teal-bg)", border: "1px solid rgba(15,110,86,0.1)", borderRadius: "50%", color: "var(--teal)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "0.2s", marginLeft: "10px" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--teal)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--teal-bg)"; e.currentTarget.style.color = "var(--teal)"; }}
        >
          <i className="ti ti-arrow-up" style={{ fontSize: "16px" }}></i>
        </button>
      </div>

    </footer>
  )
}