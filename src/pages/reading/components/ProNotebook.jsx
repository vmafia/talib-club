import React from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';

export default function ProNotebook({ bookId, uid }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--br2)', background: 'white' }}>
      <Tldraw persistenceKey={`tldraw-notebook-${uid}-${bookId}`} />
    </div>
  );
}
