import { useEffect } from 'react'

const AUTO_CLOSE_MS = {
  success: 6000,
  info: 8000,
  error: 12000,
}

export default function GlobalToast({ feedback, onClose }) {
  const message = String(feedback?.message ?? '').trim()
  const type = feedback?.type || 'info'

  useEffect(() => {
    if (!message || typeof onClose !== 'function') return undefined

    const timeoutId = window.setTimeout(() => {
      onClose()
    }, AUTO_CLOSE_MS[type] ?? AUTO_CLOSE_MS.info)

    return () => window.clearTimeout(timeoutId)
  }, [message, type])

  if (!message) return null

  return (
    <div
      className={`global-toast global-toast-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="global-toast-content">
        <span className="global-toast-icon" aria-hidden="true">
          {type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}
        </span>
        <p>{message}</p>
      </div>
      <button
        type="button"
        className="global-toast-close"
        onClick={onClose}
        aria-label="Fechar mensagem"
      >
        ×
      </button>
    </div>
  )
}
