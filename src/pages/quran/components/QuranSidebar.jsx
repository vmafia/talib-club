import React from 'react';

export default function QuranSidebar({
  isMobile,
  sidebarCollapsed,
  setSidebarCollapsed,
  sidebarTab,
  setSidebarTab,
  navMode,
  setNavMode,
  search,
  setSearch,
  filteredSurahs,
  selectedSura,
  setSelectedSura,
  setSelectedPage,
  setTargetScrollAyah,
  targetScrollAyah,
  JUZ_STARTS,
  handleSelectPage,
  pageInput,
  setPageInput,
  handleKeywordSearch,
  keywordQuery,
  setKeywordQuery,
  searchLoading,
  searchError,
  searchResults,
  searchHasRun,
  handleSelectSearchResult,
  setIsMobileNavOpen,
  mode,
  currentSuraInfo,
  showMobileSettings,
  setShowMobileSettings
}) {
  return (
    <>
        {!isMobile ? (
          <div style={{
            width: sidebarCollapsed ? 0 : 280,
            transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            flexShrink: 0,
            height: "calc(100vh - 120px)",
            position: "sticky",
            top: 20,
            zIndex: 10
          }}>
            {/* Floating Toggle Button */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                position: "absolute",
                right: sidebarCollapsed ? "-16px" : "-16px",
                top: "40px",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "var(--quran-teal)",
                color: "#fff",
                border: "2.5px solid var(--quran-card-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 20,
                boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                transition: "transform 0.2s ease"
              }}
              title={sidebarCollapsed ? "เปิดแถบรายชื่อซูเราะฮ์" : "ปิดแถบรายชื่อซูเราะฮ์"}
            >
              <i className={`ti ${sidebarCollapsed ? "ti-chevron-right" : "ti-chevron-left"}`} style={{ fontSize: 12, fontWeight: "bold" }}></i>
            </button>

            {/* Inner Wrapper (to hide content during collapse) */}
            <div style={{
              width: 280,
              paddingRight: sidebarCollapsed ? 0 : 16, // Prevents toggle button overlap
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              opacity: sidebarCollapsed ? 0 : 1,
              transition: "opacity 0.25s ease, padding-right 0.3s ease",
              pointerEvents: sidebarCollapsed ? "none" : "auto",
              overflow: "hidden"
            }}>
              {/* Sidebar Tabs */}
              <div style={{ display: "flex", borderBottom: "0.5px solid var(--quran-br)" }}>
                <button
                  className={`sidebar-tab-btn ${sidebarTab === "surah" ? "active" : ""}`}
                  onClick={() => setSidebarTab("surah")}
                >
                  รายชื่อซูเราะฮ์
                </button>
                <button
                  className={`sidebar-tab-btn ${sidebarTab === "search" ? "active" : ""}`}
                  onClick={() => setSidebarTab("search")}
                >
                  ค้นหาในอายะฮ์
                </button>
              </div>

              {/* Sidebar Tab Content */}
              {sidebarTab === "surah" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                  {/* Sub-Navigation Switcher (Surah | Juz | Page) */}
                  <div style={{ display: "flex", gap: 4, background: "var(--quran-br2)", padding: 3, borderRadius: 8 }}>
                    <button
                      onClick={() => setNavMode("surah")}
                      style={{
                        flex: 1,
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: "none",
                        background: navMode === "surah" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "surah" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "surah" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      ซูเราะฮ์
                    </button>
                    <button
                      onClick={() => setNavMode("juz")}
                      style={{
                        flex: 1,
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: "none",
                        background: navMode === "juz" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "juz" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "juz" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      ยุซอ์
                    </button>
                    <button
                      onClick={() => setNavMode("page")}
                      style={{
                        flex: 1,
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: "none",
                        background: navMode === "page" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "page" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "page" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      หน้า
                    </button>
                  </div>

                  {navMode === "surah" && (
                    <>
                      <div style={{ position: "relative" }}>
                        <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--quran-t3)", fontSize: 13 }}></i>
                        <input
                          placeholder="ค้นหาชื่อซูเราะห์..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                        />
                      </div>

                      <div className="quran-sidebar card" style={{ padding: 0, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {filteredSurahs.map(s => (
                            <div key={s.number} style={{ display: "flex", flexDirection: "column" }}>
                              <div
                                className={`surah-item ${selectedSura === s.number ? "active" : ""}`}
                                onClick={() => {
                                  setSelectedPage(null)
                                  setSelectedSura(s.number)
                                  setTargetScrollAyah(null)
                                }}
                                style={{
                                  padding: "10px 14px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  borderBottom: "0.5px solid var(--quran-br)"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: "10px", color: "var(--quran-t3)", width: 18, textAlign: "center" }}>{s.number}</span>
                                  <div style={{ textAlign: "left" }}>
                                    <div style={{ fontSize: "12px", fontWeight: 500 }}>{s.englishName}</div>
                                    <div style={{ fontSize: "9px", color: "var(--quran-t2)" }}>{s.englishNameTranslation}</div>
                                  </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: "14px", fontFamily: "'Amiri', serif" }}>{s.name}</div>
                                  <div style={{ fontSize: "9px", color: "var(--quran-t3)" }}>{s.numberOfAyahs} อายะฮ์</div>
                                </div>
                              </div>
                              {selectedSura === s.number && (
                                <div style={{ padding: "12px 14px", background: "var(--quran-bg2)", borderBottom: "0.5px solid var(--quran-br)" }}>
                                  <div style={{ fontSize: "11px", color: "var(--quran-t2)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                    <i className="ti ti-layout-grid" style={{ fontSize: 13, color: "var(--quran-teal)" }}></i> เลือกอายะฮ์
                                  </div>
                                  <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(32px, 1fr))",
                                    gap: "4px",
                                    maxHeight: "180px",
                                    overflowY: "auto",
                                    paddingRight: "4px",
                                  }}>
                                    {Array.from({ length: s.numberOfAyahs }, (_, i) => i + 1).map(a => (
                                      <button
                                        key={a}
                                        onClick={() => setTargetScrollAyah(a)}
                                        style={{
                                          width: "100%",
                                          aspectRatio: "1/1",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          borderRadius: "6px",
                                          fontSize: "11px",
                                          fontWeight: 500,
                                          background: targetScrollAyah === a ? "var(--quran-teal)" : "var(--quran-bg)",
                                          color: targetScrollAyah === a ? "#fff" : "var(--quran-text)",
                                          border: targetScrollAyah === a ? "none" : "0.5px solid var(--quran-br)",
                                          cursor: "pointer",
                                          transition: "all 0.2s"
                                        }}
                                      >
                                        {a}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {filteredSurahs.length === 0 && (
                            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--quran-t3)" }}>ไม่พบผลลัพธ์</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {navMode === "juz" && (
                    <div className="quran-sidebar card" style={{ padding: 0, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {JUZ_STARTS.map(j => (
                          <div
                            key={j.juz}
                            className={`surah-item`}
                            onClick={() => {
                              setSelectedPage(null)
                              setSelectedSura(j.sura)
                              setTargetScrollAyah(j.ayah)
                            }}
                            style={{
                              padding: "12px 14px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              borderBottom: "0.5px solid var(--quran-br)"
                            }}
                          >
                            <div style={{ textAlign: "left" }}>
                              <div style={{ fontSize: "12px", fontWeight: 500 }}>ยุซอ์ที่ {j.juz}</div>
                              <div style={{ fontSize: "10px", color: "var(--quran-teal)" }}>เริ่มต้น ซูเราะฮ์ที่ {j.sura} อายะฮ์ {j.ayah}</div>
                            </div>
                            <i className="ti ti-chevron-right" style={{ fontSize: 12, color: "var(--quran-t3)" }}></i>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {navMode === "page" && (
                    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ textAlign: "left" }}>
                        <span style={{ fontSize: 11, color: "var(--quran-t2)", display: "block", marginBottom: 6 }}>เลือกหน้า (1 - 604)</span>
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) handleSelectPage(e.target.value)
                          }}
                          style={{ width: "100%", height: 38, padding: "0 10px", fontSize: 12, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--inp)", color: "var(--text)" }}
                        >
                          <option value="">-- เลือกจากรายการ --</option>
                          {Array.from({ length: 604 }, (_, i) => i + 1).map(p => (
                            <option key={p} value={p}>หน้า {p}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ borderTop: "0.5px solid var(--quran-br2)", paddingTop: 10, textAlign: "left" }}>
                        <span style={{ fontSize: 11, color: "var(--quran-t2)", display: "block", marginBottom: 6 }}>หรือ พิมพ์เลขหน้าโดยตรง</span>
                        <form
                          onSubmit={e => {
                            e.preventDefault()
                            if (pageInput) handleSelectPage(pageInput)
                          }}
                          style={{ display: "flex", gap: 6 }}
                        >
                          <input
                            placeholder="1 - 604"
                            type="number"
                            min="1"
                            max="604"
                            value={pageInput}
                            onChange={e => setPageInput(e.target.value)}
                            style={{ flex: 1, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                          />
                          <button className="btn btn-teal" style={{ height: 36, fontSize: 11, padding: "0 14px" }} type="submit">ไป</button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // KEYWORD SEARCH TAB
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                  <form onSubmit={handleKeywordSearch} style={{ display: "flex", gap: 6 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--quran-t3)", fontSize: 13 }}></i>
                      <input
                        placeholder="เช่น สวรรค์, ความเมตตา, นบี..."
                        value={keywordQuery}
                        onChange={e => setKeywordQuery(e.target.value)}
                        style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                      />
                    </div>
                    <button className="btn btn-teal" style={{ height: 36, padding: "0 12px", fontSize: 12 }} type="submit">ค้นหา</button>
                  </form>

                  {searchLoading && (
                    <div style={{ textAlign: "center", padding: 24 }}>
                      <i className="ti ti-loader-2 spin" style={{ fontSize: 20, color: "var(--quran-teal)" }}></i>
                      <div style={{ fontSize: 11, color: "var(--quran-t3)", marginTop: 6 }}>กำลังค้นหา...</div>
                    </div>
                  )}

                  {searchError && (
                    <div style={{ color: "var(--red)", fontSize: 11, padding: 8, textAlign: "center" }}>
                      {searchError}
                    </div>
                  )}

                  {!searchLoading && !searchError && (
                    <div className="quran-sidebar card" style={{ padding: 0, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {searchResults.length > 0 && (
                          <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 500, borderBottom: "0.5px solid var(--quran-br)", background: "var(--quran-teal-bg)", color: "var(--quran-teal)", textAlign: "left", borderRadius: "6px 6px 0 0" }}>
                            พบคำสำคัญนี้ {searchResults.length} ครั้งในคัมภีร์
                          </div>
                        )}
                        {searchResults.length > 0 ? (
                          searchResults.map((match, i) => {
                            const highlightText = (text, query) => {
                              if (!query) return text
                              const parts = text.split(new RegExp(`(${query})`, "gi"))
                              return parts.map((part, idx) =>
                                part.toLowerCase() === query.toLowerCase()
                                  ? <span key={idx} className="search-highlight">{part}</span>
                                  : part
                              )
                            }

                            return (
                              <div
                                key={`${match.surah.number}_${match.numberInSurah}_${i}`}
                                className="search-result-item"
                                onClick={() => {
                                  handleSelectSearchResult(match)
                                  setIsMobileNavOpen(false)
                                }}
                                style={{ padding: "12px", borderBottom: "0.5px solid var(--quran-br)" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--quran-teal)" }}>
                                    ซูเราะฮ์ {match.surah.englishName} ({match.numberInSurah})
                                  </span>
                                  <span style={{ fontSize: 9, color: "var(--quran-t3)" }}>
                                    [{match.surah.number}:{match.numberInSurah}]
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--quran-text)", lineHeight: 1.45, textAlign: "left" }}>
                                  {highlightText(match.text, keywordQuery)}
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: "var(--quran-t3)" }}>
                            {searchHasRun ? "ไม่พบคำสำคัญนี้" : "พิมพ์คำค้นหาเพื่อเริ่มค้นหาอายะฮ์"}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* MOBILE QUICK NAVIGATION BAR */
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "12px",
            background: "var(--quran-card-bg)",
            border: "1px solid var(--quran-br)",
            borderRadius: "14px",
            marginBottom: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
            textAlign: "left"
          }}>
            {/* Current Position Display */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "11px", color: "var(--quran-teal)", fontWeight: 600, background: "var(--quran-teal-bg)", padding: "2px 8px", borderRadius: 10 }}>
                  {mode === "mushaf" && selectedPage ? `มุศฮัฟ หน้า ${selectedPage}` : `ซูเราะฮ์ ${currentSuraInfo.englishName}`}
                </span>
                <span style={{ fontSize: "10px", color: "var(--quran-t3)" }}>
                  {mode === "mushaf" && selectedPage ? "อ่านทีละหน้า" : `อายะฮ์ 1 - ${currentSuraInfo.numberOfAyahs}`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => {
                    setSidebarTab("surah");
                    setNavMode("surah");
                    setIsMobileNavOpen(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--quran-teal)",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 3
                  }}
                >
                  <i className="ti ti-search"></i> ค้นหา
                </button>
                <button
                  onClick={() => setShowMobileSettings(!showMobileSettings)}
                  style={{
                    background: "none",
                    border: "none",
                    color: showMobileSettings ? "var(--quran-teal)" : "var(--quran-t3)",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "3px 8px",
                    borderRadius: "6px",
                    backgroundColor: showMobileSettings ? "rgba(45, 190, 160, 0.1)" : "transparent",
                    transition: "all 0.2s"
                  }}
                >
                  <i className="ti ti-settings"></i> ตั้งค่า
                </button>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : (mode === "mushaf" && selectedPage ? "1fr 1fr" : "1fr 1fr 1fr"), gap: 6 }}>
              {/* Surah Dropdown Button */}
              <button
                onClick={() => {
                  setSidebarTab("surah");
                  setNavMode("surah");
                  setIsMobileNavOpen(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  fontSize: "11.5px",
                  fontWeight: 500,
                  borderRadius: "8px",
                  border: "0.5px solid var(--quran-br)",
                  background: "var(--quran-bg)",
                  color: "var(--quran-text)",
                  cursor: "pointer",
                  width: "100%"
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📖 {currentSuraInfo.number}. {currentSuraInfo.englishName}
                </span>
                <i className="ti ti-chevron-down" style={{ fontSize: 9, marginLeft: 4 }}></i>
              </button>

              {/* Ayah Jump Selector (Only shown if not in page-based Mushaf mode) */}
              {!(mode === "mushaf" && selectedPage) && (
                <div style={{ position: "relative", width: "100%" }}>
                  <select
                    value={targetScrollAyah || ""}
                    onChange={e => {
                      const val = e.target.value;
                      if (val) {
                        setTargetScrollAyah(parseInt(val));
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 24px 8px 8px",
                      fontSize: "11.5px",
                      fontWeight: 500,
                      borderRadius: "8px",
                      border: "0.5px solid var(--quran-br)",
                      background: "var(--quran-bg)",
                      color: "var(--quran-text)",
                      cursor: "pointer",
                      appearance: "none",
                      WebkitAppearance: "none",
                      MozAppearance: "none",
                      outline: "none"
                    }}
                  >
                    <option value="">เลือกอายะฮ์...</option>
                    {Array.from({ length: currentSuraInfo.numberOfAyahs }, (_, i) => i + 1).map(a => (
                      <option key={a} value={a}>อายะฮ์ที่ {a}</option>
                    ))}
                  </select>
                  <i className="ti ti-chevron-down" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, pointerEvents: "none", color: "var(--quran-t3)" }}></i>
                </div>
              )}

              {/* Page Selector Button */}
              <button
                onClick={() => {
                  setSidebarTab("surah");
                  setNavMode("page");
                  setIsMobileNavOpen(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "between",
                  padding: "8px 10px",
                  fontSize: "11.5px",
                  fontWeight: 500,
                  borderRadius: "8px",
                  border: "0.5px solid var(--quran-br)",
                  background: "var(--quran-bg)",
                  color: "var(--quran-text)",
                  cursor: "pointer",
                  width: "100%"
                }}
              >
                <span>
                  📄 {selectedPage ? `หน้า ${selectedPage}` : "ระบุหน้า..."}
                </span>
                <i className="ti ti-chevron-down" style={{ fontSize: 9, marginLeft: 4 }}></i>
              </button>
            </div>
          </div>
        )}

    </>
  );
}
