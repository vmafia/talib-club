# แผนข้อ 9 — Rich Text (จัดรูปแบบต่อบรรทัด) สำหรับสมุดโน้ต

> สถานะ: **วางแผน — ยังไม่เขียนโค้ด** · เอกสารนี้กันแผนหายข้ามเครื่อง

## ปัญหา (ข้อ 9)
จัดรูปแบบเฉพาะบางบรรทัดในกล่องข้อความเดียวไม่ได้ (เช่น บรรทัด 1–2 เป็น bullet/ตัวหนา แต่บรรทัด 3 ธรรมดา) เพราะ format เป็น **ระดับกล่อง** ทั้งใบ

## โครงปัจจุบัน (อ้างอิงโค้ด)
- โมเดล: แต่ละหน้า `page.texts[]`; แต่ละกล่อง `{ id, text:"บรรทัด\nบรรทัด", x, y, color, size, fontFamily, bold, italic, underline, strikethrough, align, list, width }` — **format ทุกตัวเป็นของทั้งกล่อง**
- Render: Konva `<Text>` ใบเดียวต่อกล่อง + `applyListPrefix(t.text, t.list)` เติม `•`/`n.` ทุกบรรทัด (`ProNotebook.jsx` ~3869), `geometry.js:applyListPrefix`
- แก้ไข: `TextEditor.jsx` — `<textarea>` เดียว + overlay gutter bullet ทุกบรรทัด
- Export: render Konva stage → รูป/PDF (ถ้า canvas render ถูก export จะถูกตามอัตโนมัติ)
- เซฟ: spread `{...t}` ลง Firestore

## ขอบเขตที่เลือก: **ต่อบรรทัด (line-level)** ไม่ใช่ต่อตัวอักษร
โจทย์พูดถึง "บรรทัด" → ทำระดับบรรทัดพอ ครอบคลุมความต้องการ และเสี่ยงน้อยกว่าการทำ inline span ต่อตัวอักษรมาก (ซึ่งต้องใช้ contentEditable + เลย์เอาต์หลาย Text node/อักขระ และ Konva render inline ผสมไม่ได้ในโหนดเดียว) — เก็บ inline-span ไว้เป็นงานอนาคต

## โมเดลใหม่
```
t = {
  id, x, y, width,
  fontFamily, size, color,          // ค่าระดับกล่อง (default ร่วม)
  lines: [
    { text, bold, italic, underline, strikethrough, list, align },
    ...
  ]
}
```
- ต่อบรรทัด: `bold/italic/underline/strikethrough/list/align`
- ระดับกล่อง (คงเดิม): `fontFamily/size/color` (ต่อบรรทัดของสามตัวนี้ = งานอนาคต)

## Migration (สำคัญ — ห้ามทำโน้ตเก่าพัง)
`migrateText(t)`: ถ้าเจอ `t.text` (แบบเก่า) → split `\n` เป็น `lines[]` โดยแต่ละบรรทัดสืบทอด `bold/italic/underline/strikethrough/list/align` จากค่ากล่องเดิม รันตอนโหลดจาก Firestore และกันเหนียวตอน render ทุกจุดที่อ่าน `t.text`

## งานที่ต้องแก้ (แยกเฟสให้ ship ได้ระหว่างทาง)

### เฟส 1 — โมเดล + Migration + Render ต่อบรรทัด (เอดิเตอร์ยังเป็นระดับกล่อง) — ✅ เสร็จ
- ✅ helpers ใน `geometry.js`: `migrateText`, `textOf`, `isUniformText`, `uniformFormatOf`, `listPrefixes`, `makeLine` (มี unit test 13 เคส ครอบ parity กล่องเก่า)
- ✅ Render (`ProNotebook.jsx` ~3868): กล่อง uniform → `<Text>` ใบเดียวเหมือนเดิมเป๊ะ (fast path); กล่อง mixed → `<Text>` ต่อบรรทัด (เลข list เดินต่อ, skip บรรทัดว่าง)
- **หมายเหตุ:** เฟส 1 ทำ migration แบบ **render-time** (ไม่แตะ storage/editor/creation) → โน้ตเก่า render เหมือนเดิม 100% และ path ต่อบรรทัดยัง dormant จนกว่าเฟส 2 จะสร้างข้อมูล mixed
- **ยกไปเฟส 2:** storage migration ตอนโหลด (จำเป็นเมื่อเอดิเตอร์เขียน `lines[]`) + ปรับ bounds ต่อบรรทัด (~1718, ~2230) เมื่อมีกล่อง mixed จริง

### เฟส 3 — WYSIWYG (เห็นผลระหว่างพิมพ์) — ✅ เสร็จ
- **ปัญหาที่ผู้ใช้เจอจริง:** textarea แสดงตัวหนา/บุลเล็ตระหว่างพิมพ์ไม่ได้ เห็นผลตอน commit เท่านั้น → "ระบบข้อความแย่สุด"
- **ทางแก้:** เปลี่ยน `TextEditor.jsx` เป็น **contentEditable** โดยแต่ละบรรทัดเป็น `<div class="pn-ln">` ที่ถือ format ของตัวเองใน `data-fmt` + inline style → ตัวหนา/เอียง/ขีดเส้น/จัดชิด/บุลเล็ต เห็นทันทีขณะพิมพ์
- **กัน IME ไทยพัง 2 ข้อ:** (1) DOM เป็นเจ้าของเนื้อหา React ไม่เขียนทับเลยหลัง mount (2) ระหว่าง composition ไม่แตะ DOM เลย รอ `compositionend`
- **ผลพลอยได้:** format ติดไปกับ "ตัวบรรทัด" ไม่ใช่ index → กด Enter กลางย่อหน้าแล้ว format ไม่เลื่อนอีกต่อไป (บั๊กที่ค้างจากเฟส 2)
- **เพิ่ม:** ปุ่มขีดฆ่า, ปรับขนาดฟอนต์ +/−, เลือกสีข้อความ ในแถบเดียวกัน
- **ระยะบรรทัด:** ตั้ง `LINE_HEIGHT = 1.2` ใน `theme.js` ใช้ร่วมกันทั้งเอดิเตอร์และ Konva (เดิม canvas ใช้ 1.0 → ข้อความขยับตอนกดเสร็จ + สระ/วรรณยุกต์ไทยชนกัน)
- **เทสแล้ว:** บนเบราว์เซอร์จริง — พิมพ์, Enter ต่อบุลเล็ต, Enter กลางบรรทัด, จัด format เฉพาะบรรทัด, เลือกทั้งหมดแล้วลบ; **ยังต้องเทสพิมพ์ไทยด้วย IME บนแท็บเล็ต Huawei**

### เฟส 2 — เอดิเตอร์ต่อบรรทัด — ✅ เสร็จ (ต่อมาแทนที่ด้วยเฟส 3)
- **ตัดสินใจ:** คง`<textarea>`ไว้ (ภาษาไทย/IME เสถียรกว่า contentEditable มาก โดยเฉพาะบน Huawei) + ระบบ format ต่อบรรทัดคู่ขนาน — ไม่เอา contentEditable เพราะเสี่ยง IME พังตามที่โน้ตเตือน
- **`TextEditor.jsx`:** พิมพ์ใน textarea ตามปกติ → วางเคอร์เซอร์/เลือกบรรทัด → ปุ่ม B/I/U/list/align มีผลเฉพาะบรรทัดที่ selection คลุม; แปลง offset→บรรทัดด้วย `lineRange`, คงจำนวน format ให้ตรงบรรทัดด้วย `reconcile` (บรรทัดใหม่สืบทอด format บรรทัดสุดท้าย = Enter ต่อ bullet ได้); gutter โชว์ bullet/เลขต่อบรรทัด; emit `lines[]` ขึ้น ProNotebook ทุกการเปลี่ยน (unit test 13 เคส)
- **`ProNotebook.jsx`:** wiring ใหม่ `onLinesChange` → เขียน `txt.lines` (canonical) + `txt.text` sync; กล่องเก่าที่ถูกแก้จะ migrate เป็น `lines[]` อัตโนมัติ (storage migrate แบบ lazy-on-edit ไม่ต้องแตะ load path)
- **ข้อจำกัดที่รู้ตัว:** textarea โชว์ตัวหนา/เอียง "ตอนพิมพ์" ไม่ได้ (เห็นผลจริงบน canvas ตอน commit); แทรกบรรทัดกลางหลังจัด format แล้ว format อาจเลื่อน 1 บรรทัด (index-based reconcile) — WYSIWYG ระหว่างพิมพ์เก็บเป็น enhancement อนาคต
- **ต้องเทสจริง:** พิมพ์ภาษาไทย + จัด format เฉพาะบรรทัดบนแท็บเล็ต (ผมเทสได้แค่ build/boot + unit test ตรรกะ)

## ความเสี่ยง & ข้อควรระวัง
- Migration ผิด = โน้ตเก่าเสีย → เขียนเทสเคสแปลงเก่า→ใหม่ก่อน
- lineHeight เอดิเตอร์กับ canvas ต้องตรงกัน ไม่งั้นข้อความเหลื่อม
- contentEditable + ภาษาไทย/IME เป็นจุดพังบ่อย ต้องทดสอบจริง
- undo/redo เดิมทำงานบน snapshot ของ page — โมเดลใหม่ต้องเข้ากับกลไกนี้

## ประเมิน
- เฟส 1: กลาง (contained)
- เฟส 2: ใหญ่/เสี่ยง (เอดิเตอร์)
- รวม = "งานใหญ่สุด" ตามที่โน้ตเดิมบอก — ควร ship เป็น 2 เฟส
