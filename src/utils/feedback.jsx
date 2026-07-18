import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import toast from "react-hot-toast"

export function notifySuccess(message) {
  toast.success(message)
}

export function notifyError(message) {
  toast.error(message)
}

function ConfirmDialog({ title, message, confirmText, cancelText, danger, onResolve }) {
  const [visible, setVisible] = useState(false)

  const handleClose = (value) => {
    setVisible(false)
    setTimeout(() => {
      onResolve(value)
    }, 200) // matches transition duration
  }

  useEffect(() => {
    // Animate in
    const raf = requestAnimationFrame(() => setVisible(true))
    
    // Bind Escape key
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999999,
        pointerEvents: "all",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.2s ease-in-out",
        fontFamily: "'Prompt', sans-serif"
      }}
      onClick={() => handleClose(false)}
    >
      <div
        style={{
          width: 380,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--card)",
          color: "var(--text)",
          border: ".5px solid var(--br2)",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,.28)",
          padding: 20,
          transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
          transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
          opacity: visible ? 1 : 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: danger ? "rgba(224,85,85,.12)" : "var(--teal-bg)",
              color: danger ? "#e05555" : "var(--teal)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              fontSize: 16
            }}
          >
            <i className={`ti ${danger ? "ti-alert-triangle" : "ti-help-circle"}`}></i>
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>{message}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button
            className="btn btn-outline"
            onClick={() => handleClose(false)}
            style={{ padding: "8px 16px", borderRadius: 20 }}
          >
            {cancelText}
          </button>
          <button
            className={danger ? "btn" : "btn btn-teal"}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              ...(danger ? {
                background: "#e05555",
                color: "#fff",
                border: "none"
              } : {})
            }}
            onClick={() => handleClose(true)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}


function PromptDialog({ title, message, placeholder, confirmText, cancelText, onResolve }) {
  const [value, setValue] = useState("")
  const [visible, setVisible] = useState(false)

  const handleClose = (result) => {
    setVisible(false)
    setTimeout(() => onResolve(result), 200)
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    const handleKeyDown = (event) => {
      if (event.key === "Escape") handleClose(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999999, opacity: visible ? 1 : 0, transition: "opacity 0.2s ease-in-out", fontFamily: "'Prompt', sans-serif" }}
      onClick={() => handleClose(null)}
    >
      <form
        style={{ width: 380, maxWidth: "calc(100vw - 32px)", background: "var(--card)", color: "var(--text)", border: ".5px solid var(--br2)", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,.28)", padding: 20, transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)", transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        onClick={event => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = value.trim()
          if (trimmed) handleClose(trimmed)
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
        {message && <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6, marginBottom: 14 }}>{message}</div>}
        <input autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder={placeholder} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-outline" onClick={() => handleClose(null)} style={{ padding: "8px 16px", borderRadius: 20 }}>{cancelText}</button>
          <button type="submit" className="btn btn-teal" style={{ padding: "8px 16px", borderRadius: 20 }}>{confirmText}</button>
        </div>
      </form>
    </div>
  )
}

export function confirmAction(options = {}) {
  const {
  title = "ยืนยันการดำเนินการ",
  message = "ต้องการดำเนินการต่อใช่ไหม?",
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  danger = false,
} = typeof options === "string" ? { message: options } : options
  return new Promise(resolve => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    function cleanup(value) {
      root.unmount()
      container.remove()
      resolve(value)
    }

    root.render(
      <ConfirmDialog
        title={title}
        message={message}
        confirmText={confirmText}
        cancelText={cancelText}
        danger={danger}
        onResolve={cleanup}
      />
    )
  })
}


export function promptAction({
  title = "Enter a value",
  message = "",
  placeholder = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
} = {}) {
  return new Promise(resolve => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    function cleanup(value) {
      root.unmount()
      container.remove()
      resolve(value)
    }

    root.render(
      <PromptDialog
        title={title}
        message={message}
        placeholder={placeholder}
        confirmText={confirmText}
        cancelText={cancelText}
        onResolve={cleanup}
      />
    )
  })
}
