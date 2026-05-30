import { useEffect, useState } from "react"
import toast from 'react-hot-toast'
import { ARTICLES } from "../data/index.js"
import { useContentCollection } from "../lib/contentStore.js"

export default function MemberDashboard({ authState, go, initialView = "overview" }) {
  const [view, setView] = useState("overview")
  const [copied, setCopied] = useState("")

  const user = authState?.user
  const profile = authState?.profile || {}
  const name = profile.displayName || user?.displayName || user?.email || "สมาชิก"
  const role = profile.role || "member"

  useEffect(() => {
    if (initialView) setView(initialView)
  }, [initialView])

  async function copyText(label, value) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      toast.success("คัดลอกข้อความแล้ว")
      window.setTimeout(() => setCopied(""), 1800)
    } catch (err) {
      toast.error("คัดลอกไม่สำเร็จ")
      setCopied("")
    }
  }

  const handleLogout = async () => {
    const isConfirm = window.confirm("คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?");
    if (!isConfirm) return;
    const toastId = toast.loading("กำลังออกจากระบบ...");
    setTimeout(async () => {
      try {
        if (authState?.logout) await authState.logout();
        toast.success("ออกจากระบบสำเร็จ", { id: toastId });
        window.location.href = "/";
      } catch (error) {
        toast.error("เกิดข้อผิดพลาดในการออกจากระบบ", { id: toastId });
      }
    }, 600);
  };

  return (
    <div className="member-page">
      <div className="member-hero">
        <div>
          <span className="badge badge-teal">{role === "staff" ? "Staff" : "Member"}</span>
          <h1>ยินดีต้อนรับ, {name}</h1>
          <p>พื้นที่สมาชิกสำหรับติดตามการอ่าน บันทึกหนังสือ และจัดการข้อมูลบัญชี Talib Club</p>
        </div>
        <div className="member-actions">
          <button className="btn btn-outline" onClick={handleLogout}>
            <i className="ti ti-logout" style={{ marginRight: 6 }}></i>ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="member-tabs" aria-label="เมนูสมาชิก">
        <button className={`pill ${view === "overview" ? "on" : ""}`} onClick={() => setView("overview")}>แดชบอร์ด</button>
        <button className={`pill ${view === "saved-articles" ? "on" : ""}`} onClick={() => setView("saved-articles")}>บทความที่บันทึกไว้</button>
        <button className={`pill ${view === "profile" ? "on" : ""}`} onClick={() => setView("profile")}>โปรไฟล์</button>
      </div>

      {view === "overview" && <Overview authState={authState} go={go} setView={setView} />}
      {view === "saved-articles" && <SavedArticlesPanel authState={authState} go={go} />}
      {view === "profile" && <ProfilePanel authState={authState} copied={copied} copyText={copyText} go={go} />}
    </div>
  )
}

function Overview({ authState, go, setView }) {
  return (
    <div>
      <div className="grid3">
        <DashboardCard icon="ti-user-circle" title="โปรไฟล์ของฉัน" text="จัดการข้อมูลบัญชี" onClick={() => setView("profile")} />
        <DashboardCard icon="ti-book-2" title="ชั้นหนังสือของฉัน" text="บันทึกหนังสือที่กำลังอ่านและอ่านจบ" />
        <DashboardCard icon="ti-flame" title="Reading Streak" text="ติดตามวันที่อ่านต่อเนื่อง" />
      </div>
      <div className="grid3" style={{ marginTop: 12 }}>
        <DashboardCard 
          icon="ti-bookmark" 
          title="บทความที่บันทึกไว้" 
          text="เก็บบทความที่อยากกลับมาอ่านภายหลัง" 
          onClick={() => setView("saved-articles")} 
        />
        <DashboardCard icon="ti-bell" title="การแจ้งเตือน" text="ข่าวสาร กิจกรรม และหนังสือใหม่" />
        <DashboardCard icon="ti-settings" title="ตั้งค่าบัญชี" text="จัดการข้อมูลส่วนตัวและการเข้าสู่ระบบ" onClick={() => setView("profile")} />
      </div>
    </div>
  )
}

// โซนใหม่: หน้าแสดงบทความที่บันทึกไว้ของสมาชิก
function SavedArticlesPanel({ authState, go }) {
  const { items: articles, loading } = useContentCollection("articles", ARTICLES)
  const savedIds = authState?.profile?.savedArticles || []
  const savedArticles = articles.filter(a => savedIds.includes(a.id))

  if (loading) return <div style={{textAlign: "center", padding: 40}}><i className="ti ti-loader-2 spin" style={{fontSize: 24, color: "var(--teal)"}}></i></div>

  return (
    <div className="profile-layout">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
             <i className="ti ti-bookmark-filled" style={{ color: "var(--teal)", fontSize: 20 }}></i>
           </div>
           <div>
             <h2 style={{ fontSize: 18 }}>บทความที่บันทึกไว้</h2>
             <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{savedArticles.length} รายการในคลังส่วนตัว</p>
           </div>
        </div>

        {savedArticles.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>คุณยังไม่ได้บันทึกบทความใดๆ ไว้เลย</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {savedArticles.map(a => (
              <div key={a.id} className="card" style={{ cursor: "pointer", padding: 16, display: "flex", flexDirection: "column" }} onClick={() => go("article", a)}>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <span className="tag tag-teal">{a.category}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 8, lineHeight: 1.45 }}>{a.title}</div>
                <div style={{ marginTop: "auto", fontSize: 11, color: "var(--t3)" }}>{a.author} · {a.date}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProfilePanel({ authState, copied, copyText, go }) {
  // โค้ดส่วน ProfilePanel ใช้ของเดิมที่คุณมีได้เลยครับ (ขอละไว้เพื่อความกระชับ)
  const user = authState?.user
  const profile = authState?.profile || {}
  const role = profile.role || "member"
  const displayName = profile.displayName || user?.displayName || "-"
  const email = user?.email || profile.email || "-"
  const photoURL = user?.photoURL || ""
  const isStaff = role === "staff"
  const emailVerified = Boolean(user?.emailVerified)
  const needsPasswordReauth = user?.providerData?.some(item => item.providerId === "password")
  
  const [form, setForm] = useState({
    displayName: displayName === "-" ? "" : displayName,
    email,
    password: "",
  })
  const emailChanged = formEmailChanged(form.email, email)
  const [busy, setBusy] = useState("")

  useEffect(() => {
    setForm({
      displayName: displayName === "-" ? "" : displayName,
      email,
      password: "",
    })
  }, [displayName, email])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  async function saveProfile(e) {
    e.preventDefault()
    setBusy("profile")
    try {
      if (authState?.updateUserProfile) {
         await authState.updateUserProfile({
           displayName: form.displayName,
         })
      }
      toast.success("บันทึกโปรไฟล์เรียบร้อยแล้ว!")
    } catch (err) {
      toast.error("บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่")
    }
    setBusy("")
  }

  return (
    <div className="profile-layout">
      <form className="card profile-card" onSubmit={saveProfile}>
        <div className="profile-head">
          <div className="profile-avatar" style={{ overflow: "hidden" }}>
            {photoURL ? <img src={photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(displayName, email)}
          </div>
          <div>
            <span className={`badge ${isStaff ? "badge-teal" : "badge-acc"}`}>{isStaff ? "Staff" : "Member"}</span>
            <h2>{displayName}</h2>
            <p>{email}</p>
          </div>
        </div>

        <section className="profile-section">
          <div className="profile-section-head">
            <div>
              <h3>ข้อมูลส่วนตัว</h3>
              <p>ชื่อส่วนนี้จะแสดงบนหน้าโปรไฟล์และแดชบอร์ดของคุณ</p>
            </div>
          </div>
          <label style={fieldStyle}>
            <span>ชื่อที่แสดง</span>
            <input value={form.displayName} onChange={e => set("displayName", e.target.value)} placeholder="ชื่อที่ต้องการแสดง" />
          </label>
          <div className="profile-actions">
            <button className="btn btn-teal" disabled={busy === "profile"} type="submit">
              <i className="ti ti-device-floppy" style={{ marginRight: 6 }}></i>{busy === "profile" ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
            </button>
          </div>
        </section>
      </form>
    </div>
  )
}

function DashboardCard({ icon, title, text, onClick }) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag onClick={onClick} className="card dashboard-card">
      <i className={`ti ${icon}`}></i>
      <h2>{title}</h2>
      <p>{text}</p>
    </Tag>
  )
}

function initials(name, email) {
  const source = name && name !== "-" ? name : email
  return source.split(/\s|@/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "TC"
}

function formEmailChanged(nextEmail, currentEmail) {
  return nextEmail?.trim().toLowerCase() !== currentEmail?.trim().toLowerCase()
}

const fieldStyle = { display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "var(--t2)" }