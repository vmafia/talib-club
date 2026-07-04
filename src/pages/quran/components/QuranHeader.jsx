import React from 'react';
import { SURA_LIST } from "../../../data/surahs.js";
import { getSurahTheme } from "../../../data/quranThemes.js";

export default function QuranHeader({
  currentSuraInfo,
  selectedPage,
  audioState,
  autoplayNext,
  pause,
  resume,
  pageVerses,
  verses,
  setAutoplayNext,
  play,
  selectedSura,
  showObjective,
  setShowObjective,
  isMobile,
  showMobileSettings,
  mode,
  setMode,
  arabicSize,
  setArabicSize,
  thaiSize,
  setThaiSize,
  quranFont,
  tajweedEnabled,
  setTajweedEnabled,
  translationKey,
  setTranslationKey,
  scrollToReadingArea
}) {
  return (
    <>
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
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <div style={{ fontSize: 32, fontFamily: "'Amiri', serif", color: "var(--teal)", textShadow: "0 0 1px rgba(45,190,160,0.1)" }}>
                {currentSuraInfo.name}
              </div>
              {!selectedPage && (
                <button
                  className="btn"
                  onClick={() => {
                    if (audioState === "playing" && autoplayNext) {
                      pause()
                    } else if (audioState === "paused" && autoplayNext) {
                      resume()
                    } else {
                      const currentList = selectedPage ? pageVerses : verses
                      if (currentList.length > 0) {
                        setAutoplayNext(true)
                        play(currentList[0].sura, currentList[0].aya, SURA_LIST.find(s => Number(s.number) === Number(currentList[0].sura))?.englishName || "", currentList)
                      }
                    }
                  }}
                  style={{
                    background: (audioState === "playing" && autoplayNext) ? "rgba(220, 38, 38, 0.06)" : "rgba(45, 190, 160, 0.06)",
                    border: (audioState === "playing" && autoplayNext) ? "0.5px solid #dc2626" : "0.5px solid var(--teal)",
                    color: (audioState === "playing" && autoplayNext) ? "#dc2626" : "var(--teal)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    padding: "4px 12px",
                    borderRadius: 12,
                    cursor: "pointer",
                    fontWeight: 500,
                    transition: "all 0.2s"
                  }}
                >
                  <i className={(audioState === "playing" && autoplayNext) ? "ti ti-player-pause" : "ti ti-player-play"} style={{ fontSize: 12 }}></i>
                  {(audioState === "playing" && autoplayNext) ? "หยุดเล่นเสียง" : "ฟังเสียงทั้งซูเราะฮ์"}
                </button>
              )}
            </div>
          </div>

          {/* SURAH OBJECTIVE CARD */}
          {getSurahTheme(selectedSura) && (
            <div className="card" style={{ padding: "14px 18px", marginBottom: 16, borderTop: "3px solid var(--teal)", background: "var(--bg3)" }}>
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setShowObjective(!showObjective)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, fontSize: 13, color: "var(--teal)" }}>
                  <i className="ti ti-bulb" style={{ fontSize: 16 }}></i>
                  เป้าหมายและวัตถุประสงค์หลักของซูเราะฮ์
                </div>
                <i className={`ti ${showObjective ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 14, color: "var(--t2)" }}></i>
              </div>

              {showObjective && (
                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                  <p style={{ fontWeight: 500, color: "var(--text)", margin: "0 0 8px 0" }}>
                    {getSurahTheme(selectedSura).objective}
                  </p>
                  {getSurahTheme(selectedSura).keyThemes && getSurahTheme(selectedSura).keyThemes.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 600, display: "block", marginBottom: 4 }}>ประเด็นสำคัญประจำบท:</span>
                      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--t3)" }}>
                        {getSurahTheme(selectedSura).keyThemes.map((topic, idx) => (
                          <li key={idx}>{topic}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CONTROLS CARD */}
          {(!isMobile || showMobileSettings) && (
            <div className="card" style={{ padding: isMobile ? "14px" : "16px 20px", marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {isMobile ? (
                // MOBILE LAYOUT
                <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
                  {/* Mode Segmented Control */}
                  <div style={{ display: "flex", background: "var(--quran-br2)", padding: 3, borderRadius: 10, width: "100%", border: "0.5px solid var(--quran-br2)" }}>
                    <button
                      className={`mode-btn ${mode === "translation" ? "active" : ""}`}
                      onClick={() => setMode("translation")}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        borderRadius: 8,
                        border: "none",
                        background: mode === "translation" ? "var(--quran-teal)" : "transparent",
                        color: mode === "translation" ? "#fff" : "var(--quran-t2)",
                        fontSize: "11px",
                        fontWeight: mode === "translation" ? 500 : 400,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        textAlign: "center",
                        whiteSpace: "normal", // FIXED OVERFLOW 
                        wordBreak: "keep-all",
                        lineHeight: 1.3
                      }}
                    >
                      แปลทีละอายะฮ์
                    </button>
                    <button
                      className={`mode-btn ${mode === "tafsir" ? "active" : ""}`}
                      onClick={() => setMode("tafsir")}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        borderRadius: 8,
                        border: "none",
                        background: mode === "tafsir" ? "var(--quran-teal)" : "transparent",
                        color: mode === "tafsir" ? "#fff" : "var(--quran-t2)",
                        fontSize: "11px",
                        fontWeight: mode === "tafsir" ? 500 : 400,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        textAlign: "center",
                        whiteSpace: "normal", // FIXED OVERFLOW 
                        wordBreak: "keep-all",
                        lineHeight: 1.3
                      }}
                    >
                      คำแปล + ตัฟซีร
                    </button>
                    <button
                      className={`mode-btn ${mode === "mushaf" ? "active" : ""}`}
                      onClick={() => setMode("mushaf")}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        borderRadius: 8,
                        border: "none",
                        background: mode === "mushaf" ? "var(--quran-teal)" : "transparent",
                        color: mode === "mushaf" ? "#fff" : "var(--quran-t2)",
                        fontSize: "11px",
                        fontWeight: mode === "mushaf" ? 500 : 400,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        textAlign: "center",
                        whiteSpace: "normal", // FIXED OVERFLOW 
                        wordBreak: "keep-all",
                        lineHeight: 1.3
                      }}
                    >
                      มุศฮัฟล้วน
                    </button>
                  </div>

                  {/* Sizer Stepper Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: mode === "mushaf" ? "1fr" : "1fr 1fr", gap: 6, width: "100%" }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "var(--quran-br2)",
                      padding: "6px 12px",
                      borderRadius: 10,
                      border: "0.5px solid var(--quran-br)",
                      flex: 1
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--quran-t2)" }}>อาหรับ</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          className="size-btn"
                          onClick={() => setArabicSize(prev => Math.max(prev - 2, 20))}
                          title="ย่อขนาดอักษรอาหรับ"
                          style={{
                            width: 24, height: 24, borderRadius: "50%", border: "none",
                            background: "var(--quran-card-bg)", color: "var(--quran-text)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                          }}
                        >
                          <i className="ti ti-minus" style={{ fontSize: 10 }}></i>
                        </button>
                        <span style={{ fontSize: 12, width: 20, textAlign: "center", fontWeight: 600 }}>{arabicSize}</span>
                        <button
                          className="size-btn"
                          onClick={() => setArabicSize(prev => Math.min(prev + 2, 52))}
                          title="ขยายขนาดอักษรอาหรับ"
                          style={{
                            width: 24, height: 24, borderRadius: "50%", border: "none",
                            background: "var(--quran-card-bg)", color: "var(--quran-text)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                          }}
                        >
                          <i className="ti ti-plus" style={{ fontSize: 10 }}></i>
                        </button>
                      </div>
                    </div>

                    {mode !== "mushaf" && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "var(--quran-br2)",
                        padding: "6px 12px",
                        borderRadius: 10,
                        border: "0.5px solid var(--quran-br)",
                        flex: 1
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--quran-t2)" }}>ภาษาไทย</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            className="size-btn"
                            onClick={() => setThaiSize(prev => Math.max(prev - 1, 12))}
                            title="ย่อขนาดอักษรไทย"
                            style={{
                              width: 24, height: 24, borderRadius: "50%", border: "none",
                              background: "var(--quran-card-bg)", color: "var(--quran-text)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                            }}
                          >
                            <i className="ti ti-minus" style={{ fontSize: 10 }}></i>
                          </button>
                          <span style={{ fontSize: 12, width: 20, textAlign: "center", fontWeight: 600 }}>{thaiSize}</span>
                          <button
                            className="size-btn"
                            onClick={() => setThaiSize(prev => Math.min(prev + 1, 26))}
                            title="ขยายขนาดอักษรไทย"
                            style={{
                              width: 24, height: 24, borderRadius: "50%", border: "none",
                              background: "var(--quran-card-bg)", color: "var(--quran-text)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                            }}
                          >
                            <i className="ti ti-plus" style={{ fontSize: 10 }}></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // DESKTOP/TABLET LAYOUT
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
                      <span style={{ fontSize: 11, color: "var(--quran-t2)" }}>อาหรับ:</span>
                      <button className="size-btn" onClick={() => setArabicSize(prev => Math.max(prev - 2, 20))} title="ย่อขนาดอักษรอาหรับ"><i className="ti ti-minus"></i></button>
                      <span style={{ fontSize: 11, width: 22, textAlign: "center", fontWeight: 500 }}>{arabicSize}</span>
                      <button className="size-btn" onClick={() => setArabicSize(prev => Math.min(prev + 2, 52))} title="ขยายขนาดอักษรอาหรับ"><i className="ti ti-plus"></i></button>
                    </div>
                    {mode !== "mushaf" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--quran-t2)" }}>ภาษาไทย:</span>
                        <button className="size-btn" onClick={() => setThaiSize(prev => Math.max(prev - 1, 12))} title="ย่อขนาดอักษรไทย"><i className="ti ti-minus"></i></button>
                        <span style={{ fontSize: 11, width: 22, textAlign: "center", fontWeight: 500 }}>{thaiSize}</span>
                        <button className="size-btn" onClick={() => setThaiSize(prev => Math.min(prev + 1, 26))} title="ขยายขนาดอักษรไทย"><i className="ti ti-plus"></i></button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mushaf Page-by-page Toggle */}
              {mode === "mushaf" && (
                <div style={{ borderTop: "0.5px solid var(--br2)", paddingTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", textAlign: "left" }}>
                  <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 500 }}>รูปแบบการจัดหน้ามุศฮัฟ:</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className={`mode-btn ${!selectedPage ? "active" : ""}`}
                      onClick={() => setSelectedPage(null)}
                      style={{ fontSize: 10, padding: "4px 10px", borderRadius: 12 }}
                    >
                      อ่านทีละซูเราะฮ์
                    </button>
                    <button
                      className={`mode-btn ${selectedPage ? "active" : ""}`}
                      onClick={() => setSelectedPage(1)}
                      style={{ fontSize: 10, padding: "4px 10px", borderRadius: 12 }}
                    >
                      อ่านทีละหน้า (1 - 604)
                    </button>
                  </div>
                </div>
              )}

              {/* Translation Selection (Hidden in Mushaf mode) */}
              {mode !== "mushaf" && (
                <div style={{
                  borderTop: "0.5px solid var(--br2)",
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: isMobile ? "flex-start" : "center",
                  gap: isMobile ? 6 : 10
                }}>
                  <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 500, flexShrink: 0 }}>สำนวนแปลความหมายไทย:</span>
                  <div style={{ position: "relative", width: "100%", maxWidth: "100%" }}>
                    <select
                      value={translationKey}
                      onChange={e => setTranslationKey(e.target.value)}
                      style={{
                        width: "100%",
                        height: 38,
                        padding: "0 36px 0 12px",
                        borderRadius: 8,
                        border: "0.5px solid var(--br)",
                        fontSize: 12,
                        fontFamily: "'Prompt', sans-serif",
                        background: "var(--inp)",
                        color: "var(--text)",
                        appearance: "none",
                        WebkitAppearance: "none",
                        cursor: "pointer",
                        outline: "none",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        overflow: "hidden"
                      }}
                    >
                      <option value="thai_complex">สำนวนแปลความหมาย คิงฟะฮัด (King Fahd Complex)</option>
                      <option value="thai_rwwad">สำนวนแปลความหมาย ศูนย์ Rowwad Translation Center</option>
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--quran-teal)", fontSize: 13, pointerEvents: "none" }}></i>
                  </div>
                </div>
              )}

              {/* Font & Tajweed Customization Bar */}
              <div style={{
                borderTop: "0.5px solid var(--br2)",
                paddingTop: 12,
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                justifyContent: "space-between",
                alignItems: isMobile ? "stretch" : "center",
                gap: 12,
                textAlign: "left"
              }}>

                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={tajweedEnabled}
                      onChange={e => setTajweedEnabled(e.target.checked)}
                      style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--quran-teal)" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--quran-text)", fontWeight: 500 }}>
                      แสดงสีตัจวีด (ช่วยออกเสียง)
                    </span>
                  </label>

                  {tajweedEnabled && (
                    <button
                      onClick={() => setShowTajweedLegend(!showTajweedLegend)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--quran-teal)",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 500,
                        padding: 0,
                        textDecoration: "underline",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      <i className="ti ti-info-circle"></i> คำอธิบายสีตัจวีด
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tajweed Legend Panel */}
          {tajweedEnabled && showTajweedLegend && (
            <div className="card" style={{
              padding: "16px 20px",
              marginBottom: 20,
              background: "var(--quran-br2)",
              borderColor: "var(--quran-br)",
              textAlign: "left",
              animation: "slideDown 0.2s ease"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--quran-text)", display: "flex", alignItems: "center", gap: 6 }}>
                  <i className="ti ti-book" style={{ color: "var(--quran-teal)" }}></i> คำอธิบายสัญลักษณ์และสีตัจวีด (Tajweed Guide)
                </span>
                <button
                  onClick={() => setShowTajweedLegend(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quran-t3)", fontSize: 14 }}
                >
                  <i className="ti ti-x"></i>
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "10px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#cc0000" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>สะท้อนเสียง (Qalqalah):</strong> สีแดง
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#e69138" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>หน่วงเสียงขึ้นจมูก (Ghunnah):</strong> สีส้ม
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#8e7cc3" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>ซ่อนเสียง (Ikhfa):</strong> สีม่วง
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#38761d" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>ควบกล้ำหน่วงเสียง:</strong> สีเขียวเข้ม
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#6aa84f" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>ควบกล้ำไม่หน่วงเสียง:</strong> สีเขียวอ่อน
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#1155cc" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>แปลงเสียงเป็น ม.ม้า (Iqlab):</strong> สีน้ำเงินอมฟ้า
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#2b78e4" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>ยืดเสียงยาว (Madd):</strong> สีฟ้า/น้ำเงิน
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#a0a0a0" }}></span>
                  <strong style={{ color: "var(--quran-text)" }}>อักษรที่ไม่ต้องออกเสียง:</strong> สีเทา
                </div>
              </div>
            </div>
          )}

    </>
  );
}
