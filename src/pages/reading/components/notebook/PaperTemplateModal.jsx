import React from 'react';
import { X } from 'lucide-react';
import { HW } from './theme.js';

const PAPER_TYPES = [
  { id: 'blank', label: 'เปล่า' },
  { id: 'lines', label: 'เส้นบรรทัด' },
  { id: 'grid', label: 'ตาราง' },
  { id: 'dots', label: 'จุดไข่ปลา' },
];
const PAPER_COLORS = [
  { id: 'white', label: 'ขาว', bg: '#FFFFFF' },
  { id: 'yellow', label: 'ครีม', bg: '#FEF3C7' },
  { id: 'dark', label: 'มืด', bg: '#1F2937' },
];

const previewBg = (id) => (id === 'yellow' ? '#FEF3C7' : id === 'dark' ? '#1F2937' : '#FFFFFF');
const patternCss = (type, col) => {
  if (type === 'lines') return { backgroundImage: `repeating-linear-gradient(${col} 0 1px, transparent 1px 12px)` };
  if (type === 'grid') return { backgroundImage: `repeating-linear-gradient(${col} 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, ${col} 0 1px, transparent 1px 12px)` };
  if (type === 'dots') return { backgroundImage: `radial-gradient(${col} 1.2px, transparent 1.3px)`, backgroundSize: '12px 12px' };
  return {};
};

// Modal for choosing the paper pattern and colour of the current page (or all
// pages). Presentational: the parent applies patches via onApply(patch, allPages).
export default function PaperTemplateModal({ page, onClose, onApply }) {
  const cur = page || {};
  const isDark = cur.paperColor === 'dark';
  const lineCol = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';

  return (
    <div onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 460, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827', fontFamily: 'Kanit, sans-serif' }}>แม่แบบกระดาษ</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280', display: 'flex' }}><X size={22} /></button>
        </div>

        {cur.src && (
          <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontSize: 12.5, fontFamily: 'Kanit, sans-serif' }}>
            หน้านี้เป็นหน้าจาก PDF — เปลี่ยนแม่แบบได้เฉพาะหน้าเปล่าเท่านั้น
          </div>
        )}

        {/* Pattern */}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 8, fontFamily: 'Kanit, sans-serif' }}>ลวดลาย</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {PAPER_TYPES.map((pt) => {
            const active = (cur.paperType || 'lines') === pt.id;
            return (
              <button key={pt.id} disabled={!!cur.src} onClick={() => onApply({ paperType: pt.id })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: cur.src ? 'default' : 'pointer', opacity: cur.src ? 0.4 : 1, padding: 0 }}>
                <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 8, background: previewBg(cur.paperColor), boxShadow: active ? `0 0 0 2.5px ${HW.accent}` : 'inset 0 0 0 1px rgba(0,0,0,0.1)', ...patternCss(pt.id, lineCol) }} />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? HW.accent : '#4B5563', fontFamily: 'Kanit, sans-serif' }}>{pt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Colour */}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 8, fontFamily: 'Kanit, sans-serif' }}>สีกระดาษ</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
          {PAPER_COLORS.map((pc) => {
            const active = (cur.paperColor || 'white') === pc.id;
            return (
              <button key={pc.id} disabled={!!cur.src} onClick={() => onApply({ paperColor: pc.id })} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: cur.src ? 'default' : 'pointer', opacity: cur.src ? 0.4 : 1 }}>
                <div style={{ width: '100%', height: 40, borderRadius: 8, background: pc.bg, boxShadow: active ? `0 0 0 2.5px ${HW.accent}` : 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? HW.accent : '#4B5563', fontFamily: 'Kanit, sans-serif' }}>{pc.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { if (!cur.src) onApply({ paperType: cur.paperType, paperColor: cur.paperColor }, true); }} disabled={!!cur.src} style={{ flex: 1, height: 42, borderRadius: 11, border: '1px solid #D1D5DB', background: 'white', color: cur.src ? '#D1D5DB' : '#4B5563', fontWeight: 600, cursor: cur.src ? 'default' : 'pointer', fontFamily: 'Kanit, sans-serif', fontSize: 13.5 }}>ใช้กับทุกหน้า</button>
          <button onClick={onClose} style={{ flex: 1, height: 42, borderRadius: 11, border: 'none', background: HW.accent, color: 'white', fontWeight: 600, cursor: 'pointer', fontFamily: 'Kanit, sans-serif', fontSize: 13.5 }}>ปิด</button>
        </div>
      </div>
    </div>
  );
}
