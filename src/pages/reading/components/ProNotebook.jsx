import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Path, Group, Circle, Text, Rect, Transformer } from 'react-konva';
import Draggable from 'react-draggable';
import { PenTool, Highlighter, Eraser, MousePointer2, Type, Square, Hand, Search, Save, Download, Undo2, Redo2, Image as ImageIcon, Mic, SquareSquare, ChevronLeft, ChevronRight, Settings, FilePlus, Circle as CircleIcon, Minus, Lasso, MonitorPlay, Zap, GripHorizontal } from 'lucide-react';
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
  
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < 768;
  const isDesktop = windowWidth >= 1024;
  
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
  
  const [showToolSettings, setShowToolSettings] = useState(false);
  
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
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
      
      {/* Huawei Notes Top Navigation Bar */}
      {!isMobile && (
         <div style={{ height: 56, flexShrink: 0, width: '100%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 50, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
               <button onClick={() => window.history.back()} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={24} strokeWidth={1.5} />
               </button>
               <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{activeBook?.book?.title || 'สมุดโน้ต'}</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
               <button onClick={() => setShowSearch(!showSearch)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Search size={20} strokeWidth={1.5} />
               </button>
               <button onClick={() => setShowPageManager(true)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SquareSquare size={20} strokeWidth={1.5} />
               </button>
               <button onClick={saveNotebook} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Save size={20} strokeWidth={1.5} />
               </button>
               <button onClick={exportPage} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Download size={20} strokeWidth={1.5} />
               </button>
               <button onClick={() => setShowPageSettings(!showPageSettings)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: showPageSettings ? '#F3F4F6' : 'transparent', color: showPageSettings ? '#111827' : '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  <Settings size={20} strokeWidth={1.5} />
               </button>

               {/* Page Settings Popover */}
               {showPageSettings && (
                 <div style={{ position: 'absolute', top: 56, right: 0, zIndex: 60, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: 16, borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.05)', width: 260 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#111827' }}>ลวดลายกระดาษ</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                       {['blank', 'lines', 'grid', 'dots'].map(pt => (
                         <button key={pt} onClick={() => updatePage(currentPageIndex, p => { p.paperType = pt; pushHistory(); })} style={{ padding: '8px', borderRadius: 8, border: currentPage.paperType === pt ? '2px solid #111827' : '1px solid #E5E7EB', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4B5563' }}>
                           {pt === 'blank' ? 'กระดาษเปล่า' : pt === 'lines' ? 'เส้นบรรทัด' : pt === 'grid' ? 'ตาราง (Grid)' : 'จุด (Dots)'}
                         </button>
                       ))}
                    </div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#111827' }}>สีพื้นหลังกระดาษ</h4>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                       {['white', 'yellow', 'dark'].map(pc => (
                         <button key={pc} onClick={() => updatePage(currentPageIndex, p => { p.paperColor = pc; pushHistory(); })} style={{ width: 32, height: 32, borderRadius: '50%', border: currentPage.paperColor === pc ? '2px solid #111827' : '1px solid #E5E7EB', background: pc === 'yellow' ? '#FEF3C7' : pc === 'dark' ? '#1F2937' : 'white', cursor: 'pointer' }} />
                       ))}
                    </div>
                    
                    <div style={{ height: 1, background: '#E5E7EB', margin: '12px 0' }}></div>
                    
                    <button onClick={clearPage} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>ลบเนื้อหาในหน้านี้</button>
                    <button onClick={deletePage} disabled={pages.length <= 1} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: pages.length <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: pages.length <= 1 ? 0.5 : 1 }}>ลบหน้านี้ทิ้ง</button>
                 </div>
               )}
            </div>
         </div>
      )}

      <div ref={containerRef} style={{ flex: 1, position: 'relative', display: 'flex' }}>
      
      {showModeSelection && !isMobile && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
           <h3 style={{ fontSize: 24, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Start your visual thinking</h3>
           <p style={{ fontSize: 15, color: '#4B5563', marginBottom: 32, textAlign: 'center' }}>Choose a starting canvas for your notebook.</p>
           <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
             <button onClick={() => setShowModeSelection(false)} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid var(--br2)', background: 'white', color: '#111827', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
               <SquareSquare size={20} /> Blank Canvas
             </button>
             <button onClick={() => document.getElementById('pdf-upload').click()} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid #10B981', background: 'white', color: '#10B981', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
               <Download size={20} /> Upload PDF
             </button>
           </div>
         </div>
      )}
      
      {isMobile && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
           <MonitorPlay size={48} color="#10B981" style={{ marginBottom: 16 }} />
           <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>หน้าจอเล็กเกินไป</h3>
           <p style={{ fontSize: 15, color: '#4B5563' }}>กรุณาเปิดแอปนี้บน Tablet หรือ Computer (Desktop) เพื่อใช้งานระบบจดโน้ตแบบสมบูรณ์</p>
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
                    {!p.src && p.paperType !== 'blank' && <SquareSquare size={24} color="#9CA3AF" opacity={0.3} />}
                    {p.lines.length > 0 && <PenTool size={16} color="#10B981" style={{ position: 'absolute', bottom: 4, right: 4 }} />}
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
           <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Loading PDF...</span>
         </div>
      )}

      {/* Huawei Notes Unified Draggable Floating Toolbar (Tablet & Desktop) */}
      {!isMobile && (
        <Draggable handle=".huawei-drag-handle">
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: '6px 8px', borderRadius: 16, display: 'flex', gap: 4, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)', flexWrap: 'nowrap', alignItems: 'center' }}>
            
            <div className="huawei-drag-handle" style={{ cursor: 'grab', color: '#D1D5DB', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <GripHorizontal size={16} strokeWidth={2} />
            </div>
            
            <button onClick={undo} disabled={!canUndo} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: canUndo ? '#4B5563' : '#D1D5DB', cursor: canUndo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Undo2 size={20} strokeWidth={1.5} />
            </button>
            <button onClick={redo} disabled={!canRedo} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: canRedo ? '#4B5563' : '#D1D5DB', cursor: canRedo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Redo2 size={20} strokeWidth={1.5} />
            </button>
            
            <div style={{ width: 1, background: '#E5E7EB', margin: '0 6px', height: 24 }}></div>
            
            {[
              { id: 'pan', icon: MousePointer2 },
              { id: 'pen', icon: PenTool },
              { id: 'highlighter', icon: Highlighter },
              { id: 'eraser', icon: Eraser },
              { id: 'lasso', icon: Lasso },
              { id: 'text', icon: Type },
              { id: 'laser', icon: Zap }
            ].map(t => (
               <button 
                 key={t.id}
                 onClick={() => { setTool(t.id); if (t.id === tool && (t.id === 'pen' || t.id === 'highlighter' || t.id === 'text' || t.id === 'shape')) setShowToolSettings(!showToolSettings); else setShowToolSettings(true); }}
                 style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: tool === t.id ? '#F3F4F6' : 'transparent', color: tool === t.id ? '#111827' : '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', position: 'relative' }}
               >
                 <t.icon size={20} strokeWidth={1.5} />
                 {tool === t.id && (t.id === 'pen' || t.id === 'highlighter' || t.id === 'text') && <div style={{ position: 'absolute', bottom: 4, width: 16, height: 2, borderRadius: 2, background: '#111827' }}></div>}
               </button>
            ))}
            
            <div style={{ width: 1, background: '#E5E7EB', margin: '0 6px', height: 24 }}></div>
            
            <button onClick={() => document.getElementById('image-upload').click()} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: 'transparent', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ImageIcon size={20} strokeWidth={1.5} />
            </button>
            
            <button onClick={toggleRecording} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: isRecording ? '#FEE2E2' : 'transparent', color: isRecording ? '#EF4444' : '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', animation: isRecording ? 'pulse 1.5s infinite' : 'none' }}>
              <Mic size={20} strokeWidth={1.5} />
            </button>
            
            {/* Huawei Glassmorphism Popover for Tool Settings (Attached below Pill) */}
            {showToolSettings && (tool === 'pen' || tool === 'highlighter' || tool === 'text') && (
              <div style={{ position: 'absolute', top: '100%', marginTop: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: '16px 20px', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.05)', width: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
                 
                 {/* Thickness Slider */}
                 <div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                     <span style={{ fontSize: 13, fontWeight: 500, color: '#4B5563' }}>ความหนา (Thickness)</span>
                     <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{penSize}px</span>
                   </div>
                   <input type="range" min="1" max="24" step="1" value={penSize} onChange={(e) => setPenSize(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#111827' }} />
                 </div>
                 
                 {/* Color Palette (Tightly Packed) */}
                 <div>
                   <span style={{ fontSize: 13, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 12 }}>สี (Color)</span>
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                     {colors.slice(0, 10).map(c => (
                        <div key={c} onClick={() => setPenColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: c === '#FFFFFF' ? '1px solid #E5E7EB' : 'none', outline: penColor === c ? '2px solid #111827' : 'none', outlineOffset: 2, transition: 'all 0.1s' }} />
                     ))}
                   </div>
                 </div>
              </div>
            )}
          </div>
        </Draggable>
      )}
      
      {/* Small Page Indicator (Huawei Style) */}
      {!isMobile && (
        <div style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 5, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: '6px 16px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <button 
            onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
            disabled={currentPageIndex === 0}
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', cursor: currentPageIndex === 0 ? 'default' : 'pointer', opacity: currentPageIndex === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5563' }}>
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>
            {currentPageIndex + 1} / {pages.length}
          </span>
          
          <button 
            onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
            disabled={currentPageIndex === pages.length - 1}
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', cursor: currentPageIndex === pages.length - 1 ? 'default' : 'pointer', opacity: currentPageIndex === pages.length - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5563' }}>
            <ChevronRight size={20} strokeWidth={1.5} />
          </button>
          
          <div style={{ width: 1, background: '#E5E7EB', height: 16 }}></div>
          
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
            style={{ padding: '4px 12px', borderRadius: 100, border: 'none', background: '#F3F4F6', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 12, transition: 'all 0.2s' }}>
            <FilePlus size={14} strokeWidth={2} />
            เพิ่มหน้า
          </button>
        </div>
      )}

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
      </div>{/* End flex-1 Canvas Container */}
    </div>
  );
}
