import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import toast from 'react-hot-toast'
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { ARTICLES, BOOKS } from "../data/index.js"
import { useContentCollection, useUserCollection, useUserDoc } from "../lib/contentStore.js"
import { storage } from "../lib/firebase.js"
import { confirmAction } from "../utils/feedback.jsx"
import Quran from "./Quran.jsx"
import DashboardNav from "../components/DashboardNav.jsx"

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
    </div>
  )
}

function Overview({ authState, go, setView, onOpenQuran, onOpenSavedVerses }) {
  const [lastRead, setLastRead] = useState(null)

  const uid = authState?.user?.uid
  const { items: shelfItems } = useContentCollection("bookshelf", [], uid, { live: false })
  const { items: savedVerses } = useUserCollection("quran_bookmarks", uid)
  const { item: remoteLastRead } = useUserDoc("quran_last_read", uid, uid ? `${uid}_last_read` : null)
  
  const userSavedVerses = useMemo(() => savedVerses.filter(item => item.uid === uid), [savedVerses, uid])
  const activeBooks = useMemo(() => shelfItems.filter(item => item.uid === uid && item.status !== "finished"), [shelfItems, uid])

  useEffect(() => {
    if (uid && remoteLastRead) {
      setLastRead(remoteLastRead)
      localStorage.setItem("quran-last-read", JSON.stringify(remoteLastRead))
      return
    }

    try {
      const local = localStorage.getItem("quran-last-read")
      if (local) {
        setLastRead(JSON.parse(local))
      }
    } catch (err) {
      console.error(err)
    }
  }, [lastReadPos, uid])

  return (
    <div>
      {lastRead && (
        <div className="card" style={{
          padding: "16px 20px",
          marginBottom: 20,
          background: "var(--teal-bg)",
          borderColor: "rgba(45, 190, 160, 0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          textAlign: "left"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--br)", flexShrink: 0 }}>
              <i className="ti ti-flag-2" style={{ color: "var(--teal)", fontSize: 16 }}></i>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block" }}>อ่านต่อล่าสุด</strong>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>ซูเราะฮ์ {lastRead.suraName || lastRead.sura} อายะฮ์ {lastRead.aya}</span>
            </div>
          </div>
          <button className="btn btn-teal" onClick={() => onOpenQuran(lastRead.sura, lastRead.aya)} style={{ padding: "6px 14px", fontSize: 11 }}>
            อ่านต่อล่าสุด <i className="ti ti-arrow-right" style={{ marginLeft: 4 }}></i>
          </button>
        </div>
      )}

      <DashboardNav 
        setView={setView} 
        go={go} 
        lastRead={lastRead} 
        onOpenQuran={onOpenQuran} 
        activeBooksCount={activeBooks.length} 
        userSavedVersesCount={userSavedVerses.length} 
      />
    </div>
  )
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
]

const CATEGORY_MAP = {
  aqeedah: "อากีดะฮ์",
  fiqh: "ฟิกฮ์",
  seerah: "ซีเราะฮ์",
  hadith: "ฮะดีษ",
  social: "สังคมศาสตร์",
  tafsir: "ตัฟซีร"
}

const TYPE_MAP = {
  series: "ซีรีส์",
  general: "บทความทั่วไป",
  specific: "บทความเฉพาะเรื่อง",
  social: "สังคมศาสตร์"
}

function getArticleMonthString(dateStr) {
  if (!dateStr) return "ไม่ระบุเวลา"
  const parts = dateStr.split("-")
  if (parts.length >= 2) {
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10) - 1
    if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 0 && m < 12) {
      return `${THAI_MONTHS[m]} ${y + 543}`
    }
  }
  return dateStr
}

function getSavedMonthString(date) {
  if (!date || Number.isNaN(date.getTime())) return "ไม่ระบุเวลา"
  return `${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`
}

function getTimeMs(value) {
  if (!value) return 0
  if (typeof value.toDate === "function") return value.toDate().getTime()
  if (value.seconds) return value.seconds * 1000
  if (typeof value === "number") return value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function getLocalDayKey(value) {
  const ms = getTimeMs(value)
  if (!ms) return ""
  const date = new Date(ms)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function getWeekKey(date) {
  const ms = getTimeMs(date || Date.now())
  const d = new Date(ms)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return getLocalDayKey(monday.getTime())
}

function normalizeStreakSettings(settings, uid) {
  const base = settings || {}
  return {
    id: base.id || uid,
    uid: base.uid || uid,
    gems: Number(base.gems || 0),
    freezeCredits: Number(base.freezeCredits ?? 2),
    leaveCredits: Number(base.leaveCredits ?? 1),
    protectedDays: Array.isArray(base.protectedDays) ? base.protectedDays : [],
    claimedMissions: base.claimedMissions || {},
    remindersEnabled: Boolean(base.remindersEnabled),
    reminderTimes: Array.isArray(base.reminderTimes) ? base.reminderTimes : [],
  }
}

function calculateReadingStreak(values, protections = []) {
  const days = new Set()
  values.forEach(value => {
    const key = getLocalDayKey(value)
    if (key) days.add(key)
  })
  const protectedByDay = new Map()
  protections.forEach(item => {
    if (item?.date) protectedByDay.set(item.date, item)
  })
  const coveredDays = new Set([...days, ...protectedByDay.keys()])
  const today = getLocalDayKey(Date.now())
  let current = 0
  let cursor = today
  while (coveredDays.has(cursor)) {
    current += 1
    const [y, m, d] = cursor.split("-").map(Number)
    const prev = new Date(y, m - 1, d - 1)
    cursor = getLocalDayKey(prev.getTime())
  }
  return {
    current,
    totalDays: days.size,
    protectedTotal: protectedByDay.size,
    todayKey: today,
    todayVerified: days.has(today),
    todayProtected: protectedByDay.get(today) || null,
    coveredDays,
  }
}

function SavedArticlesPanel({ authState, go, setView }) {
  const uid = authState?.user?.uid;
  const { items: articles, loading: loadingArticles } = useContentCollection("articles", ARTICLES, null, { live: false })
  const { items: bookmarks, loading: loadingBookmarks } = useContentCollection("bookmarks", [], uid, { live: false })

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [authorFilter, setAuthorFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState("all")
  const [sortBy, setSortBy] = useState("newest_saved")

  const savedArticlesWithBookmarkInfo = useMemo(() => {
    if (!uid) return [];
    const userBookmarks = bookmarks.filter(b => b.uid === uid);

    return userBookmarks.map(b => {
      const art = articles.find(a => String(a.id) === String(b.articleId));
      if (!art) return null;

      let savedAtDate = null;
      if (b.savedAt) {
        if (b.savedAt.toDate) {
          savedAtDate = b.savedAt.toDate();
        } else if (b.savedAt.seconds) {
          savedAtDate = new Date(b.savedAt.seconds * 1000);
        } else {
          savedAtDate = new Date(b.savedAt);
        }
      }

      const savedMonthStr = savedAtDate ? getSavedMonthString(savedAtDate) : getArticleMonthString(art.date);

      return {
        ...art,
        bookmarkId: b.id,
        savedAtDate,
        savedMonthStr
      };
    }).filter(Boolean);
  }, [articles, bookmarks, uid])

  const categories = useMemo(() => {
    const cats = new Set(savedArticlesWithBookmarkInfo.map(a => a.category).filter(Boolean));
    return Array.from(cats);
  }, [savedArticlesWithBookmarkInfo]);

  const authors = useMemo(() => {
    const auts = new Set(savedArticlesWithBookmarkInfo.map(a => a.author).filter(Boolean));
    return Array.from(auts);
  }, [savedArticlesWithBookmarkInfo]);

  const types = useMemo(() => {
    const typs = new Set(savedArticlesWithBookmarkInfo.map(a => a.type).filter(Boolean));
    return Array.from(typs);
  }, [savedArticlesWithBookmarkInfo]);

  const months = useMemo(() => {
    const mths = new Set(savedArticlesWithBookmarkInfo.map(a => a.savedMonthStr).filter(Boolean));
    return Array.from(mths).sort((a, b) => b.localeCompare(a));
  }, [savedArticlesWithBookmarkInfo]);

  const filteredArticles = useMemo(() => {
    let result = [...savedArticlesWithBookmarkInfo];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.excerpt && a.excerpt.toLowerCase().includes(q)) ||
        (a.author && a.author.toLowerCase().includes(q)) ||
        (a.tags && a.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter(a => a.category === categoryFilter);
    }

    if (authorFilter !== "all") {
      result = result.filter(a => a.author === authorFilter);
    }

    if (typeFilter !== "all") {
      result = result.filter(a => a.type === typeFilter);
    }

    if (monthFilter !== "all") {
      result = result.filter(a => a.savedMonthStr === monthFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "newest_saved") {
        const timeA = a.savedAtDate ? a.savedAtDate.getTime() : 0;
        const timeB = b.savedAtDate ? b.savedAtDate.getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === "oldest_saved") {
        const timeA = a.savedAtDate ? a.savedAtDate.getTime() : 0;
        const timeB = b.savedAtDate ? b.savedAtDate.getTime() : 0;
        return timeA - timeB;
      }
      if (sortBy === "newest_article") {
        return b.date.localeCompare(a.date);
      }
      if (sortBy === "oldest_article") {
        return a.date.localeCompare(b.date);
      }
      return 0;
    });

    return result;
  }, [savedArticlesWithBookmarkInfo, search, categoryFilter, authorFilter, typeFilter, monthFilter, sortBy]);

  const hasActiveFilters = search || categoryFilter !== "all" || authorFilter !== "all" || typeFilter !== "all" || monthFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setAuthorFilter("all");
    setTypeFilter("all");
    setMonthFilter("all");
    setSortBy("newest_saved");
  };

  if (loadingArticles || loadingBookmarks) return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>

  return (
    <div className="profile-layout" style={{ maxWidth: 720, margin: "0 auto" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-bookmark-filled" style={{ color: "var(--teal)", fontSize: 20 }}></i>
          </div>
          <div>
            <h2 style={{ fontSize: 18 }}>บทความที่บันทึกไว้</h2>
            <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{filteredArticles.length} รายการ จากทั้งหมด {savedArticlesWithBookmarkInfo.length} รายการ</p>
          </div>
        </div>

        {savedArticlesWithBookmarkInfo.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>คุณยังไม่ได้บันทึกบทความใดๆ ไว้เลย</div>
        ) : (
          <>
            {/* ส่วนค้นหาและตัวกรอง */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: "0.5px solid var(--br2)" }}>
              {/* แถบหลัก: ค้นหาและเรียงลำดับ */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
                  <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 14 }}></i>
                  <input
                    placeholder="ค้นหาชื่อบทความ, ผู้เขียน, หรือคำสำคัญ..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: 36, width: "100%", height: 38 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    style={{ padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 38 }}
                  >
                    <option value="newest_saved">บันทึกล่าสุด</option>
                    <option value="oldest_saved">บันทึกเก่าสุด</option>
                    <option value="newest_article">บทความใหม่สุด</option>
                    <option value="oldest_article">บทความเก่าสุด</option>
                  </select>
                  {hasActiveFilters && (
                    <button className="btn btn-outline" onClick={clearFilters} style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, height: 38, borderRadius: 8 }}>
                      <i className="ti ti-rotate-clockwise"></i> ล้างตัวกรอง
                    </button>
                  )}
                </div>
              </div>

              {/* ตัวกรองย่อยเพิ่มเติม */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>หมวดหมู่</label>
                  <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทั้งหมด</option>
                    {categories.map(c => <option key={c} value={c}>{CATEGORY_MAP[c] || c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>ประเภท</label>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทุกประเภท</option>
                    {types.map(t => <option key={t} value={t}>{TYPE_MAP[t] || t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>ผู้เขียน</label>
                  <select value={authorFilter} onChange={e => setAuthorFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทุกคน</option>
                    {authors.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--t2)", marginBottom: 4, fontWeight: 500 }}>เดือนที่บันทึก</label>
                  <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--br)", background: "var(--card)", color: "var(--text)", height: 32 }}>
                    <option value="all">ทุกช่วงเวลา</option>
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {filteredArticles.length === 0 ? (
              <div className="empty" style={{ padding: "40px 0" }}>ไม่พบรายการที่ตรงกับตัวกรองที่เลือก</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
                {filteredArticles.map(a => (
                  <div key={a.id} className="card" style={{ cursor: "pointer", padding: 16, display: "flex", flexDirection: "column" }} onClick={() => go("article", a)}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                      <span className="tag tag-teal">{CATEGORY_MAP[a.category] || a.category}</span>
                      <span className="tag tag-acc">{TYPE_MAP[a.type] || a.type}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 8, lineHeight: 1.45 }}>{a.title}</div>
                    <div style={{ marginTop: "auto", fontSize: 11, color: "var(--t3)" }}>
                      {a.author} · {a.date}
                      {a.savedAtDate && <div style={{ fontSize: 10, color: "var(--teal)", marginTop: 4 }}><i className="ti ti-bookmark" style={{ marginRight: 2 }}></i>บันทึกเมื่อ: {getSavedMonthString(a.savedAtDate)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ProfilePanel({ authState, copied, copyText, go, setView, ctx }) {
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


  // 💡 เชื่อมต่อกับคอลเลกชัน history ใน Firestore
  const { items: rawHistory, loading: loadingHistory } = useContentCollection("history", [], user?.uid, { live: false })
  const { items: savedVerses } = useUserCollection("quran_bookmarks", user?.uid)
  const { items: readingSessions } = useContentCollection("reading_sessions", [], user?.uid, { live: false })
  const { items: streakRecords, saveItem: saveStreakSettings } = useContentCollection("reading_streaks", [], user?.uid, { live: false })

  const history = useMemo(() => {
    if (!user?.uid) return [];
    return rawHistory
      .filter(h => h.uid === user.uid)
      .sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        return timeB - timeA;
      });
  }, [rawHistory, user?.uid])

  const isGoogleUser = user?.providerData?.some(p => p.providerId === "google.com") || false;

  useEffect(() => {
    setForm({
      displayName: displayName === "-" ? "" : displayName,
      email,
      currentPassword: "",
      newPassword: "",
    })
  }, [displayName, email])

  // ลบโค้ด useEffect ดั้งเดิมที่ดึงประวัติจาก localStorage ออกแล้ว เพราะเปลี่ยนไปดึงจาก Firestore ด้านบนแล้ว

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const userSettings = useMemo(() => {
    if (!user?.uid) return null
    const found = streakRecords.find(item => item.uid === user.uid || item.id === user.uid)
    return normalizeStreakSettings(found, user.uid)
  }, [streakRecords, user?.uid])

  const handleToggleReminders = async (enabled) => {
    if (!userSettings) return
    if (enabled) {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        toast.error("เบราว์เซอร์ปฏิเสธสิทธิ์การแจ้งเตือน กรุณาเปิดสิทธิ์ในตั้งค่าเบราว์เซอร์เพื่อให้แจ้งเตือนทำงานได้")
      }
    }
    try {
      await saveStreakSettings({
        ...userSettings,
        remindersEnabled: enabled
      })
      toast.success(enabled ? "เปิดใช้งานระบบการแจ้งเตือนให้อ่านหนังสือแล้ว 🔔" : "ปิดใช้งานระบบการแจ้งเตือนแล้ว")
    } catch (err) {
      toast.error("บันทึกข้อมูลไม่สำเร็จ")
    }
  }

  const handleAddReminderTime = async (timeStr) => {
    if (!userSettings || !timeStr) return
    if (userSettings.reminderTimes.includes(timeStr)) {
      toast.error("มีเวลานี้ในการตั้งค่าแล้ว")
      return
    }
    const updatedTimes = [...userSettings.reminderTimes, timeStr].sort()
    try {
      await saveStreakSettings({
        ...userSettings,
        reminderTimes: updatedTimes
      })
      toast.success(`เพิ่มเวลาแจ้งเตือน ${timeStr} สำเร็จ`)
    } catch (err) {
      toast.error("บันทึกข้อมูลไม่สำเร็จ")
    }
  }

  const handleRemoveReminderTime = async (timeStr) => {
    if (!userSettings) return
    const updatedTimes = userSettings.reminderTimes.filter(t => t !== timeStr)
    try {
      await saveStreakSettings({
        ...userSettings,
        reminderTimes: updatedTimes
      })
      toast.success(`ลบเวลาแจ้งเตือน ${timeStr} สำเร็จ`)
    } catch (err) {
      toast.error("บันทึกข้อมูลไม่สำเร็จ")
    }
  }

  const stats = useMemo(() => {
    const articlesRead = history.filter(h => h.type === "article").length;
    const booksDownloaded = history.filter(h => h.type === "book").length;
    const mediaWatched = history.filter(h => h.type === "media").length;
    const verifiedSessions = readingSessions.filter(item => item.uid === user?.uid && item.verified)
    const settings = normalizeStreakSettings(streakRecords.find(item => item.uid === user?.uid || item.id === user?.uid), user?.uid)
    const streak = calculateReadingStreak(
      verifiedSessions.map(item => item.dayKey || item.completedAt || item.createdAt),
      settings.protectedDays
    );
    const readingMinutes = Math.round(verifiedSessions.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0) / 60)
    return { articlesRead, booksDownloaded, mediaWatched, streak, verifiedSessions: verifiedSessions.length, readingMinutes };
  }, [history, readingSessions, streakRecords, user?.uid])

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
      // 1. Update Display Name if changed
      if (form.displayName.trim() !== displayName.trim()) {
        if (authState?.updateUserProfile) {
          await authState.updateUserProfile({
            displayName: form.displayName,
          })
        }
        toast.success("อัปเดตชื่อที่แสดงเรียบร้อยแล้ว")
      }

      // 2. Sensitive operations (Email or Password change)
      const emailChanged = form.email.trim().toLowerCase() !== email.trim().toLowerCase();
      const passwordChanged = form.newPassword.trim() !== "";

      if (emailChanged || passwordChanged) {
        if (!isGoogleUser) {
          if (!form.currentPassword.trim()) {
            throw new Error("กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน");
          }
          // Re-authenticate first
          await authState.reauthenticateForSensitiveAction(form.currentPassword);
        } else {
          // If Google user tries to modify email or password somehow (should be disabled anyway)
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

      // Reset password fields on success
      set("currentPassword", "")
      set("newPassword", "")
    } catch (err) {
      console.error(err)
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
              <div className="card card-glass animate-fade-in-up" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", animationFillMode: "forwards" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--teal-bg)", color: "var(--teal)", display: "grid", placeItems: "center", fontSize: 18 }}>
                   <i className="ti ti-file-text"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>บทความที่อ่าน</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.articlesRead} บทความ</div>
                </div>
              </div>
              <div className="card card-glass animate-fade-in-up" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", animationDelay: "0.1s", opacity: 0, animationFillMode: "forwards" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255, 179, 0, 0.1)", color: "rgb(255, 179, 0)", display: "grid", placeItems: "center", fontSize: 18 }}>
                   <i className="ti ti-download"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>โหลดหนังสือ</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.booksDownloaded} เล่ม</div>
                </div>
              </div>
              <div className="card card-glass animate-fade-in-up" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", animationDelay: "0.2s", opacity: 0, animationFillMode: "forwards" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(30, 215, 96, 0.1)", color: "rgb(30, 215, 96)", display: "grid", placeItems: "center", fontSize: 18 }}>
                   <i className="ti ti-player-play"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>ดู/ฟังมีเดีย</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.mediaWatched} คลิป</div>
                </div>
              </div>
              <div className="card card-glass animate-fade-in-up" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", animationDelay: "0.3s", opacity: 0, animationFillMode: "forwards" }}>
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

function parseHistoryTargetId(historyItem) {
  const rawId = String(historyItem?.id || "")
  const match = rawId.match(/_(article|book|media)_(.+)$/)
  return match?.[2] || null
}

function formEmailChanged(nextEmail, currentEmail) {
  return nextEmail?.trim().toLowerCase() !== currentEmail?.trim().toLowerCase()
}

const fieldStyle = { display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "var(--t2)" }

function SavedVersesPanel({ authState, go, setView, setQuranSura, setQuranAyah }) {
  const uid = authState?.user?.uid;
  const { items: savedVerses, loading, deleteItem, saveItem } = useUserCollection("quran_bookmarks", uid)
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState("");

  const userSaved = useMemo(() => {
    if (!uid) return [];
    return savedVerses.filter(v => v.uid === uid);
  }, [savedVerses, uid]);

  const filteredSaved = useMemo(() => {
    if (!search.trim()) return userSaved;
    const q = search.toLowerCase();
    return userSaved.filter(v =>
      v.notes?.toLowerCase().includes(q) ||
      v.translation?.toLowerCase().includes(q) ||
      v.suraName?.toLowerCase().includes(q) ||
      String(v.sura).includes(q)
    );
  }, [userSaved, search]);

  const handleOpenVerse = (sura, aya) => {
    go("quran", { sura, ayah: aya })
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditNote(item.notes || "");
  };

  const handleSaveNote = async (item) => {
    const toastId = toast.loading("กำลังบันทึก...");
    try {
      await saveItem({
        ...item,
        notes: editNote,
        updatedAt: new Date()
      });
      toast.success("บันทึกข้อคิดเรียบร้อยแล้ว", { id: toastId });
      setEditingId(null);
    } catch (err) {
      toast.error("ไม่สามารถบันทึกได้", { id: toastId });
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirmAction({
      title: "ลบอายะฮ์ที่บันทึก?",
      message: "คุณต้องการยกเลิกการบันทึกอายะฮ์นี้ใช่หรือไม่?",
      confirmText: "ลบออก",
      danger: true
    });
    if (ok) {
      const toastId = toast.loading("กำลังลบ...");
      try {
        await deleteItem(id);
        toast.success("ลบรายการแล้ว", { id: toastId });
      } catch (err) {
        toast.error("ลบไม่สำเร็จ", { id: toastId });
      }
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)" }}></i></div>

  return (
    <div className="profile-layout" style={{ maxWidth: 840, margin: "0 auto" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--teal-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-notebook" style={{ color: "var(--teal)", fontSize: 20 }}></i>
          </div>
          <div>
            <h2 style={{ fontSize: 18 }}>อายะฮ์อัลกุรอานที่บันทึกไว้</h2>
            <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{filteredSaved.length} รายการ (บันทึกข้อคิดและประโยชน์จากอายะฮ์)</p>
          </div>
        </div>

        {userSaved.length === 0 ? (
          <div className="empty" style={{ padding: "40px 0" }}>
            คุณยังไม่มีอายะฮ์ที่บันทึกไว้ ไปเปิดคัมภีร์อัลกุรอานเพื่อบันทึกและจดข้อคิดกันเลยครับ!
          </div>
        ) : (
          <>
            {/* ค้นหา */}
            <div style={{ position: "relative", marginBottom: 20 }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 14 }}></i>
              <input
                placeholder="ค้นหาตามข้อคิด คำแปล หรือซูเราะห์..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, width: "100%", height: 38 }}
              />
            </div>

            {filteredSaved.length === 0 ? (
              <div className="empty" style={{ padding: "30px 0" }}>ไม่พบรายการที่ค้นหา</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredSaved.map(item => (
                  <div key={item.id} className="card" style={{ padding: 20, border: "0.5px solid var(--br)", background: "var(--bg3)" }}>

                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                      <span className="badge badge-teal" style={{ fontSize: 11, cursor: "pointer" }} onClick={() => handleOpenVerse(item.sura, item.aya)}>
                        <i className="ti ti-book" style={{ marginRight: 4 }}></i>
                        ซูเราะฮ์ {item.suraName} [{item.sura}:{item.aya}]
                      </span>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }} onClick={() => handleOpenVerse(item.sura, item.aya)}>
                          <i className="ti ti-eye"></i> เปิดอ่าน
                        </button>
                        <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }} onClick={() => handleEdit(item)}>
                          <i className="ti ti-edit"></i> แก้ไข
                        </button>
                        <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--red)", borderColor: "rgba(220,38,38,0.2)" }} onClick={() => handleDelete(item.id)}>
                          <i className="ti ti-trash"></i> ลบ
                        </button>
                      </div>
                    </div>

                    {/* Verses Container */}
                    <div style={{ padding: 12, background: "var(--card)", borderRadius: 8, marginBottom: 12, border: "0.5px solid var(--br2)" }}>
                      <div 
                        style={{
                          fontFamily: "'Amiri', serif",
                          fontSize: 24,
                          direction: "rtl",
                          textAlign: "right",
                          marginBottom: 10,
                          lineHeight: 1.8,
                          color: "var(--text)"
                        }}
                        dangerouslySetInnerHTML={{ __html: item.arabicText }}
                      />
                      <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5 }}>
                        {item.translation}
                      </div>
                    </div>

                    {/* Reflection / Notes Box */}
                    {editingId === item.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--teal)" }}>
                          แก้ไขข้อคิด/ประโยชน์ที่ได้รับจากอายะฮ์นี้:
                        </label>
                        <textarea
                          value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          placeholder="เขียนบันทึกสิ่งที่คุณได้รับ หรือข้อคิดสำหรับเตือนตนเอง..."
                          style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 8, border: "0.5px solid var(--teal)", fontFamily: "'Prompt', sans-serif", fontSize: 13, background: "var(--card)", color: "var(--text)" }}
                        />
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn btn-outline" style={{ padding: "4px 12px", fontSize: 11 }} onClick={() => setEditingId(null)}>
                            ยกเลิก
                          </button>
                          <button className="btn btn-teal" style={{ padding: "4px 12px", fontSize: 11 }} onClick={() => handleSaveNote(item)}>
                            บันทึก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: "rgba(45, 190, 160, 0.05)",
                        borderTop: "3px solid var(--teal)",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        marginTop: 10
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--teal)", marginBottom: 4 }}>
                          ประโยชน์และข้อคิดเตือนใจที่คุณบันทึกไว้:
                        </div>
                        <p style={{ fontSize: 13, color: "var(--text)", fontStyle: item.notes ? "normal" : "italic", margin: 0 }}>
                          {item.notes || "ไม่มีข้อบันทึก (กดแก้ไขเพื่อเพิ่มข้อคิดเตือนใจ)"}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TutorialModal({ onClose, theme }) {
  return createPortal(
    <div className={`app ${theme || "light"}`} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 16px",
    }}>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--br);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--teal);
        }
      `}</style>
      <div className="card" style={{
        maxWidth: 500,
        width: "100%",
        maxHeight: "calc(100vh - 40px)",
        padding: "24px 20px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        textAlign: "center",
        animation: "pageFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        position: "relative",
        margin: "auto",
        boxSizing: "border-box",
      }}>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: -4 }}>
            <span className="badge badge-teal" style={{ fontSize: 11, padding: "4px 10px", fontWeight: 600 }}>แนะนำการใช้งาน 🚀</span>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            ห้องอ่านหนังสือส่วนตัวคืออะไร?
          </h2>

          <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>
            เครื่องมือสร้างวินัยรักการอ่าน ผ่านการจับเวลาจริง บันทึกผล และสะสมสถิติความต่อเนื่อง (Streak)
          </p>
        </div>

        <div className="custom-scrollbar" style={{
          flex: "1 1 auto",
          overflowY: "auto",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingRight: 6,
          marginRight: -6,
        }}>

          <div style={{ display: "flex", gap: 12, background: "var(--bg2)", padding: 13, borderRadius: 12, border: "0.5px solid var(--br)" }}>
            <div style={{ width: 34, height: 34, background: "var(--teal-bg)", color: "var(--teal)", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
              <i className="ti ti-books"></i>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block", marginBottom: 2 }}>เพิ่มหนังสือแล้วเริ่มอ่าน</strong>
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>เลือกหนังสือจากคลังหรืออัปโหลด PDF กด <span style={{ color: "var(--teal)", fontWeight: 500 }}>เริ่มอ่าน</span> เพื่อเข้าโหมดจับเวลา ระบบบันทึกเวลาที่อ่านจริงเท่านั้น</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, background: "var(--bg2)", padding: 13, borderRadius: 12, border: "0.5px solid var(--br)" }}>
            <div style={{ width: 34, height: 34, background: "rgba(248, 113, 113, 0.12)", color: "#f87171", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
              <i className="ti ti-flame"></i>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block", marginBottom: 2 }}>รักษา Streak ต่อเนื่อง 🔥</strong>
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>อ่านและบันทึกเซสชันทุกวัน ระบบจะนับวันต่อเนื่อง หากวันไหนอ่านไม่ได้ ใช้ไอเทมคุ้มครองแทนได้</span>
            </div>
          </div>

          {/* ─── น้ำแข็ง & ลากิจ ─── */}
          <div style={{ background: "rgba(96,165,250,0.07)", border: "0.5px solid rgba(96,165,250,0.2)", borderRadius: 12, padding: 13 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-shield-check" style={{ color: "#60a5fa" }}></i>
              ไอเทมคุ้มครอง Streak (สูงสุด 2 ชิ้นต่อประเภท)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>🧊</span>
                <div>
                  <strong style={{ fontSize: 12, color: "var(--text)" }}>น้ำแข็ง (Freeze)</strong>
                  <span style={{ fontSize: 11, color: "var(--t2)", display: "block", lineHeight: 1.4 }}>ระบบใช้อัตโนมัติเมื่อลืมอ่านหนังสือในวันก่อนหน้า เพื่อรักษา Streak ของคุณ ได้จากภารกิจสะสม</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>📅</span>
                <div>
                  <strong style={{ fontSize: 12, color: "var(--text)" }}>ลากิจ (Leave)</strong>
                  <span style={{ fontSize: 11, color: "var(--t2)", display: "block", lineHeight: 1.4 }}>ใช้เมื่อวางแผนล่วงหน้าแล้วว่าน่าจะเรียนไม่ทันหรือไม่ว่าง สามารถกดใช้วันนี้ด้วยตัวเอง ได้จากภารกิจสะสม</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, background: "var(--bg2)", padding: 13, borderRadius: 12, border: "0.5px solid var(--br)" }}>
            <div style={{ width: 34, height: 34, background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
              <i className="ti ti-target"></i>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "var(--text)", display: "block", marginBottom: 2 }}>ภารกิจรายวัน (ไม่ง่าย)</strong>
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>อ่าน 20 นาที หรือเขียนข้อคิด 200 ตัวอักษร หรือผ่านแบบทดสอบ 4/5 ข้อ จึงจะได้รับไอเทม และมีสิทธิ์รับได้เพียงครั้งเดียวต่อวัน</span>
            </div>
          </div>

        </div>

        <div style={{ flexShrink: 0, marginTop: 4 }}>
          <button
            className="btn btn-teal"
            onClick={onClose}
            style={{ width: "100%", padding: "12px", fontSize: 14 }}
          >
            เข้าใจแล้ว เริ่มต้นใช้งานเลย!
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
