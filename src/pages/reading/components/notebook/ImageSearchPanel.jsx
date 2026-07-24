import React from 'react';
import Draggable from 'react-draggable';
import { Search, Image as ImageIcon, X } from 'lucide-react';
import { HW } from './theme.js';

const EXAMPLES = ['สติกเกอร์น่ารัก', 'หัวใจ', 'ดาว', 'ดอกไม้', 'cute sticker', 'emoji'];

// Kind of picture. "โปร่งใส" is the one that makes a notebook look tidy — a PNG
// with no white box around it sits on the page like a real sticker.
const KINDS = [
  { id: '', label: 'ทั้งหมด' },
  { id: 'transparent', label: 'สติกเกอร์ (พื้นโปร่ง)' },
  { id: 'clipart', label: 'การ์ตูน/คลิปอาร์ต' },
  { id: 'photo', label: 'ภาพถ่าย' },
  { id: 'gif', label: 'GIF' },
];

// Draggable panel for finding a web image and inserting it into the notebook.
// Purely presentational: the parent owns the query/results state and the
// search/insert logic, and passes them in.
export default function ImageSearchPanel({ query, setQuery, results, loading, filter, setFilter, onSearch, onInsert, onClose }) {
  return (
    <Draggable handle=".img-drag-handle" bounds="parent">
      <div style={{ position: 'absolute', top: 60, right: 20, width: 360, maxWidth: 'calc(100vw - 40px)', height: 520, maxHeight: 'calc(100vh - 90px)', zIndex: 60, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', padding: 16 }}>
        <div className="img-drag-handle" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexShrink: 0, cursor: 'move' }}>
          <ImageIcon size={18} color={HW.accent} />
          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, color: 'var(--text)', whiteSpace: 'nowrap', flex: 1 }}>ค้นหารูปภาพจากเว็บ</h3>
          <button onClick={onClose} title="ปิด" style={{ border: 'none', background: 'var(--gray-light)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><X size={17} /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSearch(query); }} style={{ display: 'flex', gap: 8, flexShrink: 0, marginBottom: 8 }}>
          <input
            autoFocus
            type="text"
            placeholder="พิมพ์คำค้น หรือวางลิงก์รูปก็ได้..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--br2)', fontSize: 14, outline: 'none' }}
          />
          <button type="submit" disabled={loading} style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: HW.accent, color: 'white', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Search size={17} /> {loading ? '...' : 'ค้นหา'}
          </button>
        </form>

        {/* Kind filter — re-runs the search straight away so it behaves like a
            tab strip rather than a setting you have to remember to apply. */}
        <div className="hide-scroll" style={{ display: 'flex', gap: 6, flexShrink: 0, marginBottom: 10, overflowX: 'auto' }}>
          {KINDS.map(k => {
            const on = (filter || '') === k.id;
            return (
              <button
                key={k.id || 'all'}
                onClick={() => { setFilter(k.id); if (query.trim()) onSearch(query, k.id); }}
                style={{ flexShrink: 0, whiteSpace: 'nowrap', border: 'none', background: on ? HW.accent : 'var(--gray-light)', color: on ? 'white' : 'var(--text)', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', transition: 'background 0.15s' }}
              >{k.label}</button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && results.length === 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: '1', borderRadius: 10, background: 'linear-gradient(90deg,#F1F5F9,#E2E8F0,#F1F5F9)', backgroundSize: '200% 100%', animation: 'pulse 1.2s ease-in-out infinite' }} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', gap: 12, textAlign: 'center', padding: '0 12px' }}>
              <ImageIcon size={44} strokeWidth={1.3} opacity={0.4} />
              <p style={{ fontSize: 14, margin: 0 }}>พิมพ์คำค้นหาได้ทั้งภาษาไทยและอังกฤษ<br/>แล้วแตะรูปเพื่อแทรกลงสมุดได้ทันที<br/><span style={{ fontSize: 12.5 }}>เลือก “สติกเกอร์ (พื้นโปร่ง)” จะได้ PNG ไม่มีกรอบขาว</span></p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => { setQuery(ex); onSearch(ex); }} style={{ border: '1px solid var(--br2)', background: 'white', color: HW.accent, fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer' }}>{ex}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
              {results.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onInsert(item)}
                  title={`${item.title || ''}${item.creator ? ' — ' + item.creator : ''} (${item.source} · ${item.license || 'CC'})`}
                  style={{ position: 'relative', border: '1px solid var(--br2)', borderRadius: 10, overflow: 'hidden', background: 'white', cursor: 'pointer', padding: 0, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <img src={item.thumbnail || item.url} alt={item.title || 'result'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 9, fontWeight: 700, color: 'white', background: 'rgba(0,0,0,0.55)', padding: '2px 6px', borderRadius: 999, pointerEvents: 'none' }}>{item.source}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p style={{ flexShrink: 0, marginTop: 8, fontSize: 10.5, color: 'var(--t3)', textAlign: 'center' }}>รูปจาก DuckDuckGo · Wikipedia · Commons · Openverse — โปรดตรวจลิขสิทธิ์/ให้เครดิตก่อนเผยแพร่</p>
      </div>
    </Draggable>
  );
}
