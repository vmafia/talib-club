import { buildPageRange } from "../utils/pagination.js"

export default function PaginationBar({ currentPage, totalPages, onPageChange, scrollTop = true }) {
  if (!totalPages || totalPages <= 1) return null

  const range = buildPageRange(currentPage, totalPages)

  const go = (page) => {
    onPageChange(page)
    if (scrollTop) window.scrollTo(0, 0)
  }

  return (
    <div className="pagination-container">
      <button
        type="button"
        className={`pagination-btn ${currentPage === 1 ? "disabled" : ""}`}
        disabled={currentPage === 1}
        onClick={() => go(Math.max(1, currentPage - 1))}
      >
        ก่อนหน้า
      </button>
      {range.map((p, idx) => {
        const prev = range[idx - 1]
        const showGap = prev && p - prev > 1
        return (
          <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {showGap && <span className="pagination-ellipsis" aria-hidden>…</span>}
            <button
              type="button"
              className={`pagination-btn pagination-num ${currentPage === p ? "active" : ""}`}
              onClick={() => go(p)}
            >
              {p}
            </button>
          </span>
        )
      })}
      <button
        type="button"
        className={`pagination-btn ${currentPage === totalPages ? "disabled" : ""}`}
        disabled={currentPage === totalPages}
        onClick={() => go(Math.min(totalPages, currentPage + 1))}
      >
        ถัดไป
      </button>
    </div>
  )
}
