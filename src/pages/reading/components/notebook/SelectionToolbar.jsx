import React from 'react';
import { Crop, ScanText, Type, ChevronsUp, ChevronsDown, FileStack, Trash2, Check } from 'lucide-react';
import { HW, STICKY_COLORS } from './theme.js';

// Huawei-style floating action bar shown above a single selected object. Purely
// presentational — the parent computes the on-screen position and binds each
// action to the selected object.
export default function SelectionToolbar({ left, top, kind, canEdit, onCrop, onOcr, onEdit, onRecolor, onFront, onBack, onDuplicate, onDelete, onDone }) {
  const btn = { height: 32, padding: '0 10px', borderRadius: 10, border: 'none', background: 'transparent', color: HW.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' };
  const divider = <div style={{ width: 1, height: 20, background: HW.hairline, margin: '0 3px' }} />;
  const swatches = kind === 'stickers' ? STICKY_COLORS : ['#111827', '#EF4444', '#F59E0B', '#10B981', '#3B82F6'];

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'absolute', left, top: Math.max(8, top), transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', background: HW.surface, backdropFilter: HW.blur, WebkitBackdropFilter: HW.blur, borderRadius: 14, boxShadow: HW.shadow, border: `1px solid ${HW.hairline}`, maxWidth: 'calc(100vw - 20px)', overflowX: 'auto' }}
    >
      {kind === 'images' && (
        <>
          <button style={btn} onClick={onCrop}><Crop size={16} strokeWidth={1.7} /> ครอบตัด</button>
          <button style={btn} onClick={onOcr}><ScanText size={16} strokeWidth={1.7} /> ดึงข้อความ (OCR)</button>
          {divider}
        </>
      )}

      {canEdit && (
        <>
          <button style={btn} onClick={onEdit}><Type size={16} strokeWidth={1.7} /> แก้ไข</button>
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
                onClick={() => onRecolor(c)}
                style={{ width: 18, height: 18, borderRadius: kind === 'stickers' ? 5 : '50%', background: c, cursor: 'pointer', boxShadow: `inset 0 0 0 1px ${HW.hairline}` }}
              />
            ))}
          </div>
          {divider}
        </>
      )}

      <button style={btn} onClick={onFront} title="นำไปด้านหน้า"><ChevronsUp size={16} strokeWidth={1.7} /></button>
      <button style={btn} onClick={onBack} title="ส่งไปด้านหลัง"><ChevronsDown size={16} strokeWidth={1.7} /></button>
      {divider}
      <button style={btn} onClick={onDuplicate} title="ทำซ้ำ"><FileStack size={16} strokeWidth={1.7} /></button>
      <button style={{ ...btn, color: '#EF4444' }} onClick={onDelete} title="ลบ"><Trash2 size={16} strokeWidth={1.7} /></button>
      <button style={{ ...btn, color: HW.accent }} onClick={onDone} title="เสร็จสิ้น"><Check size={17} strokeWidth={2} /></button>
    </div>
  );
}
