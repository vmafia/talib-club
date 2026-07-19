import React, { useState, useEffect } from "react"
import { collection, getDocs, query, orderBy, where, getCountFromServer } from "firebase/firestore"
import { db } from "../../lib/firebase.js"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, sessions: 0, newUsers: 0, campaigns: 0 })
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("12h")

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const usersSnap = await getCountFromServer(collection(db, "users"))
        const campaignsSnap = await getCountFromServer(collection(db, "book_registrations"))

        let startDate = new Date()
        let formatKey = (d) => `${d.getHours().toString().padStart(2, '0')}:00`
        let intervals = 12
        let intervalMs = 60 * 60 * 1000

        if (timeRange === "12h") {
          startDate = new Date(startDate.getTime() - 12 * 60 * 60 * 1000)
          formatKey = (d) => `${d.getHours().toString().padStart(2, '0')}:00`
          intervals = 12
          intervalMs = 60 * 60 * 1000
        } else if (timeRange === "1d") {
          startDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
          formatKey = (d) => `${d.getHours().toString().padStart(2, '0')}:00`
          intervals = 24
          intervalMs = 60 * 60 * 1000
        } else if (timeRange === "7d") {
          startDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000)
          formatKey = (d) => `${d.getDate()}/${d.getMonth()+1}`
          intervals = 7
          intervalMs = 24 * 60 * 60 * 1000
        } else if (timeRange === "30d") {
          startDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000)
          formatKey = (d) => `${d.getDate()}/${d.getMonth()+1}`
          intervals = 30
          intervalMs = 24 * 60 * 60 * 1000
        } else if (timeRange === "1y") {
          startDate = new Date(startDate.getTime() - 365 * 24 * 60 * 60 * 1000)
          formatKey = (d) => `${d.getMonth()+1}/${d.getFullYear().toString().slice(2)}`
        }

        const counts = {}
        const now = new Date()
        
        if (timeRange === "1y") {
          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            counts[`${d.getMonth()+1}/${d.getFullYear().toString().slice(2)}`] = { reads: 0, users: 0 }
          }
        } else {
          for (let i = intervals - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * intervalMs)
            counts[formatKey(d)] = { reads: 0, users: 0 }
          }
        }

        const sessionsSnap = await getDocs(query(collection(db, "site_visits"), where("createdAt", ">=", startDate), orderBy("createdAt", "asc")))
        const usersSnapList = await getDocs(query(collection(db, "users"), where("createdAt", ">=", startDate), orderBy("createdAt", "asc")))

        sessionsSnap.forEach(doc => {
          const data = doc.data()
          if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
            const key = timeRange === "1y" ? `${date.getMonth()+1}/${date.getFullYear().toString().slice(2)}` : formatKey(date)
            if (counts[key] !== undefined) {
              counts[key].reads++
            }
          }
        })

        usersSnapList.forEach(doc => {
          const data = doc.data()
          if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
            const key = timeRange === "1y" ? `${date.getMonth()+1}/${date.getFullYear().toString().slice(2)}` : formatKey(date)
            if (counts[key] !== undefined) {
              counts[key].users++
            }
          }
        })

        const formattedData = Object.keys(counts).map(k => ({
          name: k,
          reads: counts[k].reads,
          users: counts[k].users
        }))

        setStats({
          users: usersSnap.data().count,
          sessions: sessionsSnap.size, 
          newUsers: usersSnapList.size,
          campaigns: campaignsSnap.data().count
        })

        setChartData(formattedData)
      } catch (err) {
        console.error("Dashboard error:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [timeRange])

  const timeRangeLabel = {
    "12h": "12 ชั่วโมงย้อนหลัง (รายชั่วโมง)",
    "1d": "24 ชั่วโมงย้อนหลัง (รายชั่วโมง)",
    "7d": "7 วันย้อนหลัง (รายวัน)",
    "30d": "30 วันย้อนหลัง (รายวัน)",
    "1y": "1 ปีเต็ม (รายเดือน)",
  }[timeRange]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2><i className="ti ti-chart-bar" style={{ color: "var(--teal)", marginRight: 8 }}></i> ภาพรวมระบบ (Dashboard)</h2>
        <p style={{ marginTop: 8 }}>สถิติการใช้งานและจำนวนข้อมูลทั้งหมดในระบบ</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="card" style={{ padding: 20, textAlign: "center", borderTop: "4px solid var(--teal)" }}>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 8 }}>ผู้ใช้งานทั้งหมด</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{loading ? "..." : stats.users}</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: "center", borderTop: "4px solid #f5a623" }}>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 8 }}>สมาชิกใหม่ ({timeRangeLabel})</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{loading ? "..." : stats.newUsers}</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: "center", borderTop: "4px solid #8e44ad" }}>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 8 }}>การเข้าชมเว็บ ({timeRangeLabel})</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{loading ? "..." : stats.sessions}</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: "center", borderTop: "4px solid #e05555" }}>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 8 }}>ยอดลงทะเบียนรับหนังสือ</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{loading ? "..." : stats.campaigns}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 24, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>สถิติการใช้งาน และ สมาชิกใหม่</h3>
          <select 
            value={timeRange} 
            onChange={e => setTimeRange(e.target.value)}
            disabled={loading}
            style={{ 
              padding: "6px 12px", 
              borderRadius: 8, 
              border: "1px solid var(--br)", 
              background: "var(--bg2)", 
              fontSize: 13,
              color: "var(--text)",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            <option value="12h">12 ชั่วโมงย้อนหลัง</option>
            <option value="1d">24 ชั่วโมงย้อนหลัง</option>
            <option value="7d">7 วันล่าสุด</option>
            <option value="30d">30 วันล่าสุด</option>
            <option value="1y">1 ปีล่าสุด</option>
          </select>
        </div>
        
        {loading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(var(--card-rgb), 0.7)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-loader-2 spin" style={{ fontSize: 32, color: "var(--teal)" }}></i>
          </div>
        )}

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
                  itemStyle={{ fontWeight: 600 }}
                  formatter={(value, name) => {
                    if (name === 'สมาชิกใหม่') return [value + ' คน', name];
                    if (name === 'การเข้าชมเว็บ') return [value + ' ครั้ง', name];
                    return [value, name];
                  }}
                />
                <Bar dataKey="users" name="สมาชิกใหม่" fill="#f5a623" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="reads" name="การเข้าชมเว็บ" fill="var(--teal)" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: 14 }}>
              ยังไม่มีข้อมูลการใช้งานในช่วงเวลานี้
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
