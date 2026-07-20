import React, { useState } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import toast from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function ProNotebook({ bookId, uid, activeBook }) {
  const [mode, setMode] = useState(null); // 'blank' or 'annotate'
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [tldrawEditor, setTldrawEditor] = useState(null);

  const handleStartBlank = () => {
    setMode('blank');
  };

  const handleStartAnnotate = async () => {
    setMode('annotate');
    setLoadingPdf(true);
  };

  const handleMount = async (editor) => {
    setTldrawEditor(editor);
    if (mode === 'annotate' && activeBook?.book?.fileUrl) {
      try {
        let url = activeBook.book.fileUrl;
        
        // Attempt to workaround Google Drive preview URLs to direct download URLs
        if (url.includes('drive.google.com') && url.includes('/view')) {
           const match = url.match(/\/d\/(.*?)\//);
           if (match && match[1]) {
             url = `https://drive.google.com/uc?export=download&id=${match[1]}`;
           }
        }
        
        toast.loading(`กำลังโหลด PDF...`, { id: 'pdf-load' });
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        const numPages = Math.min(pdf.numPages, 30); // จำกัดแค่ 30 หน้าแรกเพื่อประสิทธิภาพ
        
        const assets = [];
        const shapes = [];
        let currentY = 0;
        
        toast.loading(`กำลังแยกหน้า PDF (${numPages} หน้า)...`, { id: 'pdf-load' });
        
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // Scale 2.0 for better readability
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({ canvasContext: context, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/png');
          
          const assetId = AssetRecordType.createId();
          assets.push({
            id: assetId,
            type: 'asset',
            typeName: 'asset',
            props: {
              type: 'image',
              src: dataUrl,
              w: canvas.width,
              h: canvas.height,
              name: `page-${i}`,
              isAnimated: false,
              mimeType: 'image/png'
            }
          });
          
          shapes.push({
            id: createShapeId(),
            type: 'image',
            x: 0,
            y: currentY,
            isLocked: true,
            props: {
              assetId,
              w: canvas.width,
              h: canvas.height
            }
          });
          
          currentY += canvas.height + 40; // Spacing between pages
        }
        
        editor.createAssets(assets);
        editor.createShapes(shapes);
        toast.success('โหลดหน้าหนังสือลงกระดานสำเร็จ!', { id: 'pdf-load' });
      } catch (err) {
        console.error("PDF Load Error", err);
        toast.error('ดึงข้อมูล PDF ไม่สำเร็จ (อาจติด CORS หรือลิงก์ไม่อนุญาต) จะใช้สมุดเปล่าแทน', { id: 'pdf-load', duration: 4000 });
      } finally {
        setLoadingPdf(false);
      }
    }
  };

  if (!mode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg2)', borderRadius: 16, border: '1px solid var(--br2)' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--teal-bg)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <i className="ti ti-notebook" style={{ fontSize: 32 }}></i>
        </div>
        <h3 style={{ fontSize: 18, marginBottom: 8, fontWeight: 600 }}>สมุดโน้ต Pro 🚀</h3>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 32, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
          เลือกรูปแบบการจดบันทึกที่คุณต้องการสำหรับหนังสือเล่มนี้ (ข้อมูลที่จดจะถูกบันทึกไว้ในเครื่องของคุณโดยอัตโนมัติ)
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-outline" onClick={handleStartBlank} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', minWidth: 160, borderRadius: 16 }}>
            <i className="ti ti-pencil" style={{ fontSize: 28, color: 'var(--text)' }}></i>
            <span style={{ fontWeight: 500 }}>สมุดโน้ตเปล่า</span>
          </button>
          
          {activeBook?.book?.fileUrl && (
            <button className="btn btn-teal" onClick={handleStartAnnotate} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', minWidth: 160, borderRadius: 16 }}>
              <i className="ti ti-book-download" style={{ fontSize: 28 }}></i>
              <span style={{ fontWeight: 500 }}>เขียนทับหนังสือ (PDF)</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--br2)', background: 'white' }}>
      {loadingPdf && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
           <i className="ti ti-loader-2 spin" style={{ fontSize: 36, color: 'var(--teal)', marginBottom: 16 }}></i>
           <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>กำลังดึงหน้า PDF มาลงกระดาน...</span>
           <span style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>กระบวนการนี้อาจใช้เวลาสักครู่ ขึ้นอยู่กับขนาดหนังสือ</span>
         </div>
      )}
      <Tldraw persistenceKey={`tldraw-notebook-${uid}-${bookId}-${mode}`} onMount={handleMount} />
    </div>
  );
}
