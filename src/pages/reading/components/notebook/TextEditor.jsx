import React from 'react';
import { AlignLeft, AlignCenter, AlignRight, List, ListOrdered } from 'lucide-react';
import { FONT_OPTIONS } from './theme.js';

// In-place editor for a text object: a floating format toolbar (font, B/I/U,
// align, lists) above a textarea, plus a bullet/number gutter overlay. Purely
// presentational — the parent owns `t` (the text model), the value, the textarea
// ref, and all the mutation callbacks. The parent should key this by the text id.
export default function TextEditor({ x, y, scale, t, value, textareaRef, onChange, onToggle, onAlign, onList, onFont, onCommit }) {
  const toolBtn = (active) => ({ width: 28, height: 28, borderRadius: 6, border: 'none', background: active ? 'var(--teal-light)' : 'transparent', color: active ? 'var(--teal)' : '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const sep = <div style={{ width: 1, height: 16, background: 'var(--br2)', margin: '0 4px' }} />;

  return (
    <div data-text-editor style={{ position: 'absolute', top: y - 50, left: x, zIndex: 101, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'white', padding: '6px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid var(--br2)', maxWidth: '92vw', overflowX: 'auto' }}>
        {/* Font selector — lets you restyle an existing text's font after it's created */}
        <select
          value={t.fontFamily || 'Kanit'}
          onMouseDown={e => e.stopPropagation()}
          onChange={(e) => { onFont(e.target.value); setTimeout(() => textareaRef.current?.focus(), 0); }}
          title="เปลี่ยนฟอนต์"
          style={{ height: 28, borderRadius: 6, border: '1px solid var(--br2)', background: '#F9FAFB', color: '#111827', fontSize: 12.5, padding: '0 6px', cursor: 'pointer', fontFamily: t.fontFamily || 'Kanit', maxWidth: 118 }}
        >
          {FONT_OPTIONS.map(f => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
          ))}
        </select>
        {sep}
        {[
          { id: 'bold', icon: <span style={{ fontWeight: 700, fontFamily: 'serif', fontSize: 16 }}>B</span> },
          { id: 'italic', icon: <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: 16 }}>I</span> },
          { id: 'underline', icon: <span style={{ textDecoration: 'underline', fontFamily: 'serif', fontSize: 16 }}>U</span> },
        ].map(btn => (
          <button key={btn.id} onMouseDown={e => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onToggle(btn.id); }} style={toolBtn(t[btn.id])}>{btn.icon}</button>
        ))}
        {sep}
        {[
          { id: 'left', icon: <AlignLeft size={16} /> },
          { id: 'center', icon: <AlignCenter size={16} /> },
          { id: 'right', icon: <AlignRight size={16} /> },
        ].map(btn => (
          <button key={btn.id} onMouseDown={e => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onAlign(btn.id); }} style={toolBtn((t.align || 'left') === btn.id)}>{btn.icon}</button>
        ))}
        {sep}
        {[
          { id: 'bullet', icon: <List size={16} /> },
          { id: 'number', icon: <ListOrdered size={16} /> },
        ].map(btn => (
          <button key={btn.id} onMouseDown={e => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onList(btn.id); }} style={toolBtn(t.list === btn.id)}>{btn.icon}</button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        {(t.list === 'bullet' || t.list === 'number') && (
          <div style={{ position: 'absolute', top: 8, left: 8, pointerEvents: 'none', color: t.color || 'black', fontSize: (t.size || 24) * scale, fontFamily: t.fontFamily || 'Kanit', lineHeight: 1.2, zIndex: 101 }}>
            {value.split('\n').map((_, i) => <div key={i} style={{ minHeight: '1.2em', lineHeight: 1.2 }}>{t.list === 'bullet' ? '•' : `${i + 1}.`}</div>)}
          </div>
        )}
        <textarea
          ref={textareaRef}
          placeholder="พิมพ์ข้อความที่นี่..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            // Keep the editor open when focus moves to one of its own controls
            // (the font <select>, format buttons) so they can restyle the text.
            const editor = e.currentTarget.closest('[data-text-editor]');
            if (editor && e.relatedTarget && editor.contains(e.relatedTarget)) return;
            onCommit();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            margin: 0,
            padding: 8,
            paddingLeft: ['bullet', 'number'].includes(t.list) ? ((t.size || 24) * scale) + 12 : 8,
            border: '2px solid var(--teal)',
            background: 'rgba(255,255,255,0.95)',
            color: t.color,
            fontSize: `${t.size * scale}px`,
            fontFamily: t.fontFamily || 'Kanit',
            fontWeight: t.bold ? 700 : 400,
            fontStyle: t.italic ? 'italic' : 'normal',
            textDecoration: [t.underline ? 'underline' : '', t.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
            textAlign: t.align || 'left',
            lineHeight: 1.2,
            outline: 'none',
            resize: 'none',
            minWidth: 240,
            minHeight: 100,
            overflow: 'hidden',
            zIndex: 100,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') textareaRef.current?.blur();
          }}
        />
      </div>
    </div>
  );
}
