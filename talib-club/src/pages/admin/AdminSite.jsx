import { useEffect, useState } from "react"
import toast from 'react-hot-toast'

// Mock Data และ Mock Hook สำหรับการพรีวิวใน Canvas
const SITE_MOCK = {
  name: "Talib Club",
  tagline: "Academic Islamic Studies",
  desc: "คลังความรู้อิสลามวิชาการ สำหรับมุสลิมและผู้สนใจทุกท่าน",
  social: { facebook: "", youtube: "", spotify: "" },
  ayah: { ar: "", th: "", ref: "" }
}

const useSiteSettings = (defaultSite) => {
  const [site, setSite] = useState(defaultSite || SITE_MOCK)
  return {
    site,
    loading: false,
    error: null,
    saveSiteSettings: async (data) => {
      // จำลองเวลาในการบันทึกข้อมูล
      return new Promise((resolve) => setTimeout(() => {
        setSite(data)
        resolve()
      }, 1000))
    }
  }
}

function flattenSite(site) {
  return {
    ...site,
    facebook: site.social?.facebook || "",
    youtube: site.social?.youtube || "",
    spotify: site.social?.spotify || "",
    ayahAr: site.ayah?.ar || "",
    ayahTh: site.ayah?.th || "",
    ayahRef: site.ayah?.ref || "",
  }
}

function expandSite(form) {
  return {
    name: form.name || "",
    tagline: form.tagline || "",
    desc: form.desc || "",
    social: {
      facebook: form.facebook || "",
      youtube: form.youtube || "",
      spotify: form.spotify || "",
    },
    ayah: {
      ar: form.ayahAr || "",
      th: form.ayahTh || "",
      ref: form.ayahRef || "",
    }
  }
}

export default function AdminSite() {
  const { site, loading, error, saveSiteSettings } = useSiteSettings(SITE_MOCK)
  const [form, setForm] = useState(() => flattenSite(site || {}))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (site) {
      setForm(flattenSite(site))
    }
  }, [site])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  async function save() {
    setBusy(true)
    try {
      const dataToSave = expandSite(form)
      await saveSiteSettings(dataToSave)
      toast.success("บันทึกการตั้งค่าเว็บไซต์เรียบร้อยแล้ว!")
    } catch (err) {
      console.error(err)
      toast.error("บันทึกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์การเข้าถึง")
    }
    setBusy(false)
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 16 }}>ตั้งค่าเว็บไซต์</h2>
      
      <div className="card" style={{ padding: 24, display: "grid", gap: 16 }}>
        <Field label="ชื่อเว็บไซต์">
          <input value={form.name || ""} onChange={e => set("name", e.target.value)} />
        </Field>
        <Field label="สโลแกน (Tagline)">
          <input value={form.tagline || ""} onChange={e => set("tagline", e.target.value)} />
        </Field>
        <Field label="คำอธิบายเว็บไซต์">
          <textarea rows={3} value={form.desc || ""} onChange={e => set("desc", e.target.value)} />
        </Field>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Facebook URL">
            <input value={form.facebook || ""} onChange={e => set("facebook", e.target.value)} />
          </Field>
          <Field label="YouTube URL">
            <input value={form.youtube || ""} onChange={e => set("youtube", e.target.value)} />
          </Field>
          <Field label="Spotify URL">
            <input value={form.spotify || ""} onChange={e => set("spotify", e.target.value)} />
          </Field>
        </div>

        <Field label="อายะฮ์ภาษาอาหรับ">
          <textarea rows={2} value={form.ayahAr || ""} onChange={e => set("ayahAr", e.target.value)} />
        </Field>
        <Field label="คำแปลอายะฮ์">
          <textarea rows={2} value={form.ayahTh || ""} onChange={e => set("ayahTh", e.target.value)} />
        </Field>
        <Field label="อ้างอิงอายะฮ์">
          <input value={form.ayahRef || ""} onChange={e => set("ayahRef", e.target.value)} />
        </Field>

        <button 
          className="btn btn-teal" 
          onClick={save} 
          disabled={busy} 
          style={{ justifySelf: "start", marginTop: 10 }}
        >
          <i className={`ti ${busy ? "ti-loader spin" : "ti-check"}`} style={{ marginRight: 6 }}></i>
          {busy ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
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
