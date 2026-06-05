import React, { useEffect, useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { 
  collection, getDocs, doc, updateDoc, query, where, limit 
} from "firebase/firestore"
import { db } from "../lib/firebase.js"
import { toast } from "react-hot-toast"
import { Z } from "../utils/ui.js"

// Helper function to format timestamp/date
const formatDate = (dateValue) => {
  if (!dateValue) return "-"
  const d = dateValue?.toDate ? dateValue.toDate() : (dateValue.seconds ? new Date(dateValue.seconds * 1000) : new Date(dateValue))
  if (isNaN(d.getTime())) return "-"
  return new Intl.DateTimeFormat("th-TH", { year: "numeric", month: "short", day: "numeric" }).format(d)
}

export default function StaffMembers({ authState, go }) {
  const { profile } = authState
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all") // "all" | "member" | "staff" | "admin"

  // Stats Modal state
  const [selectedUser, setSelectedUser] = useState(null)
  const [userStats, setUserStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)

  // Confirmation modal state for role change
  const [confirmRoleChange, setConfirmRoleChange] = useState({
    isOpen: false,
    userToChange: null,
    targetRole: ""
  })

  const currentUser = localStorage.getItem("talib_user") || authState?.user?.name || authState?.user?.displayName || ""
  const isSuperAdmin = profile?.role === "admin" || currentUser === "อนันดา" || currentUser === "ฟาดิล" || currentUser === "Usman Manu"

  // Fetch users on mount
  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, "users"))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setUsers(list)
    } catch (err) {
      console.error("Failed to fetch users:", err)
      toast.error("โหลดข้อมูลรายชื่อสมาชิกล้มเหลว")
    } finally {
      setLoading(false)
    }
  }

  // Filter users based on search string and role
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = 
        (u.displayName || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.email || "").toLowerCase().includes(search.toLowerCase())
      
      if (roleFilter === "all") return matchesSearch
      return matchesSearch && u.role === roleFilter
    })
  }, [users, search, roleFilter])

  // Load detailed learning stats for a selected user
  const loadUserStats = async (member) => {
    setSelectedUser(member)
    setLoadingStats(true)
    setUserStats(null)

    try {
      const uid = member.id || member.uid

      // 1. Fetch reading streak settings
      let streakData = { streakCount: 0, bestStreak: 0, gems: 0 }
      const streakSnap = await getDocs(query(collection(db, "content_reading_streaks"), where("uid", "==", uid), limit(1)))
      if (!streakSnap.empty) {
        const d = streakSnap.docs[0].data()
        streakData = {
          streakCount: d.streakCount || 0,
          bestStreak: d.bestStreak || 0,
          gems: d.gems || 0,
          freezeCredits: d.freezeCredits ?? 0,
          leaveCredits: d.leaveCredits ?? 0
        }
      }

      // 2. Fetch bookshelf count
      let bookshelfData = { total: 0, finished: 0 }
      const shelfSnap = await getDocs(query(collection(db, "content_bookshelf"), where("uid", "==", uid)))
      bookshelfData.total = shelfSnap.size
      bookshelfData.finished = shelfSnap.docs.filter(d => d.data().progressStatus === "finished" || d.data().completed).length

      // 3. Fetch reading sessions count
      let sessionsData = { total: 0, totalSeconds: 0, verifiedCount: 0 }
      const sessionSnap = await getDocs(query(collection(db, "content_reading_sessions"), where("uid", "==", uid)))
      sessionsData.total = sessionSnap.size
      sessionSnap.docs.forEach(d => {
        const data = d.data()
        sessionsData.totalSeconds += Number(data.activeSeconds || 0)
        if (data.score >= 72 || data.verified) {
          sessionsData.verifiedCount++
        }
      })

      // 4. Fetch Quran bookmarks count
      const quranBookmarksSnap = await getDocs(query(collection(db, "content_quran_bookmarks"), where("uid", "==", uid)))
      const quranBookmarksCount = quranBookmarksSnap.size

      setUserStats({
        streak: streakData,
        bookshelf: bookshelfData,
        sessions: sessionsData,
        quranBookmarksCount
      })
    } catch (err) {
      console.error("Failed to load user stats:", err)
      toast.error("ไม่สามารถดึงข้อมูลสถิติของสมาชิกได้")
    } finally {
      setLoadingStats(false)
    }
  }

  // Handle promoting/demoting user roles
  const handleRoleChangeConfirm = async () => {
    const { userToChange, targetRole } = confirmRoleChange
    if (!userToChange) return

    try {
      const userRef = doc(db, "users", userToChange.id)
      await updateDoc(userRef, { role: targetRole })
      toast.success(`อัปเดตสิทธิ์ของ "${userToChange.displayName || userToChange.email}" เป็น ${targetRole === "staff" ? "สตาฟ" : "สมาชิกทั่วไป"} สำเร็จ`)
      
      // Update local state
      setUsers(prev => prev.map(u => u.id === userToChange.id ? { ...u, role: targetRole } : u))
    } catch (err) {
      console.error("Failed to update role:", err)
      toast.error("ไม่สามารถเปลี่ยนแปลงสิทธิ์ผู้ใช้งานได้")
    } finally {
      setConfirmRoleChange({ isOpen: false, userToChange: null, targetRole: "" })
    }
  }

  return (
    <div className="animate-fade-in" style={{ padding: "24px" }}>
      {/* Upper Title and Back Button */}
      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <button className="btn btn-outline" onClick={() => go("staff")} style={{ marginBottom: "12px", padding: "5px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-arrow-left"></i> กลับ
        </button>
        <h1>ระบบจัดการและดูแลสมาชิก (Member Care)</h1>
        <p style={{ marginTop: "4px", color: "var(--t2)" }}>ค้นหารายชื่อ ตรวจสอบสถานะการเรียนรู้ และเปลี่ยนสิทธิ์สตาฟของผู้ใช้งานในระบบ</p>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: "20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "260px", position: "relative" }}>
            <input
              type="text"
              placeholder="ค้นหาด้วยชื่อแสดงผล หรือ อีเมล..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: "36px", width: "100%" }}
            />
            <i className="ti ti-search" style={{ position: "absolute", left: 12, top: 12, color: "var(--t3)" }}></i>
          </div>
          
          <div style={{ display: "flex", gap: "6px" }}>
            <button className={`pill ${roleFilter === "all" ? "on" : ""}`} onClick={() => setRoleFilter("all")}>ทั้งหมด ({users.length})</button>
            <button className={`pill ${roleFilter === "member" ? "on" : ""}`} onClick={() => setRoleFilter("member")}>สมาชิก ({users.filter(u => u.role === "member" || !u.role).length})</button>
            <button className={`pill ${roleFilter === "staff" ? "on" : ""}`} onClick={() => setRoleFilter("staff")}>สตาฟ ({users.filter(u => u.role === "staff").length})</button>
            {users.some(u => u.role === "admin") && (
              <button className={`pill ${roleFilter === "admin" ? "on" : ""}`} onClick={() => setRoleFilter("admin")}>แอดมิน ({users.filter(u => u.role === "admin").length})</button>
            )}
          </div>
        </div>
      </div>

      {/* Members Grid / List */}
      {loading ? (
        <div className="empty" style={{ padding: "60px 0" }}>
          <i className="ti ti-loader-2 spin" style={{ fontSize: 32, color: "var(--teal)" }}></i>
          <p style={{ marginTop: 12 }}>กำลังดึงข้อมูลสมาชิก...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="empty card" style={{ padding: "40px" }}>
          ไม่พบสมาชิกที่ตรงกับเงื่อนไขการค้นหา
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {filteredUsers.map(u => {
            const isSelf = u.id === authState?.user?.uid
            const roleLabel = u.role === "admin" ? "แอดมิน" : u.role === "staff" ? "สตาฟ" : "สมาชิกทั่วไป"
            const roleBadgeClass = u.role === "admin" ? "badge-acc" : u.role === "staff" ? "badge-teal" : ""

            return (
              <div 
                key={u.id} 
                className="card" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between", 
                  padding: "16px 20px", 
                  borderRadius: 16,
                  border: isSelf ? "1.5px solid var(--teal)" : "0.5px solid var(--br)",
                  flexWrap: "wrap",
                  gap: 12
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--br)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--t2)", overflow: "hidden" }}>
                    {u.photoURL ? (
                      <img src={u.photoURL} alt={u.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <i className="ti ti-user"></i>
                    )}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 15 }}>{u.displayName || "ไม่ระบุชื่อ"}</strong>
                      {u.role && u.role !== "member" && (
                        <span className={`badge ${roleBadgeClass}`} style={{ fontSize: 10 }}>{roleLabel}</span>
                      )}
                      {isSelf && <span className="badge" style={{ fontSize: 10, background: "var(--br2)" }}>บัญชีของคุณ</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
                      {u.email} • เข้าร่วมเมื่อ: {formatDate(u.createdAt)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button 
                    className="btn btn-outline" 
                    style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                    onClick={() => loadUserStats(u)}
                  >
                    <i className="ti ti-chart-bar" style={{ fontSize: 14 }}></i> ดูสถิติเรียนรู้
                  </button>

                  {!isSelf && (
                    <>
                      {u.role === "staff" ? (
                        <button
                          className="btn btn-outline danger"
                          style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 4, borderColor: "rgba(224, 85, 85, 0.4)", color: "#e05555" }}
                          disabled={!isSuperAdmin}
                          onClick={() => setConfirmRoleChange({ isOpen: true, userToChange: u, targetRole: "member" })}
                          title={!isSuperAdmin ? "ต้องใช้สิทธิ์แอดมินในการเปลี่ยนตำแหน่ง" : ""}
                        >
                          <i className="ti ti-user-down"></i> ลดสิทธิ์เป็นสมาชิก
                        </button>
                      ) : (
                        u.role !== "admin" && (
                          <button
                            className="btn btn-teal"
                            style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                            disabled={!isSuperAdmin}
                            onClick={() => setConfirmRoleChange({ isOpen: true, userToChange: u, targetRole: "staff" })}
                            title={!isSuperAdmin ? "ต้องใช้สิทธิ์แอดมินในการเปลี่ยนตำแหน่ง" : ""}
                          >
                            <i className="ti ti-user-up"></i> แต่งตั้งเป็นสตาฟ
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dynamic Stats Modal */}
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.modal, padding: '20px' }}>
          <div className="card animate-fade-in" style={{ background: 'var(--bg)', padding: '24px', width: '100%', maxWidth: '500px', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative' }}>
            <button 
              onClick={() => setSelectedUser(null)} 
              style={{ position: 'absolute', right: 20, top: 20, background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 22 }}
            >
              <i className="ti ti-x"></i>
            </button>

            <h3 style={{ fontSize: 18, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-chart-bar" style={{ color: "var(--teal)" }}></i> สถิติข้อมูลการอ่านสะสม
            </h3>
            <p style={{ color: 'var(--t3)', fontSize: 12, marginBottom: 20 }}>
              สมาชิก: <strong>{selectedUser.displayName || selectedUser.email}</strong>
            </p>

            {loadingStats ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i>
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--t3)" }}>กำลังโหลดและคำนวณสถิติจากคลาวด์...</p>
              </div>
            ) : userStats ? (
              <div style={{ display: "grid", gap: "16px" }}>
                
                {/* Streak and Point Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ background: "var(--bg2)", padding: "14px", borderRadius: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>Streak ปัจจุบัน / สูงสุด</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--teal)" }}>
                      🔥 {userStats.streak.streakCount} / {userStats.streak.bestStreak} วัน
                    </div>
                  </div>
                  <div style={{ background: "var(--bg2)", padding: "14px", borderRadius: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>คะแนนสะสม (Gems)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#eab308" }}>
                      💎 {userStats.streak.gems} แต้ม
                    </div>
                  </div>
                </div>

                {/* Items & Freeze count */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ background: "var(--bg2)", padding: "12px", borderRadius: "10px", fontSize: 12 }}>
                    ❄️ บัตรน้ำแข็งป้องกัน: <strong>{userStats.streak.freezeCredits} ใบ</strong>
                  </div>
                  <div style={{ background: "var(--bg2)", padding: "12px", borderRadius: "10px", fontSize: 12 }}>
                    🏖️ เครดิตวันลากิจ: <strong>{userStats.streak.leaveCredits} วัน</strong>
                  </div>
                </div>

                {/* Library Bookshelf status */}
                <div style={{ borderTop: "0.5px solid var(--br2)", paddingTop: "14px" }}>
                  <h4 style={{ fontSize: 13, marginBottom: 8, color: "var(--t2)" }}>📚 สถานะบนชั้นหนังสือ</h4>
                  <div style={{ background: "var(--bg3)", padding: "12px", borderRadius: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                      <span>หนังสือทั้งหมดที่หยิบอ่าน:</span>
                      <strong>{userStats.bookshelf.total} เล่ม</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>อ่านจบสมบูรณ์ (ควิซ/ความคืบหน้า):</span>
                      <strong style={{ color: "var(--teal)" }}>{userStats.bookshelf.finished} เล่ม</strong>
                    </div>
                  </div>
                </div>

                {/* Reading Sessions stats */}
                <div>
                  <h4 style={{ fontSize: 13, marginBottom: 8, color: "var(--t2)" }}>⏱️ บันทึกการฝึกอ่าน</h4>
                  <div style={{ background: "var(--bg3)", padding: "12px", borderRadius: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                      <span>เวลาอ่านสะสมทั้งหมด:</span>
                      <strong>{Math.round(userStats.sessions.totalSeconds / 60)} นาที</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                      <span>ส่งบันทึกการอ่าน (Sessions):</span>
                      <strong>{userStats.sessions.total} ครั้ง</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>บันทึกที่ผ่านเกณฑ์ยืนยัน (Verified):</span>
                      <strong style={{ color: "var(--teal)" }}>{userStats.sessions.verifiedCount} ครั้ง</strong>
                    </div>
                  </div>
                </div>

                {/* Quran bookmarks count */}
                <div>
                  <h4 style={{ fontSize: 13, marginBottom: 8, color: "var(--t2)" }}>📖 อัลกุรอานและการจดบันทึก</h4>
                  <div style={{ background: "var(--bg3)", padding: "12px", borderRadius: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>อายะฮ์ที่บันทึกข้อคิด / บุ๊กมาร์กไว้:</span>
                      <strong>{userStats.quranBookmarksCount} รายการ</strong>
                    </div>
                  </div>
                </div>

              </div>
            ) : null}

            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-teal" onClick={() => setSelectedUser(null)} style={{ borderRadius: 20 }}>
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {confirmRoleChange.isOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.modal, padding: '20px' }}>
          <div className="card animate-fade-in" style={{ background: 'var(--bg)', padding: '24px', width: '100%', maxWidth: '420px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: 'var(--teal)' }}>
              <i className="ti ti-user-check" style={{ fontSize: '28px' }}></i>
              <h2 style={{ fontSize: '20px', color: 'var(--text)' }}>ยืนยันการเปลี่ยนสิทธิ์</h2>
            </div>
            <p style={{ color: 'var(--t2)', marginBottom: '24px', lineHeight: '1.6', fontSize: 13 }}>
              คุณแน่ใจหรือไม่ที่ต้องการเปลี่ยนสิทธิ์ของสมาชิก <strong>{confirmRoleChange.userToChange?.displayName || confirmRoleChange.userToChange?.email}</strong> ให้เป็น <strong>{confirmRoleChange.targetRole === "staff" ? "สตาฟ (มีสิทธิ์เข้าตรวจงานและแปลบทความ)" : "สมาชิกทั่วไป"}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setConfirmRoleChange({ isOpen: false, userToChange: null, targetRole: "" })}>ยกเลิก</button>
              <button className="btn btn-teal" onClick={handleRoleChangeConfirm}>ยืนยันการเปลี่ยนสิทธิ์</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
