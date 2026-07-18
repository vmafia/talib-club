// src/utils/streak.js
import { safeDateNow } from "./time.js"

export function getMs(value) {
  if (!value) return 0
  if (typeof value.toDate === "function") return value.toDate().getTime()
  // M5: Use strict check — value.seconds === 0 is valid (epoch)
  if (value.seconds !== undefined && value.nanoseconds !== undefined) return value.seconds * 1000
  if (typeof value === "number") return value
  const parsed = Date.parse(value)
  return isNaN(parsed) ? 0 : parsed
}

export function getLocalDayKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const ms = getMs(value)
  if (!ms) return ""
  const date = new Date(ms)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return formatter.format(date)
}

export function addDaysToKey(dayKey, amount) {
  const date = new Date(`${dayKey}T00:00:00+07:00`)
  date.setDate(date.getDate() + amount)
  return getLocalDayKey(date.getTime())
}

export function todayKey() {
  return getLocalDayKey(safeDateNow())
}

export function calculateReadingStreak(values, protections = []) {
  const days = new Set(values.map(getLocalDayKey).filter(Boolean))
  const protectedByDay = new Map(
    protections
      .map(item => ({
        ...item,
        date: item.date || item.dayKey || getLocalDayKey(item.createdAt || item.usedAt),
      }))
      .filter(item => item.date)
      .map(item => [item.date, item])
  )
  const coveredDays = new Set([...days, ...protectedByDay.keys()])
  const sorted = [...coveredDays].sort()
  let best = 0
  let run = 0
  let prevTime = 0

  sorted.forEach(day => {
    const currentTime = new Date(`${day}T00:00:00+07:00`).getTime()
    run = prevTime && currentTime - prevTime === 86400000 ? run + 1 : 1
    best = Math.max(best, run)
    prevTime = currentTime
  })

  let current = 0
  const today = todayKey()
  const yesterday = addDaysToKey(today, -1)
  const startDay = coveredDays.has(today) ? today : coveredDays.has(yesterday) ? yesterday : ""

  if (startDay) {
    const cursor = new Date(`${startDay}T00:00:00+07:00`)
    while (coveredDays.has(getLocalDayKey(cursor.getTime()))) {
      current += 1
      cursor.setDate(cursor.getDate() - 1)
    }
  }

  return {
    current,
    best,
    totalDays: days.size,
    protectedTotal: protectedByDay.size,
    todayKey: today,
    todayVerified: days.has(today),
    todayProtected: protectedByDay.get(today) || null,
    coveredDays,
  }
}
