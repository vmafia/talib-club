# Talib Club — เว็บไซต์วิชาการอิสลาม

เว็บไซต์รวบรวมบทความวิชาการอิสลาม หนังสือ/วารสาร (PDF) แหล่งรวมวิดีโอ/พอดแคสต์ และทำเนียบประวัติอุลามาอ์ จัดทำโดย Talib Publisher เพื่อให้ความรู้อิสลามเข้าถึงง่าย อ่านสบายตา และมีความทันสมัย

## โครงสร้างโปรเจกต์ (Tech Stack)
- **Frontend:** React 18 + Vite
- **Routing:** React Router DOM
- **Database & Auth:** Firebase (Firestore + Authentication)
- **Styling:** CSS Variables (Dark/Light theme) + Tabler Icons
- **Deployment:** Vercel

## โครงสร้างโฟลเดอร์หลัก

```
talib-club/
├── src/
│   ├── components/         ← UI Components (Nav, Card, Button ฯลฯ)
│   ├── data/               ← Fallback Data (ใช้เมื่อโหลด Firebase ไม่ได้)
│   ├── hooks/              ← Custom Hooks (useTheme, useAuth, useContentCollection)
│   ├── lib/                ← ตั้งค่าและระบบหลังบ้าน (Firebase, Cache)
│   ├── pages/              ← หน้าเพจต่างๆ แบ่งหมวดหมู่
│   │   ├── admin/          ← ระบบหลังบ้าน (Dashboard, จัดการบทความ, ตั้งค่า)
│   │   └── ...             ← หน้าเว็บฝั่งผู้ใช้งาน (Home, Articles, Library ฯลฯ)
│   ├── styles/             ← CSS หลักของโปรเจกต์
│   ├── App.jsx             ← ตั้งค่า Route และ Context หลัก
│   └── main.jsx            ← Entry Point
│
├── public/                 ← Static files
├── index.html
├── vite.config.js
└── package.json
```

## วิธีการรันโปรเจกต์ (Development)

1. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```
2. รันเซิร์ฟเวอร์จำลอง:
   ```bash
   npm run dev
   ```
   เว็บไซต์จะเปิดใช้งานที่ `http://localhost:5173`

3. Build สำหรับนำไป Deploy:
   ```bash
   npm run build
   ```

## การจัดการข้อมูล (Admin Dashboard)

ปัจจุบันโปรเจกต์ได้เชื่อมต่อกับ **Firebase Firestore** เพื่อทำหน้าที่เป็นฐานข้อมูล (CMS) คุณไม่ต้องแก้โค้ดเพื่ออัปเดตข้อมูลอีกต่อไป
1. สมัครสมาชิก / ล็อกอินผ่านหน้าเว็บ
2. หากบัญชีของคุณมีสิทธิ์เป็น `owner`, `admin`, หรือ `staff` จะสามารถเข้าถึงเมนู **"ระบบหลังบ้าน"** (Admin Dashboard) ได้
3. ในระบบหลังบ้าน คุณสามารถ:
   - เพิ่ม/แก้ไข/ลบ บทความ, หนังสือ, มีเดีย, และรายนามอุลามาอ์
   - ดูสถิติผู้เข้าชมเว็บไซต์แบบ Real-time
   - อัปโหลดรูปภาพเข้าสู่ระบบ Storage
   - จัดการข้อมูลหมวดหมู่ (Taxonomy) และเนื้อหาหน้าเว็บไซต์ (Site Settings)

## การ Deploy บน Vercel

เว็บไซต์นี้ตั้งค่าให้รองรับการ Deploy ผ่าน **Vercel** โดยอัตโนมัติ:
1. เชื่อมต่อ Repository นี้กับ Vercel Dashboard
2. เมื่อมีการ Push โค้ดขึ้น Branch `main` ระบบจะทำการ Build และ Deploy ให้ทันที
3. ตรวจสอบให้แน่ใจว่าได้ตั้งค่า Environment Variables (`.env`) ของ Firebase ไว้ใน Vercel ครบถ้วน เพื่อให้ระบบสามารถดึงข้อมูลได้

## Roadmap สถานะปัจจุบัน
- [x] **Phase 1:** ระบบนำเสนอเนื้อหา (บทความ, ห้องสมุด, มีเดีย, อุลามาอ์)
- [x] **Phase 2:** ระบบ Login + ระบบสมาชิก (Firebase Auth)
- [x] **Phase 2.5:** ระบบ Admin Dashboard สำหรับจัดการเนื้อหาทั้งหมด (CMS)
- [x] **Phase 3:** ระบบสถิติผู้เข้าชมและ Reading Sessions
- [ ] **Phase 4:** AI Quiz และระบบ Reading Streak (กำลังดำเนินการ)

