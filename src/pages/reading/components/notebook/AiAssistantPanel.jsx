import React, { useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { Sparkles, X, Send, Paperclip, FileText, Copy, StickyNote } from 'lucide-react';
import { HW } from './theme.js';

// Extract the assistant's reply from whatever JSON shape the upstream returns.
const readAnswer = (data) =>
  data?.choices?.[0]?.message?.content ||
  data?.message?.content ||
  data?.content ||
  data?.answer ||
  data?.response ||
  (typeof data === 'string' ? data : '');

// Draggable AI panel: attach a PDF (or any file), ask a question, read the answer,
// and drop it into the notebook as a text note. Talks to the /api/ai proxy so the
// secret key stays server-side.
export default function AiAssistantPanel({ onClose, onInsertText }) {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const ask = async () => {
    if (!question.trim() && !file) { setError('พิมพ์คำถาม หรือแนบไฟล์ก่อน'); return; }
    setLoading(true); setAnswer(''); setError('');
    try {
      const form = new FormData();
      form.append('messages', JSON.stringify([{ role: 'user', content: question.trim() || 'สรุปไฟล์นี้ให้หน่อย' }]));
      if (file) form.append('file', file);
      const res = await fetch('/api/ai?path=chat', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'not_configured') setError('ยังไม่ได้ตั้งค่า AI — ต้องใส่ UNCLEDEV_AI_KEY ใน Vercel แล้ว redeploy');
        else if (data.error === 'ai_auth_failed') setError('AI ปฏิเสธการเข้าถึง — UNCLEDEV_AI_KEY อาจหมดอายุ/ไม่ถูกต้อง ตรวจสอบใน Vercel');
        else setError(`เรียก AI ไม่สำเร็จ (${data.error || res.status})`);
        return;
      }
      const a = readAnswer(data);
      setAnswer(a || 'AI ตอบกลับมาว่าง');
    } catch (e) {
      setError('เชื่อมต่อไม่ได้ — ตรวจอินเทอร์เน็ต');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Draggable handle=".ai-drag-handle" bounds="parent">
      <div style={{ position: 'absolute', top: 60, right: 20, width: 380, maxWidth: 'calc(100vw - 40px)', height: 560, maxHeight: 'calc(100vh - 90px)', zIndex: 60, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', padding: 16 }}>
        <div className="ai-drag-handle" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexShrink: 0, cursor: 'move' }}>
          <Sparkles size={18} color={HW.accent} />
          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, color: 'var(--text)', flex: 1 }}>ผู้ช่วย AI · ถาม PDF</h3>
          <button onClick={onClose} title="ปิด" style={{ border: 'none', background: 'var(--gray-light)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><X size={17} /></button>
        </div>

        {/* File picker */}
        <input ref={fileRef} type="file" accept=".pdf,.txt,.doc,.docx,image/*" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); }} />
        {file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: HW.accentSoft, marginBottom: 10, flexShrink: 0 }}>
            <FileText size={16} color={HW.accent} />
            <span style={{ flex: 1, fontSize: 13, color: HW.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
            <button onClick={() => setFile(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280', display: 'flex' }}><X size={15} /></button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 10, border: '1.5px dashed var(--br2)', background: 'white', color: HW.textDim, cursor: 'pointer', marginBottom: 10, flexShrink: 0, fontSize: 13.5, fontWeight: 600 }}>
            <Paperclip size={16} /> แนบไฟล์ PDF / รูป (ไม่บังคับ)
          </button>
        )}

        {/* Question */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginBottom: 10 }}>
          <textarea
            placeholder="ถามอะไรก็ได้ เช่น สรุปไฟล์นี้, ประเด็นสำคัญมีอะไรบ้าง..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask(); }}
            rows={2}
            style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--br2)', fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={ask} disabled={loading} title="ส่ง (Ctrl+Enter)" style={{ width: 44, borderRadius: 10, border: 'none', background: HW.accent, color: 'white', cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Send size={18} />
          </button>
        </div>

        {/* Answer */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, borderRadius: 12, border: '1px solid var(--br2)', background: '#FAFAFA', padding: 12 }}>
          {loading ? (
            <div style={{ color: HW.textDim, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} /> กำลังคิด...
            </div>
          ) : error ? (
            <div style={{ color: '#DC2626', fontSize: 13.5 }}>{error}</div>
          ) : answer ? (
            <div style={{ fontSize: 14, lineHeight: 1.65, color: '#1F2937', whiteSpace: 'pre-wrap' }}>{answer}</div>
          ) : (
            <div style={{ color: 'var(--t3)', fontSize: 13.5, textAlign: 'center', marginTop: 24 }}>
              แนบไฟล์ PDF แล้วถาม AI ได้เลย<br />คำตอบจะแสดงตรงนี้ แล้วแทรกลงสมุดได้
            </div>
          )}
        </div>

        {answer && !loading && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexShrink: 0 }}>
            {onInsertText && (
              <button onClick={() => onInsertText(answer)} style={{ flex: 1, height: 38, borderRadius: 10, border: 'none', background: HW.accent, color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13.5 }}>
                <StickyNote size={16} /> แทรกลงสมุด
              </button>
            )}
            <button onClick={() => navigator.clipboard?.writeText(answer)} style={{ flex: '0 0 auto', height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--br2)', background: 'white', color: HW.text, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13.5 }}>
              <Copy size={15} /> คัดลอก
            </button>
          </div>
        )}
        <p style={{ flexShrink: 0, marginTop: 8, fontSize: 10.5, color: 'var(--t3)', textAlign: 'center' }}>ขับเคลื่อนโดย ai.uncledev.net — ตรวจสอบคำตอบก่อนใช้งานจริง</p>
      </div>
    </Draggable>
  );
}
