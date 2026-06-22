// ============================================================
//  Utility functions ใช้ทั่วทั้งแอพ
// ============================================================

// แปลงวันที่ "2568-04-10" → "10 เม.ย. 2568"
export function formatDate(d) {
  if (!d) return ""
  if (typeof d !== "string" || !d.includes("-")) return String(d)
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
  const [y, m, day] = d.split("-").map(Number)
  if (isNaN(y) || isNaN(m) || isNaN(day)) return String(d)
  return `${day} ${months[m - 1] || ""} ${y}`.trim()
}

// ตัด text ให้ไม่เกิน n ตัวอักษร
export function truncate(str, n = 80) {
  if (!str) return ""
  return str.length > n ? str.slice(0, n) + "…" : str
}
