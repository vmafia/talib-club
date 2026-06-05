// src/components/dashboard/dashboardUtils.js

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
]

export const CATEGORY_MAP = {
  aqeedah: "อากีดะฮ์",
  fiqh: "ฟิกฮ์",
  seerah: "ซีเราะฮ์",
  hadith: "ฮะดีษ",
  social: "สังคมศาสตร์",
  tafsir: "ตัฟซีร"
}

export const TYPE_MAP = {
  series: "ซีรีส์",
  general: "บทความทั่วไป",
  specific: "บทความเฉพาะเรื่อง",
  social: "สังคมศาสตร์"
}

export function getArticleMonthString(dateStr) {
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

export function getSavedMonthString(date) {
  if (!date || Number.isNaN(date.getTime())) return "ไม่ระบุเวลา"
  return `${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`
}

export function getTimeMs(value) {
  if (!value) return 0
  if (typeof value.toDate === "function") return value.toDate().getTime()
  if (value.seconds) return value.seconds * 1000
  if (typeof value === "number") return value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function getLocalDayKey(value) {
  const ms = getTimeMs(value)
  if (!ms) return ""
  const date = new Date(ms)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function getWeekKey(date) {
  const ms = getTimeMs(date || Date.now())
  const d = new Date(ms)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return getLocalDayKey(monday.getTime())
}

export function normalizeStreakSettings(settings, uid) {
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

export function initials(name, email) {
  const source = name && name !== "-" ? name : email
  return source.split(/\s|@/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "TC"
}

export function parseHistoryTargetId(historyItem) {
  const rawId = String(historyItem?.id || "")
  const match = rawId.match(/_(article|book|media)_(.+)$/)
  return match?.[2] || null
}

export function formEmailChanged(nextEmail, currentEmail) {
  return nextEmail?.trim().toLowerCase() !== currentEmail?.trim().toLowerCase()
}

export const fieldStyle = { display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "var(--t2)" }
