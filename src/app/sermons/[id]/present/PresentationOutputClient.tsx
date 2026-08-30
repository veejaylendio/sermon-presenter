'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildDeckSrc } from '@/utils/deckSrc'

interface Props {
  presentationId: string
  presentationUrl: string
  initialSlideCount: number
}

// The dedicated Presentation output window. Split out of PresentationViewerClient
// (the Main Editor) so Present no longer fullscreens/replaces the editor itself -
// see that file's openPresentationWindow, which opens this route in a separate
// popup instead of calling what used to be presentInPlace() on its own window.
export default function PresentationOutputClient({ presentationId, presentationUrl, initialSlideCount }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [slideCount, setSlideCount] = useState(initialSlideCount)
  // A paired Controller window drives navigation instead - set once at open
  // time via a query param (see openPresentationWindow) rather than any
  // runtime handshake between the two windows.
  const [hasController] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('controller') === '1'
  )
  // Tracks the slide index to re-apply after a deck-updated srcdoc swap
  // reloads the iframe (which otherwise always boots back to slide 0) -
  // a ref since it's read from an iframe onLoad handler, not a render.
  const currentSlideIndexRef = useRef(0)
  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex
  }, [currentSlideIndex])

  const deckSrc = buildDeckSrc(presentationUrl, 'present')

  const postToDeck = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  // Relocated from PresentationViewerClient's old presentInPlace, unmodified
  // in substance - requestFullscreen() is the same Fullscreen API call, just
  // without the {screen} targeting variant, since that existed only to project
  // fullscreen onto a *different* screen than the calling window's own one; this
  // window is already opened positioned on the intended screen (see
  // windowFeaturesForScreen in openPresentationWindow/openControllerWindow), so
  // a plain same-screen request already lands in the right place. A popup can't
  // be fullscreened by anything other than a real gesture inside itself (Chrome
  // blocks cross-window-triggered fullscreen as an anti-spoofing measure), so
  // the auto-attempt on mount below will typically no-op (caught) until the
  // presenter clicks the "Start Presenting" affordance rendered while !isFullscreen.
  const enterFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    el.requestFullscreen().catch(() => {})
  }, [])

  useEffect(() => {
    enterFullscreen()
  }, [enterFullscreen])

  // Pressing Esc (or any other way of leaving fullscreen) just drops back to
  // showing the "Start Presenting" affordance - there's no "edit mode" to fall
  // back to in this dedicated window, unlike the old in-place presenInPlace flow.
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Live sync + Controller pairing, all over the one shared
  // sermon-presenter:<presentationId> BroadcastChannel already used elsewhere
  // (PresentationViewerClient's broadcastLive, PresenterControllerClient).
  useEffect(() => {
    const channel = new BroadcastChannel(`sermon-presenter:${presentationId}`)
    channel.onmessage = (e) => {
      const data = e.data
      if (!data || typeof data.type !== 'string') return
      if (data.type === 'deck-updated' && typeof data.html === 'string') {
        if (typeof data.slideCount === 'number') setSlideCount(data.slideCount)
        const iframe = iframeRef.current
        if (iframe) iframe.srcdoc = data.html
      } else if (data.type === 'set-slide' && typeof data.index === 'number') {
        postToDeck({ action: 'set-slide', index: data.index })
        setCurrentSlideIndex(data.index)
      } else if (data.type === 'close-presentation') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        window.close()
      } else if (
        data.type === 'sp-command' ||
        data.type === 'sp-format-set' ||
        data.type === 'sp-format-live' ||
        data.type === 'sp-format-begin' ||
        data.type === 'sp-format-end'
      ) {
        // Relayed verbatim from the Main Editor's toolbar - the deck already
        // understands these exact message shapes (see slideTemplates.ts),
        // since this iframe runs the identical shared runtime.
        postToDeck(data)
      }
    }
    channelRef.current = channel
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [presentationId, postToDeck])

  // The deck's own internal navigation (keyboard/wheel/touch nav firing
  // inside this fullscreened iframe, or clicks on the dock below) - adopted
  // here and re-broadcast so a paired Controller's display stays in step,
  // mirroring what the old in-place flow did for the Main Editor.
  const handleDeckMessage = useCallback((e: MessageEvent) => {
    if (e.source !== iframeRef.current?.contentWindow) return
    if (!e.data || typeof e.data.type !== 'string') return
    if (e.data.type === 'slide-changed' && typeof e.data.index === 'number') {
      setCurrentSlideIndex(e.data.index)
      channelRef.current?.postMessage({ type: 'set-slide', index: e.data.index })
    } else if (e.data.type === 'slide-count-changed' && typeof e.data.count === 'number') {
      setSlideCount(e.data.count)
    }
  }, [])
  useEffect(() => {
    window.addEventListener('message', handleDeckMessage)
    return () => window.removeEventListener('message', handleDeckMessage)
  }, [handleDeckMessage])

  const navigateSlide = useCallback((dir: 'next' | 'prev') => {
    const nextIdx = dir === 'next'
      ? Math.min(slideCount - 1, currentSlideIndex + 1)
      : Math.max(0, currentSlideIndex - 1)
    postToDeck({ action: dir, type: 'set-slide', index: nextIdx })
    setCurrentSlideIndex(nextIdx)
    channelRef.current?.postMessage({ type: 'set-slide', index: nextIdx })
  }, [slideCount, currentSlideIndex, postToDeck])

  // Re-applies the slide the presenter was actually on after a deck-updated
  // srcdoc swap reloads the iframe from scratch (which otherwise always boots
  // back to slide 0) - a plain src-based load (the very first one) doesn't
  // need this, since it already starts at slide 0 and currentSlideIndex is 0.
  const handleIframeLoad = useCallback(() => {
    if (currentSlideIndexRef.current > 0) {
      postToDeck({ action: 'set-slide', index: currentSlideIndexRef.current })
    }
  }, [postToDeck])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        background: '#000',
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        src={deckSrc}
        onLoad={handleIframeLoad}
        title="Sermon Presentation"
        style={{ width: '100%', height: '100%', border: 'none', background: '#000' }}
      />

      {!isFullscreen && (
        <button
          onClick={enterFullscreen}
          className="presenter-control-btn presenter-control-btn-primary presenter-start-overlay"
        >
          ▶ Start Presenting (Fullscreen)
        </button>
      )}

      {!hasController && (
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
        </div>
      )}
    </div>
  )
}
