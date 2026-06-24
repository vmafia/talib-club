import React, { useState, useEffect } from "react"
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { toast } from "react-hot-toast"
import { db, app } from "../../lib/firebase.js"
import { triggerPushNotification } from "../../utils/pushNotifications.js"
import { confirmAction } from "../../utils/feedback.jsx"

const notifySuccess = (msg) => toast.success(msg)
const notifyError = (msg) => toast.error(msg)

export default function StaffTasks({ currentUser, staffTeam, sendBotNotification }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  
  // Assign Task Form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", assignee: "", dueDate: "", files: [] })
  const [uploading, setUploading] = useState(false)

  // Progress Update Form
  const [updatingId, setUpdatingId] = useState(null)
  const [progressText, setProgressText] = useState("")

  useEffect(() => {
    const q = query(collection(db, "staff_tasks"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error("Fetch tasks error", err)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setForm(prev => ({ ...prev, files: [...prev.files, ...Array.from(e.target.files)] }))
    }
  }
  const removeFormFile = (idx) => {
    setForm(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== idx) }))
  }

  const handleAssignTask = async (e) => {
    e.preventDefault()
    if (!form.title || !form.assignee) {
      notifyError("กรุณากรอกหัวข้อและผู้รับผิดชอบ")
      return
    }
    setUploading(true)
    
    try {
      const fileLinks = []
      const storage = getStorage(app)
      if (form.files && form.files.length > 0) {
        for (const file of form.files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
          const storageRef = ref(storage, `staff_tasks/${Date.now()}_${safeName}`)
          await uploadBytes(storageRef, file)
          const url = await getDownloadURL(storageRef)
          fileLinks.push({ name: file.name, url })
        }
      }

      await addDoc(collection(db, "staff_tasks"), {
        title: form.title,
        description: form.description,
        assignee: form.assignee,
        assigner: currentUser,
        dueDate: form.dueDate || null,
        files: fileLinks,
        status: "IN_PROGRESS",
        progressLog: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      
      notifySuccess("มอบหมายงานเรียบร้อยแล้ว")
      triggerPushNotification(
        "📋 มีงานใหม่มอบหมายถึงคุณ",
        `เรื่อง: ${form.title} (จาก: ${currentUser})`,
        "/staff-work",
        { isStaffOnly: true } 
      )
      
      if (sendBotNotification) {
        sendBotNotification(`📋 มีงานใหม่มอบหมายให้: ${form.assignee}\nเรื่อง: ${form.title}\nสั่งโดย: ${currentUser}`);
      }
      
      setForm({ title: "", description: "", assignee: "", dueDate: "", files: [] })
      setShowForm(false)
    } catch (err) {
      console.error(err)
      notifyError("เกิดข้อผิดพลาดในการมอบหมายงาน")
    } finally {
      setUploading(false)
    }
  }

  const handleUpdateProgress = async (e, id, currentLog) => {
    e.preventDefault()
    if (!progressText.trim()) return
    try {
      const newEntry = {
        text: progressText,
        user: currentUser,
        date: new Date().toISOString()
      }
      await updateDoc(doc(db, "staff_tasks", id), {
        progressLog: [...(currentLog || []), newEntry],
        updatedAt: serverTimestamp()
      })
      notifySuccess("อัปเดตความคืบหน้าแล้ว")
      setUpdatingId(null)
      setProgressText("")
    } catch (err) {
      console.error(err)
      notifyError("อัปเดตล้มเหลว")
    }
  }

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "staff_tasks", id), {
        status,
        updatedAt: serverTimestamp()
      })
      notifySuccess("อัปเดตสถานะงานแล้ว")
    } catch (err) {
      console.error(err)
      notifyError("อัปเดตล้มเหลว")
    }
  }

  const handleDeleteTask = async (id) => {
    const ok = await confirmAction({
      title: "ยืนยันการลบงาน",
      message: "ต้องการลบงานนี้ใช่หรือไม่? (ลบแล้วไม่สามารถกู้คืนได้)",
      confirmText: "ลบทิ้ง",
      danger: true
    })
    if (ok) {
      await deleteDoc(doc(db, "staff_tasks", id))
      notifySuccess("ลบงานแล้ว")
    }
  }

  const filteredTasks = myTasksOnly 
    ? tasks.filter(t => t.assignee === currentUser || t.assigner === currentUser)
    : tasks

  const formatDate = (dateStr) => {
    if (!dateStr) return "-"
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat("th-TH", { year: "numeric", month: "short", day: "numeric" }).format(d)
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><i className="ti ti-loader-2 spin"></i> กำลังโหลดงาน...</div>

  return (
    <div className="card" style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-briefcase" style={{ color: "var(--teal)" }}></i> ระบบมอบหมายงาน
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn btn-outline ${myTasksOnly ? "on-acc" : ""}`} onClick={() => setMyTasksOnly(!myTasksOnly)} style={{ padding: "6px 12px", fontSize: 13 }}>
            {myTasksOnly ? "งานทั้งหมด" : "เฉพาะงานของฉัน"}
          </button>
          <button className="btn btn-teal" onClick={() => setShowForm(!showForm)} style={{ padding: "6px 12px", fontSize: 13 }}>
            {showForm ? "ยกเลิก" : "+ สร้างงานใหม่"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleAssignTask} className="card" style={{ background: "var(--bg2)", padding: 20, marginBottom: 24 }}>
          <h3>มอบหมายงานใหม่</h3>
          <div className="grid2" style={{ marginTop: 16 }}>
            <label>
              <span className="label-text">หัวข้องาน *</span>
              <input required type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="เช่น แปลบทที่ 1" />
            </label>
            <label>
              <span className="label-text">ผู้รับผิดชอบ *</span>
              <select required value={form.assignee} onChange={e => setForm({...form, assignee: e.target.value})}>
                <option value="">-- เลือกผู้รับผิดชอบ --</option>
                {staffTeam.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <label>
              <span className="label-text">กำหนดส่ง (ถ้ามี)</span>
              <input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} />
            </label>
            <label>
              <span className="label-text">แนบไฟล์อ้างอิง</span>
              <input type="file" multiple onChange={handleFileChange} />
            </label>
          </div>
          {form.files.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              {form.files.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span>📎 {f.name}</span>
                  <button type="button" onClick={() => removeFormFile(i)} style={{ color: "red", background: "none", border: "none", cursor: "pointer" }}>x</button>
                </div>
              ))}
            </div>
          )}
          <label style={{ marginTop: 12 }}>
            <span className="label-text">รายละเอียดเพิ่มเติม</span>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} placeholder="ลิงก์เพิ่มเติม หรือคำอธิบายงาน..."></textarea>
          </label>
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <button type="submit" className="btn btn-teal" disabled={uploading}>
              {uploading ? "กำลังบันทึก..." : "ส่งมอบงาน"}
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filteredTasks.length === 0 && <p style={{ color: "var(--t2)", textAlign: "center", padding: 20 }}>ไม่มีงานที่กำลังดำเนินการ</p>}
        {filteredTasks.map(task => {
          const isDone = task.status === "DONE"
          return (
            <div key={task.id} className="card" style={{ padding: 16, opacity: isDone ? 0.7 : 1, borderLeft: `4px solid ${isDone ? "var(--green)" : "var(--teal)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 18, marginBottom: 4 }}>{task.title}</h3>
                  <div style={{ fontSize: 13, color: "var(--t2)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>👤 ผู้รับผิดชอบ: <strong style={{ color: "var(--text)" }}>{task.assignee}</strong></span>
                    <span>สั่งโดย: {task.assigner}</span>
                    {task.dueDate && <span style={{ color: "var(--red)" }}>📅 กำหนด: {formatDate(task.dueDate)}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`badge ${isDone ? "badge-green" : "badge-teal"}`}>{isDone ? "เสร็จสิ้น" : "กำลังดำเนินการ"}</span>
                  <select 
                    value={task.status} 
                    onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                    style={{ fontSize: 12, padding: "4px 8px" }}
                  >
                    <option value="IN_PROGRESS">กำลังดำเนินการ</option>
                    <option value="DONE">เสร็จสิ้น</option>
                  </select>
                  <button onClick={() => handleDeleteTask(task.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><i className="ti ti-trash"></i></button>
                </div>
              </div>

              {task.description && (
                <div style={{ marginTop: 12, padding: 12, background: "var(--bg2)", borderRadius: 8, fontSize: 14, whiteSpace: "pre-wrap" }}>
                  {task.description}
                </div>
              )}

              {task.files && task.files.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {task.files.map((f, i) => (
                    <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16 }}>
                      <span style={{ fontSize: 12, color: "var(--text)" }}>📎 {f.name}</span>
                      <div style={{ display: "flex", gap: 6, borderLeft: "1px solid var(--border)", paddingLeft: 8, marginLeft: 2 }}>
                        <button 
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              const loadingToast = toast.loading(`กำลังดึงไฟล์ ${f.name}...`);
                              const response = await fetch(f.url);
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.style.display = 'none';
                              a.href = url;
                              a.download = f.name;
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              toast.dismiss(loadingToast);
                            } catch (err) {
                              window.open(f.url, '_blank');
                            }
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2, color: "var(--teal)" }}
                          title="ดาวน์โหลดไฟล์"
                        >
                          ⬇️
                        </button>
                        <a 
                          href={f.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, textDecoration: "none", padding: 2 }}
                          title="เปิดดู (Preview)"
                        >
                          👁️
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Progress Log */}
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 14, marginBottom: 8, color: "var(--t2)" }}>ประวัติความคืบหน้า</h4>
                {task.progressLog?.map((log, i) => (
                  <div key={i} style={{ fontSize: 13, padding: "8px 12px", borderLeft: "2px solid var(--border)", marginBottom: 8 }}>
                    <div style={{ color: "var(--t3)", fontSize: 11, marginBottom: 2 }}>{log.user} • {formatDate(log.date)}</div>
                    <div>{log.text}</div>
                  </div>
                ))}
                
                {updatingId === task.id ? (
                  <form onSubmit={(e) => handleUpdateProgress(e, task.id, task.progressLog)} style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <input autoFocus required type="text" value={progressText} onChange={e => setProgressText(e.target.value)} placeholder="ระบุความคืบหน้า..." style={{ flex: 1, padding: "6px 12px", fontSize: 13 }} />
                    <button type="submit" className="btn btn-teal" style={{ padding: "6px 12px", fontSize: 13 }}>บันทึก</button>
                    <button type="button" className="btn btn-outline" onClick={() => setUpdatingId(null)} style={{ padding: "6px 12px", fontSize: 13 }}>ยกเลิก</button>
                  </form>
                ) : (
                  <button onClick={() => setUpdatingId(task.id)} className="btn btn-outline" style={{ marginTop: 4, padding: "4px 8px", fontSize: 12 }}>
                    + อัปเดตความคืบหน้า
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
