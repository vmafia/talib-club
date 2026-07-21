import re

with open('src/pages/reading/components/ProNotebook.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Text tool onChange typing fix
target = """             onChange={(e) => {
                const val = e.target.value;
                setEditingTextValue(val);
                updatePage(currentPageIndex, (page) => {
                   const txt = page.texts?.find(tx => tx.id === editingTextId);
                   if (txt) txt.text = val;
                });
             }}
             onBlur={() => {
                if (!isEditingText.current) return;
                isEditingText.current = false;
                
                if (editingTextValue.trim() === '') {
                   updatePage(currentPageIndex, (page) => {
                      page.texts = page.texts.filter(tx => tx.id !== editingTextId);
                   });
                }
                setEditingTextId(null);
             }}"""
replacement = """             onChange={(e) => {
                setEditingTextValue(e.target.value);
             }}
             onBlur={() => {
                if (!isEditingText.current) return;
                isEditingText.current = false;
                
                if (editingTextValue.trim() === '') {
                   updatePage(currentPageIndex, (page) => {
                      page.texts = page.texts.filter(tx => tx.id !== editingTextId);
                   });
                } else {
                   updatePage(currentPageIndex, (page) => {
                      const txt = page.texts?.find(tx => tx.id === editingTextId);
                      if (txt) txt.text = editingTextValue;
                   });
                }
                setEditingTextId(null);
             }}"""
code = code.replace(target, replacement)

# 2. Eraser Pixel Eraser fixes
line_filter = """          if (page.lines && eraserSettings.eraseLines) {
             page.lines = page.lines.filter(line => {
                if (eraserSettings.eraseHighlighterOnly && line.tool !== 'highlighter') return true;
                for (let i=0; i<line.points.length; i+=2) {
                   const dx = line.points[i] - pos.x;
                   const dy = line.points[i+1] - pos.y;
                   if (dx*dx + dy*dy < eraserRadius*eraserRadius) return false;
                }
                return true;
             });
          }
"""
code = code.replace(line_filter, '')

down_return_target = """           if (page.stickers) {
              page.stickers = page.stickers.filter(st => {
                 if (pos.x >= st.x - eraserRadius && pos.x <= st.x + 150 + eraserRadius && pos.y >= st.y - eraserRadius && pos.y <= st.y + 150 + eraserRadius) return false;
                 return true;
              });
           }
        });
        return;
     }
     
     pushHistory();"""
down_return_replacement = """           if (page.stickers) {
              page.stickers = page.stickers.filter(st => {
                 if (pos.x >= st.x - eraserRadius && pos.x <= st.x + 150 + eraserRadius && pos.y >= st.y - eraserRadius && pos.y <= st.y + 150 + eraserRadius) return false;
                 return true;
              });
           }
        });
        // Do not return here
     }
     
     pushHistory();"""
code = code.replace(down_return_target, down_return_replacement)

move_return_target = """            if (page.stickers) {
               page.stickers = page.stickers.filter(st => {
                  if (pos.x >= st.x - eraserRadius && pos.x <= st.x + 150 + eraserRadius && pos.y >= st.y - eraserRadius && pos.y <= st.y + 150 + eraserRadius) return false;
                  return true;
               });
            }
         });
         return;
      }
      
      if (tool === 'laser') {"""
move_return_replacement = """            if (page.stickers) {
               page.stickers = page.stickers.filter(st => {
                  if (pos.x >= st.x - eraserRadius && pos.x <= st.x + 150 + eraserRadius && pos.y >= st.y - eraserRadius && pos.y <= st.y + 150 + eraserRadius) return false;
                  return true;
               });
            }
         });
         // Do not return here
      }
      
      if (tool === 'laser') {"""
code = code.replace(move_return_target, move_return_replacement)

code = code.replace("['pen', 'pencil', 'fountain-pen', 'marker', 'highlighter'].includes(tool)", "['pen', 'pencil', 'fountain-pen', 'marker', 'highlighter', 'eraser'].includes(tool)")
code = code.replace("['pen', 'fountain-pen', 'marker', 'pencil', 'highlighter', 'shape'].includes(tool)", "['pen', 'marker', 'pencil', 'highlighter', 'shape'].includes(tool)")

# 3. Fountain Pen removal
code = code.replace("{ id: 'fountain-pen', icon: PenTool, title: 'ปากกาหมึกซึม' },", "")

# 4. Color Picker
color_target = """{['#EF4444', '#F97316', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#111827', '#ffffff'].map(c => (
                             <div 
                               key={c} 
                               onClick={() => setPenColor(c)} 
                               style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: penColor === c ? '2px solid #3B82F6' : '2px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} 
                             />
                          ))}
                       </div>"""
color_replacement = """{['#EF4444', '#F97316', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#111827', '#ffffff'].map(c => (
                             <div 
                               key={c} 
                               onClick={() => setPenColor(c)} 
                               style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: penColor === c ? '2px solid #3B82F6' : '2px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }} 
                             />
                          ))}
                          <label style={{ width: 24, height: 24, borderRadius: '50%', background: penColor, border: '2px solid #E5E7EB', display: 'inline-block', cursor: 'pointer', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                            <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} style={{ opacity: 0, position: 'absolute', top: -10, left: -10, width: 50, height: 50, cursor: 'pointer' }} />
                          </label>
                       </div>"""
code = code.replace(color_target, color_replacement)

# 5. Audio Bottom HUD
audio_render_target = """              {currentPage.stickers && currentPage.stickers.map(st => {
                if (st.audioUrl) {
                  // Audio Sticker
                  return (
                    <Group 
                      key={st.id}
                      id={st.id}
                      name="object"
                      onClick={() => {
                         if (tool === 'pan' || tool === 'lasso') selectShape(st.id);
                         else playAudioSticker(currentPageIndex, st.id, st.audioUrl);
                      }}
                      onTap={() => {
                         if (tool === 'pan' || tool === 'lasso') selectShape(st.id);
                         else playAudioSticker(currentPageIndex, st.id, st.audioUrl);
                      }}
                    >
                      <Rect width={130} height={44} fill={st.isPlaying ? '#10B981' : 'white'} cornerRadius={22} shadowColor="rgba(0,0,0,0.1)" shadowBlur={8} shadowOffsetY={3} stroke="#F3F4F6" strokeWidth={1} />
                      <Circle radius={16} x={22} y={22} fill={st.isPlaying ? 'rgba(255,255,255,0.2)' : '#E0F2FE'} />
                      <Text text="🎤" fontSize={16} x={14} y={14} fill={st.isPlaying ? 'white' : '#0284C7'} />
                      <Text text={st.isPlaying ? "กำลังเล่น..." : "เล่นเสียง"} fontSize={14} x={48} y={15} fill={st.isPlaying ? 'white' : '#4B5563'} fontFamily="Kanit, sans-serif" fontWeight={500} />
                    </Group>
                  );
                }"""
audio_render_replacement = """              {currentPage.stickers && currentPage.stickers.map(st => {
                if (st.audioUrl) return null; // Audio tracks are rendered in the bottom HUD"""
code = code.replace(audio_render_target, audio_render_replacement)

hud_target = """      {/* End flex-1 Canvas Container */}"""
hud_replacement = """      {/* Audio Playback HUD */}
      {(() => {
         const audios = currentPage.stickers?.filter(s => s.audioUrl);
         if (!audios || audios.length === 0) return null;
         
         return (
            <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', padding: '12px 20px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.05)' }}>
               {audios.map((st, i) => (
                  <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => playAudioSticker(currentPageIndex, st.id, st.audioUrl)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: st.isPlaying ? '#10B981' : '#F3F4F6', color: st.isPlaying ? 'white' : '#111827', border: 'none', padding: '8px 16px', borderRadius: 100, cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }}>
                         <span style={{ fontSize: 16 }}>🎤</span> {st.isPlaying ? "กำลังเล่น..." : `เสียงบันทึก ${i+1}`}
                      </button>
                      <button onClick={() => {
                          if (window.confirm('ต้องการลบเสียงบันทึกนี้หรือไม่?')) {
                             updatePage(currentPageIndex, (page) => {
                                page.stickers = page.stickers.filter(s => s.id !== st.id);
                             });
                          }
                      }} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }} title="ลบเสียงบันทึก">
                          ✕
                      </button>
                  </div>
               ))}
            </div>
         );
      })()}
      
      {/* End flex-1 Canvas Container */}"""
code = code.replace(hud_target, hud_replacement)

# 6. Sticky Note Editing Fix
sticker_event_target = """                  onDblClick={(e) => { e.cancelBubble = true; setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); }}
                  onTap={(e) => { e.cancelBubble = true; setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); }}"""
sticker_event_replacement = """                  onClick={(e) => { e.cancelBubble = true; if (tool === 'pan' || tool === 'sticker') { setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); } }}
                  onTap={(e) => { e.cancelBubble = true; if (tool === 'pan' || tool === 'sticker') { setEditingStickerId(st.id); setEditingStickerValue(st.text || ''); } }}"""
code = code.replace(sticker_event_target, sticker_event_replacement)

# Insert sticker textarea overlay
sticker_textarea = """      {/* Floating Textarea for Sticky Notes */}
      {(() => {
         if (!editingStickerId) return null;
         const st = currentPage.stickers?.find(s => s.id === editingStickerId);
         if (!st || st.audioUrl) return null;
         
         const absoluteX = (st.x + pageX) * scale + position.x;
         const absoluteY = (st.y + pageY) * scale + position.y;
         
         return (
           <div style={{ position: 'absolute', top: absoluteY, left: absoluteX, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
             <textarea
               autoFocus
               placeholder="พิมพ์ข้อความที่นี่..."
               value={editingStickerValue}
               onChange={(e) => setEditingStickerValue(e.target.value)}
               onBlur={() => {
                  updatePage(currentPageIndex, (page) => {
                     const sticker = page.stickers?.find(s => s.id === editingStickerId);
                     if (sticker) sticker.text = editingStickerValue;
                  });
                  setEditingStickerId(null);
               }}
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
                  borderRadius: st.style === 'round' ? 16 * scale : 2 * scale,
               }}
             />
             <button onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={() => {
                 updatePage(currentPageIndex, (page) => {
                    page.stickers = page.stickers.filter(s => s.id !== editingStickerId);
                 });
                 setEditingStickerId(null);
             }} style={{ background: '#EF4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start', fontSize: 13, boxShadow: '0 2px 8px rgba(239,68,68,0.2)' }}>
                ลบสติกเกอร์
             </button>
           </div>
         );
      })()}
"""
code = code.replace("      {/* Crop Modal Overlay */}", sticker_textarea + "      {/* Crop Modal Overlay */}")

with open('src/pages/reading/components/ProNotebook.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
print('Done!')
