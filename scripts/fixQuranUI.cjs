const fs = require('fs');
const path = require('path');

const quranPath = path.join(__dirname, '../src/pages/Quran.jsx');
let content = fs.readFileSync(quranPath, 'utf8');

// 1. Fix Scroll to Top Button
const oldScrollToTop = `{/* Scroll to Top Button (Mobile) */}
      {isMobile && showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: "fixed",
            bottom: "80px", // Above mobile navigation if any
            right: "20px",
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "var(--quran-teal)",
            color: "#fff",
            border: "none",
            boxShadow: "0 4px 12px rgba(45,190,160,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 99,
            transition: "all 0.3s ease"
          }}
          aria-label="Scroll to top"
        >
          <i className="ti ti-arrow-up" style={{ fontSize: 20 }}></i>
        </button>
      )}`;

const newScrollToTop = `{/* Scroll to Top Button (Mobile) */}
      {isMobile && showScrollTop && createPortal(
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: "fixed",
            bottom: "80px", // Above mobile navigation if any
            right: "20px",
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "var(--quran-teal)",
            color: "#fff",
            border: "none",
            boxShadow: "0 4px 12px rgba(45,190,160,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 9999,
            transition: "all 0.3s ease"
          }}
          aria-label="Scroll to top"
        >
          <i className="ti ti-arrow-up" style={{ fontSize: 22 }}></i>
        </button>,
        document.body
      )}`;

if (content.includes(oldScrollToTop)) {
  content = content.replace(oldScrollToTop, newScrollToTop);
  console.log("Updated Scroll to Top button.");
} else {
  // Try regex if whitespace differs
  const regexScroll = /\{\/\* Scroll to Top Button \(Mobile\) \*\/\}\s*\{isMobile && showScrollTop && \(\s*<button[\s\S]*?<\/button>\s*\)\}/;
  if (regexScroll.test(content)) {
    content = content.replace(regexScroll, newScrollToTop);
    console.log("Updated Scroll to Top button via regex.");
  } else {
    console.log("Failed to find Scroll to Top button.");
  }
}

// 2. Fix Desktop Sidebar Ayah Selector UI
const regexDesktopAyah = /<div style=\{\{ padding: "8px 14px", background: "var\(--quran-bg2\)", borderBottom: "0\.5px solid var\(--quran-br\)", display: "flex", alignItems: "center", gap: 8 \}\}>\s*<i className="ti ti-corner-down-right" style=\{\{ fontSize: 14, color: "var\(--quran-teal\)" \}\}><\/i>\s*<select\s*value=\{targetScrollAyah \|\| ""\}\s*onChange=\{e => \{\s*if \(e\.target\.value\) setTargetScrollAyah\(parseInt\(e\.target\.value\)\)\s*\}\}\s*style=\{\{ width: "100%", height: 32, fontSize: 11, borderRadius: 6, border: "0\.5px solid var\(--quran-br\)", background: "var\(--quran-bg\)", color: "var\(--quran-text\)", padding: "0 8px" \}\}\s*>\s*<option value="">🎯 เลือกอายะฮ์เพื่อข้ามไป\.\.\.<\/option>\s*\{Array\.from\(\{ length: s\.numberOfAyahs \}, \(_, i\) => i \+ 1\)\.map\(a => \(\s*<option key=\{a\} value=\{a\}>อายะฮ์ที่ \{a\}<\/option>\s*\)\)\}\s*<\/select>\s*<\/div>/g;

const newDesktopAyah = `<div style={{ padding: "8px 14px", background: "var(--quran-bg2)", borderBottom: "0.5px solid var(--quran-br)", display: "flex", alignItems: "center", gap: 8 }}>
                                  <i className="ti ti-corner-down-right" style={{ fontSize: 14, color: "var(--quran-teal)" }}></i>
                                  <div style={{ position: "relative", width: "100%" }}>
                                    <select
                                      value={targetScrollAyah || ""}
                                      onChange={e => {
                                        if (e.target.value) setTargetScrollAyah(parseInt(e.target.value))
                                      }}
                                      style={{ width: "100%", height: 32, padding: "0 24px 0 10px", fontSize: "11.5px", fontWeight: 500, borderRadius: "6px", border: "0.5px solid var(--quran-br)", background: "var(--quran-bg)", color: "var(--quran-text)", cursor: "pointer", appearance: "none", outline: "none" }}
                                    >
                                      <option value="">🎯 เลือกอายะฮ์เพื่อข้ามไป...</option>
                                      {Array.from({ length: s.numberOfAyahs }, (_, i) => i + 1).map(a => (
                                        <option key={a} value={a}>อายะฮ์ที่ {a}</option>
                                      ))}
                                    </select>
                                    <i className="ti ti-chevron-down" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, pointerEvents: "none", color: "var(--quran-t3)" }}></i>
                                  </div>
                                </div>`;

if (regexDesktopAyah.test(content)) {
  content = content.replace(regexDesktopAyah, newDesktopAyah);
  console.log("Updated Desktop Ayah selector.");
} else {
  console.log("Failed to find Desktop Ayah selector.");
}

// 3. Fix Mobile Sidebar Ayah Selector UI
const regexMobileAyah = /<div style=\{\{ padding: "12px 16px", background: "var\(--quran-teal-bg\)", borderRadius: "0 0 10px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "0\.5px dashed rgba\(45, 190, 160, 0\.3\)" \}\}>\s*<select\s*value=\{targetScrollAyah \|\| ""\}\s*onChange=\{e => \{\s*if \(e\.target\.value\) \{\s*setTargetScrollAyah\(parseInt\(e\.target\.value\)\);\s*setIsMobileNavOpen\(false\); \/\/ Close nav when Ayah is selected\s*\}\s*\}\}\s*style=\{\{ width: "100%", height: 38, fontSize: 13, borderRadius: 8, border: "1px solid var\(--quran-teal\)", background: "var\(--quran-bg\)", color: "var\(--quran-text\)", padding: "0 10px" \}\}\s*>\s*<option value="">🎯 เลือกอายะฮ์\.\.\.<\/option>\s*\{Array\.from\(\{ length: s\.numberOfAyahs \}, \(_, i\) => i \+ 1\)\.map\(a => \(\s*<option key=\{a\} value=\{a\}>อายะฮ์ที่ \{a\}<\/option>\s*\)\)\}\s*<\/select>\s*<button\s*onClick=\{[^{]*\}\s*style=\{[^{]*\}\s*>\s*ไปที่ซูเราะฮ์นี้ \(หน้าแรก\)\s*<\/button>\s*<\/div>/g;

const newMobileAyah = `<div style={{ padding: "12px 16px", background: "var(--quran-teal-bg)", borderRadius: "0 0 10px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "0.5px dashed rgba(45, 190, 160, 0.3)" }}>
                                  <div style={{ position: "relative", width: "100%" }}>
                                    <select
                                      value={targetScrollAyah || ""}
                                      onChange={e => {
                                        if (e.target.value) {
                                          setTargetScrollAyah(parseInt(e.target.value));
                                          setIsMobileNavOpen(false); // Close nav when Ayah is selected
                                        }
                                      }}
                                      style={{ width: "100%", padding: "10px 28px 10px 12px", fontSize: "13px", fontWeight: 500, borderRadius: "8px", border: "1px solid var(--quran-teal)", background: "var(--quran-bg)", color: "var(--quran-text)", cursor: "pointer", appearance: "none", outline: "none" }}
                                    >
                                      <option value="">🎯 เลือกอายะฮ์...</option>
                                      {Array.from({ length: s.numberOfAyahs }, (_, i) => i + 1).map(a => (
                                        <option key={a} value={a}>อายะฮ์ที่ {a}</option>
                                      ))}
                                    </select>
                                    <i className="ti ti-chevron-down" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, pointerEvents: "none", color: "var(--quran-teal)" }}></i>
                                  </div>
                                  <button
                                    onClick={() => setIsMobileNavOpen(false)}
                                    style={{ width: "100%", padding: "10px", fontSize: 13, borderRadius: 8, background: "var(--quran-teal)", color: "#fff", border: "none", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                                  >
                                    <i className="ti ti-book" style={{ fontSize: 15 }}></i> ไปที่ซูเราะฮ์นี้ (ตั้งแต่หน้าแรก)
                                  </button>
                                </div>`;

if (regexMobileAyah.test(content)) {
  content = content.replace(regexMobileAyah, newMobileAyah);
  console.log("Updated Mobile Ayah selector.");
} else {
  console.log("Failed to find Mobile Ayah selector.");
}

fs.writeFileSync(quranPath, content);
console.log("Successfully patched UI issues.");
