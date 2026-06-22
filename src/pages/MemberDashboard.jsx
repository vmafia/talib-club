import { useEffect, useState } from "react"
import toast from 'react-hot-toast'
import { invalidateContentCache } from "../lib/contentStore.js"
import { confirmAction } from "../utils/feedback.jsx"
import Quran from "./Quran.jsx"

// Sub-panels
import Overview from "../components/dashboard/Overview.jsx"
import SavedArticlesPanel from "../components/dashboard/SavedArticlesPanel.jsx"
import ProfilePanel from "../components/dashboard/ProfilePanel.jsx"
import SavedVersesPanel from "../components/dashboard/SavedVersesPanel.jsx"
import LeaderboardPanel from "../components/dashboard/LeaderboardPanel.jsx"
import ReflectionsPanel from "../components/dashboard/ReflectionsPanel.jsx"

function resolveDashboardView(initialView) {
  if (!initialView || initialView === "bookshelf" || initialView === "streak") return "overview"
  return initialView
}

export default function MemberDashboard({ authState, go, initialView = "overview", ctx, theme }) {
  const [view, setCurrentView] = useState(() => resolveDashboardView(initialView))
  const [copied, setCopied] = useState("")
  const [quranSura, setQuranSura] = useState(1)
  const [quranAyah, setQuranAyah] = useState(null)

  const user = authState?.user
  const profile = authState?.profile || {}
  const name = profile.displayName || user?.displayName || user?.email || "สมาชิก"
  const role = profile.role || "member"

  useEffect(() => {
    if (initialView === "bookshelf" || initialView === "streak") {
      go("reader", ctx?.shelfItemId ? { shelfItemId: ctx.shelfItemId } : null)
      return
    }

    const resolved = resolveDashboardView(initialView)
    setCurrentView(resolved)

    const searchParams = new URLSearchParams(window.location.search)
    const sura = searchParams.get("sura") || ctx?.sura
    const ayah = searchParams.get("ayah") || ctx?.ayah
    if (sura) setQuranSura(Number(sura))
    if (ayah) setQuranAyah(Number(ayah))
    else setQuranAyah(null)
  }, [initialView, ctx, go])

  const setView = (newView) => {
    if (newView === "quran") {
      go("quran", { sura: quranSura, ayah: quranAyah })
    } else if (newView === "bookshelf" || newView === "streak") {
      go("reader")
    } else {
      setCurrentView(newView)
      go("member", { view: newView }, { replace: true, noScroll: true })
    }
  }

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
    const ok = await confirmAction({
      title: "ออกจากระบบ?",
      message: "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
      confirmText: "ออกจากระบบ",
      danger: true
    });
    if (!ok) return;
    const toastId = toast.loading("กำลังออกจากระบบ...");
    setTimeout(async () => {
      try {
        invalidateContentCache();
        if (authState?.logout) await authState.logout();
        toast.success("ออกจากระบบสำเร็จ", { id: toastId });
        go("home");
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Logout failed:", error);
        }
        toast.error("เกิดข้อผิดพลาดในการออกจากระบบ", { id: toastId });
      }
    }, 400);
  };

  return (
    <div className="member-page">
      {user && !user.emailVerified && (
        <div className="card" style={{
          background: "rgba(217, 119, 6, 0.07)",
          borderColor: "rgba(217, 119, 6, 0.25)",
          borderStyle: "solid",
          borderWidth: ".5px",
          color: "var(--text)",
          padding: "16px 20px",
          marginBottom: 20,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "start", gap: 10, flex: 1, minWidth: 260 }}>
            <i className="ti ti-mail-exclamation" style={{ fontSize: 22, color: "#d97706", marginTop: 2 }}></i>
            <div>
              <strong style={{ fontSize: 14, display: "block", marginBottom: 2 }}>กรุณายืนยันอีเมลของคุณ ✉️</strong>
              <span style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5 }}>
                บัญชีของคุณยังไม่ได้ยืนยันความถูกต้องของอีเมล ({user.email}) โปรดตรวจสอบกล่องจดหมายและกดยืนยันตัวตน เพื่อความปลอดภัยในการสะสมประวัติ Streak การอ่าน
              </span>
            </div>
          </div>
          <button 
            className="btn"
            style={{ 
              background: "#d97706", 
              borderColor: "#d97706", 
              color: "#fff",
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 20,
              cursor: "pointer",
            }}
            onClick={async () => {
              try {
                if (authState?.sendCurrentEmailVerification) {
                  await authState.sendCurrentEmailVerification();
                  toast.success("ส่งลิงก์ยืนยันตัวตนไปยังอีเมลของคุณอีกครั้งเรียบร้อยแล้ว!");
                }
              } catch (err) {
                if (process.env.NODE_ENV !== "production") {
                  console.error("Failed to send email verification:", err);
                }
                toast.error("ไม่สามารถส่งอีเมลยืนยันตัวตนได้ในขณะนี้");
              }
            }}
          >
            ส่งลิงก์อีกครั้ง
          </button>
        </div>
      )}
      {view === "overview" && (
        <div className="member-hero">
          <div>
            <span className="badge badge-teal">{role === "staff" ? "Staff" : "Member"}</span>
            <h1>ยินดีต้อนรับ, {name}</h1>
            <p>พื้นที่สมาชิกสำหรับติดตามการอ่าน บันทึกหนังสือ และจัดการข้อมูลบัญชี Talib Club</p>
          </div>
          <div className="member-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {role === "staff" && (
              <button className="btn btn-teal" onClick={() => go("staff")} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-briefcase"></i>พื้นที่ปฏิบัติงานสตาฟ
              </button>
            )}
            <button className="btn btn-outline" onClick={handleLogout} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <i className="ti ti-logout"></i>ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {view === "overview" && (
        <Overview
          authState={authState}
          go={go}
          setView={setView}
          onOpenQuran={(sura, ayah) => {
            setQuranSura(sura || 1)
            setQuranAyah(ayah || null)
            setView("quran")
          }}
          onOpenSavedVerses={() => setView("saved-verses")}
        />
      )}
      {view === "saved-articles" && <SavedArticlesPanel authState={authState} go={go} setView={setView} />}
      {view === "profile" && <ProfilePanel authState={authState} copied={copied} copyText={copyText} go={go} setView={setView} ctx={ctx} />}
      {view === "quran" && (
        <div style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
          <button
            onClick={() => setView("overview")}
            className="sec-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
          >
            <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
          </button>
          <Quran
            initialSura={quranSura}
            initialAyah={quranAyah}
            authState={authState}
          />
        </div>
      )}
      {view === "saved-verses" && (
        <SavedVersesPanel
          authState={authState}
          go={go}
          setView={setView}
          setQuranSura={setQuranSura}
          setQuranAyah={setQuranAyah}
        />
      )}
      {view === "leaderboard" && (
        <LeaderboardPanel
          authState={authState}
          setView={setView}
        />
      )}
      {view === "reflections" && (
        <ReflectionsPanel
          authState={authState}
          setView={setView}
          theme={theme}
        />
      )}
    </div>
  )
}
