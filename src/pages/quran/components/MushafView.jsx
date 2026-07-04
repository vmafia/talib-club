import React from 'react';
import DOMPurify from 'dompurify';
import { useAudioContext } from '../../../context/AudioContext.jsx';
import { stripTajweedTags } from '../utils/quranUtils.js';

export default function MushafView({
  verses,
  arabicSize,
  quranFont,
  isMobile,
  lastRead,
  tajweedEnabled,
  setActiveAyahMenu,
  emptyMessage
}) {
  const { playingAudio } = useAudioContext();

  return (
    <div
      className="mushaf-flow"
      style={{
        fontSize: `${arabicSize}px`,
        fontFamily: quranFont === "UthmanicHafs" ? "'UthmanicHafs', serif" : quranFont === "Amiri" ? "'Amiri', serif" : "'Noto Naskh Arabic', serif",
        color: "var(--text)",
        direction: "rtl",
        textAlign: isMobile ? "right" : "justify",
        lineHeight: 2.3
      }}
    >
      {verses && verses.length > 0 ? (
        verses.map(v => {
          const isBookmarked = Number(lastRead?.sura) === Number(v.sura) && Number(lastRead?.aya) === Number(v.aya);
          const rawText = v.arabic_text_tajweed || v.text || v.arabic_text || "";
          const displayHtml = tajweedEnabled ? rawText : stripTajweedTags(rawText);
          const isActive = Number(playingAudio?.sura) === Number(v.sura) && Number(playingAudio?.aya) === Number(v.aya);
          
          return (
            <span
              key={v.id}
              id={`mushaf-ayah-${v.sura}-${v.aya}`}
              className={isBookmarked ? "mushaf-ayah-bookmarked" : ""}
              style={{
                backgroundColor: isActive ? "rgba(45, 190, 160, 0.25)" : "transparent",
                borderRadius: isActive ? "4px" : "0",
                transition: "background-color 0.3s ease",
                cursor: "pointer"
              }}
              onClick={() => {
                setActiveAyahMenu({
                  sura: v.sura,
                  aya: v.aya,
                  arabicText: v.text || v.arabic_text || "",
                  verse: v
                });
              }}
              title={`แตะเพื่อดูคำแปลและคั่นหน้า [${v.sura}:${v.aya}]`}
            >
              <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayHtml, { ADD_TAGS: ['tajweed'] }) }} />{" "}
            </span>
          );
        })
      ) : (
        emptyMessage ? (
          <div style={{ direction: "ltr", textAlign: "center", fontFamily: "'Prompt', sans-serif", fontSize: 13, color: "var(--t2)", padding: "36px 12px" }}>
            {emptyMessage}
          </div>
        ) : null
      )}
    </div>
  );
}
