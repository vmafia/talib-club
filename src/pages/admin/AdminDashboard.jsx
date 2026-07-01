import React, { useState, useEffect } from "react"
import { collection, getDocs, query, limit, orderBy } from "firebase/firestore"
import { db } from "../../lib/firebase.js"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, sessions: 0, campaigns: 0 })
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const usersSnap = await getDocs(collection(db, "users"))
        const sessionsSnap = await getDocs(query(collection(db, "reading_sessions"), orderBy("timestamp", "desc"), limit(100)))
        const campaignsSnap = await getDocs(collection(db, "campaign_registrations"))

        setStats({
          users: usersSnap.size,
          sessions: sessionsSnap.size, // Note: We only fetched 100 for performance, ideally we use count() but this is fine for now
          campaigns: campaignsSnap.size
        })

        // Generate some dummy chart data based on sessions
        const articleCounts = {}
        sessionsSnap.forEach(doc => {
          const data = doc.data()
          const aId = data.articleId || "Unknown"
          articleCounts[aId] = (articleCounts[aId] || 0) + 1
        })

        const formattedData = Object.keys(articleCounts).map(id => ({
          name: id.substring(0, 10) + "...",
          reads: articleCounts[id]
        })).sort((a, b) => b.reads - a.reads).slice(0, 5)

        setChartData(formattedData)
      } catch (err) {
        console.error("Dashboard error:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>กำลังโหลดข้อมูลสถิติ...</div>
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2><i className="ti ti-chart-bar" style={{ color: "var(--teal)", marginRight: 8 }}></i> ภาพรวมระบบ (Dashboard)</h2>
        <p style={{ marginTop: 8 }}>สถิติการใช้งานและจำนวนข้อมูลทั้งหมดในระบบ</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="card" style={{ padding: 20, textAlign: "center", borderTop: "4px solid var(--teal)" }}>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 8 }}>ผู้ใช้งานทั้งหมด</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{stats.users}</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: "center", borderTop: "4px solid #f5a623" }}>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 8 }}>การเข้าอ่านบทความล่าสุด</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{stats.sessions}</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: "center", borderTop: "4px solid #e05555" }}>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 8 }}>ยอดขอรับหนังสือ</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{stats.campaigns}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ marginBottom: 20, fontSize: 16 }}>บทความยอดนิยม (Top 5 จาก 100 ครั้งล่าสุด)</h3>
        <div style={{ height: 300, width: "100%" }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--br2)" />
                <XAxis dataKey="name" tick={{ fill: "var(--t2)", fontSize: 12 }} axisLine={{ stroke: "var(--br)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--t2)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: "var(--bg2)" }}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--br)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  itemStyle={{ color: "var(--teal)", fontWeight: 600 }}
                />
                <Bar dataKey="reads" fill="var(--teal)" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: 14 }}>
              ยังไม่มีข้อมูลการอ่าน
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
