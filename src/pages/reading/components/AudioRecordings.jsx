import React, { useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, X, Trash2, Pencil, Check, Mic, ListMusic, Gauge } from 'lucide-react';

export const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// The recordings list — Huawei "บันทึก" panel. Aggregates every audio note in the
// notebook so nothing gets lost when it's tied to a page you're not looking at.
export function RecordingsPanel({ recordings, nowPlayingId, audioPlaying, onPlayToggle, onDelete, onRename, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  return (
    <div style={{ position: 'absolute', top: 58, right: 12, zIndex: 65, width: 320, maxWidth: 'calc(100vw - 24px)', background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(20px)', borderRadius: 16, boxShadow: '0 16px 50px rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'Kanit, sans-serif', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListMusic size={18} /> บันทึกเสียง
        </span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280', display: 'flex' }}><X size={20} /></button>
      </div>

      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {recordings.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 13.5, fontFamily: 'Kanit, sans-serif' }}>
            <Mic size={28} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
            ยังไม่มีเสียงที่บันทึกไว้<br />
            <span style={{ fontSize: 12 }}>กดปุ่มไมค์ในแถบเครื่องมือเพื่อเริ่มอัด</span>
          </div>
        )}
        {recordings.map((rec, idx) => {
          const active = rec.id === nowPlayingId;
          const name = rec.name || `บันทึก (${idx + 1})`;
          return (
            <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #F9FAFB', background: active ? 'rgba(10,89,247,0.05)' : 'transparent' }}>
              <button
                onClick={() => onPlayToggle(rec)}
                disabled={rec.isUploading}
                style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', background: active ? '#0A59F7' : '#EEF2FF', color: active ? 'white' : '#0A59F7', cursor: rec.isUploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: rec.isUploading ? 0.5 : 1 }}
              >
                {active && audioPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === rec.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { onRename(rec, editValue.trim() || name); setEditingId(null); } }}
                      style={{ flex: 1, minWidth: 0, height: 30, borderRadius: 7, border: '1px solid #D1D5DB', padding: '0 8px', fontSize: 14, fontFamily: 'Kanit, sans-serif' }}
                    />
                    <button onClick={() => { onRename(rec, editValue.trim() || name); setEditingId(null); }} style={{ border: 'none', background: '#0A59F7', color: 'white', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={16} /></button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: '#111827', fontFamily: 'Kanit, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'Kanit, sans-serif' }}>
                      {rec.isUploading ? 'กำลังอัปโหลด...' : fmtDate(rec.createdAt)}
                    </div>
                  </>
                )}
              </div>

              {editingId !== rec.id && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button onClick={() => { setEditingId(rec.id); setEditValue(name); }} title="เปลี่ยนชื่อ" style={{ border: 'none', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={15} /></button>
                  <button onClick={() => onDelete(rec)} title="ลบ" style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The playback bar — Huawei's transport strip. Play/pause, ±15s, seek, time, speed.
export function PlaybackBar({ name, playing, current, duration, speed, onToggle, onSkip, onSeek, onSpeed, onClose }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.14)', border: '1px solid rgba(0,0,0,0.06)', padding: '12px 16px', width: 360, maxWidth: 'calc(100vw - 24px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mic size={15} color="#0A59F7" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#111827', fontFamily: 'Kanit, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', display: 'flex' }}><X size={17} /></button>
      </div>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(current, duration || 0)}
        onChange={(e) => onSeek(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#0A59F7', cursor: 'pointer' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace', minWidth: 84 }}>{fmtTime(current)} / {fmtTime(duration)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => onSkip(-15)} title="ถอยหลัง 15 วินาที" style={{ border: 'none', background: 'transparent', color: '#4B5563', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={22} /><span style={{ position: 'absolute', fontSize: 8, fontWeight: 700 }}>15</span>
          </button>
          <button onClick={onToggle} style={{ border: 'none', background: '#0A59F7', color: 'white', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={() => onSkip(15)} title="เดินหน้า 15 วินาที" style={{ border: 'none', background: 'transparent', color: '#4B5563', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCw size={22} /><span style={{ position: 'absolute', fontSize: 8, fontWeight: 700 }}>15</span>
          </button>
        </div>
        <button onClick={onSpeed} title="ความเร็ว" style={{ border: 'none', background: 'rgba(0,0,0,0.05)', color: '#4B5563', cursor: 'pointer', borderRadius: 8, padding: '4px 8px', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, minWidth: 52, justifyContent: 'center', fontFamily: 'monospace' }}>
          <Gauge size={14} />{speed}x
        </button>
      </div>
    </div>
  );
}
