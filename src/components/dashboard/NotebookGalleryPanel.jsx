import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import toast from "react-hot-toast";
import ProNotebook from "../../pages/reading/components/ProNotebook.jsx";

export default function NotebookGalleryPanel({ authState, setView }) {
  const [notebooks, setNotebooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotebookId, setSelectedNotebookId] = useState(null);

  useEffect(() => {
    async function fetchNotebooks() {
      if (!authState?.user?.uid) return;
      try {
        const q = query(
          collection(db, "content_notebooks"),
          where("uid", "==", authState.user.uid),
          orderBy("updatedAt", "desc")
        );
        const snapshot = await getDocs(q);
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotebooks(fetched);
      } catch (err) {
        console.error("Failed to fetch notebooks", err);
        toast.error("ดึงข้อมูลสมุดโน้ตไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    }
    fetchNotebooks();
  }, [authState?.user?.uid]);

  if (selectedNotebookId) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, background: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 56, background: 'white', display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
           <button onClick={() => setSelectedNotebookId(null)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13, border: 'none' }}>
              <i className="ti ti-arrow-left"></i> กลับไปคลังสมุด
           </button>
           <h3 style={{ marginLeft: 16, fontSize: 16, fontWeight: 600, margin: 0 }}>โหมดอ่านทบทวน (Read-only)</h3>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
           <ProNotebook 
             bookId={selectedNotebookId} 
             uid={authState.user.uid} 
             activeBook={{ book: { title: "สมุดโน้ต" } }} 
             readonly={true} 
           />
        </div>
      </div>
    );
  }

  return (
    <div className="panel-fade-in" style={{ textAlign: "left", maxWidth: 1000, margin: "0 auto" }}>
      <button
        onClick={() => setView("overview")}
        className="sec-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24, background: "none", border: "none", fontFamily: "'Prompt', sans-serif", cursor: "pointer", color: "var(--t2)" }}
      >
        <i className="ti ti-arrow-left"></i> กลับหน้าแดชบอร์ด
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
            <i className="ti ti-books" style={{ color: "var(--teal)", fontSize: 28 }}></i> คลังสมุดโน้ต
          </h2>
          <p style={{ fontSize: 14, color: "var(--t2)", marginTop: 6, marginBottom: 0 }}>สมุดจดบันทึกจากหนังสือทั้งหมดของคุณ</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)", marginBottom: 8 }}></i>
          <p style={{ fontSize: 13, color: "var(--t3)" }}>กำลังโหลดคลังสมุด...</p>
        </div>
      ) : notebooks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--bg2)", borderRadius: 16, border: "1px dashed var(--br)" }}>
          <i className="ti ti-notebook" style={{ fontSize: 48, color: "var(--br2)", marginBottom: 16 }}></i>
          <h3 style={{ fontSize: 18, color: "var(--text)", marginBottom: 8 }}>ยังไม่มีสมุดโน้ต</h3>
          <p style={{ fontSize: 14, color: "var(--t2)" }}>เริ่มอ่านหนังสือและเปิดสมุดโน้ตเพื่อจดบันทึก</p>
        </div>
      ) : (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", 
          gap: 24 
        }}>
          {notebooks.map(nb => (
            <div 
              key={nb.id} 
              onClick={() => setSelectedNotebookId(nb.bookId)}
              style={{ 
                background: "var(--card)", 
                borderRadius: 16, 
                overflow: "hidden", 
                border: "1px solid var(--br)", 
                cursor: "pointer", 
                transition: "all 0.2s ease",
                boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                display: "flex",
                flexDirection: "column"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "0 12px 24px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.03)";
              }}
            >
              {/* Notebook Cover */}
              <div style={{ 
                height: 140, 
                background: `linear-gradient(135deg, ${nb.coverColor === 'red' ? '#ef4444, #b91c1c' : 'var(--teal), var(--teal-dark)'})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}>
                {/* Binder rings visual */}
                <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, width: 14, display: "flex", flexDirection: "column", justifyContent: "space-evenly", opacity: 0.5 }}>
                   {[1,2,3,4,5,6].map(i => (
                     <div key={i} style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.8)', borderRadius: 2 }}></div>
                   ))}
                </div>
                <i className="ti ti-book" style={{ fontSize: 40, color: "rgba(255,255,255,0.9)" }}></i>
              </div>
              
              {/* Notebook Details */}
              <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 8px 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {nb.title || "สมุดโน้ตทั่วไป"}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--t3)" }}>
                  <i className="ti ti-clock"></i>
                  {nb.updatedAt?.toDate ? nb.updatedAt.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : "เพิ่งอัปเดต"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
