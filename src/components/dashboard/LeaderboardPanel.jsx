import { useState, useEffect, useMemo } from "react"
import { db } from "../../lib/firebase.js"
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore"

export default function LeaderboardPanel({ authState, setView }) {
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)
  const uid = authState?.user?.uid

  useEffect(() => {
    async function fetchLeaders() {
      try {
        setLoading(true)
        const q = query(
          collection(db, "content_reading_streaks"),
          orderBy("streakCount", "desc"),
          limit(10)
        )
        const snapshot = await getDocs(q)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setLeaders(data)
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("Error fetching leaderboard", err)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchLeaders()
  }, [])

  const userRank = useMemo(() => {
    if (!uid || leaders.length === 0) return null
    const idx = leaders.findIndex(item => item.uid === uid || item.id === uid)
    if (idx !== -1) return { rank: idx + 1, data: leaders[idx] }
    return null
  }, [leaders, uid])

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "left" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card" style={{ padding: 28, position: "relative", overflow: "hidden" }}>
        {/* Background gradient hint */}
        <div style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 150,
          height: 150,
          background: "radial-gradient(circle, rgba(236,72,153,0.12) 0%, rgba(0,0,0,0) 70%)",
          pointerEvents: "none"
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "rgba(236,72,153,0.1)",
            color: "#ec4899",
            display: "grid",
            placeItems: "center",
            fontSize: 24
          }}>
            <i className="ti ti-crown"></i>
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>ตารางอันดับผู้รักษาวินัยการอ่าน</h2>
            <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 4 }}>สมาชิกรักการอ่านที่มีสถิติ Streak การอ่านหนังสือสะสมต่อเนื่องสูงสุด 10 อันดับแรก</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <i className="ti ti-loader-2 spin" style={{ fontSize: 28, color: "var(--teal)", marginBottom: 8 }}></i>
            <div style={{ fontSize: 12, color: "var(--t2)" }}>กำลังดึงข้อมูลอันดับจากระบบ...</div>
          </div>
        ) : leaders.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>
            ยังไม่มีผู้ติดอันดับในขณะนี้ เริ่มอ่านหนังสือเพื่อสะสม Streak วันนี้กันเลย!
          </div>
        ) : (
          <div>
            {/* List */}
            <div className="leaderboard-list">
              {leaders.map((item, index) => {
                const isCurrentUser = item.uid === uid || item.id === uid
                const rank = index + 1
                let rankBadge = ""
                let rankStyle = { fontWeight: 600 }
                if (rank === 1) {
                  rankBadge = "🥇"
                  rankStyle = { fontSize: 20 }
                } else if (rank === 2) {
                  rankBadge = "🥈"
                  rankStyle = { fontSize: 20 }
                } else if (rank === 3) {
                  rankBadge = "🥉"
                  rankStyle = { fontSize: 20 }
                } else {
                  rankBadge = `#${rank}`
                  rankStyle = { fontSize: 13, color: "var(--t3)", fontFamily: "monospace" }
                }

                return (
                  <div
                    key={item.id}
                    className={`leaderboard-item ${isCurrentUser ? "me" : ""}`}
                    style={isCurrentUser ? { borderColor: "#ec4899", boxShadow: "0 4px 12px rgba(236,72,153,0.08)" } : {}}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ width: 32, textAlign: "center", ...rankStyle }}>
                        {rankBadge}
                      </span>
                      <div>
                        <strong style={{ fontSize: 14, color: "var(--text)" }}>
                          {item.displayName || "ผู้ไม่ประสงค์ออกนาม"}
                        </strong>
                        {isCurrentUser && (
                          <span className="badge badge-teal" style={{ marginLeft: 8, fontSize: 10, background: "rgba(236,72,153,0.1)", color: "#ec4899", border: "none" }}>คุณ</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <i className="ti ti-flame" style={{ color: "#f97316", fontSize: 18 }} />
                      <strong style={{ fontSize: 15, fontFamily: "monospace" }}>{item.streakCount || 0}</strong>
                      <span style={{ fontSize: 12, color: "var(--t3)" }}>วันต่อเนื่อง</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Current user rank callout if not in top 10 */}
            {!userRank && uid && (
              <div
                className="card"
                style={{
                  marginTop: 20,
                  padding: 16,
                  borderRadius: 14,
                  border: "0.5px dashed var(--teal)",
                  background: "var(--teal-bg)",
                  textAlign: "center",
                  fontSize: 13
                }}
              >
                คุณยังไม่ได้สะสม Streak หรือไม่อยู่ใน 10 อันดับแรก มาร่วมท้าทายด้วยการอ่านวันละ 10 นาทีขึ้นไปกันเถอะ! 📚🚀
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
