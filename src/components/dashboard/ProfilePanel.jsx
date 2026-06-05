import { useState, useEffect, useMemo } from "react"
import toast from 'react-hot-toast'
import { db } from "../../lib/firebase.js"
import { collection, query, where, getCountFromServer } from "firebase/firestore"
import { useContentCollection, useUserCollection } from "../../lib/contentStore.js"
import { initials, parseHistoryTargetId, normalizeStreakSettings, fieldStyle } from "./dashboardUtils.js"

export default function ProfilePanel({ authState, copied, copyText, go, setView, ctx }) {
  const user = authState?.user
  const profile = authState?.profile || {}
  const role = profile.role || "member"
  const displayName = profile.displayName || user?.displayName || "-"
  const email = user?.email || profile.email || "-"
  const photoURL = user?.photoURL || ""
  const isStaff = role === "staff"

  const subView = ctx?.sub || "stats"
  const setSubView = (newSub) => {
    go("member", { view: "profile", sub: newSub }, { replace: true, noScroll: true })
  }

  const [form, setForm] = useState({
    displayName: displayName === "-" ? "" : displayName,
    email,
    currentPassword: "",
    newPassword: "",
  })
  const [busy, setBusy] = useState("")

  const { items: rawHistory } = useContentCollection("history", [], user?.uid, { limit: 10, orderByField: "timestamp", orderDirection: "desc", live: false })
  const { items: streakRecords, saveItem: saveStreakSettings } = useContentCollection("reading_streaks", [], user?.uid, { live: false })

  const history = useMemo(() => {
    if (!user?.uid) return [];
    return rawHistory;
  }, [rawHistory, user?.uid])

  const [dbStats, setDbStats] = useState({
    articlesRead: 0,
    booksDownloaded: 0,
    mediaWatched: 0,
    verifiedSessions: 0,
  })
  const [loadingDbStats, setLoadingDbStats] = useState(false)

  useEffect(() => {
    if (!user?.uid) return
    setLoadingDbStats(true)

    const fetchDbStats = async () => {
      try {
        const [artSnap, bookSnap, mediaSnap, sessionSnap] = await Promise.all([
          getCountFromServer(query(collection(db, "content_history"), where("uid", "==", user.uid), where("type", "==", "article"))),
          getCountFromServer(query(collection(db, "content_history"), where("uid", "==", user.uid), where("type", "==", "book"))),
          getCountFromServer(query(collection(db, "content_history"), where("uid", "==", user.uid), where("type", "==", "media"))),
          getCountFromServer(query(collection(db, "content_reading_sessions"), where("uid", "==", user.uid), where("verified", "==", true))),
        ])
        
        setDbStats({
          articlesRead: artSnap.data().count,
          booksDownloaded: bookSnap.data().count,
          mediaWatched: mediaSnap.data().count,
          verifiedSessions: sessionSnap.data().count,
        })
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("Failed to fetch profile counts:", err)
        }
      } finally {
        setLoadingDbStats(false)
      }
    }
    fetchDbStats()
  }, [user?.uid])

  const isGoogleUser = user?.providerData?.some(p => p.providerId === "google.com") || false;

  useEffect(() => {
    setForm({
      displayName: displayName === "-" ? "" : displayName,
      email,
      currentPassword: "",
      newPassword: "",
    })
  }, [displayName, email])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const userSettings = useMemo(() => {
    if (!user?.uid) return null
    const found = streakRecords.find(item => item.uid === user.uid || item.id === user.uid)
    return normalizeStreakSettings(found, user.uid)
  }, [streakRecords, user?.uid])

  const stats = useMemo(() => {
    const userStreakRecord = streakRecords.find(item => item.uid === user?.uid || item.id === user?.uid)
    return {
      articlesRead: dbStats.articlesRead,
      booksDownloaded: dbStats.booksDownloaded,
      mediaWatched: dbStats.mediaWatched,
      streak: {
        current: userStreakRecord?.streakCount || 0
      },
      verifiedSessions: dbStats.verifiedSessions,
      readingMinutes: 0
    };
  }, [dbStats, streakRecords, user?.uid])

  const handleHistoryClick = (h) => {
    const targetId = h.itemId || parseHistoryTargetId(h) || h.id;
    if (h.type === "article") go("article", { id: targetId });
    else if (h.type === "book") go("library-detail", { id: targetId });
    else if (h.type === "media") go("media-detail", { id: targetId });
  }

  async function saveAccount(e) {
    e.preventDefault()
    setBusy("account")

    try {
      if (form.displayName.trim() !== displayName.trim()) {
        if (authState?.updateUserProfile) {
          await authState.updateUserProfile({
            displayName: form.displayName,
          })
        }
        toast.success("อัปเดตชื่อที่แสดงเรียบร้อยแล้ว")
      }

      const emailChanged = form.email.trim().toLowerCase() !== email.trim().toLowerCase();
      const passwordChanged = form.newPassword.trim() !== "";

      if (emailChanged || passwordChanged) {
        if (!isGoogleUser) {
          if (!form.currentPassword.trim()) {
            throw new Error("กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน");
          }
          await authState.reauthenticateForSensitiveAction(form.currentPassword);
        } else {
          throw new Error("ผู้ใช้งานผ่าน Google ไม่จำเป็นต้องเปลี่ยนอีเมลหรือรหัสผ่านที่นี่");
        }

        if (emailChanged) {
          await authState.requestEmailChange(form.email);
          toast.success("ส่งอีเมลยืนยันการเปลี่ยนอีเมลแล้ว กรุณาตรวจสอบอีเมลใหม่ของคุณ");
        }

        if (passwordChanged) {
          await authState.updateUserPassword(form.newPassword);
          toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
        }
      }

      set("currentPassword", "")
      set("newPassword", "")
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error(err)
      }
      let msg = "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      if (err.code === "auth/wrong-password") {
        msg = "รหัสผ่านปัจจุบันไม่ถูกต้อง";
      } else if (err.message) {
        msg = err.message;
      }
      toast.error(msg);
    } finally {
      setBusy("")
    }
  }

  if (loadingDbStats) {
    return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>
  }

  return (
    <div className="profile-layout" style={{ maxWidth: 720, margin: "0 auto" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card profile-card" style={{ padding: 24 }}>
        <div className="profile-head" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="profile-avatar" style={{ overflow: "hidden", margin: 0 }}>
              {photoURL ? <img src={photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(displayName, email)}
            </div>
            <div>
              <span className={`badge ${isStaff ? "badge-teal" : "badge-acc"}`}>{isStaff ? "Staff" : "Member"}</span>
              <h2>{displayName}</h2>
              <p>{email}</p>
            </div>
          </div>
          {isStaff && (
            <button className="btn btn-teal" onClick={() => go("staff")} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <i className="ti ti-briefcase"></i>พื้นที่ปฏิบัติงานสตาฟ
            </button>
          )}
        </div>

        {/* Sub Navigation pills */}
        <div className="profile-tabs">
          <button className={`pill ${subView === "stats" ? "on" : ""}`} onClick={() => setSubView("stats")}>
            <i className="ti ti-chart-bar" style={{ marginRight: 6 }}></i>สถิติและการเรียนรู้
          </button>
          <button className={`pill ${subView === "account" ? "on" : ""}`} onClick={() => setSubView("account")}>
            <i className="ti ti-settings" style={{ marginRight: 6 }}></i>ตั้งค่าบัญชี
          </button>
        </div>

        {subView === "stats" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--teal-bg)", color: "var(--teal)", display: "grid", placeItems: "center", fontSize: 18 }}>
                   <i className="ti ti-file-text"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>บทความที่อ่าน</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.articlesRead} บทความ</div>
                </div>
              </div>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255, 179, 0, 0.1)", color: "rgb(255, 179, 0)", display: "grid", placeItems: "center", fontSize: 18 }}>
                   <i className="ti ti-download"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>โหลดหนังสือ</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.booksDownloaded} เล่ม</div>
                </div>
              </div>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(30, 215, 96, 0.1)", color: "rgb(30, 215, 96)", display: "grid", placeItems: "center", fontSize: 18 }}>
                   <i className="ti ti-player-play"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>ดู/ฟังมีเดีย</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.mediaWatched} คลิป</div>
                </div>
              </div>
              <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", background: "var(--bg2)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(248, 113, 113, 0.12)", color: "#f87171", display: "grid", placeItems: "center", fontSize: 18 }}>
                   <i className="ti ti-flame"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>streak อ่านจริง</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.streak.current} วัน · {stats.verifiedSessions} ครั้ง</div>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}><i className="ti ti-history" style={{ color: "var(--teal)" }}></i> ประวัติกิจกรรมล่าสุด</h3>
              {history.length === 0 ? (
                <div className="empty" style={{ padding: 24, textAlign: "center" }}>ยังไม่มีประวัติกิจกรรมการเรียนรู้ใดๆ ในระบบ</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.slice(0, 10).map((h, i) => {
                    let icon = "ti-file-text";
                    let color = "var(--teal)";
                    let typeLabel = "บทความ";
                    if (h.type === "book") {
                      icon = "ti-book";
                      color = "rgb(255, 179, 0)";
                      typeLabel = "หนังสือ";
                    } else if (h.type === "media") {
                      icon = h.mediaType === "youtube" ? "ti-brand-youtube" : "ti-brand-spotify";
                      color = h.mediaType === "youtube" ? "#ff4444" : "#1ed760";
                      typeLabel = h.mediaType === "youtube" ? "YouTube" : "Spotify";
                    }
                    return (
                      <div
                        key={`${h.id}-${h.timestamp}-${i}`}
                        onClick={() => handleHistoryClick(h)}
                        className="card"
                        style={{
                          padding: "10px 14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          cursor: "pointer",
                          transition: "transform 0.15s ease",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = "translateX(4px)"}
                        onMouseLeave={(e) => e.currentTarget.style.transform = "none"}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--bg2)", color, display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0 }}>
                            <i className={`ti ${icon}`}></i>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 9, color: "var(--t3)", display: "block" }}>{typeLabel}</span>
                            <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontSize: 13 }}>{h.title}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: "var(--t3)", flexShrink: 0 }}>{new Date(h.timestamp).toLocaleDateString("th-TH", { month: "short", day: "numeric" })}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {subView === "account" && (
          <form onSubmit={saveAccount}>
            <section className="profile-section" style={{ borderTop: "none", padding: 0 }}>
              <div className="profile-section-head" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 500 }}>ข้อมูลส่วนตัวบัญชี</h3>
                  <p style={{ fontSize: 12, color: "var(--t3)" }}>จัดการชื่อที่แสดง อีเมล และรหัสผ่านของคุณ</p>
                </div>
              </div>

              {isGoogleUser && (
                <div style={{ background: "rgba(45,190,160,0.06)", border: "0.5px solid rgba(45,190,160,0.25)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 11, color: "var(--teal)", lineHeight: 1.5 }}>
                  <i className="ti ti-brand-google" style={{ marginRight: 6 }}></i>
                  คุณเชื่อมต่อระบบผ่าน Google: การเปลี่ยนอีเมลและรหัสผ่านต้องทำผ่านบัญชี Google ของคุณโดยตรง
                </div>
              )}

              <div style={{ display: "grid", gap: 14 }}>
                <label style={fieldStyle}>
                  <span>ชื่อที่แสดง</span>
                  <input value={form.displayName} onChange={e => set("displayName", e.target.value)} placeholder="ชื่อที่ต้องการแสดง" required />
                </label>

                <label style={fieldStyle}>
                  <span>อีเมลหลัก (Email)</span>
                  <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="อีเมล" disabled={isGoogleUser} style={isGoogleUser ? { opacity: 0.6 } : undefined} required />
                </label>

                {!isGoogleUser && (
                  <>
                    <label style={fieldStyle}>
                      <span>รหัสผ่านใหม่ (หากต้องการเปลี่ยน)</span>
                      <input type="password" value={form.newPassword} onChange={e => set("newPassword", e.target.value)} placeholder="ป้อนรหัสผ่านใหม่" />
                    </label>

                    {(form.email.trim().toLowerCase() !== email.trim().toLowerCase() || form.newPassword.trim() !== "") && (
                      <label style={fieldStyle}>
                        <span>รหัสผ่านปัจจุบันเพื่อยืนยันสิทธิ์ *</span>
                        <input type="password" value={form.currentPassword} onChange={e => set("currentPassword", e.target.value)} placeholder="ป้อนรหัสผ่านเดิมของคุณ" required />
                      </label>
                    )}
                  </>
                )}
              </div>

              <div className="profile-actions" style={{ marginTop: 20 }}>
                <button className="btn btn-teal" disabled={busy === "account"} type="submit">
                  <i className={`ti ${busy === "account" ? "ti-loader-2 spin" : "ti-device-floppy"}`} style={{ marginRight: 6 }}></i>
                  {busy === "account" ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
                </button>
              </div>
            </section>
          </form>
        )}
      </div>
    </div>
  )
}
