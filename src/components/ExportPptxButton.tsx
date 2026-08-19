'use client'

import { useState } from 'react'
import { exportPresentationToPptx } from '@/utils/exportPptx'
import { DownloadIcon } from '@/components/icons'

interface ExportPptxButtonProps {
  // Fallback source: the presentation's storage URL, used directly (via the
  // proxy-html route) when there's no live in-editor state to flush first.
  deckUrl?: string
  title: string
  slideCount: number
  // Called right before capture starts. If it resolves with an HTML string
  // (the deck viewer's just-flushed edits), that's exported directly instead
  // of deckUrl - reading back from storage right after a save would race the
  // save's own revalidation and could silently export a stale version.
  beforeExport?: () => Promise<string | void>
  className?: string
  style?: React.CSSProperties
  iconOnly?: boolean
}

export default function ExportPptxButton({ deckUrl, title, slideCount, beforeExport, className, style, iconOnly }: ExportPptxButtonProps) {
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  const handleClick = async () => {
    if (status === 'working') return
    setStatus('working')
    try {
      const flushedHtml = beforeExport ? await beforeExport() : undefined
      if (flushedHtml) {
        await exportPresentationToPptx({ html: flushedHtml, title, slideCount })
      } else if (deckUrl) {
        await exportPresentationToPptx({ deckUrl, title, slideCount })
      } else {
        throw new Error('No presentation content available to export')
      }
      setStatus('idle')
    } catch (err) {
      console.error('PPTX export failed:', err)
      setStatus('error')
    }
  }

  const tooltip = status === 'error' ? 'Export failed - click to retry' : 'Download as PowerPoint'

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'working'}
        className={className || 'btn btn-secondary'}
        style={{
          width: '36px',
          height: '36px',
          padding: 0,
          color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)',
          borderColor: 'transparent',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: status === 'working' ? 0.5 : 1,
          ...style,
        }}
        title={tooltip}
        aria-label={tooltip}
        onMouseEnter={(e) => {
          if (status !== 'error') e.currentTarget.style.color = 'var(--text-primary)'
          e.currentTarget.style.background = 'var(--bg-surface-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = status === 'error' ? 'var(--danger)' : 'var(--text-muted)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <DownloadIcon size={16} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'working'}
      className={className || 'btn btn-secondary'}
      style={style}
      title={tooltip}
    >
      {status === 'working' ? 'Exporting…' : status === 'error' ? 'Retry Export' : 'Download PPT'}
    </button>
  )
}
