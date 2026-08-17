'use client'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { saveDeckHtml } from '../../actions'
import { buildDeckSrc } from '@/utils/deckSrc'
import { detectScreens, windowFeaturesForScreen, pickControllerScreen } from '@/utils/screenPlacement'
import MonitorSelectDialog from '@/components/MonitorSelectDialog'

interface Props {
  sermonId: string
  sermonTitle: string
  presentationId: string
  presentationUrl: string
  initialSlideCount: number
}

type Mode = 'edit' | 'present'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Structural toolbar button states, mirrored from the deck's own managers
// (see postEditorState in slideTemplates.ts) since those buttons no longer
// live inside the iframe to read that state directly.
interface EditorState {
  isEditActive: boolean
  canUndo: boolean
  canRedo: boolean
  canDeleteSlide: boolean
  addWidgetOpen: boolean
}

interface TextFields {
  fontFamily?: string | null
  fontSize?: number | string | null
  color?: string
  align?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  uppercase?: boolean
}

interface TextFocus {
  kind: string
  fields: TextFields
}

const FONT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Theme font' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Playfair Display", serif', label: 'Playfair Display' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: 'system-ui, sans-serif', label: 'System UI' },
]

const ALIGN_OPTIONS = ['left', 'center', 'right', 'justify'] as const

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}
function AddWidgetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function AddSlideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="12" y1="9" x2="12" y2="15" /><line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  )
}
function DeleteSlideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}
function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}
function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  )
}

export default function PresentationViewerClient({ sermonId, sermonTitle, presentationId, presentationUrl, initialSlideCount }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('edit')
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  // Seeded from the server-fetched slide count (see getPresentationContext) so
  // the dock shows the right total immediately - the deck only pushes
  // slide-count-changed on structural edits (add/delete slide), never on a
  // plain initial load, so without this seed the dock would sit stuck at
  // "X / 1" until the presenter happened to add or delete a slide.
  const [slideCount, setSlideCount] = useState(initialSlideCount)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isLaunching, setIsLaunching] = useState(false)
  // True while a separate presenter-controller popup is open - in that case
  // this window IS the projected output (chrome-free, no dock: the presenter
  // navigates from the controller instead).
  const [hasController, setHasController] = useState(false)
  const [monitorPrompt, setMonitorPrompt] = useState<{
    screens: ScreenDetailed[]
    onConfirm: (screen: ScreenDetailed) => void
    onCancel: () => void
  } | null>(null)
  const controllerChannelRef = useRef<BroadcastChannel | null>(null)
  // Wraps the whole title-bar toolbar (structural buttons + format controls +
  // save/present) - used to tell a genuine "click/Esc outside" apart from the
  // user simply interacting with one of these now-external controls (see the
  // sp-text-blurred handling below).
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [editorState, setEditorState] = useState<EditorState>({
    isEditActive: true,
    canUndo: false,
    canRedo: false,
    canDeleteSlide: initialSlideCount > 1,
    addWidgetOpen: false,
  })
  const [textFocus, setTextFocus] = useState<TextFocus | null>(null)
  // Bumped on every sp-text-focused message and used as a React `key` on the
  // continuous controls (size/color) so they remount with a fresh
  // defaultValue when the user switches text targets, without fighting the
  // user's own typing/dragging by staying controlled in between.
  const [focusToken, setFocusToken] = useState(0)

  // Deck loads in Edit Mode. Recomputed only when sermonId changes (i.e. this
  // component instance got reused for a genuinely different sermon) - NOT on
  // every presentationUrl change. Server Actions (saveDeckHtml's own
  // revalidatePath, including the pre-present flush-save this component
  // triggers) make Next.js automatically hand this component a freshly
  // re-fetched presentationUrl prop once they resolve; recomputing off that
  // directly would reload the iframe out from under an in-flight edit or,
  // worse, right as Present had just told it to switch into present mode -
  // the fullscreen request (on the persistent container, not the iframe)
  // would still succeed, but the reloaded iframe would boot back into
  // editorMode=edit, which is exactly the "fullscreen but still shows the
  // edit toolbar" bug this guards against.
  const [trackedSermonId, setTrackedSermonId] = useState(sermonId)
  const [capturedPresentationUrl, setCapturedPresentationUrl] = useState(presentationUrl)
  if (trackedSermonId !== sermonId) {
    setTrackedSermonId(sermonId)
    setCapturedPresentationUrl(presentationUrl)
  }
  const iframeSrc = useMemo(() => buildDeckSrc(capturedPresentationUrl, 'edit'), [capturedPresentationUrl])

  const postToDeck = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  // Structural toolbar buttons (edit toggle, add widget, add/delete slide,
  // undo/redo) - each just synthesizes a click on the deck's own (now
  // invisible) button, reusing its existing handler/state logic untouched.
  const sendCommand = useCallback((command: string) => {
    postToDeck({ type: 'sp-command', command })
  }, [postToDeck])

  // One-shot format field (font family, alignment) - applies immediately and
  // updates our local mirror so the control reflects it without waiting on a
  // round trip.
  const sendFormatSet = useCallback((key: string, value: unknown) => {
    postToDeck({ type: 'sp-format-set', key, value })
    setTextFocus((tf) => (tf ? { ...tf, fields: { ...tf.fields, [key]: value } } : tf))
  }, [postToDeck])

  const toggleFormat = useCallback((key: keyof TextFields) => {
    setTextFocus((tf) => {
      if (!tf) return tf
      const next = !tf.fields[key]
      postToDeck({ type: 'sp-format-set', key, value: next })
      return { ...tf, fields: { ...tf.fields, [key]: next } }
    })
  }, [postToDeck])

  // Continuous format fields (font size, color) - begin/live/end mirrors the
  // old raw <input>'s focus/input/blur sequence so only the final value gets
  // pushed onto the undo stack, not every keystroke/drag step.
  const sendFormatBegin = useCallback(() => postToDeck({ type: 'sp-format-begin' }), [postToDeck])
  const sendFormatLive = useCallback((key: string, value: unknown) => postToDeck({ type: 'sp-format-live', key, value }), [postToDeck])
  const sendFormatEnd = useCallback(() => postToDeck({ type: 'sp-format-end' }), [postToDeck])

  const navigateSlide = useCallback((dir: 'next' | 'prev') => {
    if (dir === 'next') {
      const nextIdx = Math.min(slideCount - 1, currentSlideIndex + 1)
      postToDeck({ action: 'next', type: 'set-slide', index: nextIdx })
      setCurrentSlideIndex(nextIdx)
    } else {
      const prevIdx = Math.max(0, currentSlideIndex - 1)
      postToDeck({ action: 'prev', type: 'set-slide', index: prevIdx })
      setCurrentSlideIndex(prevIdx)
    }
  }, [slideCount, currentSlideIndex, postToDeck])

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

  // Ends a controller-paired presentation: closes the BroadcastChannel and
  // drops back to the chrome-free-output flag. Called both when the
  // controller tells us to close, and as cleanup when returning to Edit Mode
  // any other way (Esc, etc).
  const teardownController = useCallback(() => {
    controllerChannelRef.current?.close()
    controllerChannelRef.current = null
    setHasController(false)
  }, [])

  const returnToEdit = useCallback(() => {
    setMode('edit')
    postToDeck({ type: 'set-mode', mode: 'edit' })
    teardownController()
  }, [postToDeck, teardownController])

  // Closes the formatting toolbar and tells the deck to blur/deselect
  // whatever's currently being edited (commits the pending edit, removes the
  // contenteditable outline). The mirror case - Escape or a click while focus
  // is still inside the iframe - is handled entirely on the deck side and
  // arrives here as an sp-text-blurred message instead.
  const closeFormatToolbar = useCallback(() => {
    setTextFocus(null)
    postToDeck({ type: 'sp-toolbar-blur' })
  }, [postToDeck])

  // Escape while focus is inside one of the toolbar's own controls (e.g. the
  // user tabbed into the font-size field) - only fires for that case, since
  // keydown events inside the iframe never bubble up to this document.
  useEffect(() => {
    if (!textFocus) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFormatToolbar()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [textFocus, closeFormatToolbar])

  // Listen for iframe postMessages & window keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only hijack arrow/space navigation while actually presenting in-place
      // - in Edit Mode these keys are likely being used inside a
      // contentEditable field or a toolbar input.
      if (mode !== 'present') return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        navigateSlide('next')
      } else if (e.key === 'ArrowLeft') {
        navigateSlide('prev')
      }
    }

    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      if (!e.data || typeof e.data.type !== 'string') return
      if (e.data.type === 'slide-changed' && typeof e.data.index === 'number') {
        setCurrentSlideIndex(e.data.index)
        // Forward to a paired controller (no-op if none is open -
        // controllerChannelRef is null): the deck can advance on its own
        // (e.g. keyboard/wheel/touch nav firing inside this fullscreened
        // iframe), and without this the controller would never learn about
        // it, since it only actively sends 'set-slide', it doesn't poll.
        controllerChannelRef.current?.postMessage({ type: 'set-slide', index: e.data.index })
      } else if (e.data.type === 'slide-count-changed' && typeof e.data.count === 'number') {
        setSlideCount(e.data.count)
      } else if (e.data.type === 'request-save' && typeof e.data.html === 'string') {
        requestSave(e.data.html)
      } else if (e.data.type === 'sp-editor-state') {
        setEditorState({
          isEditActive: !!e.data.isEditActive,
          canUndo: !!e.data.canUndo,
          canRedo: !!e.data.canRedo,
          canDeleteSlide: !!e.data.canDeleteSlide,
          addWidgetOpen: !!e.data.addWidgetOpen,
        })
      } else if (e.data.type === 'sp-text-focused') {
        setTextFocus({ kind: e.data.kind, fields: e.data.fields || {} })
        setFocusToken((t) => t + 1)
      } else if (e.data.type === 'sp-text-blurred') {
        // The click/focus that caused this may just be the user interacting
        // with our own toolbar controls (clicking Bold moves focus out of the
        // iframe's contenteditable, which fires this same blur signal) - by
        // the time this message arrives, a same-document click has already
        // finished moving focus, so checking activeElement here reliably
        // tells the two cases apart.
        if (toolbarRef.current && toolbarRef.current.contains(document.activeElement)) return
        setTextFocus(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('message', handleMessage)
    }
  }, [navigateSlide, mode, requestSave])

  // Pressing Esc is intercepted by the browser itself to exit native
  // fullscreen - there's no separate "Exit Fullscreen"/"Exit to Edit" button
  // to wire up, we just listen for that exit (however it happens: Esc, the
  // OS fullscreen shortcut, etc.) and fall back to Edit Mode automatically.
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && mode === 'present') {
        returnToEdit()
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [mode, returnToEdit])

  // Asks the deck to serialize + save immediately (bypassing its normal 1.5s
  // autosave debounce) and waits for the resulting html. Present must never
  // launch the controller window against a stale save, since it re-fetches
  // the deck from storage rather than sharing this iframe.
  const waitForFlushedHtml = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      let settled = false
      const onMessage = (e: MessageEvent) => {
        if (e.source !== iframeRef.current?.contentWindow) return
        if (e.data?.type === 'request-save' && typeof e.data.html === 'string') {
          settled = true
          window.removeEventListener('message', onMessage)
          resolve(e.data.html)
        }
      }
      window.addEventListener('message', onMessage)
      postToDeck({ action: 'flush-save' })
      setTimeout(() => {
        if (!settled) {
          window.removeEventListener('message', onMessage)
          resolve(null)
        }
      }, 2000)
    })
  }, [postToDeck])

  // Presents in THIS window, fullscreened on the given screen. A popup is
  // never allowed to fullscreen itself (Chrome blocks it outright, as an
  // anti-spoofing measure), so the output is always the window/tab the
  // presenter is already using - requestFullscreen({ screen }) is the
  // Window Management API's own mechanism for sending that fullscreen to a
  // *different* monitor than the one this window currently happens to be on.
  // A null screen (single/unknown-monitor case) falls back to a plain
  // same-screen fullscreen request.
  const presentInPlace = (screen: ScreenDetailed | null) => {
    setMode('present')
    postToDeck({ type: 'set-mode', mode: 'present' })
    const el = containerRef.current
    if (!el) return
    if (screen) {
      el.requestFullscreen({ screen }).catch(() => {
        el.requestFullscreen().catch(() => {})
      })
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }

  // Opens (or refocuses) the presenter-controller popup on the given screen,
  // and wires up the BroadcastChannel it uses to drive this window's slides.
  const openControllerWindow = (controllerScreen: ScreenDetailed | null) => {
    const controllerWin = window.open(
      `/sermons/${sermonId}/controller`,
      'sermon-presenter-controller',
      windowFeaturesForScreen(controllerScreen)
    )
    if (!controllerWin) {
      alert('Please allow popups for this site to show the presenter controller.')
      return
    }
    controllerWin.focus()

    const channel = new BroadcastChannel(`sermon-presenter:${presentationId}`)
    channel.onmessage = (e) => {
      if (!e.data || typeof e.data.type !== 'string') return
      if (e.data.type === 'set-slide' && typeof e.data.index === 'number') {
        postToDeck({ action: 'set-slide', index: e.data.index })
        setCurrentSlideIndex(e.data.index)
      } else if (e.data.type === 'close-presentation') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        returnToEdit()
      }
    }
    controllerChannelRef.current = channel
    setHasController(true)
  }

  const handlePresent = async () => {
    if (isLaunching) return
    setIsLaunching(true)
    try {
      // Screen detection is permission-gated and needs the click's still-fresh
      // user activation, so it must be the very first await here - if it ran
      // after waitForFlushedHtml()'s round trip (previously the case), the
      // browser would silently refuse it with no prompt and no error, and
      // every Present click would quietly fall back to single-monitor
      // behavior (present wherever the window currently is) regardless of
      // how many real monitors are connected.
      const screens = await detectScreens()

      // screen.isExtended is a plain, non-permission-gated boolean - if it
      // says there's more than one display but detectScreens() still came
      // back empty, that's a real signal detection failed (permission not
      // granted, or a transient activation issue) rather than "this machine
      // genuinely only has one monitor."
      if (!screens && typeof window !== 'undefined' && window.screen.isExtended) {
        console.warn(
          'Multiple displays detected (screen.isExtended), but getScreenDetails() returned nothing - the "Window Management" site permission may not be granted, so falling back to presenting on the current monitor.'
        )
      }

      const flushedHtml = await waitForFlushedHtml()
      if (flushedHtml) {
        try {
          setSaveStatus('saving')
          await saveDeckHtml(presentationId, flushedHtml)
          setSaveStatus('saved')
        } catch (e) {
          console.error('Pre-present save failed, presenting last saved version:', e)
          setSaveStatus('error')
        }
      }

      if (screens && screens.length > 1) {
        // Deferred until the dialog's own "Start Presenting" click, which is
        // itself a fresh user gesture.
        setMonitorPrompt({
          screens,
          onConfirm: (outputScreen) => {
            setMonitorPrompt(null)
            presentInPlace(outputScreen)
            // Presenting on the primary/default monitor means the presenter
            // and the audience are looking at the same screen - a separate
            // controller window would just be fighting the fullscreen output
            // for that same screen, so skip it entirely.
            if (!outputScreen.isPrimary) {
              openControllerWindow(pickControllerScreen(screens, outputScreen))
            }
          },
          onCancel: () => setMonitorPrompt(null),
        })
      } else {
        presentInPlace(null)
      }
    } finally {
      setIsLaunching(false)
    }
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
      {mode === 'edit' && (
        <div className="editor-toolbar" ref={toolbarRef}>
          <Link href="/sermons" className="editor-toolbar-back">
            ← Sermons
          </Link>

          <div className="editor-toolbar-divider" />

          <div className="editor-toolbar-group">
            <button
              className={`editor-icon-btn${editorState.isEditActive ? ' is-active' : ''}`}
              onClick={() => sendCommand('toggle-edit')}
              title="Toggle edit mode"
              aria-label="Toggle edit mode"
            >
              <EditIcon />
            </button>
            <button
              className={`editor-icon-btn${editorState.addWidgetOpen ? ' is-active' : ''}`}
              onClick={() => sendCommand('toggle-add-widget')}
              title="Add widget"
              aria-label="Add widget"
            >
              <AddWidgetIcon />
            </button>
            <button
              className="editor-icon-btn"
              onClick={() => sendCommand('add-slide')}
              title="Add slide"
              aria-label="Add slide"
            >
              <AddSlideIcon />
            </button>
            <button
              className="editor-icon-btn"
              onClick={() => sendCommand('delete-slide')}
              disabled={!editorState.canDeleteSlide}
              title="Delete slide"
              aria-label="Delete slide"
            >
              <DeleteSlideIcon />
            </button>
          </div>

          <div className="editor-toolbar-divider" />

          <div className="editor-toolbar-group">
            <button
              className="editor-icon-btn"
              onClick={() => sendCommand('undo')}
              disabled={!editorState.canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <UndoIcon />
            </button>
            <button
              className="editor-icon-btn"
              onClick={() => sendCommand('redo')}
              disabled={!editorState.canRedo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <RedoIcon />
            </button>
          </div>

          <div className="editor-toolbar-divider" />

          {!textFocus && (
            <span className="editor-toolbar-title" title={sermonTitle}>
              {sermonTitle}
            </span>
          )}

          {textFocus && (
          <div className="editor-format-group is-shown">
            <select
              className="editor-select"
              value={textFocus?.fields.fontFamily || ''}
              onChange={(e) => sendFormatSet('fontFamily', e.target.value || null)}
              title="Font"
            >
              {FONT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <input
              key={`size-${focusToken}`}
              className="editor-number"
              type="number"
              min={8}
              max={300}
              defaultValue={textFocus?.fields.fontSize ?? ''}
              onFocus={sendFormatBegin}
              onChange={(e) => sendFormatLive('fontSize', e.target.value)}
              onBlur={sendFormatEnd}
              title="Font size (px)"
            />

            <input
              key={`color-${focusToken}`}
              className="editor-color-input"
              type="color"
              defaultValue={textFocus?.fields.color || '#000000'}
              onFocus={sendFormatBegin}
              onChange={(e) => sendFormatLive('color', e.target.value)}
              onBlur={sendFormatEnd}
              title="Text color"
            />

            <div className="editor-toolbar-divider" />

            <button
              className={`editor-toggle-btn${textFocus?.fields.bold ? ' is-active' : ''}`}
              onClick={() => toggleFormat('bold')}
              title="Bold"
            >
              <b>B</b>
            </button>
            <button
              className={`editor-toggle-btn${textFocus?.fields.italic ? ' is-active' : ''}`}
              onClick={() => toggleFormat('italic')}
              title="Italic"
            >
              <i>I</i>
            </button>
            <button
              className={`editor-toggle-btn${textFocus?.fields.underline ? ' is-active' : ''}`}
              onClick={() => toggleFormat('underline')}
              title="Underline"
            >
              <u>U</u>
            </button>
            <button
              className={`editor-toggle-btn${textFocus?.fields.strikethrough ? ' is-active' : ''}`}
              onClick={() => toggleFormat('strikethrough')}
              title="Strikethrough"
            >
              <s>S</s>
            </button>
            <button
              className={`editor-toggle-btn${textFocus?.fields.uppercase ? ' is-active' : ''}`}
              onClick={() => toggleFormat('uppercase')}
              title="Uppercase"
              style={{ fontSize: '0.68rem' }}
            >
              AA
            </button>

            <div className="editor-toolbar-divider" />

            <div className="editor-align-group">
              {ALIGN_OPTIONS.map((a) => (
                <button
                  key={a}
                  className={`editor-toggle-btn${textFocus?.fields.align === a ? ' is-active' : ''}`}
                  onClick={() => sendFormatSet('align', a)}
                  title={a}
                >
                  {a[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          )}

          <div className="editor-toolbar-spacer" />

          <span className={`editor-save-status${saveStatus === 'error' ? ' is-error' : ''}`}>
            {saveStatus === 'saving' && 'Saving…'}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'error' && 'Save failed'}
            {saveStatus === 'idle' && ''}
          </span>
          <Link
            href={`/sermons/${sermonId}/generate`}
            className="presenter-control-btn presenter-control-btn-secondary"
          >
            🎨 Change Style
          </Link>
          <button
            onClick={handlePresent}
            disabled={isLaunching}
            className="presenter-control-btn presenter-control-btn-primary"
          >
            {isLaunching ? 'Launching…' : 'Present ▶'}
          </button>
        </div>
      )}

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

      {mode === 'present' && !hasController && (
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

      {monitorPrompt && (
        <MonitorSelectDialog
          screens={monitorPrompt.screens}
          onConfirm={monitorPrompt.onConfirm}
          onCancel={monitorPrompt.onCancel}
        />
      )}
    </div>
  )
}
