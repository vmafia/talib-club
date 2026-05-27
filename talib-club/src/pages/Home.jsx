import { ARTICLES, BOOKS, MEDIA, SITE } from "../data/index.js"
import { useContentCollection, useSiteSettings } from "../lib/contentStore.js"

export default function Home({ go }) {
  const { items: articles } = useContentCollection("articles", ARTICLES)
  const { items: books } = useContentCollection("books", BOOKS)
  const { items: media } = useContentCollection("media", MEDIA)
  const { site } = useSiteSettings(SITE)
  const recent     = articles.slice(0, 3)
  const newBooks   = books.slice(0, 4)
  const recentMedia= media.slice(0, 3)

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
            <i className="ti ti-player-play" style={{ marginRight:6, fontSize:13 }}></i>ฟังธรรม
          </button>
        </div>
      </div>

      {/* AYAH */}
      <div className="ayah-block" style={{
        background:"var(--acc2)", border:".5px solid var(--acc-br)", borderRadius:14,
        padding:"18px 22px", marginBottom:32, display:"flex", gap:14, alignItems:"center"
      }}>
        <div style={{ width:3, minHeight:44, background:"var(--acc)", borderRadius:2, opacity:.4, flexShrink:0 }}></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="ayah-ar" style={{
            fontSize:18, color:"var(--text)", direction:"rtl", textAlign:"right",
            lineHeight:1.7, marginBottom:6, fontFamily:"serif"
          }}>{site.ayah.ar}</div>
          <div style={{ fontSize:12, color:"var(--t2)", fontWeight:300, lineHeight:1.5 }}>
            {site.ayah.th} — {site.ayah.ref}
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid4" style={{ marginBottom:32 }}>
        {[
          { n: site.stats.followers, l: site.stats.followersLabel, icon: "ti-users" },
          { n: articles.length + "+", l: "บทความ", icon: "ti-file-text" },
          { n: books.length + "+", l: "หนังสือ/วารสาร", icon: "ti-books" },
          { n: media.length + "+", l: "มีเดีย", icon: "ti-player-play" },
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
        <div className="grid-art">
          {recent.map((a, i) => (
            <div key={a.id} className="card" style={{ cursor:"pointer", overflow:"hidden" }}
              onClick={() => go("article", a)}>
              <div style={{
                height:80, display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:28, opacity:.5,
                background: i===0 ? "var(--teal-bg)" : i===1 ? "var(--acc2)" : "rgba(80,100,200,.07)"
              }}>{a.coverEmoji}</div>
              <div style={{ padding:12 }}>
                <span className="tag tag-teal" style={{ marginBottom:6 }}>{a.category}</span>
                <div style={{ fontSize:13, fontWeight:500, color:"var(--text)", lineHeight:1.4, marginBottom:6 }}>
                  {a.title}
                </div>
                <div style={{ fontSize:11, color:"var(--t3)", fontWeight:300 }}>
                  {a.author} · {a.readTime} นาที
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MEDIA + LIBRARY */}
      <div className="grid2" style={{ marginBottom:32 }}>
        {/* Media */}
        <div>
          <div className="sec-hd">
            <span className="sec-title">มีเดียล่าสุด</span>
            <button className="sec-link" onClick={() => go("media")}>ดูทั้งหมด →</button>
          </div>
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
        </div>

        {/* Library */}
        <div>
          <div className="sec-hd">
            <span className="sec-title">ห้องสมุด</span>
            <button className="sec-link" onClick={() => go("library")}>ดูทั้งหมด →</button>
          </div>
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
        <button className="btn btn-teal">บริจาคสนับสนุน</button>
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
  ].map(item => ({ ...item, url: site?.social?.[item.key] })).filter(item => item.url)

  return (
    <footer style={{
      padding: "40px 0 20px",
      marginTop: "60px",
      textAlign: "center",
      position: "relative",
      borderTop: ".5px solid var(--br2)"
    }}>
      <div style={{ display: "flex", justifyContent: "center", gap: "24px", flexWrap: "wrap", marginBottom: "16px" }}>
        <a href="#" style={{ color: "var(--text)", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>เกี่ยวกับเว็บไซต์</a>
        <a href="#" style={{ color: "var(--text)", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>ผู้ดูแลระบบ</a>
        <a href="#" style={{ color: "var(--text)", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>นโยบายความเป็นส่วนตัว</a>
      </div>

      <div style={{ fontSize: "13px", color: "var(--t3)", marginBottom: "24px", fontWeight: 300 }}>
        All Rights Reserved for Talib Club {new Date().getFullYear()} ©
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
        {links.map(item => (
          <a key={item.key} href={item.url} target="_blank" rel="noreferrer" style={{
            width: "42px", height: "42px",
            backgroundColor: "var(--card)",
            border: ".5px solid var(--br)",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--t2)", textDecoration: "none", transition: "0.2s"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--teal)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--teal)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; e.currentTarget.style.color = "var(--t2)"; e.currentTarget.style.borderColor = "var(--br)"; }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: "18px" }}></i>
          </a>
        ))}
      </div>

      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{
        position: "absolute", right: "0", top: "40px",
        width: "42px", height: "42px",
        backgroundColor: "var(--teal-bg)",
        border: "1px solid rgba(15,110,86,0.1)",
        borderRadius: "50%",
        color: "var(--teal)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "0.2s"
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--teal)"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--teal-bg)"; e.currentTarget.style.color = "var(--teal)"; }}
      >
        <i className="ti ti-arrow-up" style={{ fontSize: "18px" }}></i>
      </button>
    </footer>
  )
}