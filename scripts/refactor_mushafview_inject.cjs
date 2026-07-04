const fs = require('fs');
let code = fs.readFileSync('src/pages/Quran.jsx', 'utf8');

// Block 1:
const regex1 = /<div\s+className="mushaf-flow"[\s\S]*?ไม่พบข้อมูลหน้านี้ กรุณาลองเลือกหน้าใหม่อีกครั้ง[\s\S]*?<\/div>\s*\)\}\s*<\/div>/;
const toReplace1 = code.match(regex1)?.[0];
if (toReplace1) {
  const replaceWith1 = `<MushafView 
                            verses={pageVerses}
                            arabicSize={arabicSize}
                            quranFont={quranFont}
                            isMobile={isMobile}
                            lastRead={lastRead}
                            tajweedEnabled={tajweedEnabled}
                            setActiveAyahMenu={setActiveAyahMenu}
                            emptyMessage="ไม่พบข้อมูลหน้านี้ กรุณาลองเลือกหน้าใหม่อีกครั้ง"
                          />`;
  code = code.replace(toReplace1, replaceWith1);
  console.log('Replaced block 1 successfully.');
} else {
  console.log('regex1 failed');
}

// Block 2:
const regex2 = /\/\*\s*STANDARD SURAH-BASED MUSHAF VIEW\s*\*\/[\s\S]*?<div\s+className="mushaf-flow"[\s\S]*?<\/span>\s*\)\s*\}\)\}\s*<\/div>/;
const toReplace2 = code.match(regex2)?.[0];
if (toReplace2) {
  const replaceWith2 = `{/* STANDARD SURAH-BASED MUSHAF VIEW */}
                    <MushafView 
                      verses={verses}
                      arabicSize={arabicSize}
                      quranFont={quranFont}
                      isMobile={isMobile}
                      lastRead={lastRead}
                      tajweedEnabled={tajweedEnabled}
                      setActiveAyahMenu={setActiveAyahMenu}
                    />`;
  code = code.replace(toReplace2, replaceWith2);
  console.log('Replaced block 2 successfully.');
} else {
  console.log('regex2 failed');
}

fs.writeFileSync('src/pages/Quran.jsx', code);
