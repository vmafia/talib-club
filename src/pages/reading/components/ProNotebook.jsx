import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Path, Group, Circle, Text, Rect, Transformer, RegularPolygon, Line } from 'react-konva';
import Draggable from 'react-draggable';
import { PenTool, Highlighter, Eraser, Pen, MousePointer2, Type, Square, Hand, Search, Save, Download, Undo2, Redo2, Image as ImageIcon, Mic, SquareSquare, ChevronLeft, ChevronRight, Settings, FilePlus, Circle as CircleIcon, Minus, Lasso, MonitorPlay, Zap, GripHorizontal, GripVertical, Pencil, Pointer, LayoutGrid, Plus, Columns, StickyNote, FileText, Bookmark, FileStack, LayoutList, Check, Lock, MousePointerClick, Move3d, Triangle, Cloud, CheckCircle, Trash2, Scissors, Crop } from 'lucide-react';
import CropModal from './CropModal';
import useImage from 'use-image';
import getStroke from 'perfect-freehand';
import toast from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { uploadNotebookData, downloadNotebookData } from '../../../utils/notebookStorage.js';
import { db, storage } from '../../../lib/firebase.js';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

// Drag-to-scroll hook for touchpads and mouse
const useDragScroll = () => {
  const ref = useRef(null);
  
  const onMouseDown = (e) => {
    if (!ref.current) return;
    const ele = ref.current;
    ele.dataset.isDown = "true";
    ele.dataset.startX = e.pageX - ele.offsetLeft;
    ele.dataset.scrollLeft = ele.scrollLeft;
  };
  const onMouseLeave = () => { if (ref.current) ref.current.dataset.isDown = "false"; };
  const onMouseUp = () => { if (ref.current) ref.current.dataset.isDown = "false"; };
  const onMouseMove = (e) => {
    if (!ref.current || ref.current.dataset.isDown !== "true") return;
    e.preventDefault();
    const ele = ref.current;
    const x = e.pageX - ele.offsetLeft;
    const walk = (x - parseFloat(ele.dataset.startX)) * 1.5;
    ele.scrollLeft = parseFloat(ele.dataset.scrollLeft) - walk;
  };
  return { ref, onMouseDown, onMouseLeave, onMouseUp, onMouseMove };
};

export default function ProNotebook({ bookId, uid, activeBook, readonly = false }) {
  const leftToolbarScroll = useDragScroll();
  const rightToolbarScroll = useDragScroll();
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [pages, setPages] = useState([{ id: 'page-default', src: null, width: 800, height: 1130, lines: [], stickers: [], images: [], texts: [], shapes: [], paperType: 'lines', paperColor: 'white' }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < 768;
  const isDesktop = windowWidth >= 1024;
  
  const notebookId = bookId || 'default';
  
  useEffect(() => {
     const loadData = async () => {
        toast.loading("กำลังซิงก์ข้อมูลคลาวด์...", { id: "cloud-sync" });
        try {
           const cloudData = await downloadNotebookData(uid, notebookId);
           if (cloudData && cloudData.length > 0) {
              setPages(cloudData);
              toast.success("ซิงก์ข้อมูลสำเร็จ!", { id: "cloud-sync" });
           } else {
              toast.dismiss("cloud-sync");
           }
        } catch (e) {
           console.error("Cloud load failed", e);
           const saved = localStorage.getItem(`talib_notebook_${notebookId}`);
           if (saved) {
              setPages(JSON.parse(saved));
              toast.error("ออฟไลน์: โหลดจากเครื่องแทน", { id: "cloud-sync" });
           } else {
              toast.dismiss("cloud-sync");
           }
        }
     };
     
     if (uid && notebookId !== 'default') {
        loadData();
     } else {
        const saved = localStorage.getItem(`talib_notebook_${notebookId}`);
        if (saved) {
           try { setPages(JSON.parse(saved)); } catch (e) {}
        }
     }
  }, [notebookId, uid]);
  
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  
  const [tool, setTool] = useState('pen'); // 'pen', 'pencil', 'highlighter', 'eraser', 'pan', 'text', 'laser', 'shape', 'lasso'
  const [shapeType, setShapeType] = useState('rect'); // 'rect', 'circle', 'line'
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setIsSpaceDown(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  const [showToolSettings, setShowToolSettings] = useState(false);
  
  const [laserLines, setLaserLines] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const isEditingText = useRef(false);
  const textareaRef = useRef(null);
  
  useEffect(() => {
     if (editingTextId && textareaRef.current) {
        setTimeout(() => {
           textareaRef.current?.focus();
        }, 150);
     }
  }, [editingTextId]);

  const [editingStickerId, setEditingStickerId] = useState(null);
  const [editingStickerValue, setEditingStickerValue] = useState("");
  
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
    if (showToolSettings) setShowToolSettings(false);
  };
  
  const colors = [
    '#111827', '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#06B6D4', 
    '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF', '#F43F5E', '#78716C', '#FFFFFF'
  ];
  const sizes = [2, 4, 6, 8, 12, 16, 24];
  const [penColor, setPenColor] = useState('#111827');
  const [penSize, setPenSize] = useState(4);
  const [penOpacity, setPenOpacity] = useState(1);
  const [stickerStyle, setStickerStyle] = useState('classic');
  const [eraserSettings, setEraserSettings] = useState({ eraseLines: true, eraseHighlighterOnly: false, pressureSensitive: true });
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [croppingImageId, setCroppingImageId] = useState(null);
  
  // History State
  const pagesRef = useRef(pages);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    if (readonly || !pages || pages.length === 0) return;
    
    // Simple debounce to auto-save to firebase
    const timer = setTimeout(() => {
       saveNotebook(true); // isAuto = true
    }, 5000); // 5 seconds debounce
    
    return () => clearTimeout(timer);
  }, [pages, readonly]);

  useEffect(() => {
     if (tool !== 'lasso' && selectedLassoLines.length > 0) {
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
  }, [tool]);
  
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

  // Auto-fit scale on mount and resize
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
       const currentPage = pages[currentPageIndex] || { width: 800, height: 1130 };
       const paddingX = isMobile ? 10 : 20;
       const paddingY = isMobile ? 10 : 32; 
       const availableWidth = dimensions.width - (paddingX * 2);
       const availableHeight = dimensions.height - (paddingY * 2) - 52; // Account for toolbar
       
       const scaleX = availableWidth / currentPage.width;
       const scaleY = availableHeight / currentPage.height;
       
       let newScale = availableWidth / currentPage.width;
       
       // On desktop, don't let it be massively wide if the screen is very wide
       if (!isMobile && newScale > 1.2) {
           newScale = 1.2;
       }
       
       if (newScale > 2.0) newScale = 2.0;
       if (newScale < 0.1) newScale = 0.1;
       
       setScale(newScale);
       
       const scaledHeight = currentPage.height * newScale;
       const yPos = 40; // Default top padding
       setPosition({ x: 0, y: yPos });
    }
  }, [dimensions.width, dimensions.height, currentPageIndex, isMobile]);

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
      
      toast.loading(`กำลังแยกหน้า PDF (0/${numPages})...`, { id: 'pdf-load' });
      
      let extractedPages = [];
      for (let i = 1; i <= numPages; i++) {
        toast.loading(`กำลังแยกหน้า PDF (${i}/${numPages})...`, { id: 'pdf-load' });
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: isMobile ? 1.2 : 2.0 }); 
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: context, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Use JPEG instead of PNG for memory optimization on large PDFs
        
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

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      if (file.size > 50 * 1024 * 1024) {
         toast.error('ไฟล์ PDF มีขนาดใหญ่เกิน 50MB');
         return;
      }
      try {
         const localPdfUrl = URL.createObjectURL(file);
         toast.success('โหลดไฟล์สำเร็จ!', { id: 'pdf-upload' });
         startLoadingPDF(localPdfUrl);
      } catch (err) {
         console.error(err);
         toast.error('โหลดไฟล์ล้มเหลว', { id: 'pdf-upload' });
      }
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
        
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const localUrl = URL.createObjectURL(audioBlob);
          
          const stickerId = `audio-${Date.now()}`;
          let stickerX = 100;
          let stickerY = 100;
          
          updatePage(targetPageIndex, (page) => {
             if (!page.stickers) page.stickers = [];
             page.stickers.push({
               id: stickerId,
               x: stickerX,
               y: stickerY,
               audioUrl: localUrl,
               isPlaying: false,
               isUploading: true
             });
          });
          
          toast.loading('กำลังอัปโหลดเสียงลงคลาวด์...', { id: `upload-${stickerId}` });
          
          try {
             const storageRef = ref(storage, `user_audio/${uid}/${Date.now()}.webm`);
             await uploadBytes(storageRef, audioBlob);
             const downloadUrl = await getDownloadURL(storageRef);
             
             updatePage(targetPageIndex, (page) => {
                const s = page.stickers.find(st => st.id === stickerId);
                if (s) {
                   s.audioUrl = downloadUrl;
                   s.isUploading = false;
                }
             });
             toast.success('อัปโหลดเสียงเสร็จสิ้น!', { id: `upload-${stickerId}`, icon: '🎤' });
          } catch (err) {
             console.error(err);
             toast.error('อัปโหลดเสียงล้มเหลว', { id: `upload-${stickerId}` });
             updatePage(targetPageIndex, (page) => {
                const s = page.stickers.find(st => st.id === stickerId);
                if (s) s.isUploading = false;
             });
          }
          
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
    undoStack.current.push(JSON.parse(JSON.stringify(pagesRef.current)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    const previousState = undoStack.current.pop();
    redoStack.current.push(JSON.parse(JSON.stringify(pagesRef.current)));
    setPages(previousState);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    const nextState = redoStack.current.pop();
    undoStack.current.push(JSON.parse(JSON.stringify(pagesRef.current)));
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

  const clearStrokes = () => {
    pushHistory();
    updatePage(currentPageIndex, (page) => {
       page.lines = [];
    });
    toast.success('ล้างเส้นทั้งหมดแล้ว');
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    updatePage(currentPageIndex, (page) => {
       if (page.texts) page.texts = page.texts.filter(tx => tx.id !== selectedId);
       if (page.stickers) page.stickers = page.stickers.filter(st => st.id !== selectedId);
       if (page.images) page.images = page.images.filter(img => img.id !== selectedId);
       if (page.shapes) page.shapes = page.shapes.filter(sh => sh.id !== selectedId);
    });
    selectShape(null);
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

  const saveNotebook = async (isAuto = false) => {
     if (readonly) return;
     setIsSaving(true);
     if (!isAuto) toast.loading("กำลังบันทึกลงคลาวด์...", { id: "cloud-save" });
     try {
        await uploadNotebookData(uid, notebookId, pages);
        
        // Save metadata to Firestore
        const metadataRef = doc(db, 'content_notebooks', `${uid}_${notebookId}`);
        await setDoc(metadataRef, {
           uid,
           bookId: notebookId,
           title: activeBook?.book?.title || 'สมุดโน้ต',
           updatedAt: serverTimestamp(),
           coverColor: 'red',
        }, { merge: true });
        // Backup locally
        localStorage.setItem(`talib_notebook_${notebookId}`, JSON.stringify(pages));
        if (!isAuto) toast.success("บันทึกคลาวด์เรียบร้อย!", { id: "cloud-save", icon: '💾' });
     } catch (err) {
        console.error(err);
        localStorage.setItem(`talib_notebook_${notebookId}`, JSON.stringify(pages));
        toast.error("บันทึกคลาวด์ล้มเหลว (เซฟลงเครื่องแล้ว)", { id: "cloud-save" });
     } finally {
        setTimeout(() => setIsSaving(false), 1500);
     }
  };
  const handleAddPage = () => {
    const currentPage = pages[currentPageIndex] || {};
    const newPage = { id: `blank-${Date.now()}`, src: null, width: dimensions.width > 0 ? dimensions.width - 40 : 800, height: 1130, lines: [], stickers: [], images: [], texts: [], shapes: [], paperType: currentPage.paperType || 'blank', paperColor: currentPage.paperColor || '#ffffff', isBookmarked: false };
    pushHistory();
    setPages((prev) => {
      const p = [...prev];
      p.splice(currentPageIndex + 1, 0, newPage);
      return p;
    });
    setCurrentPageIndex(currentPageIndex + 1);
  };
  
  const toggleBookmark = () => {
    pushHistory();
    updatePage(currentPageIndex, (page) => {
       page.isBookmarked = !page.isBookmarked;
    });
    toast.success(pages[currentPageIndex]?.isBookmarked ? "ลบบุ๊คมาร์กแล้ว" : "เพิ่มบุ๊คมาร์กแล้ว");
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
    // If clicking on lasso group, don't bake, just return so they can drag it
    const targetName = e.target.name();
    const parentName = e.target.getParent()?.name();
    if (tool === 'lasso' && (targetName === 'lasso-group' || parentName === 'lasso-group')) {
       return;
    }

    checkDeselect(e);
  
    if (readonly || tool === 'pan' || isSpaceDown) return;
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    
    const relativeTime = isRecording && recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : null;
    
    if (tool === 'text') {
       if (editingTextId) {
           if (textareaRef.current) textareaRef.current.blur();
           return;
       }
       const newText = { id: `text-${Date.now()}`, text: '', x: pos.x, y: pos.y, color: penColor, size: penSize * 4 };
       pushHistory();
       updatePage(currentPageIndex, (page) => {
          if (!page.texts) page.texts = [];
          page.texts.push(newText);
       });
       setEditingTextId(newText.id);
       setEditingTextValue(newText.text);
       isEditingText.current = true;
       return;
    }
    
    if (tool === 'sticker') {
       const stickerColor = ['#FEF08A', '#FBCFE8', '#BAE6FD', '#BBF7D0'].includes(penColor) ? penColor : '#FEF08A';
       const newSticker = { id: `sticker-${Date.now()}`, x: pos.x, y: pos.y, color: stickerColor, text: '', style: stickerStyle };
       pushHistory();
       updatePage(currentPageIndex, (page) => {
          if (!page.stickers) page.stickers = [];
          page.stickers.push(newSticker);
       });
       setEditingStickerId(newSticker.id);
       setEditingStickerValue('');
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
          return; // Allow single tap to clear selection
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
    
    if (tool === 'eraser') {
       isDrawing.current = true;
       // Erase on click
       const eraserRadius = 20;
       updatePage(currentPageIndex, (page) => {
          if (page.shapes && eraserSettings.eraseLines && !eraserSettings.eraseHighlighterOnly) {
             page.shapes = page.shapes.filter(s => {
                const minX = Math.min(s.x1, s.x2); const maxX = Math.max(s.x1, s.x2);
                const minY = Math.min(s.y1, s.y2); const maxY = Math.max(s.y1, s.y2);
                if (pos.x >= minX - eraserRadius && pos.x <= maxX + eraserRadius && pos.y >= minY - eraserRadius && pos.y <= maxY + eraserRadius) return false;
                return true;
             });
          }
          if (page.texts) {
             page.texts = page.texts.filter(t => {
                if (pos.x >= t.x - eraserRadius && pos.x <= t.x + 200 + eraserRadius && pos.y >= t.y - eraserRadius && pos.y <= t.y + 50 + eraserRadius) return false;
                return true;
             });
          }
          if (page.stickers) {
             page.stickers = page.stickers.filter(st => {
                if (pos.x >= st.x - eraserRadius && pos.x <= st.x + 150 + eraserRadius && pos.y >= st.y - eraserRadius && pos.y <= st.y + 150 + eraserRadius) return false;
                return true;
             });
          }
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
    if (!isDrawing.current || tool === 'pan' || isSpaceDown) return;
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    
    if (tool === 'eraser') {
       const eraserRadius = 20;
       updatePage(currentPageIndex, (page) => {
          if (page.shapes && eraserSettings.eraseLines && !eraserSettings.eraseHighlighterOnly) {
             page.shapes = page.shapes.filter(s => {
                const minX = Math.min(s.x1, s.x2); const maxX = Math.max(s.x1, s.x2);
                const minY = Math.min(s.y1, s.y2); const maxY = Math.max(s.y1, s.y2);
                if (pos.x >= minX - eraserRadius && pos.x <= maxX + eraserRadius && pos.y >= minY - eraserRadius && pos.y <= maxY + eraserRadius) return false;
                return true;
             });
          }
          if (page.texts) {
             page.texts = page.texts.filter(t => {
                if (pos.x >= t.x - eraserRadius && pos.x <= t.x + 200 + eraserRadius && pos.y >= t.y - eraserRadius && pos.y <= t.y + 50 + eraserRadius) return false;
                return true;
             });
          }
          if (page.stickers) {
             page.stickers = page.stickers.filter(st => {
                if (pos.x >= st.x - eraserRadius && pos.x <= st.x + 150 + eraserRadius && pos.y >= st.y - eraserRadius && pos.y <= st.y + 150 + eraserRadius) return false;
                return true;
             });
          }
       });
       return;
    }
    
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

  // --- Multi-Touch Pan & Zoom ---
  const lastCenter = useRef(null);
  const lastDist = useRef(null);
  
  useEffect(() => {
    // Re-render when scale changes for textarea positioning
  }, [scale, position]);

  const handleTouchMove = (e) => {
    e.evt.preventDefault();
    if (e.evt.touches && e.evt.touches.length === 2) {
      // 2-finger gesture (Pan & Zoom)
      const touch1 = e.evt.touches[0];
      const touch2 = e.evt.touches[1];

      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };

      const newCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (lastCenter.current && lastDist.current) {
        const stage = stageRef.current;
        const oldScale = stage.scaleX();

        // Pan
        const dx = newCenter.x - lastCenter.current.x;
        const dy = newCenter.y - lastCenter.current.y;

        // Zoom
        const scaleBy = dist / lastDist.current;
        let newScale = oldScale * scaleBy;
        newScale = Math.max(0.1, Math.min(newScale, 5));

        // Center calculation for zoom
        const pointerPosition = {
           x: newCenter.x - stage.container().getBoundingClientRect().left,
           y: newCenter.y - stage.container().getBoundingClientRect().top
        };
        
        const mousePointTo = {
          x: (pointerPosition.x - position.x) / oldScale,
          y: (pointerPosition.y - position.y) / oldScale,
        };

        const newPos = {
          x: pointerPosition.x - mousePointTo.x * newScale + dx,
          y: pointerPosition.y - mousePointTo.y * newScale + dy,
        };

        setScale(newScale);
        setPosition(newPos);
      }

      lastCenter.current = newCenter;
      lastDist.current = dist;
    } else if (e.evt.touches && e.evt.touches.length === 1 && !lastCenter.current) {
       // Only process 1-finger draw if not coming out of a 2-finger gesture
       handlePointerMove();
    }
  };

  const handleTouchEnd = (e) => {
    if (!e.evt.touches || e.evt.touches.length < 2) {
      lastCenter.current = null;
      lastDist.current = null;
    }
    if (!e.evt.touches || e.evt.touches.length === 0) {
      handlePointerUp();
    }
  };

  const handleWheel = (e) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Zoom
      const stage = stageRef.current;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };

      // Math.exp handles both standard wheel and smooth trackpad pinch
      const scaleBy = Math.exp(-e.evt.deltaY / 300); 
      let newScale = oldScale * scaleBy;
      newScale = Math.max(0.1, Math.min(newScale, 5));
      
      setScale(newScale);
      setPosition({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else {
      // Pan (Trackpad 2-finger scroll works perfectly here via deltaX and deltaY)
      setPosition(prev => ({
        x: prev.x - e.evt.deltaX,
        y: prev.y - e.evt.deltaY
      }));
    }
  };
  
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        pushHistory();
        updatePage(currentPageIndex, (page) => {
           if (!page.images) page.images = [];
           page.images.push({
             id: `img-${Date.now()}`,
             src: base64,
             x: 100,
             y: 100,
             width: 300,
             height: 300
           });
        });
        toast.success('แทรกรูปภาพเรียบร้อย');
      };
      reader.readAsDataURL(file);
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
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEraserSettings, setShowEraserSettings] = useState(false);
  const [showLassoSettings, setShowLassoSettings] = useState(false);
  const [showShapeSettings, setShowShapeSettings] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);

  useEffect(() => {
     let interval;
     if (isRecording) {
        setRecordingTimer(0);
        interval = setInterval(() => {
           setRecordingTimer(prev => prev + 1);
        }, 1000);
     } else {
        setRecordingTimer(0);
     }
     return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (secs) => {
     const m = Math.floor(secs / 60);
     const s = secs % 60;
     return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
    <style>{`
      .hide-scroll::-webkit-scrollbar {
        display: none;
      }
      .hide-scroll {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    `}</style>
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
      
      {/* Huawei Notes Top Navigation Bar (Fixed App Header) */}
         <div style={{ height: 56, flexShrink: 0, width: '100%', background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 50, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
               <button onClick={() => window.history.back()} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={24} strokeWidth={1.5} />
               </button>
               {isSaving && (
                  <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                     <Cloud size={16} /> กำลังบันทึก...
                  </span>
               )}
               {!isSaving && !readonly && (
                  <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                     <CheckCircle size={16} /> บันทึกแล้ว
                  </span>
               )}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
               {!readonly && (
                 <>
                   <button onClick={handleAddPage} title="เพิ่มหน้าใหม่" style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#F3F4F6', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }}>
                      <FilePlus size={18} strokeWidth={1.5} /> เพิ่มหน้า
                   </button>
                   
                   <button onClick={() => document.getElementById('pdf-upload').click()} title="นำเข้า PDF" style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#E0E7FF', color: '#3B82F6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }}>
                      <FileText size={18} strokeWidth={1.5} /> PDF
                   </button>
                   
                   <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }}></div>
                   
                   <button onClick={() => setShowSearch(!showSearch)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Search size={22} strokeWidth={1.5} />
                   </button>

                   <button onClick={() => setShowPageManager(!showPageManager)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: showPageManager ? '#F3F4F6' : 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                      <Columns size={22} strokeWidth={1.5} />
                   </button>

                   <button onClick={() => setShowMoreMenu(!showMoreMenu)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: showMoreMenu ? '#F3F4F6' : 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                      <LayoutGrid size={22} strokeWidth={1.5} />
                   </button>
                 </>
               )}
               {readonly && (
                 <button onClick={exportPage} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: 'var(--teal)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                    <Download size={18} strokeWidth={2} /> Export Image
                 </button>
               )}

               {/* More Menu Dropdown */}
               {showMoreMenu && !readonly && (
                 <div style={{ position: 'absolute', top: 56, right: 0, zIndex: 60, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: 8, borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.05)', width: 280, display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => { document.getElementById('image-upload').click(); setShowMoreMenu(false); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <ImageIcon size={20} strokeWidth={1.5} color="#4B5563" /> นำเข้ารูปภาพ
                    </button>
                    <div style={{ height: 1, background: '#F3F4F6', margin: '4px 0' }}></div>
                    <button onClick={() => setShowPageSettings(true)} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Settings size={20} strokeWidth={1.5} color="#4B5563" /> เปลี่ยนแม่แบบกระดาษ
                    </button>
                    <button onClick={toggleBookmark} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Bookmark size={20} strokeWidth={1.5} color={pages[currentPageIndex]?.isBookmarked ? "#F59E0B" : "#4B5563"} fill={pages[currentPageIndex]?.isBookmarked ? "#F59E0B" : "none"} /> {pages[currentPageIndex]?.isBookmarked ? "ลบบุ๊คมาร์ก" : "บุ๊คมาร์กหน้า"}
                    </button>
                    <div style={{ height: 1, background: '#F3F4F6', margin: '4px 0' }}></div>
                    <button onClick={clearPage} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Eraser size={20} strokeWidth={1.5} color="#4B5563" /> ล้างหน้า
                    </button>
                    <button onClick={deletePage} disabled={pages.length <= 1} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: pages.length <= 1 ? '#D1D5DB' : '#EF4444', cursor: pages.length <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Minus size={20} strokeWidth={1.5} color={pages.length <= 1 ? '#D1D5DB' : '#EF4444'} /> ลบหน้า
                    </button>
                    <div style={{ height: 1, background: '#F3F4F6', margin: '4px 0' }}></div>
                    <button style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Lock size={20} strokeWidth={1.5} color="#4B5563" /> เพิ่มการล็อค
                    </button>
                 </div>
               )}
            </div>
         </div>

      {/* Floating Recording Indicator */}
      {isRecording && (
         <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', padding: '8px 16px', borderRadius: 24, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite' }}></div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827', fontFamily: 'Kanit, sans-serif' }}>{formatTime(recordingTimer)}</span>
            <button onClick={toggleRecording} style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 16, border: 'none', background: '#FEE2E2', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}>
               หยุด
            </button>
         </div>
      )}

      {/* NEW: Huawei Notes Main Toolbar (Sticky & Split layout) */}
      {!readonly && (
         <div style={{ position: 'relative', zIndex: 40, width: '100%' }}>
            <div style={{ height: 52, flexShrink: 0, width: '100%', background: 'white', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
               
               {/* Left Half: Tools (Scrollable) */}
               <div 
                  className="hide-scroll" 
                  style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
                  onWheel={(e) => {
                     if (e.deltaY !== 0) {
                        e.currentTarget.scrollLeft += e.deltaY;
                     }
                  }}
                  {...leftToolbarScroll}
               >
                  <button onClick={undo} disabled={!canUndo} className="cancel-drag" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: canUndo ? '#4B5563' : '#D1D5DB', cursor: canUndo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Undo2 size={20} strokeWidth={1.5} />
                  </button>
                  <button onClick={redo} disabled={!canRedo} className="cancel-drag" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: canRedo ? '#4B5563' : '#D1D5DB', cursor: canRedo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Redo2 size={20} strokeWidth={1.5} />
                  </button>
                  
                  <div style={{ width: 1, background: '#E5E7EB', height: 24, flexShrink: 0, margin: '0 8px' }}></div>
                  
                  {[
                    { id: 'pan', icon: Pointer, title: 'เลื่อนกระดาน' },
                    { id: 'pen', icon: PenTool, title: 'ปากกาลูกลื่น' },
                    
                    { id: 'pencil', icon: Pencil, title: 'ดินสอ' },
                    { id: 'marker', icon: Pen, title: 'มาร์กเกอร์' },
                    { id: 'highlighter', icon: Highlighter, title: 'ไฮไลท์' },
                    { id: 'eraser', icon: Eraser, title: 'ยางลบ' },
                    { id: 'lasso', icon: Lasso, title: 'Lasso' },
                    { id: 'text', icon: Type, title: 'ข้อความ' },
                    { id: 'shape', icon: Square, title: 'รูปร่าง' },
                    { id: 'image', icon: ImageIcon, title: 'แทรกรูปภาพ' },
                    { id: 'sticker', icon: StickyNote, title: 'โพสต์อิท' },
                    { id: 'laser', icon: Zap, title: 'เลเซอร์' },
                    { id: 'mic', icon: Mic, title: 'อัดเสียง' }
                  ].map(t => (
                     <button 
                       key={t.id}
                       title={t.title}
                       onClick={() => {
                          if (t.id === 'image') document.getElementById('image-upload').click();
                          else if (t.id === 'mic') toggleRecording();
                          else {
                             setTool(t.id); 
                          }
                       }}
                       style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: tool === t.id && !['image','mic'].includes(t.id) ? '#E0E7FF' : 'transparent', color: tool === t.id && !['image','mic'].includes(t.id) ? '#3B82F6' : (t.id === 'mic' && isRecording ? '#EF4444' : '#4B5563'), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', position: 'relative' }}
                     >
                       <t.icon size={18} strokeWidth={1.5} />
                       {t.id === 'mic' && isRecording && <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }}></div>}
                     </button>
                  ))}

                  {selectedId && (
                     <>
                        <div style={{ width: 1, background: '#E5E7EB', height: 24, flexShrink: 0, margin: '0 8px' }}></div>
                        {currentPage.images?.find(i => i.id === selectedId) && (
                           <button onClick={() => setCroppingImageId(selectedId)} title="ครอบตัด" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: '#E0F2FE', color: '#0369A1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', marginRight: 4 }}>
                              <Scissors size={18} strokeWidth={1.5} />
                           </button>
                        )}
                        <button onClick={deleteSelected} title="ลบทิ้ง" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                           <Trash2 size={18} strokeWidth={1.5} />
                        </button>
                     </>
                  )}
               </div>

               {/* Right Half: Tool Options (Fixed/Scrollable Context) */}
               <div className="hide-scroll" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderLeft: '1px solid #E5E7EB', paddingLeft: 12, overflowX: 'auto', maxWidth: '45%' }} onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY; }} {...rightToolbarScroll}>
                  {['pen', 'marker', 'pencil', 'highlighter', 'shape'].includes(tool) && (
                     <>
                        {tool === 'shape' && (
                           <div style={{ display: 'flex', gap: 4, marginRight: 8, flexShrink: 0 }}>
                              <Square size={24} strokeWidth={1.5} color={shapeType === 'rect' ? '#3B82F6' : '#9CA3AF'} style={{cursor:'pointer'}} onClick={() => setShapeType('rect')} />
                              <Circle size={24} strokeWidth={1.5} color={shapeType === 'circle' ? '#3B82F6' : '#9CA3AF'} style={{cursor:'pointer'}} onClick={() => setShapeType('circle')} />
                              <Triangle size={24} strokeWidth={1.5} color={shapeType === 'triangle' ? '#3B82F6' : '#9CA3AF'} style={{cursor:'pointer'}} onClick={() => setShapeType('triangle')} />
                              <Minus size={24} strokeWidth={1.5} color={shapeType === 'line' ? '#3B82F6' : '#9CA3AF'} style={{cursor:'pointer'}} onClick={() => setShapeType('line')} />
                           </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                           {['#3B82F6', '#1D4ED8', '#111827', '#10B981', '#8B5CF6', '#EF4444'].map(c => (
                              <div key={c} onClick={() => setPenColor(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: penColor === c ? '2px solid #3B82F6' : '2px solid transparent', boxShadow: '0 0 0 1px rgba(0,0,0,0.05)', outline: penColor === c ? '2px solid white' : 'none', outlineOffset: -2 }} />
                           ))}
                        </div>
                        <div style={{ width: 1, background: '#E5E7EB', height: 20, flexShrink: 0 }}></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                           <input type="range" min="1" max="48" step="1" value={penSize} onChange={(e) => setPenSize(parseInt(e.target.value))} style={{ width: 60, accentColor: '#3B82F6', cursor: 'pointer' }} />
                           <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', width: 20 }}>{penSize}</span>
                        </div>
                     </>
                  )}

                  {tool === 'sticker' && (
                     <>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {['#FEF08A', '#FBCFE8', '#BAE6FD', '#BBF7D0'].map(c => (
                             <div key={c} onClick={() => setPenColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', outline: penColor === c ? '2px solid #3B82F6' : 'none', outlineOffset: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                          ))}
                        </div>
                        <div style={{ width: 1, background: '#E5E7EB', height: 20, flexShrink: 0 }}></div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                           {['classic', 'pin', 'tape', 'round'].map(s => (
                              <button key={s} onClick={() => setStickerStyle(s)} style={{ padding: '4px 8px', background: stickerStyle === s ? '#E0F2FE' : '#F3F4F6', color: stickerStyle === s ? '#0369A1' : '#4B5563', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                 {s === 'classic' ? 'คลาสสิก' : s === 'pin' ? 'หมุดปัก' : s === 'tape' ? 'เทปกาว' : 'โค้งมน'}
                              </button>
                           ))}
                        </div>
                     </>
                  )}

                  {tool === 'eraser' && (
                     <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4B5563', cursor: 'pointer', fontWeight: 500 }}>
                           <input type="checkbox" checked={eraserSettings.eraseLines} onChange={() => setEraserSettings(s => ({...s, eraseLines: !s.eraseLines}))} />
                           ลบเส้น
                        </label>
                        <button onClick={clearStrokes} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'white', color: '#EF4444', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>ล้างเส้นทั้งหมด</button>
                     </div>
                  )}
               </div>
            </div>
         </div>
      )}

      <div ref={containerRef} style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
      
      {showModeSelection && (
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
        onTouchStart={(e) => { if (e.evt.touches && e.evt.touches.length === 1) handlePointerDown(e); }}
        onMouseMove={handlePointerMove}
        onTouchMove={handleTouchMove}
        onMouseUp={handlePointerUp}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        draggable={readonly || tool === 'pan'}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        style={{ cursor: readonly || tool === 'pan' ? 'grab' : 'crosshair' }}
      >
        {/* Background Layer (Paper + PDF + Images) */}
        <Layer>
          <Group x={pageX} y={pageY} clipX={0} clipY={0} clipWidth={currentPage.width} clipHeight={currentPage.height}>
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
                scaleX={img.scaleX || 1}
                scaleY={img.scaleY || 1}
                rotation={img.rotation || 0}
                draggable={tool === 'pan'}
                onDragEnd={(e) => {
                  const { x, y } = e.target.position();
                  updatePage(currentPageIndex, (page) => {
                    const i = page.images.find(im => im.id === img.id);
                    if(i) { i.x = x; i.y = y; }
                  });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  updatePage(currentPageIndex, (page) => {
                    const i = page.images.find(im => im.id === img.id);
                    if(i) {
                       i.x = node.x();
                       i.y = node.y();
                       i.scaleX = node.scaleX();
                       i.scaleY = node.scaleY();
                       i.rotation = node.rotation();
                    }
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
                 scaleX: s.scaleX || 1, scaleY: s.scaleY || 1, rotation: s.rotation || 0,
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
                 },
                 onTransformEnd: (e) => {
                    const node = e.target;
                    updatePage(currentPageIndex, (page) => {
                       const shp = page.shapes.find(sh => sh.id === s.id);
                       if (shp) {
                          shp.x1 = node.x();
                          shp.y1 = node.y();
                          shp.scaleX = node.scaleX();
                          shp.scaleY = node.scaleY();
                          shp.rotation = node.rotation();
                       }
                    });
                 }
              };
              
              if (s.type === 'rect') {
                 return <Rect key={s.id} {...shapeProps} width={width} height={height} dash={s.isDashed ? [10, 5] : []} />;
              } else if (s.type === 'circle') {
                 const radius = Math.sqrt(width * width + height * height);
                 return <Circle key={s.id} {...shapeProps} radius={radius} />;
              } else if (s.type === 'triangle') {
                 const radius = Math.sqrt(width * width + height * height);
                 return <RegularPolygon key={s.id} {...shapeProps} sides={3} radius={radius} />;
              } else if (s.type === 'line') {
                 return <Path key={s.id} {...shapeProps} data={`M 0 0 L ${width} ${height}`} lineCap="round" lineJoin="round" />;
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
              
              if (isPencil) {
                 return (
                    <Line
                       key={i}
                       points={line.points}
                       stroke={line.color || '#111827'}
                       strokeWidth={Math.max(1, (line.size || 4) * 0.4)}
                       tension={0.1}
                       lineCap="square"
                       lineJoin="miter"
                       opacity={line.opacity ? line.opacity * 0.7 : 0.7}
                       globalCompositeOperation="source-over"
                       dash={[1, 1.5]}
                       shadowColor={line.color || '#111827'}
                       shadowBlur={1}
                       shadowOpacity={0.5}
                    />
                 );
              }
              
              const strokeOptions = { 
                 size: isEraser ? 24 : isHighlighter ? (line.size || 4) * 3 : (line.size || 4), 
                 thinning: isHighlighter ? 0 : 0.5,
                 smoothing: 0.5, 
                 streamline: 0.5 
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
            

            {/* Lasso Selection Rect */}
            {tool === 'lasso' && lassoRect && selectedLassoLines.length === 0 && (
               <Rect x={lassoRect.x} y={lassoRect.y} width={lassoRect.w} height={lassoRect.h} stroke="var(--teal)" strokeWidth={1} dash={[5, 5]} fill="rgba(0, 169, 143, 0.1)" />
            )}
            
            {/* Lasso Selected Group */}
            {/* Lasso Selection Box */}
            {selectedLassoLines.length > 0 && (
               <Group 
                 name="lasso-group"
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
                     
                     if (isPencil) {
                        return (
                           <Line
                              key={`lasso-line-${i}`}
                              points={line.points}
                              stroke={line.color || '#111827'}
                              strokeWidth={Math.max(1, (line.size || 4) * 0.4)}
                              tension={0.1}
                              lineCap="square"
                              lineJoin="miter"
                              opacity={line.opacity ? line.opacity * 0.7 : 0.7}
                              globalCompositeOperation="source-over"
                              dash={[1, 1.5]}
                              shadowColor={line.color || '#111827'}
                              shadowBlur={1}
                              shadowOpacity={0.5}
                           />
                        );
                     }
                     
                     const strokeOptions = { 
                        size: isEraser ? 24 : isHighlighter ? (line.size || 4) * 3 : (line.size || 4), 
                        thinning: isHighlighter ? 0 : 0.5,
                        smoothing: 0.5, 
                        streamline: 0.5 
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
                      isEditingText.current = true;
                   }
                }}
                onTap={() => {
                   if (tool === 'pan' || tool === 'lasso') {
                      selectShape(t.id);
                   } else if (tool === 'text') {
                      setEditingTextId(t.id);
                      setEditingTextValue(t.text);
                      isEditingText.current = true;
                   }
                }}
              >
                {editingTextId !== t.id && (
                  <Text text={t.text} fontSize={t.size} fill={t.color} fontFamily="Kanit, sans-serif" padding={4} />
                )}
              </Group>
            ))}
            
            {/* Stickers */}
            {currentPage.stickers && currentPage.stickers.map(st => {
              if (st.audioUrl) {
                // Audio Sticker
                return (
                  <Group 
                    key={st.id}
                    id={st.id}
                    name="object"
                    x={st.x}
                    y={st.y}
                    scaleX={st.scaleX || 1}
                    scaleY={st.scaleY || 1}
                    rotation={st.rotation || 0}
                    draggable={tool === 'pan'}
                    onDragEnd={(e) => {
                      updatePage(currentPageIndex, (page) => {
                        const s = page.stickers.find(sticker => sticker.id === st.id);
                        if (s) { s.x = e.target.x(); s.y = e.target.y(); }
                      });
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      updatePage(currentPageIndex, (page) => {
                        const s = page.stickers.find(sticker => sticker.id === st.id);
                        if (s) {
                           s.x = node.x(); s.y = node.y();
                           s.scaleX = node.scaleX(); s.scaleY = node.scaleY(); s.rotation = node.rotation();
                        }
                      });
                    }}
                    onClick={() => {
                       if (tool === 'pan' || tool === 'lasso') selectShape(st.id);
                       else playAudioSticker(currentPageIndex, st.id, st.audioUrl);
                    }}
                    onTap={() => {
                       if (tool === 'pan' || tool === 'lasso') selectShape(st.id);
                       else playAudioSticker(currentPageIndex, st.id, st.audioUrl);
                    }}
                  >
                    <Rect width={130} height={44} fill={st.isPlaying ? '#10B981' : 'white'} cornerRadius={22} shadowColor="rgba(0,0,0,0.1)" shadowBlur={8} shadowOffsetY={3} stroke="#F3F4F6" strokeWidth={1} />
                    <Circle radius={16} x={22} y={22} fill={st.isPlaying ? 'rgba(255,255,255,0.2)' : '#E0F2FE'} />
                    <Text text="🎤" fontSize={16} x={14} y={14} fill={st.isPlaying ? 'white' : '#0284C7'} />
                    <Text text={st.isPlaying ? "กำลังเล่น..." : "เล่นเสียง"} fontSize={14} x={48} y={15} fill={st.isPlaying ? 'white' : '#4B5563'} fontFamily="Kanit, sans-serif" fontWeight={500} />
                  </Group>
                );
              }
              
              // Sticky Note
              return (
                <Group 
                  key={st.id} 
                  id={st.id} 
                  name="object"
                  x={st.x} 
                  y={st.y} 
                  scaleX={st.scaleX || 1}
                  scaleY={st.scaleY || 1}
                  rotation={st.rotation || 0}
                  draggable={tool === 'pan' || tool === 'sticker'} 
                  onDragEnd={(e) => {
                    updatePage(currentPageIndex, (page) => {
                       const sticker = page.stickers.find(s => s.id === st.id);
                       if (sticker) { sticker.x = e.target.x(); sticker.y = e.target.y(); }
                    });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    updatePage(currentPageIndex, (page) => {
                       const sticker = page.stickers.find(s => s.id === st.id);
                       if (sticker) {
                          sticker.x = node.x(); sticker.y = node.y();
                          sticker.scaleX = node.scaleX(); sticker.scaleY = node.scaleY(); sticker.rotation = node.rotation();
                       }
                    });
                  }}
                  onClick={(e) => { e.cancelBubble = true; if (tool === 'pan' || tool === 'sticker') { setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); } }}
                  onTap={(e) => { e.cancelBubble = true; if (tool === 'pan' || tool === 'sticker') { setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); } }}
                >
                  <Rect width={150} height={150} fill={st.color} shadowColor="rgba(0,0,0,0.15)" shadowBlur={10} shadowOffsetY={4} cornerRadius={st.style === 'round' ? 16 : 2} />
                  
                  {(!st.style || st.style === 'classic') ? (
                     <>
                        <Rect width={150} height={20} fill="rgba(0,0,0,0.05)" cornerRadius={[2, 2, 0, 0]} />
                        <Path data="M 150 150 L 130 150 L 150 130 Z" fill="rgba(0,0,0,0.08)" />
                     </>
                  ) : st.style === 'pin' ? (
                     <>
                        <Circle x={75} y={12} radius={5} fill="#EF4444" shadowColor="rgba(0,0,0,0.3)" shadowBlur={3} shadowOffsetY={1} />
                        <Circle x={74} y={11} radius={2} fill="#FCA5A5" />
                     </>
                  ) : st.style === 'tape' ? (
                     <Rect x={45} y={-8} width={60} height={20} fill="rgba(255,255,255,0.5)" rotation={-2} shadowColor="rgba(0,0,0,0.05)" shadowBlur={2} shadowOffsetY={1} />
                  ) : null}

                  {editingStickerId !== st.id && st.text && (
                     <Text text={st.text} x={10} y={24} width={130} height={116} fontSize={16} fill="#111827" fontFamily="Kanit, sans-serif" />
                  )}
                </Group>
              );
            })}
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
      {(() => {
         if (!editingTextId) return null;
         const t = currentPage.texts?.find(tx => tx.id === editingTextId);
         if (!t) return null;
         
         const absoluteX = (t.x + pageX) * scale + position.x;
         const absoluteY = (t.y + pageY) * scale + position.y;
         
         return (
           <textarea
             key={`textarea-${editingTextId}`}
             ref={textareaRef}
             placeholder="พิมพ์ข้อความที่นี่..."
             value={editingTextValue}
             onChange={(e) => {
                setEditingTextValue(e.target.value);
             }}
             onBlur={() => {
                if (!isEditingText.current) return;
                isEditingText.current = false;
                
                if (editingTextValue.trim() === '') {
                   updatePage(currentPageIndex, (page) => {
                      page.texts = page.texts.filter(tx => tx.id !== editingTextId);
                   });
                } else {
                   updatePage(currentPageIndex, (page) => {
                      const txt = page.texts?.find(tx => tx.id === editingTextId);
                      if (txt) txt.text = editingTextValue;
                   });
                }
                setEditingTextId(null);
             }}
             onPointerDown={(e) => e.stopPropagation()}
             onMouseDown={(e) => e.stopPropagation()}
             style={{
                position: 'absolute',
                top: absoluteY,
                left: absoluteX,
                margin: 0,
                padding: 4,
                border: '1px dashed var(--teal)',
                background: 'rgba(255,255,255,0.95)',
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
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
             }}
           />
         );
      })()}
      
      {/* Floating Textarea for Sticky Notes */}
      {(() => {
         if (!editingStickerId) return null;
         const st = currentPage.stickers?.find(s => s.id === editingStickerId);
         if (!st || st.audioUrl) return null;
         
         const absoluteX = (st.x + pageX) * scale + position.x;
         const absoluteY = (st.y + pageY) * scale + position.y;
         
         return (
           <div style={{ position: 'absolute', top: absoluteY, left: absoluteX, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
             <textarea
               autoFocus
               placeholder="พิมพ์ข้อความที่นี่..."
               value={editingStickerValue}
               onChange={(e) => setEditingStickerValue(e.target.value)}
               onBlur={() => {
                  updatePage(currentPageIndex, (page) => {
                     const sticker = page.stickers?.find(s => s.id === editingStickerId);
                     if (sticker) sticker.text = editingStickerValue;
                  });
                  setEditingStickerId(null);
               }}
               onPointerDown={(e) => e.stopPropagation()}
               onMouseDown={(e) => e.stopPropagation()}
               style={{
                  margin: 0,
                  padding: 16,
                  border: '2px solid var(--teal)',
                  background: 'transparent',
                  color: '#111827',
                  fontSize: `${16 * scale}px`,
                  fontFamily: 'Kanit, sans-serif',
                  outline: 'none',
                  resize: 'none',
                  width: 150 * scale,
                  height: 150 * scale,
                  overflow: 'hidden',
                  borderRadius: st.style === 'round' ? 16 * scale : 2 * scale,
               }}
             />
             <button onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={() => {
                 updatePage(currentPageIndex, (page) => {
                    page.stickers = page.stickers.filter(s => s.id !== editingStickerId);
                 });
                 setEditingStickerId(null);
             }} style={{ background: '#EF4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start', fontSize: 13, boxShadow: '0 2px 8px rgba(239,68,68,0.2)' }}>
                ลบสติกเกอร์
             </button>
           </div>
         );
      })()}
      {/* Crop Modal Overlay */}
      {croppingImageId && (() => {
         const img = currentPage.images?.find(i => i.id === croppingImageId);
         if (!img) return null;
         return (
            <CropModal
              imageUrl={img.url}
              onCancel={() => setCroppingImageId(null)}
              onCropComplete={(newUrl) => {
                 pushHistory();
                 updatePage(currentPageIndex, (page) => {
                    const i = page.images.find(im => im.id === croppingImageId);
                    if (i) i.url = newUrl;
                 });
                 setCroppingImageId(null);
                 toast.success('ครอบตัดรูปภาพเรียบร้อย');
              }}
            />
         );
      })()}
      </div>{/* End flex-1 Canvas Container */}
    </div>
    </>
  );
}
