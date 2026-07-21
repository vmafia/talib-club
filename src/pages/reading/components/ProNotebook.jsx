import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Path, Group, Circle, Text, Rect, Transformer, RegularPolygon, Line } from 'react-konva';
import Draggable from 'react-draggable';
import { PenTool, Highlighter, Eraser, Pen, MousePointer2, Type, Square, Hand, Search, Save, Download, Undo2, Redo2, Image as ImageIcon, Mic, SquareSquare, ChevronLeft, ChevronRight, Settings, FilePlus, Circle as CircleIcon, Minus, Lasso, MonitorPlay, Zap, GripHorizontal, GripVertical, Pencil, Pointer, LayoutGrid, Plus, Columns, StickyNote, FileText, Bookmark, FileStack, LayoutList, Check, Lock, MousePointerClick, Move3d, Triangle, Cloud, CheckCircle, Trash2, Scissors, Crop, Brush, Feather, Maximize2, Ruler, PanelLeftClose, PanelLeftOpen, Wand2, Camera } from 'lucide-react';
import CropModal from './CropModal';
import ColorPickerPanel from './ColorPickerPanel';
import BookSnipModal from './BookSnipModal';
import { recognizeShape, shapeFromRecognition, pointInPolygon, distToSegmentXY } from '../utils/shapeRecognition.js';
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

// What actually distinguishes one pen from another. `stroke` goes to
// perfect-freehand and shapes the outline; the rest controls how it is painted.
//
//  pen         ballpoint — near-constant width, fully opaque
//  fountain    strong width response and tapered ends, like a flexible nib
//  pencil      graphite: light, grainy, and it darkens where strokes overlap
//  marker      chisel tip — flat width, slightly translucent
//  highlighter wide, flat, multiplied so text stays readable underneath
const PEN_STYLES = {
  pen: {
    stroke: { thinning: 0.22, smoothing: 0.5, streamline: 0.5 },
    opacity: 1, composite: 'source-over',
  },
  fountain: {
    stroke: {
      thinning: 0.78, smoothing: 0.62, streamline: 0.42,
      start: { taper: 14, cap: true }, end: { taper: 32, cap: true },
    },
    opacity: 1, composite: 'source-over',
  },
  pencil: {
    stroke: { thinning: 0.55, smoothing: 0.4, streamline: 0.32 },
    opacity: 0.62, composite: 'multiply', grain: true,
  },
  marker: {
    stroke: { thinning: 0.05, smoothing: 0.55, streamline: 0.5, start: { cap: true }, end: { cap: true } },
    sizeScale: 1.7, opacity: 0.9, composite: 'source-over',
  },
  highlighter: {
    stroke: { thinning: 0, smoothing: 0.6, streamline: 0.6, start: { cap: false }, end: { cap: false } },
    sizeScale: 3, opacity: 0.42, composite: 'multiply',
  },
  eraser: {
    stroke: { thinning: 0, smoothing: 0.5, streamline: 0.5 },
    opacity: 1, composite: 'destination-out',
  },
};

// Graphite grain, one tile per colour, built once and reused. Without this the
// pencil is just a thin translucent line and reads as a weak pen.
const grainCache = new Map();
const getGrainTile = (color) => {
  if (grainCache.has(color)) return grainCache.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  for (let i = 0; i < 1100; i++) {
    ctx.globalAlpha = 0.2 + Math.random() * 0.6;
    ctx.fillRect(Math.random() * 48, Math.random() * 48, 1, 1);
  }
  grainCache.set(color, c);
  return c;
};

// One rendered stroke. Pulled out of the component (and memoised at the layer
// level) so that drawing a new stroke does not re-run getStroke for every stroke
// already on the page — that was the source of the lag as a page filled up.
const StrokeShape = ({ line }) => {
  const style = PEN_STYLES[line.tool] || PEN_STYLES.pen;
  const color = line.color || '#111827';

  // Feed real stylus pressure to perfect-freehand when we captured it; fall back
  // to its velocity simulation for strokes drawn with a mouse or saved earlier.
  const hasPressure = Array.isArray(line.pressures) && line.pressures.length === line.points.length / 2;
  const pointPairs = [];
  for (let p = 0; p < line.points.length; p += 2) {
    pointPairs.push(hasPressure
      ? [line.points[p], line.points[p + 1], line.pressures[p / 2]]
      : [line.points[p], line.points[p + 1]]);
  }

  const baseSize = line.tool === 'eraser' ? (line.size || 24) : (line.size || 4) * (style.sizeScale || 1);
  const outline = getStroke(pointPairs, {
    size: baseSize,
    ...style.stroke,
    simulatePressure: !hasPressure,
  });
  const pathData = getSvgPathFromStroke(outline);

  const common = {
    data: pathData,
    opacity: (line.opacity ?? 1) * style.opacity,
    globalCompositeOperation: style.composite,
    lineCap: 'round',
    lineJoin: 'round',
  };

  if (style.grain) {
    return <Path {...common} fillPriority="pattern" fillPatternImage={getGrainTile(color)} fillPatternRepeat="repeat" />;
  }
  return <Path {...common} fill={line.tool === 'eraser' ? 'black' : color} />;
};

// Committed ink. Re-renders only when the stroke list itself changes.
const CommittedStrokes = React.memo(({ lines, playbackTime }) => (
  <>
    {lines.map((line, i) => {
      const isVisible = line.startTime === undefined || line.startTime === null || line.startTime <= playbackTime;
      if (!isVisible) return null;
      return <StrokeShape key={i} line={line} />;
    })}
  </>
));

const ZERO_OFFSET = { x: 0, y: 0 };

// HarmonyOS / Huawei Notes design tokens
const HW = {
  accent: '#0A59F7',
  accentSoft: 'rgba(10,89,247,0.10)',
  surface: 'rgba(255,255,255,0.86)',
  blur: 'saturate(180%) blur(30px)',
  hairline: 'rgba(0,0,0,0.06)',
  text: '#181818',
  textDim: '#6B7280',
  shadow: '0 6px 24px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
  radius: 20,
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

export default function ProNotebook({ bookId, uid, activeBook, readonly = false, fullView = false, onToggleFullView }) {
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

  // Initial cloud sync. A full-canvas overlay (spinner + percent bar) replaces the
  // old corner toast, which users never noticed on a tablet.
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null); // null = indeterminate

  useEffect(() => {
     const loadData = async () => {
        setIsSyncing(true);
        setSyncProgress(null);
        try {
           const cloudData = await downloadNotebookData(uid, notebookId, (p) => setSyncProgress(p));
           if (cloudData && cloudData.length > 0) {
              setPages(cloudData);
              toast.success("ซิงก์ข้อมูลสำเร็จ!", { id: "cloud-sync" });
           }
        } catch (e) {
           console.error("Cloud load failed", e);
           const saved = localStorage.getItem(`talib_notebook_${notebookId}`);
           if (saved) {
              setPages(JSON.parse(saved));
              toast.error("ออฟไลน์: โหลดจากเครื่องแทน", { id: "cloud-sync" });
           }
        } finally {
           setIsSyncing(false);
           setSyncProgress(null);
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
  // Huawei-style: tapping the already-active tool opens its options popover
  const [showToolOptions, setShowToolOptions] = useState(false);

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
  const stickerTextareaRef = useRef(null);

  // autoFocus alone did not stick: the textarea mounts in the same commit as the
  // Konva pointer handling, and focus was being taken straight back off it.
  useEffect(() => {
     if (!editingStickerId) return;
     const t = setTimeout(() => stickerTextareaRef.current?.focus(), 60);
     return () => clearTimeout(t);
  }, [editingStickerId]);
  
  // Free-form lasso path in page coordinates: flat [x,y,x,y,...].
  const [lassoPath, setLassoPath] = useState(null);
  const lassoPathRef = useRef(null);
  // Mirrors selectedLassoLines so bake/delete can claim the selection synchronously.
  const selectionRef = useRef([]);
  // Objects caught by the lasso, as {kind, id}. Unlike strokes these stay in the
  // page and are drawn with a live offset, which avoids having to duplicate every
  // object renderer inside the selection group.
  const [selectedObjects, setSelectedObjects] = useState([]);
  const selectedObjectsRef = useRef([]);
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
  // Free colour choice. The native <input type="color"> is dead on several tablet
  // browsers, so an in-app picker panel replaces it; picked colours are kept as
  // reusable swatches.
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColors, setCustomColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('talib_custom_colors')) || []; } catch { return []; }
  });
  const rememberCustomColor = (c) => {
    setCustomColors((prev) => {
      const next = [c, ...prev.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 8);
      localStorage.setItem('talib_custom_colors', JSON.stringify(next));
      return next;
    });
  };
  // Live colour changes flow into the text being edited/selected too, so the
  // picker behaves the same as tapping a preset swatch while on the text tool.
  const applyColorToActiveText = (c) => {
    const id = editingTextId || selectedId;
    if (!id) return;
    updatePage(currentPageIndex, (page) => {
      page.texts = (page.texts || []).map((t) => (t.id === id ? { ...t, color: c } : t));
    });
  };
  const [showBookSnip, setShowBookSnip] = useState(false);
  const [penOpacity, setPenOpacity] = useState(1);
  const [stickerStyle, setStickerStyle] = useState('classic');
  // Huawei Notes offers two erasers: whole-stroke and area ("pixel").
  const [eraserSettings, setEraserSettings] = useState({ mode: 'stroke', size: 24, eraseObjects: true });
  // Stylus handling. 'auto' draws with whatever touches the screen; 'pen' ignores
  // finger input while drawing so a resting palm can't leave marks. The choice is
  // persisted, and the first pen contact auto-enables 'pen' (see handlePointerDown)
  // because tablet users never find the toggle before their palm has scribbled.
  const [stylusMode, setStylusModeState] = useState(() => {
    const saved = localStorage.getItem('talib_notebook_stylus_mode');
    return saved === 'pen' || saved === 'auto' ? saved : 'auto';
  });
  const setStylusMode = useCallback((next) => {
    setStylusModeState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      localStorage.setItem('talib_notebook_stylus_mode', value);
      return value;
    });
  }, []);
  const penAutoSwitchDone = useRef(localStorage.getItem('talib_notebook_stylus_mode') !== null);
  const [pressureEnabled, setPressureEnabled] = useState(true);
  // Snap roughly drawn shapes to clean ones when the pen lifts.
  const [autoShape, setAutoShape] = useState(false);

  // Formatting for the text tool. Applied to new text boxes, and to the one being
  // edited or selected so changes are visible immediately.
  const [textStyle, setTextStyle] = useState({ fontFamily: 'Kanit', fontSize: 24, bold: false, italic: false });

  // "Zoom-in writing": a magnified strip at the bottom of the screen. You write
  // large in the strip and the ink lands small on the page, which is how Huawei
  // Notes makes handwriting legible on a tablet.
  const [zoomWriter, setZoomWriter] = useState(false);
  const [writerFocus, setWriterFocus] = useState({ x: 30, y: 40 });
  const writerStageRef = useRef(null);
  const WRITER_ZOOM = 2.6;
  const WRITER_H = 190;

  // Ruler: a straight-edge lying on the page. Ink started near its edge is
  // projected onto that edge, so the stroke comes out perfectly straight.
  const [rulerOn, setRulerOn] = useState(false);
  const [ruler, setRuler] = useState({ x: 120, y: 320, angle: 0, length: 420 });
  const RULER_SNAP = 46;   // page units within which a stroke grabs the edge
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [croppingImageId, setCroppingImageId] = useState(null);
  
  // History State
  const pagesRef = useRef(pages);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
    
  // Toolbar Scroll Hint State
  const toolsScrollRef = useRef(null);
  const [showRightScrollHint, setShowRightScrollHint] = useState(true);
  const [showLeftScrollHint, setShowLeftScrollHint] = useState(false);

  const handleToolsScroll = () => {
     if (toolsScrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = toolsScrollRef.current;
        setShowLeftScrollHint(scrollLeft > 5);
        setShowRightScrollHint(scrollLeft < scrollWidth - clientWidth - 5);
     }
  };
    
  useEffect(() => {
     setTimeout(handleToolsScroll, 100);
     window.addEventListener('resize', handleToolsScroll);
     return () => window.removeEventListener('resize', handleToolsScroll);
  }, []);
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
     if (tool !== 'lasso' && (selectionRef.current.length > 0 || selectedObjectsRef.current.length > 0)) {
        bakeLassoSelection();
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
  // The stroke currently under the pointer. Kept out of `pages` so that only the
  // thin live layer re-renders while drawing instead of every committed stroke.
  const [liveStroke, setLiveStroke] = useState(null);
  const liveStrokeRef = useRef(null);
  // pointerId -> {type, clientX, clientY}. Drives palm rejection and pinch gestures.
  const activePointers = useRef(new Map());
  const drawingPointerId = useRef(null);
  const gestureErasedRef = useRef(false);
  // Whether the stroke in progress is riding the ruler.
  const ruledStrokeRef = useRef(false);
  // Last pointer position while panning, in client coordinates.
  const panningRef = useRef(null);

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

  // Scale the page to the viewport and park it at the top. Also reachable from the
  // header, which is how you recover when the page has been panned off screen.
  const fitToScreen = useCallback(() => {
    if (dimensions.width <= 0 || dimensions.height <= 0) return;
    const page = pagesRef.current[currentPageIndex] || { width: 800, height: 1130 };
    const paddingX = isMobile ? 10 : 20;
    const availableWidth = dimensions.width - paddingX * 2;

    let newScale = availableWidth / page.width;
    // On a very wide desktop, stop the page from becoming absurdly large.
    if (!isMobile && newScale > 1.2) newScale = 1.2;
    newScale = Math.max(0.1, Math.min(2.0, newScale));

    setScale(newScale);
    setPosition({ x: 0, y: 40 });
  }, [dimensions.width, dimensions.height, currentPageIndex, isMobile]);

  // Auto-fit on mount, on resize, and when moving to another page.
  useEffect(() => { fitToScreen(); }, [fitToScreen, readonly]);

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

  // Snapshot for undo/redo. Only the annotation arrays are copied — `src` (a base64
  // PDF/image data URL, often megabytes) is carried over by reference, so a snapshot
  // costs roughly the size of the strokes on the page rather than the whole document.
  const snapshotPages = (pgs) => pgs.map((p) => ({
    ...p,
    lines: (p.lines || []).map((l) => ({ ...l, points: l.points.slice(), pressures: l.pressures ? l.pressures.slice() : undefined })),
    shapes: (p.shapes || []).map((s) => ({ ...s })),
    texts: (p.texts || []).map((t) => ({ ...t })),
    stickers: (p.stickers || []).map((s) => ({ ...s })),
    images: (p.images || []).map((i) => ({ ...i })),
  }));

  const pushHistory = () => {
    undoStack.current.push(snapshotPages(pagesRef.current));
    if (undoStack.current.length > 30) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    const previousState = undoStack.current.pop();
    redoStack.current.push(snapshotPages(pagesRef.current));
    setPages(previousState);
    setCurrentPageIndex((i) => Math.min(i, previousState.length - 1));
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    const nextState = redoStack.current.pop();
    undoStack.current.push(snapshotPages(pagesRef.current));
    setPages(nextState);
    setCurrentPageIndex((i) => Math.min(i, nextState.length - 1));
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
         try { localStorage.setItem(`talib_notebook_${notebookId}`, JSON.stringify(pages)); } catch (e) { console.warn("Local storage quota exceeded on backup", e); }
        if (!isAuto) toast.success("บันทึกคลาวด์เรียบร้อย!", { id: "cloud-save", icon: '💾' });
     } catch (err) {
        console.error(err);
         let localSaved = false;
         try { localStorage.setItem(`talib_notebook_${notebookId}`, JSON.stringify(pages)); localSaved = true; } catch (e) { console.warn("Local storage quota exceeded on fallback", e); }
         if (localSaved) {
        toast.error("บันทึกคลาวด์ล้มเหลว (เซฟลงเครื่องแล้ว)", { id: "cloud-save" });
         } else {
            toast.error("บันทึกคลาวด์ล้มเหลว และพื้นที่ในเครื่องเต็ม (ไม่สามารถบันทึกได้)", { id: "cloud-save" });
         }
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

  // Mouse and some pens report 0 pressure; fall back to a neutral mid value so the
  // stroke keeps a sensible width instead of collapsing.
  const getPressure = (e) => {
    const evt = e.evt;
    if (!pressureEnabled) return 0.5;
    if (!evt || evt.pointerType === 'mouse') return 0.5;
    return evt.pressure > 0 ? evt.pressure : 0.5;
  };

  const hasPenPointer = () => {
    for (const p of activePointers.current.values()) if (p.type === 'pen') return true;
    return false;
  };

  // Huawei-style input arbitration: a pen always wins, fingers are for gestures.
  const shouldDrawWith = (e) => {
    const type = e.evt?.pointerType || 'mouse';
    if (type === 'pen' || type === 'mouse') return true;
    if (stylusMode === 'pen') return false;      // stylus-only: reject finger and palm
    return !hasPenPointer();                     // auto: finger draws unless a pen is down
  };

  const handlePointerDown = (e) => {
    const evt = e.evt;
    if (evt && evt.pointerId !== undefined) {
      activePointers.current.set(evt.pointerId, { type: evt.pointerType, clientX: evt.clientX, clientY: evt.clientY });
      if (evt.pointerType === 'pen') {
        // The pen always wins: it may land while a palm is already resting on the
        // glass, so extra pointers must not read as a pinch. Any pan or stroke the
        // palm started is cancelled and the pen takes over cleanly.
        panningRef.current = null;
        if (liveStrokeRef.current && drawingPointerId.current !== evt.pointerId) {
          liveStrokeRef.current = null; setLiveStroke(null);
          isDrawing.current = false;
          drawingPointerId.current = null;
        }
      } else if (activePointers.current.size > 1) {
        // A second finger means the user is pinching, not drawing — abandon the stroke.
        if (liveStrokeRef.current) { liveStrokeRef.current = null; setLiveStroke(null); }
        isDrawing.current = false;
        drawingPointerId.current = null;
        return;
      }
    }

    // First pen contact ever: flip to pen-only input on the spot, so the palm of a
    // tablet user can't scribble before they discover the toggle in the menu.
    if (evt?.pointerType === 'pen' && !penAutoSwitchDone.current) {
      penAutoSwitchDone.current = true;
      if (stylusMode !== 'pen') {
        setStylusMode('pen');
        toast('ตรวจพบปากกาสไตลัส: ปิดการเขียนด้วยนิ้วแล้ว ใช้นิ้วเลื่อน/ซูมหน้าได้เลย', { icon: '✍️', duration: 5000 });
      }
    }

    // Touching the canvas puts the tool to work — tuck its options away.
    if (showToolOptions) setShowToolOptions(false);
    if (showColorPicker) setShowColorPicker(false);

    // If clicking on lasso group, don't bake, just return so they can drag it
    const targetName = e.target.name();
    const parentName = e.target.getParent()?.name();
    if (tool === 'lasso' && (targetName === 'lasso-group' || parentName === 'lasso-group')) {
       return;
    }
    // Grabbing the ruler moves it; it must not also lay down ink.
    if (targetName === 'ruler' || parentName === 'ruler' || targetName === 'ruler-handle') {
       return;
    }

    checkDeselect(e);

    // Panning is handled here rather than by Konva's own stage dragging, because
    // that moved the stage without updating `position`, so the canvas snapped back
    // to where it started on the next render.
    //
    // Middle-drag and space-drag pan with any tool selected, so you don't have to
    // keep switching to the hand just to bring something back on screen.
    const wantsPan = readonly || tool === 'pan' || isSpaceDown || evt?.button === 1;
    if (wantsPan) {
       if (evt) panningRef.current = { x: evt.clientX, y: evt.clientY };
       return;
    }
    // A finger that isn't allowed to draw pans the board instead of doing nothing —
    // that's what a tablet user expects their hand to do in pen-only mode.
    if (!shouldDrawWith(e)) {
      if (evt) panningRef.current = { x: evt.clientX, y: evt.clientY };
      return;
    }
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    // Off the paper there is nothing to write on: drag the board instead of inking.
    if (pos.x < 0 || pos.y < 0 || pos.x > currentPage.width || pos.y > currentPage.height) {
      if (evt) panningRef.current = { x: evt.clientX, y: evt.clientY };
      return;
    }

    drawingPointerId.current = evt?.pointerId;
    const pressure = getPressure(e);
    const relativeTime = isRecording && recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : null;
    
    // Landing on an existing object means "edit that one". Without this the stage
    // handler also fired and dropped a brand new note underneath the pointer, so
    // the note being typed into was not the one that had just been tapped.
    const hitExistingObject = targetName === 'object' || parentName === 'object';

    if (tool === 'text') {
       if (editingTextId) {
           if (textareaRef.current) textareaRef.current.blur();
           return;
       }
       if (hitExistingObject) return;
       const newText = {
          id: `text-${Date.now()}`, text: '', x: pos.x, y: pos.y, color: penColor,
          size: textStyle.fontSize,
          fontFamily: textStyle.fontFamily,
          bold: textStyle.bold,
          italic: textStyle.italic,
       };
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
       if (hitExistingObject || editingStickerId) return;
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
       if (selectionRef.current.length > 0 || selectedObjectsRef.current.length > 0) {
          bakeLassoSelection();
          return; // a tap outside the selection drops it back onto the page
       }
       isDrawing.current = true;
       lassoPathRef.current = [pos.x, pos.y];
       setLassoPath([pos.x, pos.y]);
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
       gestureErasedRef.current = false;
       if (eraserSettings.mode === 'area') {
          // Area eraser: lay down an 'eraser' stroke that punches through the ink
          // layer via destination-out compositing.
          beginLiveStroke(pos, pressure, relativeTime, 'eraser');
       } else {
          eraseAt(pos);
       }
       return;
    }

    beginLiveStroke(pos, pressure, relativeTime, tool);
  };

  // distToSegmentXY keeps the stroke eraser reacting to the line *between* two
  // sampled points, not only to the sampled points themselves.
  const strokeHitsPoint = (line, pos, radius) => {
    const pts = line.points;
    const hitRadius = radius + (line.size || 4) / 2;
    if (pts.length < 4) {
      return Math.hypot(pos.x - pts[0], pos.y - pts[1]) <= hitRadius;
    }
    for (let i = 0; i + 3 < pts.length; i += 2) {
      if (distToSegmentXY(pos.x, pos.y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= hitRadius) return true;
    }
    return false;
  };

  // Whole-stroke eraser: removes any stroke (and optionally any object) it touches.
  const eraseAt = (pos) => {
    const radius = eraserSettings.size / 2;
    const page = pagesRef.current[currentPageIndex];
    if (!page) return;

    const survivingLines = (page.lines || []).filter((l) => !strokeHitsPoint(l, pos, radius));
    const hitLine = survivingLines.length !== (page.lines || []).length;

    let hitObject = false;
    let survivingShapes = page.shapes || [];
    let survivingTexts = page.texts || [];
    let survivingStickers = page.stickers || [];

    if (eraserSettings.eraseObjects) {
      survivingShapes = survivingShapes.filter((s) => {
        const minX = Math.min(s.x1, s.x2) - radius; const maxX = Math.max(s.x1, s.x2) + radius;
        const minY = Math.min(s.y1, s.y2) - radius; const maxY = Math.max(s.y1, s.y2) + radius;
        return !(pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY);
      });
      survivingTexts = survivingTexts.filter((t) => {
        const w = Math.max(60, (t.text?.length || 1) * (t.size || 16) * 0.6);
        return !(pos.x >= t.x - radius && pos.x <= t.x + w + radius && pos.y >= t.y - radius && pos.y <= t.y + (t.size || 16) * 1.4 + radius);
      });
      survivingStickers = survivingStickers.filter((st) => {
        const w = st.audioUrl ? 130 : 150;
        const h = st.audioUrl ? 44 : 150;
        return !(pos.x >= st.x - radius && pos.x <= st.x + w + radius && pos.y >= st.y - radius && pos.y <= st.y + h + radius);
      });
      hitObject = survivingShapes.length !== (page.shapes || []).length
        || survivingTexts.length !== (page.texts || []).length
        || survivingStickers.length !== (page.stickers || []).length;
    }

    if (!hitLine && !hitObject) return;

    // One history entry per erase gesture, not per pointer sample.
    if (!gestureErasedRef.current) {
      pushHistory();
      gestureErasedRef.current = true;
    }
    updatePage(currentPageIndex, (p) => {
      p.lines = survivingLines;
      p.shapes = survivingShapes;
      p.texts = survivingTexts;
      p.stickers = survivingStickers;
    });
  };

  // Foot of the perpendicular from pos onto the ruler's edge, plus how far away
  // pos was — the distance decides whether the stroke grabs the edge at all.
  const projectOntoRuler = (pos) => {
    const rad = (ruler.angle * Math.PI) / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    const t = (pos.x - ruler.x) * dx + (pos.y - ruler.y) * dy;
    const px = ruler.x + dx * t;
    const py = ruler.y + dy * t;
    return { x: px, y: py, dist: Math.hypot(pos.x - px, pos.y - py) };
  };

  const beginLiveStroke = (pos, pressure, relativeTime, strokeTool) => {
    isDrawing.current = true;

    // Decide once, at the start: a stroke either runs along the ruler or it does
    // not. Re-testing every sample would let the line peel off mid-stroke.
    let start = pos;
    let ruled = false;
    if (rulerOn && strokeTool !== 'eraser') {
      const p = projectOntoRuler(pos);
      if (p.dist <= RULER_SNAP) { start = { x: p.x, y: p.y }; ruled = true; }
    }

    const stroke = {
      tool: strokeTool,
      color: penColor,
      size: strokeTool === 'eraser' ? eraserSettings.size : penSize,
      opacity: penOpacity,
      points: [start.x, start.y],
      pressures: [pressure],
      startTime: relativeTime,
    };
    liveStrokeRef.current = stroke;
    ruledStrokeRef.current = ruled;
    setLiveStroke(stroke);
  };

  const extendLiveStroke = (pos, pressure) => {
    const stroke = liveStrokeRef.current;
    if (!stroke) return;
    const p = ruledStrokeRef.current ? projectOntoRuler(pos) : pos;
    const n = stroke.points.length;
    // Drop samples that land on the previous point; they add cost and pinch the taper.
    if (n >= 2 && Math.hypot(p.x - stroke.points[n - 2], p.y - stroke.points[n - 1]) < 0.6) return;
    stroke.points.push(p.x, p.y);
    stroke.pressures.push(pressure);
    setLiveStroke({ ...stroke, points: stroke.points, pressures: stroke.pressures });
  };

  const commitLiveStroke = () => {
    const stroke = liveStrokeRef.current;
    liveStrokeRef.current = null;
    setLiveStroke(null);
    if (!stroke) return;
    // A tap with no movement still deserves a dot.
    if (stroke.points.length === 2) {
      stroke.points.push(stroke.points[0], stroke.points[1]);
      stroke.pressures.push(stroke.pressures[0]);
    }

    // Shape recognition only applies to ink, never to the eraser or highlighter.
    if (autoShape && ['pen', 'fountain', 'marker', 'pencil'].includes(stroke.tool)) {
      const match = recognizeShape(stroke.points);
      if (match) {
        const shape = shapeFromRecognition(match, { color: stroke.color, size: stroke.size, opacity: stroke.opacity });
        pushHistory();
        updatePage(currentPageIndex, (page) => {
          page.shapes = [...(page.shapes || []), shape];
        });
        return;
      }
    }

    pushHistory();
    updatePage(currentPageIndex, (page) => {
      page.lines = [...(page.lines || []), stroke];
    });
  };

  // --- Zoom-in writing strip ---
  // The strip is a second stage showing a magnified window onto the same page, so
  // it reuses the stroke pipeline wholesale; only the coordinate mapping differs.

  const writerBoxW = dimensions.width / WRITER_ZOOM;
  const writerBoxH = WRITER_H / WRITER_ZOOM;

  const writerPointerPos = () => {
    const st = writerStageRef.current;
    const p = st?.getPointerPosition();
    if (!p) return null;
    // getPointerPosition is container-relative and ignores the stage transform.
    return { x: writerFocus.x + p.x / WRITER_ZOOM, y: writerFocus.y + p.y / WRITER_ZOOM };
  };

  const moveWriterFocus = (dx, dy) => {
    setWriterFocus((f) => ({
      x: Math.max(0, Math.min(currentPage.width - writerBoxW, f.x + dx)),
      y: Math.max(0, Math.min(currentPage.height - writerBoxH, f.y + dy)),
    }));
  };

  // Slide the window along as the writing approaches its right edge, then drop to
  // the next line when there is no more room.
  const advanceWriterIfNeeded = (pos) => {
    const edge = writerFocus.x + writerBoxW * 0.76;
    if (pos.x < edge) return;
    const atEnd = writerFocus.x + writerBoxW >= currentPage.width - 1;
    if (atEnd) moveWriterFocus(-writerFocus.x, writerBoxH * 0.62);
    else moveWriterFocus(writerBoxW * 0.45, 0);
  };

  const handleWriterDown = (e) => {
    if (readonly) return;
    if (!PEN_STYLES[tool] && tool !== 'eraser') return;   // strip is for ink only
    if (!shouldDrawWith(e)) return;
    const pos = writerPointerPos();
    if (!pos) return;
    drawingPointerId.current = e.evt?.pointerId;
    const relativeTime = isRecording && recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : null;

    if (tool === 'eraser') {
      isDrawing.current = true;
      gestureErasedRef.current = false;
      if (eraserSettings.mode === 'area') beginLiveStroke(pos, 1, relativeTime, 'eraser');
      else eraseAt(pos);
      return;
    }
    beginLiveStroke(pos, getPressure(e), relativeTime, tool);
  };

  const handleWriterMove = (e) => {
    if (!isDrawing.current) return;
    const evt = e?.evt;
    if (evt && drawingPointerId.current !== undefined && evt.pointerId !== drawingPointerId.current) return;
    const pos = writerPointerPos();
    if (!pos) return;
    if (tool === 'eraser' && eraserSettings.mode !== 'area') { eraseAt(pos); return; }
    extendLiveStroke(pos, getPressure(e));
    advanceWriterIfNeeded(pos);
  };

  const handleWriterUp = () => {
    if (liveStrokeRef.current) commitLiveStroke();
    isDrawing.current = false;
    drawingPointerId.current = null;
    gestureErasedRef.current = false;
  };

  // Bounding box of the live selection, in page coordinates (before the group's
  // drag offset is applied). Drives both the outline and the floating menu.
  const lassoBounds = React.useMemo(() => {
    if (selectedLassoLines.length === 0 && selectedObjects.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y, pad = 0) => {
      minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad);
      minY = Math.min(minY, y - pad); maxY = Math.max(maxY, y + pad);
    };

    selectedLassoLines.forEach((l) => {
      const pad = (l.size || 4) / 2;
      for (let i = 0; i < l.points.length; i += 2) grow(l.points[i], l.points[i + 1], pad);
    });

    const page = pages[currentPageIndex];
    selectedObjects.forEach(({ kind, id }) => {
      const o = (page?.[kind] || []).find((it) => it.id === id);
      if (!o) return;
      if (kind === 'shapes') { grow(o.x1, o.y1); grow(o.x2, o.y2); }
      else if (kind === 'images') { grow(o.x, o.y); grow(o.x + (o.width || 0), o.y + (o.height || 0)); }
      else if (kind === 'stickers') { grow(o.x, o.y); grow(o.x + (o.audioUrl ? 130 : 150), o.y + (o.audioUrl ? 44 : 150)); }
      else { grow(o.x, o.y); grow(o.x + Math.max(60, (o.text?.length || 1) * (o.size || 16) * 0.6), o.y + (o.size || 16) * 1.4); }
    });

    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }, [selectedLassoLines, selectedObjects, pages, currentPageIndex]);

  // The selected object, its kind, and its box in page coordinates. Drives the
  // floating context menu — actions belong next to the thing they act on, not in a
  // toolbar at the far edge of the screen where nobody finds them.
  const selectedInfo = React.useMemo(() => {
    if (!selectedId) return null;
    const page = pages[currentPageIndex];
    if (!page) return null;

    for (const kind of ['images', 'shapes', 'texts', 'stickers']) {
      const obj = (page[kind] || []).find((o) => o.id === selectedId);
      if (!obj) continue;

      let box;
      if (kind === 'shapes') {
        box = { minX: Math.min(obj.x1, obj.x2), minY: Math.min(obj.y1, obj.y2), maxX: Math.max(obj.x1, obj.x2), maxY: Math.max(obj.y1, obj.y2) };
      } else if (kind === 'images') {
        box = { minX: obj.x, minY: obj.y, maxX: obj.x + (obj.width || 0) * (obj.scaleX || 1), maxY: obj.y + (obj.height || 0) * (obj.scaleY || 1) };
      } else if (kind === 'stickers') {
        const w = obj.audioUrl ? 130 : 150;
        const h = obj.audioUrl ? 44 : 150;
        box = { minX: obj.x, minY: obj.y, maxX: obj.x + w * (obj.scaleX || 1), maxY: obj.y + h * (obj.scaleY || 1) };
      } else {
        box = { minX: obj.x, minY: obj.y, maxX: obj.x + Math.max(60, (obj.text?.length || 1) * (obj.size || 16) * 0.6), maxY: obj.y + (obj.size || 16) * 1.4 };
      }
      return { kind, obj, box };
    }
    return null;
  }, [selectedId, pages, currentPageIndex]);

  const duplicateSelectedObject = () => {
    if (!selectedInfo) return;
    const { kind, obj } = selectedInfo;
    const clone = { ...obj, id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    shiftObject(clone, kind, 24, 24);
    pushHistory();
    updatePage(currentPageIndex, (page) => { page[kind] = [...(page[kind] || []), clone]; });
    selectShape(clone.id);
    toast.success('ทำซ้ำแล้ว');
  };

  const recolorSelectedObject = (color) => {
    if (!selectedInfo) return;
    const { kind, obj } = selectedInfo;
    const patch = kind === 'stickers' ? { color } : { color };
    pushHistory();
    updatePage(currentPageIndex, (page) => {
      page[kind] = (page[kind] || []).map((o) => (o.id === obj.id ? { ...o, ...patch } : o));
    });
  };

  // --- Lasso selection actions ---
  // While a selection is live its strokes are held in `selectedLassoLines` and
  // drawn inside a draggable group, so they are absent from the page until baked.

  const hasSelection = selectedLassoLines.length > 0 || selectedObjects.length > 0;

  const isObjectSelected = (kind, id) => selectedObjects.some((o) => o.kind === kind && o.id === id);

  // Live drag offset for a selected object. Strokes get this for free by sitting
  // inside the dragged group; objects stay in the page, so they take it here.
  const objectOffset = (kind, id) => (isObjectSelected(kind, id) ? lassoGroupPos : ZERO_OFFSET);

  // Walk the page applying `fn` to every object in the current selection.
  const mapSelectedObjects = (page, fn) => {
    selectedObjectsRef.current.forEach(({ kind, id }) => {
      const item = (page[kind] || []).find((o) => o.id === id);
      if (item) fn(item, kind);
    });
  };

  const shiftObject = (item, kind, dx, dy) => {
    if (kind === 'shapes') { item.x1 += dx; item.x2 += dx; item.y1 += dy; item.y2 += dy; }
    else { item.x += dx; item.y += dy; }
  };

  const clearLassoSelection = () => {
    selectionRef.current = [];
    selectedObjectsRef.current = [];
    setSelectedLassoLines([]);
    setSelectedObjects([]);
    setLassoGroupPos({ x: 0, y: 0 });
    lassoPathRef.current = null;
    setLassoPath(null);
  };

  // Drop the selection back onto the page at wherever it was dragged to.
  //
  // Reads and clears selectionRef synchronously rather than trusting the
  // `selectedLassoLines` state: baking can be triggered from a menu click, a tap
  // outside, and the tool-change effect, and two of those firing before React
  // re-renders would otherwise both see the old selection and bake it twice.
  const bakeLassoSelection = () => {
    const selection = selectionRef.current;
    const objects = selectedObjectsRef.current;
    if (selection.length === 0 && objects.length === 0) return;
    selectionRef.current = [];
    const { x: dx, y: dy } = lassoGroupPos;
    const moved = selection.map((l) => ({
      ...l,
      points: l.points.map((pt, i) => (i % 2 === 0 ? pt + dx : pt + dy)),
    }));
    pushHistory();
    updatePage(currentPageIndex, (page) => {
      if (moved.length > 0) page.lines = [...(page.lines || []), ...moved];
      if (dx !== 0 || dy !== 0) {
        // Objects were only drawn shifted; commit the shift for real.
        ['shapes', 'texts', 'stickers', 'images'].forEach((kind) => {
          if (!page[kind]) return;
          page[kind] = page[kind].map((o) =>
            objects.some((s) => s.kind === kind && s.id === o.id) ? { ...o } : o);
        });
        mapSelectedObjects(page, (item, kind) => shiftObject(item, kind, dx, dy));
      }
    });
    clearLassoSelection();
  };

  const deleteLassoSelection = () => {
    const objects = selectedObjectsRef.current;
    // The strokes were already lifted off the page, so dropping the selection
    // without baking deletes them. Objects are still on the page and must go.
    if (objects.length > 0) {
      pushHistory();
      updatePage(currentPageIndex, (page) => {
        ['shapes', 'texts', 'stickers', 'images'].forEach((kind) => {
          if (!page[kind]) return;
          page[kind] = page[kind].filter((o) => !objects.some((s) => s.kind === kind && s.id === o.id));
        });
      });
    }
    clearLassoSelection();
    toast.success('ลบส่วนที่เลือกแล้ว');
  };

  const duplicateLassoSelection = () => {
    const offset = 24;
    const dx = lassoGroupPos.x + offset;
    const dy = lassoGroupPos.y + offset;
    const copies = selectionRef.current.map((l) => ({
      ...l,
      points: l.points.map((pt, i) => (i % 2 === 0 ? pt + dx : pt + dy)),
    }));
    const objects = selectedObjectsRef.current;
    if (copies.length === 0 && objects.length === 0) return;
    pushHistory();
    updatePage(currentPageIndex, (page) => {
      if (copies.length > 0) page.lines = [...(page.lines || []), ...copies];
      objects.forEach(({ kind, id }) => {
        const src = (page[kind] || []).find((o) => o.id === id);
        if (!src) return;
        const clone = { ...src, id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        shiftObject(clone, kind, dx, dy);
        page[kind] = [...page[kind], clone];
      });
    });
    toast.success('ทำซ้ำแล้ว');
  };

  // Edits go through selectionRef as well, so a later bake writes the edited
  // strokes rather than the originals captured when the lasso closed.
  const recolorLassoSelection = (color) => {
    const next = selectionRef.current.map((l) => ({ ...l, color }));
    selectionRef.current = next;
    setSelectedLassoLines(next);

    // Shapes and text carry a colour too; sticky notes and images do not.
    const tintable = selectedObjectsRef.current.filter((o) => o.kind === 'shapes' || o.kind === 'texts');
    if (tintable.length === 0) return;
    pushHistory();
    updatePage(currentPageIndex, (page) => {
      tintable.forEach(({ kind, id }) => {
        page[kind] = (page[kind] || []).map((o) => (o.id === id ? { ...o, color } : o));
      });
    });
  };

  const scaleLassoSelection = (factor) => {
    const box = lassoBounds;
    if (!box) return;
    const cx = box.minX, cy = box.minY;
    const next = selectionRef.current.map((l) => ({
      ...l,
      size: Math.max(1, (l.size || 4) * factor),
      points: l.points.map((pt, i) => (i % 2 === 0 ? cx + (pt - cx) * factor : cy + (pt - cy) * factor)),
    }));
    selectionRef.current = next;
    setSelectedLassoLines(next);
  };

  const handlePointerMove = (e) => {
    const evt = e?.evt;
    if (evt && evt.pointerId !== undefined && activePointers.current.has(evt.pointerId)) {
      activePointers.current.set(evt.pointerId, { type: evt.pointerType, clientX: evt.clientX, clientY: evt.clientY });
    }
    // A pinch is two *fingers*. A pen moving with a palm resting beside it keeps
    // drawing; the palm's movements are filtered out by the drawingPointerId check.
    let touchCount = 0;
    for (const p of activePointers.current.values()) if (p.type === 'touch') touchCount++;
    if (touchCount >= 2 && evt?.pointerType !== 'pen') { handlePinch(); return; }

    if (panningRef.current && evt) {
      const dx = evt.clientX - panningRef.current.x;
      const dy = evt.clientY - panningRef.current.y;
      panningRef.current = { x: evt.clientX, y: evt.clientY };
      // Same direct-manipulation trick as the pinch: move the stage itself and
      // commit to state when the pointer lifts, instead of re-rendering per move.
      const stage = stageRef.current;
      if (stage) {
        const pos = { x: stage.x() + dx, y: stage.y() + dy };
        gestureRef.current = { scale: stage.scaleX(), pos };
        panMovedRef.current = true;
        stage.position(pos);
        stage.batchDraw();
      }
      return;
    }

    if (!isDrawing.current || tool === 'pan' || isSpaceDown) return;
    // Ignore stray pointers (a palm landing mid-stroke) — only the pointer that
    // started the stroke may extend it.
    if (evt && drawingPointerId.current !== undefined && evt.pointerId !== drawingPointerId.current) return;
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    // Ink stops at the page edge; dragging past it pins the stroke to the border.
    pos.x = Math.max(0, Math.min(currentPage.width, pos.x));
    pos.y = Math.max(0, Math.min(currentPage.height, pos.y));

    if (tool === 'eraser') {
       if (eraserSettings.mode === 'area') extendLiveStroke(pos, 1);
       else eraseAt(pos);
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
       const path = lassoPathRef.current;
       if (path && isDrawing.current) {
          const n = path.length;
          if (Math.hypot(pos.x - path[n - 2], pos.y - path[n - 1]) >= 2) {
             path.push(pos.x, pos.y);
             setLassoPath(path.slice());
          }
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
    
    extendLiveStroke(pos, getPressure(e));
  };

  const handlePointerUp = (e) => {
    const evt = e?.evt;
    if (evt && evt.pointerId !== undefined) activePointers.current.delete(evt.pointerId);
    let remainingTouches = 0;
    for (const p of activePointers.current.values()) if (p.type === 'touch') remainingTouches++;
    if (remainingTouches < 2) {
      lastCenter.current = null; lastDist.current = null;
      // Pinch (or drag-pan) over: fold the live transform into state exactly once.
      if (gestureRef.current) commitGestureTransform();
    }
    panningRef.current = null;

    if (liveStrokeRef.current) {
       commitLiveStroke();
       isDrawing.current = false;
       drawingPointerId.current = null;
       return;
    }
    gestureErasedRef.current = false;
    drawingPointerId.current = null;

    if (tool === 'lasso' && isDrawing.current && lassoPathRef.current) {
       isDrawing.current = false;
       const path = lassoPathRef.current;
       const page = pagesRef.current[currentPageIndex];

       // Fewer than 3 vertices is a tap, not a loop.
       if (!page || path.length < 6) {
          lassoPathRef.current = null;
          setLassoPath(null);
          return;
       }

       const inside = [];
       const outside = [];
       (page.lines || []).forEach((line) => {
          let hit = false;
          for (let i = 0; i < line.points.length; i += 2) {
             if (pointInPolygon(line.points[i], line.points[i + 1], path)) { hit = true; break; }
          }
          (hit ? inside : outside).push(line);
       });

       // Objects are caught by their anchor point falling inside the loop.
       const objects = [];
       (page.shapes || []).forEach((s) => {
          if (pointInPolygon((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, path)) objects.push({ kind: 'shapes', id: s.id });
       });
       (page.texts || []).forEach((t) => {
          if (pointInPolygon(t.x, t.y, path)) objects.push({ kind: 'texts', id: t.id });
       });
       (page.stickers || []).forEach((st) => {
          if (pointInPolygon(st.x, st.y, path)) objects.push({ kind: 'stickers', id: st.id });
       });
       (page.images || []).forEach((im) => {
          if (pointInPolygon(im.x + (im.width || 0) / 2, im.y + (im.height || 0) / 2, path)) objects.push({ kind: 'images', id: im.id });
       });

       if (inside.length > 0 || objects.length > 0) {
          selectionRef.current = inside;
          selectedObjectsRef.current = objects;
          setSelectedLassoLines(inside);
          setSelectedObjects(objects);
          setLassoGroupPos({ x: 0, y: 0 });
          if (inside.length > 0) {
             pushHistory();
             updatePage(currentPageIndex, (p) => { p.lines = outside; });
          }
       } else {
          lassoPathRef.current = null;
          setLassoPath(null);
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
  // While a pinch or one-finger pan is in flight, the transform is applied to the
  // Konva stage DIRECTLY and only committed to React state when the fingers lift.
  // Routing every pointermove through setState re-rendered this whole component per
  // frame, which is exactly the judder that made zooming feel worse than
  // Huawei Notes / GoodNotes.
  const gestureRef = useRef(null); // { scale, pos } of the live stage transform
  const panMovedRef = useRef(false);

  // If something unrelated re-renders mid-gesture (autosave flag, a toast), the
  // Stage props would snap the transform back to the stale committed state for one
  // frame. Re-assert the live gesture transform after every render while active.
  useEffect(() => {
    const stage = stageRef.current;
    if (gestureRef.current && stage) {
      stage.scale({ x: gestureRef.current.scale, y: gestureRef.current.scale });
      stage.position(gestureRef.current.pos);
      stage.batchDraw();
    }
  });

  // Fold the live stage transform back into React state, once, at gesture end.
  // pageX depends on scale (the page re-centres when zoomed out), so the committed
  // position is compensated to keep the page exactly where the fingers left it.
  const commitGestureTransform = () => {
    const stage = stageRef.current;
    panMovedRef.current = false;
    if (!gestureRef.current || !stage) { gestureRef.current = null; return; }
    gestureRef.current = null;
    stage.listening(true);
    const s = stage.scaleX();
    const pos = stage.position();
    const oldPageX = Math.max(0, (dimensions.width - currentPage.width * scale) / 2 / scale);
    const newPageX = Math.max(0, (dimensions.width - currentPage.width * s) / 2 / s);
    setScale(s);
    setPosition({ x: pos.x + (oldPageX - newPageX) * s, y: pos.y });
  };
  
  useEffect(() => {
    // Re-render when scale changes for textarea positioning
  }, [scale, position]);

  // Two-pointer pinch/pan, driven off the activePointers map so it works for
  // fingers on a tablet and for a pen resting alongside them.
  const handlePinch = () => {
    // Only fingers pinch — a stray pen or palm-classified pointer must not skew
    // the zoom centre.
    const pts = Array.from(activePointers.current.values()).filter(p => p.type === 'touch').slice(0, 2);
    if (pts.length < 2) return;
    {
      const p1 = { x: pts[0].clientX, y: pts[0].clientY };
      const p2 = { x: pts[1].clientX, y: pts[1].clientY };

      const newCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (lastCenter.current && lastDist.current) {
        const stage = stageRef.current;
        // Read the LIVE transform off the stage, not React state: state lags a
        // frame or more behind during a fast gesture and the stale reads were a
        // second source of jitter.
        const oldScale = stage.scaleX();
        const stagePos = stage.position();

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
          x: (pointerPosition.x - stagePos.x) / oldScale,
          y: (pointerPosition.y - stagePos.y) / oldScale,
        };

        const newPos = {
          x: pointerPosition.x - mousePointTo.x * newScale + dx,
          y: pointerPosition.y - mousePointTo.y * newScale + dy,
        };

        // Apply straight to the canvas — zero React re-renders per frame. Hit
        // detection is paused for the duration; nobody taps a button mid-pinch,
        // and skipping the hit-graph redraw roughly halves the per-frame cost.
        if (!gestureRef.current) stage.listening(false);
        gestureRef.current = { scale: newScale, pos: newPos };
        stage.scale({ x: newScale, y: newScale });
        stage.position(newPos);
        stage.batchDraw();
      }

      lastCenter.current = newCenter;
      lastDist.current = dist;
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

  // Keyboard shortcuts. Registered separately from the Space-to-pan handler because
  // these close over undo/redo/deleteSelected, which are rebuilt on every render.
  useEffect(() => {
    if (readonly) return;
    const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    const onKeyDown = (e) => {
      if (isTyping(e.target) || editingTextId || editingStickerId) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNotebook(); return; }
      if (mod) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) { e.preventDefault(); deleteSelected(); }
        return;
      }
      if (e.key === 'Escape') {
        selectShape(null);
        setShowToolOptions(false);
        setShowMoreMenu(false);
        setShowPageManager(false);
        setShowSearch(false);
        return;
      }
      if (e.key === 'PageDown') { e.preventDefault(); setCurrentPageIndex(i => Math.min(pages.length - 1, i + 1)); return; }
      if (e.key === 'PageUp') { e.preventDefault(); setCurrentPageIndex(i => Math.max(0, i - 1)); return; }

      const byKey = { v: 'pan', p: 'pen', f: 'fountain', n: 'pencil', b: 'marker', h: 'highlighter', e: 'eraser', l: 'lasso', t: 'text', r: 'shape' };
      const next = byKey[e.key.toLowerCase()];
      if (next) { setTool(next); setShowToolOptions(false); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readonly, selectedId, editingTextId, editingStickerId, pages.length, undo, redo, deleteSelected]);

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
      .pulse-scroll-hint {
        animation: pulseHint 2s infinite ease-in-out;
      }
      @keyframes pulseHint {
        0%, 100% { opacity: 0.5; transform: translateX(0); }
        50% { opacity: 1; transform: translateX(-2px); }
      }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
      @keyframes spinSync {
        to { transform: rotate(360deg); }
      }
    `}</style>
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
      
      {/* Huawei Notes Top Navigation Bar (Fixed App Header) */}
         <div className="hide-scroll" style={{ height: 52, flexShrink: 0, width: '100%', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', zIndex: 50, borderBottom: `1px solid ${HW.hairline}`, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
               <button onClick={() => window.history.back()} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: HW.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={24} strokeWidth={1.5} />
               </button>
               {/* Page stepper (Huawei keeps this in the header, not over the canvas) */}
               {!isMobile && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 100, padding: '2px 4px' }}>
                   <button
                     onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                     disabled={currentPageIndex === 0}
                     style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', cursor: currentPageIndex === 0 ? 'default' : 'pointer', opacity: currentPageIndex === 0 ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: HW.text }}>
                     <ChevronLeft size={17} strokeWidth={2} />
                   </button>
                   <span style={{ fontSize: 12.5, fontWeight: 600, color: HW.text, minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                     {currentPageIndex + 1} / {pages.length}
                   </span>
                   <button
                     onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
                     disabled={currentPageIndex === pages.length - 1}
                     style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', cursor: currentPageIndex === pages.length - 1 ? 'default' : 'pointer', opacity: currentPageIndex === pages.length - 1 ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: HW.text }}>
                     <ChevronRight size={17} strokeWidth={2} />
                   </button>
                 </div>
               )}
               {/* Zoom cluster — the quick way back when the page has drifted off screen */}
               {!isMobile && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 100, padding: '2px 4px' }}>
                   <button title="ย่อ" onClick={() => setScale(s => Math.max(0.1, s / 1.2))} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: HW.text }}>
                     <Minus size={15} strokeWidth={2} />
                   </button>
                   <button title="พอดีหน้าจอ" onClick={fitToScreen} style={{ minWidth: 46, height: 26, borderRadius: 100, border: 'none', background: 'transparent', cursor: 'pointer', color: HW.text, fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                     {Math.round(scale * 100)}%
                   </button>
                   <button title="ขยาย" onClick={() => setScale(s => Math.min(5, s * 1.2))} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: HW.text }}>
                     <Plus size={15} strokeWidth={2} />
                   </button>
                 </div>
               )}
               {isSaving && (
                  <span title="กำลังบันทึก" style={{ color: '#10B981', display: 'flex', alignItems: 'center' }}>
                     <Cloud size={17} />
                  </span>
               )}
               {!isSaving && !readonly && (
                  <span title="บันทึกแล้ว" style={{ color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                     <CheckCircle size={17} />
                  </span>
               )}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative' }}>
               {!readonly && (
                 <>
                   {/* Full-view: give the whole browser width to the notebook and
                       hide the PDF panel — for people who attach the PDF inside the
                       notebook and only want to write. A labelled button, not a bare
                       icon: nobody could guess what the panel glyph meant. */}
                   {onToggleFullView && (
                     <button
                       onClick={onToggleFullView}
                       title={fullView ? 'กลับมุมมองคู่กับ PDF' : 'ขยายสมุดโน้ตเต็มจอ ซ่อน PDF ด้านข้าง'}
                       style={{ height: 34, padding: '0 12px', borderRadius: 10, border: 'none', background: fullView ? HW.accentSoft : 'rgba(0,0,0,0.05)', color: fullView ? HW.accent : HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'Kanit, sans-serif', transition: 'all 0.18s' }}
                     >
                       {fullView ? <PanelLeftOpen size={17} strokeWidth={1.8} /> : <PanelLeftClose size={17} strokeWidth={1.8} />}
                       {fullView ? 'แสดง PDF' : 'โน้ตเต็มจอ'}
                     </button>
                   )}
                   {[
                     { id: 'addpage', icon: FilePlus, title: 'เพิ่มหน้าใหม่', onClick: handleAddPage },
                     { id: 'pdf', icon: FileText, title: 'นำเข้า PDF', onClick: () => document.getElementById('pdf-upload').click() },
                     // Snip a region of the companion book straight into the note.
                     ...(activeBook?.book?.fileUrl ? [{ id: 'snip', icon: Camera, title: 'แคปจากหนังสือ', onClick: () => setShowBookSnip(true), active: showBookSnip }] : []),
                     { id: 'zoomwrite', icon: Maximize2, title: 'ขยายเขียน', onClick: () => setZoomWriter(v => !v), active: zoomWriter },
                     { id: 'search', icon: Search, title: 'ค้นหา', onClick: () => setShowSearch(!showSearch), active: showSearch },
                     { id: 'pages', icon: Columns, title: 'จัดการหน้า', onClick: () => setShowPageManager(!showPageManager), active: showPageManager },
                     { id: 'more', icon: LayoutGrid, title: 'เพิ่มเติม', onClick: () => setShowMoreMenu(!showMoreMenu), active: showMoreMenu },
                   ].map(b => (
                     <button
                       key={b.id}
                       onClick={b.onClick}
                       title={b.title}
                       style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: b.active ? HW.accentSoft : 'transparent', color: b.active ? HW.accent : HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s' }}
                     >
                       <b.icon size={20} strokeWidth={1.6} />
                     </button>
                   ))}
                 </>
               )}
               {readonly && (
                 <button onClick={exportPage} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: 'var(--teal)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                    <Download size={18} strokeWidth={2} /> Export Image
                 </button>
               )}

            </div>
         </div>

         {/* More menu dropdown. It must live OUTSIDE the header: the header scrolls
             horizontally (overflow-x auto), which silently clips any popup rendered
             inside it — that's why the ⊞ "เพิ่มเติม" button looked dead on tablets. */}
         {showMoreMenu && !readonly && (
                 <div style={{ position: 'absolute', top: 58, right: 12, zIndex: 60, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: 8, borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.05)', width: 280, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100% - 70px)', overflowY: 'auto' }}>
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
                    <button onClick={() => setStylusMode(m => (m === 'pen' ? 'auto' : 'pen'))} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <PenTool size={20} strokeWidth={1.5} color={stylusMode === 'pen' ? HW.accent : '#4B5563'} />
                       <span style={{ flex: 1 }}>เขียนด้วยปากกาเท่านั้น</span>
                       {stylusMode === 'pen' && <Check size={18} strokeWidth={2} color={HW.accent} />}
                    </button>
                    <button onClick={() => setPressureEnabled(v => !v)} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Zap size={20} strokeWidth={1.5} color={pressureEnabled ? HW.accent : '#4B5563'} />
                       <span style={{ flex: 1 }}>ไวต่อแรงกด</span>
                       {pressureEnabled && <Check size={18} strokeWidth={2} color={HW.accent} />}
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

      {/* Huawei Notes floating tool capsule (bottom-centered, overlays the canvas) */}
      {!readonly && (
         <div style={{ position: 'absolute', bottom: zoomWriter ? WRITER_H + 44 + 14 : 20, left: '50%', transform: 'translateX(-50%)', zIndex: 46, maxWidth: 'calc(100% - 24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'bottom 0.22s cubic-bezier(0.2,0.8,0.2,1)' }}>
            <div style={{ height: 52, background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: HW.radius, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}`, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, maxWidth: '100%' }}>
                 {/* FIXED Undo / Redo */}
                 <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <button onClick={undo} disabled={!canUndo} className="cancel-drag" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: canUndo ? '#4B5563' : '#D1D5DB', cursor: canUndo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Undo2 size={20} strokeWidth={1.5} />
                    </button>
                    <button onClick={redo} disabled={!canRedo} className="cancel-drag" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: canRedo ? '#4B5563' : '#D1D5DB', cursor: canRedo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Redo2 size={20} strokeWidth={1.5} />
                    </button>
                 </div>
                 
                 <div style={{ width: 1, background: '#E5E7EB', height: 24, flexShrink: 0, margin: '0 4px' }}></div>
                 
                 {/* Tools (Scrollable with visual hint) */}
                 <div style={{ position: 'relative', display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                   {showLeftScrollHint && (
                     <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, background: 'linear-gradient(to right, white, transparent)', zIndex: 2, pointerEvents: 'none' }} />
                   )}
                   <div
                      ref={toolsScrollRef}
                      onScroll={handleToolsScroll}
                      className="hide-scroll"
                      style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth', flex: 1 }}
                      onWheel={(e) => {
                         if (e.deltaY !== 0) {
                            e.currentTarget.scrollLeft += e.deltaY;
                         }
                      }}
                      {...leftToolbarScroll}
                   >
                  
                  {[
                    { id: 'pan', icon: Pointer, title: 'เลื่อนกระดาน' },
                    { id: 'pen', icon: PenTool, title: 'ปากกาลูกลื่น' },
                    { id: 'fountain', icon: Feather, title: 'ปากกาหมึกซึม' },
                    { id: 'pencil', icon: Pencil, title: 'ดินสอ' },
                    { id: 'marker', icon: Brush, title: 'มาร์กเกอร์' },
                    { id: 'highlighter', icon: Highlighter, title: 'ไฮไลท์' },
                    { id: 'eraser', icon: Eraser, title: 'ยางลบ' },
                    { id: 'lasso', icon: Lasso, title: 'Lasso' },
                    { id: 'ruler', icon: Ruler, title: 'ไม้บรรทัด' },
                    { id: 'text', icon: Type, title: 'ข้อความ' },
                    { id: 'shape', icon: Square, title: 'รูปร่าง' },
                    { id: 'image', icon: ImageIcon, title: 'แทรกรูปภาพ' },
                    { id: 'sticker', icon: StickyNote, title: 'โพสต์อิท' },
                    { id: 'laser', icon: Wand2, title: 'เลเซอร์พอยเตอร์' },
                    { id: 'mic', icon: Mic, title: 'อัดเสียง' }
                  ].map(t => (
                     <button 
                       key={t.id}
                       title={t.title}
                       onClick={() => {
                          if (t.id === 'image') { document.getElementById('image-upload').click(); return; }
                          if (t.id === 'mic') { toggleRecording(); return; }
                          // The ruler is a modifier, not a tool — it stays on while you draw.
                          if (t.id === 'ruler') { setRulerOn(v => !v); return; }
                          // One tap does it all: selecting a tool also opens its
                          // options right away (nobody discovers a second tap), and
                          // the popover tucks itself away as soon as drawing starts.
                          // Tapping the active tool toggles the popover.
                          const hasOptions = ['pen', 'fountain', 'marker', 'pencil', 'highlighter', 'shape', 'sticker', 'eraser', 'text'].includes(t.id);
                          if (tool === t.id) setShowToolOptions(v => !v);
                          else { setTool(t.id); setShowToolOptions(hasOptions); setShowColorPicker(false); }
                       }}
                       style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, border: 'none', background: (t.id === 'ruler' ? rulerOn : tool === t.id && !['image','mic'].includes(t.id)) ? HW.accentSoft : 'transparent', color: (t.id === 'ruler' ? rulerOn : tool === t.id && !['image','mic'].includes(t.id)) ? HW.accent : (t.id === 'mic' && isRecording ? '#EF4444' : HW.textDim), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.18s cubic-bezier(0.2,0.8,0.2,1), background 0.18s, color 0.18s', position: 'relative', transform: (t.id === 'ruler' ? rulerOn : tool === t.id && !['image','mic'].includes(t.id)) ? 'translateY(-4px)' : 'none' }}
                     >
                       <t.icon size={20} strokeWidth={1.6} />
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
               {showRightScrollHint && (
                 <div className="pulse-scroll-hint" style={{ position: 'absolute', right: -4, top: 0, bottom: 0, width: 24, background: 'linear-gradient(to left, rgba(255,255,255,1) 40%, rgba(255,255,255,0))', zIndex: 2, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                   <ChevronRight size={14} color="#9CA3AF" />
                 </div>
               )}
             </div>
            </div>

            {/* In-app colour picker — sits above the options popover, outside the
                scrollable capsule so it can never be clipped */}
            {showColorPicker && (
              <div style={{ order: -2 }}>
                <ColorPickerPanel
                  color={penColor}
                  recentColors={customColors}
                  onChange={(c) => { setPenColor(c); if (tool === 'text') applyColorToActiveText(c); }}
                  onCommit={(c) => { setPenColor(c); if (tool === 'text') applyColorToActiveText(c); rememberCustomColor(c); setShowColorPicker(false); }}
                  onClose={() => setShowColorPicker(false)}
                />
              </div>
            )}

            {/* Tool options popover — floats above the capsule, Huawei style */}
            {showToolOptions && ['pen', 'fountain', 'marker', 'pencil', 'highlighter', 'shape', 'sticker', 'eraser', 'text'].includes(tool) && (
              <div className="hide-scroll" style={{ order: -1, display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%', overflowX: 'auto', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: 16, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}`, padding: '10px 14px' }} onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY; }} {...rightToolbarScroll}>
                  {['pen', 'fountain', 'marker', 'pencil', 'highlighter', 'shape'].includes(tool) && (
                     <>
                        {tool === 'shape' && (
                           <>
                             <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                {[{ t: 'rect', Icon: Square }, { t: 'circle', Icon: Circle }, { t: 'triangle', Icon: Triangle }, { t: 'line', Icon: Minus }].map(({ t, Icon }) => (
                                  <button key={t} onClick={() => setShapeType(t)} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: shapeType === t ? HW.accentSoft : 'transparent', color: shapeType === t ? HW.accent : '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={20} strokeWidth={1.6} />
                                  </button>
                                ))}
                             </div>
                             <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>
                           </>
                        )}

                        {/* Stroke sizes as graduated dots (Huawei) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                           {sizes.map(s => (
                              <button
                                key={s}
                                onClick={() => setPenSize(s)}
                                title={`${s}px`}
                                style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: penSize === s ? HW.accentSoft : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.18s' }}
                              >
                                <span style={{ display: 'block', width: Math.min(18, 4 + s * 0.7), height: Math.min(18, 4 + s * 0.7), borderRadius: '50%', background: penSize === s ? HW.accent : HW.textDim }} />
                              </button>
                           ))}
                        </div>

                        <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                           {colors.map(c => (
                              <div
                                key={c}
                                onClick={() => setPenColor(c)}
                                title={c}
                                style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: penColor === c ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2, transition: 'outline 0.15s' }}
                              />
                           ))}
                           {customColors.slice(0, 3).map((c) => (
                              <div
                                key={`custom-${c}`}
                                onClick={() => setPenColor(c)}
                                title={c}
                                style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: penColor === c ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2 }}
                              />
                           ))}
                           <button
                             title="เลือกสีเอง"
                             onClick={() => setShowColorPicker(v => !v)}
                             style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0, background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: showColorPicker ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2 }}
                           />
                        </div>

                        {['pen', 'fountain', 'marker', 'pencil'].includes(tool) && (
                           <>
                              <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>
                              <button
                                onClick={() => setAutoShape(v => !v)}
                                title="วาดรูปทรงคร่าว ๆ แล้วปล่อย ระบบจะจัดให้เป็นรูปทรงที่สมบูรณ์"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 9, border: 'none', background: autoShape ? HW.accentSoft : 'transparent', color: autoShape ? HW.accent : HW.textDim, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                              >
                                <Triangle size={15} strokeWidth={1.8} /> จัดรูปทรงอัตโนมัติ
                              </button>
                           </>
                        )}
                     </>
                  )}

                  {tool === 'text' && (() => {
                     // Edits apply to the text being typed or the selected one, so the
                     // effect is visible straight away rather than only on the next box.
                     const applyToActive = (patch) => {
                        const id = editingTextId || selectedId;
                        if (!id) return;
                        updatePage(currentPageIndex, (page) => {
                           page.texts = (page.texts || []).map(t => (t.id === id ? { ...t, ...patch } : t));
                        });
                     };
                     const setStyle = (patch, textPatch) => {
                        setTextStyle(s => ({ ...s, ...patch }));
                        applyToActive(textPatch);
                     };
                     return (
                       <>
                          <select
                            value={textStyle.fontFamily}
                            onChange={(e) => setStyle({ fontFamily: e.target.value }, { fontFamily: e.target.value })}
                            style={{ flexShrink: 0, height: 30, borderRadius: 9, border: `1px solid ${HW.hairline}`, background: 'white', color: HW.text, fontSize: 12.5, padding: '0 8px', cursor: 'pointer', fontFamily: textStyle.fontFamily }}
                          >
                            {['Kanit', 'Prompt', 'Sarabun', 'serif', 'monospace'].map(f => (
                              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                            ))}
                          </select>

                          <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                             {[16, 20, 24, 32, 44, 60].map(sz => (
                                <button
                                  key={sz}
                                  onClick={() => setStyle({ fontSize: sz }, { size: sz })}
                                  style={{ minWidth: 28, height: 28, padding: '0 5px', borderRadius: 9, border: 'none', background: textStyle.fontSize === sz ? HW.accentSoft : 'transparent', color: textStyle.fontSize === sz ? HW.accent : HW.textDim, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                >
                                  {sz}
                                </button>
                             ))}
                          </div>

                          <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                             <button
                               onClick={() => setStyle({ bold: !textStyle.bold }, { bold: !textStyle.bold })}
                               title="ตัวหนา"
                               style={{ width: 30, height: 28, borderRadius: 9, border: 'none', background: textStyle.bold ? HW.accentSoft : 'transparent', color: textStyle.bold ? HW.accent : HW.textDim, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
                             >B</button>
                             <button
                               onClick={() => setStyle({ italic: !textStyle.italic }, { italic: !textStyle.italic })}
                               title="ตัวเอียง"
                               style={{ width: 30, height: 28, borderRadius: 9, border: 'none', background: textStyle.italic ? HW.accentSoft : 'transparent', color: textStyle.italic ? HW.accent : HW.textDim, fontSize: 14, fontStyle: 'italic', fontWeight: 700, cursor: 'pointer' }}
                             >I</button>
                          </div>

                          <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                             {colors.map(c => (
                                <div
                                  key={c}
                                  onClick={() => { setPenColor(c); applyToActive({ color: c }); }}
                                  title={c}
                                  style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: penColor === c ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2 }}
                                />
                             ))}
                             <button
                               title="เลือกสีเอง"
                               onClick={() => setShowColorPicker(v => !v)}
                               style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0, background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: showColorPicker ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2 }}
                             />
                          </div>
                       </>
                     );
                  })()}

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
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                           {[{ m: 'stroke', label: 'ลบทั้งเส้น' }, { m: 'area', label: 'ลบบางส่วน' }].map(({ m, label }) => (
                              <button
                                key={m}
                                onClick={() => setEraserSettings(s => ({ ...s, mode: m }))}
                                style={{ padding: '5px 10px', borderRadius: 9, border: 'none', background: eraserSettings.mode === m ? HW.accentSoft : 'transparent', color: eraserSettings.mode === m ? HW.accent : HW.textDim, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                              >
                                {label}
                              </button>
                           ))}
                        </div>

                        <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                           {[12, 24, 40, 64].map(sz => (
                              <button
                                key={sz}
                                onClick={() => setEraserSettings(s => ({ ...s, size: sz }))}
                                title={`${sz}px`}
                                style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: eraserSettings.size === sz ? HW.accentSoft : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ display: 'block', width: 4 + sz * 0.22, height: 4 + sz * 0.22, borderRadius: '50%', border: `1.5px solid ${eraserSettings.size === sz ? HW.accent : HW.textDim}` }} />
                              </button>
                           ))}
                        </div>

                        <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: HW.textDim, cursor: 'pointer', fontWeight: 500, flexShrink: 0 }}>
                           <input type="checkbox" checked={eraserSettings.eraseObjects} onChange={() => setEraserSettings(s => ({ ...s, eraseObjects: !s.eraseObjects }))} />
                           ลบวัตถุด้วย
                        </label>
                        <button onClick={clearStrokes} style={{ padding: '5px 10px', borderRadius: 9, border: `1px solid ${HW.hairline}`, background: 'white', color: '#EF4444', fontWeight: 600, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>ล้างเส้นทั้งหมด</button>
                     </div>
                  )}
              </div>
            )}
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

      {/* Cloud sync overlay: spinner + percent bar, blocks the canvas until data arrives */}
      {isSyncing && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
           <div style={{ width: 44, height: 44, borderRadius: '50%', border: `4px solid ${HW.accentSoft}`, borderTopColor: HW.accent, animation: 'spinSync 0.9s linear infinite' }}></div>
           <span style={{ fontSize: 16, fontWeight: 600, color: HW.text, fontFamily: 'Kanit, sans-serif' }}>
             กำลังซิงก์ข้อมูลคลาวด์...{syncProgress != null ? ` ${Math.round(syncProgress * 100)}%` : ''}
           </span>
           <div style={{ width: 220, height: 6, borderRadius: 100, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
             <div style={{
               height: '100%', borderRadius: 100, background: HW.accent,
               width: syncProgress != null ? `${Math.round(syncProgress * 100)}%` : '30%',
               transition: 'width 0.2s ease',
               ...(syncProgress == null ? { animation: 'pulse 1.2s infinite' } : {})
             }}></div>
           </div>
           <span style={{ fontSize: 12.5, color: HW.textDim, fontFamily: 'Kanit, sans-serif' }}>กรุณารอสักครู่ กำลังโหลดสมุดโน้ตของคุณ</span>
         </div>
      )}

      
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.evt.preventDefault()}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        // touchAction:none stops the browser from claiming pan/zoom gestures, which
        // would otherwise swallow strokes and pinches on a tablet.
        style={{ cursor: readonly || tool === 'pan' ? 'grab' : 'crosshair', touchAction: 'none' }}
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
                x={img.x + objectOffset('images', img.id).x}
                y={img.y + objectOffset('images', img.id).y}
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
                 x: s.x1 + objectOffset('shapes', s.id).x, y: s.y1 + objectOffset('shapes', s.id).y, stroke: s.color, strokeWidth: s.size, opacity: s.opacity,
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
        
        {/* Drawing Layer (Strokes isolated so eraser only erases strokes).
            Clipped to the paper so no ink — old or new — ever shows outside it. */}
        <Layer>
          <Group x={pageX} y={pageY} clipX={0} clipY={0} clipWidth={currentPage.width} clipHeight={currentPage.height}>
            {/* Strokes */}
            <CommittedStrokes lines={currentPage.lines} playbackTime={playbackTime} />
            {/* The stroke under the pointer lives here so committed ink stays untouched
                while drawing. It has to share this layer for the area eraser's
                destination-out compositing to bite into the ink below it. */}
            {liveStroke && <StrokeShape line={liveStroke} />}
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
            

            {/* Ruler: draggable body plus a handle at the far end for rotation */}
            {rulerOn && !readonly && (() => {
               const rad = (ruler.angle * Math.PI) / 180;
               const hx = ruler.x + Math.cos(rad) * ruler.length;
               const hy = ruler.y + Math.sin(rad) * ruler.length;
               const ticks = [];
               for (let d = 0; d <= ruler.length; d += 20) {
                  const long = d % 100 === 0;
                  ticks.push(<Path key={`tk-${d}`} data={`M ${d} 0 L ${d} ${long ? 16 : 9}`} stroke="rgba(10,89,247,0.55)" strokeWidth={1} />);
               }
               return (
                 <>
                   <Group
                     name="ruler"
                     x={ruler.x}
                     y={ruler.y}
                     rotation={ruler.angle}
                     draggable
                     onDragEnd={(e) => setRuler(r => ({ ...r, x: e.target.x(), y: e.target.y() }))}
                   >
                     <Rect width={ruler.length} height={58} fill="rgba(10,89,247,0.10)" stroke="rgba(10,89,247,0.45)" strokeWidth={1} cornerRadius={4} />
                     {ticks}
                     <Text text={`${Math.round(((ruler.angle % 360) + 360) % 360)}°`} x={10} y={34} fontSize={14} fill={HW.accent} fontFamily="Kanit, sans-serif" />
                   </Group>
                   <Circle
                     name="ruler-handle"
                     x={hx}
                     y={hy}
                     radius={13}
                     fill="white"
                     stroke={HW.accent}
                     strokeWidth={2}
                     draggable
                     onDragMove={(e) => {
                        const nx = e.target.x(), ny = e.target.y();
                        let deg = (Math.atan2(ny - ruler.y, nx - ruler.x) * 180) / Math.PI;
                        // Ease onto the common angles without preventing free rotation.
                        const near = Math.round(deg / 15) * 15;
                        if (Math.abs(deg - near) < 3) deg = near;
                        setRuler(r => ({ ...r, angle: deg }));
                     }}
                     onDragEnd={(e) => {
                        // Snap the handle back onto the ruler's end point.
                        const rad2 = (ruler.angle * Math.PI) / 180;
                        e.target.position({ x: ruler.x + Math.cos(rad2) * ruler.length, y: ruler.y + Math.sin(rad2) * ruler.length });
                     }}
                   />
                 </>
               );
            })()}

            {/* Shows which slice of the page the zoom-in writing strip is showing */}
            {zoomWriter && (
               <Rect
                 x={writerFocus.x}
                 y={writerFocus.y}
                 width={writerBoxW}
                 height={writerBoxH}
                 stroke={HW.accent}
                 strokeWidth={1.5}
                 dash={[7, 5]}
                 fill="rgba(10,89,247,0.05)"
                 cornerRadius={3}
                 listening={false}
               />
            )}

            {/* Lasso path being drawn */}
            {tool === 'lasso' && lassoPath && !hasSelection && (
               <Line points={lassoPath} stroke={HW.accent} strokeWidth={1.5} dash={[6, 4]} closed fill="rgba(10,89,247,0.06)" lineCap="round" lineJoin="round" />
            )}
            
            {/* Lasso Selected Group */}
            {/* Lasso Selection Box */}
            {hasSelection && (
               <Group
                 name="lasso-group"
                 draggable
                 x={lassoGroupPos.x}
                 y={lassoGroupPos.y}
                 // Tracked during the drag, not just at the end, so selected
                 // objects (which stay on the page) travel with the strokes.
                 onDragMove={(e) => setLassoGroupPos({ x: e.target.x(), y: e.target.y() })}
                 onDragEnd={(e) => setLassoGroupPos({ x: e.target.x(), y: e.target.y() })}
               >
                  {/* Invisible grab surface: without it a selection made up only of
                      objects would have nothing to drag. */}
                  {lassoBounds && (
                     <Rect
                       x={lassoBounds.minX - 6}
                       y={lassoBounds.minY - 6}
                       width={lassoBounds.maxX - lassoBounds.minX + 12}
                       height={lassoBounds.maxY - lassoBounds.minY + 12}
                       fill="rgba(0,0,0,0.001)"
                     />
                  )}
                  {lassoBounds && (
                     <Rect
                       x={lassoBounds.minX - 6}
                       y={lassoBounds.minY - 6}
                       width={lassoBounds.maxX - lassoBounds.minX + 12}
                       height={lassoBounds.maxY - lassoBounds.minY + 12}
                       stroke={HW.accent}
                       strokeWidth={1.5}
                       dash={[6, 4]}
                       fill="rgba(10,89,247,0.04)"
                       cornerRadius={4}
                     />
                  )}
                  {selectedLassoLines.map((line, i) => (
                     <StrokeShape key={`lasso-line-${i}`} line={line} />
                  ))}
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
                x={t.x + objectOffset('texts', t.id).x}
                y={t.y + objectOffset('texts', t.id).y}
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
                  <Text
                    text={t.text}
                    fontSize={t.size}
                    fill={t.color}
                    fontFamily={t.fontFamily || 'Kanit'}
                    fontStyle={[t.bold ? 'bold' : '', t.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'}
                    padding={4}
                  />
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
                    x={st.x + objectOffset('stickers', st.id).x}
                    y={st.y + objectOffset('stickers', st.id).y}
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
                  x={st.x + objectOffset('stickers', st.id).x}
                  y={st.y + objectOffset('stickers', st.id).y}
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
                  // Pan selects the note so the context menu appears; the sticky-note
                  // tool goes straight into typing, which is what you want with it.
                  onClick={(e) => { e.cancelBubble = true; if (tool === 'sticker') { setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); } else if (tool === 'pan' || tool === 'lasso') { selectShape(st.id); } }}
                  onTap={(e) => { e.cancelBubble = true; if (tool === 'sticker') { setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); } else if (tool === 'pan' || tool === 'lasso') { selectShape(st.id); } }}
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
                fontFamily: t.fontFamily || 'Kanit',
                fontWeight: t.bold ? 700 : 400,
                fontStyle: t.italic ? 'italic' : 'normal',
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
               ref={stickerTextareaRef}
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
             {/* preventDefault keeps focus on the textarea. Without it the button
                 steals focus, onBlur closes the editor, and this button unmounts
                 before the click can land — so delete silently did nothing. */}
             <button
               onPointerDown={(e) => e.stopPropagation()}
               onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
               onClick={() => {
                 const id = editingStickerId;
                 pushHistory();
                 updatePage(currentPageIndex, (page) => {
                    page.stickers = (page.stickers || []).filter(s => s.id !== id);
                 });
                 setEditingStickerId(null);
                 toast.success('ลบโพสต์อิทแล้ว');
               }}
               style={{ background: '#EF4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start', fontSize: 13, boxShadow: '0 2px 8px rgba(239,68,68,0.2)' }}
             >
                ลบโพสต์อิท
             </button>
           </div>
         );
      })()}
      {/* Zoom-in writing strip */}
      {zoomWriter && !readonly && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: WRITER_H + 44, zIndex: 45, background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderTop: `1px solid ${HW.hairline}`, boxShadow: '0 -6px 24px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>

          {/* Strip controls */}
          <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: `1px solid ${HW.hairline}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button title="เลื่อนซ้าย" onClick={() => moveWriterFocus(-writerBoxW * 0.45, 0)} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft size={19} strokeWidth={1.8} />
              </button>
              <button title="เลื่อนขวา" onClick={() => moveWriterFocus(writerBoxW * 0.45, 0)} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight size={19} strokeWidth={1.8} />
              </button>
              <button title="บรรทัดถัดไป" onClick={() => moveWriterFocus(-writerFocus.x, writerBoxH * 0.62)} style={{ marginLeft: 6, padding: '5px 12px', borderRadius: 9, border: 'none', background: HW.accentSoft, color: HW.accent, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                บรรทัดถัดไป
              </button>
              <button title="บรรทัดก่อนหน้า" onClick={() => moveWriterFocus(0, -writerBoxH * 0.62)} style={{ padding: '5px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: HW.textDim, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                ขึ้นบน
              </button>
            </div>
            <button onClick={() => setZoomWriter(false)} style={{ padding: '5px 12px', borderRadius: 9, border: `1px solid ${HW.hairline}`, background: 'white', color: HW.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              ปิด
            </button>
          </div>

          <Stage
            ref={writerStageRef}
            width={dimensions.width}
            height={WRITER_H}
            scaleX={WRITER_ZOOM}
            scaleY={WRITER_ZOOM}
            x={-writerFocus.x * WRITER_ZOOM}
            y={-writerFocus.y * WRITER_ZOOM}
            onPointerDown={handleWriterDown}
            onPointerMove={handleWriterMove}
            onPointerUp={handleWriterUp}
            onPointerCancel={handleWriterUp}
            style={{ touchAction: 'none', cursor: 'crosshair' }}
          >
            <Layer>
              <Rect
                width={currentPage.width}
                height={currentPage.height}
                fill={currentPage.paperColor === 'yellow' ? '#FEF3C7' : currentPage.paperColor === 'dark' ? '#1F2937' : 'white'}
              />
              {!currentPage.src && currentPage.paperType !== 'blank' && (
                <PaperPattern width={currentPage.width} height={currentPage.height} type={currentPage.paperType || 'lines'} color={currentPage.paperColor || 'white'} />
              )}
              {currentPage.src && (
                <PDFPageImage src={currentPage.src} width={currentPage.width} height={currentPage.height} />
              )}
            </Layer>
            <Layer>
              <CommittedStrokes lines={currentPage.lines} playbackTime={playbackTime} />
              {liveStroke && <StrokeShape line={liveStroke} />}
            </Layer>
          </Stage>
        </div>
      )}

      {/* Context menu for a single selected object, pinned just above it. */}
      {selectedInfo && !readonly && !hasSelection && (() => {
         const { kind, obj, box } = selectedInfo;
         const left = (box.minX + pageX) * scale + position.x + ((box.maxX - box.minX) * scale) / 2;
         const top = (box.minY + pageY) * scale + position.y - 54;
         const btn = { height: 32, padding: '0 10px', borderRadius: 10, border: 'none', background: 'transparent', color: HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' };
         const divider = <div style={{ width: 1, height: 20, background: HW.hairline, margin: '0 3px' }} />;
         const swatches = kind === 'stickers' ? ['#FEF08A', '#FBCFE8', '#BAE6FD', '#BBF7D0'] : ['#111827', '#EF4444', '#F59E0B', '#10B981', '#3B82F6'];

         return (
           <div
             onPointerDown={(e) => e.stopPropagation()}
             onMouseDown={(e) => e.preventDefault()}
             style={{ position: 'absolute', left, top: Math.max(8, top), transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: 14, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}` }}
           >
              {kind === 'images' && (
                <>
                  <button style={btn} onClick={() => setCroppingImageId(obj.id)}><Crop size={16} strokeWidth={1.7} /> ครอบตัด</button>
                  {divider}
                </>
              )}

              {(kind === 'texts' || kind === 'stickers') && !obj.audioUrl && (
                <>
                  <button
                    style={btn}
                    onClick={() => {
                      if (kind === 'texts') {
                        setEditingTextId(obj.id); setEditingTextValue(obj.text || ''); isEditingText.current = true;
                      } else {
                        setEditingStickerId(obj.id); setEditingStickerValue(obj.text || '');
                      }
                      selectShape(null);
                    }}
                  >
                    <Type size={16} strokeWidth={1.7} /> แก้ไข
                  </button>
                  {divider}
                </>
              )}

              {kind !== 'images' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {swatches.map(c => (
                      <div
                        key={c}
                        title="เปลี่ยนสี"
                        onClick={() => recolorSelectedObject(c)}
                        style={{ width: 18, height: 18, borderRadius: kind === 'stickers' ? 5 : '50%', background: c, cursor: 'pointer', boxShadow: `inset 0 0 0 1px ${HW.hairline}` }}
                      />
                    ))}
                  </div>
                  {divider}
                </>
              )}

              <button style={btn} onClick={duplicateSelectedObject} title="ทำซ้ำ"><FileStack size={16} strokeWidth={1.7} /></button>
              <button style={{ ...btn, color: '#EF4444' }} onClick={deleteSelected} title="ลบ"><Trash2 size={16} strokeWidth={1.7} /></button>
              <button style={{ ...btn, color: HW.accent }} onClick={() => selectShape(null)} title="เสร็จสิ้น"><Check size={17} strokeWidth={2} /></button>
           </div>
         );
      })()}

      {/* Floating action menu for a lasso selection (Huawei shows this above the marquee) */}
      {lassoBounds && hasSelection && (() => {
         const left = (lassoBounds.minX + lassoGroupPos.x + pageX) * scale + position.x
                    + ((lassoBounds.maxX - lassoBounds.minX) * scale) / 2;
         const top = (lassoBounds.minY + lassoGroupPos.y + pageY) * scale + position.y - 58;
         const btn = { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', color: HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

         return (
           <div
             onPointerDown={(e) => e.stopPropagation()}
             style={{ position: 'absolute', left, top: Math.max(8, top), transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: 14, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}` }}
           >
              <button title="ทำซ้ำ" onClick={duplicateLassoSelection} style={btn}><FileStack size={18} strokeWidth={1.6} /></button>
              <button title="ย่อ" onClick={() => scaleLassoSelection(0.85)} style={btn}><Minus size={18} strokeWidth={1.8} /></button>
              <button title="ขยาย" onClick={() => scaleLassoSelection(1.18)} style={btn}><Plus size={18} strokeWidth={1.8} /></button>

              <div style={{ width: 1, height: 20, background: HW.hairline, margin: '0 4px' }} />

              {['#111827', '#EF4444', '#F59E0B', '#10B981', '#3B82F6'].map(c => (
                 <div
                   key={c}
                   title="เปลี่ยนสี"
                   onClick={() => recolorLassoSelection(c)}
                   style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, boxShadow: `inset 0 0 0 1px ${HW.hairline}`, margin: '0 2px' }}
                 />
              ))}

              <div style={{ width: 1, height: 20, background: HW.hairline, margin: '0 4px' }} />

              <button title="ลบ" onClick={deleteLassoSelection} style={{ ...btn, color: '#EF4444' }}><Trash2 size={18} strokeWidth={1.6} /></button>
              <button title="เสร็จสิ้น" onClick={bakeLassoSelection} style={{ ...btn, color: HW.accent }}><Check size={18} strokeWidth={2} /></button>
           </div>
         );
      })()}

      {/* Snip-from-book overlay */}
      {showBookSnip && activeBook?.book?.fileUrl && (
         <BookSnipModal
           fileUrl={activeBook.book.fileUrl}
           onClose={() => setShowBookSnip(false)}
           onInsert={({ src, width, height }) => {
             const w = Math.min(Math.min(440, currentPage.width * 0.75), width);
             const h = height * (w / width);
             pushHistory();
             updatePage(currentPageIndex, (page) => {
               if (!page.images) page.images = [];
               page.images.push({ id: `img-${Date.now()}`, src, x: (currentPage.width - w) / 2, y: 60, width: w, height: h });
             });
             setShowBookSnip(false);
             toast.success('แปะภาพจากหนังสือลงโน้ตแล้ว เลือกเครื่องมือเลื่อน (มือ) เพื่อจัดตำแหน่ง');
           }}
         />
      )}

      {/* Crop Modal Overlay */}
      {croppingImageId && (() => {
         const img = currentPage.images?.find(i => i.id === croppingImageId);
         if (!img) return null;
         return (
            <CropModal
              imageUrl={img.src}
              onCancel={() => setCroppingImageId(null)}
              onCropComplete={(newUrl) => {
                 pushHistory();
                 updatePage(currentPageIndex, (page) => {
                    const i = page.images.find(im => im.id === croppingImageId);
                    if (i) i.src = newUrl;
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
