import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Path, Group, Circle, Text, Rect } from 'react-konva';
import useImage from 'use-image';
import getStroke from 'perfect-freehand';
import toast from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDFPageImage = ({ src, width, height }) => {
  const [image] = useImage(src);
  return (
    <KonvaImage
      image={image}
      width={width}
      height={height}
    />
  );
};

const PaperPattern = ({ width, height, type, color }) => {
  const lineGap = 40;
  const isDark = color === 'dark';
  const strokeColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  const lines = [];
  if (type === 'lines' || type === 'grid') {
    for (let y = lineGap; y < height; y += lineGap) {
      lines.push(<Path key={`h-${y}`} data={`M 0 ${y} L ${width} ${y}`} stroke={strokeColor} strokeWidth={1} />);
    }
  }
  if (type === 'grid') {
    for (let x = lineGap; x < width; x += lineGap) {
      lines.push(<Path key={`v-${x}`} data={`M ${x} 0 L ${x} ${height}`} stroke={strokeColor} strokeWidth={1} />);
    }
  }
  if (type === 'dots') {
    for (let y = lineGap; y < height; y += lineGap) {
      for (let x = lineGap; x < width; x += lineGap) {
        lines.push(<Circle key={`d-${x}-${y}`} x={x} y={y} radius={2} fill={strokeColor} />);
      }
    }
  }
  
  return <Group>{lines}</Group>;
};

export default function ProNotebook({ bookId, uid, activeBook }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [pages, setPages] = useState([{ id: 'page-default', src: null, width: 800, height: 1130, lines: [], stickers: [], images: [], paperType: 'lines', paperColor: 'white' }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(activeBook?.book?.fileUrl ? true : false);
  
  const [tool, setTool] = useState('pen'); // 'pen', 'pencil', 'highlighter', 'eraser', 'pan'
  
  const colors = [
    '#111827', '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#06B6D4', 
    '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF', '#F43F5E', '#78716C', '#FFFFFF'
  ];
  const sizes = [2, 4, 6, 8, 12, 16, 24];
  const [penColor, setPenColor] = useState('#111827');
  const [penSize, setPenSize] = useState(4);
  const [penOpacity, setPenOpacity] = useState(1);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  // History State
  const pagesRef = useRef(pages);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  const isDrawing = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Update a specific page's data safely
  const updatePage = (index, updater) => {
    setPages((prev) => {
      const newPages = [...prev];
      const page = { ...newPages[index] };
      updater(page);
      newPages[index] = page;
      return newPages;
    });
  };

  const startLoadingPDF = async (pdfUrl = null) => {
    setShowModeSelection(false);
    setLoadingPdf(true);
    
    try {
      let targetUrl = pdfUrl;
      let proxyUrl = targetUrl;
      
      if (!targetUrl) {
        let url = activeBook.book.fileUrl;
        if (url.includes('drive.google.com') && url.includes('/view')) {
           const match = url.match(/\/d\/(.*?)\//);
           if (match && match[1]) {
             url = `https://drive.google.com/uc?export=download&id=${match[1]}`;
           }
        }
        proxyUrl = `/api/proxy-pdf?url=${encodeURIComponent(url)}`;
      }
      
      toast.loading(`กำลังโหลด PDF...`, { id: 'pdf-load' });
      const loadingTask = pdfjsLib.getDocument({ url: proxyUrl });
      const pdf = await loadingTask.promise;
      const numPages = Math.min(pdf.numPages, 30);
      
      const extractedPages = [];
      toast.loading(`กำลังแยกหน้า PDF (${numPages} หน้า)...`, { id: 'pdf-load' });
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); 
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: context, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/png');
        
        // Calculate display dimensions fitting screen width
        const displayWidth = dimensions.width > 0 ? dimensions.width - 40 : viewport.width;
        const displayScale = displayWidth / viewport.width;
        const displayHeight = viewport.height * displayScale;
        
        extractedPages.push({
          id: `page-${Date.now()}-${i}`,
          src: dataUrl,
          width: displayWidth,
          height: displayHeight,
          lines: [],
          stickers: [],
          images: [],
          paperType: 'blank',
          paperColor: 'white'
        });
      }
      
      setPages(extractedPages); // Replace with PDF pages
      setCurrentPageIndex(0);
      toast.success('ดึงหน้า PDF สำเร็จ!', { id: 'pdf-load' });
    } catch (err) {
      console.error("PDF Load Error", err);
      toast.error('โหลด PDF ไม่สำเร็จ จะใช้เป็นกระดานเปล่าแทน', { id: 'pdf-load', duration: 4000 });
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      const objectUrl = URL.createObjectURL(file);
      startLoadingPDF(objectUrl);
    } else if (file) {
      toast.error('กรุณาเลือกไฟล์ PDF เท่านั้นครับ');
    }
    e.target.value = null;
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        
        // Capture the index when recording starts so sticker goes to the right page
        const targetPageIndex = currentPageIndex;
        
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          
          let stickerX = 100;
          let stickerY = 100;
          
          updatePage(targetPageIndex, (page) => {
             page.stickers.push({
               id: `audio-${Date.now()}`,
               x: stickerX,
               y: stickerY,
               audioUrl: audioUrl,
               isPlaying: false
             });
          });
          
          toast.success('วางสติกเกอร์เสียงเรียบร้อยแล้ว!', { icon: '🎤' });
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        setIsRecording(true);
        toast('กำลังอัดเสียง... (กดอีกครั้งเพื่อหยุด)', { icon: '🔴', duration: 4000 });
      } catch (err) {
        console.error("Mic access denied", err);
        toast.error('ไม่สามารถเข้าถึงไมโครโฟนได้');
      }
    }
  };

  const playAudioSticker = (pageIndex, id, url) => {
    const audio = new Audio(url);
    audio.play();
    
    updatePage(pageIndex, (page) => {
      page.stickers = page.stickers.map(s => s.id === id ? { ...s, isPlaying: true } : s);
    });
    
    audio.onended = () => {
      updatePage(pageIndex, (page) => {
        page.stickers = page.stickers.map(s => s.id === id ? { ...s, isPlaying: false } : s);
      });
    };
  };

  const pushHistory = () => {
    undoStack.current.push(pagesRef.current);
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    const previousState = undoStack.current.pop();
    redoStack.current.push(pagesRef.current);
    setPages(previousState);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    const nextState = redoStack.current.pop();
    undoStack.current.push(pagesRef.current);
    setPages(nextState);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  };

  const clearPage = () => {
    pushHistory();
    updatePage(currentPageIndex, (page) => {
       page.lines = [];
       page.stickers = [];
       page.images = [];
    });
    toast.success('ล้างหน้ากระดาษเรียบร้อย');
  };

  const deletePage = () => {
    if (pages.length <= 1) return toast.error("ไม่สามารถลบหน้าสุดท้ายได้");
    pushHistory();
    setPages(prev => {
       const newPages = [...prev];
       newPages.splice(currentPageIndex, 1);
       return newPages;
    });
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
    toast.success('ลบหน้ากระดาษแล้ว');
  };

  const getPointerPosRelativeToPage = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(stage.getPointerPosition());
    
    // We also need to subtract the pageX and pageY offsets from the Group
    const currentPage = pages[currentPageIndex] || { width: 800, height: 1130 };
    const pageX = Math.max(0, (dimensions.width - currentPage.width * scale) / 2 / scale);
    const pageY = 20; 
    
    return {
      x: pos.x - pageX,
      y: pos.y - pageY
    };
  };

  const handlePointerDown = () => {
    if (tool === 'pan') return;
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    
    pushHistory();
    
    isDrawing.current = true;
    updatePage(currentPageIndex, (page) => {
       page.lines.push({ tool, color: penColor, size: penSize, opacity: penOpacity, points: [pos.x, pos.y, pos.x, pos.y] });
    });
  };

  const handlePointerMove = () => {
    if (!isDrawing.current || tool === 'pan') return;
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    
    updatePage(currentPageIndex, (page) => {
       const lastLine = { ...page.lines[page.lines.length - 1] };
       lastLine.points = lastLine.points.concat([pos.x, pos.y]);
       page.lines[page.lines.length - 1] = lastLine;
    });
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
  };

  const handleWheel = (e) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.max(0.1, Math.min(newScale, 5));
    
    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };
  
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file);
      pushHistory();
      updatePage(currentPageIndex, (page) => {
         if (!page.images) page.images = [];
         page.images.push({
           id: `img-${Date.now()}`,
           src: objectUrl,
           x: 100,
           y: 100,
           width: 300,
           height: 300
         });
      });
      toast.success('แทรกรูปภาพเรียบร้อย');
    }
    e.target.value = null;
  };

  const getSvgPathFromStroke = (stroke) => {
    if (!stroke.length) return "";
    const d = stroke.reduce((acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
    }, ["M", ...stroke[0], "Q"]);
    d.push("Z");
    return d.join(" ");
  };

  const currentPage = pages[currentPageIndex] || { width: 800, height: 1130, lines: [], stickers: [], images: [] };
  const pageX = Math.max(0, (dimensions.width - currentPage.width * scale) / 2 / scale);
  const pageY = 20; 

  const [showPageSettings, setShowPageSettings] = useState(false);
  const [showPageManager, setShowPageManager] = useState(false);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--br2)', background: '#E5E7EB' }}>
      
      {showModeSelection && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
           <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>เริ่มต้นใช้งานสมุดโน้ต</h3>
           <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 32, textAlign: 'center' }}>คุณต้องการปูพื้นหลังกระดานด้วย PDF หรือไม่?</p>
           <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
             <button onClick={() => setShowModeSelection(false)} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid var(--br2)', background: 'white', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
               <i className="ti ti-notebook" style={{ fontSize: 20 }}></i> ใช้กระดานเปล่า
             </button>
             <button onClick={() => document.getElementById('pdf-upload').click()} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid var(--teal)', background: 'white', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
               <i className="ti ti-upload" style={{ fontSize: 20 }}></i> อัปโหลดไฟล์ PDF เอง
             </button>
             <button onClick={() => startLoadingPDF(null)} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--teal)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0, 169, 143, 0.2)' }}>
               <i className="ti ti-link" style={{ fontSize: 20 }}></i> ดึงจากลิงก์หนังสือ
             </button>
           </div>
         </div>
      )}

      {showPageManager && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(243,244,246,0.95)', backdropFilter: 'blur(10px)', overflowY: 'auto', padding: 24 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, background: 'white', padding: '12px 24px', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
             <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>จัดการหน้ากระดาษ ({pages.length} หน้า)</h3>
             <button onClick={() => setShowPageManager(false)} style={{ border: 'none', background: 'var(--gray-light)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}>ปิด</button>
           </div>
           
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 24 }}>
             {pages.map((p, i) => (
                <div 
                  key={p.id} 
                  onClick={() => { setCurrentPageIndex(i); setShowPageManager(false); }}
                  style={{ background: 'white', borderRadius: 12, padding: 12, cursor: 'pointer', border: currentPageIndex === i ? '2px solid var(--teal)' : '2px solid transparent', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s' }}
                >
                  <div style={{ width: '100%', aspectRatio: '800/1130', background: p.paperColor === 'yellow' ? '#FEF3C7' : p.paperColor === 'dark' ? '#1F2937' : 'white', border: '1px solid var(--br2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                    {p.src && <img src={p.src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="pdf page" />}
                    {!p.src && p.paperType !== 'blank' && <i className={`ti ti-grid-dots`} style={{ fontSize: 24, color: 'var(--t2)', opacity: 0.3 }}></i>}
                    {p.lines.length > 0 && <i className="ti ti-pencil" style={{ position: 'absolute', bottom: 4, right: 4, color: 'var(--teal)', fontSize: 16 }}></i>}
                  </div>
                  <span style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>หน้า {i + 1}</span>
                </div>
             ))}
           </div>
         </div>
      )}

      <input type="file" id="pdf-upload" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileUpload} />
      <input type="file" id="image-upload" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      {loadingPdf && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
           <i className="ti ti-loader-2 spin" style={{ fontSize: 36, color: 'var(--teal)', marginBottom: 16 }}></i>
           <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>กำลังดึงหน้า PDF มาลงกระดาน...</span>
         </div>
      )}

      {/* Floating Toolbar */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', padding: '8px', borderRadius: 100, display: 'flex', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', border: '1px solid var(--br2)', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' }}>
        
        {/* Undo / Redo */}
        <button onClick={undo} disabled={!canUndo} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: canUndo ? 'var(--text)' : 'var(--br2)', cursor: canUndo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-arrow-back-up" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={redo} disabled={!canRedo} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: canRedo ? 'var(--text)' : 'var(--br2)', cursor: canRedo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-arrow-forward-up" style={{ fontSize: 20 }}></i>
        </button>
        
        <div style={{ width: 1, background: 'var(--br2)', margin: '0 4px', height: 24 }}></div>
        
        {/* Tools */}
        <button onClick={() => setTool('pencil')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'pencil' ? 'var(--teal)' : 'transparent', color: tool === 'pencil' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-pencil" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={() => setTool('pen')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'pen' ? 'var(--teal)' : 'transparent', color: tool === 'pen' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-ballpen" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={() => setTool('highlighter')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'highlighter' ? '#F59E0B' : 'transparent', color: tool === 'highlighter' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-highlight" style={{ fontSize: 20 }}></i>
        </button>
        
        {(tool === 'pen' || tool === 'pencil' || tool === 'highlighter') && (
          <div style={{ display: 'flex', gap: 6, background: '#F3F4F6', padding: '6px 12px', borderRadius: 100, alignItems: 'center', marginLeft: 4, marginRight: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {colors.map(c => (
              <div 
                 key={c}
                 onClick={() => setPenColor(c)}
                 style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: penColor === c ? '2px solid white' : '1px solid rgba(0,0,0,0.1)', outline: penColor === c ? '2px solid var(--teal)' : 'none' }}
              />
            ))}
            <div style={{ position: 'relative', width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
               <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} style={{ position: 'absolute', opacity: 0, width: '200%', height: '200%', cursor: 'pointer' }} />
            </div>
            
            <div style={{ width: 1, background: '#D1D5DB', margin: '0 4px', height: 16 }}></div>
            
            {sizes.map(s => (
              <div key={s} onClick={() => setPenSize(s)} style={{ width: 24, height: 24, borderRadius: '50%', background: penSize === s ? 'white' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: penSize === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                 <div style={{ width: s, height: s, borderRadius: '50%', background: penSize === s ? 'var(--teal)' : '#9CA3AF' }}></div>
              </div>
            ))}
            
            <div style={{ width: 1, background: '#D1D5DB', margin: '0 4px', height: 16 }}></div>
            
            <input type="range" min="0.1" max="1" step="0.1" value={penOpacity} onChange={(e) => setPenOpacity(parseFloat(e.target.value))} style={{ width: 60 }} title="Opacity" />
          </div>
        )}

        <button onClick={() => setTool('eraser')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'eraser' ? 'var(--red)' : 'transparent', color: tool === 'eraser' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-eraser" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={() => setTool('pan')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'pan' ? '#E5E7EB' : 'transparent', color: tool === 'pan' ? '#374151' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-hand-stop" style={{ fontSize: 20 }}></i>
        </button>
        
        <div style={{ width: 1, background: 'var(--br2)', margin: '0 4px', height: 24 }}></div>
        
        {/* Insert Options */}
        <button onClick={() => document.getElementById('image-upload').click()} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'var(--blue-light)', color: 'var(--blue-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-photo-plus" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={toggleRecording} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: isRecording ? 'var(--red)' : 'var(--orange-light)', color: isRecording ? 'white' : 'var(--orange-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', animation: isRecording ? 'pulse 1.5s infinite' : 'none' }}>
          <i className={isRecording ? "ti ti-player-stop-filled" : "ti ti-microphone"} style={{ fontSize: 20 }}></i>
        </button>
        
        <div style={{ width: 1, background: 'var(--br2)', margin: '0 4px', height: 24 }}></div>
        
        {/* Page Actions */}
        <button onClick={clearPage} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="ล้างหน้ากระดาษ">
          <i className="ti ti-clear-all" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={deletePage} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="ลบหน้ากระดาษ">
          <i className="ti ti-trash" style={{ fontSize: 20 }}></i>
        </button>
      </div>
      
      {/* Goodnotes Pagination Controls */}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', padding: '8px 16px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', border: '1px solid var(--br2)' }}>
        
        <button 
          onClick={() => setShowPageManager(true)}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--gray-light)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-layout-grid" style={{ fontSize: 20 }}></i>
        </button>
        
        <div style={{ width: 1, height: 24, background: 'var(--br2)' }}></div>
        
        <button 
          onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
          disabled={currentPageIndex === 0}
          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', cursor: currentPageIndex === 0 ? 'default' : 'pointer', opacity: currentPageIndex === 0 ? 0.3 : 1 }}>
          <i className="ti ti-chevron-left" style={{ fontSize: 20 }}></i>
        </button>
        
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 60, textAlign: 'center' }}>
          {currentPageIndex + 1} / {pages.length}
        </span>
        
        <button 
          onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
          disabled={currentPageIndex === pages.length - 1}
          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', cursor: currentPageIndex === pages.length - 1 ? 'default' : 'pointer', opacity: currentPageIndex === pages.length - 1 ? 0.3 : 1 }}>
          <i className="ti ti-chevron-right" style={{ fontSize: 20 }}></i>
        </button>

        <div style={{ width: 1, height: 24, background: 'var(--br2)' }}></div>
        
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowPageSettings(!showPageSettings)}
            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: showPageSettings ? 'var(--teal)' : 'transparent', color: showPageSettings ? 'white' : 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
            <i className="ti ti-settings" style={{ fontSize: 20 }}></i>
          </button>
          
          {showPageSettings && (
            <div style={{ position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: 16, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', border: '1px solid var(--br2)', width: 240 }}>
               <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--text)' }}>ลวดลายกระดาษ</h4>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {['blank', 'lines', 'grid', 'dots'].map(pt => (
                    <button key={pt} onClick={() => updatePage(currentPageIndex, p => { p.paperType = pt; pushHistory(); })} style={{ padding: '8px', borderRadius: 8, border: currentPage.paperType === pt ? '2px solid var(--teal)' : '1px solid var(--br2)', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                      {pt === 'blank' ? 'กระดาษเปล่า' : pt === 'lines' ? 'เส้นบรรทัด' : pt === 'grid' ? 'ตาราง (Grid)' : 'จุด (Dots)'}
                    </button>
                  ))}
               </div>
               <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--text)' }}>สีพื้นหลังกระดาษ</h4>
               <div style={{ display: 'flex', gap: 12 }}>
                  {['white', 'yellow', 'dark'].map(pc => (
                    <button key={pc} onClick={() => updatePage(currentPageIndex, p => { p.paperColor = pc; pushHistory(); })} style={{ width: 32, height: 32, borderRadius: '50%', border: currentPage.paperColor === pc ? '2px solid var(--teal)' : '1px solid var(--br2)', background: pc === 'yellow' ? '#FEF3C7' : pc === 'dark' ? '#1F2937' : 'white', cursor: 'pointer' }} />
                  ))}
               </div>
            </div>
          )}
        </div>
        
        <button 
          onClick={() => {
            const newPage = { id: `blank-${Date.now()}`, src: null, width: dimensions.width > 0 ? dimensions.width - 40 : 800, height: 1130, lines: [], stickers: [], images: [], paperType: currentPage.paperType, paperColor: currentPage.paperColor };
            pushHistory();
            setPages((prev) => {
              const p = [...prev];
              p.splice(currentPageIndex + 1, 0, newPage);
              return p;
            });
            setCurrentPageIndex(currentPageIndex + 1);
          }}
          style={{ padding: '6px 12px', borderRadius: 100, border: 'none', background: 'var(--teal-light)', color: 'var(--teal-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }}>
          <i className="ti ti-file-plus" style={{ fontSize: 16 }}></i>
          แทรกหน้าเปล่า
        </button>
      </div>

      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onMouseMove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
        onWheel={handleWheel}
        draggable={tool === 'pan'}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
      >
        {/* Background Layer (Paper + PDF + Images) */}
        <Layer>
          <Group x={pageX} y={pageY}>
            {/* Page Paper Background */}
            <Rect 
               width={currentPage.width} 
               height={currentPage.height} 
               fill={currentPage.paperColor === 'yellow' ? '#FEF3C7' : currentPage.paperColor === 'dark' ? '#1F2937' : 'white'} 
               shadowColor="rgba(0,0,0,0.15)" shadowBlur={20} shadowOffsetY={10} 
            />
            
            {/* Paper Pattern */}
            {!currentPage.src && currentPage.paperType !== 'blank' && (
               <PaperPattern width={currentPage.width} height={currentPage.height} type={currentPage.paperType || 'lines'} color={currentPage.paperColor || 'white'} />
            )}
            
            {/* PDF Render */}
            {currentPage.src && (
               <PDFPageImage src={currentPage.src} width={currentPage.width} height={currentPage.height} />
            )}
            
            {/* Images */}
            {currentPage.images && currentPage.images.map((img) => (
              <Group 
                key={img.id}
                x={img.x}
                y={img.y}
                draggable={tool === 'pan'}
                onDragEnd={(e) => {
                  const { x, y } = e.target.position();
                  updatePage(currentPageIndex, (page) => {
                    const i = page.images.find(im => im.id === img.id);
                    if(i) { i.x = x; i.y = y; }
                  });
                }}
              >
                 <PDFPageImage src={img.src} width={img.width} height={img.height} />
              </Group>
            ))}
          </Group>
        </Layer>
        
        {/* Drawing Layer (Strokes isolated so eraser only erases strokes) */}
        <Layer>
          <Group x={pageX} y={pageY}>
            {/* Strokes */}
            {currentPage.lines.map((line, i) => {
              const pointPairs = [];
              for(let p = 0; p < line.points.length; p+=2) {
                  pointPairs.push([line.points[p], line.points[p+1]]);
              }
              
              const isHighlighter = line.tool === 'highlighter';
              const isEraser = line.tool === 'eraser';
              const isPencil = line.tool === 'pencil';
              
              const strokeOptions = { 
                 size: isEraser ? 24 : isHighlighter ? (line.size || 4) * 3 : (line.size || 4), 
                 thinning: (isHighlighter || isPencil) ? 0 : 0.5,
                 smoothing: isPencil ? 0.2 : 0.5, 
                 streamline: isPencil ? 0.2 : 0.5 
              };
              
              const stroke = getStroke(pointPairs, strokeOptions);
              const pathData = getSvgPathFromStroke(stroke);
              
              let fillStr = line.color || '#111827';
              if (isEraser) fillStr = 'black';
              
              let compositeOp = 'source-over';
              if (isEraser) compositeOp = 'destination-out';
              else if (isHighlighter) compositeOp = 'multiply';
              
              return (
                <Path
                  key={i}
                  data={pathData}
                  fill={fillStr}
                  opacity={isHighlighter ? 0.5 : (line.opacity || 1)}
                  globalCompositeOperation={compositeOp}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            })}
          </Group>
        </Layer>
        
        {/* Stickers Layer */}
        <Layer>
          <Group x={pageX} y={pageY}>
            {/* Audio Stickers */}
            {currentPage.stickers.map((sticker) => (
               <Group 
                 key={sticker.id}
                 x={sticker.x}
                 y={sticker.y}
                 draggable={tool === 'pan'}
                 onDragEnd={(e) => {
                   const { x, y } = e.target.position();
                   updatePage(currentPageIndex, (page) => {
                     const s = page.stickers.find(st => st.id === sticker.id);
                     if(s) { s.x = x; s.y = y; }
                   });
                 }}
                 onClick={() => playAudioSticker(currentPageIndex, sticker.id, sticker.audioUrl)}
                 onTap={() => playAudioSticker(currentPageIndex, sticker.id, sticker.audioUrl)}
               >
                 <Circle radius={24} fill={sticker.isPlaying ? '#10B981' : '#F59E0B'} shadowColor="rgba(0,0,0,0.2)" shadowBlur={10} shadowOffsetY={4} />
                 <Text text="🎤" fontSize={24} x={-12} y={-12} />
                 {sticker.isPlaying && <Circle radius={24} stroke="#10B981" strokeWidth={4} dash={[10, 5]} />}
               </Group>
            ))}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
