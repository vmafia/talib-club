const fs = require('fs');

const headerCode = fs.readFileSync('scratch/header.txt', 'utf8');

const componentCode = `import React from 'react';
import { getSurahTheme, SURA_LIST, TAFSIR_OPTIONS } from '../../../lib/contentStore';

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
  setQuranFont,
  tajweedEnabled,
  setTajweedEnabled,
  showWordByWord,
  setShowWordByWord,
  thaiTranslationId,
  setThaiTranslationId,
  selectedTafsir,
  setSelectedTafsir,
  scrollToReadingArea
}) {
  return (
    <>
` + headerCode + `
    </>
  );
}
`;

fs.writeFileSync('src/pages/quran/components/QuranHeader.jsx', componentCode);
console.log('Saved QuranHeader.jsx');

let quranCode = fs.readFileSync('src/pages/Quran.jsx', 'utf8');

// Insert import
quranCode = quranCode.replace(
  'import QuranSidebar from "./quran/components/QuranSidebar.jsx"',
  'import QuranSidebar from "./quran/components/QuranSidebar.jsx"\nimport QuranHeader from "./quran/components/QuranHeader.jsx"'
);

// We need to replace the entire chunk with the <QuranHeader /> invocation
const startString = '          {/* SURAH SUMMARY CARD */}';
const endString = '          {/* LOADING & ERROR STATES */}';

const startIdx = quranCode.indexOf(startString);
if (startIdx !== -1) {
  const endIdx = quranCode.indexOf(endString, startIdx);
  const toReplace = quranCode.substring(startIdx, endIdx);
  
  const replacement = `          <QuranHeader
            currentSuraInfo={currentSuraInfo}
            selectedPage={selectedPage}
            audioState={audioState}
            autoplayNext={autoplayNext}
            pause={pause}
            resume={resume}
            pageVerses={pageVerses}
            verses={verses}
            setAutoplayNext={setAutoplayNext}
            play={play}
            selectedSura={selectedSura}
            showObjective={showObjective}
            setShowObjective={setShowObjective}
            isMobile={isMobile}
            showMobileSettings={showMobileSettings}
            mode={mode}
            setMode={setMode}
            arabicSize={arabicSize}
            setArabicSize={setArabicSize}
            thaiSize={thaiSize}
            setThaiSize={setThaiSize}
            quranFont={quranFont}
            setQuranFont={setQuranFont}
            tajweedEnabled={tajweedEnabled}
            setTajweedEnabled={setTajweedEnabled}
            showWordByWord={showWordByWord}
            setShowWordByWord={setShowWordByWord}
            thaiTranslationId={thaiTranslationId}
            setThaiTranslationId={setThaiTranslationId}
            selectedTafsir={selectedTafsir}
            setSelectedTafsir={setSelectedTafsir}
            scrollToReadingArea={scrollToReadingArea}
          />\n\n`;
        
  quranCode = quranCode.replace(toReplace, replacement);
  fs.writeFileSync('src/pages/Quran.jsx', quranCode);
  console.log('Updated Quran.jsx');
} else {
  console.log('Could not find header block to replace.');
}
