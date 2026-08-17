'use client'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { saveDeckHtml } from '../../actions'

interface SlideItem {
  id: string
  order_index: number
  content: string
}

interface Props {
  presentationId: string
  presentationUrl: string
  slides: SlideItem[]
}

type Mode = 'edit' | 'present'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function PresentationViewerClient({ presentationId, presentationUrl, slides }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mode, setMode] = useState<Mode>('edit')
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [slideCount, setSlideCount] = useState(slides.length)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const containerRef = useRef<HTMLDivElement>(null)

  // Deck loads in Edit Mode by default. Recomputed only when presentationUrl
  // itself changes (a different sermon, or a fresh generation of the same one)
  // — NOT on mode switches, which go through postMessage instead (see
  // handlePresent / handleExitToEdit) so an in-flight text edit isn't discarded
  // by a reload. Using useMemo (not a lazy useState initializer) matters here:
  // if React reuses this component instance across a client-side navigation to
  // a different sermon's /view page, a useState initializer would never rerun
  // and the iframe would keep showing the previous sermon's deck.
  const iframeSrc = useMemo(() => {
    const proxied = presentationUrl.startsWith('http')
      ? `/api/proxy-html?url=${encodeURIComponent(presentationUrl)}`
      : presentationUrl
    const sep = proxied.includes('?') ? '&' : '?'
    return `${proxied}${sep}editorMode=edit`
  }, [presentationUrl])

  // The deck can add/delete/reorder slides client-side (in-iframe editor), so the
  // count can grow or shrink past the initial server-provided `slides` prop. Resync
  // during render (rather than in an effect) if the prop itself changes, e.g.
  // navigating to a different sermon while this component instance persists.
  const [slidesForCount, setSlidesForCount] = useState(slides)
  if (slides !== slidesForCount) {
    setSlidesForCount(slides)
    setSlideCount(slides.length)
  }

  const navigateSlide = useCallback((dir: 'next' | 'prev') => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return

    try {
      const win = iframeRef.current.contentWindow
      if (dir === 'next') {
        const nextIdx = Math.min(slideCount - 1, currentSlideIndex + 1)
        win.postMessage({ action: 'next', type: 'set-slide', index: nextIdx }, '*')
        setCurrentSlideIndex(nextIdx)
      } else {
        const prevIdx = Math.max(0, currentSlideIndex - 1)
        win.postMessage({ action: 'prev', type: 'set-slide', index: prevIdx }, '*')
        setCurrentSlideIndex(prevIdx)
      }
    } catch (e) {
      console.error('Frame navigation error:', e)
    }
  }, [slideCount, currentSlideIndex])

  // Debounced, race-safe save: only one saveDeckHtml call is ever in flight. If a
  // new request-save arrives while one is running, its payload (always the latest
  // full DOM state, not a diff) is queued and fired the moment the in-flight call
  // resolves — so a slow write can never land after and overwrite a newer one.
  const savingRef = useRef(false)
  const queuedHtmlRef = useRef<string | null>(null)

  // A while-loop (not self-recursion) so React Compiler can memoize this
  // normally — a useCallback that calls itself defeats static memoization
  // analysis even though it's safe at runtime.
  const flushSave = useCallback(async (html: string) => {
    savingRef.current = true
    setSaveStatus('saving')
    let payload = html
    while (true) {
      try {
        await saveDeckHtml(presentationId, payload)
        setSaveStatus('saved')
      } catch (e) {
        console.error('Deck save failed:', e)
        setSaveStatus('error')
      }
      if (queuedHtmlRef.current === null) break
      payload = queuedHtmlRef.current
      queuedHtmlRef.current = null
    }
    savingRef.current = false
  }, [presentationId])

  const requestSave = useCallback((html: string) => {
    if (savingRef.current) {
      queuedHtmlRef.current = html
      return
    }
    flushSave(html)
  }, [flushSave])

  // Listen for iframe postMessages & window keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only hijack arrow/space navigation while actually presenting — in Edit
      // Mode these keys are likely being used inside a contentEditable field or
      // a toolbar input.
      if (mode !== 'present') return
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        navigateSlide('next')
      } else if (e.key === 'ArrowLeft') {
        navigateSlide('prev')
      }
    }

    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data.type !== 'string') return
      if (e.data.type === 'slide-changed' && typeof e.data.index === 'number') {
        setCurrentSlideIndex(e.data.index)
      } else if (e.data.type === 'slide-count-changed' && typeof e.data.count === 'number') {
        setSlideCount(e.data.count)
      } else if (e.data.type === 'request-save' && typeof e.data.html === 'string') {
        requestSave(e.data.html)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('message', handleMessage)
    }
  }, [navigateSlide, mode, requestSave])

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`)
      })
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const postToDeck = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }

  const handlePresent = () => {
    setMode('present')
    postToDeck({ type: 'set-mode', mode: 'present' })
  }

  const handleExitToEdit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
    setMode('edit')
    postToDeck({ type: 'set-mode', mode: 'edit' })
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: '#000'
      }}
    >
      {/* Deck Iframe */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Sermon Presentation"
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          minHeight: 0,
          border: 'none',
          background: '#000'
        }}
      />

      {mode === 'edit' ? (
        <div className="editor-topbar">
          <span className={`editor-save-status${saveStatus === 'error' ? ' is-error' : ''}`}>
            {saveStatus === 'saving' && 'Saving…'}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'error' && 'Save failed'}
            {saveStatus === 'idle' && ''}
          </span>
          <button
            onClick={handlePresent}
            className="presenter-control-btn presenter-control-btn-primary"
          >
            Present ▶
          </button>
        </div>
      ) : (
        <div className="presenter-dock">
          <button
            onClick={() => navigateSlide('prev')}
            disabled={currentSlideIndex === 0}
            className="presenter-control-btn presenter-control-btn-secondary"
          >
            ← Prev
          </button>

          <span className="presenter-slide-counter">
            Slide {currentSlideIndex + 1} / {slideCount || 1}
          </span>

          <button
            onClick={() => navigateSlide('next')}
            disabled={currentSlideIndex >= (slideCount ? slideCount - 1 : 0)}
            className="presenter-control-btn presenter-control-btn-primary"
          >
            Next →
          </button>

          <span className="presenter-dock-divider" />

          <button
            onClick={toggleFullscreen}
            className="presenter-control-btn presenter-control-btn-secondary"
          >
            {isFullscreen ? 'Exit Fullscreen ↙' : 'Fullscreen ⛶'}
          </button>

          <span className="presenter-dock-divider" />

          <button
            onClick={handleExitToEdit}
            className="presenter-control-btn presenter-control-btn-secondary"
          >
            ✎ Exit to Edit
          </button>
        </div>
      )}
    </div>
  )
}
