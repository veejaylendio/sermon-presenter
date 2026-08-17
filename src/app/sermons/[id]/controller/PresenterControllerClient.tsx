'use client'

import { useEffect, useRef, useState } from 'react'
import { buildDeckSrc } from '@/utils/deckSrc'

interface SlideRef {
  id: string
}

interface Props {
  sermonId: string
  presentationId: string
  presentationUrl: string
  slides: SlideRef[]
}

function formatClock(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const DEFAULT_THUMB = 140

function RestartIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}
function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
  )
}
function PauseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
  )
}
function CloseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function ChevronLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
  )
}
function ChevronRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
  )
}

export default function PresenterControllerClient({ presentationId, presentationUrl, slides }: Props) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [slideCount, setSlideCount] = useState(slides.length)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const bcRef = useRef<BroadcastChannel | null>(null)
  const mainPreviewRef = useRef<HTMLIFrameElement>(null)
  const stripScrollRef = useRef<HTMLDivElement>(null)

  const deckSrc = buildDeckSrc(presentationUrl, 'present')

  // Cross-window sync: broadcast every navigation to the output window, and
  // keep our own main-preview iframe (a separate deck instance) in step. Also
  // listen for 'set-slide' echoes coming the other way - the output window's
  // deck can advance on its own (e.g. keyboard focus landing in its
  // fullscreened iframe) and forwards that over this same channel, so this
  // side needs to adopt it too. setCurrentSlideIndex bails out on a same-value
  // update, so an echo of a change *we* originated is a harmless no-op rather
  // than a feedback loop.
  useEffect(() => {
    const channel = new BroadcastChannel(`sermon-presenter:${presentationId}`)
    channel.onmessage = (e) => {
      if (!e.data || typeof e.data.type !== 'string') return
      if (e.data.type === 'set-slide' && typeof e.data.index === 'number') {
        setCurrentSlideIndex(e.data.index)
      }
    }
    bcRef.current = channel
    return () => channel.close()
  }, [presentationId])

  useEffect(() => {
    bcRef.current?.postMessage({ type: 'set-slide', index: currentSlideIndex })
    mainPreviewRef.current?.contentWindow?.postMessage({ action: 'set-slide', index: currentSlideIndex }, '*')
  }, [currentSlideIndex])

  // Trust slide-count-changed AND slide-changed echoes from the main preview
  // iframe (guarded by the e.source check below) - the thumbnail strip
  // iframes also echo back the index we just froze them on, but those come
  // from different iframe sources and are filtered out by that same check.
  // slide-changed needs to be adopted here too: the main preview is a live
  // deck instance with its own internal keyboard/wheel/touch nav, so if focus
  // lands inside it directly, the slide can advance there without ever going
  // through this component's own setCurrentSlideIndex - and without adopting
  // it, that change would never get broadcast onward to the output window.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== mainPreviewRef.current?.contentWindow) return
      if (!e.data || typeof e.data.type !== 'string') return
      if (e.data.type === 'slide-count-changed' && typeof e.data.count === 'number') {
        setSlideCount(e.data.count)
      } else if (e.data.type === 'slide-changed' && typeof e.data.index === 'number') {
        setCurrentSlideIndex(e.data.index)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Keep the active thumbnail in view as navigation moves it outside the
  // strip's visible viewport - centered when it needs to move at all, so
  // manual scrolling (which never touches currentSlideIndex) is undisturbed.
  useEffect(() => {
    const container = stripScrollRef.current
    const active = container?.children[currentSlideIndex] as HTMLElement | undefined
    if (!container || !active) return

    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const isFullyVisible = activeRect.left >= containerRect.left && activeRect.right <= containerRect.right
    if (isFullyVisible) return

    const activeCenter = active.offsetLeft + active.offsetWidth / 2
    container.scrollTo({ left: activeCenter - container.clientWidth / 2, behavior: 'smooth' })
  }, [currentSlideIndex])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setCurrentSlideIndex((i) => Math.min(slideCount - 1, i + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentSlideIndex((i) => Math.max(0, i - 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [slideCount])

  useEffect(() => {
    if (isPaused) return
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [isPaused])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const scrollStrip = (dir: 1 | -1) => {
    const el = stripScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const endPresentation = () => {
    bcRef.current?.postMessage({ type: 'close-presentation' })
    window.close()
  }

  return (
    <div className="pc-root">
      <div className="pc-topbar">
        <div className="pc-topbar-left">
          <span className="pc-clock">{formatClock(now)}</span>
          <span className="pc-timer">{formatElapsed(elapsedSeconds)}</span>
          <button className="pc-icon-btn" onClick={() => setElapsedSeconds(0)} title="Restart timer" aria-label="Restart timer">
            <RestartIcon />
          </button>
          <button
            className="pc-icon-btn"
            onClick={() => setIsPaused((p) => !p)}
            title={isPaused ? 'Resume timer' : 'Pause timer'}
            aria-label={isPaused ? 'Resume timer' : 'Pause timer'}
          >
            {isPaused ? <PlayIcon /> : <PauseIcon />}
          </button>
        </div>
        <div className="pc-topbar-right">
          <button className="pc-icon-btn pc-close-btn" onClick={() => endPresentation()} title="End presentation" aria-label="End presentation">
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="pc-main-preview">
        <iframe ref={mainPreviewRef} src={deckSrc} title="Current slide" />
      </div>

      <div className="pc-strip">
        <button className="pc-icon-btn pc-strip-edge-btn" onClick={() => scrollStrip(-1)} aria-label="Scroll thumbnails left">
          <ChevronLeftIcon />
        </button>

        <div className="pc-strip-scroll" ref={stripScrollRef}>
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              className={`pc-thumb${i === currentSlideIndex ? ' is-active' : ''}`}
              style={{ width: DEFAULT_THUMB, height: Math.round((DEFAULT_THUMB * 9) / 16) }}
              onClick={() => setCurrentSlideIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
            >
              <iframe
                src={deckSrc}
                title={`Slide ${i + 1}`}
                tabIndex={-1}
                onLoad={(e) => e.currentTarget.contentWindow?.postMessage({ action: 'set-slide', index: i }, '*')}
              />
            </button>
          ))}
        </div>

        <button className="pc-icon-btn pc-strip-edge-btn" onClick={() => scrollStrip(1)} aria-label="Scroll thumbnails right">
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  )
}
