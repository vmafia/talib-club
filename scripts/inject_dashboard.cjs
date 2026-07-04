const fs = require('fs');

let quranCode = fs.readFileSync('src/pages/ReadingApp.jsx', 'utf8');

// We need to replace the entire chunk with the <ReadingDashboard /> invocation
const startString = '  // --- Reading App Home / Dashboard View ---';
const startIdx = quranCode.indexOf(startString);
if (startIdx !== -1) {
  const toReplace = quranCode.substring(startIdx);
  
  const replacement = `  // --- Reading App Home / Dashboard View ---
  return (
    <ReadingDashboard
      showTutorial={showTutorial} setShowTutorial={setShowTutorial}
      readingTab={readingTab} setReadingTab={setReadingTab}
      myActiveBooks={myActiveBooks} myFinishedBooks={myFinishedBooks}
      showAddForm={showAddForm} setShowAddForm={setShowAddForm}
      addMode={addMode} setAddMode={setAddMode}
      selectedBookToAdd={selectedBookToAdd} setSelectedBookToAdd={setSelectedBookToAdd}
      books={books} addNewBookToShelf={addNewBookToShelf}
      customBookTitle={customBookTitle} setCustomBookTitle={setCustomBookTitle}
      customBookAuthor={customBookAuthor} setCustomBookAuthor={setCustomBookAuthor}
      customBookUrl={customBookUrl} setCustomBookUrl={setCustomBookUrl}
      customBookDesc={customBookDesc} setCustomBookDesc={setCustomBookDesc}
      customBookTotalPages={customBookTotalPages} setCustomBookTotalPages={setCustomBookTotalPages}
      customBookFile={customBookFile} setCustomBookFile={setCustomBookFile}
      uploadingExternal={uploadingExternal} addCustomBookToShelf={addCustomBookToShelf}
      searchQ={searchQ} setSearchQ={setSearchQ}
      filteredActiveBooks={filteredActiveBooks} filteredFinishedBooks={filteredFinishedBooks}
      startReadingSession={startReadingSession}
      markFinished={markFinished}
      removeShelfItem={removeShelfItem}
      stats={stats}
      hasConfiguredNotif={hasConfiguredNotif}
      notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled}
      notifTime={notifTime} setNotifTime={setNotifTime}
      saveNotifSettings={saveNotifSettings}
      streakSettings={streakSettings}
      streak={streak}
      todayKey={todayKey()}
      todaySeconds={todaySeconds} goalPercent={goalPercent}
      DAILY_READING_GOAL_MINUTES={DAILY_READING_GOAL_MINUTES}
      showShop={showShop} setShowShop={setShowShop}
      inventory={inventory} setInventory={setInventory}
      useFreeze={useFreeze} useLeave={useLeave}
      missionStatus={missionStatus} handleClaimMission={handleClaimMission}
      activeQuizShelfItem={activeQuizShelfItem} setActiveQuizShelfItem={setActiveQuizShelfItem} handleQuizSubmit={handleQuizSubmit}
    />
  );
}
`;
        
  quranCode = quranCode.replace(toReplace, replacement);
  
  // Inject import
  if (!quranCode.includes('import ReadingDashboard')) {
    quranCode = quranCode.replace(
      'import { MissionRow } from "./reading/components/MissionRow.jsx"',
      'import { MissionRow } from "./reading/components/MissionRow.jsx"\nimport ReadingDashboard from "./reading/components/ReadingDashboard.jsx"'
    );
  }
  
  fs.writeFileSync('src/pages/ReadingApp.jsx', quranCode);
  console.log('Updated ReadingApp.jsx');
} else {
  console.log('Could not find dashboard block to replace.');
}
