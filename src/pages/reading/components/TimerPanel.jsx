import React from "react"

export default function TimerPanel({
  seconds,
  displayTimer,
  startPage,
  setStartPage,
  endPage,
  setEndPage,
  reflection,
  setReflection,
  saving,
  saveReadingProgress,
  MIN_VERIFIED_SECONDS,
  MIN_REFLECTION_CHARS,
  onOpenBook
}) {
  return (
    <div className="card reader-form-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", height: "100%" }}>
      <h3 style={{ fontSize: 14, borderBottom: "1.5px solid var(--br2)", paddingBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <i className="ti ti-notebook" style={{ color: "var(--teal)" }}></i> บันทึกผลการอ่าน
      </h3>

      {/* Instruction/Warning Note */}
      <div style={{
        background: "rgba(224, 85, 85, 0.08)",
        border: "1px solid rgba(224, 85, 85, 0.25)",
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 11,
        color: "#e05555",
        lineHeight: 1.6
      }}>
        <i className="ti ti-alert-triangle" style={{ marginRight: 6 }}></i>
        <strong>โปรดทราบ:</strong> คุณต้องสะสมเวลาให้ครบ {Math.round(MIN_VERIFIED_SECONDS / 60)} นาทีขึ้นไป, ระบุเลขหน้าให้ถูกต้อง และบันทึกข้อคิดอย่างน้อย {MIN_REFLECTION_CHARS} ตัวอักษร จึงจะสามารถกดบันทึกความคืบหน้าได้ หากคุณกด "ออก" ก่อนกดบันทึก เวลาและสถิติทั้งหมดในรอบนี้จะสูญหายทันที
      </div>
      
      {onOpenBook && (
        <button 
          onClick={onOpenBook} 
          className="mobile-only-btn btn btn-outline"
          style={{ width: "100%", padding: "12px 0", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "2px solid var(--teal)", color: "var(--teal)", fontWeight: 600, background: "var(--teal-bg)", borderRadius: 10 }}
        >
          <i className="ti ti-book-open" style={{ fontSize: 16 }}></i> 📖 เปิดหน้าหนังสือเพื่อเริ่มอ่าน
        </button>
      )}

      {/* Dynamic Checklist HUD */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--bg2)",
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--br2)",
        fontSize: 12
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 }}>เกณฑ์การยืนยันเซสชัน</span>

        <div style={{ display: "flex", alignItems: "center", gap: 8, color: seconds >= MIN_VERIFIED_SECONDS ? "var(--teal)" : "var(--t3)", transition: "color 0.2s" }}>
          <i className={`ti ${seconds >= MIN_VERIFIED_SECONDS ? "ti-circle-check" : "ti-circle"}`} style={{ fontSize: 14, color: seconds >= MIN_VERIFIED_SECONDS ? "var(--teal)" : "var(--t3)" }}></i>
          <span>เวลาอ่านอย่างน้อย {Math.round(MIN_VERIFIED_SECONDS / 60)} นาที (ขณะนี้: {displayTimer})</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, color: (endPage && Number(endPage) >= Number(startPage)) ? "var(--teal)" : "var(--t3)", transition: "color 0.2s" }}>
          <i className={`ti ${(endPage && Number(endPage) >= Number(startPage)) ? "ti-circle-check" : "ti-circle"}`} style={{ fontSize: 14, color: (endPage && Number(endPage) >= Number(startPage)) ? "var(--teal)" : "var(--t3)" }}></i>
          <span>ระบุหน้าที่อ่านถึง (หน้า {startPage} ถึง {endPage || "?"})</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, color: reflection.trim().length >= MIN_REFLECTION_CHARS ? "var(--teal)" : "var(--t3)", transition: "color 0.2s" }}>
          <i className={`ti ${reflection.trim().length >= MIN_REFLECTION_CHARS ? "ti-circle-check" : "ti-circle"}`} style={{ fontSize: 14, color: reflection.trim().length >= MIN_REFLECTION_CHARS ? "var(--teal)" : "var(--t3)" }}></i>
          <span>บันทึกข้อคิด {MIN_REFLECTION_CHARS} ตัวอักษรขึ้นไป ({reflection.trim().length}/{MIN_REFLECTION_CHARS})</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--t2)" }}>หน้าเริ่มต้น *</span>
          <input
            type="number"
            value={startPage}
            onChange={e => setStartPage(e.target.value)}
            style={{ fontSize: 13, padding: "8px 10px" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--t2)" }}>อ่านถึงหน้า *</span>
          <input
            type="number"
            placeholder="เช่น 12"
            value={endPage}
            onChange={e => setEndPage(e.target.value)}
            style={{ fontSize: 13, padding: "8px 10px" }}
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--t2)" }}>บันทึกข้อคิดที่ได้รับ (สั้นๆ) *</span>
          <span style={{ fontSize: 10, color: reflection.length >= MIN_REFLECTION_CHARS ? "var(--teal)" : "#e05555" }}>
            {reflection.length}/{MIN_REFLECTION_CHARS} อักษร
          </span>
        </div>
        <textarea
          value={reflection}
          onChange={e => setReflection(e.target.value)}
          rows={5}
          placeholder="วันนี้ได้ข้อคิดสะกิดใจเรื่องอะไรบ้างจากการอ่านหัวข้อนี้? พิมพ์ข้อเขียนสั้นๆ (อย่างน้อย 20 ตัวอักษรเพื่อรับสถิติยืนยัน)"
          style={{ fontSize: 12, padding: 10, lineHeight: 1.5 }}
        />
      </label>

      <button
        onClick={saveReadingProgress}
        disabled={saving || seconds < MIN_VERIFIED_SECONDS || reflection.length < MIN_REFLECTION_CHARS || !endPage || Number(endPage) < Number(startPage)}
        className="btn btn-teal"
        style={{ width: "100%", marginTop: "auto", padding: "10px 0", fontSize: 13 }}
      >
        {saving ? "กำลังบันทึก..." : "บันทึกความคืบหน้า"}
      </button>
    </div>
  )
}
