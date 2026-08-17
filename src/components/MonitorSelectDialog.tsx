'use client'

import { useState } from 'react'

interface MonitorSelectDialogProps {
  screens: ScreenDetailed[]
  onConfirm: (screen: ScreenDetailed) => void
  onCancel: () => void
}

export default function MonitorSelectDialog({ screens, onConfirm, onCancel }: MonitorSelectDialogProps) {
  // Default to a screen other than the one showing this dialog, if we can
  // tell - the presenter almost always wants to send slides to the *other*
  // display, not the one they're sitting at.
  const defaultIndex = screens.findIndex((s) => !s.isPrimary)
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex >= 0 ? defaultIndex : 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select presentation monitor"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
      }}
      onClick={onCancel}
    >
      <div
        className="glass"
        style={{ width: '420px', maxWidth: '90vw', padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          Select presentation monitor
        </h2>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Multiple displays detected. Choose which one shows the slides — the presenter controller
          will open on your default monitor.
        </p>

        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          style={{
            width: '100%',
            padding: '0.65rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface-solid)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          {screens.map((screen, i) => (
            <option key={i} value={i}>
              {screen.label || `Display ${i + 1}`} — {screen.width}×{screen.height}
              {screen.isPrimary ? ' (Primary)' : ''}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="presenter-control-btn presenter-control-btn-primary"
            onClick={() => onConfirm(screens[selectedIndex])}
          >
            Start Presenting
          </button>
        </div>
      </div>
    </div>
  )
}
