// Shared design tokens and static option lists for the notebook (ProNotebook).
// Pure data — no React, no side effects — so it's cheap to import anywhere.

// HarmonyOS / Huawei Notes design tokens
export const HW = {
  accent: '#0A59F7',
  accentSoft: 'rgba(10,89,247,0.10)',
  surface: 'rgba(255,255,255,0.86)',
  blur: 'saturate(180%) blur(30px)',
  hairline: 'rgba(0,0,0,0.06)',
  text: '#181818',
  textDim: '#6B7280',
  shadow: '0 6px 24px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
  radius: 20,
};

export const ZERO_OFFSET = { x: 0, y: 0 };

// Default width of a text box, so alignment and lists have a column to work in.
export const TEXT_BOX_WIDTH = 340;

// Line spacing for text objects. The WYSIWYG editor and the Konva renderer must
// use the same value or the text visibly shifts the moment you stop editing.
// 1.2 (rather than Konva's default 1.0) also stops Thai tone marks and upper
// vowels from colliding with the line above.
export const LINE_HEIGHT = 1.2;

// Sticky-note palette and styles, shared by the tool options and the context menu.
export const STICKY_COLORS = ['#FEF08A', '#FBCFE8', '#BAE6FD', '#BBF7D0', '#FED7AA', '#DDD6FE', '#FECACA', '#A7F3D0'];

export const STICKY_STYLES = [
  { id: 'classic', label: 'คลาสสิก' },
  { id: 'round', label: 'โค้งมน' },
  { id: 'pin', label: 'หมุดปัก' },
  { id: 'tape', label: 'เทปกาว' },
  { id: 'polaroid', label: 'โพลารอยด์' },
  { id: 'bubble', label: 'บับเบิล' },
  { id: 'torn', label: 'ขอบฉีก' },
  { id: 'lined', label: 'มีเส้น' },
];

// Fonts offered in the text tool. Thai handwriting faces (ลายมือ) are loaded from
// Google Fonts in index.html, so the notebook feels closer to real handwriting.
export const FONT_OPTIONS = [
  { value: 'Kanit', label: 'Kanit' },
  { value: 'Prompt', label: 'Prompt' },
  { value: 'Sarabun', label: 'Sarabun' },
  { value: 'Bai Jamjuree', label: 'Bai Jamjuree' },
  { value: 'Itim', label: 'Itim · ลายมือ' },
  { value: 'Mali', label: 'Mali · ลายมือ' },
  { value: 'Sriracha', label: 'Sriracha · ลายมือ' },
  { value: 'Charm', label: 'Charm · ลายมือ' },
  { value: 'Charmonman', label: 'Charmonman · ลายมือ' },
  { value: 'Pattaya', label: 'Pattaya' },
  { value: 'Chonburi', label: 'Chonburi' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
];
