import React from 'react';
import { FileStack, Minus, Plus, Trash2, Check } from 'lucide-react';
import { HW } from './theme.js';

const SWATCHES = ['#111827', '#EF4444', '#F59E0B', '#10B981', '#3B82F6'];

// Huawei-style action bar above a lasso (marquee) selection of freehand ink and
// objects. Presentational; the parent computes position and binds the actions.
export default function LassoToolbar({ left, top, onDuplicate, onScale, onRecolor, onDelete, onDone }) {
  const btn = { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', color: HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'absolute', left, top: Math.max(8, top), transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: 14, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}` }}
    >
      <button title="ทำซ้ำ" onClick={onDuplicate} style={btn}><FileStack size={18} strokeWidth={1.6} /></button>
      <button title="ย่อ" onClick={() => onScale(0.85)} style={btn}><Minus size={18} strokeWidth={1.8} /></button>
      <button title="ขยาย" onClick={() => onScale(1.18)} style={btn}><Plus size={18} strokeWidth={1.8} /></button>

      <div style={{ width: 1, height: 20, background: HW.hairline, margin: '0 4px' }} />

      {SWATCHES.map(c => (
        <div
          key={c}
          title="เปลี่ยนสี"
          onClick={() => onRecolor(c)}
          style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, boxShadow: `inset 0 0 0 1px ${HW.hairline}`, margin: '0 2px' }}
        />
      ))}
      {/* Full palette for the lasso selection */}
      <label title="เลือกสีเอง (จานสี)" style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', margin: '0 2px', background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxShadow: `inset 0 0 0 1px ${HW.hairline}`, display: 'block' }}>
        <input type="color" defaultValue="#111827" onChange={(e) => onRecolor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
      </label>

      <div style={{ width: 1, height: 20, background: HW.hairline, margin: '0 4px' }} />

      <button title="ลบ" onClick={onDelete} style={{ ...btn, color: '#EF4444' }}><Trash2 size={18} strokeWidth={1.6} /></button>
      <button title="เสร็จสิ้น" onClick={onDone} style={{ ...btn, color: HW.accent }}><Check size={18} strokeWidth={2} /></button>
    </div>
  );
}
