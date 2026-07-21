import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Snip a region of the book straight into the notebook. The book preview beside
// the notebook is a cross-origin Google Drive iframe that can never be captured,
// so this modal loads the SAME pdf through our /api/proxy-pdf function, renders
// the chosen page with pdf.js, and lets the reader drag a box over it — the crop
// lands in the note as an image.

const resolvePdfUrl = (url) => {
  let u = url;
  if (u.includes('drive.google.com') && u.includes('/view')) {
    const m = u.match(/\/d\/(.*?)\//);
    if (m && m[1]) u = `https://drive.google.com/uc?export=download&id=${m[1]}`;
  }
  return `/api/proxy-pdf?url=${encodeURIComponent(u)}`;
};

export default function BookSnipModal({ fileUrl, onInsert, onClose }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageImg, setPageImg] = useState(null); // dataURL of the rendered page
  const [rendering, setRendering] = useState(false);
  const [sel, setSel] = useState(null); // {x, y, w, h} in displayed-image pixels

  const pdfRef = useRef(null);
  const fullCanvasRef = useRef(null); // full-resolution render of the current page
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  const renderPage = useCallback(async (pdf, n) => {
    setRendering(true);
    setSel(null);
    try {
      const page = await pdf.getPage(n);
      // Scale 2 keeps text crisp after cropping without exploding memory.
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      fullCanvasRef.current = canvas;
      setPageImg(canvas.toDataURL('image/jpeg', 0.9));
    } finally {
      setRendering(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const task = pdfjsLib.getDocument({ url: resolvePdfUrl(fileUrl) });
        const pdf = await task.promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        await renderPage(pdf, 1);
        if (!cancelled) setStatus('ready');
      } catch (err) {
        console.error('Book snip: PDF load failed', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl, renderPage]);

  const goToPage = (n) => {
    const clamped = Math.max(1, Math.min(numPages, n));
    if (clamped === pageNum || !pdfRef.current) return;
    setPageNum(clamped);
    renderPage(pdfRef.current, clamped);
  };

  // Drag-to-select over the displayed page image.
  const selStart = (e) => {
    const img = imgRef.current;
    if (!img) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    const rect = img.getBoundingClientRect();
    dragRef.current = { x0: e.clientX - rect.left, y0: e.clientY - rect.top };
    setSel(null);
  };
  const selMove = (e) => {
    const img = imgRef.current;
    if (!dragRef.current || !img) return;
    const rect = img.getBoundingClientRect();
    const x1 = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y1 = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const { x0, y0 } = dragRef.current;
    setSel({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  };
  const selEnd = () => { dragRef.current = null; };

  const confirmSnip = () => {
    const img = imgRef.current;
    const full = fullCanvasRef.current;
    if (!sel || sel.w < 8 || sel.h < 8 || !img || !full) return;
    const fx = full.width / img.clientWidth;
    const fy = full.height / img.clientHeight;
    const out = document.createElement('canvas');
    out.width = Math.round(sel.w * fx);
    out.height = Math.round(sel.h * fy);
    out.getContext('2d').drawImage(
      full,
      Math.round(sel.x * fx), Math.round(sel.y * fy), out.width, out.height,
      0, 0, out.width, out.height
    );
    onInsert({ src: out.toDataURL('image/png'), width: out.width, height: out.height });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #F3F4F6', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827', fontFamily: 'Kanit, sans-serif' }}>แคปจากหนังสือ</h3>
          {status === 'ready' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 100, padding: '2px 4px' }}>
              <button onClick={() => goToPage(pageNum - 1)} disabled={pageNum <= 1 || rendering} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', cursor: pageNum <= 1 ? 'default' : 'pointer', opacity: pageNum <= 1 ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft size={17} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 56, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{pageNum} / {numPages}</span>
              <button onClick={() => goToPage(pageNum + 1)} disabled={pageNum >= numPages || rendering} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', cursor: pageNum >= numPages ? 'default' : 'pointer', opacity: pageNum >= numPages ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', background: '#E5E7EB', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, minHeight: 260 }}>
          {status === 'loading' && (
            <div style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#4B5563', fontFamily: 'Kanit, sans-serif' }}>
              <RefreshCw size={26} style={{ animation: 'spinSnip 1s linear infinite' }} />
              <style>{`@keyframes spinSnip { to { transform: rotate(360deg); } }`}</style>
              กำลังโหลดหนังสือ...
            </div>
          )}
          {status === 'error' && (
            <div style={{ alignSelf: 'center', textAlign: 'center', color: '#4B5563', fontFamily: 'Kanit, sans-serif', fontSize: 14, padding: 20 }}>
              โหลดไฟล์หนังสือไม่สำเร็จ<br />
              <span style={{ fontSize: 12.5, color: '#9CA3AF' }}>ไฟล์อาจไม่ใช่ PDF โดยตรง หรือเซิร์ฟเวอร์ไม่อนุญาตให้ดึงไฟล์</span>
            </div>
          )}
          {status === 'ready' && pageImg && (
            <div
              style={{ position: 'relative', touchAction: 'none', cursor: 'crosshair', opacity: rendering ? 0.4 : 1, transition: 'opacity 0.15s' }}
              onPointerDown={selStart}
              onPointerMove={selMove}
              onPointerUp={selEnd}
              onPointerCancel={selEnd}
            >
              <img ref={imgRef} src={pageImg} draggable={false} style={{ display: 'block', maxWidth: '100%', userSelect: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }} />
              {sel && (
                <div style={{ position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h, border: '2px dashed #0A59F7', background: 'rgba(10,89,247,0.08)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)', pointerEvents: 'none' }} />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', borderTop: '1px solid #F3F4F6' }}>
          <span style={{ fontSize: 12.5, color: '#6B7280', fontFamily: 'Kanit, sans-serif' }}>
            ลากกรอบบนหน้าหนังสือเพื่อเลือกส่วนที่ต้องการ
          </span>
          <button
            onClick={confirmSnip}
            disabled={!sel || sel.w < 8 || sel.h < 8}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: (!sel || sel.w < 8 || sel.h < 8) ? '#D1D5DB' : '#0A59F7', color: 'white', fontWeight: 600, cursor: (!sel || sel.w < 8 || sel.h < 8) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Kanit, sans-serif', fontSize: 14, flexShrink: 0 }}
          >
            <Check size={17} /> แปะลงโน้ต
          </button>
        </div>
      </div>
    </div>
  );
}
