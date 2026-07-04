const fs = require('fs');
let code = fs.readFileSync('src/pages/Quran.jsx', 'utf8');

// Find start and end indices using lines
const lines = code.split(/\r?\n/);
const startLineIdx = lines.findIndex(l => l.includes('        {!isMobile ? ('));
const endLineIdx = lines.findIndex(l => l.includes('        {/* MAIN PANEL */}'));

if (startLineIdx !== -1 && endLineIdx !== -1) {
  const replacementLines = `        <QuranSidebar 
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
        />`.split('\n');

  lines.splice(startLineIdx, endLineIdx - startLineIdx, ...replacementLines);
  
  code = lines.join('\n'); // Write back with \n
  
  // Inject import if missing
  if (!code.includes('import QuranSidebar')) {
    code = code.replace(
      'import QuranHeader',
      'import QuranSidebar from "./quran/components/QuranSidebar.jsx";\nimport QuranHeader'
    );
  }
  
  fs.writeFileSync('src/pages/Quran.jsx', code);
  console.log('Successfully replaced Sidebar block!');
} else {
  console.log('Could not find Sidebar bounds.');
}
