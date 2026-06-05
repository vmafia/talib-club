import { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import toast from 'react-hot-toast'
import { useContentCollection, useUserCollection } from "../../lib/contentStore.js"
import { confirmAction } from "../../utils/feedback.jsx"
import { BOOKS } from "../../data/index.js"

export default function ReflectionsPanel({ authState, setView, theme }) {
  const uid = authState?.user?.uid
  const { items: books } = useContentCollection("books", BOOKS, null, { live: false })
  const { items: bookmarkItems, loading: loadingBookmarks, saveItem: saveBookmark } = useUserCollection("quran_bookmarks", uid)
  const { items: sessionItems, loading: loadingSessions, saveItem: saveSession } = useContentCollection("reading_sessions", [], uid, { live: false })
  const [search, setSearch] = useState("")
  const [activeExportCard, setActiveExportCard] = useState(null)
  const [editingNote, setEditingNote] = useState(null)

  const bookmarkNotes = useMemo(() => {
    return bookmarkItems
      .filter(item => item.notes && item.notes.trim())
      .map(item => ({
        id: item.id,
        type: "quran",
        title: `ซูเราะฮ์ ${item.suraName || item.sura} [${item.sura}:${item.aya}]`,
        notes: item.notes,
        arabicText: item.arabicText,
        translation: item.translation,
        date: item.createdAt || item.updatedAt,
        reference: `คัมภีร์อัลกุรอาน ซูเราะฮ์ ${item.suraName || item.sura} อายะฮ์ที่ ${item.aya}`
      }))
  }, [bookmarkItems])

  const sessionNotes = useMemo(() => {
    return sessionItems
      .filter(item => item.reflection && item.reflection.trim())
      .map(item => {
        const book = books.find(b => String(b.id) === String(item.bookId)) || item.customBook || {}
        return {
          id: item.id,
          type: "book",
          title: book.title || "หนังสือทั่วไป",
          notes: item.reflection,
          date: item.completedAt || item.createdAt,
          reference: `หนังสือ: ${book.title || "ทั่วไป"} (หน้า ${item.startPage || 0} - ${item.endPage || 0})`
        }
      })
  }, [sessionItems, books])

  const allNotes = useMemo(() => {
    return [...bookmarkNotes, ...sessionNotes].sort((a, b) => {
      const timeA = a.date ? (typeof a.date.toDate === "function" ? a.date.toDate().getTime() : new Date(a.date).getTime()) : 0
      const timeB = b.date ? (typeof b.date.toDate === "function" ? b.date.toDate().getTime() : new Date(b.date).getTime()) : 0
      return timeB - timeA
    })
  }, [bookmarkNotes, sessionNotes])

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return allNotes
    const q = search.toLowerCase()
    return allNotes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.notes.toLowerCase().includes(q) ||
      (n.translation && n.translation.toLowerCase().includes(q))
    )
  }, [allNotes, search])

  const handleSaveEdit = async (note, newText) => {
    if (note.type === "quran") {
      const bookmark = bookmarkItems.find(b => String(b.id) === String(note.id))
      if (bookmark) {
        await saveBookmark({ ...bookmark, notes: newText })
      }
    } else {
      const session = sessionItems.find(s => String(s.id) === String(note.id))
      if (session) {
        await saveSession({ ...session, reflection: newText })
      }
    }
  }

  const handleDeleteNote = async (note) => {
    const ok = await confirmAction({
      title: "ยืนยันการลบข้อคิด",
      message: "คุณต้องการลบข้อคิดสะกิดใจนี้หรือไม่? (บันทึกเวลาการอ่านจะคงอยู่ แต่ข้อมูลข้อคิดที่เขียนไว้จะถูกลบออก)",
      confirmText: "ใช่, ลบข้อคิด",
      cancelText: "ยกเลิก",
      danger: true
    })
    if (!ok) return

    try {
      if (note.type === "quran") {
        const bookmark = bookmarkItems.find(b => String(b.id) === String(note.id))
        if (bookmark) {
          await saveBookmark({ ...bookmark, notes: "" })
        }
      } else {
        const session = sessionItems.find(s => String(s.id) === String(note.id))
        if (session) {
          await saveSession({ ...session, reflection: "" })
        }
      }
      toast.success("ลบข้อคิดเรียบร้อยแล้ว")
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error(err)
      }
      toast.error("เกิดข้อผิดพลาดในการลบ")
    }
  }

  const loading = loadingBookmarks || loadingSessions

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", textAlign: "left" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(168,85,247,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-feather" style={{ color: "#a855f7", fontSize: 20 }}></i>
            </div>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>สมุดบันทึกข้อคิด (My Reflections)</h2>
              <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{filteredNotes.length} รายการ (จดบันทึกจากหนังสือและอัลกุรอาน)</p>
            </div>
          </div>
        </div>

        {allNotes.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>
            คุณยังไม่มีข้อคิดที่บันทึกไว้ เริ่มเขียนบันทึกในห้องอ่านหนังสือ หรือบันทึกข้อคิดในอัลกุรอานเพื่อรวบรวมไว้ที่นี่!
          </div>
        ) : (
          <>
            <div style={{ position: "relative", marginBottom: 20 }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 14 }}></i>
              <input
                placeholder="ค้นหาตามหัวข้อหรือเนื้อหาบันทึก..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, width: "100%", height: 38 }}
              />
            </div>

            {filteredNotes.length === 0 ? (
              <div className="empty" style={{ padding: "30px 0" }}>ไม่พบรายการที่ค้นหา</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredNotes.map(note => (
                  <div key={note.id} className="card" style={{ padding: 20, border: "0.5px solid var(--br)", background: "var(--bg3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                      <span className={`badge ${note.type === "quran" ? "badge-teal" : "badge-outline"}`} style={{ fontSize: 11, borderColor: note.type === "quran" ? "transparent" : "rgba(168,85,247,0.4)", color: note.type === "quran" ? "#fff" : "#a855f7" }}>
                        <i className={`ti ${note.type === "quran" ? "ti-book" : "ti-notebook"}`} style={{ marginRight: 4 }}></i>
                        {note.title}
                      </span>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--teal)", borderColor: "var(--teal)" }}
                          onClick={() => setActiveExportCard(note)}
                        >
                          <i className="ti ti-share"></i> การ์ด
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--t2)", borderColor: "var(--br)" }}
                          onClick={() => setEditingNote(note)}
                        >
                          <i className="ti ti-edit"></i> แก้ไข
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "#e05555", borderColor: "rgba(224,85,85,0.4)" }}
                          onClick={() => handleDeleteNote(note)}
                        >
                          <i className="ti ti-trash"></i> ลบ
                        </button>
                      </div>
                    </div>

                    <div style={{ background: "var(--card)", borderLeft: "3.5px solid var(--teal)", padding: "10px 14px", borderRadius: "0 8px 8px 0" }}>
                      <p style={{ fontSize: 13, color: "var(--text)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {note.notes}
                      </p>
                    </div>

                    {note.type === "quran" && note.translation && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "var(--t3)", fontStyle: "italic", borderTop: "0.5px dashed var(--br2)", paddingTop: 8 }}>
                        คำแปลอายะฮ์: {note.translation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {activeExportCard && (
        <ExportCardModal
          note={activeExportCard}
          theme={theme}
          onClose={() => setActiveExportCard(null)}
        />
      )}
      {editingNote && (
        <EditReflectionModal
          note={editingNote}
          theme={theme}
          onClose={() => setEditingNote(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  )
}

function EditReflectionModal({ note, onClose, onSave, theme }) {
  const [text, setText] = useState(note.notes)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!text.trim()) {
      toast.error("กรุณากรอกข้อคิดบันทึก")
      return
    }
    setSaving(true)
    try {
      await onSave(note, text.trim())
      toast.success("แก้ไขบันทึกข้อคิดเรียบร้อยแล้ว")
      onClose()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error(err)
      }
      toast.error("เกิดข้อผิดพลาดในการบันทึก")
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className={`app ${theme || "light"}`} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16
    }}>
      <div className="card" style={{
        maxWidth: 500,
        width: "100%",
        padding: 24,
        background: "var(--card)",
        border: "0.5px solid var(--br)",
        borderRadius: 20,
        boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        animation: "pageFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-edit" style={{ color: "var(--teal)" }}></i> แก้ไขข้อคิดบันทึก
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 20 }}>
            <i className="ti ti-x"></i>
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 8, fontWeight: 500 }}>
            {note.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 12 }}>
            {note.reference}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              background: "var(--bg3)",
              border: "1px solid var(--br)",
              color: "var(--text)",
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
              outline: "none"
            }}
            placeholder="เขียนข้อคิดธรรมสะกิดใจที่นี่..."
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving} style={{ borderRadius: 20 }}>
            ยกเลิก
          </button>
          <button className="btn btn-teal" onClick={handleSave} disabled={saving} style={{ borderRadius: 20 }}>
            {saving ? <i className="ti ti-loader-2 spin"></i> : "บันทึกข้อมูล"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function ExportCardModal({ note, onClose, theme }) {
  const cardRef = useRef(null)

  const handlePrint = () => {
    const printContent = cardRef.current.innerHTML
    
    const win = window.open("", "_blank")
    win.document.write(`
      <html>
        <head>
          <title>Talib Club Reflection Card</title>
          <link href="https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=Prompt:wght@300;400;500;600&family=Amiri&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Prompt', sans-serif;
              background: #fff;
              color: #1e293b;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card-container {
              background: #fbfbfa;
              border: 2px solid #bba588;
              border-radius: 16px;
              padding: 40px;
              width: 500px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.05);
              text-align: center;
              position: relative;
            }
            .watermark {
              color: #bba588;
              font-size: 11px;
              letter-spacing: 2px;
              text-transform: uppercase;
              margin-top: 30px;
              font-weight: 500;
            }
            .quote-text {
              font-size: 17px;
              line-height: 1.6;
              font-style: italic;
              color: #2c3e50;
              margin: 20px 0;
              white-space: pre-wrap;
            }
            .ref {
              font-size: 12px;
              color: #7f8c8d;
              font-weight: 500;
              margin-top: 15px;
            }
            .divider {
              width: 60px;
              height: 1px;
              background: #bba588;
              margin: 15px auto;
            }
            .arabic {
              font-family: 'Amiri', serif;
              font-size: 26px;
              direction: rtl;
              margin-bottom: 12px;
              color: #0d9488;
              line-height: 1.6;
            }
            @media print {
              body { height: auto; }
              .card-container {
                box-shadow: none;
                border: 2px solid #bba588;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="card-container">
            ${printContent}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `)
    win.document.close()
  }

  const handleCopyText = async () => {
    const text = `"${note.notes}"\n\n— อ้างอิง: ${note.reference}\n(บันทึกผ่าน Talib Club)`
    try {
      await navigator.clipboard.writeText(text)
      toast.success("คัดลอกข้อความบันทึกแล้ว")
    } catch {
      toast.error("คัดลอกล้มเหลว")
    }
  }

  return createPortal(
    <div className={`app ${theme || "light"}`} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16
    }}>
      <div className="card" style={{
        maxWidth: 560,
        width: "100%",
        padding: 24,
        background: "var(--card)",
        border: "0.5px solid var(--br)",
        borderRadius: 20,
        boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        animation: "pageFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        {/* Quote Card Area */}
        <div style={{
          background: theme === "dark" ? "#1e2022" : "#fcfbf7",
          border: "2px solid #cbb598",
          borderRadius: 16,
          padding: "36px 28px",
          textAlign: "center",
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.02)",
          marginBottom: 20,
          color: theme === "dark" ? "#e2e8f0" : "#1e293b"
        }}>
          {/* We wrap the content we want to copy/print in a div with ref */}
          <div ref={cardRef}>
            {note.type === "quran" && note.arabicText && (
              <div className="arabic" dangerouslySetInnerHTML={{ __html: note.arabicText }} />
            )}

            <div className="quote-text">
              "{note.notes}"
            </div>

            <div className="divider" />

            <div className="ref">
              {note.reference}
            </div>

            <div className="watermark">
              Talib Club · ปลูกฝังนิสัยรักการเรียนรู้
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={onClose} style={{ padding: "8px 16px" }}>
            ปิดหน้าต่าง
          </button>
          <button className="btn btn-outline" onClick={handleCopyText} style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-copy"></i> คัดลอกข้อความ
          </button>
          <button className="btn btn-teal" onClick={handlePrint} style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-printer"></i> พิมพ์การ์ด / บันทึก PDF
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
