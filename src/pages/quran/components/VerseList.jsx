import React from 'react';
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

                  <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                    {verses.map(v => {
                      const bookmark = getBookmarkForVerse(v.aya)
                      const isReciting = Number(playingAudio?.sura) === Number(v.sura) && Number(playingAudio?.aya) === Number(v.aya)
                      return (
                        <div
                          key={v.id}
                          id={`ayah-${v.aya}`}
                          style={{
                            borderBottom: "0.5px solid var(--br2)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                            padding: isMobile ? "24px 10px" : "20px 14px",
                            transition: "all 0.3s ease",
                            backgroundColor: isReciting ? "rgba(45, 190, 160, 0.06)" : "transparent",
                            borderLeft: isReciting ? "4px solid var(--quran-teal)" : "4px solid transparent",
                            borderRadius: isReciting ? "8px" : "0"
                          }}
                        >
                          {/* Verse marker and Bookmark button */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace" }}>
                              [{v.sura}:{v.aya}]
                            </span>

                            <div style={{ display: "flex", gap: 12 }}>
                              {/* Listen to this Ayah button */}
                              <button
                                onClick={() => {
                                  const isCurrent = Number(playingAudio?.sura) === Number(v.sura) && Number(playingAudio?.aya) === Number(v.aya)
                                  if (isCurrent && audioState === "playing") {
                                    pause()
                                  } else if (isCurrent && audioState === "paused") {
                                    resume()
                                  } else {
                                    const currentList = selectedPage ? pageVerses : verses
                                    play(v.sura, v.aya, SURA_LIST.find(s => Number(s.number) === Number(v.sura))?.englishName || "", currentList)
                                  }
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: (Number(playingAudio?.sura) === Number(v.sura) && Number(playingAudio?.aya) === Number(v.aya) && audioState === "playing") ? "var(--teal)" : "var(--t3)",
                                  padding: "4px 8px",
                                  fontSize: 14,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4
                                }}
                                title="ฟังเสียงอายะฮ์นี้"
                              >
                                <i className={(Number(playingAudio?.sura) === Number(v.sura) && Number(playingAudio?.aya) === Number(v.aya) && audioState === "playing") ? "ti ti-player-pause" : "ti ti-player-play"}></i>
                                <span style={{ fontSize: 10, fontFamily: "'Prompt', sans-serif" }}>
                                  {(Number(playingAudio?.sura) === Number(v.sura) && Number(playingAudio?.aya) === Number(v.aya) && audioState === "playing") ? "หยุดเล่น" : "ฟังเสียง"}
                                </span>
                              </button>

                              {/* Bookmark reading position */}
                              <button
                                onClick={() => {
                                  updateLastRead(v.sura, v.aya)
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: (lastRead?.sura === v.sura && lastRead?.aya === v.aya) ? "var(--teal)" : "var(--t3)",
                                  padding: "4px 8px",
                                  fontSize: 14,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4
                                }}
                                title="คั่นจุดนี้เป็นจุดอ่านล่าสุด"
                              >
                                <i className={(lastRead?.sura === v.sura && lastRead?.aya === v.aya) ? "ti ti-flag-2-filled" : "ti ti-flag-2"}></i>
                                <span style={{ fontSize: 10, fontFamily: "'Prompt', sans-serif" }}>
                                  {(lastRead?.sura === v.sura && lastRead?.aya === v.aya) ? "คั่นแล้ว" : "คั่นจุดนี้"}
                                </span>
                              </button>

                              {/* Bookmark reflection note */}
                              <button
                                onClick={() => handleOpenBookmarkModal(v, bookmark)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: bookmark ? "var(--teal)" : "var(--t3)",
                                  padding: "4px 8px",
                                  fontSize: 14,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4
                                }}
                                title={bookmark ? "แก้ไขข้อคิด/ยกเลิกการบันทึก" : "บันทึกอายะฮ์นี้และจดข้อคิด"}
                              >
                                <i className={bookmark ? "ti ti-bookmark-filled" : "ti ti-bookmark"}></i>
                                <span style={{ fontSize: 10, fontFamily: "'Prompt', sans-serif" }}>
                                  {bookmark ? "บันทึกแล้ว" : "บันทึก"}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* Arabic text */}
                          <div
                            className="arabic-font"
                            style={{
                              fontSize: `${arabicSize}px`,
                              fontFamily: quranFont === "UthmanicHafs" ? "'UthmanicHafs', serif" : quranFont === "Amiri" ? "'Amiri', serif" : "'Noto Naskh Arabic', serif",
                              color: "var(--text)",
                              paddingRight: 6
                            }}
                          >
                            {tajweedEnabled ? (
                              <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(v.arabic_text_tajweed || v.arabic_text, { ADD_TAGS: ['tajweed'] }) }} />
                            ) : (
                              <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(stripTajweedTags(v.arabic_text_tajweed || v.arabic_text), { ADD_TAGS: ['tajweed'] }) }} />
                            )}
                          </div>

                          {/* Thai Translation */}
                          <div
                            style={{
                              fontSize: `${thaiSize}px`,
                              lineHeight: 1.6,
                              color: mode === "tafsir" ? "var(--t2)" : "var(--text)",
                              fontWeight: mode === "tafsir" ? 300 : 400
                            }}
                          >
                            {v.translation}
                          </div>

                          {/* Thai Exegesis / Tafsir Block */}
                          {mode === "tafsir" && v.tafsir && (
                            <div className="tafsir-box">
                              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--teal)", marginBottom: 4 }}>
                                คำอธิบายความหมายย่อ (ตัฟซีร):
                              </div>
                              <div style={{ fontSize: `${thaiSize - 0.5}px`, lineHeight: 1.6, color: "var(--text)", fontWeight: 300 }}>
                                {v.tafsir}
                              </div>
                            </div>
                          )}

                          {/* User saved notes / reflections (ประโยชน์ที่ได้รับ) */}
                          {bookmark && (
                            <div style={{
                              background: "rgba(45, 190, 160, 0.04)",
                              borderTop: "2px solid var(--teal)",
                              padding: "10px 12px",
                              borderRadius: "8px",
                              marginTop: 8,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 10
                            }}>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontSize: 10, color: "var(--teal)", fontWeight: 600, display: "block", marginBottom: 2 }}>
                                  ข้อคิดและประโยชน์ที่คุณจดบันทึกไว้:
                                </span>
                                <p style={{ fontSize: 12, margin: 0, color: "var(--text)", fontStyle: bookmark.notes ? "normal" : "italic" }}>
                                  {bookmark.notes || "ไม่มีข้อความบันทึก (กดที่ปุ่มบันทึกเพื่อเพิ่มข้อคิด)"}
                                </p>
                              </div>
                              <button
                                onClick={() => handleOpenBookmarkModal(v, bookmark)}
                                style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: 12, padding: 4 }}
                                title="แก้ไขบันทึก"
                              >
                                <i className="ti ti-edit"></i>
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>  );
}
