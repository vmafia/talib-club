import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Path, Group, Circle, Text, Rect, Transformer, RegularPolygon, Line, Star as KonvaStar, Arrow as KonvaArrow } from 'react-konva';
import Draggable from 'react-draggable';
import { PenTool, Highlighter, Eraser, Pen, MousePointer2, Type, Square, Hand, Search, Save, Download, Undo2, Redo2, Image as ImageIcon, Mic, SquareSquare, ChevronLeft, ChevronRight, Settings, FilePlus, Circle as CircleIcon, Minus, Lasso, MonitorPlay, Zap, GripHorizontal, GripVertical, Pencil, Pointer, LayoutGrid, Plus, Columns, StickyNote, FileText, Bookmark, FileStack, LayoutList, Check, Lock, MousePointerClick, Move3d, Triangle, Cloud, CheckCircle, Trash2, Scissors, Crop, Brush, Feather, Maximize2, Ruler, PanelLeftClose, PanelLeftOpen, Wand2, Camera, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Underline, Strikethrough, Smile, Upload, ChevronsUp, ChevronsDown, ListMusic, X, ArrowRight, Star, Hexagon, Compass, Link2, ScanText, Spline } from 'lucide-react';
import CropModal from './CropModal';
import ColorPickerPanel from './ColorPickerPanel';
import BookSnipModal from './BookSnipModal';
import EmojiStickerPicker from './EmojiStickerPicker';
import { RecordingsPanel, PlaybackBar } from './AudioRecordings';
import { recognizeShape, shapeFromRecognition, pointInPolygon, distToSegmentXY } from '../utils/shapeRecognition.js';
import getStroke from 'perfect-freehand';
import toast from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { loadBookPdf } from '../utils/pdfCache.js';
import { uploadNotebookData, downloadNotebookData } from '../../../utils/notebookStorage.js';
import { db, storage } from '../../../lib/firebase.js';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PDFPageImage, PaperPattern, getSvgPathFromStroke, PEN_STYLES, StrokeShape, CommittedStrokes, StickyStyleThumb } from './notebook/canvasElements.jsx';
import { polygonBounds, polygonCentroid, polygonInteriorAngle, applyListPrefix, textDecorationOf, migrateText, textOf, isUniformText, uniformFormatOf, listPrefixes } from './notebook/geometry.js';
import { HW, ZERO_OFFSET, TEXT_BOX_WIDTH, LINE_HEIGHT, STICKY_COLORS, STICKY_STYLES, FONT_OPTIONS } from './notebook/theme.js';
import { useDragScroll } from './notebook/useDragScroll.js';
import ImageSearchPanel from './notebook/ImageSearchPanel.jsx';
import ObjectContextMenu from './notebook/ObjectContextMenu.jsx';
import SelectionToolbar from './notebook/SelectionToolbar.jsx';
import LassoToolbar from './notebook/LassoToolbar.jsx';
import StickyNoteEditor from './notebook/StickyNoteEditor.jsx';
import TextEditor from './notebook/TextEditor.jsx';
import PaperTemplateModal from './notebook/PaperTemplateModal.jsx';
import ExportModal from './notebook/ExportModal.jsx';
import AiAssistantPanel from './notebook/AiAssistantPanel.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Tools whose options popover opens with the tool.
const TOOLS_WITH_OPTIONS = ['pen', 'fountain', 'marker', 'pencil', 'highlighter', 'shape', 'sticker', 'eraser', 'text', 'laser', 'lasso'];

// What the lasso is allowed to pick up, GoodNotes-style. Stored per kind so the
// user can grab only the handwriting out of a page full of images and notes.
const LASSO_KINDS = [
  { key: 'lines', label: 'ลายมือ' },
  { key: 'shapes', label: 'รูปทรง/เรขาคณิต' },
  { key: 'images', label: 'รูปภาพ' },
  { key: 'texts', label: 'กล่องข้อความ' },
  { key: 'stickers', label: 'โน้ตสติกเกอร์' },
];
const DEFAULT_LASSO_FILTER = { lines: true, shapes: true, images: true, texts: true, stickers: true };

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
  // Coarse pointer = finger/stylus on a touchscreen. Drives bigger tap targets and
  // fatter transform handles so the notebook feels right on a tablet, while staying
  // compact with a mouse.
  const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
  const TOOL_BTN = isCoarse ? 46 : 40;   // tool button size in the bottom capsule
  
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

  // Item 7 (group C): the first time the lasso is picked, point out that two
  // fingers still pan/zoom — so users don't feel forced to switch tools to move
  // around. The gesture already works in every tool (handlePinch is tool-agnostic);
  // this is pure discovery, no behaviour change and nothing to tune on-device.
  useEffect(() => {
    if (tool !== 'lasso') return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem('talib_lasso_pan_hint') === 'seen') return;
    localStorage.setItem('talib_lasso_pan_hint', 'seen');
    toast('โหมดบ่วง: ใช้สองนิ้วเลื่อน/ซูมหน้าได้เลย ไม่ต้องสลับเครื่องมือ', { icon: '🤏', duration: 4500 });
  }, [tool]);

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
           // The WYSIWYG editor focuses itself on mount and parks the caret at the
           // end; re-focusing here would send it back to the start.
           const el = textareaRef.current;
           if (el && !el.isContentEditable) el.focus();
        }, 150);
     }
  }, [editingTextId]);

  // Whenever the tool changes away from 'text', force close any open text editor.
  // Declared here (not at the top of the component) so `tool`/`editingTextId`/
  // `textareaRef` already exist — referencing them earlier throws a TDZ
  // ("Cannot access 'tool' before initialization") that crashes the reader.
  useEffect(() => {
    if (tool !== 'text' && editingTextId) {
      if (textareaRef.current) {
        textareaRef.current.blur();
      }
    }
  }, [tool, editingTextId]);

  // Size the edit box to its content whenever it opens or its text changes, so an
  // existing multi-line note (bullets/numbered lists) is fully visible right away.
  // The WYSIWYG editor is a contentEditable box that already grows with its own
  // content — forcing a pixel height on it would clip long notes — so this only
  // applies to the plain textareas.
  // NB: `scale` is intentionally not a dependency — it is declared far below this
  // effect, and referencing it here evaluates during render, before its useState
  // runs, which throws "Cannot access 'scale' before initialization".
  useEffect(() => {
     const el = textareaRef.current;
     if (!el || !editingTextId || el.isContentEditable) return;
     el.style.height = 'auto';
     el.style.height = `${el.scrollHeight}px`;
     el.style.width = 'auto';
     el.style.width = `${el.scrollWidth + 4}px`;
  }, [editingTextId, editingTextValue]);

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
  
  // Which kinds of thing the lasso picks up. Remembered between sessions — a
  // "handwriting only" habit shouldn't have to be re-set every time.
  const [lassoFilter, setLassoFilter] = useState(() => {
    try { return { ...DEFAULT_LASSO_FILTER, ...JSON.parse(localStorage.getItem('talib_lasso_filter') || '{}') }; }
    catch { return { ...DEFAULT_LASSO_FILTER }; }
  });
  const lassoFilterRef = useRef(lassoFilter);
  useEffect(() => {
    lassoFilterRef.current = lassoFilter;
    try { localStorage.setItem('talib_lasso_filter', JSON.stringify(lassoFilter)); } catch { /* private mode */ }
  }, [lassoFilter]);

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

  const pdfExportingRef = useRef(false);
  const exportNotebookPDF = async () => {
     const stage = stageRef.current;
     if (!stage || pdfExportingRef.current) return;
     pdfExportingRef.current = true;
     const originalIndex = currentPageIndex;
     selectShape(null);
     clearLassoSelection();
     toast.loading(`กำลังสร้าง PDF... (0/${pages.length})`, { id: 'pdf-export' });
     try {
        const { jsPDF } = await import('jspdf');
        let pdf = null;
        for (let i = 0; i < pages.length; i++) {
           toast.loading(`กำลังสร้าง PDF... (${i + 1}/${pages.length})`, { id: 'pdf-export' });
           setCurrentPageIndex(i);
           await new Promise((r) => setTimeout(r, 450));
           const pg = pagesRef.current[i];
           const s = stage.scaleX();
           const pw = pg.width, ph = pg.height;
           const rectX = stage.x() + Math.max(0, (dimensions.width - pw * s) / 2);
           const rectY = stage.y() + 20 * s;
           const dataURL = stage.toDataURL({
              x: rectX, y: rectY, width: pw * s, height: ph * s,
              pixelRatio: Math.min(3, 2 / s), mimeType: 'image/jpeg', quality: 0.9,
           });
           if (!pdf) pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [pw, ph] });
           else pdf.addPage([pw, ph], 'portrait');
           pdf.addImage(dataURL, 'JPEG', 0, 0, pw, ph);
        }
        const title = (activeBook?.book?.title || 'notebook').replace(/[^\w\u0E00-\u0E7F-]+/g, '_').slice(0, 40) || 'notebook';
        pdf.save(`${title}.pdf`);
        toast.success('ดาวน์โหลด PDF สำเร็จ!', { id: 'pdf-export', icon: '📄' });
     } catch (e) {
        console.error('PDF export failed', e);
        toast.error('สร้าง PDF ไม่สำเร็จ', { id: 'pdf-export' });
     } finally {
        setCurrentPageIndex(originalIndex);
        pdfExportingRef.current = false;
     }
  };




  // Web image / sticker search, powered by Openverse (openly-licensed media, no
  // API key required). Its thumbnail endpoint is CORS-enabled, so pictures can be
  // fetched straight into a data URL and stored like any uploaded image.
  const [showImgSearch, setShowImgSearch] = useState(false);
  const [showAi, setShowAi] = useState(false);
  // One-time hint (per book) that the book's PDF page can't be drawn on directly —
  // it has to be captured/imported into the notebook first.
  const [showPdfHint, setShowPdfHint] = useState(() => {
    try { return !localStorage.getItem(`talib_pdf_hint_${bookId}`); } catch { return true; }
  });
  const dismissPdfHint = () => {
    setShowPdfHint(false);
    try { localStorage.setItem(`talib_pdf_hint_${bookId}`, '1'); } catch { /* ignore */ }
  };
  const [imgQuery, setImgQuery] = useState("");
  const [imgResults, setImgResults] = useState([]);
  const [imgLoading, setImgLoading] = useState(false);
  // Kind of picture wanted: '' (anything), photo, clipart, transparent, gif.
  // Only the DuckDuckGo proxy understands these, so a filtered search queries it
  // alone rather than padding the grid with unfiltered results from elsewhere.
  const [imgFilter, setImgFilter] = useState('');

  // Search several open, CORS-friendly image sources at once so a query like
  // "ซัยยิด กุฏุบ" returns real photos without leaving the app. Thai + English
  // Wikipedia surface the lead photo of matching articles (people, places, books),
  // Wikimedia Commons adds broader media, and Openverse covers stickers/clip-art.
  const searchWebImages = async (q, filter = imgFilter) => {
     if (!q.trim()) return;
     setImgLoading(true);
     setImgResults([]);
     const merged = [];
     const seen = new Set();
     const add = (r) => { if (r?.thumbnail && !seen.has(r.thumbnail)) { seen.add(r.thumbnail); merged.push(r); } };

     // Pasting a direct image link should just work instead of being searched for.
     if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(q.trim())) {
        setImgResults([{ id: 'pasted', title: 'ลิงก์ที่วาง', thumbnail: q.trim(), url: q.trim(), source: 'ลิงก์', license: 'ตรวจสอบเอง' }]);
        setImgLoading(false);
        return;
     }

     // Real Google image results via our server-side proxy. Only returns data when
     // GOOGLE_CSE_KEY / GOOGLE_CSE_CX are set in the deployment; otherwise it 503s
     // and we fall through to the keyless sources below — no error shown.
     const google = (async () => {
        try {
           // Fallback for local development using Vite variables if available
           const localKey = import.meta.env.VITE_GOOGLE_CSE_KEY;
           const localCx = import.meta.env.VITE_GOOGLE_CSE_CX;
           
           if (import.meta.env.DEV && localKey && localCx) {
              const start = 1;
              const api = new URL('https://www.googleapis.com/customsearch/v1');
              api.searchParams.set('key', localKey);
              api.searchParams.set('cx', localCx);
              api.searchParams.set('q', q);
              api.searchParams.set('searchType', 'image');
              api.searchParams.set('num', '10');
              api.searchParams.set('start', String(start));
              api.searchParams.set('safe', 'active');
              
              const gRes = await fetch(api.toString());
              if (!gRes.ok) {
                 const errText = await gRes.text();
                 console.error("Google API Local Error:", errText);
                 return;
              }
              const data = await gRes.json();
              (data.items || []).forEach((it, i) => add({
                 id: `g-local-${start + i}`,
                 title: it.title,
                 thumbnail: it.image?.thumbnailLink || it.link,
                 url: it.link,
                 width: it.image?.width,
                 height: it.image?.height,
                 source: 'Google',
                 license: 'เว็บ',
                 context: it.image?.contextLink,
              }));
              return;
           }

           const params = new URLSearchParams({ q });
           if (filter) params.set('type', filter);
           const res = await fetch(`/api/image-search?${params}`);
           if (!res.ok) {
              const errText = await res.text().catch(() => '');
              console.error('Image search proxy error:', res.status, errText);
              return;
           }
           const data = await res.json();
           (data.results || []).forEach(add);
        } catch (e) { console.error(e) }
     })();

     const wikiArticles = (lang) => (async () => {
        try {
           const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=12&piprop=thumbnail&pithumbsize=400&origin=*`);
           const data = await res.json();
           Object.values(data.query?.pages || {}).forEach(p => p.thumbnail && add({
              id: `wp-${lang}-${p.pageid}`, title: p.title, thumbnail: p.thumbnail.source, url: p.thumbnail.source,
              width: p.thumbnail.width, height: p.thumbnail.height, source: 'Wikipedia', license: 'สาธารณะ/CC'
           }));
        } catch (_) { /* one source failing shouldn't sink the search */ }
     })();

     const commons = (async () => {
        try {
           const res = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&origin=*`);
           const data = await res.json();
           Object.values(data.query?.pages || {}).forEach(p => {
              const ii = p.imageinfo?.[0];
              if (ii?.thumburl) add({
                 id: `cm-${p.pageid}`, title: p.title.replace('File:', ''), thumbnail: ii.thumburl, url: ii.thumburl,
                 width: ii.thumbwidth, height: ii.thumbheight, source: 'Commons',
                 license: ii.extmetadata?.LicenseShortName?.value || 'CC', creator: ii.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '')
              });
           });
        } catch (_) { /* ignore */ }
     })();

     const openverse = (async () => {
        try {
           const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=24&mature=false`);
           const data = await res.json();
           (data.results || []).forEach(im => add({
              id: `ov-${im.id}`, title: im.title, thumbnail: im.thumbnail || im.url, url: im.url,
              width: im.width, height: im.height, source: 'Openverse', license: im.license, creator: im.creator
           }));
        } catch (_) { /* ignore */ }
     })();

     const ddgClient = (async () => {
        try {
           const htmlUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`;
           const htmlRes = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(htmlUrl)}`);
           if (!htmlRes.ok) return;
           const html = await htmlRes.text();
           const m = html.match(/vqd="([^"]+)"/) || html.match(/vqd=([\d-]+)&/);
           if (!m) return;
           const vqd = m[1];
           
           const fStr = ['', '', '', filter === 'clipart' ? 'type:clipart' : filter === 'transparent' ? 'type:transparent' : filter === 'photo' ? 'type:photo' : '', '', ''].join(',');
           const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=${encodeURIComponent(fStr)}&p=1`;
           const imgRes = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(imgUrl)}`);
           if (!imgRes.ok) return;
           const data = await imgRes.json();
           
           (data.results || []).forEach((it, i) => add({
              id: `ddg-c-${i}`, title: it.title, thumbnail: it.thumbnail || it.image, url: it.image,
              width: it.width, height: it.height, source: 'DuckDuckGo', license: 'เว็บ', context: it.url
           }));
        } catch (e) { console.error(e) }
     })();

     try {
        const sources = [google, ddgClient, commons, openverse, wikiArticles('th'), wikiArticles('en')];
        sources.forEach((p) => p.then(() => setImgResults([...merged])));
        await Promise.allSettled(sources);
        setImgResults([...merged]);
        if (!merged.length) toast('ไม่พบรูปภาพที่ค้นหา — ลองคำอื่น หรือเปลี่ยนตัวกรอง');
     } catch (e) {
        console.error('Image search failed', e);
        toast.error('ค้นหารูปไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)');
     } finally {
        setImgLoading(false);
     }
  };

  const insertWebImage = async (item) => {
     const url = item.thumbnail || item.url;
     if (!url) return;
     toast.loading('กำลังแทรกรูป...', { id: 'web-img' });
     try {
        let src = url;
        try {
           const r = await fetch(url);
           const blob = await r.blob();
           src = await new Promise((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(fr.result);
              fr.onerror = reject;
              fr.readAsDataURL(blob);
           });
        } catch (_) { /* CORS-blocked: fall back to referencing the remote URL */ }
        const ratio = item.width && item.height ? item.height / item.width : 1;
        const w = 260;
        const h = Math.round(w * (ratio || 1));
        pushHistory();
        updatePage(currentPageIndex, (page) => {
           if (!page.images) page.images = [];
           page.images.push({ id: `img-${Date.now()}`, src, x: 120, y: 120, width: w, height: h });
        });
        toast.success('แทรกรูปแล้ว', { id: 'web-img' });
        setShowImgSearch(false);
     } catch (e) {
        console.error('Insert web image failed', e);
        toast.error('แทรกรูปไม่สำเร็จ', { id: 'web-img' });
     }
  };
  
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
    // Polygons and connectors are edited by their own handles, so they must not
    // also get the scale/rotate transformer box.
    const selCustom = pagesRef.current[currentPageIndex]?.shapes?.some((s) => s.id === selectedId && (s.type === 'polygon' || s.type === 'connector'));
    if (selectedId && !selCustom && transformerRef.current) {
       const node = stageRef.current.findOne(`#${selectedId}`);
       if (node) {
          transformerRef.current.nodes([node]);
          transformerRef.current.getLayer().batchDraw();
       }
    } else if (transformerRef.current) {
       transformerRef.current.nodes([]);
    }
  }, [selectedId, currentPageIndex]);

  const checkDeselect = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background';
    if (clickedOnEmpty) {
      selectShape(null);
    }
    if (showToolSettings) setShowToolSettings(false);
  };
  
  // Full set kept for reference; the toolbar shows a short essentials row and defers
  // everything else to the custom picker + recent swatches, so the capsule stays compact.
  const colors = [
    '#111827', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF'
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

  // Emoji lands as a large, scalable text object at the centre of whatever is
  // currently on screen, so it appears where the user is looking even when
  // they've zoomed/panned into a corner (not off at the page centre).
  const insertEmoji = (emoji) => {
    const page = pagesRef.current[currentPageIndex] || { width: 800, height: 1130 };
    const jitter = () => (Math.random() - 0.5) * 40;
    let cx = page.width / 2, cy = page.height / 2;
    const stage = stageRef.current;
    if (stage) {
      const rect = stage.container().getBoundingClientRect();
      const s = stage.scaleX() || scale || 1;
      cx = (rect.width / 2 - stage.x()) / s - pageX;
      cy = (rect.height / 2 - stage.y()) / s - pageY;
    }
    pushHistory();
    updatePage(currentPageIndex, (p) => {
      if (!p.texts) p.texts = [];
      p.texts.push({
        id: `text-${Date.now()}`, text: emoji, isEmoji: true,
        x: cx - 32 + jitter(), y: cy - 32 + jitter(),
        color: '#111827', size: 60, fontFamily: 'Kanit', bold: false, italic: false,
        underline: false, strikethrough: false, align: 'left', list: 'none',
      });
    });
    toast.success('เพิ่มอิโมจิแล้ว ใช้เครื่องมือเลื่อน (มือ) เพื่อย้าย/ปรับขนาด', { id: 'emoji-add' });
  };
  const [showBookSnip, setShowBookSnip] = useState(false);
  // Page a "jump back to source" link should open the book snipper on. 1 for a
  // fresh snip; the image's stored sourcePage when jumping back from a snip.
  const [bookSnipInitialPage, setBookSnipInitialPage] = useState(1);
  const [penOpacity, setPenOpacity] = useState(1);
  const [stickerStyle, setStickerStyle] = useState('classic');
  // Huawei Notes offers two erasers: whole-stroke and area ("pixel").
  // eraseObjects defaults OFF: the eraser only removes ink unless the user opts
  // in, so beginners can't wipe out images/text/stickers without meaning to.
  const [eraserSettings, setEraserSettings] = useState({ mode: 'stroke', size: 24, eraseObjects: false });
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
  // Laser pointer colour (its own, separate from the ink colour).
  const [laserColor, setLaserColor] = useState('#EF4444');

  // Formatting for the text tool. Applied to new text boxes, and to the one being
  // edited or selected so changes are visible immediately.
  const [textStyle, setTextStyle] = useState({ fontFamily: 'Kanit', fontSize: 24, bold: false, italic: false, underline: false, strikethrough: false, align: 'left', list: 'none' });
  // Emoji / imported-sticker picker toggle.
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Right-click / long-press action menu for objects: { id, x, y } in viewport coords.
  const [contextMenu, setContextMenu] = useState(null);
  const longPressRef = useRef(null); // { timer, startX, startY, id }

  // --- Audio recordings (Huawei Notes style) ---
  // A single <audio> element drives the whole notebook; recordings live inside the
  // pages (as stickers with an audioUrl) so they save and sync with everything else,
  // but they are surfaced through a list panel + transport bar instead of chips.
  const [showRecordings, setShowRecordings] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);   // { id, pageIndex, name }
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState({ current: 0, duration: 0 });
  const [audioSpeed, setAudioSpeed] = useState(1);
  const audioElRef = useRef(null);

  const getAudioEl = () => {
    if (!audioElRef.current) {
      const a = new Audio();
      a.addEventListener('play', () => setAudioPlaying(true));
      a.addEventListener('pause', () => setAudioPlaying(false));
      a.addEventListener('timeupdate', () => setAudioProgress({ current: a.currentTime, duration: a.duration || 0 }));
      a.addEventListener('loadedmetadata', () => setAudioProgress({ current: a.currentTime, duration: a.duration || 0 }));
      a.addEventListener('ended', () => { setAudioPlaying(false); setAudioProgress((p) => ({ ...p, current: 0 })); });
      audioElRef.current = a;
    }
    return audioElRef.current;
  };

  // Every audio note across every page, in page order, for the list panel.
  const recordings = React.useMemo(() => {
    const out = [];
    pages.forEach((pg, pi) => (pg.stickers || []).forEach((s) => {
      if (s.audioUrl) out.push({ pageIndex: pi, id: s.id, name: s.name, createdAt: s.createdAt, audioUrl: s.audioUrl, isUploading: s.isUploading });
    }));
    return out;
  }, [pages]);

  const playRecording = (rec) => {
    if (rec.isUploading) return;
    const a = getAudioEl();
    if (nowPlaying?.id === rec.id) {
      if (a.paused) a.play(); else a.pause();
      return;
    }
    a.src = rec.audioUrl;
    a.currentTime = 0;
    a.playbackRate = audioSpeed;
    a.play();
    const idx = recordings.findIndex((r) => r.id === rec.id);
    setNowPlaying({ id: rec.id, pageIndex: rec.pageIndex, name: rec.name || `บันทึก (${idx + 1})` });
  };

  const toggleAudioPlay = () => { const a = getAudioEl(); if (a.paused) a.play(); else a.pause(); };
  const skipAudio = (delta) => { const a = getAudioEl(); a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta)); };
  const seekAudio = (t) => { const a = getAudioEl(); a.currentTime = t; setAudioProgress((p) => ({ ...p, current: t })); };
  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2, 0.75];
    const next = speeds[(speeds.indexOf(audioSpeed) + 1) % speeds.length];
    setAudioSpeed(next);
    if (audioElRef.current) audioElRef.current.playbackRate = next;
  };
  const closePlayback = () => { const a = audioElRef.current; if (a) { a.pause(); a.currentTime = 0; } setNowPlaying(null); };

  const deleteRecording = (rec) => {
    if (nowPlaying?.id === rec.id) closePlayback();
    pushHistory();
    updatePage(rec.pageIndex, (page) => { page.stickers = (page.stickers || []).filter((s) => s.id !== rec.id); });
    toast.success('ลบบันทึกเสียงแล้ว');
  };
  const renameRecording = (rec, name) => {
    updatePage(rec.pageIndex, (page) => { page.stickers = (page.stickers || []).map((s) => (s.id === rec.id ? { ...s, name } : s)); });
    if (nowPlaying?.id === rec.id) setNowPlaying((np) => ({ ...np, name }));
  };

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

  // Protractor: a draggable, rotatable half-circle guide for measuring angles.
  const [protractorOn, setProtractorOn] = useState(false);
  const [protractor, setProtractor] = useState({ x: 320, y: 340, angle: 0, radius: 150 });
  
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

  // Save on unmount to prevent data loss if user navigates away before debounce fires
  useEffect(() => {
    return () => {
      if (readonly || !uid || !notebookId) return;
      if (pagesRef.current && pagesRef.current.length > 0) {
        uploadNotebookData(uid, notebookId, pagesRef.current).catch(console.error);
        try { localStorage.setItem(`talib_notebook_${notebookId}`, JSON.stringify(pagesRef.current)); } catch(e){}
      }
    };
  }, [readonly, uid, notebookId]);

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
  const recordingIdRef = useRef(null);
  const [playbackTime, setPlaybackTime] = useState(Number.MAX_SAFE_INTEGER);
  const animationRef = useRef(null);
  
  useEffect(() => {
    if (nowPlaying) {
      setPlaybackTime(audioProgress.current);
    } else {
      setPlaybackTime(Number.MAX_SAFE_INTEGER);
    }
  }, [nowPlaying, audioProgress.current]);
  
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
  // Tracks a multi-finger tap so a quick two-finger tap can undo and three-finger
  // tap can redo (standard tablet note gestures). Movement/pinch cancels it.
  const multiTapRef = useRef(null);
  // Copy/paste buffer: strokes + objects, baked to absolute coordinates on copy so
  // they can be pasted onto any page.
  const clipboardRef = useRef(null);

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
      toast.loading(`กำลังโหลด PDF...`, { id: 'pdf-load' });
      // A raw pdfUrl (rare) loads directly; the common book-file path goes
      // through the shared byte cache so re-importing never re-downloads.
      const pdf = pdfUrl
        ? await pdfjsLib.getDocument({ url: pdfUrl }).promise
        : await loadBookPdf(activeBook.book.fileUrl);
      const numPages = Math.min(pdf.numPages, 30);

      toast.loading(`กำลังแยกหน้า PDF (0/${numPages})...`, { id: 'pdf-load' });

      // Tablets used to fail here while desktops were fine: every page was
      // rendered at a fixed 2× (a ~2400×3400 canvas) and 30 of those, plus their
      // JPEG data URLs, blow past the canvas/memory ceiling mobile browsers
      // enforce — the throw surfaced only as "โหลด PDF ไม่สำเร็จ". So: size each
      // page to what the notebook actually displays, cap the pixel budget, and
      // release every canvas as soon as it has been encoded.
      const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
      const maxPixels = isTouch ? 2.2e6 : 6e6;
      const quality = isTouch ? 0.8 : 0.85;
      const targetWidth = Math.min(isTouch ? 1400 : 1800, Math.max(700, (dimensions.width || 800) * 2));

      let extractedPages = [];
      for (let i = 1; i <= numPages; i++) {
        toast.loading(`กำลังแยกหน้า PDF (${i}/${numPages})...`, { id: 'pdf-load' });
        const page = await pdf.getPage(i);

        const base = page.getViewport({ scale: 1 });
        let renderScale = Math.min(3, targetWidth / base.width);
        const area = base.width * base.height;
        if (area * renderScale * renderScale > maxPixels) renderScale = Math.sqrt(maxPixels / area);
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', quality); // JPEG: a fraction of PNG's memory on long PDFs
        // Hand the bitmap back to the browser now instead of waiting for GC.
        canvas.width = 0; canvas.height = 0;
        page.cleanup?.();
        // Let the browser breathe (paint the progress toast, reclaim memory)
        // before allocating the next page's canvas.
        await new Promise((r) => setTimeout(r, 0));

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
      // Say what actually went wrong — "ไม่สำเร็จ" on its own gave us nothing to
      // work with when it only failed on the tablet.
      const why = String(err?.message || err || '').slice(0, 120);
      toast.error(`โหลด PDF ไม่สำเร็จ จะใช้เป็นกระดานเปล่าแทน${why ? `\n(${why})` : ''}`, { id: 'pdf-load', duration: 7000 });
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
        const currentRecordingId = `audio-${Date.now()}`;
        recordingIdRef.current = currentRecordingId;
        recordingStartTimeRef.current = Date.now();
        
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const localUrl = URL.createObjectURL(audioBlob);
          
          const stickerId = currentRecordingId;
          const totalAudio = pagesRef.current.reduce((n, pg) => n + (pg.stickers || []).filter((s) => s.audioUrl).length, 0);

          updatePage(targetPageIndex, (page) => {
             if (!page.stickers) page.stickers = [];
             // Audio notes are no longer drawn on the page — they live in the
             // recordings panel — but they still ride inside the page data so they
             // save and sync with everything else.
             page.stickers.push({
               id: stickerId,
               x: 16,
               y: 16,
               audioUrl: localUrl,
               name: `บันทึก (${totalAudio + 1})`,
               createdAt: Date.now(),
               isPlaying: false,
               isUploading: true
             });
          });
          setShowRecordings(true);

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

  // Snapshot for undo/redo. Only the annotation arrays are copied — `src` (a base64
  // PDF/image data URL, often megabytes) is carried over by reference, so a snapshot
  // costs roughly the size of the strokes on the page rather than the whole document.
  const snapshotPages = (pgs) => pgs.map((p) => ({
    ...p,
    lines: (p.lines || []).map((l) => ({ ...l, points: l.points.slice(), pressures: l.pressures ? l.pressures.slice() : undefined })),
    shapes: (p.shapes || []).map((s) => ({ ...s, points: s.points ? s.points.slice() : undefined, from: s.from ? { ...s.from } : undefined, to: s.to ? { ...s.to } : undefined })),
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


  const downloadDataUrl = (dataUrl, filename) => {
     const link = document.createElement('a');
     link.download = filename;
     link.href = dataUrl;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  const preloadImage = (src) => new Promise((resolve) => {
     if (!src) return resolve();
     const img = new window.Image();
     img.onload = resolve; img.onerror = resolve;
     img.src = src;
  });

  // Render one page cleanly (scale 1, no pan) and crop to the paper rectangle, so
  // the export never carries the grey canvas backdrop or the current zoom.
  const capturePageDataURL = async (index, mime = 'image/png') => {
     const page = pagesRef.current[index];
     if (!page) return null;
     await preloadImage(page.src);
     setCurrentPageIndex(index);
     setScale(1);
     setPosition({ x: 0, y: 0 });
     // Let React commit, Konva redraw, and the (cached) image paint.
     await new Promise((r) => setTimeout(r, 350));
     const stage = stageRef.current;
     if (!stage) return null;
     const px = Math.max(0, (dimensions.width - page.width) / 2);
     return stage.toDataURL({ x: px, y: 20, width: page.width, height: page.height, pixelRatio: 2, mimeType: mime });
  };

  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('png'); // 'png' | 'pdf'
  const [exportScope, setExportScope] = useState('current'); // 'current' | 'all'

  const runExport = async (format, scope) => {
     setExporting(true);
     const savedIndex = currentPageIndex, savedScale = scale, savedPos = position;
     try {
        const indices = scope === 'all' ? pagesRef.current.map((_, i) => i) : [currentPageIndex];
        const shots = [];
        for (let k = 0; k < indices.length; k++) {
           toast.loading(`กำลังเตรียมไฟล์ (${k + 1}/${indices.length})...`, { id: 'export' });
           const page = pagesRef.current[indices[k]];
           const url = await capturePageDataURL(indices[k], format === 'pdf' ? 'image/jpeg' : 'image/png');
           if (url) shots.push({ url, w: page.width, h: page.height, index: indices[k] });
        }
        if (shots.length === 0) { toast.error('ไม่สามารถสร้างไฟล์ได้', { id: 'export' }); return; }

        if (format === 'png') {
           shots.forEach((s) => downloadDataUrl(s.url, `notebook-page-${s.index + 1}.png`));
           toast.success(shots.length > 1 ? `ดาวน์โหลด ${shots.length} รูปแล้ว` : 'ดาวน์โหลดรูปแล้ว', { id: 'export', icon: '🖼️' });
        } else {
           const { jsPDF } = await import('jspdf');
           const first = shots[0];
           const pdf = new jsPDF({ orientation: first.w > first.h ? 'landscape' : 'portrait', unit: 'px', format: [first.w, first.h] });
           shots.forEach((s, k) => {
              if (k > 0) pdf.addPage([s.w, s.h], s.w > s.h ? 'landscape' : 'portrait');
              pdf.addImage(s.url, 'JPEG', 0, 0, s.w, s.h);
           });
           pdf.save(`notebook-${Date.now()}.pdf`);
           toast.success('ดาวน์โหลด PDF แล้ว', { id: 'export', icon: '📄' });
        }
     } catch (err) {
        console.error('Export failed', err);
        toast.error('ส่งออกไม่สำเร็จ', { id: 'export' });
     } finally {
        setCurrentPageIndex(savedIndex);
        setScale(savedScale);
        setPosition(savedPos);
        setExporting(false);
        setShowExport(false);
     }
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
        panningRef.current = null;
        if (liveStrokeRef.current && drawingPointerId.current !== evt.pointerId) {
          liveStrokeRef.current = null; setLiveStroke(null);
          isDrawing.current = false;
          drawingPointerId.current = null;
        }
      } else {
        if (evt.pointerType === 'touch' && !hasPenPointer()) {
          const touches = [...activePointers.current.values()].filter(p => p.type === 'touch');
          if (touches.length >= 2) {
            const cx = touches.reduce((a, p) => a + p.clientX, 0) / touches.length;
            const cy = touches.reduce((a, p) => a + p.clientY, 0) / touches.length;
            if (!multiTapRef.current) multiTapRef.current = { start: Date.now(), maxCount: touches.length, moved: false, cx, cy };
            else multiTapRef.current.maxCount = Math.max(multiTapRef.current.maxCount, touches.length);
          }
        }
        if (activePointers.current.size > 1) {
          if (liveStrokeRef.current) { liveStrokeRef.current = null; setLiveStroke(null); }
          isDrawing.current = false;
          drawingPointerId.current = null;
          return;
        }
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
    if (showEmojiPicker) setShowEmojiPicker(false);
    if (contextMenu) setContextMenu(null);

    // If clicking on lasso group, don't bake, just return so they can drag it
    const targetName = e.target.name();
    const parentName = e.target.getParent()?.name();

    // Long-press on an object (touch/pen) opens the same menu as a right-click.
    // Started here for every pointer; movement or lift before 500ms cancels it.
    if ((tool === 'pan' || tool === 'lasso') && (targetName === 'object' || parentName === 'object') && evt) {
      const objId = e.target.id() || e.target.getParent()?.id();
      if (objId) {
        if (longPressRef.current?.timer) clearTimeout(longPressRef.current.timer);
        const cx = evt.clientX, cy = evt.clientY;
        longPressRef.current = {
          startX: cx, startY: cy, id: objId,
          timer: setTimeout(() => { openContextMenu(objId, cx, cy); longPressRef.current = null; }, 500),
        };
      }
    }
    if (tool === 'lasso' && (targetName === 'lasso-group' || parentName === 'lasso-group')) {
       return;
    }
    // Grabbing the ruler moves it; it must not also lay down ink.
    if (targetName === 'ruler' || parentName === 'ruler' || targetName === 'ruler-handle') {
       return;
    }
    // A polygon vertex / connector endpoint handle drags itself; the stage must
    // not pan or deselect.
    if (targetName === 'poly-handle' || targetName === 'conn-handle') {
       return;
    }
    // The protractor guide moves/rotates itself and must not lay down ink.
    if (targetName === 'protractor' || parentName === 'protractor' || targetName === 'protractor-handle') {
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
    // Palm-rejection (stylus-only mode) is meant to stop a resting hand from
    // INKING while you write. Tap-to-place tools are deliberate single taps, not
    // scribbles, so a finger must always be allowed to drop a text box / sticker —
    // otherwise, once the Huawei pen auto-enables pen-only mode, tapping to add
    // text just pans the board and nothing ever appears.
    const tapToPlace = tool === 'text' || tool === 'sticker';
    if (!tapToPlace && !shouldDrawWith(e)) {
      if (evt) panningRef.current = { x: evt.clientX, y: evt.clientY };
      return;
    }
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    // Off the paper there is nothing to write on (for ink): drag the board instead.
    // However, users might want to add text notes or stickers in the margins.
    if (!tapToPlace && (pos.x < 0 || pos.y < 0 || pos.x > currentPage.width || pos.y > currentPage.height)) {
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
       if (e.evt && typeof e.evt.preventDefault === 'function') {
           e.evt.preventDefault();
       }
       if (editingTextId) {
           if (textareaRef.current) textareaRef.current.blur();
           return; // Prevent spawning a new text box when just clicking outside to finish typing
       }
       if (hitExistingObject) {
           toast.error("โดนออบเจ็กต์เดิม! (hitExistingObject=true)");
           return;
       }
       toast.success("กำลังสร้างกล่องข้อความบนกระดาษ...");
       const newText = {
          id: `text-${Date.now()}`, text: '', x: pos.x, y: pos.y, color: penColor,
          size: textStyle.fontSize,
          fontFamily: textStyle.fontFamily,
          bold: textStyle.bold,
          italic: textStyle.italic,
          underline: textStyle.underline,
          strikethrough: textStyle.strikethrough,
          align: textStyle.align,
          list: textStyle.list,
          width: TEXT_BOX_WIDTH,
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
       const stickerColor = STICKY_COLORS.includes(penColor) ? penColor : '#FEF08A';
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
       setLaserLines(prev => [...prev, { id: Date.now(), color: laserColor, size: penSize, points: [pos.x, pos.y, pos.x, pos.y] }]);
       return;
    }
    
    if (tool === 'shape' && shapeType === 'polygon') {
       if (hitExistingObject) return;
       const id = `shape-${Date.now()}`;
       pushHistory();
       updatePage(currentPageIndex, (page) => {
          if (!page.shapes) page.shapes = [];
          page.shapes.push({
             id, type: 'polygon',
             points: [pos.x, pos.y - 70, pos.x - 70, pos.y + 50, pos.x + 70, pos.y + 50],
             color: penColor, size: penSize, opacity: penOpacity,
          });
       });
       selectShape(id);
       return;
    }

    if (tool === 'shape' && shapeType === 'connector') {
       // Drag from one object/point to another; endpoints snap to whatever they land on.
       isDrawing.current = true;
       const id = `shape-${Date.now()}`;
       const startId = objectIdAt(pos);
       connectorDrawIdRef.current = id;
       pushHistory();
       updatePage(currentPageIndex, (page) => {
          if (!page.shapes) page.shapes = [];
          page.shapes.push({
             id, type: 'connector',
             from: startId ? { id: startId, x: pos.x, y: pos.y } : { x: pos.x, y: pos.y },
             to: { x: pos.x, y: pos.y },
             color: penColor, size: Math.max(2, penSize), hasArrow: true,
          });
       });
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

    // Shared hit predicates, reused for the "did we hit anything?" check and for
    // the actual filtering inside updatePage (which must run against the latest
    // draft, not this snapshot, so fast strokes never resurrect erased items).
    const lineKeep = (l) => !strokeHitsPoint(l, pos, radius);
    const shapeKeep = (s) => {
      const b = s.type === 'polygon' ? polygonBounds(s.points)
        : s.type === 'connector' ? (() => { const { a, b: bb } = connectorPoints(s); return { minX: Math.min(a.x, bb.x), maxX: Math.max(a.x, bb.x), minY: Math.min(a.y, bb.y), maxY: Math.max(a.y, bb.y) }; })()
        : { minX: Math.min(s.x1, s.x2), maxX: Math.max(s.x1, s.x2), minY: Math.min(s.y1, s.y2), maxY: Math.max(s.y1, s.y2) };
      return !(pos.x >= b.minX - radius && pos.x <= b.maxX + radius && pos.y >= b.minY - radius && pos.y <= b.maxY + radius);
    };
    const textKeep = (t) => {
      const w = Math.max(60, (t.text?.length || 1) * (t.size || 16) * 0.6);
      return !(pos.x >= t.x - radius && pos.x <= t.x + w + radius && pos.y >= t.y - radius && pos.y <= t.y + (t.size || 16) * 1.4 + radius);
    };
    const stickerKeep = (st) => {
      const w = st.audioUrl ? 130 : 150;
      const h = st.audioUrl ? 44 : 150;
      return !(pos.x >= st.x - radius && pos.x <= st.x + w + radius && pos.y >= st.y - radius && pos.y <= st.y + h + radius);
    };

    let hitAnything = (page.lines || []).some((l) => !lineKeep(l));
    if (eraserSettings.eraseObjects && !hitAnything) {
      hitAnything = (page.shapes || []).some((s) => !shapeKeep(s))
        || (page.texts || []).some((t) => !textKeep(t))
        || (page.stickers || []).some((st) => !stickerKeep(st));
    }

    if (!hitAnything) return;

    // One history entry per erase gesture, not per pointer sample.
    if (!gestureErasedRef.current) {
      pushHistory();
      gestureErasedRef.current = true;
    }
    updatePage(currentPageIndex, (p) => {
      p.lines = (p.lines || []).filter(lineKeep);
      if (eraserSettings.eraseObjects) {
        p.shapes = (p.shapes || []).filter(shapeKeep);
        p.texts = (p.texts || []).filter(textKeep);
        p.stickers = (p.stickers || []).filter(stickerKeep);
      }
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
      recordingId: isRecording ? recordingIdRef.current : null,
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
  // --- Smart connectors (mindmap) ---
  // Defined above the memos that read them (selectedInfo) so their bindings exist
  // when those memos run during render.
  const connectorDrawIdRef = useRef(null);
  const objectBoundsById = (id) => {
    const page = pagesRef.current[currentPageIndex];
    if (!page || !id) return null;
    for (const kind of ['images', 'shapes', 'texts', 'stickers']) {
      const o = (page[kind] || []).find((x) => x.id === id);
      if (!o) continue;
      if (kind === 'shapes' && o.type === 'connector') return null;
      if (kind === 'shapes' && o.type === 'polygon') return polygonBounds(o.points);
      if (kind === 'shapes') return { minX: Math.min(o.x1, o.x2), minY: Math.min(o.y1, o.y2), maxX: Math.max(o.x1, o.x2), maxY: Math.max(o.y1, o.y2) };
      if (kind === 'images') return { minX: o.x, minY: o.y, maxX: o.x + (o.width || 0) * (o.scaleX || 1), maxY: o.y + (o.height || 0) * (o.scaleY || 1) };
      if (kind === 'stickers') { const w = o.audioUrl ? 130 : 150, h = o.audioUrl ? 44 : 150; return { minX: o.x, minY: o.y, maxX: o.x + w * (o.scaleX || 1), maxY: o.y + h * (o.scaleY || 1) }; }
      return { minX: o.x, minY: o.y, maxX: o.x + Math.max(60, (o.text?.length || 1) * (o.size || 16) * 0.6), maxY: o.y + (o.size || 16) * 1.4 };
    }
    return null;
  };

  // Topmost non-connector object under a page-space point (for endpoint snapping).
  const objectIdAt = (pos, excludeId) => {
    const page = pagesRef.current[currentPageIndex];
    if (!page) return null;
    for (const kind of ['stickers', 'images', 'texts', 'shapes']) {
      const arr = page[kind] || [];
      for (let i = arr.length - 1; i >= 0; i--) {
        const o = arr[i];
        if (o.id === excludeId || o.type === 'connector') continue;
        const b = objectBoundsById(o.id);
        if (b && pos.x >= b.minX && pos.x <= b.maxX && pos.y >= b.minY && pos.y <= b.maxY) return o.id;
      }
    }
    return null;
  };

  const boundsCenter = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

  // Resolve an endpoint to a page point. A bound end sits on its object's edge
  // facing `toward`, so the line meets the border instead of the centre.
  const resolveConnectorEnd = (anchor, toward) => {
    if (!anchor) return { x: 0, y: 0 };
    if (!anchor.id) return { x: anchor.x, y: anchor.y };
    const b = objectBoundsById(anchor.id);
    if (!b) return { x: anchor.x, y: anchor.y };
    const c = boundsCenter(b);
    const dx = (toward ? toward.x : c.x) - c.x, dy = (toward ? toward.y : c.y) - c.y;
    if (dx === 0 && dy === 0) return c;
    const hw = (b.maxX - b.minX) / 2 || 1, hh = (b.maxY - b.minY) / 2 || 1;
    const f = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
    return { x: c.x + dx * f, y: c.y + dy * f };
  };

  // Both endpoints of a connector as page points (each aimed at the other).
  const connectorPoints = (s) => {
    const rawA = s.from?.id ? (objectBoundsById(s.from.id) ? boundsCenter(objectBoundsById(s.from.id)) : s.from) : s.from;
    const rawB = s.to?.id ? (objectBoundsById(s.to.id) ? boundsCenter(objectBoundsById(s.to.id)) : s.to) : s.to;
    return { a: resolveConnectorEnd(s.from, rawB), b: resolveConnectorEnd(s.to, rawA) };
  };

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
      if (kind === 'shapes' && o.type === 'polygon') { for (let i = 0; i < o.points.length; i += 2) grow(o.points[i], o.points[i + 1]); }
      else if (kind === 'shapes') { grow(o.x1, o.y1); grow(o.x2, o.y2); }
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
      if (kind === 'shapes' && obj.type === 'polygon') {
        box = polygonBounds(obj.points);
      } else if (kind === 'shapes' && obj.type === 'connector') {
        const { a, b } = connectorPoints(obj);
        box = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
      } else if (kind === 'shapes') {
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

  // Double-click a polygon edge to drop a new vertex on the nearest edge; the
  // polygon stops being a fixed triangle and becomes any shape you need.
  const insertPolygonVertex = (id) => {
    const pos = getPointerPosRelativeToPage();
    if (!pos) return;
    const shp = pagesRef.current[currentPageIndex]?.shapes?.find(x => x.id === id);
    if (!shp || shp.type !== 'polygon') return;
    const pts = shp.points, n = pts.length / 2;
    let best = 0, bestD = Infinity;
    for (let k = 0; k < n; k++) {
      const a = k, b = (k + 1) % n;
      const d = distToSegmentXY(pos.x, pos.y, pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1]);
      if (d < bestD) { bestD = d; best = k; }
    }
    pushHistory();
    updatePage(currentPageIndex, (page) => {
      const sh = page.shapes.find(x => x.id === id);
      const np = sh.points.slice();
      np.splice((best + 1) * 2, 0, pos.x, pos.y);
      sh.points = np;
    });
    selectShape(id);
  };

  // Double-click a vertex handle to remove it (a polygon needs at least 3).
  const removePolygonVertex = (id, k) => {
    const shp = pagesRef.current[currentPageIndex]?.shapes?.find(x => x.id === id);
    if (!shp || shp.type !== 'polygon') return;
    if (shp.points.length / 2 <= 3) { toast('รูปหลายเหลี่ยมต้องมีอย่างน้อย 3 จุด'); return; }
    pushHistory();
    updatePage(currentPageIndex, (page) => {
      const sh = page.shapes.find(x => x.id === id);
      const np = sh.points.slice();
      np.splice(k * 2, 2);
      sh.points = np;
    });
  };

  // Copy the current selection (single object or a whole lasso group) to the
  // clipboard, with the live drag offset baked in so paste lands where expected.
  const copySelection = () => {
    if (selectionRef.current.length > 0 || selectedObjectsRef.current.length > 0) {
       const dx = lassoGroupPos.x, dy = lassoGroupPos.y;
       const lines = selectionRef.current.map((l) => ({ ...l, points: l.points.map((pt, i) => (i % 2 === 0 ? pt + dx : pt + dy)) }));
       const page = pagesRef.current[currentPageIndex];
       const objects = selectedObjectsRef.current.map(({ kind, id }) => {
          const o = (page[kind] || []).find((x) => x.id === id);
          if (!o) return null;
          const clone = JSON.parse(JSON.stringify(o));
          shiftObject(clone, kind, dx, dy);
          return { kind, obj: clone };
       }).filter(Boolean);
       clipboardRef.current = { lines, objects };
       toast.success('คัดลอกแล้ว');
       return;
    }
    if (selectedInfo) {
       clipboardRef.current = { lines: [], objects: [{ kind: selectedInfo.kind, obj: JSON.parse(JSON.stringify(selectedInfo.obj)) }] };
       toast.success('คัดลอกแล้ว');
    }
  };

  const pasteClipboard = () => {
    const clip = clipboardRef.current;
    if (!clip || (clip.lines.length === 0 && clip.objects.length === 0)) return;
    const off = 28;
    pushHistory();
    updatePage(currentPageIndex, (page) => {
       if (clip.lines.length) {
          const newLines = clip.lines.map((l) => ({ ...l, points: l.points.map((pt) => pt + off) }));
          page.lines = [...(page.lines || []), ...newLines];
       }
       clip.objects.forEach(({ kind, obj }) => {
          const clone = JSON.parse(JSON.stringify(obj));
          clone.id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          shiftObject(clone, kind, off, off);
          page[kind] = [...(page[kind] || []), clone];
       });
    });
    toast.success('วางแล้ว');
  };

  // Local OCR: read the text out of an image with Tesseract.js (runs entirely in
  // the browser — the wasm engine and language data are fetched once from a CDN,
  // no paid API). The recognised text lands as an editable note under the image.
  const ocrRunningRef = useRef(false);
  const runOcrOnImage = async (img) => {
    if (!img?.src || ocrRunningRef.current) return;
    ocrRunningRef.current = true;
    toast.loading('กำลังอ่านข้อความจากรูป (OCR)... 0%', { id: 'ocr' });
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const { data } = await Tesseract.recognize(img.src, 'tha+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            toast.loading(`กำลังอ่านข้อความจากรูป (OCR)... ${Math.round(m.progress * 100)}%`, { id: 'ocr' });
          }
        },
      });
      const text = (data?.text || '').trim();
      if (!text) { toast.error('ไม่พบข้อความในรูปนี้', { id: 'ocr' }); return; }
      pushHistory();
      updatePage(currentPageIndex, (page) => {
        if (!page.texts) page.texts = [];
        page.texts.push({
          id: `text-${Date.now()}`, text,
          x: img.x, y: img.y + (img.height || 0) * (img.scaleY || 1) + 12,
          color: penColor, size: 20, fontFamily: 'Sarabun', bold: false, italic: false,
        });
      });
      toast.success('ดึงข้อความสำเร็จ — วางไว้ใต้รูปแล้ว', { id: 'ocr', icon: '📝' });
    } catch (e) {
      console.error('OCR failed', e);
      toast.error('อ่านข้อความไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ตครั้งแรก)', { id: 'ocr' });
    } finally {
      ocrRunningRef.current = false;
    }
  };

  // Paint the lassoed strokes alone onto a white canvas, big and high-contrast,
  // which is what the recogniser wants — the page background, ruled lines and
  // neighbouring ink only confuse it.
  const rasterizeStrokes = (strokes, pad = 24) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach((l) => {
      for (let i = 0; i < l.points.length; i += 2) {
        minX = Math.min(minX, l.points[i]); maxX = Math.max(maxX, l.points[i]);
        minY = Math.min(minY, l.points[i + 1]); maxY = Math.max(maxY, l.points[i + 1]);
      }
    });
    if (minX === Infinity) return null;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    // Upscale small writing (Tesseract is unhappy below ~30px letter height) but
    // stay inside what a tablet canvas can hold.
    const zoom = Math.min(4, Math.max(1.5, 1400 / w));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * zoom);
    canvas.height = Math.round(h * zoom);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(zoom, zoom);
    ctx.translate(-minX, -minY);
    ctx.strokeStyle = '#000000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokes.forEach((l) => {
      if (l.points.length < 4) return;
      ctx.lineWidth = Math.max(2, l.size || 4);
      ctx.beginPath();
      ctx.moveTo(l.points[0], l.points[1]);
      for (let i = 2; i < l.points.length; i += 2) ctx.lineTo(l.points[i], l.points[i + 1]);
      ctx.stroke();
    });
    return { dataUrl: canvas.toDataURL('image/png'), minX, minY, maxX, maxY };
  };

  // Handwriting → typed text. Runs the same local Tesseract engine the image OCR
  // uses, on the lassoed ink only, then swaps the strokes for an editable text
  // box. Neat writing converts well; messy Thai is hit-and-miss, which is why the
  // result lands as a normal editable note rather than something final.
  const convertLassoToText = async () => {
    const strokes = selectionRef.current;
    if (!strokes || strokes.length === 0) { toast.error('เลือกลายมือด้วยบ่วงก่อน'); return; }
    if (ocrRunningRef.current) return;

    const shot = rasterizeStrokes(strokes);
    if (!shot) { toast.error('ไม่พบเส้นลายมือในส่วนที่เลือก'); return; }

    ocrRunningRef.current = true;
    toast.loading('กำลังแปลงลายมือเป็นข้อความ... 0%', { id: 'hw2text' });
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const { data } = await Tesseract.recognize(shot.dataUrl, 'tha+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            toast.loading(`กำลังแปลงลายมือเป็นข้อความ... ${Math.round(m.progress * 100)}%`, { id: 'hw2text' });
          }
        },
      });
      const text = (data?.text || '').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) {
        // Nothing recognised — put the ink back exactly where it was.
        bakeLassoSelection();
        toast.error('อ่านลายมือไม่ออก — ลองเขียนตัวใหญ่ขึ้นหรือเว้นช่องไฟให้ห่างขึ้น', { id: 'hw2text', duration: 5000 });
        return;
      }

      const { x: dx, y: dy } = lassoGroupPos;
      const id = `text-${Date.now()}`;
      pushHistory();
      updatePage(currentPageIndex, (page) => {
        if (!page.texts) page.texts = [];
        page.texts.push({
          id,
          text,
          lines: text.split('\n').map((line) => ({ text: line, bold: false, italic: false, underline: false, strikethrough: false, list: 'none', align: 'left' })),
          x: shot.minX + dx + 24,
          y: shot.minY + dy + 24,
          color: penColor,
          size: 22,
          fontFamily: textStyle.fontFamily || 'Sarabun',
          width: TEXT_BOX_WIDTH,
        });
      });
      // The strokes were lifted off the page when the lasso closed, so dropping
      // the selection without baking is what replaces them with the text.
      clearLassoSelection();
      toast.success('แปลงเป็นข้อความแล้ว — แตะสองครั้งเพื่อแก้คำที่เพี้ยน', { id: 'hw2text', icon: '✍️', duration: 5000 });
    } catch (e) {
      console.error('handwriting OCR failed', e);
      bakeLassoSelection();
      toast.error('แปลงไม่สำเร็จ (ครั้งแรกต้องต่อเน็ตเพื่อโหลดตัวอ่าน)', { id: 'hw2text' });
    } finally {
      ocrRunningRef.current = false;
    }
  };

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

  // Draw order is array order; moving an object to the end of its kind array puts
  // it in front, to the start puts it behind its siblings.
  const reorderSelectedObject = (toFront) => {
    if (!selectedInfo) return;
    const { kind, obj } = selectedInfo;
    pushHistory();
    updatePage(currentPageIndex, (page) => {
      const arr = (page[kind] || []).filter((o) => o.id !== obj.id);
      page[kind] = toFront ? [...arr, obj] : [obj, ...arr];
    });
  };

  // Right-click (desktop) and long-press (touch) both land here, opening a small
  // action menu anchored at the pointer. clientX/Y are viewport coords, which is
  // what the HTML menu is positioned in.
  const openContextMenu = (id, clientX, clientY) => {
    if (!id) return;
    selectShape(id);
    setContextMenu({ id, x: clientX, y: clientY });
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
    if (kind === 'shapes' && item.type === 'polygon') { item.points = item.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)); }
    else if (kind === 'shapes' && item.type === 'connector') {
      // Only free (unattached) endpoints move; bound ends stay glued to their object.
      if (item.from && !item.from.id) { item.from = { ...item.from, x: item.from.x + dx, y: item.from.y + dy }; }
      if (item.to && !item.to.id) { item.to = { ...item.to, x: item.to.x + dx, y: item.to.y + dy }; }
    }
    else if (kind === 'shapes') { item.x1 += dx; item.x2 += dx; item.y1 += dy; item.y2 += dy; }
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

  // A drifting pointer is a drag, not a long-press — drop the pending menu timer.
  const cancelLongPress = (evt) => {
    const lp = longPressRef.current;
    if (!lp) return;
    if (!evt || Math.hypot((evt.clientX ?? lp.startX) - lp.startX, (evt.clientY ?? lp.startY) - lp.startY) > 8) {
      clearTimeout(lp.timer);
      longPressRef.current = null;
    }
  };

  const handlePointerMove = (e) => {
    const evt = e?.evt;
    cancelLongPress(evt);
    if (evt && evt.pointerId !== undefined && activePointers.current.has(evt.pointerId)) {
      activePointers.current.set(evt.pointerId, { type: evt.pointerType, clientX: evt.clientX, clientY: evt.clientY });
    }
    // A pinch is two *fingers*. A pen moving with a palm resting beside it keeps
    // drawing; the palm's movements are filtered out by the drawingPointerId check.
    let touchCount = 0;
    for (const p of activePointers.current.values()) if (p.type === 'touch') touchCount++;
    if (touchCount >= 2 && evt?.pointerType !== 'pen') {
      if (multiTapRef.current) {
        const touches = [...activePointers.current.values()].filter(p => p.type === 'touch');
        if (touches.length) {
          const cx = touches.reduce((a, p) => a + p.clientX, 0) / touches.length;
          const cy = touches.reduce((a, p) => a + p.clientY, 0) / touches.length;
          if (Math.hypot(cx - multiTapRef.current.cx, cy - multiTapRef.current.cy) > 14) multiTapRef.current.moved = true;
        }
      }
      handlePinch(); return;
    }

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
    
    if (tool === 'shape' && connectorDrawIdRef.current) {
       updatePage(currentPageIndex, (page) => {
          page.shapes = (page.shapes || []).map((sh) => sh.id === connectorDrawIdRef.current ? { ...sh, to: { x: pos.x, y: pos.y } } : sh);
       });
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
    if (longPressRef.current?.timer) { clearTimeout(longPressRef.current.timer); longPressRef.current = null; }
    if (evt && evt.pointerId !== undefined) activePointers.current.delete(evt.pointerId);
    let remainingTouches = 0;
    for (const p of activePointers.current.values()) if (p.type === 'touch') remainingTouches++;
    if (remainingTouches < 2) {
      lastCenter.current = null; lastDist.current = null;
      // Pinch (or drag-pan) over: fold the live transform into state exactly once.
      if (gestureRef.current) commitGestureTransform();
    }
    panningRef.current = null;

    if (remainingTouches === 0 && multiTapRef.current) {
      const g = multiTapRef.current;
      multiTapRef.current = null;
      if (!g.moved && Date.now() - g.start < 280) {
        if (g.maxCount === 2) { undo(); return; }
        if (g.maxCount >= 3) { redo(); return; }
      }
    }

    if (liveStrokeRef.current) {
       commitLiveStroke();
       isDrawing.current = false;
       drawingPointerId.current = null;
       return;
    }
    gestureErasedRef.current = false;
    drawingPointerId.current = null;

    // Finalise a connector: snap its loose end to whatever it was released over,
    // or drop it entirely if it was just a tap with no drag.
    if (connectorDrawIdRef.current) {
       const id = connectorDrawIdRef.current;
       connectorDrawIdRef.current = null;
       isDrawing.current = false;
       const page = pagesRef.current[currentPageIndex];
       const conn = page?.shapes?.find((s) => s.id === id);
       if (conn) {
          const fb = conn.from.id ? objectBoundsById(conn.from.id) : null;
          const a = fb ? boundsCenter(fb) : conn.from;
          const end = conn.to;
          if (Math.hypot((end.x || 0) - (a.x || 0), (end.y || 0) - (a.y || 0)) < 14) {
             updatePage(currentPageIndex, (p) => { p.shapes = (p.shapes || []).filter((s) => s.id !== id); });
          } else {
             const endId = objectIdAt({ x: end.x, y: end.y }, conn.from.id);
             if (endId) updatePage(currentPageIndex, (p) => { p.shapes = (p.shapes || []).map((s) => s.id === id ? { ...s, to: { id: endId, x: end.x, y: end.y } } : s); });
             selectShape(id);
          }
       }
       return;
    }

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

       // Kinds switched off in the lasso filter are simply never looked at, so a
       // loop drawn over mixed content picks up only what was asked for.
       const want = lassoFilterRef.current || DEFAULT_LASSO_FILTER;

       const inside = [];
       const outside = [];
       (page.lines || []).forEach((line) => {
          let hit = false;
          if (want.lines) {
             for (let i = 0; i < line.points.length; i += 2) {
                if (pointInPolygon(line.points[i], line.points[i + 1], path)) { hit = true; break; }
             }
          }
          (hit ? inside : outside).push(line);
       });

       // Objects are caught by their anchor point falling inside the loop.
       const objects = [];
       if (want.shapes) (page.shapes || []).forEach((s) => {
          const c = s.type === 'polygon' ? polygonCentroid(s.points) : { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
          if (pointInPolygon(c.x, c.y, path)) objects.push({ kind: 'shapes', id: s.id });
       });
       if (want.texts) (page.texts || []).forEach((t) => {
          if (pointInPolygon(t.x, t.y, path)) objects.push({ kind: 'texts', id: t.id });
       });
       if (want.stickers) (page.stickers || []).forEach((st) => {
          if (pointInPolygon(st.x, st.y, path)) objects.push({ kind: 'stickers', id: st.id });
       });
       if (want.images) (page.images || []).forEach((im) => {
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

  // --- Drag-and-drop / paste images (iPad-style: drag a picture from Google or
  // any tab straight onto the page, or Ctrl/Cmd+V a copied image) ---
  const [isDragOver, setIsDragOver] = useState(false);

  // Turn a client (screen) point into page-space coordinates using the live stage
  // transform, so a dropped image lands under the pointer at any zoom/pan.
  const clientToPage = (clientX, clientY) => {
     const stage = stageRef.current;
     if (!stage || clientX == null) return { x: currentPage.width / 2, y: 220 };
     const rect = stage.container().getBoundingClientRect();
     const s = stage.scaleX() || scale || 1;
     return {
        x: (clientX - rect.left - stage.x()) / s - pageX,
        y: (clientY - rect.top - stage.y()) / s - pageY,
     };
  };

  // Measure an image src, size it to a friendly width keeping aspect ratio, and
  // drop it centred on the point (or the page centre when no point is given).
  const insertImageSrcAt = (src, clientX, clientY) => {
     if (!src) return;
     const place = (w, h) => {
        const pt = clientToPage(clientX, clientY);
        pushHistory();
        updatePage(currentPageIndex, (page) => {
           if (!page.images) page.images = [];
           page.images.push({ id: `img-${Date.now()}`, src, x: pt.x - w / 2, y: pt.y - h / 2, width: w, height: h });
        });
        toast.success('แทรกรูปแล้ว', { id: 'drop-img' });
     };
     const im = new window.Image();
     im.onload = () => {
        const w = Math.min(320, im.naturalWidth || 320);
        const ratio = im.naturalWidth ? (im.naturalHeight / im.naturalWidth) : 1;
        place(w, Math.max(40, Math.round(w * (ratio || 1))));
     };
     im.onerror = () => place(300, 300); // couldn't measure (CORS): use a default box
     im.src = src;
  };

  // Pull the best image reference out of a drag payload. The actual dragged image
  // usually rides in text/html (<img src>); page/URL drags fall back to uri-list.
  const imageUrlFromDataTransfer = (dt) => {
     const html = dt.getData('text/html');
     if (html) { const m = html.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) return m[1]; }
     const uri = dt.getData('text/uri-list');
     if (uri) return uri.split('\n').find(l => l && !l.startsWith('#')) || '';
     const plain = dt.getData('text/plain');
     if (plain && /^https?:\/\//i.test(plain.trim())) return plain.trim();
     return '';
  };

  const fetchAsDataUrlOrRemote = async (url) => {
     try {
        const r = await fetch(url);
        const blob = await r.blob();
        if (blob.type.startsWith('image/')) {
           return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
        }
     } catch (_) { /* CORS or network: reference the remote URL instead */ }
     return url;
  };

  const handleCanvasDrop = async (e) => {
     e.preventDefault();
     setIsDragOver(false);
     if (readonly) return;
     const dt = e.dataTransfer;
     if (!dt) return;
     const cx = e.clientX, cy = e.clientY;

     // 1) An actual image file (from the desktop or another app)
     const file = Array.from(dt.files || []).find(f => f.type.startsWith('image/'));
     if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => insertImageSrcAt(ev.target.result, cx, cy);
        reader.readAsDataURL(file);
        return;
     }
     // 2) An image dragged out of a web page (Google Images, an article, ...)
     const url = imageUrlFromDataTransfer(dt);
     if (!url) { toast.error('ไม่พบรูปในสิ่งที่ลากมา ลองลากที่ตัวรูปโดยตรง'); return; }
     toast.loading('กำลังแทรกรูป...', { id: 'drop-img' });
     const src = url.startsWith('data:') ? url : await fetchAsDataUrlOrRemote(url);
     insertImageSrcAt(src, cx, cy);
  };

  // Paste a copied image anywhere on the page. Skipped while typing (text box,
  // sticky note, or any input) so normal text paste keeps working.
  useEffect(() => {
     const onPaste = async (e) => {
        if (readonly) return;
        const ae = document.activeElement;
        const typing = isEditingText.current || editingStickerId
           || (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable));
        if (typing) return;
        const cd = e.clipboardData;
        if (!cd) return;
        const item = Array.from(cd.items || []).find(it => it.type.startsWith('image/'));
        if (item) {
           const file = item.getAsFile();
           if (file) {
              e.preventDefault();
              const reader = new FileReader();
              reader.onload = (ev) => insertImageSrcAt(ev.target.result, null, null);
              reader.readAsDataURL(file);
              return;
           }
        }
        const text = cd.getData('text/plain');
        if (text && /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(text.trim())) {
           e.preventDefault();
           toast.loading('กำลังแทรกรูป...', { id: 'drop-img' });
           const src = await fetchAsDataUrlOrRemote(text.trim());
           insertImageSrcAt(src, null, null);
        }
     };
     document.addEventListener('paste', onPaste);
     return () => document.removeEventListener('paste', onPaste);
  }, [readonly, editingStickerId, currentPageIndex]);

  const [showPageSettings, setShowPageSettings] = useState(false);
  const [showPageManager, setShowPageManager] = useState(false);
  const [pageManagerTab, setPageManagerTab] = useState('all');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEraserSettings, setShowEraserSettings] = useState(false);
  const [showLassoSettings, setShowLassoSettings] = useState(false);
  const [showShapeSettings, setShowShapeSettings] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);

  // Only one floating panel at a time. Every opener announces itself here, so
  // picking a new one always puts the previous one away instead of stacking
  // three cards over the page you are trying to write on.
  // `keep` is a panel name, or a list of them when one panel legitimately sits on
  // top of another (the colour picker belongs to the open tool options).
  const closeOverlays = useCallback((keep) => {
     const kept = new Set(Array.isArray(keep) ? keep : [keep]);
     const panels = {
        tools: setShowToolOptions,
        color: setShowColorPicker,
        emoji: setShowEmojiPicker,
        more: setShowMoreMenu,
        add: setShowAddMenu,
        pageSettings: setShowPageSettings,
        pages: setShowPageManager,
        eraser: setShowEraserSettings,
        lassoSettings: setShowLassoSettings,
        shapeSettings: setShowShapeSettings,
        toolSettings: setShowToolSettings,
        search: setShowSearch,
        imgSearch: setShowImgSearch,
        ai: setShowAi,
        recordings: setShowRecordings,
        export: setShowExport,
        snip: setShowBookSnip,
     };
     Object.entries(panels).forEach(([name, set]) => { if (!kept.has(name)) set(false); });
     if (!kept.has('context')) setContextMenu(null);
  }, []);

  // Open (or toggle) a panel through the manager so the rest always close.
  const togglePanel = useCallback((name, set, current, alsoKeep = []) => {
     const next = !current;
     closeOverlays(next ? [name, ...alsoKeep] : alsoKeep);
     set(next);
  }, [closeOverlays]);

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
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
      if (mod) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) { e.preventDefault(); deleteSelected(); }
        return;
      }
      if (e.key === 'Escape') {
        selectShape(null);
        closeOverlays(null);
        return;
      }
      if (e.key === 'PageDown') { e.preventDefault(); setCurrentPageIndex(i => Math.min(pages.length - 1, i + 1)); return; }
      if (e.key === 'PageUp') { e.preventDefault(); setCurrentPageIndex(i => Math.max(0, i - 1)); return; }

      // Number keys 1–9 pick the first nine palette colours for the pen.
      if (/^[1-9]$/.test(e.key)) {
        const c = colors[Number(e.key) - 1];
        if (c) { setPenColor(c); return; }
      }

      const byKey = { v: 'pan', p: 'pen', f: 'fountain', n: 'pencil', b: 'marker', h: 'highlighter', e: 'eraser', l: 'lasso', t: 'text', r: 'shape' };
      const next = byKey[e.key.toLowerCase()];
      if (next) { setTool(next); setShowToolOptions(false); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readonly, selectedId, editingTextId, editingStickerId, pages.length, currentPageIndex, lassoGroupPos, undo, redo, deleteSelected]);

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
         <div className="hide-scroll" style={{ height: 52, flexShrink: 0, width: '100%', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, display: 'flex', alignItems: 'center', justifyContent: readonly ? 'center' : 'space-between', padding: '0 12px', zIndex: 50, borderBottom: `1px solid ${HW.hairline}`, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
               {/* No in-notebook back button: it called window.history.back(), which
                   would kick the user out of the reading room entirely. The reader
                   (and the gallery viewer) already provide their own exit. */}
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
                  <button title="บันทึกแล้ว (คลิกเพื่อบังคับบันทึก)" onClick={() => saveNotebook()} style={{ background: 'transparent', border: 'none', color: '#9CA3AF', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 0 }}>
                     <CheckCircle size={17} />
                  </button>
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
                     ...(activeBook?.book?.fileUrl ? [{ id: 'snip', icon: Camera, title: 'แคปจากหนังสือ', onClick: () => { closeOverlays('snip'); setBookSnipInitialPage(1); setShowBookSnip(true); }, active: showBookSnip }] : []),
                     { id: 'zoomwrite', icon: Maximize2, title: 'ขยายเขียน', onClick: () => setZoomWriter(v => !v), active: zoomWriter },
                     { id: 'recordings', icon: ListMusic, title: 'บันทึกเสียง', onClick: () => togglePanel('recordings', setShowRecordings, showRecordings), active: showRecordings, badge: recordings.length },
                     { id: 'search', icon: Search, title: 'ค้นหา', onClick: () => togglePanel('search', setShowSearch, showSearch), active: showSearch },
                     { id: 'pages', icon: Columns, title: 'จัดการหน้า', onClick: () => togglePanel('pages', setShowPageManager, showPageManager), active: showPageManager },
                     { id: 'more', icon: LayoutGrid, title: 'เพิ่มเติม', onClick: () => togglePanel('more', setShowMoreMenu, showMoreMenu), active: showMoreMenu },
                   ].map(b => (
                     <button
                       key={b.id}
                       onClick={b.onClick}
                       title={b.title}
                       style={{ position: 'relative', width: 36, height: 36, borderRadius: 10, border: 'none', background: b.active ? HW.accentSoft : 'transparent', color: b.active ? HW.accent : HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s' }}
                     >
                       <b.icon size={20} strokeWidth={1.6} />
                       {b.badge > 0 && (
                         <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#EF4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b.badge}</span>
                       )}
                     </button>
                   ))}
                 </>
               )}
               {readonly && (
                 <button onClick={() => { closeOverlays('export'); setShowExport(true); }} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: 'var(--teal)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                    <Download size={18} strokeWidth={2} /> ส่งออก
                 </button>
               )}

            </div>
         </div>

         {/* Recordings list panel — rendered outside the scrollable header. */}
         {showRecordings && (
           <RecordingsPanel
             recordings={recordings}
             nowPlayingId={nowPlaying?.id}
             audioPlaying={audioPlaying}
             onPlayToggle={playRecording}
             onDelete={deleteRecording}
             onRename={renameRecording}
             onClose={() => setShowRecordings(false)}
           />
         )}

         {/* More menu dropdown. It must live OUTSIDE the header: the header scrolls
             horizontally (overflow-x auto), which silently clips any popup rendered
             inside it — that's why the ⊞ "เพิ่มเติม" button looked dead on tablets. */}
         {showMoreMenu && !readonly && (
             <>
                 <div style={{ position: 'fixed', inset: 0, zIndex: 59 }} onClick={() => setShowMoreMenu(false)} />
                 <div style={{ position: 'absolute', top: 58, right: 12, zIndex: 60, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: 8, borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.05)', width: 280, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100% - 70px)', overflowY: 'auto' }}>
                    <button onClick={() => { document.getElementById('image-upload').click(); setShowMoreMenu(false); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <ImageIcon size={20} strokeWidth={1.5} color="#4B5563" /> นำเข้ารูปภาพจากเครื่อง
                    </button>
                    <button onClick={() => { closeOverlays('imgSearch'); setShowImgSearch(true); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Search size={20} strokeWidth={1.5} color="#4B5563" /> ค้นหารูป/สติกเกอร์จากเน็ต
                    </button>
                    <button onClick={() => { closeOverlays('ai'); setShowAi(true); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Wand2 size={20} strokeWidth={1.5} color="#4B5563" /> ผู้ช่วย AI · ถาม PDF
                    </button>
                    <div style={{ height: 1, background: '#F3F4F6', margin: '4px 0' }}></div>
                    <button onClick={() => { closeOverlays('pageSettings'); setShowPageSettings(true); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Settings size={20} strokeWidth={1.5} color="#4B5563" /> เปลี่ยนแม่แบบกระดาษ
                    </button>
                    <button onClick={() => { closeOverlays('export'); setShowExport(true); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Download size={20} strokeWidth={1.5} color="#4B5563" /> ส่งออก (รูป / PDF)
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
                    <button onClick={() => { exportNotebookPDF(); setShowMoreMenu(false); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Download size={20} strokeWidth={1.5} color="#4B5563" /> ดาวน์โหลดทั้งเล่ม (PDF)
                    </button>
                    <button onClick={() => { exportPage(); setShowMoreMenu(false); }} style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <ImageIcon size={20} strokeWidth={1.5} color="#4B5563" /> บันทึกรูปหน้านี้ (PNG)
                    </button>
                    <div style={{ height: 1, background: '#F3F4F6', margin: '4px 0' }}></div>
                    <button style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, textAlign: 'left' }}>
                       <Lock size={20} strokeWidth={1.5} color="#4B5563" /> เพิ่มการล็อค
                    </button>
                 </div>
             </>
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

      {/* Audio playback transport bar — floats above the tool capsule while a
          recording is playing, Huawei style. */}
      {nowPlaying && (
         <div style={{ position: 'absolute', bottom: (zoomWriter ? WRITER_H + 44 + 14 : 20) + TOOL_BTN + 26, left: '50%', transform: 'translateX(-50%)', zIndex: 47, maxWidth: 'calc(100% - 24px)' }}>
           <PlaybackBar
             name={nowPlaying.name}
             playing={audioPlaying}
             current={audioProgress.current}
             duration={audioProgress.duration}
             speed={audioSpeed}
             onToggle={toggleAudioPlay}
             onSkip={skipAudio}
             onSeek={seekAudio}
             onSpeed={cycleSpeed}
             onClose={closePlayback}
           />
         </div>
      )}

      {/* Huawei Notes floating tool capsule (bottom-centered, overlays the canvas) */}
      {!readonly && (
         <div style={{ position: 'absolute', bottom: zoomWriter ? WRITER_H + 44 + 14 : 20, left: '50%', transform: 'translateX(-50%)', zIndex: 46, maxWidth: 'calc(100% - 24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'bottom 0.22s cubic-bezier(0.2,0.8,0.2,1)' }}>
            <div style={{ height: TOOL_BTN + 12, background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: HW.radius, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}`, display: 'flex', alignItems: 'center', padding: '0 8px', gap: isCoarse ? 4 : 6, maxWidth: '100%' }}>
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
                    { id: 'protractor', icon: Compass, title: 'ไม้โปรแทรกเตอร์ (วัดมุม)' },
                    { id: 'text', icon: Type, title: 'ข้อความ' },
                    { id: 'shape', icon: Square, title: 'รูปร่าง' },
                    { id: 'image', icon: ImageIcon, title: 'แทรกรูปภาพ' },
                    { id: 'sticker', icon: StickyNote, title: 'โพสต์อิท' },
                    { id: 'emoji', icon: Smile, title: 'อิโมจิ & สติกเกอร์' },
                    { id: 'laser', icon: Wand2, title: 'เลเซอร์พอยเตอร์' },
                    { id: 'mic', icon: Mic, title: 'อัดเสียง' }
                  ].map(t => (
                     <button 
                       key={t.id}
                       title={t.title}
                       onClick={() => {
                          if (t.id === 'image') { document.getElementById('image-upload').click(); return; }
                          if (t.id === 'mic') { toggleRecording(); return; }
                          if (t.id === 'emoji') { togglePanel('emoji', setShowEmojiPicker, showEmojiPicker); return; }
                          if (t.id === 'ruler') { setRulerOn(v => !v); return; }
                          if (t.id === 'protractor') { setProtractorOn(v => !v); return; }
                          // One tap does it all: selecting a tool also opens its
                          // options right away (nobody discovers a second tap), and
                          // the popover tucks itself away as soon as drawing starts.
                          // Tapping the active tool toggles the popover.
                          const hasOptions = TOOLS_WITH_OPTIONS.includes(t.id);
                          if (tool === t.id) togglePanel('tools', setShowToolOptions, showToolOptions);
                          else { setTool(t.id); closeOverlays(hasOptions ? 'tools' : null); setShowToolOptions(hasOptions); }
                       }}
                       style={(() => {
                          const active = t.id === 'ruler' ? rulerOn : t.id === 'protractor' ? protractorOn : t.id === 'emoji' ? showEmojiPicker : (tool === t.id && !['image','mic'].includes(t.id));
                          return { flexShrink: 0, width: TOOL_BTN, height: TOOL_BTN, borderRadius: 12, border: 'none', background: active ? HW.accentSoft : 'transparent', color: active ? HW.accent : (t.id === 'mic' && isRecording ? '#EF4444' : HW.textDim), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.18s cubic-bezier(0.2,0.8,0.2,1), background 0.18s, color 0.18s', position: 'relative', transform: active ? 'translateY(-4px)' : 'none' };
                       })()}
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

            {/* Emoji / sticker picker — same slot as the colour picker, above the capsule */}
            {showEmojiPicker && (
              <div style={{ order: -2 }}>
                <EmojiStickerPicker
                  onPick={(e) => insertEmoji(e)}
                  onUpload={() => { document.getElementById('image-upload').click(); setShowEmojiPicker(false); }}
                  onClose={() => setShowEmojiPicker(false)}
                />
              </div>
            )}

            {/* Tool options popover — floats above the capsule, Huawei style */}
            {showToolOptions && TOOLS_WITH_OPTIONS.includes(tool) && (
              <div className="hide-scroll" style={{ order: -1, display: 'flex', alignItems: 'center', gap: 7, maxWidth: '100%', overflowX: 'auto', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: 16, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}`, padding: '7px 12px' }} onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY; }} {...rightToolbarScroll}>
                  {['pen', 'fountain', 'marker', 'pencil', 'highlighter', 'shape'].includes(tool) && (
                     <>
                        {tool === 'shape' && (
                           <>
                             <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                {[{ t: 'rect', Icon: Square, title: 'สี่เหลี่ยม' }, { t: 'circle', Icon: CircleIcon, title: 'วงกลม' }, { t: 'triangle', Icon: Triangle, title: 'สามเหลี่ยม' }, { t: 'line', Icon: Minus, title: 'เส้นตรง' }, { t: 'arrow', Icon: ArrowRight, title: 'ลูกศร' }, { t: 'star', Icon: Star, title: 'ดาว' }, { t: 'polygon', Icon: Hexagon, title: 'รูปหลายเหลี่ยม (ปรับมุมได้)' }, { t: 'connector', Icon: Spline, title: 'เส้นเชื่อม (เกาะวัตถุ ทำมายด์แมป)' }].map(({ t, Icon, title }) => (
                                  <button key={t} title={title} onClick={() => setShapeType(t)} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: shapeType === t ? HW.accentSoft : 'transparent', color: shapeType === t ? HW.accent : '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={20} strokeWidth={1.6} />
                                  </button>
                                ))}
                             </div>
                             <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>
                           </>
                        )}

                        {/* Compact nib preview: current colour, size and opacity in
                            one small dot instead of a whole pen illustration. */}
                        <span title={`${penSize}px`} style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.04)' }}>
                           <span style={{ display: 'block', width: Math.max(4, Math.min(20, penSize * 0.9)), height: Math.max(4, Math.min(20, penSize * 0.9)), borderRadius: '50%', background: penColor === '#FFFFFF' ? '#D1D5DB' : penColor, opacity: tool === 'highlighter' ? Math.min(0.5, penOpacity) : penOpacity }} />
                        </span>

                        <div style={{ width: 1, background: HW.hairline, height: 24, flexShrink: 0 }}></div>

                        {/* Stroke sizes — a compact essentials row (custom via the picker). */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                           {[2, 4, 8, 14].map(s => (
                              <button
                                key={s}
                                onClick={() => setPenSize(s)}
                                title={`${s}px`}
                                style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: penSize === s ? HW.accentSoft : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ display: 'block', width: Math.min(18, 4 + s * 0.7), height: Math.min(18, 4 + s * 0.7), borderRadius: '50%', background: penSize === s ? HW.accent : HW.textDim }} />
                              </button>
                           ))}
                        </div>

                        <div style={{ width: 1, background: HW.hairline, height: 24, flexShrink: 0 }}></div>

                        {/* Opacity — the ink was always adjustable, there was just
                            no way to reach it. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                           {[1, 0.6, 0.3].map(o => (
                              <button
                                key={o}
                                onClick={() => setPenOpacity(o)}
                                title={`ความเข้ม ${Math.round(o * 100)}%`}
                                style={{ width: 30, height: 30, borderRadius: 10, border: 'none', background: Math.abs(penOpacity - o) < 0.01 ? HW.accentSoft : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              >
                                <span style={{ display: 'block', width: 16, height: 16, borderRadius: 5, background: penColor === '#FFFFFF' ? '#9CA3AF' : penColor, opacity: o, boxShadow: `inset 0 0 0 1px ${HW.hairline}` }} />
                              </button>
                           ))}
                        </div>

                        <div style={{ width: 1, background: HW.hairline, height: 24, flexShrink: 0 }}></div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                           {[...colors.slice(0, 6), ...customColors.slice(0, 2)].map((c, i) => (
                              <div
                                key={`${c}-${i}`}
                                onClick={() => setPenColor(c)}
                                title={c}
                                style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: penColor === c ? `2.5px solid ${HW.accent}` : 'none', outlineOffset: 2, transition: 'outline 0.15s, transform 0.15s', transform: penColor === c ? 'scale(1.08)' : 'none' }}
                              />
                           ))}
                           <button
                             title="เลือกสีเอง"
                             onClick={() => togglePanel('color', setShowColorPicker, showColorPicker, ['tools'])}
                             style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0, background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: showColorPicker ? `2.5px solid ${HW.accent}` : 'none', outlineOffset: 2 }}
                           />
                        </div>

                        {['pen', 'fountain', 'marker', 'pencil'].includes(tool) && (
                           <>
                              <div style={{ width: 1, background: HW.hairline, height: 26, flexShrink: 0 }}></div>
                              <button
                                onClick={() => setAutoShape(v => !v)}
                                title="วาดรูปทรงคร่าว ๆ แล้วปล่อย ระบบจะจัดให้เป็นรูปทรงที่สมบูรณ์"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 17, border: 'none', background: autoShape ? HW.accentSoft : 'rgba(0,0,0,0.035)', color: autoShape ? HW.accent : HW.textDim, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                              >
                                <Triangle size={15} strokeWidth={1.8} /> จัดรูปทรงอัตโนมัติ
                              </button>
                           </>
                        )}
                     </>
                  )}

                  {tool === 'text' && !editingTextId && (() => {
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
                            {FONT_OPTIONS.map(f => (
                              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
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
                             <button
                               onClick={() => setStyle({ underline: !textStyle.underline }, { underline: !textStyle.underline })}
                               title="ขีดเส้นใต้"
                               style={{ width: 30, height: 28, borderRadius: 9, border: 'none', background: textStyle.underline ? HW.accentSoft : 'transparent', color: textStyle.underline ? HW.accent : HW.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                             ><Underline size={15} strokeWidth={2} /></button>
                             <button
                               onClick={() => setStyle({ strikethrough: !textStyle.strikethrough }, { strikethrough: !textStyle.strikethrough })}
                               title="ขีดฆ่า"
                               style={{ width: 30, height: 28, borderRadius: 9, border: 'none', background: textStyle.strikethrough ? HW.accentSoft : 'transparent', color: textStyle.strikethrough ? HW.accent : HW.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                             ><Strikethrough size={15} strokeWidth={2} /></button>
                          </div>

                          <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                          {/* Alignment */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                             {[{ a: 'left', Icon: AlignLeft, label: 'ชิดซ้าย' }, { a: 'center', Icon: AlignCenter, label: 'กึ่งกลาง' }, { a: 'right', Icon: AlignRight, label: 'ชิดขวา' }].map(({ a, Icon, label }) => (
                                <button
                                  key={a}
                                  onClick={() => setStyle({ align: a }, { align: a })}
                                  title={label}
                                  style={{ width: 30, height: 28, borderRadius: 9, border: 'none', background: (textStyle.align || 'left') === a ? HW.accentSoft : 'transparent', color: (textStyle.align || 'left') === a ? HW.accent : HW.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                ><Icon size={15} strokeWidth={2} /></button>
                             ))}
                          </div>

                          <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>

                          {/* Lists */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                             {[{ l: 'bullet', Icon: List, label: 'รายการจุด' }, { l: 'number', Icon: ListOrdered, label: 'รายการตัวเลข' }].map(({ l, Icon, label }) => (
                                <button
                                  key={l}
                                  onClick={() => { const next = textStyle.list === l ? 'none' : l; setStyle({ list: next }, { list: next }); }}
                                  title={label}
                                  style={{ width: 30, height: 28, borderRadius: 9, border: 'none', background: textStyle.list === l ? HW.accentSoft : 'transparent', color: textStyle.list === l ? HW.accent : HW.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                ><Icon size={15} strokeWidth={2} /></button>
                             ))}
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
                               onClick={() => togglePanel('color', setShowColorPicker, showColorPicker, ['tools'])}
                               style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0, background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: showColorPicker ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2 }}
                             />
                          </div>
                       </>
                     );
                  })()}

                  {tool === 'lasso' && (
                     <>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: HW.text, flexShrink: 0, whiteSpace: 'nowrap' }}>เลือกเฉพาะ</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                           {LASSO_KINDS.map(({ key, label }) => {
                              const on = lassoFilter[key] !== false;
                              return (
                                 <button
                                   key={key}
                                   onClick={() => setLassoFilter(f => ({ ...f, [key]: !on }))}
                                   title={on ? `กำลังเลือก${label}` : `ข้าม${label}`}
                                   style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', background: on ? HW.accentSoft : 'rgba(0,0,0,0.04)', color: on ? HW.accent : HW.textDim, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', transition: 'background 0.18s, color 0.18s' }}
                                 >
                                   <span style={{ width: 26, height: 15, borderRadius: 8, background: on ? HW.accent : '#D1D5DB', position: 'relative', flexShrink: 0, transition: 'background 0.18s' }}>
                                     <span style={{ position: 'absolute', top: 1.5, left: on ? 12.5 : 1.5, width: 12, height: 12, borderRadius: '50%', background: 'white', transition: 'left 0.18s cubic-bezier(0.2,0.8,0.2,1)', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
                                   </span>
                                   {label}
                                 </button>
                              );
                           })}
                        </div>
                        <div style={{ width: 1, background: HW.hairline, height: 22, flexShrink: 0 }}></div>
                        <button
                          onClick={() => setLassoFilter({ ...DEFAULT_LASSO_FILTER })}
                          style={{ height: 32, padding: '0 12px', borderRadius: 16, border: 'none', background: 'transparent', color: HW.textDim, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                        >เลือกทั้งหมด</button>
                     </>
                  )}

                  {tool === 'sticker' && (
                     <>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {STICKY_COLORS.map(c => (
                             <div key={c} onClick={() => setPenColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', outline: penColor === c ? '2px solid #3B82F6' : 'none', outlineOffset: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                          ))}
                        </div>
                        <div style={{ width: 1, background: '#E5E7EB', height: 20, flexShrink: 0 }}></div>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                           {STICKY_STYLES.map(s => (
                              <button
                                key={s.id}
                                onClick={() => setStickerStyle(s.id)}
                                title={s.label}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '5px 6px', background: stickerStyle === s.id ? '#E0F2FE' : '#F3F4F6', borderRadius: 8, border: stickerStyle === s.id ? '1.5px solid #0EA5E9' : '1.5px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                 <StickyStyleThumb id={s.id} color={STICKY_COLORS.includes(penColor) ? penColor : '#FEF3C7'} />
                                 <span style={{ fontSize: 10, fontWeight: 600, color: stickerStyle === s.id ? '#0369A1' : '#6B7280', lineHeight: 1 }}>{s.label}</span>
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

                  {tool === 'laser' && (
                     <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                           {sizes.map(s => (
                              <button key={s} onClick={() => setPenSize(s)} title={`${s}px`} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: penSize === s ? HW.accentSoft : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                 <span style={{ display: 'block', width: Math.min(18, 4 + s * 0.7), height: Math.min(18, 4 + s * 0.7), borderRadius: '50%', background: penSize === s ? HW.accent : HW.textDim }} />
                              </button>
                           ))}
                        </div>
                        <div style={{ width: 1, background: HW.hairline, height: 22 }}></div>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: HW.textDim, fontFamily: 'Kanit, sans-serif', flexShrink: 0 }}>สีเลเซอร์</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                           {['#EF4444', '#F97316', '#FACC15', '#22C55E', '#3B82F6', '#A855F7', '#EC4899', '#FFFFFF'].map(c => (
                              <div
                                key={c}
                                onClick={() => setLaserColor(c)}
                                title={c}
                                style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, boxShadow: `inset 0 0 0 1px ${HW.hairline}`, outline: laserColor === c ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2 }}
                              />
                           ))}
                        </div>
                     </div>
                  )}
              </div>
            )}
         </div>
      )}

      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}
        onDragOver={readonly ? undefined : (e) => { if (Array.from(e.dataTransfer?.types || []).some(t => ['Files', 'text/uri-list', 'text/html'].includes(t))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!isDragOver) setIsDragOver(true); } }}
        onDragLeave={readonly ? undefined : (e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
        onDrop={readonly ? undefined : handleCanvasDrop}
      >

      {/* iPad-style drop hint */}
      {isDragOver && !readonly && (
        <div style={{ position: 'absolute', inset: 12, zIndex: 70, pointerEvents: 'none', border: `2.5px dashed ${HW.accent}`, borderRadius: 18, background: 'rgba(16,185,129,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'white', padding: '12px 22px', borderRadius: 999, boxShadow: '0 8px 28px rgba(0,0,0,0.14)', fontWeight: 700, color: HW.text, fontSize: 15 }}>
            <ImageIcon size={20} color={HW.accent} /> วางรูปที่นี่เพื่อแทรกลงสมุด
          </div>
        </div>
      )}

      {/* Hint: the book's PDF page is read-only; capture/import it to write on it */}
      {showPdfHint && !readonly && activeBook?.book?.fileUrl && !isMobile && (
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 44, maxWidth: 'calc(100% - 24px)', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, background: 'rgba(255,251,235,0.97)', border: '1px solid #FDE68A', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', backdropFilter: 'blur(8px)' }}>
          <FileText size={18} color="#B45309" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.4 }}>หน้า PDF ของหนังสือ <b>เขียนทับตรงๆ ไม่ได้</b> — ต้องดึงเข้ามาในโน้ตก่อน</span>
          <button
            onClick={() => { setBookSnipInitialPage(1); setShowBookSnip(true); dismissPdfHint(); }}
            style={{ flexShrink: 0, border: 'none', background: HW.accent, color: 'white', fontWeight: 600, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Camera size={14} /> ดึงหน้าจากหนังสือ
          </button>
          <button onClick={dismissPdfHint} title="เข้าใจแล้ว" style={{ flexShrink: 0, border: 'none', background: 'transparent', color: '#92400E', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
      )}

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
             <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
               <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>แม่แบบกระดาษ</h3>
               <div style={{ display: 'flex', gap: 8, background: '#F3F4F6', padding: 4, borderRadius: 10 }}>
                 <button onClick={() => setPageManagerTab('all')} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: pageManagerTab === 'all' ? 'white' : 'transparent', color: pageManagerTab === 'all' ? '#111827' : '#6B7280', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: pageManagerTab === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>ทั้งหมด ({pages.length})</button>
                 <button onClick={() => setPageManagerTab('bookmarks')} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: pageManagerTab === 'bookmarks' ? 'white' : 'transparent', color: pageManagerTab === 'bookmarks' ? '#111827' : '#6B7280', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: pageManagerTab === 'bookmarks' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                   <Bookmark size={16} fill={pageManagerTab === 'bookmarks' ? '#F59E0B' : 'none'} color={pageManagerTab === 'bookmarks' ? '#F59E0B' : 'currentColor'} /> คั่นหน้าไว้ ({pages.filter(p => p.isBookmarked).length})
                 </button>
               </div>
             </div>
             <button onClick={() => setShowPageManager(false)} style={{ border: 'none', background: 'var(--gray-light)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}>ปิด</button>
           </div>
           
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 24 }}>
             {pages.map((p, i) => ({ p, i })).filter(({ p }) => pageManagerTab === 'all' || p.isBookmarked).length === 0 && (
               <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: '#6B7280' }}>
                 ไม่มีหน้ากระดาษที่ค้นหา
               </div>
             )}
             {pages.map((p, i) => ({ p, i })).filter(({ p }) => pageManagerTab === 'all' || p.isBookmarked).map(({ p, i }) => (
                <div 
                  key={p.id} 
                  onClick={() => { setCurrentPageIndex(i); setShowPageManager(false); }}
                  style={{ background: 'white', borderRadius: 12, padding: 12, cursor: 'pointer', border: currentPageIndex === i ? '2px solid var(--teal)' : '2px solid transparent', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s', position: 'relative' }}
                >
                  {p.isBookmarked && (
                    <div style={{ position: 'absolute', top: -4, right: 16, zIndex: 10 }}>
                      <Bookmark size={24} color="#F59E0B" fill="#F59E0B" />
                    </div>
                  )}
                  <div style={{ width: '100%', aspectRatio: '800/1130', background: p.paperColor === 'yellow' ? '#FEF3C7' : p.paperColor === 'dark' ? '#1F2937' : 'white', border: '1px solid var(--br2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                    {/* lazy: a 30-page PDF notebook would otherwise decode every
                        full-size background at once when this grid opens. */}
                    {p.src && <img src={p.src} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="pdf page" />}
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

      {/* Web image search panel (DuckDuckGo + Wikipedia + Commons + Openverse) */}
      {showImgSearch && (
        <ImageSearchPanel
          query={imgQuery}
          setQuery={setImgQuery}
          results={imgResults}
          loading={imgLoading}
          filter={imgFilter}
          setFilter={setImgFilter}
          onSearch={searchWebImages}
          onInsert={insertWebImage}
          onClose={() => setShowImgSearch(false)}
        />
      )}

      {/* AI assistant — ask about an attached PDF, drop the answer in as a note */}
      {showAi && (
        <AiAssistantPanel
          onClose={() => setShowAi(false)}
          onInsertText={(text) => {
            pushHistory();
            updatePage(currentPageIndex, (page) => {
              if (!page.texts) page.texts = [];
              page.texts.push({ id: `text-${Date.now()}`, text, x: 80, y: 80, color: '#111827', size: 22, fontFamily: 'Sarabun', bold: false, italic: false, underline: false, strikethrough: false, align: 'left', list: 'none', width: TEXT_BOX_WIDTH });
            });
            toast.success('แทรกคำตอบลงสมุดแล้ว');
            setShowAi(false);
          }}
        />
      )}

      {/* Paper template / colour picker (was a dead menu item before) */}
      {showPageSettings && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 55, background: 'rgba(243,244,246,0.96)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', padding: 24, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>แม่แบบกระดาษ</h3>
            <button onClick={() => setShowPageSettings(false)} style={{ border: 'none', background: 'var(--gray-light)', padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}>ปิด</button>
          </div>

          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>ลายกระดาษ</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { t: 'blank', label: 'เปล่า', bg: 'white' },
              { t: 'lines', label: 'เส้นบรรทัด', bg: 'repeating-linear-gradient(white, white 15px, #cbd5e1 15px, #cbd5e1 16px)' },
              { t: 'grid', label: 'ตาราง', bg: 'repeating-linear-gradient(white, white 15px, #cbd5e1 15px, #cbd5e1 16px), repeating-linear-gradient(90deg, white, white 15px, #cbd5e1 15px, #cbd5e1 16px)' },
              { t: 'dots', label: 'จุดไข่ปลา', bg: 'radial-gradient(#94a3b8 1.5px, white 1.5px)', size: '16px 16px' },
            ].map(({ t, label, bg, size }) => (
              <button
                key={t}
                onClick={() => { pushHistory(); updatePage(currentPageIndex, (p) => { p.paperType = t; }); }}
                style={{ border: (currentPage.paperType || 'lines') === t ? `2px solid ${HW.accent}` : '1px solid var(--br2)', borderRadius: 10, overflow: 'hidden', background: 'white', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column' }}
              >
                <div style={{ height: 80, background: bg, backgroundSize: size || 'auto', borderBottom: '1px solid var(--br2)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', padding: '8px 0' }}>{label}</span>
              </button>
            ))}
          </div>

          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>สีกระดาษ</span>
          <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
            {[
              { c: 'white', label: 'ขาว', bg: 'white' },
              { c: 'yellow', label: 'ครีม', bg: '#FEF3C7' },
              { c: 'dark', label: 'มืด', bg: '#1F2937' },
            ].map(({ c, label, bg }) => (
              <button
                key={c}
                onClick={() => { pushHistory(); updatePage(currentPageIndex, (p) => { p.paperColor = c; }); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <div style={{ width: 56, height: 56, borderRadius: 12, background: bg, boxShadow: `inset 0 0 0 1px var(--br2)`, outline: (currentPage.paperColor || 'white') === c ? `2px solid ${HW.accent}` : 'none', outlineOffset: 2 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              pushHistory();
              const pt = currentPage.paperType, pc = currentPage.paperColor;
              setPages((prev) => prev.map((p) => ({ ...p, paperType: pt, paperColor: pc })));
              toast.success('ใช้แม่แบบนี้กับทุกหน้าแล้ว');
            }}
            style={{ alignSelf: 'flex-start', padding: '10px 18px', borderRadius: 10, border: `1px solid ${HW.hairline}`, background: 'white', color: HW.accent, fontWeight: 600, cursor: 'pointer' }}
          >
            ใช้แม่แบบนี้กับทุกหน้า
          </button>
          {currentPage.src && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--t3)' }}>* หน้านี้เป็นหน้า PDF ลายกระดาษจะไม่แสดงทับเนื้อหา PDF</p>}
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
        onContextMenu={(e) => {
          e.evt.preventDefault();
          const name = e.target.name();
          const parentName = e.target.getParent()?.name();
          const id = e.target.id() || e.target.getParent()?.id();
          if ((name === 'object' || parentName === 'object') && id) openContextMenu(id, e.evt.clientX, e.evt.clientY);
        }}
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
                listening={['pan', 'lasso', 'select'].includes(tool) || selectedId === img.id}
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
              // Connector: an arrow/line whose ends follow the objects they snap to.
              if (s.type === 'connector') {
                 const { a, b } = connectorPoints(s);
                 return (
                   <KonvaArrow
                     key={s.id}
                     id={s.id}
                     name="object"
                     points={[a.x, a.y, b.x, b.y]}
                     stroke={s.color}
                     fill={s.color}
                     strokeWidth={s.size || 3}
                     pointerLength={s.hasArrow === false ? 0 : 11}
                     pointerWidth={s.hasArrow === false ? 0 : 11}
                     hitStrokeWidth={16}
                     lineCap="round"
                     onClick={() => { if (tool === 'pan' || tool === 'lasso' || tool === 'shape') selectShape(s.id); }}
                     onTap={() => { if (tool === 'pan' || tool === 'lasso' || tool === 'shape') selectShape(s.id); }}
                   />
                 );
              }
              // Editable polygon: absolute points, moved as a whole in pan mode and
              // reshaped by the vertex handles rendered separately when selected.
              if (s.type === 'polygon') {
                 const off = objectOffset('shapes', s.id);
                 const pts = off.x || off.y ? s.points.map((v, k) => (k % 2 === 0 ? v + off.x : v + off.y)) : s.points;
                 return (
                   <Line
                     key={s.id}
                     id={s.id}
                     name="object"
                     points={pts}
                     closed
                     stroke={s.color}
                     strokeWidth={s.size}
                     opacity={s.opacity}
                     lineJoin="round"
                     lineCap="round"
                     hitStrokeWidth={Math.max(12, s.size + 8)}
                     draggable={tool === 'pan'}
                     onClick={() => { if (tool === 'pan' || tool === 'lasso' || tool === 'shape') selectShape(s.id); }}
                     onTap={() => { if (tool === 'pan' || tool === 'lasso' || tool === 'shape') selectShape(s.id); }}
                     onDblClick={() => insertPolygonVertex(s.id)}
                     onDblTap={() => insertPolygonVertex(s.id)}
                     onDragEnd={(e) => {
                        const dx = e.target.x(), dy = e.target.y();
                        e.target.position({ x: 0, y: 0 });
                        updatePage(currentPageIndex, (page) => {
                           const shp = page.shapes.find(sh => sh.id === s.id);
                           if (shp) shp.points = shp.points.map((v, k) => (k % 2 === 0 ? v + dx : v + dy));
                        });
                     }}
                   />
                 );
              }
              const width = s.x2 - s.x1;
              const height = s.y2 - s.y1;
              const shapeProps = {
                 key: s.id, id: s.id, name: "object",
                 x: s.x1 + objectOffset('shapes', s.id).x, y: s.y1 + objectOffset('shapes', s.id).y, stroke: s.color, strokeWidth: s.size, opacity: s.opacity,
                 scaleX: s.scaleX || 1, scaleY: s.scaleY || 1, rotation: s.rotation || 0,
                 draggable: tool === 'pan',
                 listening: ['pan', 'lasso', 'select'].includes(tool) || selectedId === s.id,
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
              } else if (s.type === 'arrow') {
                 return <KonvaArrow key={s.id} {...shapeProps} points={[0, 0, width, height]} pointerLength={20} pointerWidth={20} />;
              } else if (s.type === 'star') {
                 const radius = Math.sqrt(width * width + height * height) / 2;
                 return <KonvaStar key={s.id} {...shapeProps} numPoints={5} innerRadius={radius * 0.4} outerRadius={radius} offsetX={-width/2} offsetY={-height/2} />;
              }
              return null;
            })}
          </Group>
        </Layer>
        
        {/* Texts Layer */}
        <Layer>
          <Group x={pageX} y={pageY}>
            {/* Stickers */}
            {currentPage.stickers && currentPage.stickers.map(st => {
              // Audio notes are surfaced in the recordings panel, not on the canvas.
              if (st.audioUrl) return null;

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
                  listening={['pan', 'lasso', 'sticker'].includes(tool) || selectedId === st.id}
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
                  {st.style === 'polaroid' ? (
                     <>
                        {/* White photo frame with a thick caption strip at the bottom */}
                        <Rect width={150} height={150} fill="#FFFFFF" shadowColor="rgba(0,0,0,0.18)" shadowBlur={10} shadowOffsetY={4} cornerRadius={3} />
                        <Rect x={10} y={10} width={130} height={104} fill={st.color} cornerRadius={2} />
                     </>
                  ) : st.style === 'bubble' ? (
                     <>
                        {/* Speech bubble: rounded body + a little tail bottom-left */}
                        <Rect width={150} height={132} fill={st.color} shadowColor="rgba(0,0,0,0.15)" shadowBlur={10} shadowOffsetY={4} cornerRadius={24} />
                        <Path data="M 28 128 L 20 150 L 52 130 Z" fill={st.color} />
                     </>
                  ) : (
                     <Rect width={150} height={150} fill={st.color} shadowColor="rgba(0,0,0,0.15)" shadowBlur={10} shadowOffsetY={4} cornerRadius={st.style === 'round' ? 16 : 2} />
                  )}

                  {(!st.style || st.style === 'classic') && (
                     <>
                        <Rect width={150} height={20} fill="rgba(0,0,0,0.05)" cornerRadius={[2, 2, 0, 0]} />
                        <Path data="M 150 150 L 130 150 L 150 130 Z" fill="rgba(0,0,0,0.08)" />
                     </>
                  )}
                  {st.style === 'pin' && (
                     <>
                        <Circle x={75} y={12} radius={5} fill="#EF4444" shadowColor="rgba(0,0,0,0.3)" shadowBlur={3} shadowOffsetY={1} />
                        <Circle x={74} y={11} radius={2} fill="#FCA5A5" />
                     </>
                  )}
                  {st.style === 'tape' && (
                     <Rect x={45} y={-8} width={60} height={20} fill="rgba(255,255,255,0.5)" rotation={-2} shadowColor="rgba(0,0,0,0.05)" shadowBlur={2} shadowOffsetY={1} />
                  )}
                  {st.style === 'torn' && (
                     // Jagged white strip along the bottom edge, like a torn-off note.
                     <Path data="M 0 132 L 15 142 L 30 133 L 45 143 L 60 134 L 75 144 L 90 133 L 105 143 L 120 134 L 135 143 L 150 133 L 150 150 L 0 150 Z" fill="rgba(255,255,255,0.85)" />
                  )}
                  {st.style === 'lined' && (
                     [48, 72, 96, 120].map((ly) => (
                        <Path key={`line-${ly}`} data={`M 12 ${ly} L 138 ${ly}`} stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
                     ))
                  )}

                  {editingStickerId !== st.id && st.text && (
                     <Text text={st.text} x={12} y={st.style === 'polaroid' ? 118 : 24} width={126} height={st.style === 'polaroid' ? 28 : 116} fontSize={st.style === 'polaroid' ? 13 : 16} fill="#111827" fontFamily="Kanit, sans-serif" align={st.style === 'polaroid' ? 'center' : 'left'} />
                  )}
                </Group>
              );
            })}

            {/* Texts render after stickers so labels/notes sit on top of sticky-note tables */}
            {currentPage.texts && currentPage.texts.map((t) => (
              <Group
                key={t.id}
                id={t.id}
                name="object"
                x={t.x + objectOffset('texts', t.id).x}
                y={t.y + objectOffset('texts', t.id).y}
                scaleX={t.scaleX || 1}
                scaleY={t.scaleY || 1}
                rotation={t.rotation || 0}
                draggable={tool === 'pan' || tool === 'text'}
                listening={['pan', 'lasso', 'text'].includes(tool) || selectedId === t.id}
                onDragEnd={(e) => {
                   const { x, y } = e.target.position();
                   updatePage(currentPageIndex, (page) => {
                     const txt = page.texts.find(tx => tx.id === t.id);
                     if(txt) { txt.x = x; txt.y = y; }
                   });
                }}
                onTransformEnd={(e) => {
                   const node = e.target;
                   updatePage(currentPageIndex, (page) => {
                     const txt = page.texts.find(tx => tx.id === t.id);
                     if (txt) { txt.x = node.x(); txt.y = node.y(); txt.scaleX = node.scaleX(); txt.scaleY = node.scaleY(); txt.rotation = node.rotation(); }
                   });
                }}
                onClick={() => {
                   if (tool === 'pan' || tool === 'lasso') {
                      selectShape(t.id);
                   } else if (tool === 'text' && !t.isEmoji) {
                      setEditingTextId(t.id);
                      setEditingTextValue(t.text);
                      isEditingText.current = true;
                   }
                }}
                onTap={() => {
                   if (tool === 'pan' || tool === 'lasso') {
                      selectShape(t.id);
                   } else if (tool === 'text' && !t.isEmoji) {
                      setEditingTextId(t.id);
                      setEditingTextValue(t.text);
                      isEditingText.current = true;
                   }
                }}
                onDblClick={() => {
                   // Double-tap edits text from ANY tool (e.g. an OCR note you
                   // selected with the pan tool), so you don't have to switch to
                   // the text tool first.
                   if (t.isEmoji) return;
                   selectShape(null);
                   setEditingTextId(t.id);
                   setEditingTextValue(t.text);
                   isEditingText.current = true;
                }}
                onDblTap={() => {
                   if (t.isEmoji) return;
                   selectShape(null);
                   setEditingTextId(t.id);
                   setEditingTextValue(t.text);
                   isEditingText.current = true;
                }}
              >
                {editingTextId !== t.id && (() => {
                  // Rich text (item 9, phase 1): a uniform box renders as one
                  // <Text> exactly as before; a box with per-line formatting
                  // (created by the phase-2 editor) renders one <Text> per line.
                  const tt = migrateText(t);
                  if (isUniformText(tt)) {
                    const f = uniformFormatOf(tt);
                    return (
                      <Text
                        text={applyListPrefix(textOf(tt), f.list)}
                        fontSize={t.size}
                        fill={t.color}
                        fontFamily={t.fontFamily || 'Kanit'}
                        fontStyle={[f.bold ? 'bold' : '', f.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'}
                        textDecoration={textDecorationOf(f)}
                        align={f.align || 'left'}
                        width={f.align && f.align !== 'left' ? (t.width || TEXT_BOX_WIDTH) : undefined}
                        lineHeight={LINE_HEIGHT}
                        padding={4}
                      />
                    );
                  }
                  const prefixes = listPrefixes(tt.lines);
                  const lh = t.size * LINE_HEIGHT; // must match the editor's line-height
                  return tt.lines.map((l, i) => (
                    <Text
                      key={i}
                      x={4}
                      y={4 + i * lh}
                      text={(prefixes[i] || '') + l.text}
                      fontSize={t.size}
                      fill={t.color}
                      fontFamily={t.fontFamily || 'Kanit'}
                      fontStyle={[l.bold ? 'bold' : '', l.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'}
                      textDecoration={textDecorationOf(l)}
                      align={l.align || 'left'}
                      width={l.align && l.align !== 'left' ? (t.width || TEXT_BOX_WIDTH) : undefined}
                    />
                  ));
                })()}
              </Group>
            ))}
          </Group>
        </Layer>
        
        {/* Drawing Layer (Strokes isolated so eraser only erases strokes).
            Clipped to the paper so no ink — old or new — ever shows outside it. */}
        <Layer>
          <Group x={pageX} y={pageY} clipX={0} clipY={0} clipWidth={currentPage.width} clipHeight={currentPage.height}>
            {/* Strokes */}
            <CommittedStrokes lines={currentPage.lines} playbackTime={playbackTime} nowPlayingId={nowPlaying?.id} />
            {/* The stroke under the pointer lives here so committed ink stays untouched
                while drawing. It has to share this layer for the area eraser's
                destination-out compositing to bite into the ink below it. */}
            {liveStroke && <StrokeShape line={liveStroke} />}
            {/* Laser Lines */}
            {laserLines.map((line, i) => {
              const pointPairs = [];
              for(let p = 0; p < line.points.length; p+=2) { pointPairs.push([line.points[p], line.points[p+1]]); }
              const stroke = getStroke(pointPairs, { size: Math.max(8, (line.size || 4) * 1.5), thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
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

            {/* Protractor: half-circle guide with 0–180° markings, draggable + rotatable */}
            {protractorOn && !readonly && (() => {
               const r = protractor.radius;
               const rad = (protractor.angle * Math.PI) / 180;
               const hx = protractor.x + Math.cos(rad) * r;
               const hy = protractor.y + Math.sin(rad) * r;
               const rim = [];
               for (let d = 0; d <= 180; d += 3) { const a = (d * Math.PI) / 180; rim.push(r * Math.cos(a), -r * Math.sin(a)); }
               const ticks = [];
               const labels = [];
               for (let d = 0; d <= 180; d += 10) {
                  const a = (d * Math.PI) / 180;
                  const long = d % 30 === 0;
                  const tl = long ? 15 : 8;
                  ticks.push(<Line key={`pt-${d}`} points={[r * Math.cos(a), -r * Math.sin(a), (r - tl) * Math.cos(a), -(r - tl) * Math.sin(a)]} stroke="rgba(10,89,247,0.6)" strokeWidth={1} />);
                  if (long) labels.push(<Text key={`pl-${d}`} text={`${d}`} x={(r - 30) * Math.cos(a) - 8} y={-(r - 30) * Math.sin(a) - 6} fontSize={12} fill={HW.accent} fontFamily="Kanit, sans-serif" />);
               }
               return (
                 <>
                   <Group
                     name="protractor"
                     x={protractor.x}
                     y={protractor.y}
                     rotation={protractor.angle}
                     draggable
                     onDragEnd={(e) => setProtractor(p => ({ ...p, x: e.target.x(), y: e.target.y() }))}
                   >
                     <Line points={rim} closed fill="rgba(10,89,247,0.06)" stroke="rgba(10,89,247,0.5)" strokeWidth={1} />
                     <Line points={[-r, 0, r, 0]} stroke="rgba(10,89,247,0.55)" strokeWidth={1.5} />
                     {ticks}
                     {labels}
                     <Circle x={0} y={0} radius={4} fill={HW.accent} />
                     <Text text={`${Math.round(((protractor.angle % 360) + 360) % 360)}°`} x={-14} y={12} fontSize={13} fill={HW.accent} fontFamily="Kanit, sans-serif" />
                   </Group>
                   <Circle
                     name="protractor-handle"
                     x={hx}
                     y={hy}
                     radius={12}
                     fill="white"
                     stroke={HW.accent}
                     strokeWidth={2}
                     draggable
                     onDragMove={(e) => {
                        const nx = e.target.x(), ny = e.target.y();
                        let deg = (Math.atan2(ny - protractor.y, nx - protractor.x) * 180) / Math.PI;
                        const near = Math.round(deg / 15) * 15;
                        if (Math.abs(deg - near) < 3) deg = near;
                        setProtractor(p => ({ ...p, angle: deg }));
                     }}
                     onDragEnd={(e) => {
                        const r2 = (protractor.angle * Math.PI) / 180;
                        e.target.position({ x: protractor.x + Math.cos(r2) * protractor.radius, y: protractor.y + Math.sin(r2) * protractor.radius });
                     }}
                   />
                 </>
               );
            })()}

            {/* Shows which slice of the page the zoom-in writing strip is showing */}
            {protractorOn && !readonly && (() => {
               const r = protractor.radius;
               const rad = (protractor.angle * Math.PI) / 180;
               const hx = protractor.x + Math.cos(rad) * r;
               const hy = protractor.y + Math.sin(rad) * r;
               const rim = [];
               for (let d = 0; d <= 180; d += 3) { const a = (d * Math.PI) / 180; rim.push(r * Math.cos(a), -r * Math.sin(a)); }
               const ticks = [];
               const labels = [];
               for (let d = 0; d <= 180; d += 10) {
                  const a = (d * Math.PI) / 180;
                  const long = d % 30 === 0;
                  const tl = long ? 15 : 8;
                  ticks.push(<Line key={`pt-${d}`} points={[r * Math.cos(a), -r * Math.sin(a), (r - tl) * Math.cos(a), -(r - tl) * Math.sin(a)]} stroke="rgba(10,89,247,0.6)" strokeWidth={1} />);
                  if (long) labels.push(<Text key={`pl-${d}`} text={`${d}`} x={(r - 30) * Math.cos(a) - 8} y={-(r - 30) * Math.sin(a) - 6} fontSize={12} fill={HW.accent} fontFamily="Kanit, sans-serif" />);
               }
               return (
                 <>
                   <Group
                     name="protractor"
                     x={protractor.x}
                     y={protractor.y}
                     rotation={protractor.angle}
                     draggable
                     onDragEnd={(e) => setProtractor(p => ({ ...p, x: e.target.x(), y: e.target.y() }))}
                   >
                     <Line points={rim} closed fill="rgba(10,89,247,0.06)" stroke="rgba(10,89,247,0.5)" strokeWidth={1} />
                     <Line points={[-r, 0, r, 0]} stroke="rgba(10,89,247,0.55)" strokeWidth={1.5} />
                     {ticks}
                     {labels}
                     <Circle x={0} y={0} radius={4} fill={HW.accent} />
                     <Text text={`${Math.round(((protractor.angle % 360) + 360) % 360)}°`} x={-14} y={12} fontSize={13} fill={HW.accent} fontFamily="Kanit, sans-serif" />
                   </Group>
                   <Circle
                     name="protractor-handle"
                     x={hx}
                     y={hy}
                     radius={12}
                     fill="white"
                     stroke={HW.accent}
                     strokeWidth={2}
                     draggable
                     onDragMove={(e) => {
                        const nx = e.target.x(), ny = e.target.y();
                        let deg = (Math.atan2(ny - protractor.y, nx - protractor.x) * 180) / Math.PI;
                        const near = Math.round(deg / 15) * 15;
                        if (Math.abs(deg - near) < 3) deg = near;
                        setProtractor(p => ({ ...p, angle: deg }));
                     }}
                     onDragEnd={(e) => {
                        const r2 = (protractor.angle * Math.PI) / 180;
                        e.target.position({ x: protractor.x + Math.cos(r2) * protractor.radius, y: protractor.y + Math.sin(r2) * protractor.radius });
                     }}
                   />
                 </>
               );
            })()}

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
        
        {/* Transformer Layer */}
        <Layer>
           {selectedId && (
              <Transformer
                ref={transformerRef}
                // Fat, teal, rounded handles — easy to grab with a fingertip. Emoji,
                // images and text scale uniformly (corner anchors only); shapes may
                // stretch freely.
                anchorSize={isCoarse ? 18 : 11}
                anchorCornerRadius={isCoarse ? 9 : 5}
                anchorStroke={HW.accent}
                anchorFill="#FFFFFF"
                borderStroke={HW.accent}
                borderStrokeWidth={1.5}
                rotateEnabled={true}
                rotateAnchorOffset={isCoarse ? 34 : 24}
                keepRatio={selectedInfo?.kind !== 'shapes'}
                enabledAnchors={selectedInfo?.kind === 'shapes'
                  ? ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
                  : ['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 10 || newBox.height < 10) return oldBox;
                  return newBox;
                }}
              />
           )}

           {!readonly && (() => {
              const poly = currentPage.shapes?.find(sh => sh.id === selectedId && sh.type === 'polygon');
              if (!poly) return null;
              const off = objectOffset('shapes', poly.id);
              const pts = poly.points;
              const n = pts.length / 2;
              const c = polygonCentroid(pts);
              const hr = 8 / scale;
              const fs = 15 / scale;
              const lo = 26 / scale;
              return (
                <Group x={pageX} y={pageY}>
                   {Array.from({ length: n }).map((_, k) => {
                      const vx = pts[k * 2] + off.x, vy = pts[k * 2 + 1] + off.y;
                      const ang = polygonInteriorAngle(pts, k);
                      let dx = pts[k * 2] - c.x, dy = pts[k * 2 + 1] - c.y;
                      const m = Math.hypot(dx, dy) || 1;
                      const lx = vx + (dx / m) * lo, ly = vy + (dy / m) * lo;
                      return (
                        <React.Fragment key={`vtx-${poly.id}-${k}`}>
                           <Text text={`${ang}°`} x={lx - fs * 1.4} y={ly - fs / 2} fontSize={fs} fill={HW.accent} fontStyle="bold" fontFamily="Kanit, sans-serif" listening={false} />
                           <Circle
                             name="poly-handle" x={vx} y={vy} radius={hr} fill="white" stroke={HW.accent} strokeWidth={2 / scale}
                             onDragStart={() => pushHistory()}
                             onDragMove={(e) => {
                                const nx = e.target.x() - off.x, ny = e.target.y() - off.y;
                                updatePage(currentPageIndex, (page) => {
                                   const shp = page.shapes.find(sh => sh.id === poly.id);
                                   if (shp) {
                                      const np = shp.points.slice();
                                      np[k * 2] = nx; np[k * 2 + 1] = ny;
                                      shp.points = np;
                                   }
                                });
                             }}
                             draggable
                           />
                        </React.Fragment>
                      );
                   })}
                </Group>
              );
           })()}

           {/* Connector endpoint handles: drag to re-point; drop on an object to snap. */}
           {!readonly && (() => {
              const conn = currentPage.shapes?.find(sh => sh.id === selectedId && sh.type === 'connector');
              if (!conn) return null;
              const { a, b } = connectorPoints(conn);
              const hr = 8 / scale;
              const mk = (which, pt) => (
                <Circle
                  key={`conn-${conn.id}-${which}`}
                  name="conn-handle" x={pt.x} y={pt.y} radius={hr} fill="white" stroke={HW.accent} strokeWidth={2 / scale}
                  draggable
                  onDragStart={() => pushHistory()}
                  onDragMove={(e) => {
                     const nx = e.target.x(), ny = e.target.y();
                     updatePage(currentPageIndex, (page) => {
                        page.shapes = (page.shapes || []).map(sh => sh.id === conn.id ? { ...sh, [which]: { x: nx, y: ny } } : sh);
                     });
                  }}
                  onDragEnd={(e) => {
                     const nx = e.target.x(), ny = e.target.y();
                     const hitId = objectIdAt({ x: nx, y: ny }, null);
                     updatePage(currentPageIndex, (page) => {
                        page.shapes = (page.shapes || []).map(sh => sh.id === conn.id ? { ...sh, [which]: hitId ? { id: hitId, x: nx, y: ny } : { x: nx, y: ny } } : sh);
                     });
                  }}
                />
              );
              return <Group x={pageX} y={pageY}>{mk('from', a)}{mk('to', b)}</Group>;
           })()}
        </Layer>
      </Stage>

      {/* Right-click / long-press context menu */}
      {/* The selected-object floating toolbar (below) already covers a single
          selection, so only fall back to this context menu when that toolbar
          isn't showing — otherwise both stacked up with duplicate actions. */}
      {contextMenu && !selectedInfo && !croppingImageId && (() => {
        const page = pages[currentPageIndex];
        let kind = null;
        for (const k of ['images', 'shapes', 'texts', 'stickers']) {
          if ((page?.[k] || []).some((o) => o.id === contextMenu.id)) { kind = k; break; }
        }
        if (!kind) return null;
        return (
          <ObjectContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            canRecolor={kind === 'shapes' || kind === 'texts' || kind === 'stickers'}
            onClose={() => setContextMenu(null)}
            onDuplicate={duplicateSelectedObject}
            onFront={() => reorderSelectedObject(true)}
            onBack={() => reorderSelectedObject(false)}
            onRecolor={recolorSelectedObject}
            onDelete={deleteSelected}
          />
        );
      })()}

      {/* Floating text editor (format toolbar + textarea) */}
      {(() => {
         if (!editingTextId) return null;
         const t = currentPage.texts?.find(tx => tx.id === editingTextId);
         if (!t) return null;
         const upd = (fn) => updatePage(currentPageIndex, (page) => { const txt = page.texts?.find(tx => tx.id === editingTextId); if (txt) fn(txt); });
         return (
           <TextEditor
             key={editingTextId}
             x={(t.x + pageX) * scale + position.x}
             y={(t.y + pageY) * scale + position.y}
             scale={scale}
             t={t}
             textareaRef={textareaRef}
             onChange={(val) => setEditingTextValue(val)}
             onLinesChange={(lines) => upd(txt => { txt.lines = lines; txt.text = lines.map(l => l.text).join('\n'); })}
             onFont={(font) => { setTextStyle(s => ({ ...s, fontFamily: font })); upd(txt => { txt.fontFamily = font; }); }}
             onSize={(n) => { setTextStyle(s => ({ ...s, fontSize: n })); upd(txt => { txt.size = n; }); }}
             onColor={(c) => upd(txt => { txt.color = c; })}
             onCommit={() => {
                if (!isEditingText.current) return;
                isEditingText.current = false;
                if (editingTextValue.trim() === '') {
                   updatePage(currentPageIndex, (page) => { page.texts = page.texts.filter(tx => tx.id !== editingTextId); });
                }
                setEditingTextId(null);
             }}
           />
         );
      })()}
      
      {/* Floating Textarea for Sticky Notes */}
      {(() => {
         if (!editingStickerId) return null;
         const st = currentPage.stickers?.find(s => s.id === editingStickerId);
         if (!st || st.audioUrl) return null;
         return (
           <StickyNoteEditor
             x={(st.x + pageX) * scale + position.x}
             y={(st.y + pageY) * scale + position.y}
             scale={scale}
             round={st.style === 'round'}
             value={editingStickerValue}
             onChange={setEditingStickerValue}
             textareaRef={stickerTextareaRef}
             onCommit={() => {
                updatePage(currentPageIndex, (page) => {
                   const sticker = page.stickers?.find(s => s.id === editingStickerId);
                   if (sticker) sticker.text = editingStickerValue;
                });
                setEditingStickerId(null);
             }}
             onDelete={() => {
                const id = editingStickerId;
                pushHistory();
                updatePage(currentPageIndex, (page) => {
                   page.stickers = (page.stickers || []).filter(s => s.id !== id);
                });
                setEditingStickerId(null);
                toast.success('ลบโพสต์อิทแล้ว');
             }}
           />
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
              <CommittedStrokes lines={currentPage.lines} playbackTime={playbackTime} nowPlayingId={nowPlaying?.id} />
              {liveStroke && <StrokeShape line={liveStroke} />}
            </Layer>
          </Stage>
        </div>
      )}

      {/* Floating action bar pinned just above a single selected object. */}
      {selectedInfo && !readonly && !hasSelection && !croppingImageId && (() => {
         const { kind, obj, box } = selectedInfo;
         const left = (box.minX + pageX) * scale + position.x + ((box.maxX - box.minX) * scale) / 2;
         const top = (box.minY + pageY) * scale + position.y - 54;
         return (
           <SelectionToolbar
             left={left}
             top={top}
             kind={kind}
             canEdit={(kind === 'texts' || kind === 'stickers') && !obj.audioUrl}
             onCrop={() => setCroppingImageId(obj.id)}
             onOcr={() => { runOcrOnImage(obj); selectShape(null); }}
             onEdit={() => {
               if (kind === 'texts') {
                 setEditingTextId(obj.id); setEditingTextValue(obj.text || ''); isEditingText.current = true;
               } else {
                 setEditingStickerId(obj.id); setEditingStickerValue(obj.text || '');
               }
               selectShape(null);
             }}
             onRecolor={recolorSelectedObject}
             onFront={() => reorderSelectedObject(true)}
             onBack={() => reorderSelectedObject(false)}
             onDuplicate={duplicateSelectedObject}
             onDelete={deleteSelected}
             onDone={() => selectShape(null)}
           />
         );
      })()}

      {/* Floating action menu for a lasso selection (Huawei shows this above the marquee) */}
      {lassoBounds && hasSelection && (() => {
         const left = (lassoBounds.minX + lassoGroupPos.x + pageX) * scale + position.x
                    + ((lassoBounds.maxX - lassoBounds.minX) * scale) / 2;
         const top = (lassoBounds.minY + lassoGroupPos.y + pageY) * scale + position.y - 58;
         return (
           <LassoToolbar
             left={left}
             top={top}
             hasInk={selectedLassoLines.length > 0}
             onToText={convertLassoToText}
             onDuplicate={duplicateLassoSelection}
             onScale={scaleLassoSelection}
             onRecolor={recolorLassoSelection}
             onDelete={deleteLassoSelection}
             onDone={bakeLassoSelection}
           />
         );
      })()}

      {/* Paper template picker. The "เปลี่ยนแม่แบบกระดาษ" button set this flag but
          nothing ever rendered — so the whole feature looked broken. */}
      {showPageSettings && !readonly && (
        <PaperTemplateModal
          page={pages[currentPageIndex] || {}}
          onClose={() => setShowPageSettings(false)}
          onApply={(patch, allPages) => {
            pushHistory();
            if (allPages) {
              setPages((prev) => prev.map((p) => (p.src ? p : { ...p, ...patch })));
              toast.success('ใช้กับทุกหน้าแล้ว');
            } else {
              updatePage(currentPageIndex, (p) => { Object.assign(p, patch); });
            }
          }}
        />
      )}

      {/* Export modal — choose format (image / PDF) and scope (this page / all) */}
      {showExport && (
        <ExportModal
          format={exportFormat}
          setFormat={setExportFormat}
          scope={exportScope}
          setScope={setExportScope}
          exporting={exporting}
          pageCount={pages.length}
          currentIndex={currentPageIndex}
          onExport={runExport}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Snip-from-book overlay */}
      {/* Jump-back link on book snips. Shown only in move mode so it never sits in
          the way of the pen while drawing over the image. */}
      {!readonly && tool === 'pan' && activeBook?.book?.fileUrl && currentPage.images?.filter(im => im.sourcePage).map(im => {
         const left = (im.x + (im.width || 0) * (im.scaleX || 1) + pageX) * scale + position.x;
         const top = (im.y + pageY) * scale + position.y;
         return (
           <button
             key={`srclink-${im.id}`}
             title={`ไปหน้า ${im.sourcePage} ในหนังสือต้นฉบับ`}
             onPointerDown={(e) => e.stopPropagation()}
             onClick={() => { setBookSnipInitialPage(im.sourcePage); setShowBookSnip(true); }}
             style={{ position: 'absolute', left: left - 28, top: top + 4, zIndex: 58, height: 24, padding: '0 7px', borderRadius: 8, border: 'none', background: HW.accent, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}
           >
             <Link2 size={12} strokeWidth={2.4} /> น.{im.sourcePage}
           </button>
         );
      })}

      {showBookSnip && activeBook?.book?.fileUrl && (
         <BookSnipModal
           fileUrl={activeBook.book.fileUrl}
           initialPage={bookSnipInitialPage}
           onClose={() => setShowBookSnip(false)}
           onInsert={({ src, width, height, pageNum }) => {
             const w = Math.min(Math.min(440, currentPage.width * 0.75), width);
             const h = height * (w / width);
             pushHistory();
             updatePage(currentPageIndex, (page) => {
               if (!page.images) page.images = [];
               // sourcePage lets the image show a 🔗 that jumps back to the book page.
               page.images.push({ id: `img-${Date.now()}`, src, x: (currentPage.width - w) / 2, y: 60, width: w, height: h, sourcePage: pageNum });
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
