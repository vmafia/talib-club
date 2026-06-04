import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs, writeBatch, doc, updateDoc, deleteDoc, Timestamp, query, where, or } from "firebase/firestore";
import { trackingDb as db } from "../lib/trackingFirebase.js";
import { canAccessTrackingAdmin, verifyTrackingAdminPassword } from "../utils/trackingAuth.js";

const TRACKING_AUTH_KEY = "talib_tracking_admin_v2";

export default function Tracking({ authState }) {
  // --- View & Routing State ---
  const [view, setView] = useState("home"); 
  const [adminTab, setAdminTab] = useState(1);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [secretClicks, setSecretClicks] = useState(0);

  // --- Custom Dialog State ---
  const [dialogConfig, setDialogConfig] = useState(null);

  // --- Public State ---
  const [userQuery, setUserQuery] = useState("");
  const [userSearchResult, setUserSearchResult] = useState(null);

  // --- Admin Data State ---
  const [recipients, setRecipients] = useState([]); // สำหรับ Tab 2
  const [records, setRecords] = useState([]);       // สำหรับ Tab 4
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [searchQ, setSearchQ] = useState("");

  // --- Modals State ---
  const [activeModal, setActiveModal] = useState(null); // 'edit-recipient', 'edit-record', 'label'
  const [editData, setEditData] = useState({});
  const [labelSettings, setLabelSettings] = useState({ name: "สมาคม Talib Club", phone: "", addr: "", size: "therm-150x100" });

  // Load PapaParse script
  useEffect(() => {
    if (!window.Papa) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js";
      document.head.appendChild(script);
    }
    if (canAccessTrackingAdmin(authState) || localStorage.getItem(TRACKING_AUTH_KEY) === "staff") {
      setIsAdminAuthenticated(true);
      setView("admin-dashboard");
    }
  }, [authState?.isStaff]);

  useEffect(() => {
    if (canAccessTrackingAdmin(authState)) {
      setIsAdminAuthenticated(true);
      localStorage.setItem(TRACKING_AUTH_KEY, "staff");
    }
  }, [authState?.isStaff]);


  // Fetch Data when tabs change
  useEffect(() => {
    if (!isAdminAuthenticated) return;
    if (adminTab === 2) fetchRecipients();
    if (adminTab === 4) fetchRecords();
  }, [adminTab, isAdminAuthenticated]);

  // ==========================================
  // ★ CUSTOM DIALOG MANAGER (แทนที่ window.alert/confirm)
  // ==========================================
  const showDialog = (options) => {
    return new Promise((resolve) => {
      setDialogConfig({
        ...options,
        onConfirm: (val) => { setDialogConfig(null); resolve({ isConfirmed: true, value: val }); },
        onCancel: () => { setDialogConfig(null); resolve({ isConfirmed: false }); }
      });
    });
  };

  const myAlert = async (msg, title = "แจ้งเตือน") => {
    await showDialog({ type: 'alert', title, message: msg });
  };

  const myConfirm = async (msg, title = "ยืนยันการดำเนินการ") => {
    const res = await showDialog({ type: 'confirm', title, message: msg });
    return res.isConfirmed;
  };

  const myPrompt = async (msg, title = "ระบุข้อมูล") => {
    const res = await showDialog({ type: 'prompt', title, message: msg });
    return res.isConfirmed ? res.value : null;
  };

  // ==========================================
  // ★ FIREBASE FETCHING
  // ==========================================
  const sortDataLikeCSV = (data) => {
    return data.sort((a, b) => {
      const tA = a.createdAt?.toMillis() || 0;
      const tB = b.createdAt?.toMillis() || 0;
      // ถ้าข้อมูลถูกสร้างพร้อมกันในเวลาใกล้กัน (ต่างกันไม่เกิน 2 วินาที) ให้เรียงตาม csvIndex แบบที่อยู่ในไฟล์
      if (Math.abs(tA - tB) < 2000) {
        return (a.csvIndex || 0) - (b.csvIndex || 0);
      }
      // เรียงล็อตใหม่ไว้บนสุด
      return tB - tA;
    });
  };

  const fetchRecipients = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, "recipients"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecipients(sortDataLikeCSV(items));
      setSelectedRecipients([]);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, "records"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecords(sortDataLikeCSV(items));
      setSelectedRecords([]);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  // ==========================================
  // ★ PUBLIC SEARCH (หน้าบ้านผู้ใช้)
  // ==========================================
  const handleSecretClick = () => {
    const newCount = secretClicks + 1;
    setSecretClicks(newCount);
    if (newCount >= 3) {
      setView(isAdminAuthenticated ? "admin-dashboard" : "admin-login");
      setSecretClicks(0);
    }
    setTimeout(() => setSecretClicks(0), 1500);
  };

  const handlePublicSearch = async (e, mode) => {
    e.preventDefault();
    const rawQuery = userQuery.trim();
    if (!rawQuery) return;
    setIsLoading(true);
    setUserSearchResult(null);
    try {
      const targetCol = mode === "recipient" ? "recipients" : "records";
      const qClean = rawQuery;
      const qPhone = rawQuery.replace(/[-\s]/g, ""); // digits only
      const qTrack = rawQuery.replace(/\s/g, "").toUpperCase();

      let q;
      if (mode === "recipient") {
        q = query(
          collection(db, "recipients"),
          or(
            where("fullName", "==", qClean),
            where("phone", "==", qPhone)
          )
        );
      } else {
        q = query(
          collection(db, "records"),
          or(
            where("fullName", "==", qClean),
            where("phone", "==", qPhone),
            where("trackingNumber", "==", qTrack)
          )
        );
      }

      const snap = await getDocs(q);
      const found = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUserSearchResult(found.length > 0 ? found : "NOT_FOUND");
    } catch (err) {
      console.error("Public search error:", err);
      setUserSearchResult("NOT_FOUND");
    }
    setIsLoading(false);
  };

  // ==========================================
  // ★ TAB 1 & 3: CSV UPLOADING
  // ==========================================
  const handleCSVUpload = (e, targetCollection) => {
    const f = e.target.files[0];
    if (!f || !window.Papa) return;
    
    setIsLoading(true);
    window.Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        try {
          const now = Timestamp.now();
          const rows = [];

          res.data.forEach((row, idx) => {
            const getVal = (keys) => {
              for (const k of Object.keys(row)) {
                if (keys.some(key => k.replace(/\s/g,'').toLowerCase().includes(key))) return row[k];
              }
              return "";
            };

            const fullName = getVal(['ชื่อ', 'name']);
            if (!fullName) return;

            const dataObj = {
              fullName: fullName.trim(),
              phone: String(getVal(['เบอร์', 'phone']) || "").replace(/[-\s]/g, ''),
              address: String(getVal(['ที่อยู่', 'address']) || "").trim(),
              postalCode: String(getVal(['รหัสไปรษณีย์', 'zip']) || "").trim() || (String(getVal(['ที่อยู่', 'address']) || "").match(/\b\d{5}\b/)?.[0] || ""),
              bonusNote: String(getVal(['โบนัส', 'พิเศษ', 'bonus']) || "").trim(),
              csvIndex: idx,
              createdAt: now
            };

            if (targetCollection === "records") {
              dataObj.trackingNumber = String(getVal(['เลข', 'tracking', 'track']) || "").replace(/\s/g, '').toUpperCase();
              dataObj.city = String(getVal(['เมือง', 'จังหวัด', 'city']) || "").trim() || "";
            }

            rows.push(dataObj);
          });

          const BATCH_LIMIT = 450;
          for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            for (const dataObj of rows.slice(i, i + BATCH_LIMIT)) {
              batch.set(doc(collection(db, targetCollection)), dataObj);
            }
            await batch.commit();
          }

          const count = rows.length;
          if (count > 0) {
            await myAlert(`บันทึกข้อมูลสำเร็จ ${count} รายการเข้าสู่ระบบ`, "สำเร็จ");
            if (targetCollection === "recipients") setAdminTab(2);
            else setAdminTab(4);
          } else {
            await myAlert("ไม่พบข้อมูลที่ถูกต้องในไฟล์ CSV\n\nโปรดตรวจสอบให้แน่ใจว่าในไฟล์มีคอลัมน์ 'ชื่อ' หรือ 'name'");
          }
        } catch (err) {
          console.error(err);
          await myAlert("เกิดข้อผิดพลาดในการบันทึกฐานข้อมูล", "ข้อผิดพลาด");
        }
        setIsLoading(false);
        e.target.value = ""; // reset input
      }
    });
  };

  // ==========================================
  // ★ BULK ACTIONS (โบนัส, ลบ, Export)
  // ==========================================
  const handleBulkDelete = async (collectionName, selectedIds, clearAll = false) => {
    let idsToDelete = clearAll ? (collectionName === "recipients" ? recipients : records).map(r => r.id) : selectedIds;
    if (idsToDelete.length === 0) {
      await myAlert("กรุณาเลือกรายการที่ต้องการลบ");
      return;
    }
    
    const isConfirmed = await myConfirm(`ยืนยันการลบข้อมูลจำนวน ${idsToDelete.length} รายการใช่หรือไม่?`);
    if (!isConfirmed) return;

    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      idsToDelete.forEach(id => {
        batch.delete(doc(db, collectionName, id));
      });
      await batch.commit();
      await myAlert("ลบข้อมูลออกจากระบบสำเร็จ", "สำเร็จ");
      if (collectionName === "recipients") fetchRecipients();
      else fetchRecords();
    } catch (e) { 
      console.error(e); 
      await myAlert("เกิดข้อผิดพลาดในการลบข้อมูล", "ข้อผิดพลาด"); 
    }
    setIsLoading(false);
  };

  const handleBulkBonus = async (collectionName, selectedIds) => {
    if (selectedIds.length === 0) {
      await myAlert("กรุณาเลือกรายการที่ต้องการเพิ่มโบนัส");
      return;
    }
    
    const note = await myPrompt("ระบุข้อความโบนัส/หมายเหตุพิเศษ ที่ต้องการเพิ่มให้กับรายชื่อที่เลือก:");
    if (note === null) return;

    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.update(doc(db, collectionName, id), { bonusNote: note.trim() });
      });
      await batch.commit();
      await myAlert(`เพิ่มโบนัสสำเร็จจำนวน ${selectedIds.length} รายการ`, "สำเร็จ");
      if (collectionName === "recipients") fetchRecipients();
      else fetchRecords();
    } catch (e) { 
      console.error(e); 
      await myAlert("เกิดข้อผิดพลาดในการเพิ่มโบนัส", "ข้อผิดพลาด"); 
    }
    setIsLoading(false);
  };

  const exportCSV = async (data, isRecords) => {
    if (!data.length) {
      await myAlert("ไม่มีข้อมูลให้ Export", "แจ้งเตือน");
      return;
    }
    const bom = "\uFEFF";
    let csvContent = "";
    
    if (isRecords) {
      csvContent = "ชื่อ-นามสกุล,เบอร์โทร,เลข Tracking,รหัสไปรษณีย์,เมือง,วันที่บันทึก,โบนัสพิเศษ\n" + 
        data.map(r => `"${r.fullName}","${r.phone}","${r.trackingNumber}","${r.postalCode}","${r.city}","${r.createdAt?.toDate().toLocaleDateString('th-TH')}","${r.bonusNote||''}"`).join("\n");
    } else {
      csvContent = "ชื่อ-นามสกุล,เบอร์โทร,ที่อยู่ / รหัสไปรษณีย์,โบนัสพิเศษ\n" + 
        data.map(r => `"${r.fullName}","${r.phone}","${r.address} ${r.postalCode}","${r.bonusNote||''}"`).join("\n");
    }

    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = isRecords ? "tracking_records.csv" : "recipients_list.csv";
    link.click();
  };

  // ==========================================
  // ★ SINGLE ROW EDITING
  // ==========================================
  const saveEdit = async () => {
    setIsLoading(true);
    try {
      const collectionName = activeModal === 'edit-recipient' ? "recipients" : "records";
      const { id, ...patch } = editData
      await updateDoc(doc(db, collectionName, id), patch);
      setActiveModal(null);
      if (collectionName === "recipients") fetchRecipients();
      else fetchRecords();
    } catch (e) { 
      console.error(e); 
      await myAlert("เกิดข้อผิดพลาด บันทึกไม่สำเร็จ", "ข้อผิดพลาด"); 
    }
    setIsLoading(false);
  };

  // ==========================================
  // ★ LABEL PRINTER
  // ==========================================
  const printLabels = async () => {
    const listToPrint = recipients.filter(r => selectedRecipients.length === 0 || selectedRecipients.includes(r.id));
    if (listToPrint.length === 0) {
      await myAlert("ไม่มีรายชื่อให้พิมพ์ กรุณาลงรายชื่อเตรียมจัดส่งก่อน");
      return;
    }
    
    const { name: sName, phone: sPhone, addr: sAddr, size } = labelSettings;
    const cssMap = {
      'therm-150x100': `@page{size:150mm 100mm;margin:0}body{margin:0;width:150mm;font-family:'Prompt',sans-serif;}.plabel{width:150mm;height:99mm;box-sizing:border-box;padding:4mm;page-break-after:always;display:flex;flex-direction:column}.l-inner{border:2px solid #000;flex:1;display:flex;flex-direction:column;padding:3mm;border-radius:4px}.l-sender{padding-bottom:3mm;border-bottom:1px dashed #000;font-size:11pt;line-height:1.4}.l-recv{flex:1;padding:4mm 2mm}.l-recv-name{font-size:24pt;font-weight:700;line-height:1.2;margin-bottom:2mm}.l-recv-phone{font-size:16pt;font-weight:600;margin-bottom:2mm}.l-recv-addr{font-size:14pt;line-height:1.5}.l-foot{display:flex;border-top:1px solid #000;height:22mm;align-items:center}.l-note{flex:1;font-size:14pt;font-weight:600;padding-left:2mm;color:#b45309}.l-zip{font-size:36pt;font-weight:700;letter-spacing:2px;padding-right:2mm}`,
      'therm-100x150': `@page{size:100mm 150mm;margin:0}body{margin:0;width:100mm;font-family:'Prompt',sans-serif;}.plabel{width:100mm;height:149mm;box-sizing:border-box;padding:2mm;page-break-after:always;display:flex;flex-direction:column}.l-inner{border:2px solid #000;flex:1;display:flex;flex-direction:column;padding:3mm;border-radius:4px}.l-sender{padding-bottom:3mm;border-bottom:1px dashed #000;font-size:10pt;line-height:1.4}.l-recv{flex:1;padding:4mm 2mm}.l-recv-name{font-size:20pt;font-weight:700;line-height:1.2;margin-bottom:2mm}.l-recv-phone{font-size:14pt;font-weight:600;margin-bottom:2mm}.l-recv-addr{font-size:13pt;line-height:1.5}.l-foot{display:flex;border-top:1px solid #000;height:24mm;align-items:center}.l-note{flex:1;font-size:12pt;font-weight:600;padding-left:2mm;color:#b45309}.l-zip{font-size:32pt;font-weight:700;letter-spacing:1px;padding-right:2mm}`
    };

    const labelsHtml = listToPrint.map(r => `
      <div class="plabel"><div class="l-inner">
        <div class="l-sender"><strong>ผู้ส่ง: ${sName}</strong> ${sPhone ? `📞 ${sPhone}` : ''}<br/>${sAddr}</div>
        <div class="l-recv">
          <div style="font-size:10pt;font-weight:700;margin-bottom:4px">ผู้รับ:</div>
          <div class="l-recv-name">${r.fullName}</div>
          ${r.phone ? `<div class="l-recv-phone">📞 ${r.phone}</div>` : ''}
          <div class="l-recv-addr">${r.address}</div>
        </div>
        <div class="l-foot">
          <div class="l-note">${r.bonusNote ? `⚠️ ${r.bonusNote}` : ''}</div>
          <div class="l-zip">${r.postalCode || ''}</div>
        </div>
      </div></div>
    `).join('');

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<html><head><link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700&display=swap" rel="stylesheet"><style>${cssMap[size] || cssMap['therm-150x100']}</style></head><body>${labelsHtml}</body></html>`);
    doc.close();
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1000); }, 500);
  };

  // ==========================================
  // ★ RENDER HELPERS
  // ==========================================
  const formatDateTime = (ts) => {
    if (!ts || !ts.toDate) return "-";
    return ts.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const filteredRecipients = recipients.filter(r => searchQ === "" || r.fullName.includes(searchQ) || (r.phone||"").includes(searchQ));
  const filteredRecords = records.filter(r => searchQ === "" || r.fullName.includes(searchQ) || (r.trackingNumber||"").includes(searchQ) || (r.phone||"").includes(searchQ));

  return (
    <div className="tracking-wrapper animate-fade-in" style={{ color: "var(--text)" }}>
      
      {/* --------------------------------------------------------- */}
      {/* 🏠 VIEW: HOME (PUBLIC) */}
      {/* --------------------------------------------------------- */}
      {view === "home" && (
        <div style={{ textAlign: "center", padding: "60px 16px" }}>
          {/* Secret Trigger 📮 Click 3 times fast */}
          <div onClick={handleSecretClick} style={{ fontSize: "64px", marginBottom: "16px", cursor: "pointer", display: "inline-block", userSelect: "none", transition: "transform 0.1s" }} className="hover:scale-110">
            📮
          </div>
          <h1 style={{ fontSize: "36px", fontWeight: "700", marginBottom: "12px" }}>Talib Club Logistics</h1>
          <p style={{ color: "var(--t2)", marginBottom: "48px", fontSize: "15px" }}>ระบบตรวจสอบสิทธิ์รายชื่อจองหนังสือ และติดตามสถานะพัสดุ</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", maxWidth: "700px", margin: "0 auto" }}>
            <div className="card hover:border-teal-500" style={{ padding: "40px 24px", cursor: "pointer", borderTop: "4px solid var(--teal)", transition: "all 0.3s" }} onClick={() => { setView("user-recipient"); setUserQuery(""); setUserSearchResult(null); }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📝</div>
              <h2 style={{ color: "var(--teal)", marginBottom: "8px", fontSize: "20px", fontWeight: "600" }}>ตรวจสอบรายชื่อ</h2>
              <p style={{ fontSize: "13px", color: "var(--t2)" }}>เช็คความถูกต้องและยืนยันสิทธิ์รับวารสารรอบล่าสุด (ก่อนทำการจัดส่ง)</p>
            </div>
            <div className="card" style={{ padding: "40px 24px", cursor: "pointer", borderTop: "4px solid #d97706", transition: "all 0.3s" }} onClick={() => { setView("user-track"); setUserQuery(""); setUserSearchResult(null); }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
              <h2 style={{ color: "var(--text)", marginBottom: "8px", fontSize: "20px", fontWeight: "600" }}>ตรวจสอบเลข Track</h2>
              <p style={{ fontSize: "13px", color: "var(--t2)" }}>ค้นหารหัสไปรษณีย์และเลขพัสดุสำหรับกล่องที่ดำเนินการส่งออกไปแล้ว</p>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* 🔍 VIEW: PUBLIC SEARCH RESULTS */}
      {/* --------------------------------------------------------- */}
      {(view === "user-recipient" || view === "user-track") && (
        <div style={{ maxWidth: "700px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
            <button className="btn btn-outline btn-sm" onClick={() => setView("home")}>← กลับหน้าหลัก</button>
            <span className="badge badge-teal" style={{ fontSize: "12px" }}>{view === "user-recipient" ? "ระบบเตรียมจัดส่ง" : "ระบบติดตามพัสดุ"}</span>
          </div>

          <h1 style={{ fontSize: "28px", marginBottom: "24px", fontWeight: "600" }}>
            {view === "user-recipient" ? "ตรวจสอบรายชื่อรับวารสาร" : "ติดตามเลขพัสดุจัดส่ง"}
          </h1>

          <div className="card" style={{ padding: "24px", marginBottom: "32px" }}>
            <form onSubmit={(e) => handlePublicSearch(e, view === "user-recipient" ? "recipient" : "track")} style={{ display: "flex", gap: "12px", flexDirection: "column", sm: { flexDirection: "row"} }}>
              <label style={{ fontSize: "13px", color: "var(--t2)", fontWeight: "500" }}>ค้นหาด้วย ชื่อ-นามสกุล หรือ เบอร์โทรศัพท์</label>
              <div style={{ display: "flex", gap: "12px" }}>
                <input type="text" className="inp" placeholder="พิมพ์ข้อมูลที่นี่..." value={userQuery} onChange={(e) => setUserQuery(e.target.value)} style={{ flex: 1, padding: "12px 16px" }} />
                <button type="submit" className="btn btn-teal" disabled={isLoading} style={{ padding: "0 24px" }}>{isLoading ? "⏳" : "ค้นหา"}</button>
              </div>
            </form>
          </div>

          {userSearchResult === "NOT_FOUND" && (
            <div className="empty card" style={{ border: "1px dashed var(--br)", padding: "48px 24px" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📭</div>
              <p style={{ color: "var(--text)", fontWeight: "500", fontSize: "16px" }}>ไม่พบข้อมูลสำหรับ "{userQuery}"</p>
            </div>
          )}

          {Array.isArray(userSearchResult) && userSearchResult.map((item, idx) => (
             <div key={idx} className="card animate-fade-in" style={{ padding: "0", overflow: "hidden", marginBottom: "20px" }}>
               <div style={{ background: "var(--teal-bg)", padding: "16px 24px", borderBottom: "1px solid var(--br2)" }}>
                 <h3 style={{ color: "var(--teal)", margin: 0, fontSize: "16px" }}>ข้อมูลพัสดุ / สิทธิ์รับวารสาร</h3>
               </div>
               <div style={{ padding: "24px", display: "grid", gap: "16px" }}>
                 <div>
                    <div style={{ color: "var(--t2)", fontSize: "12px", marginBottom: "4px" }}>ชื่อผู้รับ</div>
                    <div style={{ fontSize: "18px", fontWeight: "600" }}>{item.fullName}</div>
                 </div>
                 {item.phone && (
                   <div><div style={{ color: "var(--t2)", fontSize: "12px", marginBottom: "4px" }}>เบอร์โทรศัพท์</div><div style={{ fontSize: "15px" }}>{item.phone}</div></div>
                 )}
                 {item.trackingNumber ? (
                   <div style={{ marginTop: "8px", paddingTop: "16px", borderTop: "1px dashed var(--br2)" }}>
                     <div style={{ color: "var(--t2)", fontSize: "12px", marginBottom: "8px" }}>เลข Tracking</div>
                     <div style={{ background: "var(--bg)", padding: "16px", borderRadius: "8px", border: "1px solid var(--br2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontFamily: "monospace", fontSize: "22px", fontWeight: "700", color: "var(--teal)" }}>{item.trackingNumber}</span>
                       <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard.writeText(item.trackingNumber)}>คัดลอก</button>
                     </div>
                   </div>
                 ) : (
                   <div style={{ marginTop: "8px", padding: "16px", background: "var(--acc2)", borderRadius: "8px", color: "var(--teal)", fontSize: "14px", fontWeight: "500", display: "flex", gap: "8px", alignItems: "center" }}>
                     <span>✅</span> ท่านมีรายชื่ออยู่ในคลังระบบเตรียมการจัดส่งแล้ว
                   </div>
                 )}
                 {item.bonusNote && (
                   <div style={{ background: "#fef3c7", color: "#92400e", padding: "12px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", display: "flex", gap: "8px", alignItems: "center" }}>
                     <span>🎁</span> {item.bonusNote}
                   </div>
                 )}
               </div>
             </div>
          ))}
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* 🔐 VIEW: ADMIN LOGIN */}
      {/* --------------------------------------------------------- */}
      {view === "admin-login" && (
        <div style={{ maxWidth: "400px", margin: "80px auto" }}>
          <div className="card" style={{ padding: "32px", textAlign: "center", borderTop: "4px solid var(--teal)" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>🔐</div>
            <h1 style={{ fontSize: "24px", marginBottom: "8px", fontWeight: "600", color: "var(--teal)" }}>Admin Dashboard</h1>
            <p style={{ color: "var(--t2)", fontSize: "13px", marginBottom: "24px" }}>จัดการข้อมูลแบบครบวงจร</p>
            <input type="password" className="inp" placeholder="Password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} style={{ marginBottom: "16px", textAlign: "center" }} />
            <button className="btn btn-main style-full" style={{ width: "100%", background: "var(--teal)", color: "white" }} onClick={async () => {
              if (canAccessTrackingAdmin(authState)) {
                setIsAdminAuthenticated(true);
                localStorage.setItem(TRACKING_AUTH_KEY, "staff");
                setView("admin-dashboard");
              } else if (verifyTrackingAdminPassword(adminPassword)) {
                setIsAdminAuthenticated(true);
                localStorage.setItem(TRACKING_AUTH_KEY, "password");
                setView("admin-dashboard");
              } else if (!import.meta.env.VITE_TRACKING_ADMIN_PASSWORD) {
                await myAlert("กรุณาเข้าสู่ระบบ เฉพาะสตาฟเท่านั้น");
              } else {
                await myAlert("รหัสผ่านไม่ถูกต้อง");
              }
            }}>เข้าสู่ระบบ</button>
            {canAccessTrackingAdmin(authState) && (
              <p style={{ fontSize: 11, color: "var(--teal)", marginTop: 12 }}>บัญชีสตาฟที่ล็อกอินอยู่สามารถเข้าแอดมินได้โดยไม่ต้องใส่รหัส</p>
            )}
            <button className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: "12px", border: "none" }} onClick={() => setView("home")}>← กลับหน้าหลัก</button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* 🎛️ VIEW: ADMIN DASHBOARD (4 TABS) */}
      {/* --------------------------------------------------------- */}
      {view === "admin-dashboard" && isAdminAuthenticated && (
        <div style={{ maxWidth: "1200px", margin: "0 auto", background: "var(--bg)" }}>
          {/* Header Admin */}
          <div style={{ background: "var(--teal)", color: "white", padding: "16px 24px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
               <button onClick={() => setView("home")} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>← หน้าหลักผู้ใช้</button>
               <div>
                 <h1 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>Admin Dashboard</h1>
                 <p style={{ fontSize: "12px", opacity: 0.8, margin: 0 }}>จัดการข้อมูลแบบครบวงจร</p>
               </div>
            </div>
            <button onClick={() => { setIsAdminAuthenticated(false); localStorage.removeItem(TRACKING_AUTH_KEY); localStorage.removeItem("talib_admin_auth"); setView("home"); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "white", padding: "6px 16px", borderRadius: "20px", cursor: "pointer", fontSize: "13px" }}>ออกจากระบบแอดมิน</button>
          </div>

          {/* Admin Tabs */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid var(--br)", paddingBottom: "0", marginBottom: "24px", overflowX: "auto", whiteSpace: "nowrap" }}>
            {[
              { id: 1, icon: "📥", label: "1. ลงรายชื่อ (CSV)" },
              { id: 2, icon: "📝", label: "2. จัดการรายชื่อ" },
              { id: 3, icon: "📦", label: "3. ลงเลขพัสดุ (CSV)" },
              { id: 4, icon: "🗂️", label: "4. ข้อมูล Tracking" }
            ].map(t => (
              <button key={t.id} onClick={() => { setAdminTab(t.id); setSearchQ(""); }} className="btn" 
                style={{ 
                  borderRadius: "8px 8px 0 0", 
                  background: adminTab === t.id ? "var(--card)" : "transparent", 
                  color: adminTab === t.id ? "var(--teal)" : "var(--t2)",
                  border: adminTab === t.id ? "1px solid var(--br)" : "none",
                  borderBottom: adminTab === t.id ? "2px solid var(--teal)" : "none",
                  fontWeight: adminTab === t.id ? "700" : "500",
                  padding: "12px 20px"
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* --- TAB 1: UPLOAD RECIPIENTS --- */}
          {adminTab === 1 && (
            <div className="card" style={{ padding: "40px 32px" }}>
               <h3 style={{ fontSize: "18px", marginBottom: "8px", color: "var(--teal)" }}>📥 ลงรายชื่อเตรียมจัดส่ง</h3>
               <p style={{ fontSize: "13px", color: "var(--teal)", background: "var(--teal-bg)", padding: "10px 16px", borderRadius: "6px", marginBottom: "24px" }}>
                 💡 <strong>ขั้นตอนนี้:</strong> อัปโหลดไฟล์ CSV ที่มีคอลัมน์ (ชื่อ, เบอร์โทร, ที่อยู่, รหัสไปรษณีย์) เพื่อประกาศให้ผู้รับตรวจสอบสิทธิ์ก่อนจัดส่ง
               </p>
               
               <div style={{ border: "2px dashed var(--br)", borderRadius: "12px", padding: "60px 24px", textAlign: "center", background: "var(--bg2)", cursor: "pointer", transition: "all 0.2s" }} onClick={() => document.getElementById('csv-prep').click()}>
                 <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
                 <div style={{ fontWeight: "700", color: "var(--teal)", fontSize: "16px", marginBottom: "8px" }}>คลิกเพื่อเลือกไฟล์ Google Sheet (CSV)</div>
                 <div style={{ fontSize: "13px", color: "var(--t2)" }}>Google Sheet → File → Download → CSV</div>
                 <input id="csv-prep" type="file" accept=".csv" className="hidden" style={{ display: 'none' }} onChange={(e) => handleCSVUpload(e, "recipients")} />
               </div>
               
               {isLoading && <div style={{ textAlign: "center", marginTop: "24px", color: "var(--teal)", fontWeight: "600" }}>⏳ กำลังบันทึกข้อมูลเข้าฐานข้อมูล...</div>}
            </div>
          )}

          {/* --- TAB 2: MANAGE RECIPIENTS --- */}
          {adminTab === 2 && (
            <div className="card" style={{ padding: "24px", borderRadius: "12px", border: "1px solid var(--br)" }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ fontSize: "20px" }}>📝</div>
                    <div>
                      <h3 style={{ fontSize: "16px", margin: 0, color: "var(--teal)", fontWeight: "700" }}>รายชื่อผู้ได้รับวารสารในระบบ</h3>
                    </div>
                  </div>
               </div>

               {/* Toolbar */}
               <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px", background: "var(--bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--br2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "250px" }}>
                    <input type="text" className="inp" placeholder="🔍 ค้นหาชื่อ / เบอร์..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button className="btn" style={{ background: "var(--teal)", color: "white" }} onClick={() => setActiveModal('label')}>🏷️ สร้าง/พิมพ์ลาเบล</button>
                    <button className="btn btn-outline" onClick={() => exportCSV(recipients, false)}>📥 Export CSV</button>
                    <button className="btn btn-outline" style={{ color: "#d97706", borderColor: "#fcd34d", background: "#fffbeb" }} onClick={() => handleBulkBonus("recipients", selectedRecipients)}>🎁 โบนัสที่เลือก</button>
                    <button className="btn btn-outline" style={{ color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }} onClick={() => handleBulkDelete("recipients", selectedRecipients)}>🗑️ ลบที่เลือก</button>
                    <button className="btn" style={{ background: "#dc2626", color: "white" }} onClick={() => handleBulkDelete("recipients", [], true)}>🗑️ ล้างทั้งหมด</button>
                  </div>
               </div>

               <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--teal)", marginBottom: "12px" }}>{filteredRecipients.length} รายชื่อเตรียมจัดส่ง</div>

               <div style={{ overflowX: "auto", border: "1px solid var(--br)", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                 <table style={{ width: "100%", fontSize: "13px", textAlign: "left", borderCollapse: "collapse" }}>
                   <thead style={{ background: "var(--teal)", color: "white", borderBottom: "2px solid rgba(0,0,0,0.15)" }}>
                     <tr>
                       <th style={{ padding: "12px", width: "40px", textAlign: "center" }}>
                         <input type="checkbox" checked={selectedRecipients.length === filteredRecipients.length && filteredRecipients.length > 0} onChange={(e) => setSelectedRecipients(e.target.checked ? filteredRecipients.map(r => r.id) : [])} style={{ accentColor: "var(--teal)", cursor: "pointer", width: "16px", height: "16px" }} />
                       </th>
                       <th style={{ padding: "12px", width: "40px" }}>#</th>
                       <th style={{ padding: "12px" }}>ชื่อ-นามสกุล</th>
                       <th style={{ padding: "12px" }}>เบอร์โทร</th>
                       <th style={{ padding: "12px" }}>ที่อยู่ / รหัสไปรษณีย์</th>
                       <th style={{ padding: "12px", color: "#fcd34d" }}>โบนัสพิเศษ</th>
                       <th style={{ padding: "12px", textAlign: "center" }}>จัดการ</th>
                     </tr>
                   </thead>
                   <tbody>
                     {isLoading ? <tr><td colSpan="7" style={{ textAlign: "center", padding: "32px", color: "var(--t3)" }}>⏳ กำลังโหลดข้อมูล...</td></tr> : 
                      filteredRecipients.length === 0 ? <tr><td colSpan="7" style={{ textAlign: "center", padding: "32px", color: "var(--t3)" }}>📭 ไม่มีข้อมูล</td></tr> :
                      filteredRecipients.map((r, i) => (
                       <tr key={r.id} style={{ borderBottom: "1px solid var(--br2)", background: i % 2 === 0 ? "var(--card)" : "var(--bg2)" }}>
                         <td style={{ padding: "12px", textAlign: "center" }}>
                           <input type="checkbox" checked={selectedRecipients.includes(r.id)} onChange={(e) => setSelectedRecipients(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))} style={{ accentColor: "var(--teal)", cursor: "pointer", width: "16px", height: "16px" }} />
                         </td>
                         <td style={{ padding: "12px", color: "var(--t2)" }}>{i + 1}</td>
                         <td style={{ padding: "12px", fontWeight: "600", color: "var(--teal)" }}>{r.fullName}</td>
                         <td style={{ padding: "12px", color: "var(--t2)" }}>{r.phone || "-"}</td>
                         <td style={{ padding: "12px", color: "var(--t2)", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${r.address} ${r.postalCode}`}>{r.address} {r.postalCode}</td>
                         <td style={{ padding: "12px", color: "#d97706", fontWeight: "600", fontSize: "12px" }}>{r.bonusNote || ""}</td>
                         <td style={{ padding: "12px", textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                           <button className="btn btn-outline btn-sm" style={{ padding: "4px 8px", borderColor: "var(--br)", color: "var(--t2)" }} onClick={() => { setEditData(r); setActiveModal('edit-recipient'); }}>✏️</button>
                           <button className="btn btn-outline btn-sm" style={{ padding: "4px 8px", borderColor: "#fecaca", color: "#dc2626", background: "#fef2f2" }} onClick={() => handleBulkDelete("recipients", [r.id])}>🗑️</button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* --- TAB 3: UPLOAD TRACKING --- */}
          {adminTab === 3 && (
            <div className="card" style={{ padding: "40px 32px" }}>
               <h3 style={{ fontSize: "18px", marginBottom: "8px", color: "var(--teal)" }}>📦 ลงเลขพัสดุ Tracking ที่จัดส่งแล้ว</h3>
               <p style={{ fontSize: "13px", color: "var(--teal)", background: "var(--teal-bg)", padding: "10px 16px", borderRadius: "6px", marginBottom: "24px" }}>
                 💡 <strong>ขั้นตอนนี้:</strong> อัปโหลดไฟล์ CSV ที่มีคอลัมน์ (ชื่อ, เบอร์โทร, เลข Tracking, รหัสไปรษณีย์, เมือง) ผู้ใช้จะสามารถนำเลขพัสดุไปติดตามในเว็บไปรษณีย์ได้
               </p>
               
               <div style={{ border: "2px dashed var(--br)", borderRadius: "12px", padding: "60px 24px", textAlign: "center", background: "var(--bg2)", cursor: "pointer", transition: "all 0.2s" }} onClick={() => document.getElementById('csv-records').click()}>
                 <div style={{ fontSize: "48px", marginBottom: "16px" }}>📄</div>
                 <div style={{ fontWeight: "700", color: "var(--teal)", fontSize: "16px", marginBottom: "8px" }}>คลิกเพื่อเลือกไฟล์ Google Sheet (CSV)</div>
                 <div style={{ fontSize: "13px", color: "var(--t2)" }}>ให้แน่ใจว่าในไฟล์มีคอลัมน์ "เลข Tracking" หรือ "Tracking"</div>
                 <input id="csv-records" type="file" accept=".csv" className="hidden" style={{ display: 'none' }} onChange={(e) => handleCSVUpload(e, "records")} />
               </div>
               
               {isLoading && <div style={{ textAlign: "center", marginTop: "24px", color: "var(--teal)", fontWeight: "600" }}>⏳ กำลังบันทึกข้อมูลเข้าฐานข้อมูล...</div>}
            </div>
          )}

          {/* --- TAB 4: MANAGE RECORDS --- */}
          {adminTab === 4 && (
            <div className="card" style={{ padding: "24px", borderRadius: "12px", border: "1px solid var(--br)" }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ fontSize: "20px" }}>🗂️</div>
                    <div>
                      <h3 style={{ fontSize: "16px", margin: 0, color: "var(--teal)", fontWeight: "700" }}>ข้อมูล Tracking ในระบบ</h3>
                    </div>
                  </div>
               </div>

               {/* Toolbar */}
               <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px", background: "var(--bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--br2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "250px" }}>
                    <input type="text" className="inp" placeholder="🔍 ค้นหาชื่อ / เบอร์ / Track..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button className="btn btn-outline" onClick={() => exportCSV(records, true)}>📥 Export CSV</button>
                    <button className="btn btn-outline" style={{ color: "#d97706", borderColor: "#fcd34d", background: "#fffbeb" }} onClick={() => handleBulkBonus("records", selectedRecords)}>🎁 โบนัสที่เลือก</button>
                    <button className="btn btn-outline" style={{ color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }} onClick={() => handleBulkDelete("records", selectedRecords)}>🗑️ ลบที่เลือก</button>
                    <button className="btn" style={{ background: "#dc2626", color: "white" }} onClick={() => handleBulkDelete("records", [], true)}>🗑️ ล้างทั้งหมด</button>
                  </div>
               </div>

               <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--teal)", marginBottom: "12px" }}>{filteredRecords.length} รายการในระบบ</div>

               <div style={{ overflowX: "auto", border: "1px solid var(--br)", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <table style={{ width: "100%", fontSize: "13px", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead style={{ background: "var(--teal)", color: "white", borderBottom: "2px solid rgba(0,0,0,0.15)", whiteSpace: "nowrap" }}>
                      <tr>
                        <th style={{ padding: "12px", width: "40px", textAlign: "center" }}>
                          <input type="checkbox" checked={selectedRecords.length === filteredRecords.length && filteredRecords.length > 0} onChange={(e) => setSelectedRecords(e.target.checked ? filteredRecords.map(r => r.id) : [])} style={{ accentColor: "var(--teal)", cursor: "pointer", width: "16px", height: "16px" }} />
                        </th>
                        <th style={{ padding: "12px", width: "40px" }}>#</th>
                        <th style={{ padding: "12px" }}>ชื่อ-นามสกุล</th>
                        <th style={{ padding: "12px" }}>เบอร์โทร</th>
                        <th style={{ padding: "12px" }}>เลข Tracking</th>
                        <th style={{ padding: "12px" }}>รหัสไปรษณีย์</th>
                        <th style={{ padding: "12px" }}>เมือง</th>
                        <th style={{ padding: "12px" }}>บันทึก</th>
                        <th style={{ padding: "12px", textAlign: "center" }}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? <tr><td colSpan="9" style={{ textAlign: "center", padding: "32px", color: "var(--t3)" }}>⏳ กำลังโหลดข้อมูล...</td></tr> : 
                       filteredRecords.length === 0 ? <tr><td colSpan="9" style={{ textAlign: "center", padding: "32px", color: "var(--t3)" }}>📭 ไม่มีข้อมูล</td></tr> :
                       filteredRecords.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--br2)", background: i % 2 === 0 ? "var(--card)" : "var(--bg2)" }}>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <input type="checkbox" checked={selectedRecords.includes(r.id)} onChange={(e) => setSelectedRecords(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))} style={{ accentColor: "var(--teal)", cursor: "pointer", width: "16px", height: "16px" }} />
                          </td>
                          <td style={{ padding: "12px", color: "var(--t2)" }}>{i + 1}</td>
                          <td style={{ padding: "12px", fontWeight: "600", color: "var(--teal)" }}>
                            {r.fullName}
                            {r.bonusNote && <div style={{ fontSize: "11px", color: "#d97706", marginTop: "2px" }}>🎁 {r.bonusNote}</div>}
                          </td>
                          <td style={{ padding: "12px", color: "var(--t2)" }}>{r.phone || "-"}</td>
                          <td style={{ padding: "12px", fontFamily: "monospace", fontWeight: "700", color: "var(--teal)", letterSpacing: "0.5px" }}>{r.trackingNumber || "-"}</td>
                          <td style={{ padding: "12px", color: "var(--t2)" }}>{r.postalCode || "-"}</td>
                          <td style={{ padding: "12px", color: "var(--t2)" }}>{r.city || "-"}</td>
                          <td style={{ padding: "12px", color: "var(--t2)", fontSize: "12px" }}>{formatDateTime(r.createdAt)}</td>
                          <td style={{ padding: "12px", textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                            <button className="btn btn-outline btn-sm" style={{ padding: "4px 8px", borderColor: "var(--br)", color: "var(--t2)" }} onClick={() => { setEditData(r); setActiveModal('edit-record'); }}>✏️</button>
                            <button className="btn btn-outline btn-sm" style={{ padding: "4px 8px", borderColor: "#fecaca", color: "#dc2626", background: "#fef2f2" }} onClick={() => handleBulkDelete("records", [r.id])}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>
          )}

        </div>
      )}

      {/* ========================================================= */}
      {/* ✏️ MODAL: EDIT DATA */}
      {/* ========================================================= */}
      {(activeModal === 'edit-recipient' || activeModal === 'edit-record') && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div className="card animate-fade-in" style={{ width: "100%", maxWidth: "500px", padding: 0, borderRadius: "12px", overflow: "hidden" }}>
             <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--br)", background: "var(--teal)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
               <h3 style={{ fontSize: "16px", margin: 0, fontWeight: "600" }}>✏️ แก้ไขข้อมูล{activeModal === 'edit-record' ? " Tracking" : "รายชื่อ"}</h3>
               <button onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", fontSize: "18px", color: "white", cursor: "pointer", opacity: 0.7 }}>✕</button>
             </div>
             <div style={{ padding: "24px", display: "grid", gap: "16px", background: "var(--card)" }}>
               <div><label style={{ fontSize: "12px", fontWeight: "600", color: "var(--t2)" }}>ชื่อ-นามสกุล</label><input type="text" className="inp" value={editData.fullName} onChange={e => setEditData({...editData, fullName: e.target.value})} /></div>
               <div><label style={{ fontSize: "12px", fontWeight: "600", color: "var(--t2)" }}>เบอร์โทร</label><input type="text" className="inp" value={editData.phone} onChange={e => setEditData({...editData, phone: e.target.value})} /></div>
               
               {activeModal === 'edit-recipient' && (
                 <div><label style={{ fontSize: "12px", fontWeight: "600", color: "var(--t2)" }}>ที่อยู่จัดส่ง</label><textarea className="inp" rows="2" value={editData.address} onChange={e => setEditData({...editData, address: e.target.value})}></textarea></div>
               )}

               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                 <div><label style={{ fontSize: "12px", fontWeight: "600", color: "var(--t2)" }}>รหัสไปรษณีย์</label><input type="text" className="inp" value={editData.postalCode} onChange={e => setEditData({...editData, postalCode: e.target.value})} /></div>
                 {activeModal === 'edit-record' && (
                   <div><label style={{ fontSize: "12px", fontWeight: "600", color: "var(--t2)" }}>เมือง/จังหวัด</label><input type="text" className="inp" value={editData.city} onChange={e => setEditData({...editData, city: e.target.value})} /></div>
                 )}
               </div>

               {activeModal === 'edit-record' && (
                 <div><label style={{ fontSize: "12px", fontWeight: "600", color: "var(--t2)" }}>เลข Tracking</label><input type="text" className="inp" style={{ fontFamily: "monospace", fontWeight: "700", color: "var(--teal)" }} value={editData.trackingNumber} onChange={e => setEditData({...editData, trackingNumber: e.target.value})} /></div>
               )}

               <div><label style={{ fontSize: "12px", fontWeight: "600", color: "#d97706" }}>🎁 โบนัสพิเศษ</label><input type="text" className="inp" style={{ borderColor: "#fcd34d", background: "var(--teal-bg)" }} value={editData.bonusNote || ""} onChange={e => setEditData({...editData, bonusNote: e.target.value})} /></div>
             </div>
             <div style={{ padding: "16px 24px", background: "var(--bg)", borderTop: "1px solid var(--br)", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
               <button className="btn btn-outline" onClick={() => setActiveModal(null)}>ยกเลิก</button>
               <button className="btn" style={{ background: "var(--teal)", color: "white" }} onClick={saveEdit}>{isLoading ? "⏳ กำลังบันทึก..." : "💾 บันทึกการแก้ไข"}</button>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* 🏷️ MODAL: LABEL MANAGER */}
      {/* ========================================================= */}
      {activeModal === "label" && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div className="card animate-fade-in" style={{ width: "100%", maxWidth: "700px", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0, borderRadius: "12px", overflow: "hidden" }}>
             <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--br)", background: "var(--teal)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
               <h3 style={{ fontSize: "16px", margin: 0, fontWeight: "600" }}>🏷️ สร้างและพิมพ์ลาเบลจ่าหน้าซอง</h3>
               <button onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", fontSize: "18px", color: "white", cursor: "pointer", opacity: 0.7 }}>✕</button>
             </div>
             <div style={{ padding: "24px", overflowY: "auto", flex: 1, background: "var(--card)" }}>
               <div style={{ marginBottom: "24px", background: "var(--bg)", padding: "16px", borderRadius: "8px", border: "1px solid var(--br2)" }}>
                 <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "12px", color: "var(--teal)" }}>📮 ข้อมูลผู้ส่ง (Sender)</div>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                   <input type="text" className="inp" placeholder="ชื่อผู้ส่ง..." value={labelSettings.name} onChange={e => setLabelSettings({...labelSettings, name: e.target.value})} />
                   <input type="text" className="inp" placeholder="เบอร์โทรผู้ส่ง..." value={labelSettings.phone} onChange={e => setLabelSettings({...labelSettings, phone: e.target.value})} />
                 </div>
                 <textarea className="inp" placeholder="ที่อยู่ผู้ส่ง..." rows="2" value={labelSettings.addr} onChange={e => setLabelSettings({...labelSettings, addr: e.target.value})}></textarea>
               </div>
               
               <div style={{ background: "var(--bg)", padding: "16px", borderRadius: "8px", border: "1px solid var(--br2)" }}>
                 <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "12px", color: "var(--teal)" }}>📐 ขนาดลาเบล (Printer Size)</div>
                 <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", border: "1px solid var(--br)", borderRadius: "8px", cursor: "pointer", background: "var(--bg2)" }}>
                     <input type="radio" name="size" value="therm-150x100" checked={labelSettings.size === 'therm-150x100'} onChange={e => setLabelSettings({...labelSettings, size: e.target.value})} style={{ width: "auto", accentColor: "var(--teal)" }} />
                     <div><div style={{ fontWeight: "700", color: "var(--teal)" }}>150×100 มม. (แนวนอน)</div><div style={{ fontSize: "12px", color: "var(--t2)" }}>เครื่องพิมพ์ความร้อนแบบแนวนอน</div></div>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", border: "1px solid var(--br)", borderRadius: "8px", cursor: "pointer", background: "var(--bg2)" }}>
                     <input type="radio" name="size" value="therm-100x150" checked={labelSettings.size === 'therm-100x150'} onChange={e => setLabelSettings({...labelSettings, size: e.target.value})} style={{ width: "auto", accentColor: "var(--teal)" }} />
                     <div><div style={{ fontWeight: "700", color: "var(--teal)" }}>100×150 มม. (แนวตั้ง)</div><div style={{ fontSize: "12px", color: "var(--t2)" }}>มาตรฐานเครื่องพิมพ์ความร้อน</div></div>
                   </label>
                 </div>
               </div>
             </div>
             <div style={{ padding: "16px 24px", borderTop: "1px solid var(--br)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg)" }}>
               <span style={{ fontSize: "13px", color: "var(--t2)" }}>จำนวนที่จะพิมพ์: <strong style={{ color: "var(--teal)", fontSize: "16px" }}>{selectedRecipients.length > 0 ? selectedRecipients.length : recipients.length}</strong> ใบ</span>
               <button className="btn" style={{ background: "var(--teal)", color: "white" }} onClick={printLabels}>🖨️ พิมพ์ลาเบลที่เลือก</button>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* 🛎️ CUSTOM DIALOG: ALERT / CONFIRM / PROMPT */}
      {/* ========================================================= */}
      {dialogConfig && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
           <div className="card animate-fade-in" style={{ width: "100%", maxWidth: "400px", padding: "24px", background: "var(--card)", borderRadius: "12px", textAlign: "center", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                 {dialogConfig.type === 'alert' ? (dialogConfig.title === "ข้อผิดพลาด" ? '❌' : '✅') : dialogConfig.type === 'confirm' ? '❓' : '📝'}
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--teal)", marginBottom: "8px" }}>{dialogConfig.title}</h3>
              <p style={{ fontSize: "14px", color: "var(--t2)", marginBottom: "20px", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{dialogConfig.message}</p>
              
              {dialogConfig.type === 'prompt' && (
                 <input type="text" className="inp" autoFocus placeholder="พิมพ์ข้อมูลที่นี่..." 
                    style={{ marginBottom: "20px", textAlign: "left", background: "var(--bg)" }} 
                    value={dialogConfig.inputValue || ''}
                    onKeyDown={(e) => { if (e.key === 'Enter') dialogConfig.onConfirm(dialogConfig.inputValue); }}
                    onChange={e => setDialogConfig({...dialogConfig, inputValue: e.target.value})} 
                 />
              )}
              
              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                 {dialogConfig.type !== 'alert' && (
                    <button className="btn btn-outline" style={{ flex: 1, padding: "10px" }} onClick={dialogConfig.onCancel}>ยกเลิก</button>
                 )}
                 <button className="btn" style={{ background: "var(--teal)", color: "white", flex: dialogConfig.type === 'alert' ? 0 : 1, minWidth: "120px", padding: "10px" }} onClick={() => dialogConfig.onConfirm(dialogConfig.inputValue)}>
                    ตกลง
                 </button>
              </div>
           </div>
        </div>,
        document.body
      )}

    </div>
  );
}
