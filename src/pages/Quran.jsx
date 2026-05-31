import { useState, useEffect, useRef } from "react"
import { SURA_LIST } from "../data/surahs.js"

export default function Quran() {
  const [selectedSura, setSelectedSura] = useState(1)
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState("translation") // "mushaf" | "translation" | "tafsir"
  const [translationKey, setTranslationKey] = useState("thai_complex") // "thai_complex" | "thai_rwwad"
  
  const [arabicSize, setArabicSize] = useState(32) // px
  const [thaiSize, setThaiSize] = useState(15) // px
  
  const [verses, setVerses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const cache = useRef({}) // Cache fetches
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  // Track mobile resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Filter Surahs
  const filteredSurahs = SURA_LIST.filter(s => {
    const query = search.toLowerCase().trim()
    return !query || 
      s.englishName.toLowerCase().includes(query) ||
      s.englishNameTranslation.toLowerCase().includes(query) ||
      s.name.includes(query) ||
      String(s.number) === query
  })

  const currentSuraInfo = SURA_LIST.find(s => s.number === selectedSura) || SURA_LIST[0]

  // Fetch Sura verses
  useEffect(() => {
    let active = true
    const cacheKey = `${translationKey}-${selectedSura}`
    
    if (cache.current[cacheKey]) {
      setVerses(cache.current[cacheKey])
      setError(null)
      return
    }
    
    setLoading(true)
    setError(null)
    
    const transUrl = `https://quranenc.com/api/v1/translation/sura/${translationKey}/${selectedSura}`
    const tafsirUrl = `https://quranenc.com/api/v1/translation/sura/thai_mokhtasar/${selectedSura}`
    
    Promise.all([
      fetch(transUrl).then(res => {
        if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อคำแปลความหมายจากระบบ QuranEnc ได้")
        return res.json()
      }),
      fetch(tafsirUrl).then(res => {
        if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อบทอธิบายความหมายย่อ (Tafsir) ได้")
        return res.json()
      })
    ])
    .then(([transData, tafsirData]) => {
      if (!active) return
      
      const merged = transData.result.map((aya, idx) => {
        const tafsirAya = tafsirData.result[idx] || {}
        return {
          id: aya.id,
          sura: aya.sura,
          aya: aya.aya,
          arabic_text: aya.arabic_text,
          translation: aya.translation,
          tafsir: tafsirAya.translation || ""
        }
      })
      
      cache.current[cacheKey] = merged
      setVerses(merged)
      setLoading(false)
    })
    .catch(err => {
      if (!active) return
      console.error(err)
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลกรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต")
      setLoading(false)
    })
    
    return () => {
      active = false
    }
  }, [selectedSura, translationKey])

  // Helper to draw Arabic numbers inside verse markers (for Mushaf Mode)
  const getArabicNumber = (num) => {
    const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
    return String(num).split("").map(digit => arabicDigits[Number(digit)] || digit).join("")
  }

  const hasBismillah = selectedSura !== 1 && selectedSura !== 9

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
        
        .surah-item {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .surah-item:hover {
          background: var(--bg2);
        }
        .surah-item.active {
          background: var(--teal-bg);
          border-left: 3px solid var(--teal);
          color: var(--teal);
        }
        .quran-sidebar {
          max-height: 75vh;
          overflow-y: auto;
        }
        /* Scrollbar styles for sidebar */
        .quran-sidebar::-webkit-scrollbar {
          width: 5px;
        }
        .quran-sidebar::-webkit-scrollbar-track {
          background: transparent;
        }
        .quran-sidebar::-webkit-scrollbar-thumb {
          background: var(--br);
          border-radius: 4px;
        }
        .arabic-font {
          font-family: 'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', serif;
          direction: rtl;
          text-align: right;
          line-height: 2.2;
        }
        .mushaf-flow {
          text-align: justify;
          direction: rtl;
          line-height: 2.5;
        }
        .mode-btn {
          font-family: 'Prompt', sans-serif;
          font-size: 11px;
          font-weight: 400;
          padding: 5px 12px;
          border-radius: 20px;
          border: 0.5px solid var(--br);
          background: var(--card);
          color: var(--t2);
          cursor: pointer;
          transition: all 0.15s;
        }
        .mode-btn.active {
          background: var(--teal);
          color: #fff;
          border-color: var(--teal);
        }
        .size-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 0.5px solid var(--br);
          background: var(--card);
          color: var(--text);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          transition: all 0.15s;
        }
        .size-btn:hover {
          background: var(--bg2);
        }
        .tafsir-box {
          background: var(--acc2);
          border-left: 2px solid var(--teal);
          padding: 12px 16px;
          border-radius: 0 8px 8px 0;
          margin-top: 8px;
        }
      `}</style>

      {/* HEADER TITLE */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>พระมหาคัมภีร์อัลกุรอาน</h1>
        <p style={{ color: "var(--t2)" }}>
          ระบบอ่านอัลกุรอานภาษาไทย พร้อมคำแปลความหมายต่ออายะฮ์ และบทอธิบายความหมายย่อ (ตัฟซีรย่อ)
        </p>
      </div>

      {/* CONTENT LAYOUT */}
      <div style={{ display: "flex", gap: 24, flexDirection: isMobile ? "column" : "row" }}>
        
        {/* SIDEBAR FOR DESKTOP OR DROPDOWN FOR MOBILE */}
        {!isMobile ? (
          <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 13 }}></i>
              <input 
                placeholder="ค้นหาชื่อซูเราะห์..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--br)" }}
              />
            </div>
            
            <div className="quran-sidebar card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {filteredSurahs.map(s => (
                  <div 
                    key={s.number} 
                    className={`surah-item ${selectedSura === s.number ? "active" : ""}`}
                    onClick={() => setSelectedSura(s.number)}
                    style={{ 
                      padding: "10px 14px", 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      borderBottom: "0.5px solid var(--br2)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "10px", color: "var(--t3)", width: 18, textAlign: "center" }}>{s.number}</span>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 500 }}>{s.englishName}</div>
                        <div style={{ fontSize: "9px", color: "var(--t2)" }}>{s.englishNameTranslation}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14px", fontFamily: "'Amiri', serif", color: "var(--text)" }}>{s.name}</div>
                      <div style={{ fontSize: "9px", color: "var(--t3)" }}>{s.numberOfAyahs} อายะฮ์</div>
                    </div>
                  </div>
                ))}
                {filteredSurahs.length === 0 && (
                  <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--t3)" }}>ไม่พบผลลัพธ์</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--t2)" }}>เลือกซูเราะห์:</div>
            <select 
              value={selectedSura}
              onChange={e => setSelectedSura(Number(e.target.value))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--br)", fontSize: 12, fontFamily: "'Prompt', sans-serif" }}
            >
              {SURA_LIST.map(s => (
                <option key={s.number} value={s.number}>
                  {s.number}. {s.englishName} ({s.englishNameTranslation}) — {s.numberOfAyahs} อายะฮ์
                </option>
              ))}
            </select>
          </div>
        )}

        {/* MAIN PANEL */}
        <div style={{ flex: 1, minWidth: 0 }}>
          
          {/* SURAH SUMMARY CARD */}
          <div className="card" style={{ padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge badge-teal" style={{ fontSize: 9 }}>ซูเราะห์ที่ {currentSuraInfo.number}</span>
                <span className="badge badge-acc" style={{ fontSize: 9 }}>
                  {currentSuraInfo.revelationType === "Meccan" ? "มักกียะฮ์ (ประทานที่มักกะฮ์)" : "มะดะนียะฮ์ (ประทานที่มะดีนะฮ์)"}
                </span>
              </div>
              <h2 style={{ marginTop: 6, fontSize: 18, fontWeight: 600 }}>
                {currentSuraInfo.englishName} <span style={{ fontWeight: 300, fontSize: 13, color: "var(--t2)" }}>({currentSuraInfo.englishNameTranslation})</span>
              </h2>
              <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 2 }}>
                จำนวน {currentSuraInfo.numberOfAyahs} อายะฮ์
              </div>
            </div>
            
            {/* Arabic Big Calligraphy Name */}
            <div style={{ fontSize: 32, fontFamily: "'Amiri', serif", color: "var(--teal)", textShadow: "0 0 1px rgba(45,190,160,0.1)" }}>
              {currentSuraInfo.name}
            </div>
          </div>

          {/* CONTROLS CARD */}
          <div className="card" style={{ padding: "12px 16px", marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              
              {/* Mode Select Buttons */}
              <div style={{ display: "flex", gap: 6 }}>
                <button 
                  className={`mode-btn ${mode === "translation" ? "active" : ""}`}
                  onClick={() => setMode("translation")}
                >
                  แปลทีละอายะฮ์
                </button>
                <button 
                  className={`mode-btn ${mode === "tafsir" ? "active" : ""}`}
                  onClick={() => setMode("tafsir")}
                >
                  คำแปล + ตัฟซีรย่อ
                </button>
                <button 
                  className={`mode-btn ${mode === "mushaf" ? "active" : ""}`}
                  onClick={() => setMode("mushaf")}
                >
                  มุศฮัฟ (ภาษาอาหรับล้วน)
                </button>
              </div>

              {/* Font Resizing Controls */}
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--t2)" }}>อาหรับ:</span>
                  <button className="size-btn" onClick={() => setArabicSize(prev => Math.max(prev - 2, 20))} title="ย่อขนาดอักษรอาหรับ"><i className="ti ti-minus"></i></button>
                  <span style={{ fontSize: 11, width: 22, textAlign: "center", fontWeight: 500 }}>{arabicSize}</span>
                  <button className="size-btn" onClick={() => setArabicSize(prev => Math.min(prev + 2, 52))} title="ขยายขนาดอักษรอาหรับ"><i className="ti ti-plus"></i></button>
                </div>
                {mode !== "mushaf" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--t2)" }}>ภาษาไทย:</span>
                    <button className="size-btn" onClick={() => setThaiSize(prev => Math.max(prev - 1, 12))} title="ย่อขนาดอักษรไทย"><i className="ti ti-minus"></i></button>
                    <span style={{ fontSize: 11, width: 22, textAlign: "center", fontWeight: 500 }}>{thaiSize}</span>
                    <button className="size-btn" onClick={() => setThaiSize(prev => Math.min(prev + 1, 26))} title="ขยายขนาดอักษรไทย"><i className="ti ti-plus"></i></button>
                  </div>
                )}
              </div>
            </div>

            {/* Translation Selection (Hidden in Mushaf mode) */}
            {mode !== "mushaf" && (
              <div style={{ borderTop: "0.5px solid var(--br2)", paddingTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>สำนวนแปลความหมายไทย:</span>
                <select 
                  value={translationKey}
                  onChange={e => setTranslationKey(e.target.value)}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "0.5px solid var(--br)", fontSize: 11, fontFamily: "'Prompt', sans-serif", background: "var(--card)", color: "var(--text)" }}
                >
                  <option value="thai_complex">สำนวนแปลความหมาย คิงฟะฮัด (King Fahd Complex)</option>
                  <option value="thai_rwwad">สำนวนแปลความหมาย ศูนย์ Rowwad Translation Center</option>
                </select>
              </div>
            )}
          </div>

          {/* LOADING & ERROR STATES */}
          {loading && (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)", marginBottom: 8 }}></i>
              <div style={{ fontSize: 13, color: "var(--t2)" }}>กำลังโหลดพระดำรัสและไฟล์ข้อมูลอายะฮ์...</div>
            </div>
          )}

          {error && (
            <div className="card" style={{ padding: 24, borderColor: "rgba(220, 38, 38, 0.3)", background: "rgba(220, 38, 38, 0.03)", textAlign: "center" }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 24, color: "var(--red)", marginBottom: 8 }}></i>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, marginBottom: 4 }}>เกิดข้อผิดพลาด</div>
              <p style={{ fontSize: 12, color: "var(--t2)", marginBottom: 12 }}>{error}</p>
              <button className="btn btn-teal" style={{ fontSize: 11, padding: "5px 14px" }} onClick={() => setTranslationKey(prev => prev)}>ลองอีกครั้ง</button>
            </div>
          )}

          {/* READING AREA */}
          {!loading && !error && verses.length > 0 && (
            <div className="card" style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
              
              {/* BISMILLAH PREPEND */}
              {hasBismillah && (
                <div style={{ 
                  textAlign: "center", 
                  margin: "12px 0 24px", 
                  fontSize: `${arabicSize + 2}px`, 
                  fontFamily: "'Amiri', serif", 
                  color: "var(--text)", 
                  lineHeight: 1.5,
                  direction: "rtl"
                }}>
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>
              )}

              {/* MUSHAF MODE (FLOW TEXT) */}
              {mode === "mushaf" ? (
                <div 
                  className="mushaf-flow" 
                  style={{ 
                    fontSize: `${arabicSize}px`, 
                    fontFamily: "'Amiri', serif", 
                    color: "var(--text)", 
                    direction: "rtl",
                    textAlign: "justify",
                    lineHeight: 2.3
                  }}
                >
                  {verses.map(v => (
                    <span key={v.id}>
                      {/* Strip the opening Bismillah if it's the first verse and was already rendered by the API */}
                      {v.arabic_text}{" "}
                      <span 
                        style={{ 
                          fontFamily: "sans-serif", 
                          fontSize: `${Math.round(arabicSize * 0.5)}px`, 
                          color: "var(--teal)", 
                          fontWeight: "bold",
                          margin: "0 4px",
                          display: "inline-flex",
                          width: `${Math.round(arabicSize * 0.95)}px`,
                          height: `${Math.round(arabicSize * 0.95)}px`,
                          border: "1.5px solid var(--teal)",
                          borderRadius: "50%",
                          alignItems: "center",
                          justifyContent: "center",
                          direction: "ltr"
                        }}
                      >
                        {getArabicNumber(v.aya)}
                      </span>{" "}
                    </span>
                  ))}
                </div>
              ) : (
                
                /* TRANSLATION & TAFSIR MODES (VERSE LIST) */
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {verses.map(v => (
                    <div 
                      key={v.id} 
                      style={{ 
                        borderBottom: "0.5px solid var(--br2)", 
                        paddingBottom: 20, 
                        display: "flex", 
                        flexDirection: "column", 
                        gap: 12 
                      }}
                    >
                      {/* Verse marker */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace" }}>
                          [{v.sura}:{v.aya}]
                        </span>
                      </div>

                      {/* Arabic text */}
                      <div 
                        className="arabic-font" 
                        style={{ 
                          fontSize: `${arabicSize}px`, 
                          color: "var(--text)",
                          paddingRight: 6
                        }}
                      >
                        {v.arabic_text}
                      </div>

                      {/* Thai Translation */}
                      <div 
                        style={{ 
                          fontSize: `${thaiSize}px`, 
                          lineHeight: 1.6, 
                          color: mode === "tafsir" ? "var(--t2)" : "var(--text)", 
                          fontWeight: mode === "tafsir" ? 300 : 400 
                        }}
                      >
                        {v.translation}
                      </div>

                      {/* Thai Exegesis / Tafsir Block */}
                      {mode === "tafsir" && v.tafsir && (
                        <div className="tafsir-box">
                          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--teal)", marginBottom: 4 }}>
                            คำอธิบายความหมายย่อ (ตัฟซีร):
                          </div>
                          <div style={{ fontSize: `${thaiSize - 0.5}px`, lineHeight: 1.6, color: "var(--text)", fontWeight: 300 }}>
                            {v.tafsir}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LICENCE AND CREDIT BANNER */}
          <div 
            style={{ 
              marginTop: 24, 
              padding: "16px 20px", 
              borderRadius: 12, 
              border: "0.5px solid var(--br)", 
              background: "var(--card)", 
              fontSize: "11px", 
              color: "var(--t2)", 
              lineHeight: "1.6" 
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-license" style={{ fontSize: 14, color: "var(--teal)" }}></i>
              แหล่งข้อมูลและลิขสิทธิ์ข้อมูลเผยแพร่
            </div>
            ข้อมูลแปลความหมายพระมหาคัมภีร์อัลกุรอานและตัฟซีรย่อภาษาไทยได้รับการสนับสนุนจาก <strong>โครงการสารานุกรมอัลกุรอาน (QuranEnc.com)</strong>
            <ul style={{ paddingLeft: 16, marginTop: 4, display: "flex", flexDirection: "column", gap: 2, listStyleType: "none" }}>
              <li>• สำนวนคำแปลภาษาไทย: ศูนย์แปล Rowwad Translation Center และ คณะผู้ทรงคุณวุฒิ (สมาคมศิษย์เก่ามหาวิทยาลัยในต่างประเทศ)</li>
              <li>• บทอธิบายคำแปลย่อ (ตัฟซีรย่อ): หนังสือตัฟซีรอัลมุคตะศ็อร (Al-Mukhtasar fi Tafsir al-Qur'an) แปลภาษาไทย</li>
              <li>• พัฒนาโดยอ้างอิงข้อมูลเวอร์ชันล่าสุดของโครงการ ซึ่งไม่อนุญาตให้ดัดแปลงหรือตัดต่อเนื้อหาคัดลอกใดๆ เพื่อความถูกต้องของพระดำรัส</li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  )
}
