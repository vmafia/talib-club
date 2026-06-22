import React, { useState, useEffect } from "react"
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore"
import { toast } from "react-hot-toast"
import { db } from "../../lib/firebase.js"
import { triggerPushNotification } from "../../utils/pushNotifications.js"

const notifySuccess = (msg) => toast.success(msg)
const notifyError = (msg) => toast.error(msg)

export default function StaffCalendar({ currentUser, staffTeam }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Modal/Form for adding an event
  const [selectedDate, setSelectedDate] = useState(null)
  const [form, setForm] = useState({ title: "", assignee: currentUser, platforms: ["Facebook"] })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    // In a real app we might filter by month, but for a small team, loading all is fine
    // or filter by date >= first day of month. Here we just load all to keep it simple.
    const q = query(collection(db, "content_calendar"))
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error("Fetch calendar error", err)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
  
  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  
  const handleDayClick = (day) => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    setSelectedDate(d)
    setForm({ title: "", assignee: currentUser, platforms: ["Facebook"] })
    setEditingId(null)
  }

  const handleSaveEvent = async (e) => {
    e.preventDefault()
    if (!form.title) {
      notifyError("กรุณาระบุชื่องาน/เนื้อหา")
      return
    }
    
    try {
      const dateStr = selectedDate.toISOString().split("T")[0]
      if (editingId) {
        await updateDoc(doc(db, "content_calendar", editingId), {
          ...form,
          date: dateStr,
          updatedAt: serverTimestamp()
        })
        notifySuccess("อัปเดตแผนการโพสต์แล้ว")
      } else {
        await addDoc(collection(db, "content_calendar"), {
          ...form,
          date: dateStr,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
        notifySuccess("เพิ่มแผนการโพสต์แล้ว")
        triggerPushNotification(
          "📅 มีแผนงานใหม่ในปฏิทิน",
          `${form.title} (โดย: ${form.assignee}) วันที่ ${dateStr}`,
          "/staff-work",
          { isStaffOnly: true }
        )
      }
      setSelectedDate(null)
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการบันทึก")
    }
  }

  const handleDeleteEvent = async (id) => {
    if (confirm("ต้องการลบแผนงานนี้ใช่หรือไม่?")) {
      await deleteDoc(doc(db, "content_calendar", id))
      notifySuccess("ลบแผนงานแล้ว")
      setSelectedDate(null)
    }
  }

  const handleEditEvent = (ev, dayDate) => {
    setSelectedDate(dayDate)
    setForm({ title: ev.title, assignee: ev.assignee, platforms: ev.platforms || [ev.platform || "Facebook"] })
    setEditingId(ev.id)
  }

  const getPlatformColor = (platform) => {
    switch (platform) {
      case "Facebook": return "#1877F2"
      case "Instagram": return "#E4405F"
      case "YouTube": return "#FF0000"
      case "TikTok": return "#000000"
      case "Spotify": return "#1DB954"
      case "Website": return "var(--teal)"
      default: return "var(--t2)"
    }
  }

  return (
    <div className="card" style={{ padding: "24px", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-calendar" style={{ color: "var(--teal)" }}></i> ปฏิทินวางแผนลงงาน
        </h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn btn-outline" onClick={handlePrevMonth}>&lt;</button>
          <strong style={{ fontSize: 18, minWidth: 150, textAlign: "center" }}>
            {new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(currentDate)}
          </strong>
          <button className="btn btn-outline" onClick={handleNextMonth}>&gt;</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8, textAlign: "center", fontWeight: "bold", color: "var(--t2)" }}>
        <div>อา.</div><div>จ.</div><div>อ.</div><div>พ.</div><div>พฤ.</div><div>ศ.</div><div>ส.</div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><i className="ti ti-loader-2 spin"></i> กำลังโหลดปฏิทิน...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, minHeight: 400 }}>
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} style={{ background: "var(--bg)", border: "1px solid var(--border)", opacity: 0.3, borderRadius: 8 }}></div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
            const dateStr = d.toISOString().split("T")[0]
            const dayEvents = events.filter(e => e.date === dateStr)
            const isToday = new Date().toISOString().split("T")[0] === dateStr

            return (
              <div 
                key={day} 
                onClick={() => handleDayClick(day)}
                style={{ 
                  background: isToday ? "var(--teal-bg)" : "var(--bg2)", 
                  border: isToday ? "2px solid var(--teal)" : "1px solid var(--border)", 
                  borderRadius: 8, 
                  padding: 8,
                  minHeight: 100,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}
                className="calendar-day"
              >
                <div style={{ fontWeight: "bold", fontSize: 14, color: isToday ? "var(--teal)" : "var(--text)" }}>{day}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1 }}>
                  {dayEvents.map(ev => {
                    const plats = ev.platforms || [ev.platform || "Facebook"]
                    return plats.map(p => (
                      <div 
                        key={`${ev.id}-${p}`} 
                        onClick={(e) => { e.stopPropagation(); handleEditEvent(ev, d); }}
                        style={{ 
                          fontSize: 11, 
                          background: getPlatformColor(p), 
                          color: "#fff", 
                          padding: "4px 6px", 
                          borderRadius: 4,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginBottom: 2
                        }}
                        title={`${ev.title} (${ev.assignee})`}
                      >
                        {ev.title}
                      </div>
                    ))
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedDate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <form onSubmit={handleSaveEvent} className="card animate-fade-in" style={{ background: "var(--bg)", padding: 24, width: "100%", maxWidth: 400, borderRadius: 16 }}>
            <h3 style={{ marginBottom: 16 }}>{editingId ? "แก้ไขแผนงาน" : "เพิ่มแผนงาน"} - {new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(selectedDate)}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label>
                <span className="label-text">เนื้อหา / ชื่องาน</span>
                <input autoFocus required type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="เช่น บทความเรื่องตักวา" />
              </label>
              <label>
                <span className="label-text">ผู้รับผิดชอบ (การโพสต์)</span>
                <select required value={form.assignee} onChange={e => setForm({...form, assignee: e.target.value})}>
                  <option value="">-- เลือกผู้รับผิดชอบ --</option>
                  {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label>
                <span className="label-text" style={{ marginBottom: 8, display: "block" }}>แพลตฟอร์ม</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["Facebook", "Instagram", "YouTube", "TikTok", "Spotify", "Website", "อื่นๆ"].map(p => (
                    <label key={p} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer", background: "var(--bg2)", padding: "4px 8px", borderRadius: 4 }}>
                      <input 
                        type="checkbox" 
                        checked={form.platforms.includes(p)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({...form, platforms: [...form.platforms, p]})
                          } else {
                            setForm({...form, platforms: form.platforms.filter(x => x !== p)})
                          }
                        }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              {editingId ? (
                <button type="button" className="btn" style={{ background: "var(--red)", color: "white", padding: "8px 12px" }} onClick={() => handleDeleteEvent(editingId)}>ลบ</button>
              ) : <div></div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setSelectedDate(null)}>ยกเลิก</button>
                <button type="submit" className="btn btn-teal">บันทึก</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
