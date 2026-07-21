import React, { useState, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, Square, Lasso, RotateCcw } from 'lucide-react';

export default function CropModal({ imageUrl, onCropComplete, onCancel }) {
  const [mode, setMode] = useState('rect'); // 'rect' | 'free'
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);

  // Freeform mode: the outline is drawn on an overlay canvas in displayed-image
  // coordinates and only scaled up to natural resolution at export time.
  const freeImgRef = useRef(null);
  const overlayRef = useRef(null);
  const pathRef = useRef([]);
  const drawingRef = useRef(false);
  const [hasPath, setHasPath] = useState(false);

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const syncOverlaySize = () => {
    const img = freeImgRef.current;
    const canvas = overlayRef.current;
    if (!img || !canvas) return;
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
  };

  const redrawOverlay = (closePath) => {
    const canvas = overlayRef.current;
    const pts = pathRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pts.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (closePath) ctx.closePath();
    ctx.fillStyle = 'rgba(10,89,247,0.14)';
    ctx.fill();
    ctx.strokeStyle = '#0A59F7';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
  };

  const freeStart = (e) => {
    e.preventDefault();
    syncOverlaySize();
    const canvas = overlayRef.current;
    if (!canvas) return;
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    const rect = canvas.getBoundingClientRect();
    pathRef.current = [e.clientX - rect.left, e.clientY - rect.top];
    drawingRef.current = true;
    setHasPath(false);
    redrawOverlay(false);
  };
  const freeMove = (e) => {
    if (!drawingRef.current) return;
    const canvas = overlayRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const pts = pathRef.current;
    const n = pts.length;
    if (n >= 2 && Math.hypot(x - pts[n - 2], y - pts[n - 1]) < 3) return;
    pts.push(x, y);
    redrawOverlay(false);
  };
  const freeEnd = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (pathRef.current.length >= 6) {
      setHasPath(true);
      redrawOverlay(true);
    } else {
      pathRef.current = [];
      redrawOverlay(false);
    }
  };
  const freeReset = () => {
    pathRef.current = [];
    setHasPath(false);
    redrawOverlay(false);
  };

  const handleRectCrop = () => {
    if (!completedCrop || !imgRef.current) {
      onCancel();
      return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
       onCancel();
       return;
    }

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );

    const base64Image = canvas.toDataURL('image/png');
    onCropComplete(base64Image);
  };

  const handleFreeCrop = () => {
    const img = freeImgRef.current;
    const pts = pathRef.current;
    if (!img || pts.length < 6) return;

    // Scale the drawn path from displayed pixels up to the image's natural size.
    const fx = img.naturalWidth / img.clientWidth;
    const fy = img.naturalHeight / img.clientHeight;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const path = new Path2D();
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * fx, y = pts[i + 1] * fy;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    path.closePath();

    const w = Math.max(1, Math.round(maxX - minX));
    const h = Math.max(1, Math.round(maxY - minY));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.translate(-minX, -minY);
    ctx.clip(path);
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    // PNG keeps the outside of the outline transparent.
    onCropComplete(canvas.toDataURL('image/png'));
  };

  const handleCrop = () => (mode === 'free' ? handleFreeCrop() : handleRectCrop());
  const confirmDisabled = mode === 'free' && !hasPath;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
       <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '90%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
             <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>ครอบตัดรูปภาพ</h3>
             {/* Rect / freeform switch */}
             <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', borderRadius: 10, padding: 3 }}>
                {[{ id: 'rect', Icon: Square, label: 'สี่เหลี่ยม' }, { id: 'free', Icon: Lasso, label: 'อิสระ' }].map(({ id, Icon, label }) => (
                   <button
                     key={id}
                     onClick={() => { setMode(id); if (id === 'free') { setTimeout(syncOverlaySize, 50); } }}
                     style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: 'none', background: mode === id ? 'white' : 'transparent', color: mode === id ? '#0A59F7' : '#6B7280', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: mode === id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', fontFamily: 'Kanit, sans-serif' }}
                   >
                     <Icon size={15} strokeWidth={1.8} /> {label}
                   </button>
                ))}
             </div>
             <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
                <X size={24} />
             </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', background: '#F3F4F6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
             {mode === 'rect' ? (
               <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                 <img
                   ref={imgRef}
                   src={imageUrl}
                   onLoad={onImageLoad}
                   style={{ maxHeight: '60vh', maxWidth: '100%', objectFit: 'contain' }}
                   crossOrigin="anonymous"
                 />
               </ReactCrop>
             ) : (
               <div style={{ position: 'relative', touchAction: 'none' }}>
                 <img
                   ref={freeImgRef}
                   src={imageUrl}
                   onLoad={syncOverlaySize}
                   draggable={false}
                   style={{ display: 'block', maxHeight: '60vh', maxWidth: '100%', objectFit: 'contain', userSelect: 'none' }}
                   crossOrigin="anonymous"
                 />
                 <canvas
                   ref={overlayRef}
                   onPointerDown={freeStart}
                   onPointerMove={freeMove}
                   onPointerUp={freeEnd}
                   onPointerCancel={freeEnd}
                   style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                 />
               </div>
             )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 20 }}>
             <span style={{ fontSize: 12.5, color: '#6B7280', fontFamily: 'Kanit, sans-serif' }}>
                {mode === 'free' ? 'ลากเส้นล้อมรอบส่วนที่ต้องการเก็บไว้ ส่วนนอกเส้นจะโปร่งใส' : 'ลากกรอบเพื่อเลือกส่วนที่ต้องการ'}
             </span>
             <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                {mode === 'free' && hasPath && (
                   <button onClick={freeReset} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', color: '#4B5563', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kanit, sans-serif' }}>
                      <RotateCcw size={16} /> วาดใหม่
                   </button>
                )}
                <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', color: '#4B5563', fontWeight: 600, cursor: 'pointer', fontFamily: 'Kanit, sans-serif' }}>
                   ยกเลิก
                </button>
                <button onClick={handleCrop} disabled={confirmDisabled} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: confirmDisabled ? '#D1D5DB' : '#3B82F6', color: 'white', fontWeight: 600, cursor: confirmDisabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Kanit, sans-serif' }}>
                   <Check size={18} /> ยืนยันการครอบตัด
                </button>
             </div>
          </div>

       </div>
    </div>
  );
}
