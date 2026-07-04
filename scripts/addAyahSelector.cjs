const fs = require('fs');
const path = require('path');

const quranPath = path.join(__dirname, '../src/pages/Quran.jsx');
let content = fs.readFileSync(quranPath, 'utf8');

// Replace Desktop Sidebar
const desktopSearch = `                          {filteredSurahs.map(s => (
                            <div
                              key={s.number}
                              className={\`surah-item \${selectedSura === s.number ? "active" : ""}\`}
                              onClick={() => {
                                setSelectedPage(null)
                                setSelectedSura(s.number)
                                setTargetScrollAyah(null)
                              }}`;

const desktopReplace = `                          {filteredSurahs.map(s => (
                            <div key={s.number} style={{ display: "flex", flexDirection: "column" }}>
                              <div
                                className={\`surah-item \${selectedSura === s.number ? "active" : ""}\`}
                                onClick={() => {
                                  setSelectedPage(null)
                                  setSelectedSura(s.number)
                                  setTargetScrollAyah(null)
                                }}`;

if (content.includes(desktopSearch)) {
  content = content.replace(desktopSearch, desktopReplace);
  
  // Now add the ayah selector after the desktop surah-item ends
  // The surah-item ends with:
  //                               </div>
  //                             </div>
  //                           ))}
  // We need to inject the Ayah selector there. Let's do it with regex.
  
  const endSearchDesktop = `                              </div>
                            </div>
                          ))}
                          {filteredSurahs.length === 0 && (`;
                          
  const endReplaceDesktop = `                              </div>
                              {selectedSura === s.number && (
                                <div style={{ padding: "8px 14px", background: "var(--quran-bg2)", borderBottom: "0.5px solid var(--quran-br)", display: "flex", alignItems: "center", gap: 8 }}>
                                  <i className="ti ti-corner-down-right" style={{ fontSize: 14, color: "var(--quran-teal)" }}></i>
                                  <select
                                    value={targetScrollAyah || ""}
                                    onChange={e => {
                                      if (e.target.value) setTargetScrollAyah(parseInt(e.target.value))
                                    }}
                                    style={{ width: "100%", height: 32, fontSize: 11, borderRadius: 6, border: "0.5px solid var(--quran-br)", background: "var(--quran-bg)", color: "var(--quran-text)", padding: "0 8px" }}
                                  >
                                    <option value="">🎯 เลือกอายะฮ์...</option>
                                    {Array.from({ length: s.numberOfAyahs }, (_, i) => i + 1).map(a => (
                                      <option key={a} value={a}>อายะฮ์ที่ {a}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          ))}
                          {filteredSurahs.length === 0 && (`;
                          
  content = content.replace(endSearchDesktop, endReplaceDesktop);
}

// Replace Mobile Sidebar
const mobileSearch = `                          {filteredSurahs.map(s => (
                            <div
                              key={s.number}
                              className={\`surah-item\`}
                              onClick={() => {
                                setSelectedSura(s.number);
                                setTargetScrollAyah(null);
                                setIsMobileNavOpen(false);
                              }}`;

const mobileReplace = `                          {filteredSurahs.map(s => (
                            <div key={s.number} style={{ display: "flex", flexDirection: "column", marginBottom: "2px" }}>
                              <div
                                className={\`surah-item\`}
                                onClick={() => {
                                  setSelectedSura(s.number);
                                  setTargetScrollAyah(null);
                                  // Removed setIsMobileNavOpen(false) to allow Ayah selection
                                }}`;

if (content.includes(mobileSearch)) {
  content = content.replace(mobileSearch, mobileReplace);
  
  // Now we fix the borderRadius logic in mobile to accommodate the new dropdown
  const borderRadiusSearch = `borderRadius: selectedSura === s.number ? "10px" : "0",`;
  const borderRadiusReplace = `borderRadius: selectedSura === s.number ? (targetScrollAyah ? "10px" : "10px 10px 0 0") : "0",`;
  
  // We only replace the second occurrence, which is in the mobile sidebar
  let firstIdx = content.indexOf(borderRadiusSearch);
  let secondIdx = content.indexOf(borderRadiusSearch, firstIdx + 1);
  if (secondIdx !== -1) {
    content = content.substring(0, secondIdx) + borderRadiusReplace + content.substring(secondIdx + borderRadiusSearch.length);
  }

  // Inject Ayah selector for mobile
  const endSearchMobile = `                                <div style={{ fontSize: "14px", fontFamily: "'Amiri', serif" }}>{s.name}</div>
                                <div style={{ fontSize: "9px", color: "var(--quran-t3)" }}>{s.numberOfAyahs} อายะฮ์</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {sidebarTab === "juz" && (`;

  const endReplaceMobile = `                                <div style={{ fontSize: "14px", fontFamily: "'Amiri', serif" }}>{s.name}</div>
                                <div style={{ fontSize: "9px", color: "var(--quran-t3)" }}>{s.numberOfAyahs} อายะฮ์</div>
                              </div>
                              </div>
                              {selectedSura === s.number && (
                                <div style={{ padding: "12px 16px", background: "var(--quran-teal-bg)", borderRadius: "0 0 10px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "0.5px dashed rgba(45, 190, 160, 0.3)" }}>
                                  <select
                                    value={targetScrollAyah || ""}
                                    onChange={e => {
                                      if (e.target.value) {
                                        setTargetScrollAyah(parseInt(e.target.value));
                                        setIsMobileNavOpen(false);
                                      }
                                    }}
                                    style={{ width: "100%", height: 38, fontSize: 13, borderRadius: 8, border: "1px solid var(--quran-teal)", background: "var(--quran-bg)", color: "var(--quran-text)", padding: "0 10px" }}
                                  >
                                    <option value="">🎯 เลือกอายะฮ์...</option>
                                    {Array.from({ length: s.numberOfAyahs }, (_, i) => i + 1).map(a => (
                                      <option key={a} value={a}>อายะฮ์ที่ {a}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => setIsMobileNavOpen(false)}
                                    style={{ width: "100%", padding: "8px", fontSize: 12, borderRadius: 8, background: "var(--quran-teal)", color: "#fff", border: "none", fontWeight: 500 }}
                                  >
                                    ไปที่ซูเราะฮ์นี้ (หน้าแรก)
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {sidebarTab === "juz" && (`;
                  
  content = content.replace(endSearchMobile, endReplaceMobile);
}

fs.writeFileSync(quranPath, content);
console.log("Successfully patched Quran.jsx with Ayah selectors.");
