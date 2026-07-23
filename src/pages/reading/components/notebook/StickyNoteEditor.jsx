import React from 'react';

// In-place editor for a sticky note's text, positioned over the note on canvas.
// Presentational: the parent owns the value, the textarea ref, and the
// commit/delete logic.
export default function StickyNoteEditor({ x, y, scale, round, value, onChange, textareaRef, onCommit, onDelete }) {
  return (
    <div style={{ position: 'absolute', top: y, left: x, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        ref={textareaRef}
        autoFocus
        placeholder="พิมพ์ข้อความที่นี่..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          margin: 0,
          padding: 16,
          border: '2px solid var(--teal)',
          background: 'transparent',
          color: '#111827',
          fontSize: `${16 * scale}px`,
          fontFamily: 'Kanit, sans-serif',
          outline: 'none',
          resize: 'none',
          width: 150 * scale,
          height: 150 * scale,
          overflow: 'hidden',
          borderRadius: round ? 16 * scale : 2 * scale,
        }}
      />
      {/* preventDefault keeps focus on the textarea. Without it the button
          steals focus, onBlur closes the editor, and this button unmounts
          before the click can land — so delete silently did nothing. */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={onDelete}
        style={{ background: '#EF4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start', fontSize: 13, boxShadow: '0 2px 8px rgba(239,68,68,0.2)' }}
      >
        ลบโพสต์อิท
      </button>
    </div>
  );
}
