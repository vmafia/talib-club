import fs from 'fs';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDocs, collection, deleteDoc, writeBatch } from "firebase/firestore";

const defaultWebFirebaseConfig = {
  apiKey: "AIzaSyC8HoWaAu0XWy3he_pMxqUIWwREDPdeUpg",
  authDomain: "talib-club-web.firebaseapp.com",
  projectId: "talib-club-web",
  storageBucket: "talib-club-web.firebasestorage.app",
  messagingSenderId: "300903382422",
  appId: "1:300903382422:web:887e6f03a6c4f0092db1b7",
  measurementId: "G-CQ5R964GMN",
};

const app = initializeApp(defaultWebFirebaseConfig);
const db = getFirestore(app);

function getEraFromCe(ce) {
  if (!ce) return 4;
  const ceStr = String(ce).trim();
  if (ceStr.includes("ร่วมสมัย") || ceStr.includes("ปัจจุบัน") || (ceStr.includes("–") && ceStr.endsWith("–"))) return 4;
  if (ceStr.startsWith("d.")) {
    const y = parseInt(ceStr.replace("d.", "").trim());
    if (!isNaN(y)) {
      if (y <= 900) return 1;
      if (y <= 1500) return 2;
      if (y <= 1800) return 3;
      return 4;
    }
  }

  const numbers = ceStr.match(/\d+/g);
  if (!numbers) return 4;
  
  const deathYear = numbers.length >= 2 ? parseInt(numbers[1]) : parseInt(numbers[0]);
  if (isNaN(deathYear)) return 4;
  
  if (deathYear <= 900) return 1;
  if (deathYear <= 1500) return 2;
  if (deathYear <= 1800) return 3;
  return 4;
}

function getFieldFromDesc(desc, name) {
  const text = ((desc || "") + " " + (name || "")).toLowerCase();
  if (text.includes("หะดีษ") || text.includes("ฮะดีษ") || text.includes("hadith")) return "หะดีษ";
  if (text.includes("ฟิกฮ์") || text.includes("นิติศาสตร์") || text.includes("fiqh") || text.includes("jurist")) return "ฟิกฮ์";
  if (text.includes("ตัฟซีร") || text.includes("อรรถาธิบาย") || text.includes("tafsir")) return "ตัฟซีร";
  if (text.includes("เทววิทยา") || text.includes("อากีดะฮ์") || text.includes("อะกีดะฮ์") || text.includes("theology") || text.includes("aqidah")) return "อากีดะฮ์";
  if (text.includes("ประวัติศาสตร์") || text.includes("history")) return "ประวัติศาสตร์";
  if (text.includes("ไวยากรณ์") || text.includes("ภาษาอาหรับ") || text.includes("grammar")) return "ภาษาอาหรับ";
  return "ทั่วไป";
}

async function run() {
  const rawData = fs.readFileSync('C:/Users/HP/Documents/GitHub/talib-club/scripts/parsed_mockup_scholars.json', 'utf8');
  const mockupScholars = JSON.parse(rawData);

  console.log(`Loaded ${mockupScholars.length} parsed scholars from JSON.`);

  const processed = mockupScholars.map((s, index) => {
    const era = getEraFromCe(s.ce);
    const field = getFieldFromDesc(s.d, s.n);
    
    // Hash name to get a consistent ID
    let hash = 0;
    const cleanName = s.n.replace(/\s+/g, '').toLowerCase();
    for (let j = 0; j < cleanName.length; j++) {
      hash = (hash << 5) - hash + cleanName.charCodeAt(j);
      hash = hash & hash;
    }
    const docId = `scholar_${Math.abs(hash)}_${index}`;

    return {
      id: docId,
      name: s.n,
      latin: s.e,
      hijri: s.ah || "ไม่ระบุ",
      ad: s.ce || "ไม่ระบุ",
      aq: s.aq || "ไม่ระบุ",
      mh: s.mh || "ไม่ระบุ",
      mz: s.mz || "ไม่ระบุ",
      note: s.d || "",
      era,
      field,
      updatedAt: new Date()
    };
  });

  console.log("Wiping current content_scholars collection from Firestore...");
  const snapshot = await getDocs(collection(db, "content_scholars"));
  const docs = snapshot.docs;
  const deleteBatchSize = 400;
  
  for (let i = 0; i < docs.length; i += deleteBatchSize) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + deleteBatchSize);
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`Firestore content_scholars collection cleared. Removed ${docs.length} documents.`);

  // Upload new records
  const uploadBatchSize = 400;
  let count = 0;
  for (let i = 0; i < processed.length; i += uploadBatchSize) {
    const batch = writeBatch(db);
    const chunk = processed.slice(i, i + uploadBatchSize);
    
    chunk.forEach(scholar => {
      const docRef = doc(db, "content_scholars", scholar.id);
      batch.set(docRef, scholar);
      count++;
    });
    
    console.log(`Uploading batch of ${chunk.length} items...`);
    await batch.commit();
  }

  console.log(`Seeding complete! Successfully uploaded ${count} Emaanlibrary mockup scholars to Firestore.`);
  process.exit(0);
}

run().catch(err => {
  console.error("Reseeding failed:", err);
  process.exit(1);
});
