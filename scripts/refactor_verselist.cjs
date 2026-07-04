const fs = require('fs');
const verseListStr = fs.readFileSync('scratch/verselist.txt', 'utf8');

const modalCode = `import React from 'react';
import DOMPurify from 'dompurify';
import { useAudioContext } from '../../../context/AudioContext.jsx';
import { SURA_LIST } from '../../../data/surahs.js';
import { stripTajweedTags } from '../utils/quranUtils.js';

export default function VerseList({
  verses,
  selectedPage,
  pageVerses,
  updateLastRead,
  lastRead,
  handleOpenBookmarkModal,
  getBookmarkForVerse,
  arabicSize,
  quranFont,
  tajweedEnabled,
  thaiSize,
  mode,
  isMobile
}) {
  const { playingAudio, audioState, play, pause, resume } = useAudioContext();

  return (
` + verseListStr.replace('/* TRANSLATION & TAFSIR MODES (VERSE LIST) */', '') + `  );
}
`;

fs.writeFileSync('src/pages/quran/components/VerseList.jsx', modalCode);
console.log('Saved VerseList.jsx');

let quranCode = fs.readFileSync('src/pages/Quran.jsx', 'utf8');

// Insert import
quranCode = quranCode.replace(
  'import BookmarkModal from "./quran/components/BookmarkModal.jsx"',
  'import BookmarkModal from "./quran/components/BookmarkModal.jsx"\nimport VerseList from "./quran/components/VerseList.jsx"'
);

// Replace block
const startStr = '/* TRANSLATION & TAFSIR MODES (VERSE LIST) */';
const endStr = '                    })}\r\n                  </div>';
const startIndex = quranCode.indexOf(startStr);
const endIndex = quranCode.indexOf(endStr, startIndex) + endStr.length;

if (startIndex !== -1 && endIndex !== -1) {
  const toReplace = quranCode.substring(startIndex, endIndex);
  const replacement = `{/* TRANSLATION & TAFSIR MODES (VERSE LIST) */}
                  <VerseList
                    verses={verses}
                    selectedPage={selectedPage}
                    pageVerses={pageVerses}
                    updateLastRead={updateLastRead}
                    lastRead={lastRead}
                    handleOpenBookmarkModal={handleOpenBookmarkModal}
                    getBookmarkForVerse={getBookmarkForVerse}
                    arabicSize={arabicSize}
                    quranFont={quranFont}
                    tajweedEnabled={tajweedEnabled}
                    thaiSize={thaiSize}
                    mode={mode}
                    isMobile={isMobile}
                  />`;
  
  quranCode = quranCode.replace(toReplace, replacement);
  fs.writeFileSync('src/pages/Quran.jsx', quranCode);
  console.log('Updated Quran.jsx');
} else {
  console.log('Could not find replace block in Quran.jsx');
}
