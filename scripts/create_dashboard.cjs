const fs = require('fs');
const code = fs.readFileSync('scratch/reading_dashboard.txt', 'utf8');

let script = `import React from 'react';
import { TutorialModal } from './TutorialModal.jsx';
import { QuizModal } from './QuizModal.jsx';
import { MissionRow } from './MissionRow.jsx';

export default function ReadingDashboard(props) {
  const {
    showTutorial, setShowTutorial,
    readingTab, setReadingTab,
    myActiveBooks, myFinishedBooks,
    showAddForm, setShowAddForm,
    addMode, setAddMode,
    selectedBookToAdd, setSelectedBookToAdd,
    books, addNewBookToShelf,
    customBookTitle, setCustomBookTitle,
    customBookAuthor, setCustomBookAuthor,
    customBookUrl, setCustomBookUrl,
    customBookDesc, setCustomBookDesc,
    customBookTotalPages, setCustomBookTotalPages,
    customBookFile, setCustomBookFile,
    uploadingExternal, addCustomBookToShelf,
    searchQ, setSearchQ,
    filteredActiveBooks, filteredFinishedBooks,
    startReadingSession,
    markFinished,
    removeShelfItem,
    stats,
    hasConfiguredNotif,
    notifEnabled, setNotifEnabled,
    notifTime, setNotifTime,
    saveNotifSettings,
    streakSettings,
    streak,
    todayKey,
    todaySeconds, goalPercent,
    DAILY_READING_GOAL_MINUTES,
    showShop, setShowShop,
    inventory, setInventory,
    useFreeze, useLeave,
    missionStatus, handleClaimMission,
    activeQuizShelfItem, setActiveQuizShelfItem, handleQuizSubmit
  } = props;

` + code + `
}
`;

fs.writeFileSync('src/pages/reading/components/ReadingDashboard.jsx', script);
