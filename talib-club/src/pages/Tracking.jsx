import { useState, useEffect } from "react";
import { collection, query, where, getDocs, writeBatch, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAqz8d5xKNI-2LRAzFlTURJgYva0hOe3UE",
  authDomain: "talib-trackingnumber.firebaseapp.com",
  projectId: "talib-trackingnumber",
  storageBucket: "talib-trackingnumber.firebasestorage.app",
  messagingSenderId: "495823490887",
  appId: "1:495823490887:web:59062f61596514eb764662",
  measurementId: "G-RTDQS2WN6X"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function Tracking() {
  // --- การจัดการเส้นทางภายใน (Inner View Routing) ---
  const [view, setView] = useState("home"); // home, user-recipient, user-track, admin-login, admin-dashboard
  const [adminTab, setAdminTab] = useState("prep"); // prep, prep-manage, extract, match, manage

  // --- สถานะการโหลดสคริปต์ภายนอก (CDN) ---
  const [scriptsLoaded, setScriptsLoaded] = useState(false);

  // --- สถานะสำหรับฝั่งผู้ใช้งานทั่วไป (Public User Views) ---
  const [userQuery, setUserQuery] = useState("");
  const [userSearchResult, setUserSearchResult] = useState(null);
  const [isUserLoading, setIsUserLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // --- สถานะสำหรับระบบผู้ดูแลระบบ (Admin Studio States) ---
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // ข้อมูลจำลอง/ข้อมูลดิบในกระบวนการทำงาน
  const [csvRows, setCsvRows] = useState([]);
  const [pdfRows, setPdfRows] = useState([]);
  const [matches, setMatches] = useState([]);
  const [manualPairs, setManualPairs] = useState({});
  const [savedRecords, setSavedRecords] = useState([]);
  const [savedRecipients, setSavedRecipients] = useState([]);
  
  // สถานะการแปลง PDF (Tab 3)
  const [extractFiles, setExtractFiles] = useState([]);
  const [extractedRows, setExtractedRows] = useState([]);
  const [extractStep, setExtractStep] = useState(1);
  const [extractQuery, setExtractQuery] = useState("");

  // ฟิลเตอร์และการจัดเรียง (Admin Filters)
  const [searchFilter, setSearchFilter] = useState("");
  const [sortType, setSortType] = useState("csv");

  // โมดอลการจัดการข้อมูล (Modals Control)
  const [activeModal, setActiveModal] = useState(null); // null, edit-match, edit-record, edit-prep, label-manager
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [checkedItems, setCheckedItems] = useState({});
  const [labelSize, setLabelSize] = useState("therm-150x100");
  const [senderInfo, setSenderInfo] = useState({ name: "Talib Club", phone: "", addr: "" });

  // โหลดสคริปต์ประมวลผลไฟล์ (pdf.js / PapaParse) อัตโนมัติเมื่อคอมโพเนนต์ทำงาน
  useEffect(() => {
    if (window.pdfjsLib && window.Papa) {
      setScriptsLoaded(true);
      return;
    }

    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js")
    ]).then(() => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setScriptsLoaded(true);
    }).catch(err => console.error("Error loading CDN utilities:", err));

    // ตรวจสอบเซสชันผู้ดูแลระบบ
    if (localStorage.getItem("talib_admin_auth") === "true") {
      setIsAdminAuthenticated(true);
    }
  }, []);

  // ดึงข้อมูลจากฐานข้อมูล Firebase เมื่อสลับแท็บแอดมิน
  useEffect(() => {
    if (!isAdminAuthenticated) return;
    if (adminTab === "prep-manage") fetchRecipients();
    if (adminTab === "manage") fetchRecords();
  }, [adminTab, isAdminAuthenticated]);

  // ==========================================
  // ★ LOGIC: DATABASE OPERATIONS (FIREBASE) ★
  // ==========================================
  const fetchRecipients = async () => {
    setIsUserLoading(true);
    try {
      const snap = await getDocs(collection(db, "recipients"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.csvIndex ?? 99999) - (b.csvIndex ?? 99999));
      setSavedRecipients(items);
    } catch (e) {
      setErrorMsg("ไม่สามารถดึงข้อมูลรายชื่อได้");
    }
    setIsUserLoading(false);
  };

  const fetchRecords = async () => {
    setIsUserLoading(true);
    try {
      const snap = await getDocs(collection(db, "records"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSavedRecords(items);
    } catch (e) {
      setErrorMsg("ไม่สามารถดึงข้อมูลพัสดุได้");
    }
    setIsUserLoading(false);
  };

  // ==========================================
  // ★ LOGIC: PARSING & FUZZY MATCHING STUDIO ★
  // ==========================================
  const normalName = (name) => {
    return (name || "")
      .replace(/^(นาย|นาง|นางสาว|คุณ|ด\.ช\.|ด\.ญ\.|ดร\.|ด\.ร\.|mr\.|mrs\.|ms\.)/i, "")
      .replace(/[\s\.\-\(\)\/]/g, "")
      .toLowerCase()
      .trim();
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

  const calculateFuzzyScore = (csv, pdf) => {
    const csvZip = (csv.postalCode || "").trim();
    const pdfZip = (pdf.postalCode || "").trim();
    if (csvZip && pdfZip && csvZip !== pdfZip) return 0;
    if (pdfZip && !csvZip) return 0;

    const csvFull = normalName(csv.cleanName || csv.fullName);
    const pdfName = normalName(pdf.recipientName);
    if (!pdfName || !csvFull) return csvZip && pdfZip ? 55 : 0;

    let nameScore = 0;
    if (csvFull === pdfName) nameScore = 100;
    else if (csvFull.includes(pdfName) || pdfName.includes(csvFull)) {
      nameScore = Math.min(csvFull.length, pdfName.length) >= 2 ? 90 : 60;
    } else {
      const l = lcsLength(csvFull, pdfName);
      const ratio = (l * 2) / (csvFull.length + pdfName.length);
      if (ratio >= 0.75) nameScore = 85;
      else if (ratio >= 0.55) nameScore = 65;
      else if (ratio >= 0.4) nameScore = 45;
    }

    if (csvZip && pdfZip) return Math.min(100, nameScore);
    return nameScore >= 85 ? Math.min(80, nameScore - 10) : 0;
  };

  const runMatchingEngine = () => {
    if (!csvRows.length || !pdfRows.length) return;
    setIsUserLoading(true);

    setTimeout(() => {
      const pairs = [];
      for (let ci = 0; ci < csvRows.length; ci++) {
        for (let pi = 0; pi < pdfRows.length; pi++) {
          const s = calculateFuzzyScore(csvRows[ci], pdfRows[pi]);
          if (s > 0) pairs.push({ ci, pi, s });
        }
      }
      pairs.sort((a, b) => b.s - a.s);

      const usedC = new Set();
      const usedP = new Set();
      const matchMap = new Map();

      // จัดการคู่ที่แมปด้วยสิทธิ์ Admin ด้วยตนเองก่อน
      Object.entries(manualPairs).forEach(([cStr, piArray]) => {
        const ci = parseInt(cStr);
        matchMap.set(ci, { pis: piArray, s: 100, manual: true, scores: piArray.map(() => 100) });
        usedC.add(ci);
        piArray.forEach(p => usedP.add(p));
      });

      // จัดการวนลูปตามสัมประสิทธิ์ความใกล้เคียงของชื่อ
      for (const p of pairs) {
        if (!usedC.has(p.ci) && !usedP.has(p.pi)) {
          matchMap.set(p.ci, { pis: [p.pi], s: p.s, manual: false, scores: [p.s] });
          usedC.add(p.ci); usedP.add(p.pi);
        } else if (usedC.has(p.ci) && !usedP.has(p.pi)) {
          const currentMatch = matchMap.get(p.ci);
          if (currentMatch && !currentMatch.manual) {
            currentMatch.pis.push(p.pi);
            currentMatch.scores.push(p.s);
            usedP.add(p.pi);
          }
        }
      }

      const finalCalculatedMatches = [];
      for (let ci = 0; ci < csvRows.length; ci++) {
        const matchInfo = matchMap.get(ci);
        if (!matchInfo) {
          finalCalculatedMatches.push({ csvIdx: ci, pdfIndices: [], scores: [], level: "none", confirmed: false, manual: false });
        } else {
          const topScore = matchInfo.scores[0] || matchInfo.s;
          const lv = topScore >= 85 ? "high" : (topScore >= 60 ? "med" : "low");
          finalCalculatedMatches.push({ csvIdx: ci, pdfIndices: matchInfo.pis, scores: matchInfo.scores, level: lv, confirmed: lv === "high" || matchInfo.manual, manual: matchInfo.manual });
        }
      }

      for (let pi = 0; pi < pdfRows.length; pi++) {
        if (!usedP.has(pi)) {
          finalCalculatedMatches.push({ csvIdx: null, pdfIndices: [pi], scores: [0], level: "none", confirmed: false, manual: false });
        }
      }

      setMatches(finalCalculatedMatches);
      setIsUserLoading(false);
    }, 100);
  };

  // ==========================================
  // ★ LOGIC: PDF PARSER CONTROLLER ★
  // ==========================================
  const parsePDFFile = async (file) => {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf, cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/", cMapPacked: true }).promise;
    
    const allItems = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const pageOffset = (p - 1) * 10000;
      for (const it of tc.items) {
        const txt = (it.str || '').trim();
        if (txt) allItems.push({ text: txt, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]) + pageOffset });
      }
    }

    allItems.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
    const lines = [];
    let curLine = [], lastY = null;

    for (const item of allItems) {
      if (lastY === null || Math.abs(item.y - lastY) <= 4) curLine.push(item.text);
      else { if (curLine.length) lines.push(curLine.join(" ")); curLine = [item.text]; }
      lastY = item.y;
    }
    if (curLine.length) lines.push(curLine.join(" "));

    const out = [];
    const seenTracks = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = line.replace(/\s+/g, '');
      const trMatch = cleanLine.match(/[A-Z]{2}\d{9}TH/i);
      if (!trMatch) continue;

      let tracking = trMatch[0].toUpperCase();
      if (seenTracks.has(tracking)) continue;
      seenTracks.add(tracking);

      const isSabuy = tracking.startsWith("J") || tracking.startsWith("P");
      let zip = "", name = "", addr = "";

      if (isSabuy) {
        for (let j = Math.max(0, i - 6); j <= i; j++) {
          const zm = lines[j].match(/\b\d{5}\b/);
          if (zm) { zip = zm[0]; break; }
        }
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + 8); j++) {
          if (/ผู้รับ|ชื่อผู้รับ/.test(lines[j])) {
            name = lines[j].replace(/.*(?:ผู้รับ|ชื่อผู้รับ)\s*[:;]?\s*/, '').split(/โทร|tel/i)[0].trim();
            break;
          }
        }
      } else {
        const zm = line.match(/\b\d{5}\b/);
        if (zm) zip = zm[0];
        const parts = line.split(/\s+/).filter(p => !p.match(/[A-Z]{2}\d{9}TH/i) && p !== zip && p.length > 1);
        name = parts.join(" ");
      }

      out.push({ tracking, recipientName: name, postalCode: zip, pdfType: isSabuy ? "postsabuy" : "thaipost" });
    }
    return out;
  };

  const handleExtractPDFs = async () => {
    if (!extractFiles.length) return;
    setIsUserLoading(true);
    setExtractStep(2);
    try {
      let combined = [];
      for (const f of extractFiles) {
        const parsed = await parsePDFFile(f);
        combined.push(...parsed);
      }
      setExtractedRows(combined);
      setExtractStep(3);
    } catch (e) {
      alert("เกิดข้อผิดพลาดในการอ่านไฟล์ PDF");
      setExtractStep(1);
    }
    setIsUserLoading(false);
  };

  // ==========================================
  // ★ LOGIC: PUBLIC USERS METHOD ★
  // ==========================================
  const handlePublicSearch = async (e, mode) => {
    e.preventDefault();
    if (!userQuery.trim()) return;
    setIsUserLoading(true);
    setUserSearchResult(null);
    setErrorMsg("");

    try {
      const targetCollection = mode === "recipient" ? "recipients" : "records";
      const snap = await getDocs(collection(db, targetCollection));
      const allData = snap.docs.map(d => d.data());
      
      const qClean = userQuery.trim().toLowerCase().replace(/\s+/g, '');
      const found = allData.filter(item => 
        (item.fullName || "").toLowerCase().replace(/\s+/g, '').includes(qClean) ||
        (item.phone || "").replace(/[-\s]/g, '').includes(qClean) ||
        (item.trackingNumber || "").toLowerCase().includes(qClean)
      );

      if (found.length > 0) {
        setUserSearchResult(found);
      } else {
        setUserSearchResult("NOT_FOUND");
      }
    } catch (err) {
      setErrorMsg("ไม่สามารถติดต่อเซิร์ฟเวอร์ฐานข้อมูลได้ในขณะนี้");
    }
    setIsUserLoading(false);
  };

  // ==========================================
  // ★ LOGIC: LABELS COMPILER & PRINTER ★
  // ==========================================
  const executeLabelPrinting = () => {
    const cssStyles = {
      "therm-150x100": `@page{size:150mm 100mm;margin:0}body{margin:0;font-family:'Prompt',sans-serif}.plabel{width:150mm;height:99mm;padding:4mm;box-sizing:border-box;page-break-after:always}.l-inner{border:1.5px solid var(--text);height:100%;display:flex;flex-direction:column;padding:3mm}.l-sender{font-size:11px;border-bottom:1px dashed #ccc;padding-bottom:2mm;margin-bottom:3mm}.l-recv{flex:1}.l-name{font-size:20px;font-weight:600;margin-bottom:2mm}.l-addr{font-size:14px;line-height:1.5}.l-zip{font-size:28px;font-weight:600;text-align:right;margin-top:auto}`,
      "therm-100x150": `@page{size:100mm 150mm;margin:0}body{margin:0;font-family:'Prompt',sans-serif}.plabel{width:100mm;height:149mm;padding:3mm;box-sizing:border-box;page-break-after:always}.l-inner{border:1.5px solid var(--text);height:100%;display:flex;flex-direction:column;padding:3mm}.l-sender{font-size:11px;border-bottom:1px dashed #ccc;padding-bottom:2mm;margin-bottom:3mm}.l-recv{flex:1}.l-name{font-size:18px;font-weight:600;margin-bottom:2mm}.l-addr{font-size:13px;line-height:1.5}.l-zip{font-size:26px;font-weight:600;text-align:right;margin-top:auto}`
    };

    const printableHtml = savedRecipients.map(r => `
      <div class="plabel">
        <div class="l-inner">
          <div class="l-sender"><strong>ผู้ส่ง:</strong> ${senderInfo.name} ${senderInfo.phone} ${senderInfo.addr}</div>
          <div class="l-recv">
            <div class="l-name">${r.fullName}</div>
            ${r.phone ? `<div class="l-addr">โทร: ${r.phone}</div>` : ""}
            <div class="l-addr">${r.address || ""}</div>
          </div>
          <div class="l-zip">${r.postalCode || ""}</div>
        </div>
      </div>
    `).join("");

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    win.document.write(`<html><head><style>${cssStyles[labelSize]}</style></head><body>${printableHtml}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); document.body.removeChild(iframe); }, 500);
  };

  return (
    <div className="tracking-wrapper animate-fade-in" style={{ color: "var(--text)" }}>
      
      {/* ---------------------------------------------------------------------- */}
      {/* 🏠 VIEW: USER HOME INTERFACE                                          */}
      {/* ---------------------------------------------------------------------- */}
      {view === "home" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>📮</div>
          <h1 style={{ fontSize: "32px", marginBottom: "8px", fontWeight: "600" }}>Talib Club Logistics</h1>
          <p style={{ color: "var(--t2)", marginBottom: "40px" }}>ระบบตรวจสอบสิทธิ์รายชื่อจองหนังสือ และติดตามสถานะพัสดุพัทลุง/ปัตตานี</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", maxWidth: "600px", margin: "0 auto", padding: "0 16px" }}>
            <div className="card" style={{ padding: "32px 24px", cursor: "pointer" }} onClick={() => { setView("user-recipient"); setUserQuery(""); setUserSearchResult(null); }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>📝</div>
              <h2 style={{ color: "var(--teal)", marginBottom: "8px" }}>ตรวจสอบรายชื่อ</h2>
              <p style={{ fontSize: "12px" }}>เช็คความถูกต้องและยืนยันสิทธิ์รับวารสารรอบล่าสุดก่อนจัดส่ง</p>
            </div>
            <div className="card" style={{ padding: "32px 24px", cursor: "pointer" }} onClick={() => { setView("user-track"); setUserQuery(""); setUserSearchResult(null); }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>📦</div>
              <h2 style={{ color: "var(--text)", marginBottom: "8px" }}>ตรวจสอบเลข Track</h2>
              <p style={{ fontSize: "12px" }}>ค้นหารหัสไปรษณีย์และเลขพัสดุสำหรับกล่องที่ส่งออกไปแล้ว</p>
            </div>
          </div>

          <div style={{ marginTop: "64px" }}>
            <span style={{ fontSize: "12px", color: "var(--t3)", cursor: "pointer" }} onClick={() => isAdminAuthenticated ? setView("admin-dashboard") : setView("admin-login")}>
              🔐 Admin Console Management
            </span>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 📝 VIEW: PUBLIC SEARCH (RECIPIENT & TRACKING LOOKUP)                  */}
      {/* ---------------------------------------------------------------------- */}
      {(view === "user-recipient" || view === "user-track") && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <button className="btn btn-outline btn-sm" onClick={() => setView("home")}>← กลับหน้าหลัก</button>
            <span className="badge badge-teal">{view === "user-recipient" ? "Pre-Shipping Mode" : "Shipped Status"}</span>
          </div>

          <h1 style={{ fontSize: "24px", marginBottom: "24px" }}>
            {view === "user-recipient" ? "ตรวจสอบรายชื่อรับวารสาร" : "ติดตามเลขพัสดุ Talib Club"}
          </h1>

          <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
            <form onSubmit={(e) => handlePublicSearch(e, view === "user-recipient" ? "recipient" : "track")} style={{ display: "flex", gap: "12px" }}>
              <input 
                type="text" 
                className="inp" 
                placeholder="กรอกชื่อ-นามสกุล หรือ เบอร์โทรศัพท์ที่ใช้ลงทะเบียน..." 
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-teal" disabled={isUserLoading}>ค้นหา</button>
            </form>
          </div>

          {isUserLoading && <div className="empty card">กำลังดึงข้อมูลฐานข้อมูล...</div>}

          {userSearchResult === "NOT_FOUND" && (
            <div className="empty card" style={{ border: "1px dashed var(--br)" }}>
              <p style={{ color: "var(--text)", fontWeight: "500" }}>ไม่พบข้อมูลรายชื่อสำหรับ "{userQuery}"</p>
              <p style={{ fontSize: "12px", marginTop: "4px" }}>รบกวนตรวจสอบตัวสะกด หรือติดต่อเพจผู้จัดพิมพ์เพื่อตรวจสอบสิทธิ์ซ้ำอีกครั้งครับ</p>
            </div>
          )}

          {Array.isArray(userSearchResult) && userSearchResult.map((item, idx) => (
            <div key={idx} className="card animate-fade-in" style={{ padding: "0", overflow: "hidden", marginBottom: "16px" }}>
              <div style={{ background: "var(--teal-bg)", padding: "16px 24px", borderBottom: "0.5px solid var(--br2)" }}>
                <h3 style={{ color: "var(--teal)", margin: 0 }}>ผลการค้นหาข้อมูลพัสดุสิทธิ์</h3>
              </div>
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div><span style={{ color: "var(--t2)", fontSize: "12px" }}>ชื่อผู้รับ:</span> <strong style={{ fontSize: "16px" }}>{item.fullName}</strong></div>
                {item.phone && <div><span style={{ color: "var(--t2)", fontSize: "12px" }}>เบอร์โทร:</span> {item.phone}</div>}
                {item.trackingNumber ? (
                  <div>
                    <span style={{ color: "var(--t2)", fontSize: "12px" }}>เลข Tracking (ไปรษณีย์ไทย):</span>
                    <div style={{ background: "var(--inp)", padding: "12px", borderRadius: "8px", fontFamily: "monospace", fontSize: "18px", fontWeight: "600", marginTop: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{item.trackingNumber}</span>
                      <button className="btn btn-outline btn-sm" style={{ padding: "4px 10px" }} onClick={() => navigator.clipboard.writeText(item.trackingNumber)}>คัดลอก</button>
                    </div>
                    <a href={`https://track.thailandpost.co.th/?trackNumber=${item.trackingNumber}`} target="_blank" rel="noreferrer" className="btn btn-teal btn-sm" style={{ display: "inline-block", marginTop: "12px", textDecoration: "none" }}>🌐 เปิดเว็บไปรษณีย์ไทยเพื่อเช็คสถานะละเอียด</a>
                  </div>
                ) : (
                  <div style={{ padding: "12px", background: "var(--acc2)", color: "var(--teal)", borderRadius: "8px", fontSize: "13px", fontWeight: "500" }}>
                    ✓ ท่านมีรายชื่อยู่ในคลังระบบเตรียมการจัดส่งแล้ว (Status: คัดแยกพัสดุต้นทาง)
                  </div>
                )}
                {item.bonusNote && <div style={{ color: "#d97706", fontSize: "13px", marginTop: "6px" }}>🎁 โน้ตพิเศษ: {item.bonusNote}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 🔐 VIEW: ADMIN ACCESS TERMINAL LOGIN                                   */}
      {/* ---------------------------------------------------------------------- */}
      {view === "admin-login" && (
        <div style={{ maxWidth: "400px", margin: "60px auto" }}>
          <h1 style={{ fontSize: "24px", textAlign: "center", marginBottom: "8px" }}>Admin Access</h1>
          <p style={{ textLabel: "center", color: "var(--t2)", fontSize: "13px", marginBottom: "24px", textAlign: "center" }}>กรอกรหัสความปลอดภัยหลังบ้านเพื่อทำแมตช์พัสดุ</p>
          <div className="card" style={{ padding: "24px" }}>
            <input 
              type="password" 
              className="inp" 
              placeholder="รหัสผ่านผู้ดูแลระบบ..." 
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{ marginBottom: "16px" }}
            />
            <button className="btn btn-teal style-full" style={{ width: "100%" }} onClick={() => {
              if (adminPassword === "admin1234") {
                setIsAdminAuthenticated(true);
                localStorage.setItem("talib_admin_auth", "true");
                setView("admin-dashboard");
              } else {
                alert("รหัสผ่านไม่ถูกต้อง");
              }
            }}>เข้าสู่แผงควบคุม</button>
          </div>
          <button className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: "12px" }} onClick={() => setView("home")}>ยกเลิก</button>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 🎛️ VIEW: ADMIN COMPLETE DASHBOARD ENGINE (ALL 5 TABS INCLUDED)          */}
      {/* ---------------------------------------------------------------------- */}
      {view === "admin-dashboard" && isAdminAuthenticated && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1 style={{ fontSize: "26px", fontWeight: "600" }}>Logistics Control Station</h1>
              <p style={{ fontSize: "12px", color: "var(--t2)" }}>ตัวดึง Logic จับคู่ใบสั่งและคัดแยกข้อมูลอัตโนมัติ</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setView("home")}>หน้าหลักผู้ใช้</button>
              <button className="btn btn-outline btn-sm" style={{ color: "red" }} onClick={() => {
                setIsAdminAuthenticated(false);
                localStorage.removeItem("talib_admin_auth");
                setView("home");
              }}>ออกจากระบบ</button>
            </div>
          </div>

          {/* แท็บตัวเลือก แผงคอนโซลควบคุม 5 ระดับ */}
          <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid var(--br)", marginBottom: "24px", overflowX: "auto", paddingBottom: "4px" }}>
            <button className={`btn btn-sm ${adminTab === "prep" ? "btn-teal" : "btn-outline"}`} onClick={() => setAdminTab("prep")}>📥 1. อัปโหลดเตรียมรายชื่อ</button>
            <button className={`btn btn-sm ${adminTab === "prep-manage" ? "btn-teal" : "btn-outline"}`} onClick={() => setAdminTab("prep-manage")}>📝 2. จัดการคลังรายชื่อ</button>
            <button className={`btn btn-sm ${adminTab === "extract" ? "btn-teal" : "btn-outline"}`} onClick={() => setAdminTab("extract")}>🔄 3. ตัวแปลง PDF แปลงร่าง</button>
            <button className={`btn btn-sm ${adminTab === "match" ? "btn-teal" : "btn-outline"}`} onClick={() => setAdminTab("match")}>📊 4. สตูดิโอจับคู่พัสดุ</button>
            <button className={`btn btn-sm ${adminTab === "manage" ? "btn-teal" : "btn-outline"}`} onClick={() => setAdminTab("manage")}>🗂️ 5. รายการพัสดุส่งออก</button>
          </div>

          {/* ----------------- TAB 1: PREP REGISTER NAMES ----------------- */}
          {adminTab === "prep" && (
            <div className="card" style={{ padding: "24px" }}>
              <h3>📥 อัปโหลดคลังรายชื่อผู้ได้รับสิทธิ์หนังสือ (จาก Google Sheets CSV)</h3>
              <p style={{ fontSize: "13px", marginBottom: "16px" }}>นำเข้าข้อมูลรายชื่อจาก Google Sheet เพื่อเปิดให้บุคคลภายนอกเข้าตรวจสอบสิทธิ์ก่อนส่งจ่าหน้าซอง</p>
              
              <input type="file" accept=".csv" onChange={(e) => {
                const f = e.target.files[0];
                if (!f || !window.Papa) return;
                window.Papa.parse(f, {
                  header: true,
                  skipEmptyLines: true,
                  complete: (result) => {
                    const parsed = result.data.map((row, idx) => ({
                      fullName: row["ชื่อ-นามสกุล"] || row["ชื่อ"] || Object.values(row)[0],
                      phone: (row["เบอร์โทร"] || row["phone"] || "").replace(/[-\s]/g, ''),
                      address: row["ที่อยู่"] || row["address"] || "",
                      postalCode: (row["ที่อยู่"] || "").match(/\b\d{5}\b/)?.[0] || "",
                      csvIndex: idx
                    })).filter(r => r.fullName);
                    setCsvRows(parsed);
                    alert(`โหลดสำเร็จ ${parsed.length} บรรทัด`);
                  }
                });
              }} style={{ marginBottom: "20px" }} />

              {csvRows.length > 0 && (
                <div style={{ marginTop: "16px", textAlign: "right" }}>
                  <button className="btn btn-teal" onClick={async () => {
                    setIsUserLoading(true);
                    const batch = writeBatch(db);
                    csvRows.forEach(row => {
                      const ref = doc(collection(db, "recipients"));
                      batch.set(ref, { ...row, createdAt: Timestamp.now() });
                    });
                    await batch.commit();
                    setIsUserLoading(false);
                    alert("บันทึกข้อมูลรายชื่อลงดาต้าเบสแล้ว!");
                    setAdminTab("prep-manage");
                  }}>💾 อัปโหลดบันทึก {csvRows.length} รายชื่อขึ้นระบบคลัง</button>
                </div>
              )}
            </div>
          )}

          {/* ----------------- TAB 2: PREP RECIPIENTS MANAGE ----------------- */}
          {adminTab === "prep-manage" && (
            <div className="card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                <h3>📝 รายชื่อรอคัดแยกจัดส่งในฐานข้อมูล ({savedRecipients.length})</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setActiveModal("label-manager")}>🏷️ เปิดห้องเครื่องพิมพ์ลาเบล</button>
                  <button className="btn btn-outline btn-sm" style={{ color: "red" }} onClick={async () => {
                    if(!confirm("ยืนยันการล้างคลังรายชื่อเตรียมส่งทั้งหมด?")) return;
                    setIsUserLoading(true);
                    const snap = await getDocs(collection(db, "recipients"));
                    const batch = writeBatch(db);
                    snap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    fetchRecipients();
                  }}>🗑️ ล้างทั้งหมด</button>
                </div>
              </div>

              <div className="tbl-wrap">
                <table className="rec-table">
                  <thead>
                    <tr>
                      <th>#</th><th>ชื่อ-นามสกุล</th><th>เบอร์โทร</th><th>ที่อยู่รหัสไปรษณีย์</th><th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedRecipients.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>{r.fullName}</td>
                        <td>{r.phone || "-"}</td>
                        <td>{r.address} {r.postalCode}</td>
                        <td>
                          <button className="btn btn-outline btn-sm" style={{ color: "red", padding: "2px 6px" }} onClick={async () => {
                            if(!confirm("ลบรายชื่อนี้?")) return;
                            await deleteDoc(doc(db, "recipients", r.id));
                            fetchRecipients();
                          }}>ลบ</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ----------------- TAB 3: PDF TO CSV EXTRACTOR ----------------- */}
          {adminTab === "extract" && (
            <div className="card" style={{ padding: "24px" }}>
              <h3>🔄 ตัวแปลงโครงสร้าง PDF ไปรษณีย์ / PostSabuy</h3>
              <p style={{ fontSize: "13px", marginBottom: "20px" }}>ถอดข้อมูลลอจิก รหัสพัสดุและไปรษณีย์ออกมาจากเอกสาร PDF โดยไม่ต้องคีย์มือ</p>

              <input type="file" multiple accept=".pdf" onChange={(e) => setExtractFiles(Array.from(e.target.files))} style={{ marginBottom: "16px" }} />
              
              {extractFiles.length > 0 && extractStep === 1 && (
                <button className="btn btn-teal" onClick={handleExtractPDFs}>เริ่มลูปถอดข้อมูลจาก {extractFiles.length} ไฟล์</button>
              )}

              {extractStep === 3 && (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                    <h4>รายการพัสดุที่สกัดได้สำเร็จ ({extractedRows.length} รายการ)</h4>
                    <button className="btn btn-teal btn-sm" onClick={() => {
                      setPdfRows(extractedRows.map(r => ({ ...r, courier: "ไปรษณีย์ไทย", date: "รอบปัจจุบัน" })));
                      setAdminTab("match");
                      alert("ส่งข้อมูลไปที่แท็บจับคู่แล้ว!");
                    }}>⚡ โยนข้อมูลเข้าแท็บสตูดิโอจับคู่</button>
                  </div>

                  <div className="tbl-wrap">
                    <table className="rec-table">
                      <thead>
                        <tr><th>#</th><th>เลขพัสดุ</th><th>รหัสไปรษณีย์</th><th>ชื่อผู้รับ (สกัดจากใบเสร็จ)</th><th>ค่ายขนส่ง</th></tr>
                      </thead>
                      <tbody>
                        {extractedRows.map((row, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td style={{ fontFamily: "monospace", fontWeight: "600" }}>{row.tracking}</td>
                            <td>{row.postalCode}</td>
                            <td>{row.recipientName || "-"}</td>
                            <td><span className="tag tag-teal">{row.pdfType}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ----------------- TAB 4: FUZZY MATCHING WORKBENCH ----------------- */}
          {adminTab === "match" && (
            <div className="card" style={{ padding: "24px" }}>
              <h3>📊 สตูดิโอจับคู่ไฟล์พัสดุอัจฉริยะ (Fuzzy Validation Studio)</h3>
              <p style={{ fontSize: "13px", marginBottom: "20px" }}>ตรรกะประมวลผลเทียบความแม่นยำชื่อผู้รับและรหัสปลายทาง เพื่อส่งข้อมูลยิงพัสดุขึ้น Firebase</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <div style={{ background: "var(--inp)", padding: "16px", borderRadius: "8px" }}>
                  <strong>สถานะฝั่งคลัง Google Sheet:</strong> {csvRows.length > 0 ? `พร้อมใช้งาน (${csvRows.length} แถว)` : "ยังไม่ได้อัปโหลดไฟล์ในแท็บ 1 (ใช้คลังชั่วคราวได้)"}
                  <input type="file" accept=".csv" onChange={(e) => {
                    const f = e.target.files[0];
                    if (!f) return;
                    window.Papa.parse(f, {
                      header: true, skipEmptyLines: true, complete: (res) => {
                        setCsvRows(res.data.map(r => ({ fullName: r["ชื่อ-นามสกุล"] || Object.values(r)[0], phone: r["เบอร์โทร"] || "", address: r["ที่อยู่"] || "", postalCode: (r["ที่อยู่"] || "").match(/\b\d{5}\b/)?.[0] || "" })).filter(x => x.fullName));
                      }
                    });
                  }} style={{ marginTop: "8px", display: "block" }} />
                </div>
                <div style={{ background: "var(--inp)", padding: "16px", borderRadius: "8px" }}>
                  <strong>สถานะข้อมูล Tracking ปลายทาง:</strong> {pdfRows.length > 0 ? `พร้อมตรวจสอบ (${pdfRows.length} รหัสพัสดุ)` : "รอส่งข้อมูลมาจากแท็บตัวสกัด PDF"}
                </div>
              </div>

              {csvRows.length > 0 && pdfRows.length > 0 && (
                <button className="btn btn-teal" onClick={runMatchingEngine} style={{ marginBottom: "24px", width: "100%" }}>🔀 เริ่มรันอัลกอริทึมจับคู่ตามสัมประสิทธิ์น้ำหนัก</button>
              )}

              {matches.length > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h4>ผลลัพธ์การคัดกรอง</h4>
                    <button className="btn btn-teal" onClick={async () => {
                      setIsUserLoading(true);
                      const batch = writeBatch(db);
                      let count = 0;
                      matches.forEach(m => {
                        if (!m.confirmed || m.csvIdx === null) return;
                        const csvItem = csvRows[m.csvIdx];
                        m.pdfIndices.forEach(pi => {
                          const pdfItem = pdfRows[pi];
                          const ref = doc(collection(db, "records"));
                          batch.set(ref, {
                            fullName: csvItem.fullName,
                            phone: csvItem.phone || "",
                            address: csvItem.address || "",
                            postalCode: pdfItem.postalCode || csvItem.postalCode || "",
                            trackingNumber: pdfItem.tracking,
                            status: "จัดส่งเรียบร้อยแล้ว",
                            courier: pdfItem.pdfType === "postsabuy" ? "Post Sabuy" : "ไปรษณีย์ไทย",
                            createdAt: Timestamp.now()
                          });
                          count++;
                        });
                      });
                      await batch.commit();
                      setIsUserLoading(false);
                      alert(`บันทึกข้อมูลพัสดุส่งออกเรียบร้อย ${count} รายการ!`);
                      setAdminTab("manage");
                    }}>💾 บันทึกทุกรายการที่ยืนยัน ขึ้นระบบฐานข้อมูลจริง</button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {matches.map((m, idx) => {
                      const csvItem = m.csvIdx !== null ? csvRows[m.csvIdx] : null;
                      const pdfItem = m.pdfIndices.length > 0 ? pdfRows[m.pdfIndices[0]] : null;
                      return (
                        <div key={idx} className="card" style={{ padding: "16px", borderLeft: `4px solid ${m.level === "high" ? "var(--teal)" : "#e0a910"}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--t2)", marginBottom: "8px" }}>
                            <span>ความมั่นใจระดับ: {m.level} ({m.scores[0] || 0}%)</span>
                            <input type="checkbox" checked={m.confirmed} onChange={(e) => {
                              const updated = [...matches];
                              updated[idx].confirmed = e.target.checked;
                              setMatches(updated);
                            }} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                            <div>📋 ในชีต: <strong>{csvItem?.fullName || "(ไม่มีคู่ชาร์ต)"}</strong> ({csvItem?.postalCode})</div>
                            <div>📄 ใบเสร็จพัสดุ: <strong style={{ fontFamily: "monospace" }}>{pdfItem?.tracking || "(ว่าง)"}</strong> [{pdfItem?.recipientName}]</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ----------------- TAB 5: DATABASE ARCHIVE MANAGEMENT ----------------- */}
          {adminTab === "manage" && (
            <div className="card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3>🗃️ คลังข้อมูลพัสดุฝั่งคลังข้อมูลในระบบทั้งหมด ({savedRecords.length})</h3>
                <button className="btn btn-outline btn-sm" style={{ color: "red" }} onClick={async () => {
                  if(!confirm("ยืนยันการลบประวัติการส่งออกและพัสดุทั้งหมดถาวร?")) return;
                  setIsUserLoading(true);
                  const snap = await getDocs(collection(db, "records"));
                  const batch = writeBatch(db);
                  snap.docs.forEach(d => batch.delete(d.ref));
                  await batch.commit();
                  fetchRecords();
                }}>ล้างดาต้าเบสทั้งหมด</button>
              </div>

              <div className="tbl-wrap">
                <table className="rec-table">
                  <thead>
                    <tr><th>#</th><th>ชื่อผู้รับ</th><th>เบอร์โทร</th><th>เลขพัสดุ Tracking</th><th>รหัสไปรษณีย์</th><th>สถานะ</th><th>จัดการ</th></tr>
                  </thead>
                  <tbody>
                    {savedRecords.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>{r.fullName}</td>
                        <td>{r.phone || "-"}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: "600" }}>{r.trackingNumber}</td>
                        <td>{r.postalCode}</td>
                        <td><span className="badge badge-teal">{r.status || "จัดส่งสำเร็จ"}</span></td>
                        <td>
                          <button className="btn btn-outline btn-sm" style={{ color: "red", padding: "2px 6px" }} onClick={async () => {
                            if(!confirm("ลบประวัติรายการนี้?")) return;
                            await deleteDoc(doc(db, "records", r.id));
                            fetchRecords();
                          }}>ถอดถอน</button>
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

      {/* ====================================================================== */}
      {/* 🏷️ MODAL ENGINE: LABEL MANAGER & PRINTER DASHBOARD                    */}
      {/* ====================================================================== */}
      {activeModal === "label-manager" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "16px" }}>
          <div className="card animate-fade-in" style={{ background: "var(--card)", padding: "28px", maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ marginBottom: "8px" }}>📐 ตั้งค่าพิมพ์สติกเกอร์บาร์โค้ดจ่าหน้าซอง (Thermal)</h3>
            <p style={{ fontSize: "12px", color: "var(--t2)", marginBottom: "20px" }}>ตั้งค่าหน้ากระดาษจ่าหน้าเครื่องพิมพ์ความร้อนแบบม้วน</p>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>ที่อยู่ส่งกลับขององค์กร (Sender Address)</label>
              <input type="text" className="inp" style={{ marginBottom: "8px" }} placeholder="ชื่อผู้ส่ง..." value={senderInfo.name} onChange={(e) => setSenderInfo({ ...senderInfo, name: e.target.value })} />
              <input type="text" className="inp" placeholder="ที่อยู่ผู้ส่งแบบละเอียด..." value={senderInfo.addr} onChange={(e) => setSenderInfo({ ...senderInfo, addr: e.target.value })} />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>เลือกขนาดสติกเกอร์จ่าหน้า</label>
              <select className="inp" value={labelSize} onChange={(e) => setLabelSize(e.target.value)}>
                <option value="therm-150x100">150 x 100 มิลลิเมตร (แนวนอนมาตรฐาน)</option>
                <option value="therm-100x150">100 x 150 มิลลิเมตร (แนวตั้งยาว)</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setActiveModal(null)}>ปิดหน้าต่าง</button>
              <button className="btn btn-teal" onClick={executeLabelPrinting}>🖨️ สั่งพิมพ์ลาเบลทั้งหมด ({savedRecipients.length} ใบ)</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
