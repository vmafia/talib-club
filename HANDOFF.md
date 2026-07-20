# Talib Club — Handoff Document
# สำหรับส่งต่อให้ AI ตัวอื่น (Gemini / Claude / GPT)

## Context
เว็บไซต์วิชาการอิสลามของ "Talib Club" จาก Pattani, Thailand
- Facebook: https://www.facebook.com/TalibPublisher
- Deploy: Vercel (เชื่อมกับ GitHub repo: vmafia/talib-club)

---

## Tech Stack & Core Architecture
- **Frontend**: React 18 + Vite
- **Routing**: React Router DOM (มีระบบ Private Route สำหรับ Admin/Staff)
- **Database & Auth**: Firebase Firestore + Firebase Authentication
- **Styling**: CSS Variables (dark/light theme), Prompt font (Google Fonts)
- **Icons**: Tabler Icons (CDN)
- **State Management & Caching**: Custom cache management ใน `src/lib/contentStore/cache.js`

---

## โครงสร้างไฟล์ที่สำคัญในปัจจุบัน

```
src/
├── App.jsx              — routing หลักด้วย React Router (Home, Login, Admin ฯลฯ)
├── styles/global.css    — CSS variables dark/light + global styles
├── hooks/
│   ├── useTheme.js      — dark/light mode + localStorage
│   ├── useAuth.js       — ระบบ Login, ตรวจสอบบทบาท (Staff/Admin)
│   └── useTaxonomySettings.js — โหลดหมวดหมู่จาก Firebase
│
├── lib/
│   ├── firebase.js      — ตั้งค่าเชื่อมต่อ Firebase
│   └── contentStore/    — Data Access Layer หลัก (อ่าน/เขียน/ลบ ข้อมูลใน Firestore + Local Cache)
│
├── data/                — Fallback Data (ใช้เผื่อกรณีเน็ตหลุด หรือ Firebase มีปัญหา)
│
├── components/
│   ├── Nav.jsx          — sticky navbar + theme toggle + login button
│   └── ui/index.js      — Tag, Card, Pills, SearchInput, Empty, BackBtn, SecHeader
│
└── pages/
    ├── admin/           — ระบบหลังบ้าน CMS (Dashboard, Articles, Media, Scholars, Settings)
    ├── Home.jsx         — hero, ayah, stats, preview sections
    ├── Articles.jsx     — หน้าอ่านบทความ
    ├── Library.jsx      — ห้องสมุด PDF
    ├── Media.jsx        — YouTube embed + Spotify
    └── Scholars.jsx     — ทำเนียบอุลามาอ์
```

## กระบวนการดึงข้อมูล (Content Store)
เว็บไซต์ใช้สถาปัตยกรรมดึงข้อมูลแบบ Hybrid:
1. เช็ค Local Storage Cache
2. หากไม่มี ให้ดึงจาก Firebase (Real-time updates)
3. หาก Firebase โหลดไม่ขึ้น ให้ใช้ข้อมูลจากไฟล์ `src/data/*` แทน (Fallback)

## ระบบ Authentication และ Authorization
- มีบทบาท 3 ระดับ: `owner`, `admin`, `staff` (รวมเรียกว่า isStaff = true)
- จัดการความปลอดภัยผ่าน `firestore.rules` (ผู้ใช้ทั่วไปอ่านได้อย่างเดียว, staff เขียน/ลบได้)
- การอัปเดตข้อมูลใช้ฟังก์ชันใน `src/lib/contentStore/hooks.js` (เช่น `saveItem`, `deleteItem`)

