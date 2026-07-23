import React from 'react';
import { X, Image as ImageIcon, FileText, FileStack, Columns, Download } from 'lucide-react';
import { HW } from './theme.js';

const Choice = ({ selected, onClick, disabled, icon, title, sub }) => (
  <button onClick={onClick} disabled={disabled} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 12px', borderRadius: 14, border: `2px solid ${selected ? HW.accent : 'rgba(0,0,0,0.08)'}`, background: selected ? HW.accentSoft : 'white', cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s' }}>
    {icon}
    <span style={{ fontSize: 14, fontWeight: 700, color: selected ? HW.accent : '#111827', fontFamily: 'Kanit, sans-serif' }}>{title}</span>
    {sub && <span style={{ fontSize: 11.5, color: '#9CA3AF', fontFamily: 'Kanit, sans-serif' }}>{sub}</span>}
  </button>
);

// Modal for choosing export format (image / PDF) and scope (this page / all).
// Presentational: the parent owns the format/scope state and the export action.
export default function ExportModal({ format, setFormat, scope, setScope, exporting, pageCount, currentIndex, onExport, onClose }) {
  return (
    <div onPointerDown={(e) => { if (e.target === e.currentTarget && !exporting) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 440, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827', fontFamily: 'Kanit, sans-serif' }}>ส่งออกสมุดโน้ต</h3>
          <button onClick={() => !exporting && onClose()} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280', display: 'flex' }}><X size={22} /></button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 8, fontFamily: 'Kanit, sans-serif' }}>รูปแบบไฟล์</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
          <Choice selected={format === 'png'} disabled={exporting} onClick={() => setFormat('png')} icon={<ImageIcon size={26} color={format === 'png' ? HW.accent : '#6B7280'} />} title="รูปภาพ" sub="ไฟล์ .png" />
          <Choice selected={format === 'pdf'} disabled={exporting} onClick={() => setFormat('pdf')} icon={<FileText size={26} color={format === 'pdf' ? HW.accent : '#6B7280'} />} title="PDF" sub="รวมทุกหน้าในไฟล์เดียว" />
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 8, fontFamily: 'Kanit, sans-serif' }}>ขอบเขต</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
          <Choice selected={scope === 'current'} disabled={exporting} onClick={() => setScope('current')} icon={<FileStack size={26} color={scope === 'current' ? HW.accent : '#6B7280'} />} title="เฉพาะหน้านี้" sub={`หน้า ${currentIndex + 1}`} />
          <Choice selected={scope === 'all'} disabled={exporting} onClick={() => setScope('all')} icon={<Columns size={26} color={scope === 'all' ? HW.accent : '#6B7280'} />} title="ทุกหน้า" sub={`${pageCount} หน้า`} />
        </div>

        <button onClick={() => onExport(format, scope)} disabled={exporting} style={{ width: '100%', height: 46, borderRadius: 12, border: 'none', background: HW.accent, color: 'white', fontWeight: 700, fontSize: 15, cursor: exporting ? 'default' : 'pointer', fontFamily: 'Kanit, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: exporting ? 0.7 : 1 }}>
          {exporting ? 'กำลังส่งออก...' : (<><Download size={18} /> ดาวน์โหลด</>)}
        </button>
        {scope === 'all' && format === 'png' && (
          <p style={{ fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', marginTop: 10, marginBottom: 0, fontFamily: 'Kanit, sans-serif' }}>* จะดาวน์โหลดแยกเป็นไฟล์รูปทีละหน้า</p>
        )}
      </div>
    </div>
  );
}
