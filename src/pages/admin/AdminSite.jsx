import { useEffect, useState, useRef } from "react"
import { SITE, ARTICLES, BOOKS, MEDIA, SCHOLARS } from "../../data/index.js"
import { useSiteSettings, CONTENT_COLLECTIONS } from "../../lib/contentStore.js"
import { notifyError, notifySuccess } from "../../utils/feedback.jsx"
import { db } from "../../lib/firebase.js"
import { collection, doc, setDoc, getDocs, serverTimestamp } from "firebase/firestore"

// Helper to clean undefined values recursively for Firestore
function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanObject(item)])
  )
}

function flattenSite(site) {
  return {
    ...site,
    facebook: site.social?.facebook || "",
    youtube: site.social?.youtube || "",
    spotify: site.social?.spotify || "",
    instagram: site.social?.instagram || "",
    tiktok: site.social?.tiktok || "",
    ayahAr: site.ayah?.ar || "",
    ayahTh: site.ayah?.th || "",
    ayahRef: site.ayah?.ref || "",
    followers: site.stats?.followers || "",
    followersLabel: site.stats?.followersLabel || "",
  }
}

function expandSite(form) {
  return {
    name: form.name || "",
    nameAr: form.nameAr || "",
    tagline: form.tagline || "",
    desc: form.desc || "",
    location: form.location || "",
    founded: form.founded || "",
    social: {
      facebook: form.facebook || "",
      youtube: form.youtube || "",
      spotify: form.spotify || "",
      instagram: form.instagram || "",
      tiktok: form.tiktok || "",
    },
    ayah: {
      ar: form.ayahAr || "",
      th: form.ayahTh || "",
      ref: form.ayahRef || "",
    },
    stats: {
      followers: form.followers || "",
      followersLabel: form.followersLabel || "",
    },
  }
}

export default function AdminSite() {
  const { site, loading, error, saveSiteSettings } = useSiteSettings(SITE)
  const [form, setForm] = useState(() => flattenSite(site || SITE))
  const [busy, setBusy] = useState(false)

  // Seeding States
  const [seeding, setSeeding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [forceOverwrite, setForceOverwrite] = useState(false)
  const [statusLog, setStatusLog] = useState([])
  const logEndRef = useRef(null)

  useEffect(() => {
    if (site) setForm(flattenSite(site))
  }, [site])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [statusLog])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  async function save() {
    setBusy(true)
    try {
      await saveSiteSettings(expandSite(form))
      notifySuccess("บันทึกการตั้งค่าเว็บไซต์เรียบร้อยแล้ว")
    } catch (err) {
      console.error(err)
      notifyError("บันทึกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Firestore")
    } finally {
      setBusy(false)
    }
  }

  async function runSeeding() {
    if (!window.confirm(`ยืนยันการเริ่มอัปโหลดข้อมูลเข้าสู่ Firebase? (โหมด: ${forceOverwrite ? "เขียนทับข้อมูลทั้งหมด" : "อัปโหลดเฉพาะข้อมูลใหม่"})`)) {
      return
    }

    setSeeding(true)
    setProgress(0)
    setStatusLog([])

    const addLog = (msg) => setStatusLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

    try {
      const collectionsToSeed = [
        { name: "articles", data: ARTICLES, colName: CONTENT_COLLECTIONS.articles, label: "บทความ" },
        { name: "books", data: BOOKS, colName: CONTENT_COLLECTIONS.books, label: "หนังสือ/PDF" },
        { name: "media", data: MEDIA, colName: CONTENT_COLLECTIONS.media, label: "มีเดีย" },
        { name: "scholars", data: SCHOLARS, colName: CONTENT_COLLECTIONS.scholars, label: "นักวิชาการ" },
      ]

      const totalItems = collectionsToSeed.reduce((acc, c) => acc + c.data.length, 0)
      let uploadedCount = 0

      addLog(`เริ่มต้นทำการอัปโหลดข้อมูลตั้งต้นจำนวนรวมทั้งหมด ${totalItems} รายการ...`)

      for (const col of collectionsToSeed) {
        addLog(`[คอลเลกชัน: ${col.label}] มีทั้งหมดในโค้ด ${col.data.length} รายการ`)

        let existingIds = new Set()
        if (!forceOverwrite) {
          addLog(`กำลังตรวจสอบข้อมูลที่มีอยู่เดิมบน Firebase...`)
          try {
            const snap = await getDocs(collection(db, col.colName))
            snap.forEach(docSnap => existingIds.add(String(docSnap.id)))
            addLog(`พบข้อมูลใน Firebase แล้ว ${existingIds.size} รายการ (จะทำการข้ามการอัปโหลด)`)
          } catch (e) {
            addLog(`ไม่สามารถตรวจสอบข้อมูลเดิมได้: ${e.message} จะอัปโหลดข้อมูลทั้งหมดแทน`)
          }
        }

        let addedInCol = 0
        let skippedInCol = 0

        for (const item of col.data) {
          const id = String(item.id)
          if (!forceOverwrite && existingIds.has(id)) {
            skippedInCol++
            uploadedCount++
            setProgress(Math.round((uploadedCount / totalItems) * 100))
            continue
          }

          // คลีนค่า object และเตรียมอัปโหลด
          const payload = cleanObject({
            ...item,
            id,
            deleted: false,
            updatedAt: serverTimestamp(),
            createdAt: item.createdAt ? item.createdAt : serverTimestamp()
          })

          await setDoc(doc(db, col.colName, id), payload, { merge: true })
          addedInCol++
          uploadedCount++
          setProgress(Math.round((uploadedCount / totalItems) * 100))

          // หน่วงเวลาเล็กน้อยเพื่อป้องกัน Firebase ทราฟฟิกหนาแน่นและอัปเดตหน้าจอทัน
          await new Promise(r => setTimeout(r, 15))
        }

        addLog(`เสร็จสิ้นคอลเลกชัน ${col.label}: อัปโหลดสำเร็จ ${addedInCol} รายการ, ข้าม ${skippedInCol} รายการ`)
      }

      addLog("🎉 อัปโหลดข้อมูลทุกคอลเลกชันเข้าสู่ Firebase สำเร็จสมบูรณ์แล้ว!")
      notifySuccess("อัปโหลดข้อมูลเข้า Firebase สำเร็จทั้งหมดแล้ว!")
    } catch (err) {
      console.error("Seeding error:", err)
      addLog(`❌ เกิดข้อผิดพลาดร้ายแรง: ${err.message}`)
      notifyError(`อัปโหลดล้มเหลว: ${err.message}`)
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 24 }}>
      <div>
        <h2 style={{ marginBottom: 16 }}>ตั้งค่าเว็บไซต์</h2>
        {loading && <p style={{ marginBottom: 12 }}>กำลังโหลดข้อมูล...</p>}
        {error && <p style={{ marginBottom: 12, color: "#e05555" }}>โหลดข้อมูลจาก Firestore ไม่สำเร็จ กำลังแสดงข้อมูลตั้งต้น</p>}

        <div className="card" style={{ padding: 24, display: "grid", gap: 16 }}>
          <Field label="ชื่อเว็บไซต์">
            <input value={form.name || ""} onChange={e => set("name", e.target.value)} />
          </Field>
          <Field label="ชื่อภาษาอาหรับ">
            <input value={form.nameAr || ""} onChange={e => set("nameAr", e.target.value)} />
          </Field>
          <Field label="สโลแกน">
            <input value={form.tagline || ""} onChange={e => set("tagline", e.target.value)} />
          </Field>
          <Field label="คำอธิบายเว็บไซต์">
            <textarea rows={3} value={form.desc || ""} onChange={e => set("desc", e.target.value)} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Location">
              <input value={form.location || ""} onChange={e => set("location", e.target.value)} />
            </Field>
            <Field label="Founded">
              <input value={form.founded || ""} onChange={e => set("founded", e.target.value)} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Facebook URL">
              <input value={form.facebook || ""} onChange={e => set("facebook", e.target.value)} />
            </Field>
            <Field label="YouTube URL">
              <input value={form.youtube || ""} onChange={e => set("youtube", e.target.value)} />
            </Field>
            <Field label="Spotify URL">
              <input value={form.spotify || ""} onChange={e => set("spotify", e.target.value)} />
            </Field>
            <Field label="Instagram URL">
              <input value={form.instagram || ""} onChange={e => set("instagram", e.target.value)} />
            </Field>
            <Field label="TikTok URL">
              <input value={form.tiktok || ""} onChange={e => set("tiktok", e.target.value)} />
            </Field>
          </div>

          <Field label="อายะห์ภาษาอาหรับ">
            <textarea rows={2} value={form.ayahAr || ""} onChange={e => set("ayahAr", e.target.value)} />
          </Field>
          <Field label="คำแปลอายะห์">
            <textarea rows={2} value={form.ayahTh || ""} onChange={e => set("ayahTh", e.target.value)} />
          </Field>
          <Field label="อ้างอิงอายะห์">
            <input value={form.ayahRef || ""} onChange={e => set("ayahRef", e.target.value)} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="จำนวนผู้ติดตาม">
              <input value={form.followers || ""} onChange={e => set("followers", e.target.value)} />
            </Field>
            <Field label="ป้ายผู้ติดตาม">
              <input value={form.followersLabel || ""} onChange={e => set("followersLabel", e.target.value)} />
            </Field>
          </div>

          <button className="btn btn-teal" onClick={save} disabled={busy} style={{ justifySelf: "start", marginTop: 10 }}>
            <i className={`ti ${busy ? "ti-loader-2" : "ti-check"}`} style={{ marginRight: 6 }}></i>
            {busy ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </button>
        </div>
      </div>

      {/* Database Seeder Card */}
      <div className="card" style={{ padding: 24, border: "1px solid var(--br2)", display: "grid", gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 18, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-database-share" style={{ color: "var(--teal)" }}></i>
            นำเข้าและอัปโหลดข้อมูลขึ้น Firebase (Database Migration & Seeding)
          </h3>
          <p style={{ fontSize: 13, color: "var(--t3)", marginTop: 4 }}>
            ใช้สำหรับอัปโหลดบทความ หนังสือ และวารสารทั้งหมดที่อยู่ในไฟล์โค้ด ขึ้นไปเก็บไว้บนระบบฐานข้อมูล Firebase Firestore
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, backgroundColor: "var(--bg)", padding: 16, borderRadius: 8 }}>
          <StatBox label="บทความในไฟล์" count={ARTICLES.length} icon="ti-file-text" color="#2c7be5" />
          <StatBox label="หนังสือ/PDF ในไฟล์" count={BOOKS.length} icon="ti-books" color="#e28743" />
          <StatBox label="มีเดียในไฟล์" count={MEDIA.length} icon="ti-player-play" color="#e63b60" />
          <StatBox label="นักวิชาการในไฟล์" count={SCHOLARS.length} icon="ti-users" color="#00d27a" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text)" }}>
            <input type="checkbox" checked={forceOverwrite} onChange={e => setForceOverwrite(e.target.checked)} disabled={seeding} />
            <span>โหมดเขียนทับข้อมูลทั้งหมด (Force Overwrite) ⚠️ <span style={{ color: "var(--t3)" }}>(หากติ๊ก ระบบจะเขียนทับทุกรายการใน Firebase ด้วยข้อมูลชุดใหม่ทั้งหมด)</span></span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-teal" onClick={runSeeding} disabled={seeding}>
            <i className={`ti ${seeding ? "ti-loader-2 spin" : "ti-upload"}`} style={{ marginRight: 6 }}></i>
            {seeding ? "กำลังอัปโหลดข้อมูล..." : "เริ่มทำการอัปโหลดข้อมูลเข้า Firebase"}
          </button>
        </div>

        {seeding && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>ความคืบหน้าการอัปโหลด</span>
              <strong>{progress}%</strong>
            </div>
            <div style={{ height: 8, width: "100%", backgroundColor: "var(--br2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, backgroundColor: "var(--teal)", transition: "width 0.2s" }}></div>
            </div>
          </div>
        )}

        {statusLog.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t2)" }}>สถานะการอัปโหลดล่าสุด:</span>
            <div style={{
              marginTop: 6,
              height: 150,
              backgroundColor: "var(--bg)",
              border: "1px solid var(--br2)",
              borderRadius: 6,
              padding: 10,
              fontFamily: "monospace",
              fontSize: 12,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              color: "var(--text)"
            }}>
              {statusLog.map((log, idx) => (
                <div key={idx} style={{ marginBottom: 4 }}>{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, count, icon, color }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", color }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18 }}></i>
      </div>
      <div>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{count}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500, marginBottom: 6, display: "block" }}>{label}</span>
      {children}
    </label>
  )
}