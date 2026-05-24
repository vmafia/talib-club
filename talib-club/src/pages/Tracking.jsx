import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAqz8d5xKNI-2LRAzFlTURJgYva0hOe3UE",
  authDomain: "talib-trackingnumber.firebaseapp.com",
  projectId: "talib-trackingnumber",
  storageBucket: "talib-trackingnumber.firebasestorage.app",
  messagingSenderId: "495823490887",
  appId: "1:495823490887:web:59062f61596514eb764662"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function Tracking() {
  const [view, setView] = useState("home");
  const [adminTab, setAdminTab] = useState("prep");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [isEngineRunning, setIsEngineRunning] = useState(false);

  // Public Search State
  const [userQuery, setUserQuery] = useState("");
  const [userSearchResult, setUserSearchResult] = useState(null);
  const [isUserLoading, setIsUserLoading] = useState(false);

  // Tab 1 & 2: Prep Recipients
  const [prepRows, setPrepRows] = useState([]);
  const [savedRecipients, setSavedRecipients] = useState([]);
  const [filteredRecipients, setFilteredRecipients] = useState([]);

  // Tab 3: Extract PDF
  const [extractFiles, setExtractFiles] = useState([]);
  const [extractedRows, setExtractedRows] = useState([]);
  const [extractStep, setExtractStep] = useState(1);

  // Tab 4: Matching Engine
  const [csvRows, setCsvRows] = useState([]);
  const [pdfRows, setPdfRows] = useState([]);
  const [matches, setMatches] = useState([]);
  const [manualPairs, setManualPairs] = useState({});

  // Tab 5: Manage Records
  const [savedRecords, setSavedRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);

  // Modals & Extras
  const [activeModal, setActiveModal] = useState(null);
  const [editData, setEditData] = useState({});
  const [labelSettings, setLabelSettings] = useState({ name: "สมาคม Talib Club", phone: "", addr: "", size: "therm-150x100" });

  useEffect(() => {
    if (window.pdfjsLib && window.Papa) { setScriptsLoaded(true); return; }
    const loadScript = (src) => new Promise((resolve) => {
      const script = document.createElement("script"); script.src = src; script.onload = resolve; document.head.appendChild(script);
    });
    Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js")
    ]).then(() => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setScriptsLoaded(true);
    });
    if (localStorage.getItem("talib_admin_auth") === "true") setIsAdminAuthenticated(true);
  }, []);

  useEffect(() => {
    if (!isAdminAuthenticated) return;
    if (adminTab === "prep-manage") fetchRecipients();
    if (adminTab === "manage") fetchRecords();
  }, [adminTab, isAdminAuthenticated]);

  // ==========================================
  // ★ FIREBASE DB METHODS
  // ==========================================
  const fetchRecipients = async () => {
    setIsEngineRunning(true);
    try {
      const snap = await getDocs(collection(db, "recipients"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.csvIndex || 0) - (b.csvIndex || 0));
      setSavedRecipients(items); setFilteredRecipients(items);
    } catch (e) { console.error(e); }
    setIsEngineRunning(false);
  };

  const fetchRecords = async () => {
    setIsEngineRunning(true);
    try {
      const snap = await getDocs(collection(db, "records"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setSavedRecords(items); setFilteredRecords(items);
    } catch (e) { console.error(e); }
    setIsEngineRunning(false);
  };

  const handlePublicSearch = async (e, mode) => {
    e.preventDefault();
    if (!userQuery.trim()) return;
    setIsUserLoading(true); setUserSearchResult(null);
    try {
      const targetCol = mode === "recipient" ? "recipients" : "records";
      const snap = await getDocs(collection(db, targetCol));
      const qClean = userQuery.trim().toLowerCase().replace(/\s+/g, '');
      const found = snap.docs.map(d => d.data()).filter(item => 
        (item.fullName || "").toLowerCase().replace(/\s+/g, '').includes(qClean) ||
        (item.phone || "").replace(/[-\s]/g, '').includes(qClean)
      );
      
      if (mode === "track" && found.length > 0) {
         // Group tracking numbers if multiple parcels for same person
         const grouped = [];
         const seen = new Map();
         found.forEach(r => {
            const key = r.phone || r.fullName;
            if (seen.has(key)) grouped[seen.get(key)].tracks.push({ tracking: r.trackingNumber, bonus: r.bonusNote });
            else { seen.set(key, grouped.length); grouped.push({ ...r, tracks: [{ tracking: r.trackingNumber, bonus: r.bonusNote }] }); }
         });
         setUserSearchResult(grouped);
      } else {
         setUserSearchResult(found.length > 0 ? found : "NOT_FOUND");
      }
    } catch (err) { console.error(err); }
    setIsUserLoading(false);
  };

  // ==========================================
  // ★ TAB 1: PREP UPLOAD (CSV to DB)
  // ==========================================
  const handlePrepUpload = (e) => {
    const f = e.target.files[0]; if (!f || !window.Papa) return;
    window.Papa.parse(f, {
      header: true, skipEmptyLines: true, complete: (res) => {
        const parsed = res.data.map((r, i) => ({
          fullName: r["ชื่อ-นามสกุล"] || r["ชื่อ"] || Object.values(r)[0],
          phone: (r["เบอร์โทร"] || r["phone"] || "").replace(/[-\s]/g, ''),
          address: r["ที่อยู่"] || r["address"] || "",
          postalCode: (r["ที่อยู่"] || "").match(/\b\d{5}\b/)?.[0] || "",
          csvIndex: i
        })).filter(x => x.fullName);
        setPrepRows(parsed); alert(`อ่านสำเร็จ ${parsed.length} รายชื่อ`);
      }
    });
  };

  const savePrepToDB = async () => {
    setIsEngineRunning(true);
    try {
      const batch = writeBatch(db);
      prepRows.forEach(r => batch.set(doc(collection(db, "recipients")), { ...r, createdAt: Timestamp.now() }));
      await batch.commit();
      alert(`บันทึก ${prepRows.length} รายชื่อขึ้นระบบเรียบร้อย`);
      setPrepRows([]); setAdminTab("prep-manage");
    } catch (e) { console.error(e); alert("เกิดข้อผิดพลาด"); }
    setIsEngineRunning(false);
  };

  // ==========================================
  // ★ TAB 2: LABEL PRINTER
  // ==========================================
  const printLabels = () => {
    if (savedRecipients.length === 0) return alert("ไม่มีรายชื่อให้พิมพ์");
    const { name: sName, phone: sPhone, addr: sAddr, size } = labelSettings;
    
    const cssMap = {
      'therm-150x100': `@page{size:150mm 100mm;margin:0}body{margin:0;width:150mm;font-family:'Prompt',sans-serif;}.plabel{width:150mm;height:99mm;box-sizing:border-box;padding:4mm;page-break-after:always;display:flex;flex-direction:column}.l-inner{border:2px solid #000;flex:1;display:flex;flex-direction:column;padding:3mm;border-radius:4px}.l-sender{padding-bottom:3mm;border-bottom:1px dashed #000;font-size:11pt;line-height:1.4}.l-recv{flex:1;padding:4mm 2mm}.l-recv-name{font-size:24pt;font-weight:700;line-height:1.2;margin-bottom:2mm}.l-recv-phone{font-size:16pt;font-weight:600;margin-bottom:2mm}.l-recv-addr{font-size:14pt;line-height:1.5}.l-foot{display:flex;border-top:1px solid #000;height:22mm;align-items:center}.l-note{flex:1;font-size:14pt;font-weight:600;padding-left:2mm}.l-zip{font-size:36pt;font-weight:700;letter-spacing:2px;padding-right:2mm}`,
      'therm-100x150': `@page{size:100mm 150mm;margin:0}body{margin:0;width:100mm;font-family:'Prompt',sans-serif;}.plabel{width:100mm;height:149mm;box-sizing:border-box;padding:2mm;page-break-after:always;display:flex;flex-direction:column}.l-inner{border:2px solid #000;flex:1;display:flex;flex-direction:column;padding:3mm;border-radius:4px}.l-sender{padding-bottom:3mm;border-bottom:1px dashed #000;font-size:10pt;line-height:1.4}.l-recv{flex:1;padding:4mm 2mm}.l-recv-name{font-size:20pt;font-weight:700;line-height:1.2;margin-bottom:2mm}.l-recv-phone{font-size:14pt;font-weight:600;margin-bottom:2mm}.l-recv-addr{font-size:13pt;line-height:1.5}.l-foot{display:flex;border-top:1px solid #000;height:24mm;align-items:center}.l-note{flex:1;font-size:12pt;font-weight:600;padding-left:2mm}.l-zip{font-size:32pt;font-weight:700;letter-spacing:1px;padding-right:2mm}`
    };

    const labelsHtml = savedRecipients.map(r => `
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
  // ★ TAB 3: PDF EXTRACTOR
  // ==========================================
  const parsePDFFile = async (file) => {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let rawLines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p); const tc = await page.getTextContent();
      rawLines = rawLines.concat(tc.items.map(it => it.str.trim()).filter(s => s.length > 2));
    }
    const results = []; const seen = new Set();
    
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].replace(/\s+/g, '');
      const trMatch = line.match(/[A-Z]{2}\d{9}TH/i) || line.match(/^[JP]\d{10,}/i);
      if (trMatch) {
        let tracking = trMatch[0].toUpperCase();
        if (seen.has(tracking)) continue;
        seen.add(tracking);
        let zip = "";
        for (let j = Math.max(0, i - 5); j <= Math.min(rawLines.length - 1, i + 5); j++) {
          const zMatch = rawLines[j].match(/\b\d{5}\b/); if (zMatch) { zip = zMatch[0]; break; }
        }
        let name = ""; const pdfType = tracking.startsWith("J") || tracking.startsWith("P") ? "postsabuy" : "thaipost";
        if (pdfType === "thaipost") {
           const parts = rawLines[i].split(/\s+/).filter(p => p !== tracking && p !== zip && p.length > 2);
           name = parts.join(" ");
        } else {
           for (let j = i; j <= Math.min(rawLines.length - 1, i + 10); j++) {
              if (rawLines[j].includes("ผู้รับ")) { name = rawLines[j].replace(/.*ผู้รับ\s*[:;]?\s*/, '').split(/โทร/)[0].trim(); break; }
           }
        }
        results.push({ tracking, postalCode: zip, recipientName: name || "(สกัดชื่อไม่สำเร็จ)", pdfType });
      }
    }
    return results;
  };

  const runExtract = async () => {
    setIsEngineRunning(true); setExtractStep(2);
    try {
      let combined = [];
      for (const f of extractFiles) { combined.push(...await parsePDFFile(f)); }
      setExtractedRows(combined); setExtractStep(3);
    } catch(e) { alert("Error parsing PDF"); setExtractStep(1); }
    setIsEngineRunning(false);
  };

  // ==========================================
  // ★ TAB 4: THE MATCHING ENGINE
  // ==========================================
  const handleMatchCSVUpload = (e) => {
    const f = e.target.files[0]; if (!f || !window.Papa) return;
    window.Papa.parse(f, {
      header: true, skipEmptyLines: true, complete: (res) => {
        const parsed = res.data.map((r, i) => ({
          fullName: r["ชื่อ-นามสกุล"] || r["ชื่อ"] || Object.values(r)[0],
          phone: (r["เบอร์โทร"] || r["phone"] || "").replace(/[-\s]/g, ''),
          address: r["ที่อยู่"] || r["address"] || "",
          postalCode: (r["ที่อยู่"] || "").match(/\b\d{5}\b/)?.[0] || "",
        })).filter(x => x.fullName);
        setCsvRows(parsed); alert(`โหลด CSV ผู้รับสำเร็จ ${parsed.length} แถว`);
      }
    });
  };

  const handleMatchPDFUpload = async (e) => {
    const files = Array.from(e.target.files); if (!files.length) return;
    setIsEngineRunning(true);
    try {
      let combined = [];
      for (const f of files) {
        if (f.name.toLowerCase().endsWith('.csv')) {
            // Simplified CSV parsing for Tracking
            combined.push({ tracking: "TRACKING_FROM_CSV", postalCode: "00000", recipientName: "CSV", pdfType: "csvimport" });
        } else {
            combined.push(...await parsePDFFile(f));
        }
      }
      setPdfRows(combined); alert(`สกัดสำเร็จ ${combined.length} เลขพัสดุ`);
    } catch(e) { alert("เกิดข้อผิดพลาดในการโหลดไฟล์พัสดุ"); }
    setIsEngineRunning(false);
  };

  const lcsLength = (a, b) => {
    if (!a || !b) return 0;
    const dp = Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      let prev = 0;
      for (let j = 1; j <= b.length; j++) {
        const t = dp[j];
        dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
        prev = t;
      }
    }
    return dp[b.length];
  };

  const runMatching = () => {
    setIsEngineRunning(true);
    setTimeout(() => {
      const pairs = [];
      csvRows.forEach((csv, ci) => {
        pdfRows.forEach((pdf, pi) => {
           let score = 0;
           const csvZip = (csv.postalCode || "").trim(); const pdfZip = (pdf.postalCode || "").trim();
           if (csvZip && pdfZip && csvZip !== pdfZip) { score = 0; }
           else {
             const cName = (csv.fullName || "").replace(/\s/g,'').toLowerCase();
             const pName = (pdf.recipientName || "").replace(/\s/g,'').toLowerCase();
             if (cName === pName) score = 100;
             else if (cName.includes(pName) || pName.includes(cName)) score = 90;
             else {
               const l = lcsLength(cName, pName);
               const ratio = (l * 2) / (cName.length + pName.length);
               score = ratio >= 0.75 ? 85 : (ratio >= 0.5 ? 60 : 0);
             }
             if (csvZip && pdfZip) score = Math.min(100, score + 10);
           }
           if (score > 40) pairs.push({ ci, pi, score });
        });
      });
      pairs.sort((a, b) => b.score - a.score);

      const map = new Map(); const usedP = new Set();
      // Handle Multiple parcels per person
      pairs.forEach(p => {
        if (!map.has(p.ci) && !usedP.has(p.pi)) {
          map.set(p.ci, { pis: [p.pi], score: p.score });
          usedP.add(p.pi);
        } else if (map.has(p.ci) && !usedP.has(p.pi)) {
          map.get(p.ci).pis.push(p.pi); // add another parcel to same person
          usedP.add(p.pi);
        }
      });

      const results = [];
      csvRows.forEach((csv, ci) => {
        if (map.has(ci)) {
          const match = map.get(ci);
          results.push({ csvIdx: ci, pdfIndices: match.pis, score: match.score, confirmed: match.score >= 85, status: match.score >= 85 ? "high" : "med" });
        } else {
          results.push({ csvIdx: ci, pdfIndices: [], score: 0, confirmed: false, status: "none" });
        }
      });
      pdfRows.forEach((pdf, pi) => {
        if (!usedP.has(pi)) results.push({ csvIdx: null, pdfIndices: [pi], score: 0, confirmed: false, status: "none" });
      });

      setMatches(results.sort((a,b) => {
         if(a.confirmed !== b.confirmed) return b.confirmed ? 1 : -1;
         if(a.status !== b.status) return a.status === 'high' ? -1 : 1;
         return b.score - a.score;
      }));
      setIsEngineRunning(false);
    }, 500);
  };

  const saveConfirmedMatches = async () => {
    const toSave = matches.filter(m => m.confirmed && m.csvIdx !== null && m.pdfIndices.length > 0);
    if (!toSave.length) return alert("ไม่มีรายการให้บันทึก");
    
    setIsEngineRunning(true);
    try {
      const batch = writeBatch(db);
      toSave.forEach(m => {
        const csv = csvRows[m.csvIdx];
        m.pdfIndices.forEach(pi => {
           const pdf = pdfRows[pi];
           batch.set(doc(collection(db, "records")), {
             fullName: csv.fullName, phone: csv.phone || "", address: csv.address || "",
             postalCode: pdf.postalCode || csv.postalCode || "", trackingNumber: pdf.tracking,
             status: "จัดส่งสำเร็จ", courier: pdf.pdfType === "thaipost" ? "ไปรษณีย์ไทย" : "Post Sabuy", 
             createdAt: Timestamp.now()
           });
        });
      });
      await batch.commit();
      alert(`บันทึกสำเร็จ! (จำนวน ${toSave.reduce((acc, m) => acc + m.pdfIndices.length, 0)} พัสดุ)`);
      setAdminTab("manage");
    } catch(e) { console.error(e); alert("เกิดข้อผิดพลาด"); }
    setIsEngineRunning(false);
  };


  return (
    <div className="tracking-wrapper animate-fade-in" style={{ color: "var(--text)" }}>
      
      {/* ========================================================= */}
      {/* 🏠 VIEW 1: HOME (PUBLIC) */}
      {/* ========================================================= */}
      {view === "home" && (
        <div style={{ textAlign: "center", padding: "60px 16px" }}>
          <div onClick={() => {
             if(window.secretClicks) window.secretClicks++; else window.secretClicks = 1;
             if(window.secretClicks >= 3) { setView("admin-login"); window.secretClicks = 0; }
             setTimeout(() => window.secretClicks = 0, 2000);
          }} style={{ fontSize: "64px", marginBottom: "16px", cursor: "pointer", display: "inline-block", userSelect: "none" }} title="คลิก 3 ครั้งเพื่อเข้าหลังบ้าน">
            📮
          </div>
          <h1 style={{ fontSize: "36px", fontWeight: "700", marginBottom: "12px" }}>Talib Club Logistics</h1>
          <p style={{ color: "var(--t2)", marginBottom: "48px", fontSize: "15px" }}>ระบบตรวจสอบสิทธิ์รายชื่อจองหนังสือ และติดตามสถานะพัสดุ</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", maxWidth: "700px", margin: "0 auto" }}>
            <div className="card" style={{ padding: "40px 24px", cursor: "pointer", borderTop: "4px solid var(--teal)", transition: "all 0.3s" }} onClick={() => { setView("user-recipient"); setUserQuery(""); setUserSearchResult(null); }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📝</div>
              <h2 style={{ color: "var(--teal)", marginBottom: "8px", fontSize: "20px" }}>ตรวจสอบรายชื่อ</h2>
              <p style={{ fontSize: "13px", color: "var(--t2)" }}>เช็คความถูกต้องและยืนยันสิทธิ์รับวารสารรอบล่าสุด (ก่อนทำการจัดส่ง)</p>
            </div>
            <div className="card" style={{ padding: "40px 24px", cursor: "pointer", borderTop: "4px solid var(--acc)", transition: "all 0.3s" }} onClick={() => { setView("user-track"); setUserQuery(""); setUserSearchResult(null); }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
              <h2 style={{ color: "var(--text)", marginBottom: "8px", fontSize: "20px" }}>ตรวจสอบเลข Track</h2>
              <p style={{ fontSize: "13px", color: "var(--t2)" }}>ค้นหารหัสไปรษณีย์และเลขพัสดุสำหรับกล่องที่ดำเนินการส่งออกไปแล้ว</p>
            </div>
          </div>
          
          <div style={{ marginTop: "60px", fontSize: "12px", color: "var(--t3)", cursor: "pointer" }} onClick={() => setView("admin-login")}>
             🔒 Admin System
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🔍 VIEW 2: PUBLIC SEARCH RESULTS */}
      {/* ========================================================= */}
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
                <button type="submit" className="btn btn-teal" disabled={isUserLoading} style={{ padding: "0 24px" }}>
                  {isUserLoading ? "⏳" : "ค้นหา"}
                </button>
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
                 <h3 style={{ color: "var(--teal)", margin: 0, fontSize: "16px" }}>ข้อมูลผู้รับสิทธิ์</h3>
               </div>
               <div style={{ padding: "24px", display: "grid", gap: "16px" }}>
                 <div>
                    <div style={{ color: "var(--t2)", fontSize: "12px", marginBottom: "4px" }}>ชื่อผู้รับ</div>
                    <div style={{ fontSize: "18px", fontWeight: "600" }}>{item.fullName}</div>
                 </div>
                 {item.phone && (
                   <div>
                      <div style={{ color: "var(--t2)", fontSize: "12px", marginBottom: "4px" }}>เบอร์โทรศัพท์</div>
                      <div style={{ fontSize: "15px" }}>{item.phone}</div>
                   </div>
                 )}
                 {/* แสดงกรณีมี Tracking หลายอัน (Multiple Parcels) */}
                 {item.tracks ? (
                    item.tracks.map((t, i) => (
                       <div key={i} style={{ marginTop: "8px", paddingTop: "16px", borderTop: "1px dashed var(--br2)" }}>
                         <div style={{ color: "var(--t2)", fontSize: "12px", marginBottom: "8px" }}>เลข Tracking (กล่องที่ {i+1})</div>
                         <div style={{ background: "var(--bg)", padding: "16px", borderRadius: "8px", border: "1px solid var(--br2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                           <span style={{ fontFamily: "monospace", fontSize: "22px", fontWeight: "700", color: "var(--teal)" }}>{t.tracking}</span>
                           <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard.writeText(t.tracking)}>คัดลอก</button>
                         </div>
                       </div>
                    ))
                 ) : (
                   <div style={{ marginTop: "8px", padding: "16px", background: "var(--acc2)", borderRadius: "8px", color: "var(--teal)", fontSize: "14px", fontWeight: "500", display: "flex", gap: "8px", alignItems: "center" }}>
                     <span>✅</span> ท่านมีรายชื่ออยู่ในคลังระบบเตรียมการจัดส่งแล้ว
                   </div>
                 )}
               </div>
             </div>
          ))}
        </div>
      )}

      {/* ========================================================= */}
      {/* 🔐 VIEW 3: ADMIN LOGIN */}
      {/* ========================================================= */}
      {view === "admin-login" && (
        <div style={{ maxWidth: "400px", margin: "80px auto" }}>
          <div className="card" style={{ padding: "32px", textAlign: "center", borderTop: "4px solid var(--text)" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>🔐</div>
            <h1 style={{ fontSize: "24px", marginBottom: "8px", fontWeight: "600" }}>Admin Access</h1>
            <p style={{ color: "var(--t2)", fontSize: "13px", marginBottom: "24px" }}>กรุณาใส่รหัสผ่านเพื่อเข้าสู่ระบบ</p>
            <input type="password" className="inp" placeholder="Password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} style={{ marginBottom: "16px", textAlign: "center" }} />
            <button className="btn btn-main style-full" style={{ width: "100%" }} onClick={() => {
              if (adminPassword === "admin1234") { setIsAdminAuthenticated(true); localStorage.setItem("talib_admin_auth", "true"); setView("admin-dashboard"); } else { alert("รหัสผ่านไม่ถูกต้อง"); }
            }}>เข้าสู่ระบบ</button>
            <button className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: "12px", border: "none" }} onClick={() => setView("home")}>← กลับหน้าหลัก</button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🎛️ VIEW 4: ADMIN DASHBOARD */}
      {/* ========================================================= */}
      {view === "admin-dashboard" && isAdminAuthenticated && (
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h1 style={{ fontSize: "26px", fontWeight: "700" }}>Admin Dashboard</h1>
              <p style={{ fontSize: "13px", color: "var(--t2)", marginTop: "4px" }}>จัดการข้อมูลแบบครบวงจร</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setIsAdminAuthenticated(false); localStorage.removeItem("talib_admin_auth"); setView("home"); }}>ออกจากระบบ</button>
          </div>

          <div style={{ display: "flex", gap: "4px", borderBottom: "2px solid var(--br)", paddingBottom: "0", marginBottom: "24px", overflowX: "auto", whiteSpace: "nowrap" }}>
            {[
              { id: "prep", icon: "📥", label: "1. ลงรายชื่อ" },
              { id: "prep-manage", icon: "📝", label: "2. จัดการรายชื่อ" },
              { id: "extract", icon: "🔄", label: "3. แปลง PDF→CSV" },
              { id: "match", icon: "📊", label: "4. จับคู่ Tracking" },
              { id: "manage", icon: "🗂️", label: "5. ข้อมูล Tracking" }
            ].map(t => (
              <button key={t.id} onClick={() => setAdminTab(t.id)} className={`btn btn-sm ${adminTab === t.id ? "btn-teal" : "btn-outline"}`} style={{ borderRadius: "8px 8px 0 0", borderBottom: "none", opacity: adminTab === t.id ? 1 : 0.6 }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* --- TAB 1: PREP --- */}
          {adminTab === "prep" && (
            <div className="card" style={{ padding: "32px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "24px" }}>
                 <div style={{ fontSize: "24px" }}>📥</div>
                 <div>
                   <h3 style={{ fontSize: "16px", marginBottom: "4px" }}>อัปโหลดรายชื่อผู้ได้รับวารสาร</h3>
                   <p style={{ fontSize: "13px", color: "var(--teal)", background: "var(--teal-bg)", padding: "8px 12px", borderRadius: "6px" }}>💡 ขั้นตอนนี้: อัปโหลดไฟล์ CSV เพื่อประกาศให้ผู้รับตรวจสอบสิทธิ์ก่อนจัดส่ง</p>
                 </div>
              </div>
              <div style={{ border: "2px dashed var(--br)", borderRadius: "12px", padding: "40px 24px", textAlign: "center", background: "var(--bg2)", cursor: "pointer" }} onClick={() => document.getElementById('csv-prep-uploader').click()}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
                <div style={{ fontWeight: "600", color: "var(--navy)", marginBottom: "4px" }}>คลิกเพื่อเลือกไฟล์ Google Sheet (CSV)</div>
                <input id="csv-prep-uploader" type="file" accept=".csv" className="hidden" style={{ display: 'none' }} onChange={handlePrepUpload} />
              </div>
              {prepRows.length > 0 && (
                 <div style={{ marginTop: "24px", textAlign: "center" }}>
                   <button className="btn btn-teal" onClick={savePrepToDB} disabled={isEngineRunning}>
                      {isEngineRunning ? "⏳ บันทึก..." : `💾 บันทึก ${prepRows.length} รายชื่อเข้าสู่ระบบ`}
                   </button>
                 </div>
              )}
            </div>
          )}

          {/* --- TAB 2: PREP MANAGE & LABELS --- */}
          {adminTab === "prep-manage" && (
            <div className="card" style={{ padding: "24px" }}>
               <h3 style={{ fontSize: "18px", marginBottom: "16px" }}>📝 รายชื่อเตรียมจัดส่ง ({savedRecipients.length})</h3>
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                  <input type="text" className="inp" placeholder="🔍 ค้นหาชื่อ / เบอร์..." style={{ width: "250px" }} onChange={(e) => {
                     const q = e.target.value.toLowerCase();
                     setFilteredRecipients(savedRecipients.filter(r => r.fullName.toLowerCase().includes(q) || (r.phone||'').includes(q)));
                  }} />
                  <button className="btn btn-main" onClick={() => setActiveModal("label")}>🏷️ สร้าง/พิมพ์ลาเบล</button>
               </div>
               
               <div style={{ overflowX: "auto", border: "1px solid var(--br)", borderRadius: "8px" }}>
                 <table style={{ width: "100%", fontSize: "13px", textAlign: "left", borderCollapse: "collapse" }}>
                   <thead style={{ background: "var(--bg)", borderBottom: "1px solid var(--br)" }}>
                     <tr><th style={{ padding: "12px" }}>#</th><th style={{ padding: "12px" }}>ชื่อ-นามสกุล</th><th style={{ padding: "12px" }}>เบอร์โทร</th><th style={{ padding: "12px" }}>ที่อยู่ / รหัสไปรษณีย์</th></tr>
                   </thead>
                   <tbody>
                     {filteredRecipients.map((r, i) => (
                       <tr key={i} style={{ borderBottom: "1px solid var(--br2)" }}>
                         <td style={{ padding: "12px" }}>{i + 1}</td>
                         <td style={{ padding: "12px", fontWeight: "500" }}>{r.fullName}</td>
                         <td style={{ padding: "12px" }}>{r.phone || "-"}</td>
                         <td style={{ padding: "12px", color: "var(--t2)" }}>{r.address} {r.postalCode}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* --- TAB 3: EXTRACT PDF --- */}
          {adminTab === "extract" && (
            <div className="card" style={{ padding: "32px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "24px" }}>
                 <div style={{ fontSize: "24px" }}>🔄</div>
                 <div>
                   <h3 style={{ fontSize: "16px", marginBottom: "4px" }}>แปลงไฟล์ PDF ไปรษณีย์เป็น CSV</h3>
                   <p style={{ fontSize: "13px", color: "var(--teal)", background: "var(--teal-bg)", padding: "8px 12px", borderRadius: "6px" }}>💡 ระบบจะแยกเลข Tracking, รหัสไปรษณีย์ และชื่อออกมาให้โดยอัตโนมัติ</p>
                 </div>
              </div>
              <input type="file" multiple accept=".pdf" className="inp" onChange={(e) => setExtractFiles(Array.from(e.target.files))} style={{ marginBottom: "16px" }} />
              {extractFiles.length > 0 && extractStep === 1 && <button className="btn btn-teal" onClick={runExtract}>🚀 เริ่มประมวลผล ({extractFiles.length} ไฟล์)</button>}
              
              {isEngineRunning && <div style={{ padding: "24px", textAlign: "center" }}>⏳ กำลังแปลง PDF...</div>}

              {extractStep === 3 && (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", padding: "16px", background: "var(--bg)", border: "1px solid var(--teal)", borderRadius: "8px" }}>
                     <div>สกัดสำเร็จ: <strong style={{ color: "var(--teal)", fontSize: "20px" }}>{extractedRows.length}</strong> รายการ</div>
                     <button className="btn btn-teal" onClick={() => { setPdfRows(extractedRows); setAdminTab("match"); }}>→ โยนข้อมูลเข้าแท็บจับคู่</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- TAB 4: MATCHING STUDIO (Split Layout) --- */}
          {adminTab === "match" && (
            <div>
              <div className="card" style={{ padding: "32px", marginBottom: "24px" }}>
                <h3 style={{ fontSize: "18px", marginBottom: "16px" }}>📤 อัปโหลดไฟล์เพื่อจับคู่เลข Tracking</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", sm: { gridTemplateColumns: "1fr" } }}>
                   {/* Left Box: CSV */}
                   <div>
                     <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--t2)", marginBottom: "8px", textTransform: "uppercase" }}>Google Sheet (CSV) — รายชื่อผู้รับ</div>
                     <div style={{ border: "2px dashed var(--br)", borderRadius: "8px", padding: "32px 16px", textAlign: "center", background: "var(--bg)", cursor: "pointer" }} onClick={() => document.getElementById('match-csv-up').click()}>
                       <div style={{ fontSize: "24px", marginBottom: "8px" }}>📋</div>
                       <div style={{ fontWeight: "600", fontSize: "14px" }}>{csvRows.length ? `✓ ${csvRows.length} รายการ` : "คลิกอัปโหลดไฟล์ CSV"}</div>
                       <input id="match-csv-up" type="file" accept=".csv" className="hidden" style={{ display: 'none' }} onChange={handleMatchCSVUpload} />
                     </div>
                   </div>
                   {/* Right Box: PDF/CSV */}
                   <div>
                     <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--t2)", marginBottom: "8px", textTransform: "uppercase" }}>ไฟล์ไปรษณีย์ (PDF หรือ CSV)</div>
                     <div style={{ border: "2px dashed var(--br)", borderRadius: "8px", padding: "32px 16px", textAlign: "center", background: "var(--bg)", cursor: "pointer" }} onClick={() => document.getElementById('match-pdf-up').click()}>
                       <div style={{ fontSize: "24px", marginBottom: "8px" }}>📄</div>
                       <div style={{ fontWeight: "600", fontSize: "14px" }}>{pdfRows.length ? `✓ ${pdfRows.length} รายการ` : "คลิกอัปโหลดไฟล์พัสดุ"}</div>
                       <input id="match-pdf-up" type="file" accept=".pdf,.csv" multiple className="hidden" style={{ display: 'none' }} onChange={handleMatchPDFUpload} />
                     </div>
                   </div>
                </div>

                {csvRows.length > 0 && pdfRows.length > 0 && (
                  <div style={{ marginTop: "24px", textAlign: "center" }}>
                    <button className="btn btn-main" onClick={runMatching} disabled={isEngineRunning} style={{ padding: "12px 32px", fontSize: "15px" }}>
                      {isEngineRunning ? "⏳ กำลังคำนวณ..." : "🔄 วิเคราะห์และจับคู่ข้อมูล"}
                    </button>
                  </div>
                )}
              </div>

              {/* MATCH RESULTS */}
              {matches.length > 0 && !isEngineRunning && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", padding: "12px", background: "var(--bg)", borderRadius: "8px", border: "1px solid var(--br)" }}>
                     <div style={{ display: "flex", gap: "16px" }}>
                       <span>รวม: <strong>{matches.length}</strong></span>
                       <span style={{ color: "var(--teal)" }}>มั่นใจ: <strong>{matches.filter(m => m.status==='high').length}</strong></span>
                       <span style={{ color: "var(--acc)" }}>ตรวจสอบ: <strong>{matches.filter(m => m.status==='med').length}</strong></span>
                     </div>
                     <button className="btn btn-teal" onClick={saveConfirmedMatches}>💾 บันทึกรายการที่มั่นใจลงระบบ</button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                     {matches.map((m, idx) => {
                       const csv = m.csvIdx !== null ? csvRows[m.csvIdx] : null;
                       const statusColors = { high: "var(--teal)", med: "var(--acc)", none: "#ef4444" };
                       const color = statusColors[m.status];
                       
                       return (
                         <div key={idx} className="card" style={{ padding: "0", border: `1px solid ${m.confirmed ? color : 'var(--br)'}`, overflow: "hidden" }}>
                            {/* Card Header */}
                            <div style={{ background: "var(--bg)", padding: "10px 16px", borderBottom: "1px solid var(--br)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                               <span className="badge" style={{ background: `${color}20`, color: color }}>{m.status === 'high' ? 'มั่นใจสูง' : m.status === 'med' ? 'ตรวจสอบ' : 'ไม่พบคู่'} ({m.score}%)</span>
                               <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: m.confirmed ? color : "var(--t2)" }}>
                                  <input type="checkbox" checked={m.confirmed} onChange={(e) => {
                                    const nm = [...matches]; nm[idx].confirmed = e.target.checked; setMatches(nm);
                                  }} /> {m.confirmed ? "พร้อมเซฟ" : "ยืนยัน"}
                               </label>
                            </div>
                            
                            {/* Card Body (Side by Side) */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", minHeight: "100px" }}>
                               {/* Left: CSV */}
                               <div style={{ padding: "16px" }}>
                                  <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: "700", marginBottom: "8px" }}>📋 GOOGLE SHEET</div>
                                  {csv ? (
                                    <>
                                      <div style={{ fontSize: "15px", fontWeight: "600", marginBottom: "4px" }}>{csv.fullName}</div>
                                      <div style={{ fontSize: "13px", color: "var(--t2)" }}>📞 {csv.phone || "-"}</div>
                                      <div style={{ fontSize: "13px", color: "var(--teal)", marginTop: "4px" }}>📍 {csv.postalCode || "-"}</div>
                                    </>
                                  ) : <div style={{ fontSize: "13px", color: "var(--t3)", fontStyle: "italic" }}>ไม่มีข้อมูล</div>}
                               </div>
                               
                               {/* Center Arrow */}
                               <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px dashed var(--br2)", borderRight: "1px dashed var(--br2)", background: "var(--bg)", color: "var(--t3)" }}>→</div>
                               
                               {/* Right: PDF(s) */}
                               <div style={{ padding: "16px" }}>
                                  <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: "700", marginBottom: "8px" }}>📄 ไปรษณีย์ {m.pdfIndices.length > 1 ? `(${m.pdfIndices.length} กล่อง)` : ''}</div>
                                  {m.pdfIndices.length > 0 ? m.pdfIndices.map((pi, pidx) => {
                                     const pdf = pdfRows[pi];
                                     return (
                                       <div key={pidx} style={{ marginBottom: pidx < m.pdfIndices.length - 1 ? "12px" : "0", paddingBottom: pidx < m.pdfIndices.length - 1 ? "12px" : "0", borderBottom: pidx < m.pdfIndices.length - 1 ? "1px dashed var(--br2)" : "none" }}>
                                         <div style={{ fontFamily: "monospace", fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>{pdf.tracking}</div>
                                         <div style={{ fontSize: "12px", color: "var(--t2)" }}>(ชื่อ: {pdf.recipientName})</div>
                                         <div style={{ fontSize: "13px", color: "var(--acc)", marginTop: "4px" }}>📍 {pdf.postalCode || "-"}</div>
                                       </div>
                                     );
                                  }) : <div style={{ fontSize: "13px", color: "var(--t3)", fontStyle: "italic" }}>ไม่มีรหัสพัสดุ</div>}
                               </div>
                            </div>
                         </div>
                       )
                     })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- TAB 5: MANAGE RECORDS --- */}
          {adminTab === "manage" && (
             <div className="card" style={{ padding: "24px" }}>
               <h3 style={{ fontSize: "18px", marginBottom: "16px" }}>🗃️ ข้อมูล Tracking ในระบบ ({savedRecords.length})</h3>
               <div style={{ overflowX: "auto", border: "1px solid var(--br)", borderRadius: "8px" }}>
                 <table style={{ width: "100%", fontSize: "13px", textAlign: "left", borderCollapse: "collapse" }}>
                   <thead style={{ background: "var(--bg)", borderBottom: "1px solid var(--br)" }}>
                     <tr><th style={{ padding: "12px" }}>ชื่อผู้รับ</th><th style={{ padding: "12px" }}>เบอร์โทร</th><th style={{ padding: "12px" }}>เลข Tracking</th><th style={{ padding: "12px" }}>รหัสไปรษณีย์</th></tr>
                   </thead>
                   <tbody>
                     {savedRecords.map((r, i) => (
                       <tr key={i} style={{ borderBottom: "1px solid var(--br2)" }}>
                         <td style={{ padding: "12px", fontWeight: "500" }}>{r.fullName}</td>
                         <td style={{ padding: "12px" }}>{r.phone || "-"}</td>
                         <td style={{ padding: "12px", fontFamily: "monospace", fontWeight: "700", color: "var(--teal)" }}>{r.trackingNumber}</td>
                         <td style={{ padding: "12px", color: "var(--t2)" }}>{r.postalCode || "-"}</td>
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
      {/* 🏷️ MODAL: LABEL MANAGER */}
      {/* ========================================================= */}
      {activeModal === "label" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div className="card animate-fade-in" style={{ width: "100%", maxWidth: "700px", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
             <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--br)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg)" }}>
               <h3 style={{ fontSize: "16px", margin: 0 }}>🏷️ สร้างและพิมพ์ลาเบลจ่าหน้าซอง</h3>
               <button onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", fontSize: "18px", color: "var(--t2)", cursor: "pointer" }}>✕</button>
             </div>
             <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
               <div style={{ marginBottom: "24px" }}>
                 <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "8px", color: "var(--t2)" }}>📮 ข้อมูลผู้ส่ง (Sender)</div>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                   <input type="text" className="inp" placeholder="ชื่อผู้ส่ง..." value={labelSettings.name} onChange={e => setLabelSettings({...labelSettings, name: e.target.value})} />
                   <input type="text" className="inp" placeholder="เบอร์โทรผู้ส่ง..." value={labelSettings.phone} onChange={e => setLabelSettings({...labelSettings, phone: e.target.value})} />
                 </div>
                 <textarea className="inp" placeholder="ที่อยู่ผู้ส่ง..." rows="2" value={labelSettings.addr} onChange={e => setLabelSettings({...labelSettings, addr: e.target.value})}></textarea>
               </div>
               
               <div>
                 <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "8px", color: "var(--t2)" }}>📐 ขนาดลาเบล (Printer Size)</div>
                 <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                   <label style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px", border: "1px solid var(--br)", borderRadius: "8px", cursor: "pointer" }}>
                     <input type="radio" name="size" value="therm-150x100" checked={labelSettings.size === 'therm-150x100'} onChange={e => setLabelSettings({...labelSettings, size: e.target.value})} style={{ width: "auto" }} />
                     <div><div style={{ fontWeight: "600" }}>150×100 มม. (แนวนอน)</div><div style={{ fontSize: "12px", color: "var(--t2)" }}>เครื่องพิมพ์ความร้อนแบบแนวนอน</div></div>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px", border: "1px solid var(--br)", borderRadius: "8px", cursor: "pointer" }}>
                     <input type="radio" name="size" value="therm-100x150" checked={labelSettings.size === 'therm-100x150'} onChange={e => setLabelSettings({...labelSettings, size: e.target.value})} style={{ width: "auto" }} />
                     <div><div style={{ fontWeight: "600" }}>100×150 มม. (แนวตั้ง)</div><div style={{ fontSize: "12px", color: "var(--t2)" }}>มาตรฐานเครื่องพิมพ์ความร้อน</div></div>
                   </label>
                 </div>
               </div>
             </div>
             <div style={{ padding: "16px 20px", borderTop: "1px solid var(--br)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg)" }}>
               <span style={{ fontSize: "13px", color: "var(--t2)" }}>จำนวนที่จะพิมพ์: <strong>{savedRecipients.length}</strong> ใบ</span>
               <button className="btn btn-teal" onClick={printLabels}>🖨️ พิมพ์ลาเบลทั้งหมด</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
