import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Path, Group, Circle, Text, Rect, Transformer } from 'react-konva';
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
  const [pages, setPages] = useState([{ id: 'page-default', src: null, width: 800, height: 1130, lines: [], stickers: [], images: [], texts: [], shapes: [], paperType: 'lines', paperColor: 'white' }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  const saveKey = `talib_notebook_${bookId || 'default'}`;
  
  useEffect(() => {
     const saved = localStorage.getItem(saveKey);
     if (saved) {
        try {
           const parsed = JSON.parse(saved);
           if (parsed && parsed.length > 0) {
              setPages(parsed);
           }
        } catch (e) {
           console.error("Load save failed", e);
        }
     }
  }, [bookId]);
  
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(activeBook?.book?.fileUrl ? true : false);
  
  const [tool, setTool] = useState('pen'); // 'pen', 'pencil', 'highlighter', 'eraser', 'pan', 'text', 'laser', 'shape', 'lasso'
  const [shapeType, setShapeType] = useState('rect'); // 'rect', 'circle', 'line'
  
  const [laserLines, setLaserLines] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const textareaRef = useRef(null);
  
  const [lassoRect, setLassoRect] = useState(null);
  const [selectedLassoLines, setSelectedLassoLines] = useState([]);
  const [lassoGroupPos, setLassoGroupPos] = useState({ x: 0, y: 0 });
  
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const searchResults = React.useMemo(() => {
     if (!searchQuery.trim()) return [];
     const results = [];
     pages.forEach((p, i) => {
        p.texts?.forEach(t => {
           if (t.text.toLowerCase().includes(searchQuery.toLowerCase())) {
              results.push({ pageIndex: i, text: t.text, id: t.id });
           }
        });
     });
     return results;
  }, [searchQuery, pages]);
  
  const [selectedId, selectShape] = useState(null);
  const transformerRef = useRef();

  useEffect(() => {
    if (selectedId && transformerRef.current) {
       const node = stageRef.current.findOne(`#${selectedId}`);
       if (node) {
          transformerRef.current.nodes([node]);
          transformerRef.current.getLayer().batchDraw();
       }
    } else if (transformerRef.current) {
       transformerRef.current.nodes([]);
    }
  }, [selectedId]);

  const checkDeselect = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background';
    if (clickedOnEmpty) {
      selectShape(null);
    }
  };
  
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
  const recordingStartTimeRef = useRef(null);
  const [playbackTime, setPlaybackTime] = useState(Number.MAX_SAFE_INTEGER);
  const animationRef = useRef(null);
  
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
          texts: [],
          shapes: [],
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
        recordingStartTimeRef.current = Date.now();
        
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
    
    setPlaybackTime(0);
    
    updatePage(pageIndex, (page) => {
      page.stickers = page.stickers.map(s => s.id === id ? { ...s, isPlaying: true } : s);
    });
    
    const startTime = performance.now();
    const animate = (time) => {
       setPlaybackTime(time - startTime);
       animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    
    audio.onended = () => {
      cancelAnimationFrame(animationRef.current);
      setPlaybackTime(Number.MAX_SAFE_INTEGER);
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
       page.texts = [];
       page.shapes = [];
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

  const saveNotebook = () => {
     localStorage.setItem(saveKey, JSON.stringify(pages));
     toast.success("บันทึกสมุดโน้ตเรียบร้อยแล้ว!", { icon: '💾' });
  };
  
  const exportPage = () => {
     const stage = stageRef.current;
     if (!stage) return;
     const dataURL = stage.toDataURL({ pixelRatio: 2 });
     const link = document.createElement('a');
     link.download = `notebook-page-${currentPageIndex + 1}.png`;
     link.href = dataURL;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
     toast.success("ดาวน์โหลดรูปภาพสำเร็จ!", { icon: '🖼️' });
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

  const handlePointerDown = (e) => {
    checkDeselect(e);
  
    if (tool === 'pan') return;
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    
    const relativeTime = isRecording && recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : null;
    
    if (tool === 'text') {
       const newText = { id: `text-${Date.now()}`, text: 'พิมพ์ข้อความที่นี่...', x: pos.x, y: pos.y, color: penColor, size: penSize * 4 };
       pushHistory();
       updatePage(currentPageIndex, (page) => {
          if (!page.texts) page.texts = [];
          page.texts.push(newText);
       });
       setEditingTextId(newText.id);
       setEditingTextValue(newText.text);
       return;
    }
    
    if (tool === 'lasso') {
       if (selectedLassoLines.length > 0) {
          // Bake back the moved lines
          pushHistory();
          updatePage(currentPageIndex, (page) => {
             const translatedLines = selectedLassoLines.map(l => ({
                ...l,
                points: l.points.map((pt, i) => i % 2 === 0 ? pt + lassoGroupPos.x : pt + lassoGroupPos.y)
             }));
             page.lines = page.lines.concat(translatedLines);
          });
          setSelectedLassoLines([]);
          setLassoGroupPos({x: 0, y: 0});
          setLassoRect(null);
       }
       isDrawing.current = true;
       setLassoRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
       return;
    }
    
    if (tool === 'laser') {
       isDrawing.current = true;
       setLaserLines(prev => [...prev, { id: Date.now(), color: penColor, size: penSize, points: [pos.x, pos.y, pos.x, pos.y] }]);
       return;
    }
    
    if (tool === 'shape') {
       isDrawing.current = true;
       pushHistory();
       updatePage(currentPageIndex, (page) => {
          if (!page.shapes) page.shapes = [];
          page.shapes.push({ id: `shape-${Date.now()}`, type: shapeType, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, color: penColor, size: penSize, opacity: penOpacity });
       });
       return;
    }
    
    pushHistory();
    
    isDrawing.current = true;
    updatePage(currentPageIndex, (page) => {
       page.lines.push({ tool, color: penColor, size: penSize, opacity: penOpacity, points: [pos.x, pos.y, pos.x, pos.y], startTime: relativeTime });
    });
  };

  const handlePointerMove = () => {
    if (!isDrawing.current || tool === 'pan') return;
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    
    if (tool === 'laser') {
       setLaserLines(prev => {
          const newLines = [...prev];
          const lastLine = { ...newLines[newLines.length - 1] };
          if (lastLine) {
             lastLine.points = lastLine.points.concat([pos.x, pos.y]);
             newLines[newLines.length - 1] = lastLine;
          }
          return newLines;
       });
       return;
    }
    if (tool === 'lasso') {
       if (lassoRect && isDrawing.current) {
          setLassoRect(prev => ({ ...prev, w: pos.x - prev.x, h: pos.y - prev.y }));
       }
       return;
    }
    
    if (tool === 'shape') {
       updatePage(currentPageIndex, (page) => {
          const lastShape = { ...page.shapes[page.shapes.length - 1] };
          lastShape.x2 = pos.x;
          lastShape.y2 = pos.y;
          page.shapes[page.shapes.length - 1] = lastShape;
       });
       return;
    }
    
    updatePage(currentPageIndex, (page) => {
       const lastLine = { ...page.lines[page.lines.length - 1] };
       lastLine.points = lastLine.points.concat([pos.x, pos.y]);
       page.lines[page.lines.length - 1] = lastLine;
    });
  };

  const handlePointerUp = () => {
    if (tool === 'lasso' && isDrawing.current && lassoRect) {
       isDrawing.current = false;
       const rx1 = Math.min(lassoRect.x, lassoRect.x + lassoRect.w);
       const ry1 = Math.min(lassoRect.y, lassoRect.y + lassoRect.h);
       const rx2 = Math.max(lassoRect.x, lassoRect.x + lassoRect.w);
       const ry2 = Math.max(lassoRect.y, lassoRect.y + lassoRect.h);
       
       const currentPage = pages[currentPageIndex];
       if (currentPage && (Math.abs(lassoRect.w) > 5 || Math.abs(lassoRect.h) > 5)) {
          let inside = [];
          let outside = [];
          currentPage.lines.forEach(line => {
             let isInside = false;
             for(let i = 0; i < line.points.length; i+=2) {
                const px = line.points[i];
                const py = line.points[i+1];
                if (px >= rx1 && px <= rx2 && py >= ry1 && py <= ry2) {
                   isInside = true; break;
                }
             }
             if (isInside) inside.push(line);
             else outside.push(line);
          });
          
          if (inside.length > 0) {
             setSelectedLassoLines(inside);
             setLassoGroupPos({x: 0, y: 0});
             pushHistory();
             updatePage(currentPageIndex, (page) => { page.lines = outside; });
          } else {
             setLassoRect(null);
          }
       } else {
          setLassoRect(null);
       }
       return;
    }
    
    if (tool === 'laser' && isDrawing.current) {
       isDrawing.current = false;
       const lastId = laserLines[laserLines.length - 1]?.id;
       if (lastId) {
          setTimeout(() => {
             setLaserLines(prev => prev.filter(l => l.id !== lastId));
          }, 1500);
       }
       return;
    }
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

  const currentPage = pages[currentPageIndex] || { width: 800, height: 1130, lines: [], stickers: [], images: [], texts: [], shapes: [] };
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
       
       {showSearch && (
         <div style={{ position: 'absolute', top: 80, right: 24, zIndex: 40, background: 'white', padding: 16, borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid var(--br2)', width: 300, display: 'flex', flexDirection: 'column' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
             <h4 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>ค้นหาในสมุดโน้ต</h4>
             <button onClick={() => setShowSearch(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--t2)' }}><i className="ti ti-x"></i></button>
           </div>
           <input 
             type="text" 
             autoFocus
             placeholder="พิมพ์ข้อความที่ต้องการค้นหา..." 
             value={searchQuery} 
             onChange={e => setSearchQuery(e.target.value)}
             style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--br2)', fontSize: 14, outline: 'none', marginBottom: 12 }} 
           />
           <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
             {searchResults.length === 0 && searchQuery.trim() !== "" && (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--t2)', fontSize: 13 }}>ไม่พบผลลัพธ์</div>
             )}
             {searchResults.map((res, i) => (
                <div 
                  key={i}
                  onClick={() => { setCurrentPageIndex(res.pageIndex); setShowSearch(false); }}
                  style={{ padding: 12, background: 'var(--gray-light)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--teal)', marginBottom: 4 }}>หน้า {res.pageIndex + 1}</div>
                  <div>{res.text}</div>
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
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', padding: '8px', borderRadius: 100, display: 'flex', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', border: '1px solid var(--br2)', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '95%' }}>
        
        {/* Main Actions */}
        <button onClick={() => setShowSearch(!showSearch)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: showSearch ? 'var(--teal)' : 'transparent', color: showSearch ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-search" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={saveNotebook} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="บันทึก">
          <i className="ti ti-device-floppy" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={exportPage} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="ส่งออกเป็นรูปภาพ">
          <i className="ti ti-photo-down" style={{ fontSize: 20 }}></i>
        </button>
        
        <div style={{ width: 1, background: 'var(--br2)', margin: '0 4px', height: 24 }}></div>
        
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
        <button onClick={() => setTool('laser')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'laser' ? 'var(--red)' : 'transparent', color: tool === 'laser' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-flare" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={() => setTool('shape')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'shape' ? '#8B5CF6' : 'transparent', color: tool === 'shape' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-shape" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={() => setTool('text')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'text' ? 'var(--blue)' : 'transparent', color: tool === 'text' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-typography" style={{ fontSize: 20 }}></i>
        </button>
        <button onClick={() => setTool('lasso')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'lasso' ? 'var(--teal)' : 'transparent', color: tool === 'lasso' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Lasso Tool">
          <i className="ti ti-lasso" style={{ fontSize: 20 }}></i>
        </button>
        
        {(tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || tool === 'laser' || tool === 'text' || tool === 'shape') && (
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
            
            {tool === 'shape' && (
              <>
                <div style={{ width: 1, background: '#D1D5DB', margin: '0 4px', height: 16 }}></div>
                <button onClick={() => setShapeType('rect')} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid currentColor', background: shapeType === 'rect' ? 'var(--teal)' : 'transparent', color: shapeType === 'rect' ? 'white' : 'var(--t2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}></button>
                <button onClick={() => setShapeType('circle')} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid currentColor', background: shapeType === 'circle' ? 'var(--teal)' : 'transparent', color: shapeType === 'circle' ? 'white' : 'var(--t2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}></button>
                <button onClick={() => setShapeType('line')} style={{ width: 24, height: 24, borderRadius: 4, border: 'none', background: shapeType === 'line' ? 'var(--teal)' : 'transparent', color: shapeType === 'line' ? 'white' : 'var(--t2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <i className="ti ti-minus" style={{ fontSize: 16 }}></i>
                </button>
              </>
            )}

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
            const newPage = { id: `blank-${Date.now()}`, src: null, width: dimensions.width > 0 ? dimensions.width - 40 : 800, height: 1130, lines: [], stickers: [], images: [], texts: [], shapes: [], paperType: currentPage.paperType, paperColor: currentPage.paperColor };
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
               name="background"
               width={currentPage.width} 
               height={currentPage.height} 
               fill={currentPage.paperColor === 'yellow' ? '#FEF3C7' : currentPage.paperColor === 'dark' ? '#1F2937' : 'white'} 
               shadowColor="rgba(0,0,0,0.15)" shadowBlur={20} shadowOffsetY={10} 
               onClick={checkDeselect}
               onTap={checkDeselect}
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
                id={img.id}
                name="object"
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
                onClick={() => { if (tool === 'pan' || tool === 'lasso') selectShape(img.id); }}
                onTap={() => { if (tool === 'pan' || tool === 'lasso') selectShape(img.id); }}
              >
                 <PDFPageImage src={img.src} width={img.width} height={img.height} />
              </Group>
            ))}
            
            {/* Shapes */}
            {currentPage.shapes && currentPage.shapes.map((s, i) => {
              const width = s.x2 - s.x1;
              const height = s.y2 - s.y1;
              const shapeProps = {
                 key: s.id, id: s.id, name: "object",
                 x: s.x1, y: s.y1, stroke: s.color, strokeWidth: s.size, opacity: s.opacity,
                 draggable: tool === 'pan',
                 onClick: () => { if (tool === 'pan' || tool === 'lasso') selectShape(s.id); },
                 onTap: () => { if (tool === 'pan' || tool === 'lasso') selectShape(s.id); },
                 onDragEnd: (e) => {
                    const { x, y } = e.target.position();
                    updatePage(currentPageIndex, (page) => {
                       const shp = page.shapes.find(sh => sh.id === s.id);
                       if (shp) {
                          const dx = x - shp.x1; const dy = y - shp.y1;
                          shp.x1 += dx; shp.x2 += dx; shp.y1 += dy; shp.y2 += dy;
                       }
                    });
                 }
              };
              
              if (s.type === 'rect') {
                 return <Rect {...shapeProps} width={width} height={height} dash={s.isDashed ? [10, 5] : []} />;
              } else if (s.type === 'circle') {
                 const radius = Math.sqrt(width * width + height * height);
                 return <Circle {...shapeProps} radius={radius} />;
              } else if (s.type === 'line') {
                 return <Path {...shapeProps} data={`M 0 0 L ${width} ${height}`} lineCap="round" lineJoin="round" />;
              }
              return null;
            })}
          </Group>
        </Layer>
        
        {/* Drawing Layer (Strokes isolated so eraser only erases strokes) */}
        <Layer>
          <Group x={pageX} y={pageY}>
            {/* Strokes */}
            {currentPage.lines.map((line, i) => {
              const isVisible = line.startTime === undefined || line.startTime === null || line.startTime <= playbackTime;
              if (!isVisible) return null;
              
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
            {/* Laser Lines */}
            {laserLines.map((line, i) => {
              const pointPairs = [];
              for(let p = 0; p < line.points.length; p+=2) { pointPairs.push([line.points[p], line.points[p+1]]); }
              const stroke = getStroke(pointPairs, { size: line.size || 4, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
              const pathData = getSvgPathFromStroke(stroke);
              return (
                <Group key={`laser-${line.id}`}>
                   <Path data={pathData} fill={line.color || 'red'} opacity={0.3} shadowColor={line.color || 'red'} shadowBlur={15} shadowOpacity={1} />
                   <Path data={pathData} fill="white" />
                </Group>
              );
            })}
            
            {/* Shapes */}
            {currentPage.shapes && currentPage.shapes.map((s, i) => {
              const width = s.x2 - s.x1;
              const height = s.y2 - s.y1;
              if (s.type === 'rect') {
                 return <Rect key={s.id} x={s.x1} y={s.y1} width={width} height={height} stroke={s.color} strokeWidth={s.size} opacity={s.opacity} dash={s.isDashed ? [10, 5] : []} />;
              } else if (s.type === 'circle') {
                 const radius = Math.sqrt(width * width + height * height);
                 return <Circle key={s.id} x={s.x1} y={s.y1} radius={radius} stroke={s.color} strokeWidth={s.size} opacity={s.opacity} />;
              } else if (s.type === 'line') {
                 return <Path key={s.id} data={`M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`} stroke={s.color} strokeWidth={s.size} opacity={s.opacity} lineCap="round" lineJoin="round" />;
              }
              return null;
            })}
            
            {/* Lasso Selection Rect */}
            {tool === 'lasso' && lassoRect && selectedLassoLines.length === 0 && (
               <Rect x={lassoRect.x} y={lassoRect.y} width={lassoRect.w} height={lassoRect.h} stroke="var(--teal)" strokeWidth={1} dash={[5, 5]} fill="rgba(0, 169, 143, 0.1)" />
            )}
            
            {/* Lasso Selected Group */}
            {selectedLassoLines.length > 0 && (
               <Group 
                 draggable
                 x={lassoGroupPos.x}
                 y={lassoGroupPos.y}
                 onDragEnd={(e) => {
                    setLassoGroupPos({ x: e.target.x(), y: e.target.y() });
                 }}
               >
                  {lassoRect && (
                     <Rect x={lassoRect.x} y={lassoRect.y} width={lassoRect.w} height={lassoRect.h} stroke="var(--teal)" strokeWidth={2} dash={[5, 5]} />
                  )}
                  {selectedLassoLines.map((line, i) => {
                     const pointPairs = [];
                     for(let p = 0; p < line.points.length; p+=2) { pointPairs.push([line.points[p], line.points[p+1]]); }
                     
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
                     
                     return (
                       <Path
                         key={`lasso-line-${i}`}
                         data={pathData}
                         fill={fillStr}
                         opacity={isHighlighter ? 0.5 : (line.opacity || 1)}
                         globalCompositeOperation={isHighlighter ? 'multiply' : 'source-over'}
                         lineCap="round"
                         lineJoin="round"
                       />
                     );
                  })}
               </Group>
            )}
          </Group>
        </Layer>
        
        {/* Texts Layer */}
        <Layer>
          <Group x={pageX} y={pageY}>
            {currentPage.texts && currentPage.texts.map((t) => (
              <Group
                key={t.id}
                id={t.id}
                name="object"
                x={t.x}
                y={t.y}
                draggable={tool === 'pan' || tool === 'text'}
                onDragEnd={(e) => {
                   const { x, y } = e.target.position();
                   updatePage(currentPageIndex, (page) => {
                     const txt = page.texts.find(tx => tx.id === t.id);
                     if(txt) { txt.x = x; txt.y = y; }
                   });
                }}
                onClick={() => {
                   if (tool === 'pan' || tool === 'lasso') {
                      selectShape(t.id);
                   } else if (tool === 'text') {
                      setEditingTextId(t.id);
                      setEditingTextValue(t.text);
                   }
                }}
                onTap={() => {
                   if (tool === 'pan' || tool === 'lasso') {
                      selectShape(t.id);
                   } else if (tool === 'text') {
                      setEditingTextId(t.id);
                      setEditingTextValue(t.text);
                   }
                }}
              >
                {editingTextId !== t.id && (
                  <Text text={t.text} fontSize={t.size} fill={t.color} fontFamily="Kanit, sans-serif" padding={4} />
                )}
              </Group>
            ))}
          </Group>
        </Layer>
        
        {/* Stickers Layer */}
        <Layer>
          <Group x={pageX} y={pageY}>
            {/* Audio Stickers */}
            {currentPage.stickers.map((sticker) => (
               <Group 
                 key={sticker.id}
                 id={sticker.id}
                 name="object"
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
                 onClick={() => {
                    if (tool === 'pan' || tool === 'lasso') selectShape(sticker.id);
                    else playAudioSticker(currentPageIndex, sticker.id, sticker.audioUrl);
                 }}
                 onTap={() => {
                    if (tool === 'pan' || tool === 'lasso') selectShape(sticker.id);
                    else playAudioSticker(currentPageIndex, sticker.id, sticker.audioUrl);
                 }}
               >
                 <Circle radius={24} fill={sticker.isPlaying ? '#10B981' : '#F59E0B'} shadowColor="rgba(0,0,0,0.2)" shadowBlur={10} shadowOffsetY={4} />
                 <Text text="🎤" fontSize={24} x={-12} y={-12} />
                 {sticker.isPlaying && <Circle radius={24} stroke="#10B981" strokeWidth={4} dash={[10, 5]} />}
               </Group>
            ))}
          </Group>
        </Layer>
        
        {/* Transformer Layer */}
        <Layer>
           {selectedId && (
              <Transformer 
                ref={transformerRef} 
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 10 || newBox.height < 10) return oldBox;
                  return newBox;
                }}
              />
           )}
        </Layer>
      </Stage>

      {/* Floating Textarea for inline editing */}
      {editingTextId && (() => {
         const t = currentPage.texts.find(tx => tx.id === editingTextId);
         if (!t) return null;
         
         const absoluteX = (t.x + pageX) * scale + position.x;
         const absoluteY = (t.y + pageY) * scale + position.y;
         
         return (
           <textarea
             ref={textareaRef}
             autoFocus
             value={editingTextValue}
             onChange={(e) => setEditingTextValue(e.target.value)}
             onBlur={() => {
                if (editingTextValue.trim() === '') {
                   updatePage(currentPageIndex, (page) => {
                      page.texts = page.texts.filter(tx => tx.id !== editingTextId);
                   });
                } else {
                   updatePage(currentPageIndex, (page) => {
                      const txt = page.texts.find(tx => tx.id === editingTextId);
                      if (txt) txt.text = editingTextValue;
                   });
                }
                setEditingTextId(null);
             }}
             style={{
                position: 'absolute',
                top: absoluteY,
                left: absoluteX,
                margin: 0,
                padding: 4,
                border: '1px dashed var(--teal)',
                background: 'rgba(255,255,255,0.8)',
                color: t.color,
                fontSize: `${t.size * scale}px`,
                fontFamily: 'Kanit, sans-serif',
                lineHeight: 1.2,
                outline: 'none',
                resize: 'none',
                minWidth: 200,
                minHeight: 100,
                overflow: 'hidden',
                zIndex: 100,
                borderRadius: 4
             }}
           />
         );
      })()}
    </div>
  );
}
