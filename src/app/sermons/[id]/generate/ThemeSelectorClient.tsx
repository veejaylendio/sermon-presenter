'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  selectThemeAndGenerateDeck,
  generateAiCustomTheme,
  getAiThemeStatus,
  selectAiThemeDesign,
  type AiThemeDesignSummary,
} from '@/app/sermons/actions'
import {
  THEME_META,
  THEME_META_BY_SLUG,
  AUTO_THEME_SLUG,
  AI_CUSTOM_THEME_SLUG,
  REGISTER_LABELS,
  SEASON_LABELS,
  GENRE_LABELS,
} from '@/utils/themeMetadata'
import type { SermonAnalysis } from '@/utils/sermonAnalyzer'
import type { CustomThemeData } from '@/utils/slideTemplates'
import { SwatchIcon, BookIcon, SparkleIcon, RefreshIcon, ClockIcon } from '@/components/icons'

function PreviewFrame({ html, title }: { html: string; title: string }) {
  if (!html) {
    return (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center',
        color: '#f4f4f5', // this canvas is a fixed dark placeholder (see rgba(0,0,0,0.5) at call sites), not app chrome
      }}>
        <span style={{ marginBottom: '0.5rem', opacity: 0.8 }}><SwatchIcon size={26} /></span>
        <strong style={{ fontSize: '1.05rem' }}>{title}</strong>
      </div>
    )
  }

  return (
    <iframe
      srcDoc={html}
      title={title}
      loading="lazy"
      sandbox="allow-scripts"
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        border: 'none', pointerEvents: 'none'
      }}
    />
  )
}

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span style={{
      fontSize: '0.72rem',
      fontWeight: 600,
      letterSpacing: '0.03em',
      padding: '0.25rem 0.7rem',
      borderRadius: '999px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      background: tone === 'accent' ? 'var(--accent-glow)' : 'var(--bg-surface-hover)',
      color: tone === 'accent' ? 'var(--accent)' : 'var(--text-secondary)',
      border: `1px solid ${tone === 'accent' ? 'var(--border-color)' : 'var(--border-color)'}`,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function formatRelativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Compact "N saved designs ▾" button next to Regenerate. Opening it lists every
// design ever generated for this presentation — clicking one activates it
// immediately (no LLM call), the way selectAiThemeDesign works server-side.
function AiDesignHistoryDropdown({
  designs,
  activeDesignId,
  onSelect,
  disabled,
}: {
  designs: AiThemeDesignSummary[]
  activeDesignId: string | null
  onSelect: (design: AiThemeDesignSummary) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  if (designs.length === 0) return null

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={disabled}
        className={`btn btn-secondary ${disabled ? 'btn-disabled' : ''}`}
        style={{ fontSize: '0.9rem', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
      >
        <ClockIcon size={14} />
        {designs.length} saved design{designs.length === 1 ? '' : 's'}
        <span style={{ fontSize: '0.7rem' }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 0.5rem)', left: 0, zIndex: 20,
            width: '270px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)', boxShadow: '0 12px 28px rgba(0,0,0,0.35)', overflow: 'hidden',
          }}
        >
          {designs.map((design) => {
            const isActive = design.id === activeDesignId
            return (
              <button
                key={design.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  if (!isActive) onSelect(design)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.65rem', width: '100%',
                  padding: '0.6rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-color)',
                  background: isActive ? 'var(--accent-glow)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
                }}
              >
                <span style={{
                  position: 'relative', width: '42px', height: '26px', borderRadius: '5px',
                  overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.5)',
                }}>
                  <PreviewFrame html={design.previewHtml} title={design.name} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: '0.82rem', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {design.name}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {isActive ? 'Active · ' : ''}{formatRelativeTime(design.createdAt)}
                  </span>
                </span>
                {isActive && <span style={{ color: 'var(--accent)', fontSize: '0.9rem', flexShrink: 0 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface PreviewItem {
  slug: string
  html: string
}

type AiThemeStatus = 'idle' | 'pending' | 'ready' | 'failed'

interface Props {
  sermonId: string
  previews: PreviewItem[]
  analysis: SermonAnalysis
  defaultSelected: string
  initialCustomTheme: CustomThemeData | null
  initialCustomThemePreview: string | null
  initialAiThemeStatus: AiThemeStatus
  initialAiThemeError: string | null
  initialAiThemeDesigns: AiThemeDesignSummary[]
  initialActiveAiDesignId: string | null
}

const AI_THEME_POLL_INTERVAL_MS = 3000

export default function ThemeSelectorClient({
  sermonId,
  previews,
  analysis,
  defaultSelected,
  initialCustomTheme,
  initialCustomThemePreview,
  initialAiThemeStatus,
  initialAiThemeError,
  initialAiThemeDesigns,
  initialActiveAiDesignId,
}: Props) {
  const [selected, setSelected] = useState<string>(defaultSelected || AUTO_THEME_SLUG)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const router = useRouter()

  const [aiCustomTheme, setAiCustomTheme] = useState<CustomThemeData | null>(initialCustomTheme)
  const [aiPreviewHtml, setAiPreviewHtml] = useState<string | null>(initialCustomThemePreview)
  const [aiStatus, setAiStatus] = useState<AiThemeStatus>(initialAiThemeStatus)
  const [aiError, setAiError] = useState<string | null>(initialAiThemeError)
  const [aiThemeDesigns, setAiThemeDesigns] = useState<AiThemeDesignSummary[]>(initialAiThemeDesigns)
  const [activeAiDesignId, setActiveAiDesignId] = useState<string | null>(initialActiveAiDesignId)
  const [historySelecting, setHistorySelecting] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aiLoading = aiStatus === 'pending'

  const previewBySlug = useMemo(
    () => Object.fromEntries(previews.map((p) => [p.slug, p.html])),
    [previews]
  )

  const isAuto = selected === AUTO_THEME_SLUG
  const isAiSelected = selected === AI_CUSTOM_THEME_SLUG
  // What actually gets built: the AI design when selected, the manually-picked
  // catalog theme otherwise (with 'auto' resolved to the top rule-based match).
  const effectiveSlug = isAuto ? analysis.themeSlug : selected
  const effective = isAiSelected ? null : THEME_META_BY_SLUG[effectiveSlug]
  const effectiveName = isAiSelected ? aiCustomTheme?.name : effective?.name

  const cancelPollRef = useRef(false)

  const stopPolling = useCallback(() => {
    cancelPollRef.current = true
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  // A loop, not recursion, so there's a single stable function reference to
  // start/cancel — each pass waits out the interval, then checks status once
  // and either stops (ready/failed) or waits again (pending).
  const pollAiThemeStatus = useCallback(async () => {
    cancelPollRef.current = false
    while (!cancelPollRef.current) {
      await new Promise<void>((resolve) => {
        pollTimerRef.current = setTimeout(resolve, AI_THEME_POLL_INTERVAL_MS)
      })
      if (cancelPollRef.current) return

      try {
        const res = await getAiThemeStatus(sermonId)
        if (res.status === 'ready') {
          setAiCustomTheme(res.customTheme)
          setAiPreviewHtml(res.previewHtml)
          setAiStatus('ready')
          setAiError(null)
          setSelected(AI_CUSTOM_THEME_SLUG)
          setAiThemeDesigns(res.designs)
          setActiveAiDesignId(res.activeDesignId)
          return
        }
        if (res.status === 'failed') {
          setAiError(res.error)
          setAiPreviewHtml(res.fallbackPreviewHtml)
          setAiStatus('failed')
          // Keep the selection usable even though the AI design failed.
          setSelected(res.fallbackSlug)
          return
        }
        // 'pending' — loop again
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Failed to check AI design status.')
        setAiStatus('failed')
        return
      }
    }
  }, [sermonId])

  // Resume polling automatically if a generation was already in flight when
  // this page loaded (e.g. the user navigated away and came back).
  useEffect(() => {
    if (initialAiThemeStatus === 'pending') {
      // All setState calls inside pollAiThemeStatus happen after an awaited
      // setTimeout, never synchronously in this effect body — safe despite
      // the lint rule's static (async-unaware) check.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      pollAiThemeStatus()
    }
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGenerateAiTheme = async () => {
    stopPolling()
    setAiStatus('pending')
    setAiError(null)
    try {
      await generateAiCustomTheme(sermonId)
      pollAiThemeStatus()
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to start AI design generation.')
      setAiStatus('failed')
    }
  }

  // Switches to a design already sitting in ai_theme_designs — no LLM call.
  const handleSelectAiDesign = async (design: AiThemeDesignSummary) => {
    setHistorySelecting(true)
    setHistoryError(null)
    try {
      const res = await selectAiThemeDesign(sermonId, design.id)
      setAiCustomTheme(res.customTheme)
      setAiPreviewHtml(res.previewHtml)
      setActiveAiDesignId(design.id)
      setAiStatus('ready')
      setAiError(null)
      setSelected(AI_CUSTOM_THEME_SLUG)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to switch to that design.')
    } finally {
      setHistorySelecting(false)
    }
  }

  // Best-fitting themes first so the strongest options are visible without scrolling.
  const orderedThemes = useMemo(() => {
    const rank = new Map(analysis.ranked.map((r, i) => [r.slug, i]))
    return [...THEME_META].sort(
      (a, b) => (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99)
    )
  }, [analysis.ranked])

  const visibleThemes = showAll ? orderedThemes : orderedThemes.slice(0, 6)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await selectThemeAndGenerateDeck(sermonId, selected)
      if (res?.success) router.push(`/sermons/${sermonId}/view`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate presentation.')
      setIsGenerating(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      {error && (
        <div style={{
          padding: '1rem', background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: 'var(--radius-md)',
          color: 'var(--danger)', textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Option 1: let AI design something new for this sermon            */}
      {/* ---------------------------------------------------------------- */}
      <div
        onClick={() => aiCustomTheme && setSelected(AI_CUSTOM_THEME_SLUG)}
        className="glass-card"
        style={{
          cursor: aiCustomTheme ? 'pointer' : 'default',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          border: isAiSelected ? '2px solid var(--accent)' : '1px solid var(--border-color)',
          boxShadow: isAiSelected ? '0 4px 14px var(--accent-glow)' : 'none',
          transition: 'all 0.25s ease',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 340px)',
          gap: '2rem',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{
              width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
              background: isAiSelected ? 'var(--accent)' : 'var(--bg-surface-hover)',
              border: isAiSelected ? 'none' : '1px solid var(--border-color)',
              color: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold'
            }}>
              {isAiSelected ? '✓' : ''}
            </span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <SparkleIcon size={20} />
              Let AI design something new for this sermon
            </h3>
            <Chip tone="accent">Bespoke</Chip>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1rem' }}>
            {analysis.reasoning} An AI reads your sermon and invents a one-of-a-kind
            design for it — not one of the styles below.
          </p>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {analysis.scripture.slice(0, 3).map((r) => (
              <Chip key={`${r.book}${r.location ?? ''}`}>
                <BookIcon size={11} />
                {r.book}{r.location ? ` ${r.location}` : ''}
              </Chip>
            ))}
            {analysis.genres.slice(0, 1).map((g) => <Chip key={g}>{GENRE_LABELS[g]}</Chip>)}
            {analysis.seasons.slice(0, 1).map((s) => <Chip key={s}>{SEASON_LABELS[s]}</Chip>)}
            {analysis.registers.slice(0, 2).map((r) => <Chip key={r}>{REGISTER_LABELS[r]}</Chip>)}
          </div>

          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            {aiLoading
              ? 'Designing in the background — this can take a few minutes. You can leave this page and come back; it’ll be ready when you return.'
              : aiCustomTheme
                ? <>Designed: <strong style={{ color: 'var(--accent)' }}>{aiCustomTheme.name}</strong></>
                : 'Not generated yet — click below to design it.'}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleGenerateAiTheme}
              disabled={aiLoading}
              className={`btn btn-secondary ${aiLoading ? 'btn-disabled' : ''}`}
              style={{ fontSize: '0.9rem', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            >
              {aiLoading ? (
                'Designing…'
              ) : aiCustomTheme ? (
                <><RefreshIcon size={14} /> Regenerate AI design</>
              ) : (
                <><SparkleIcon size={14} /> Generate AI design</>
              )}
            </button>

            <AiDesignHistoryDropdown
              designs={aiThemeDesigns}
              activeDesignId={activeAiDesignId}
              onSelect={handleSelectAiDesign}
              disabled={aiLoading || historySelecting}
            />
          </div>

          {aiError && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--danger)' }}>
              {aiError} — showing the closest catalog match instead.
            </div>
          )}

          {historyError && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--danger)' }}>
              {historyError}
            </div>
          )}
        </div>

        <div style={{
          position: 'relative', width: '100%', paddingTop: '56.25%',
          background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-md)',
          overflow: 'hidden', border: '1px solid var(--border-color)'
        }}>
          <PreviewFrame
            html={aiPreviewHtml ?? ''}
            title={aiCustomTheme?.name ?? 'AI design'}
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Option 2: choose a style yourself                                */}
      {/* ---------------------------------------------------------------- */}
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            …or pick a style yourself
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.95rem', marginLeft: '0.6rem' }}>
              {THEME_META.length} designs, best fit first
            </span>
          </h3>
          {orderedThemes.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              style={{
                background: 'none', border: '1px solid var(--border-color)',
                color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem',
                fontWeight: 600, padding: '0.4rem 0.9rem', borderRadius: '999px'
              }}
            >
              {showAll ? 'Show fewer' : `Show all ${THEME_META.length}`}
            </button>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.5rem'
        }}>
          {visibleThemes.map((theme) => {
            const isSelected = selected === theme.slug
            const isRecommended = theme.slug === analysis.themeSlug
            const fit = analysis.ranked.find((r) => r.slug === theme.slug)

            return (
              <div
                key={theme.slug}
                onClick={() => setSelected(theme.slug)}
                className="glass-card"
                style={{
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                  boxShadow: isSelected ? '0 4px 14px var(--accent-glow)' : 'none',
                  transform: isSelected ? 'translateY(-4px)' : 'none',
                  transition: 'all 0.25s ease', position: 'relative'
                }}
              >
                <div style={{
                  position: 'absolute', top: '0.85rem', right: '0.85rem', zIndex: 10,
                  background: isSelected ? 'var(--accent)' : 'rgba(0,0,0,0.55)',
                  color: '#fff', width: '26px', height: '26px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 'bold', fontSize: '0.8rem'
                }}>
                  {isSelected ? '✓' : ''}
                </div>

                {isRecommended && (
                  <div style={{
                    position: 'absolute', top: '0.85rem', left: '0.85rem', zIndex: 10,
                    background: 'var(--accent)', color: '#1e1b4b', fontSize: '0.65rem',
                    fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '0.25rem 0.6rem', borderRadius: '999px'
                  }}>
                    AI pick
                  </div>
                )}

                <div style={{
                  position: 'relative', width: '100%', paddingTop: '56.25%',
                  background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid var(--border-color)',
                  overflow: 'hidden'
                }}>
                  <PreviewFrame html={previewBySlug[theme.slug]} title={theme.name} />
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem'
                  }}>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{theme.name}</h4>
                    {fit && fit.confidence > 0 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fit.confidence}% fit
                      </span>
                    )}
                  </div>
                  <div style={{ marginBottom: '0.6rem' }}>
                    <Chip>{theme.tag}</Chip>
                  </div>
                  <p style={{
                    color: 'var(--text-secondary)', fontSize: '0.84rem',
                    lineHeight: 1.5, margin: 0
                  }}>
                    {theme.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Action banner                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="glass-card" style={{
        padding: '2rem', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem',
        borderTop: '2px solid var(--accent)'
      }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            Selected:{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {effectiveName ?? effectiveSlug}
            </span>
            {isAiSelected && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.95rem' }}>
                {', '}bespoke AI design
              </span>
            )}
            {isAuto && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.95rem' }}>
                {', '}best rule-based match
              </span>
            )}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Generates a full 16:9 uniform HTML deck using{' '}
            <code style={{ color: 'var(--accent)' }}>@frontend-slides</code> animation &amp; layout rules.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`btn btn-accent ${isGenerating ? 'btn-disabled' : ''}`}
          style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}
        >
          {isGenerating ? 'Generating Presentation…' : 'Generate Presentation Deck'}
        </button>
      </div>
    </div>
  )
}
