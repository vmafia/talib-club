const fs = require('fs');

const sidebarCode = fs.readFileSync('scratch/sidebar.txt', 'utf8');

const componentCode = `import React from 'react';

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
` + sidebarCode + `
    </>
  );
}
`;

fs.writeFileSync('src/pages/quran/components/QuranSidebar.jsx', componentCode);
console.log('Saved QuranSidebar.jsx');

let quranCode = fs.readFileSync('src/pages/Quran.jsx', 'utf8');

// Insert import
quranCode = quranCode.replace(
  'import MushafView from "./quran/components/MushafView.jsx"',
  'import MushafView from "./quran/components/MushafView.jsx"\nimport QuranSidebar from "./quran/components/QuranSidebar.jsx"'
);

// We need to replace the entire chunk with the <QuranSidebar /> invocation
const startString = '        {!isMobile ? (';
const endString = '              </button>\n            </div>\n          </div>\n        )}';
const startIdx = quranCode.indexOf(startString);
if (startIdx !== -1) {
  const endIdx = quranCode.indexOf(endString, startIdx) + endString.length;
  const toReplace = quranCode.substring(startIdx, endIdx);
  
  const replacement = `        <QuranSidebar 
          isMobile={isMobile}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          navMode={navMode}
          setNavMode={setNavMode}
          search={search}
          setSearch={setSearch}
          filteredSurahs={filteredSurahs}
          selectedSura={selectedSura}
          setSelectedSura={setSelectedSura}
          setSelectedPage={setSelectedPage}
          setTargetScrollAyah={setTargetScrollAyah}
          targetScrollAyah={targetScrollAyah}
          JUZ_STARTS={JUZ_STARTS}
          handleSelectPage={handleSelectPage}
          pageInput={pageInput}
          setPageInput={setPageInput}
          handleKeywordSearch={handleKeywordSearch}
          keywordQuery={keywordQuery}
          setKeywordQuery={setKeywordQuery}
          searchLoading={searchLoading}
          searchError={searchError}
          searchResults={searchResults}
          searchHasRun={searchHasRun}
          handleSelectSearchResult={handleSelectSearchResult}
          setIsMobileNavOpen={setIsMobileNavOpen}
          mode={mode}
          currentSuraInfo={currentSuraInfo}
          showMobileSettings={showMobileSettings}
          setShowMobileSettings={setShowMobileSettings}
        />`;
        
  quranCode = quranCode.replace(toReplace, replacement);
  fs.writeFileSync('src/pages/Quran.jsx', quranCode);
  console.log('Updated Quran.jsx');
} else {
  console.log('Could not find sidebar block to replace.');
}
