import React from 'react';
import toast from 'react-hot-toast';
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
    externalBook, setExternalBook,
    uploadingExternal, addExternalBook,
    go,
    availableBooks,
    startReading,
    formatReadingMinutes,
    protectToday,
    last7Days,
    renderNotificationSettings,
    buyItem,
    claimMission,
    todaySessions,
    todayQuizPassed,
    theme,
    authState,
    handleSaveQuizScore,
    removeShelfItem,
    stats,
    hasConfiguredNotif,
    notifEnabled, setNotifEnabled,
    notifTime, setNotifTime,
    streakSettings,
    streak,
    todaySeconds, goalPercent,
    DAILY_READING_GOAL_MINUTES,
    activeQuizShelfItem, setActiveQuizShelfItem
  } = props;

  // --- Reading App Home / Dashboard View ---
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 40, width: "100%", textAlign: "left" }}>
      {/* Onboarding Tutorial Modal */}
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {/* Home Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 600, textTransform: "uppercase" }}>Talib Private Reader</span>
          <h1 style={{ fontSize: 24, marginTop: 4 }}>ห้องอ่านหนังสือส่วนตัว</h1>
          <p style={{ fontSize: 12, color: "var(--t2)" }}>Gamified Reading App - บันทึกเวลาอ่านอัตโนมัติ สะสมไอเทม และทำภารกิจรายวัน</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setShowTutorial(true)}
            style={{ background: "none", border: "none", color: "var(--teal)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "'Prompt', sans-serif" }}
          >
            <i className="ti ti-help-circle"></i> วิธีใช้งาน
          </button>
          <button className="btn btn-outline" onClick={() => go("member", { view: "overview" })} style={{ fontSize: 12, padding: "8px 16px" }}>
            <i className="ti ti-layout-dashboard" style={{ marginRight: 6 }}></i>แดชบอร์ดหลัก
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .reader-grid-layout {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 20px;
          align-items: start;
          width: 100%;
        }
        @media (max-width: 800px) {
          .reader-grid-layout {
            grid-template-columns: 1fr;
          }
        }
      `}} />

      <div className="reader-grid-layout">
        {/* Left Column: Active Bookshelf (Primary Core Actions) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Active Bookshelf Shelf Section */}
          <div style={{ marginBottom: 8 }}>
            {/* Tab navigation */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--br2)", paddingBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => setReadingTab("reading")}
                className={`reader-btn ${readingTab === "reading" ? "on" : ""}`}
                style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
              >
                กำลังอ่าน ({myActiveBooks.length})
              </button>
              <button
                onClick={() => setReadingTab("finished")}
                className={`reader-btn ${readingTab === "finished" ? "on" : ""}`}
                style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
              >
                อ่านจบแล้ว ({myFinishedBooks.length})
              </button>
              <button
                onClick={() => setReadingTab("stats")}
                className={`reader-btn ${readingTab === "stats" ? "on" : ""}`}
                style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
              >
                สถิติสะสม 📊
              </button>

              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="btn btn-outline"
                style={{ fontSize: 11, padding: "6px 14px", borderRadius: 20, marginLeft: "auto" }}
              >
                <i className={`ti ${showAddForm ? "ti-minus" : "ti-plus"}`}></i> {showAddForm ? "ปิดช่องเพิ่มหนังสือ" : "เพิ่มหนังสือเข้าชั้น"}
              </button>
            </div>

            {showAddForm && (
              <div className="card" style={{ padding: 18, background: "var(--bg2)", border: "1.5px solid var(--br2)", borderRadius: 12, marginBottom: 16, animation: "pageFadeIn 0.2s ease-out" }}>
                <div className="reader-control" style={{ marginBottom: 12, display: "flex", gap: 4, width: "fit-content" }}>
                  <button
                    className={`reader-btn ${addMode === "library" ? "on" : ""}`}
                    onClick={() => setAddMode("library")}
                    style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
                  >
                    เลือกจากคลังของเว็บ
                  </button>
                  <button
                    className={`reader-btn ${addMode === "external" ? "on" : ""}`}
                    onClick={() => setAddMode("external")}
                    style={{ fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", borderRadius: 20 }}
                  >
                    อัปโหลดไฟล์ / ลิงก์นอก
                  </button>
                </div>

                {addMode === "library" ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={selectedBookToAdd}
                      onChange={event => setSelectedBookToAdd(event.target.value)}
                      style={{ fontSize: 12, padding: "8px 10px", flex: 1, minWidth: 200 }}
                    >
                      <option value="">-- เลือกหนังสือจากคลัง --</option>
                      {availableBooks.map(book => (
                        <option key={book.id} value={book.id}>{book.title} ({book.author})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { addNewBookToShelf(); setShowAddForm(false); }}
                      disabled={!selectedBookToAdd}
                      className="btn btn-teal"
                      style={{ padding: "8px 20px", fontSize: 12 }}
                    >
                      เพิ่มเข้าชั้นหนังสือ
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input
                        value={externalBook.title}
                        onChange={event => setExternalBook(prev => ({ ...prev, title: event.target.value }))}
                        placeholder="ชื่อหนังสือหรือไฟล์ *"
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                      <input
                        value={externalBook.author}
                        onChange={event => setExternalBook(prev => ({ ...prev, author: event.target.value }))}
                        placeholder="ผู้เขียน/แหล่งที่มา (ไม่บังคับ)"
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                      <input
                        value={externalBook.fileUrl}
                        onChange={event => setExternalBook(prev => ({ ...prev, fileUrl: event.target.value }))}
                        placeholder="ลิงก์ PDF / Google Drive / URL อ่านออนไลน์"
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                      <input
                        type="number"
                        min="0"
                        value={externalBook.totalPages}
                        onChange={event => setExternalBook(prev => ({ ...prev, totalPages: event.target.value }))}
                        placeholder="จำนวนหน้าทั้งหมด"
                        style={{ fontSize: 12, padding: "8px 10px" }}
                      />
                    </div>
                    <textarea
                      value={externalBook.desc}
                      onChange={event => setExternalBook(prev => ({ ...prev, desc: event.target.value }))}
                      placeholder="คำอธิบายหรือจดบันทึกเป้าหมายสั้น ๆ สำหรับหนังสือเล่มนี้..."
                      style={{ fontSize: 12, padding: "8px 10px", minHeight: 60 }}
                    />

                    <label className="bookshelf-file-input" style={{
                      display: "flex", alignItems: "center", gap: 10, minHeight: 44,
                      border: "1px dashed var(--br)", borderRadius: 10, background: "var(--card)",
                      padding: "10px 12px", color: "var(--t2)", fontSize: 12, cursor: "pointer"
                    }}>
                      <i className="ti ti-upload" style={{ color: "var(--teal)", fontSize: 18 }}></i>
                      <span>{externalBook.file ? externalBook.file.name : "หรือคลิกอัปโหลดไฟล์ PDF จากเครื่อง (จำกัด 20MB)"}</span>
                      <input
                        type="file"
                        accept=".pdf,.epub,.doc,.docx,.txt"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (!file) {
                            setExternalBook(prev => ({ ...prev, file: null }));
                            return;
                          }

                          // 🟢 ดักจับขนาดไฟล์ไม่เกิน 20MB (20 * 1024 * 1024 = 20,971,520 bytes)
                          const MAX_FILE_SIZE = 20 * 1024 * 1024;
                          if (file.size > MAX_FILE_SIZE) {
                            toast.error("ขนาดไฟล์ใหญ่เกินไป (จำกัดไม่เกิน 20MB)");
                            event.target.value = ""; // เคลียร์ค่า input เพื่อให้เลือกไฟล์ใหม่ได้
                            return;
                          }

                          // ถ้าไฟล์ขนาดผ่านเกณฑ์ ค่อยบันทึกลง State
                          setExternalBook(prev => ({ ...prev, file }));
                        }}
                        style={{ display: "none" }}
                      />
                    </label>

                    <button
                      className="btn btn-teal"
                      onClick={async () => { await addExternalBook(); setShowAddForm(false); }}
                      disabled={uploadingExternal}
                      style={{ width: "100%", padding: "10px", fontSize: 12 }}
                    >
                      <i className={`ti ${uploadingExternal ? "ti-loader-2 spin" : "ti-plus"}`} style={{ marginRight: 6 }}></i>
                      {uploadingExternal ? "กำลังอัปโหลดและบันทึกไฟล์..." : "บันทึกและเพิ่มไฟล์นอกเข้าชั้น"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {readingTab === "reading" && (
              myActiveBooks.length === 0 ? (
                <div className="card" style={{ padding: "32px 16px", textAlign: "center", color: "var(--t3)" }}>
                  <i className="ti ti-book-2" style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}></i>
                  <p style={{ fontSize: 13 }}>ไม่มีหนังสืออยู่ในหน้าอ่านค้างไว้ในขณะนี้</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>กรุณาเลือกหนังสือจากกล่องเลือกด้านบนเพื่อเพิ่มเข้าชั้นหนังสือและเริ่มเซสชันจับเวลาอ่านจริงครับ</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {myActiveBooks.map(item => (
                    <div key={item.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          <span className="tag tag-teal" style={{ fontSize: 9, padding: "1px 6px" }}>{item.book.category || "หนังสือ"}</span>
                          <span className="tag" style={{ fontSize: 9, padding: "1px 6px", background: "var(--acc2)" }}>{item.book.type}</span>
                        </div>
                        <strong style={{ fontSize: 13, color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4 }}>{item.book.title}</strong>
                        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4, marginBottom: 12 }}>{item.book.author}</div>

                        {/* Progress bar */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--t2)", marginBottom: 4 }}>
                            <span>ความคืบหน้า</span>
                            <span>{item.progress || 0}%</span>
                          </div>
                          <div style={{ height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${item.progress || 0}%`, height: "100%", background: "var(--teal)", borderRadius: 3 }}></div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => startReading(item)}
                          className="btn btn-teal"
                          style={{ flex: 1, padding: "6px 0", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                        >
                          <i className="ti ti-device-desktop"></i> เปิดห้องอ่าน (จับเวลา)
                        </button>
                        <button
                          onClick={() => removeShelfItem(item.id)}
                          className="btn btn-outline"
                          style={{ padding: "6px 10px", fontSize: 11, color: "#e05555", borderColor: "rgba(224,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="ลบหนังสือออกจากชั้น"
                        >
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {readingTab === "finished" && (
              myFinishedBooks.length === 0 ? (
                <div className="card" style={{ padding: "32px 16px", textAlign: "center", color: "var(--t3)" }}>
                  <i className="ti ti-book" style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}></i>
                  <p style={{ fontSize: 13 }}>ยังไม่มีหนังสือที่อ่านจบแล้วในคลัง</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>สู้ๆ ครับ! เมื่อคุณอ่านหนังสือได้ครบ 100% หนังสือจะย้ายมาอยู่ตู้นี้โดยอัตโนมัติ</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {myFinishedBooks.map(item => (
                    <div key={item.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: 0.9 }}>
                      <div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          <span className="tag tag-teal" style={{ fontSize: 9, padding: "1px 6px" }}>{item.book.category || "หนังสือ"}</span>
                          <span className="tag" style={{ fontSize: 9, padding: "1px 6px", background: "var(--teal-bg)", color: "var(--teal)" }}>อ่านจบแล้ว ✨</span>
                        </div>
                        <strong style={{ fontSize: 13, color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4 }}>{item.book.title}</strong>
                        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4, marginBottom: 12 }}>{item.book.author}</div>

                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--t2)", marginBottom: 4 }}>
                            <span>ความคืบหน้า</span>
                            <span>100%</span>
                          </div>
                          <div style={{ height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: "100%", height: "100%", background: "var(--teal)", borderRadius: 3 }}></div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--t2)", display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--br2)", paddingTop: 8, marginTop: 8 }}>
                          <span>อ่านสะสม: {formatReadingMinutes(item.totalReadSeconds || 0)}</span>
                          <span>ยืนยันข้อมูล: {item.verifiedSessions || 0} ครั้ง</span>
                          {item.lastQuiz ? (
                            <span style={{ color: item.lastQuiz.score >= 12 ? "var(--teal)" : "#e05555", fontWeight: 500 }}>
                              คะแนนควิซล่าสุด: {item.lastQuiz.score}/20 ({item.lastQuiz.score >= 12 ? "ผ่าน" : "ไม่ผ่าน"})
                            </span>
                          ) : (
                            <span style={{ color: "var(--t3)", fontStyle: "italic" }}>ยังไม่ได้ทำควิซทบทวน</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                          <button
                            onClick={() => setActiveQuizShelfItem(item)}
                            className="btn btn-teal"
                            style={{ flex: 2, padding: "6px 0", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                          >
                            <i className="ti ti-help"></i> ทำแบบทดสอบ
                          </button>
                          <button
                            onClick={() => removeShelfItem(item.id)}
                            className="btn btn-outline"
                            style={{ flex: 1, padding: "6px 0", fontSize: 11, color: "#e05555", borderColor: "rgba(224,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                          >
                            <i className="ti ti-trash"></i> ลบ
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {readingTab === "stats" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-book-2" style={{ color: "var(--teal)", fontSize: 20 }}></i>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>กำลังอ่าน</span>
                    <strong style={{ fontSize: 16, color: "var(--text)" }}>{stats.reading} เล่ม</strong>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,179,0,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-check" style={{ color: "rgb(255,179,0)", fontSize: 20 }}></i>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>อ่านจบแล้ว</span>
                    <strong style={{ fontSize: 16, color: "var(--text)" }}>{stats.finished} เล่ม</strong>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,115,196,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-chart-dots" style={{ color: "#6ba0ff", fontSize: 20 }}></i>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>ความคืบหน้าเฉลี่ย</span>
                    <strong style={{ fontSize: 16, color: "var(--text)" }}>{stats.avgProgress}%</strong>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(167,139,250,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-shield-check" style={{ color: "#a78bfa", fontSize: 20 }}></i>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: "var(--t3)", display: "block" }}>อ่านจริงที่ยืนยันแล้ว</span>
                    <strong style={{ fontSize: 14, color: "var(--text)", display: "block" }}>{stats.verifiedSessions} ครั้ง</strong>
                    <span style={{ fontSize: 9, color: "var(--t2)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>สะสม: {formatReadingMinutes(stats.totalSeconds)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Gamification Stats (Sidebar) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Gamified Streak Row (Duolingo Style - Sidebar Compact Version) */}
          <section className="card streak-panel" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18, marginBottom: 0 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div className="streak-flame" style={{ flexShrink: 0, width: 40, height: 40, fontSize: 20 }}>
                <i className="ti ti-flame"></i>
              </div>
              <div className="streak-main" style={{ flex: 1, minWidth: 0 }}>
                <span className="badge badge-teal" style={{ fontSize: 9, padding: "2px 6px" }}>ความต่อเนื่องในการอ่านสะสม</span>
                <h2 style={{ fontSize: 16, marginTop: 4, fontWeight: 600 }}>{streak.current} วันต่อเนื่อง</h2>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "var(--t2)" }}>
              เป้าหมายวันนี้ {formatReadingMinutes(todaySeconds)}/{DAILY_READING_GOAL_MINUTES} นาที
              {streak.todayVerified ? " (สำเร็จแล้ววันนี้! 🔥)" : ""}
            </div>
            <div className="streak-progress" style={{ height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden", marginTop: 2 }}>
              <div style={{ width: `${goalPercent}%`, height: "100%", background: "var(--teal)", borderRadius: 3 }}></div>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <div className="btn btn-outline" style={{ flex: 1, padding: "6px 8px", fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: 0.8, pointerEvents: "none", cursor: "default", whiteSpace: "nowrap" }}>
                <i className="ti ti-snowflake" style={{ color: "#64c8ff" }}></i>น้ำแข็ง {streakSettings.freezeCredits}
              </div>
              <button className="btn btn-outline" onClick={() => protectToday("leave")} disabled={streak.todayVerified || streak.todayProtected || streakSettings.leaveCredits <= 0} style={{ flex: 1, padding: "6px 8px", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, whiteSpace: "nowrap" }}>
                <i className="ti ti-calendar-pause" style={{ color: "#3b73c4" }}></i>ลากิจ {streakSettings.leaveCredits}
              </button>
            </div>

            {/* 7 Days Stats Grid */}
            <div style={{ paddingTop: 10, borderTop: "1px solid var(--br2)", marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
                {last7Days.map(day => {
                  let bg = "var(--bg3)"
                  let border = "1px solid var(--br)"
                  let color = "var(--t3)"
                  let icon = null

                  if (day.metGoal) {
                    bg = "var(--teal-bg)"
                    border = "1.5px solid var(--teal)"
                    color = "var(--teal)"
                    icon = <i className="ti ti-flame" style={{ fontSize: 12 }}></i>
                  } else if (day.protection) {
                    const isLeave = day.protection.type === "leave"
                    bg = isLeave ? "rgba(59, 115, 196, 0.1)" : "rgba(100, 200, 255, 0.1)"
                    border = isLeave ? "1.5px solid #3b73c4" : "1.5px solid #64c8ff"
                    color = isLeave ? "#3b73c4" : "#64c8ff"
                    icon = isLeave ? <i className="ti ti-calendar-pause" style={{ fontSize: 10 }}></i> : <i className="ti ti-snowflake" style={{ fontSize: 10 }}></i>
                  } else if (day.hasRead) {
                    bg = "var(--bg2)"
                    border = "1px dashed var(--teal)"
                    color = "var(--teal)"
                    icon = <span style={{ fontSize: 8, fontWeight: "bold" }}>{day.minutes}ม</span>
                  } else {
                    icon = <i className="ti ti-minus" style={{ opacity: 0.3, fontSize: 10 }}></i>
                  }

                  const isToday = day.key === streak.todayKey

                  return (
                    <div key={day.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1, minWidth: 32 }}>
                      <span style={{ fontSize: 9, color: isToday ? "var(--teal)" : "var(--t2)", fontWeight: isToday ? 600 : 300 }}>{day.name}</span>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: bg, border: border, color: color,
                        position: "relative"
                      }}>
                        {icon}
                        {isToday && (
                          <span style={{
                            position: "absolute", bottom: -1, width: 4, height: 4,
                            borderRadius: "50%", background: "var(--teal)"
                          }} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* If NOT configured, place it as position #2 (promoted with highlight border) */}
          {!hasConfiguredNotif && renderNotificationSettings(true)}

          {/* 💎 Item Shop & Currency Card */}
          <div className="card" style={{ padding: 18, marginBottom: 0, display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-shopping-cart" style={{ color: "var(--teal)", fontSize: 16 }}></i>
                <h3 style={{ fontSize: 13, fontWeight: 600 }}>ร้านค้าไอเทม (Item Shop)</h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(245,158,11,0.08)", padding: "4px 8px", borderRadius: 20, border: "0.5px solid rgba(245,158,11,0.2)" }}>
                <span style={{ fontSize: 13 }}>💎</span>
                <strong style={{ fontSize: 13, color: "#f59e0b" }}>{streakSettings.gems || 0}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {/* Item 1: Freeze Ice */}
              <div style={{ display: "flex", flex: 1, minWidth: 200, alignItems: "center", justifyContent: "space-between", background: "var(--bg2)", padding: 10, borderRadius: 10, border: "0.5px solid var(--br)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>🧊</span>
                  <div>
                    <strong style={{ fontSize: 11, color: "var(--text)", display: "block" }}>น้ำแข็ง (Freeze)</strong>
                    <span style={{ fontSize: 9, color: "var(--t3)", display: "block" }}>คุ้มครอง Streak อัตโนมัติ</span>
                  </div>
                </div>
                <button
                  className="btn btn-teal"
                  onClick={() => buyItem("freeze")}
                  disabled={Number(streakSettings.gems || 0) < 50 || Number(streakSettings.freezeCredits || 0) >= 2}
                  style={{ padding: "6px 10px", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span>50 💎</span>
                </button>
              </div>

              {/* Item 2: Leave Day */}
              <div style={{ display: "flex", flex: 1, minWidth: 200, alignItems: "center", justifyContent: "space-between", background: "var(--bg2)", padding: 10, borderRadius: 10, border: "0.5px solid var(--br)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  <div>
                    <strong style={{ fontSize: 11, color: "var(--text)", display: "block" }}>ลากิจ (Leave)</strong>
                    <span style={{ fontSize: 9, color: "var(--t3)", display: "block" }}>กดใช้วันนี้ด้วยตัวเอง</span>
                  </div>
                </div>
                <button
                  className="btn btn-teal"
                  onClick={() => buyItem("leave")}
                  disabled={Number(streakSettings.gems || 0) < 80 || Number(streakSettings.leaveCredits || 0) >= 2}
                  style={{ padding: "6px 10px", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span>80 💎</span>
                </button>
              </div>
            </div>
          </div>

          {/* 🎯 Daily Missions Checklist */}
          <div className="card" style={{ padding: 18, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <i className="ti ti-target" style={{ color: "var(--teal)", fontSize: 16 }}></i>
              <h3 style={{ fontSize: 13, fontWeight: 600 }}>ภารกิจสะสมไอเทมประจำวัน</h3>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <MissionRow
                title="1. นักอ่านผู้ทุ่มเท"
                desc="สะสมเวลาอ่านหนังสือให้ครบ 10 นาทีในวันนี้"
                progress={todaySeconds}
                target={600}
                formatProgress={(val) => `${Math.round(val / 60)}/10 นาที`}
                rewardText="+5 💎"
                claimed={streakSettings.claimedMissions?.[streak.todayKey]?.m1}
                onClaim={() => claimMission("m1")}
              />

              <MissionRow
                title="2. บันทึกธรรมสะกิดใจ"
                desc="บันทึกบันทึกการอ่านและเขียนข้อคิดที่มีความยาว 100 ตัวอักษรขึ้นไปในเซสชันเดียวกันวันนี้"
                progress={todaySessions.reduce((max, s) => Math.max(max, s.reflection?.length || 0), 0)}
                target={100}
                formatProgress={(val) => `${val}/100 ตัวอักษร`}
                rewardText="+8 💎"
                claimed={streakSettings.claimedMissions?.[streak.todayKey]?.m2}
                onClaim={() => claimMission("m2")}
              />

              <MissionRow
                title="3. สอบควิซหนังสือ"
                desc="ทำแบบทดสอบ (Quiz) หนังสือใดๆ บนชั้นหนังสือ และสอบผ่านได้คะแนน 12/20 ข้อขึ้นไปวันนี้"
                progress={todayQuizPassed ? 1 : 0}
                target={1}
                formatProgress={(val) => val === 1 ? "สำเร็จ" : "ยังไม่สำเร็จ"}
                rewardText="+10 💎"
                claimed={streakSettings.claimedMissions?.[streak.todayKey]?.m3}
                onClaim={() => claimMission("m3")}
              />
            </div>
          </div>

          {/* If configured, place it at the bottom (position #4) */}
          {hasConfiguredNotif && renderNotificationSettings(false)}
        </div>
      </div>
      {activeQuizShelfItem && (
        <QuizModal
          shelfItem={activeQuizShelfItem}
          theme={theme}
          user={authState?.user}
          onClose={() => setActiveQuizShelfItem(null)}
          onSaveScore={handleSaveQuizScore}
        />
      )}
    </div>
  )
}


