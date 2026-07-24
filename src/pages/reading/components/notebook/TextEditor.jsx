import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Minus, Plus } from 'lucide-react';
import { FONT_OPTIONS, LINE_HEIGHT } from './theme.js';
import { migrateText, makeLine, listPrefixes } from './geometry.js';

// WYSIWYG in-place editor for a text object with PER-LINE formatting.
//
// Every line is a real block element inside one contentEditable box, carrying its
// own format in `data-fmt` plus the matching inline styles — so bold, italic,
// underline, strike-through, alignment and bullets are visible WHILE typing,
// exactly as the canvas will draw them. (The old textarea could only show the
// result after committing, which is the thing that felt broken.)
//
// Two rules keep Thai/IME input safe:
//   1. The DOM is the source of truth. React never re-renders the text content —
//      it is built once on mount and the browser owns it from then on.
//   2. Nothing touches the DOM while a composition (IME) is in flight; the
//      restyle/renumber pass waits for compositionend.
// Because the format lives on the line element itself, pressing Enter mid-list
// carries the format with the line the browser clones — no index bookkeeping to
// drift out of sync.

const DEF = { bold: false, italic: false, underline: false, strikethrough: false, list: 'none', align: 'left' };
const FLAGS = ['bold', 'italic', 'underline', 'strikethrough'];

const readFmt = (el) => {
  try { return { ...DEF, ...JSON.parse(el.dataset.fmt || '{}') }; } catch { return { ...DEF }; }
};

const styleLine = (el, f) => {
  el.style.fontWeight = f.bold ? '700' : '400';
  el.style.fontStyle = f.italic ? 'italic' : 'normal';
  el.style.textDecoration = [f.underline ? 'underline' : '', f.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
  el.style.textAlign = f.align || 'left';
  el.style.paddingLeft = f.list && f.list !== 'none' ? '1.6em' : '0';
};

const writeFmt = (el, f) => {
  // Store only the format keys — a line object also carries its text, which has
  // no business being duplicated into an attribute.
  const clean = { ...DEF };
  Object.keys(DEF).forEach((k) => { clean[k] = f[k] ?? DEF[k]; });
  el.dataset.fmt = JSON.stringify(clean);
  styleLine(el, clean);
};

const lineEls = (root) => (root ? Array.from(root.children).filter((n) => n.nodeType === 1) : []);
const textOfEl = (el) => el.textContent.replace(/\n/g, '');

const makeLineEl = (text, fmt) => {
  const d = document.createElement('div');
  d.className = 'pn-ln';
  writeFmt(d, { ...DEF, ...fmt });
  if (text) d.textContent = text;
  else d.appendChild(document.createElement('br'));
  return d;
};

const caretToEnd = (el) => {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
};

export default function TextEditor({ x, y, scale, t, textareaRef, onChange, onLinesChange, onFont, onSize, onColor, onCommit }) {
  const localRef = useRef(null);
  const edRef = textareaRef || localRef;
  const composing = useRef(false);
  const savedRange = useRef(null);
  const [active, setActive] = useState(DEF);

  const size = t.size || 24;
  const fontFamily = t.fontFamily || 'Kanit';

  // --- reading / emitting -------------------------------------------------
  const emit = useCallback(() => {
    const el = edRef.current;
    if (!el) return;
    const lines = lineEls(el).map((d) => makeLine(textOfEl(d), readFmt(d)));
    onChange?.(lines.map((l) => l.text).join('\n'));
    onLinesChange?.(lines);
  }, [edRef, onChange, onLinesChange]);

  // Re-apply styles to any line the browser created for us (Enter, paste) and
  // refresh the bullet/number gutter, which is drawn with a CSS ::before so it
  // never becomes part of the text.
  const reflow = useCallback(() => {
    const el = edRef.current;
    if (!el) return;

    // Stray top-level text nodes appear if the whole box gets emptied; wrap them
    // so every line stays a styled block.
    Array.from(el.childNodes).forEach((n) => {
      if (n.nodeType === 3 && n.textContent) {
        const wrap = makeLineEl(n.textContent, readFmt(n.previousElementSibling || el));
        el.replaceChild(wrap, n);
        caretToEnd(wrap);
      } else if (n.nodeType === 3) {
        el.removeChild(n);
      }
    });
    if (!el.firstElementChild) {
      const first = makeLineEl('', active);
      el.appendChild(first);
      caretToEnd(first);
    }

    const els = lineEls(el);
    els.forEach((d, i) => {
      d.classList.add('pn-ln');
      // A line the browser cloned keeps data-fmt; one it built from scratch
      // inherits the line above (so Enter continues a bullet).
      if (!d.dataset.fmt) writeFmt(d, i > 0 ? readFmt(els[i - 1]) : { ...DEF });
      else styleLine(d, readFmt(d));
    });

    const prefixes = listPrefixes(els.map((d) => makeLine(textOfEl(d), readFmt(d))));
    els.forEach((d, i) => {
      const p = (prefixes[i] || '').trim();
      if (p) d.dataset.prefix = p;
      else delete d.dataset.prefix;
    });

    // A line holding only a <br> isn't :empty, so the placeholder is driven by a
    // flag instead of a CSS pseudo-class.
    if (els.length === 1 && !textOfEl(els[0])) el.dataset.empty = '1';
    else delete el.dataset.empty;
  }, [edRef, active]);

  // --- selection ----------------------------------------------------------
  const rememberSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && edRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }, [edRef]);

  const selectedLines = useCallback(() => {
    const el = edRef.current;
    const all = lineEls(el);
    const r = savedRange.current;
    if (!r) return all.slice(0, 1);
    const hit = all.filter((d) => {
      try { return r.intersectsNode(d); } catch { return false; }
    });
    return hit.length ? hit : all.slice(0, 1);
  }, [edRef]);

  const syncActive = useCallback(() => {
    const sel = selectedLines().map(readFmt);
    if (!sel.length) return;
    const common = { ...DEF };
    FLAGS.forEach((f) => { common[f] = sel.every((s) => s[f]); });
    common.list = sel.every((s) => s.list === sel[0].list) ? sel[0].list : 'none';
    common.align = sel.every((s) => s.align === sel[0].align) ? sel[0].align : 'left';
    setActive(common);
  }, [selectedLines]);

  // --- mount --------------------------------------------------------------
  useEffect(() => {
    const el = edRef.current;
    if (!el) return;
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch { /* older browsers */ }
    const seed = migrateText(t).lines;
    el.innerHTML = '';
    (seed.length ? seed : [makeLine('')]).forEach((l) => el.appendChild(makeLineEl(l.text, l)));
    reflow();
    el.focus();
    caretToEnd(el.lastElementChild || el);
    rememberSelection();
    syncActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSelChange = () => {
      if (!edRef.current) return;
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !edRef.current.contains(sel.anchorNode)) return;
      rememberSelection();
      syncActive();
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [edRef, rememberSelection, syncActive]);

  // --- editing events -----------------------------------------------------
  const handleInput = () => {
    if (!composing.current) reflow();
    emit();
  };

  const applyToLines = (mutate) => {
    const els = selectedLines();
    if (!els.length) return;
    const cur = els.map(readFmt);
    els.forEach((d, i) => writeFmt(d, mutate(cur[i], cur)));
    reflow();
    emit();
    syncActive();
    // The buttons never take focus (mousedown is prevented), so the caret and
    // any selection are still exactly where the user left them.
    edRef.current?.focus();
  };

  const toggleFlag = (flag) => applyToLines((f, all) => ({ ...f, [flag]: !all.every((s) => s[flag]) }));
  const setAlign = (val) => applyToLines((f) => ({ ...f, align: val }));
  const toggleList = (val) => applyToLines((f, all) => ({ ...f, list: all.every((s) => s.list === val) ? 'none' : val }));

  // Paste as plain text, one block per line, inheriting the current line's format.
  const handlePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
    if (!text) return;
    const parts = text.replace(/\r\n?/g, '\n').split('\n');
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    sel.deleteFromDocument();
    document.execCommand('insertText', false, parts[0]);
    if (parts.length > 1) {
      let anchor = lineEls(edRef.current).find((d) => d.contains(sel.anchorNode)) || edRef.current.lastElementChild;
      const fmt = anchor ? readFmt(anchor) : DEF;
      parts.slice(1).forEach((p) => {
        const d = makeLineEl(p, fmt);
        anchor.after(d);
        anchor = d;
      });
      caretToEnd(anchor);
    }
    reflow();
    emit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); edRef.current?.blur(); return; }
    // Shift+Enter would insert a <br> inside the line; make it a real new line
    // so the canvas and the editor always agree on where lines break.
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertParagraph');
    }
  };

  // --- toolbar ------------------------------------------------------------
  const toolBtn = (on) => ({ width: 30, height: 30, borderRadius: 8, border: 'none', background: on ? 'var(--teal-light)' : 'transparent', color: on ? 'var(--teal)' : '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 });
  const sep = <div style={{ width: 1, height: 18, background: 'var(--br2)', margin: '0 3px', flexShrink: 0 }} />;
  const noFocusSteal = { onMouseDown: (e) => e.preventDefault() };

  const FormatBtn = ({ icon, active, onClick }) => (
    <button {...noFocusSteal} onClick={onClick} style={{...toolBtn(active), width: 26, height: 26}}>{icon}</button>
  );

  return (
    <div data-text-editor style={{ position: 'absolute', top: y, left: x, zIndex: 3000, isolation: 'isolate' }}>
      <style>{`
        [data-text-editor], [data-text-editor] * {
          -webkit-user-select: text !important;
          user-select: text !important;
        }
        .pn-ed .pn-ln { min-height: 1.2em; }
        .pn-ed .pn-ln[data-prefix]::before {
          content: attr(data-prefix);
          display: inline-block;
          width: 1.6em;
          margin-left: -1.6em;
          opacity: 0.85;
          font-weight: 400;
          font-style: normal;
          text-decoration: none;
        }
        .pn-ed[data-empty="1"] .pn-ln::after {
          content: "พิมพ์ข้อความที่นี่...";
          color: #9CA3AF;
          pointer-events: none;
        }
      `}</style>

      <div style={{ 
        position: 'absolute', 
        top: y < 60 ? '100%' : 'auto', 
        bottom: y >= 60 ? '100%' : 'auto', 
        marginTop: y < 60 ? 6 : 0, 
        marginBottom: y >= 60 ? 6 : 0, 
        left: 0, 
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, background: 'white', padding: '6px 8px', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', border: '1px solid var(--br2)', width: 'max-content', maxWidth: 'calc(100vw - 32px)'
      }}>
        <select
          value={fontFamily}
          onChange={(e) => { onFont(e.target.value); setTimeout(() => edRef.current?.focus(), 0); }}
          title="เปลี่ยนฟอนต์"
          style={{ height: 26, borderRadius: 6, border: '1px solid var(--br2)', background: '#F9FAFB', color: '#111827', fontSize: 12, padding: '0 4px', cursor: 'pointer', fontFamily, maxWidth: 100, flexShrink: 0 }}
        >
          {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
        </select>

        {onSize && (
          <div style={{ display: 'flex', alignItems: 'center', background: '#F9FAFB', border: '1px solid var(--br2)', borderRadius: 6, height: 26 }}>
            <button {...noFocusSteal} onClick={() => onSize(Math.max(10, size - 2))} style={{ ...toolBtn(false), width: 24, height: 24 }} title="เล็กลง"><Minus size={13} /></button>
            <span style={{ fontSize: 12, color: '#4B5563', minWidth: 20, textAlign: 'center' }}>{size}</span>
            <button {...noFocusSteal} onClick={() => onSize(Math.min(96, size + 2))} style={{ ...toolBtn(false), width: 24, height: 24 }} title="ใหญ่ขึ้น"><Plus size={13} /></button>
          </div>
        )}

        {onColor && (
          <label title="สีข้อความ" {...noFocusSteal} style={{ width: 22, height: 22, borderRadius: '50%', background: t.color || '#111827', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)', cursor: 'pointer', flexShrink: 0, display: 'block', overflow: 'hidden', marginLeft: 2 }}>
            <input type="color" value={t.color || '#111827'} onChange={(e) => onColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
          </label>
        )}
        
        <div style={{ width: 1, height: 16, background: 'var(--br2)', margin: '0 2px' }} />

        <div style={{ display: 'flex', gap: 2 }}>
          {[
            { id: 'bold', label: <span style={{ fontWeight: 800, fontFamily: 'serif', fontSize: 14 }}>B</span> },
            { id: 'italic', label: <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: 14 }}>I</span> },
            { id: 'underline', label: <span style={{ textDecoration: 'underline', fontFamily: 'serif', fontSize: 14 }}>U</span> },
            { id: 'strikethrough', label: <span style={{ textDecoration: 'line-through', fontFamily: 'serif', fontSize: 14 }}>S</span> },
          ].map((b) => (
            <button key={b.id} {...noFocusSteal} onClick={(e) => { e.stopPropagation(); toggleFlag(b.id); }} style={{...toolBtn(active[b.id]), width: 26, height: 26}}>{b.label}</button>
          ))}
        </div>
        
        <div style={{ width: 1, height: 16, background: 'var(--br2)', margin: '0 2px' }} />

        <div style={{ display: 'flex', gap: 2 }}>
          <FormatBtn icon={<List size={15} />} active={active.list === 'bullet'} onClick={() => toggleFormat('list', 'bullet')} />
          <FormatBtn icon={<ListOrdered size={15} />} active={active.list === 'number'} onClick={() => toggleFormat('list', 'number')} />
        </div>
        
        <div style={{ width: 1, height: 16, background: 'var(--br2)', margin: '0 2px' }} />

        <div style={{ display: 'flex', gap: 2 }}>
          <FormatBtn icon={<AlignLeft size={15} />} active={!active.align || active.align === 'left'} onClick={() => toggleFormat('align', 'left')} />
          <FormatBtn icon={<AlignCenter size={15} />} active={active.align === 'center'} onClick={() => toggleFormat('align', 'center')} />
          <FormatBtn icon={<AlignRight size={15} />} active={active.align === 'right'} onClick={() => toggleFormat('align', 'right')} />
        </div>
      </div>

      <div
        ref={edRef}
        className="pn-ed"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder="พิมพ์ข้อความที่นี่..."
        spellCheck={false}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; reflow(); emit(); }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          // Stay open when focus moves to one of our own controls.
          const editor = e.currentTarget.closest('[data-text-editor]');
          if (editor && e.relatedTarget && editor.contains(e.relatedTarget)) return;
          onCommit();
        }}
        style={{
          margin: 0,
          padding: 8,
          border: '2px solid var(--teal)',
          background: 'rgba(255,255,255,0.96)',
          color: t.color,
          fontSize: `${size * scale}px`,
          fontFamily,
          lineHeight: LINE_HEIGHT,
          outline: 'none',
          minWidth: 240,
          minHeight: 44,
          maxWidth: '90vw',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          borderRadius: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
          cursor: 'text',
          // The reading room disables text selection / uses touch-action:none on
          // the drawing surface; force them back on for the editor so a mouse
          // drag (and touch) can actually select text, not just Ctrl+A.
          userSelect: 'text',
          WebkitUserSelect: 'text',
          WebkitTouchCallout: 'default',
          touchAction: 'auto',
          position: 'relative',
          zIndex: 1,
        }}
      />
    </div>
  );
}
