import React from 'react';
import { FileStack, ChevronsUp, ChevronsDown, Trash2 } from 'lucide-react';

const RECOLOR = ['#111827', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#FEF08A'];

const Item = ({ icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: danger ? '#EF4444' : '#111827', cursor: 'pointer', fontSize: 14, textAlign: 'left', fontFamily: 'Kanit, sans-serif' }}
    onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
  >{icon} {label}</button>
);

// Long-press / right-click menu for a single object. The parent decides when to
// show it and supplies the action callbacks; each action closes the menu.
export default function ObjectContextMenu({ x, y, canRecolor, onClose, onDuplicate, onFront, onBack, onRecolor, onDelete }) {
  const menuW = 180;
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = Math.min(y, window.innerHeight - 300);
  const run = (fn) => () => { fn(); onClose(); };

  return (
    <>
      <div onPointerDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
      <div style={{ position: 'fixed', left, top, zIndex: 201, width: menuW, background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(20px)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.06)', padding: 6, overflow: 'hidden' }}>
        <Item icon={<FileStack size={17} color="#4B5563" />} label="ทำซ้ำ" onClick={run(onDuplicate)} />
        <Item icon={<ChevronsUp size={17} color="#4B5563" />} label="นำไปด้านหน้า" onClick={run(onFront)} />
        <Item icon={<ChevronsDown size={17} color="#4B5563" />} label="ส่งไปด้านหลัง" onClick={run(onBack)} />
        {canRecolor && (
          <div style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: '1px solid #F3F4F6', marginTop: 4 }}>
            {RECOLOR.map((c) => (
              <div key={c} onClick={run(() => onRecolor(c))} style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }} />
            ))}
          </div>
        )}
        <div style={{ borderTop: '1px solid #F3F4F6', marginTop: 4 }}>
          <Item icon={<Trash2 size={17} color="#EF4444" />} label="ลบ" onClick={run(onDelete)} danger />
        </div>
      </div>
    </>
  );
}
