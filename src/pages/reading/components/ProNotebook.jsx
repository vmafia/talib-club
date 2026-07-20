import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva';
import useImage from 'use-image';
import getStroke from 'perfect-freehand';
import toast from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Component to render individual PDF pages
const PDFPageImage = ({ src, y, width, height }) => {
  const [image] = useImage(src);
  return (
    <KonvaImage
      image={image}
      y={y}
      width={width}
      height={height}
      shadowColor="rgba(0,0,0,0.1)"
      shadowBlur={10}
      shadowOffsetY={5}
    />
  );
};

export default function ProNotebook({ bookId, uid, activeBook }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [pages, setPages] = useState([]);
  const [loadingPdf, setLoadingPdf] = useState(activeBook?.book?.fileUrl ? true : false);
  
  const [tool, setTool] = useState('pen'); // 'pen', 'eraser', 'pan'
  const [lines, setLines] = useState([]);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const isDrawing = useRef(false);

  // Measure container size using ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        // Only update if size is valid to avoid 0x0 canvas
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load PDF
  useEffect(() => {
    const loadPDF = async () => {
      if (!activeBook?.book?.fileUrl) return;
      setLoadingPdf(true);
      try {
        let url = activeBook.book.fileUrl;
        if (url.includes('drive.google.com') && url.includes('/view')) {
           const match = url.match(/\/d\/(.*?)\//);
           if (match && match[1]) {
             url = `https://drive.google.com/uc?export=download&id=${match[1]}`;
           }
        }
        
        const proxyUrl = `/api/proxy-pdf?url=${encodeURIComponent(url)}`;
        toast.loading(`กำลังโหลด PDF...`, { id: 'pdf-load' });
        
        const loadingTask = pdfjsLib.getDocument(proxyUrl);
        const pdf = await loadingTask.promise;
        const numPages = Math.min(pdf.numPages, 30);
        
        const extractedPages = [];
        let currentY = 20; // top padding
        
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
          
          // Compute scale to fit page to screen width with padding
          const displayWidth = dimensions.width > 0 ? dimensions.width - 40 : viewport.width;
          const displayScale = displayWidth / viewport.width;
          const displayHeight = viewport.height * displayScale;
          
          extractedPages.push({
            id: `page-${i}`,
            src: dataUrl,
            y: currentY,
            width: displayWidth,
            height: displayHeight
          });
          
          currentY += displayHeight + 20; // spacing
        }
        
        setPages(extractedPages);
        toast.success('โหลดหน้าหนังสือลงกระดานสำเร็จ!', { id: 'pdf-load' });
      } catch (err) {
        console.error("PDF Load Error", err);
        toast.error('ดึงข้อมูล PDF ไม่สำเร็จ จะใช้เป็นกระดานเปล่าแทน', { id: 'pdf-load', duration: 4000 });
      } finally {
        setLoadingPdf(false);
      }
    };
    
    loadPDF();
  }, [activeBook, dimensions.width]);

  // Handle Drawing
  const handlePointerDown = (e) => {
    if (tool === 'pan') return;
    
    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    
    isDrawing.current = true;
    setLines([...lines, { 
      tool, 
      points: [pos.x, pos.y, pos.x, pos.y] 
    }]);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing.current || tool === 'pan') return;
    
    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    
    const lastLine = { ...lines[lines.length - 1] };
    lastLine.points = lastLine.points.concat([pos.x, pos.y]);
    
    const newLines = [...lines];
    newLines.splice(lines.length - 1, 1, lastLine);
    setLines(newLines);
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
  };

  // Zooming
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
    newScale = Math.max(0.1, Math.min(newScale, 5)); // limits
    
    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };
  
  // Convert points to SVG path for smooth curves
  const getSvgPathFromStroke = (stroke) => {
    if (!stroke.length) return "";
    const d = stroke.reduce(
      (acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      },
      ["M", ...stroke[0], "Q"]
    );
    d.push("Z");
    return d.join(" ");
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--br2)', background: '#F9FAFB' }}>
      
      {/* Loading Overlay */}
      {loadingPdf && (
         <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
           <i className="ti ti-loader-2 spin" style={{ fontSize: 36, color: 'var(--teal)', marginBottom: 16 }}></i>
           <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>กำลังดึงหน้า PDF มาลงกระดาน...</span>
         </div>
      )}

      {/* Floating Toolbar */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', padding: '8px', borderRadius: 100, display: 'flex', gap: 8, boxShadow: '0 4px 15px rgba(0,0,0,0.08)', border: '1px solid var(--br2)' }}>
        <button 
          onClick={() => setTool('pen')}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'pen' ? 'var(--teal)' : 'transparent', color: tool === 'pen' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-pencil" style={{ fontSize: 20 }}></i>
        </button>
        <button 
          onClick={() => setTool('eraser')}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'eraser' ? 'var(--red)' : 'transparent', color: tool === 'eraser' ? 'white' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-eraser" style={{ fontSize: 20 }}></i>
        </button>
        <button 
          onClick={() => setTool('pan')}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: tool === 'pan' ? '#E5E7EB' : 'transparent', color: tool === 'pan' ? '#374151' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <i className="ti ti-hand-stop" style={{ fontSize: 20 }}></i>
        </button>
        <div style={{ width: 1, background: 'var(--br2)', margin: '0 4px' }}></div>
        <button 
          onClick={() => toast('ฟีเจอร์อัดเสียงกำลังมา!', { icon: '🎤' })}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'var(--orange-light)', color: 'var(--orange-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-microphone" style={{ fontSize: 20 }}></i>
        </button>
      </div>

      {/* Canvas Engine */}
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
        <Layer>
          {/* PDF Pages */}
          {pages.map((page) => (
             <PDFPageImage 
               key={page.id} 
               src={page.src} 
               y={page.y} 
               width={page.width} 
               height={page.height} 
             />
          ))}
          
          {/* Strokes */}
          {lines.map((line, i) => {
            // Group points into [x,y, x,y] structure for perfect-freehand
            const pointPairs = [];
            for(let p = 0; p < line.points.length; p+=2) {
                pointPairs.push([line.points[p], line.points[p+1]]);
            }
            
            const stroke = getStroke(pointPairs, {
              size: line.tool === 'eraser' ? 24 : 4,
              thinning: 0.5,
              smoothing: 0.5,
              streamline: 0.5,
            });
            const pathData = getSvgPathFromStroke(stroke);
            
            return (
              <Line
                key={i}
                data={pathData}
                fill={line.tool === 'eraser' ? '#F9FAFB' : '#111827'}
                globalCompositeOperation={line.tool === 'eraser' ? 'destination-out' : 'source-over'}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                closed={true}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
