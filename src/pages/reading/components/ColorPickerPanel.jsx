import React, { useState, useRef, useEffect } from 'react';
import { Check, Pipette, X } from 'lucide-react';

// In-app HSV colour picker. The native <input type="color"> simply does nothing on
// several tablet browsers (Huawei Browser among them), which made the palette feel
// "locked" to the preset swatches — so the picker is drawn and driven entirely by
// pointer events here.

const hsvToHex = (h, s, v) => {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
};

const hexToHsv = (hex) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
};

export default function ColorPickerPanel({ color, onChange, onCommit, onClose, recentColors = [] }) {
  const [hsv, setHsv] = useState(() => hexToHsv(color) || { h: 210, s: 0.8, v: 0.9 });
  const [hexInput, setHexInput] = useState(color);
  const svRef = useRef(null);
  const hueRef = useRef(null);

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  useEffect(() => { setHexInput(hex); }, [hex]);

  const apply = (next) => {
    setHsv(next);
    onChange(hsvToHex(next.h, next.s, next.v));
  };

  // One drag routine for both pads: capture the pointer so the drag keeps
  // tracking even when the finger wanders off the pad.
  const startDrag = (ref, handler) => (e) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    try { el.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    const move = (ev) => {
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      handler(x, y);
    };
    move(e);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onSvDrag = startDrag(svRef, (x, y) => apply({ ...hsvRef.current, s: x, v: 1 - y }));
  const onHueDrag = startDrag(hueRef, (x) => apply({ ...hsvRef.current, h: x * 360 }));

  // The drag closures outlive a render, so they read the live hsv through a ref.
  const hsvRef = useRef(hsv);
  useEffect(() => { hsvRef.current = hsv; }, [hsv]);

  const commitHexInput = () => {
    const parsed = hexToHsv(hexInput.startsWith('#') ? hexInput : `#${hexInput}`);
    if (parsed) apply(parsed);
    else setHexInput(hex);
  };

  const supportsEyeDropper = typeof window !== 'undefined' && !!window.EyeDropper;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{ width: 262, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.16)', border: '1px solid rgba(0,0,0,0.06)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, touchAction: 'none' }}
    >
      {/* Saturation / brightness pad */}
      <div
        ref={svRef}
        onPointerDown={onSvDrag}
        style={{ position: 'relative', height: 140, borderRadius: 10, cursor: 'crosshair', background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))` }}
      >
        <div style={{ position: 'absolute', left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, transform: 'translate(-50%, -50%)', width: 18, height: 18, borderRadius: '50%', border: '3px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', background: hex, pointerEvents: 'none' }} />
      </div>

      {/* Hue bar */}
      <div
        ref={hueRef}
        onPointerDown={onHueDrag}
        style={{ position: 'relative', height: 16, borderRadius: 8, cursor: 'pointer', background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        <div style={{ position: 'absolute', left: `${(hsv.h / 360) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 20, height: 20, borderRadius: '50%', border: '3px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', background: `hsl(${hsv.h}, 100%, 50%)`, pointerEvents: 'none' }} />
      </div>

      {/* Preview + hex + eyedropper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)', flexShrink: 0 }} />
        <input
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={commitHexInput}
          onKeyDown={(e) => { if (e.key === 'Enter') commitHexInput(); }}
          spellCheck={false}
          style={{ flex: 1, minWidth: 0, height: 30, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', padding: '0 8px', fontSize: 13, fontFamily: 'monospace', color: '#111827', textTransform: 'lowercase' }}
        />
        {supportsEyeDropper && (
          <button
            title="ดูดสีจากหน้าจอ"
            onClick={async () => {
              try {
                const r = await new window.EyeDropper().open();
                const parsed = hexToHsv(r.sRGBHex);
                if (parsed) apply(parsed);
              } catch { /* cancelled */ }
            }}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: 'white', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Pipette size={16} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* Recently used colours */}
      {recentColors.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {recentColors.map((c) => (
            <div
              key={c}
              onClick={() => { const p = hexToHsv(c); if (p) apply(p); }}
              title={c}
              style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)', outline: hex.toLowerCase() === c.toLowerCase() ? '2px solid #0A59F7' : 'none', outlineOffset: 2 }}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} style={{ height: 32, padding: '0 14px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.1)', background: 'white', color: '#4B5563', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kanit, sans-serif' }}>
          <X size={15} /> ปิด
        </button>
        <button onClick={() => onCommit(hex)} style={{ height: 32, padding: '0 14px', borderRadius: 9, border: 'none', background: '#0A59F7', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kanit, sans-serif' }}>
          <Check size={15} /> ใช้สีนี้
        </button>
      </div>
    </div>
  );
}
