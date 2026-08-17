'use client'

import { useState, useEffect } from 'react'
import { parseSermonNotes, getSermonTitle } from '@/utils/sermonParser'
import { createSermon } from '@/app/sermons/actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewSermonPage() {
  const [rawNotes, setRawNotes] = useState('')
  const [slides, setSlides] = useState<string[]>([])
  const [title, setTitle] = useState('Untitled Sermon')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Real-time parsing as they type
  useEffect(() => {
    const parsed = parseSermonNotes(rawNotes)
    setSlides(parsed)
    setTitle(getSermonTitle(parsed))
  }, [rawNotes])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (slides.length === 0) {
      setError('Please write or paste some preaching notes first.')
      return
    }

    setIsPending(true)
    setError(null)

    try {
      const result = await createSermon(rawNotes)
      if (result.success) {
        router.push('/sermons')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the sermon.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="glass" style={{ borderBottom: '1px solid var(--border-color)', padding: '1rem 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/sermons" style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>
              ← Dashboard
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', fontFamily: 'var(--font-serif)' }}>
              New Sermon
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isPending || slides.length === 0}
            className={`btn btn-primary ${isPending || slides.length === 0 ? 'btn-disabled' : ''}`}
            style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem' }}
          >
            {isPending ? 'Saving...' : 'Confirm & Create Slides'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', height: 'calc(100vh - 120px)' }}>
          
          {/* Left Column: Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', height: '100%' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Preaching Notes</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Paste your sermon notes. Separate slides by leaving a blank line.
                </p>
              </div>

              {error && (
                <div style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--danger)',
                  fontSize: '0.875rem',
                  marginBottom: '1rem'
                }}>
                  {error}
                </div>
              )}

              <textarea
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                placeholder={`Example:

Welcome to Today's Sermon
The Power of Faith in Troubled Times

Faith is not the absence of fear.
It is the presence of trust in God.

Hebrews 11:1
Now faith is confidence in what we hope for and assurance about what we do not see.`}
                className="input-field"
                style={{
                  flex: 1,
                  resize: 'vertical',
                  minHeight: '200px',
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  lineHeight: '1.5',
                  padding: '1rem',
                  background: 'rgba(0, 0, 0, 0.3)'
                }}
              />
            </div>
          </div>

          {/* Right Column: Slide Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflow: 'hidden' }}>
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', height: '100%', overflow: 'hidden' }}>
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Slide Preview ({slides.length})</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Title: <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{title}</span>
                  </p>
                </div>
              </div>

              {/* Slide List */}
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                paddingRight: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                {slides.length === 0 ? (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    border: '2px dashed var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '2rem',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✨</span>
                    <p style={{ fontWeight: '500' }}>No Slides Yet</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Type in the editor to see your slides populate in real-time.</p>
                  </div>
                ) : (
                  slides.map((slideText, index) => {
                    const rawLines = slideText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
                    const headerText = rawLines[0] || slideText.trim()
                    const bodyText = rawLines.slice(1).join('\n')

                    return (
                      <div key={index} className="glass" style={{
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        overflow: 'hidden',
                        flexShrink: 0, // Ensure cards maintain consistent size instead of shrinking
                        transition: 'var(--transition-normal)'
                      }}>
                        {/* Header banner */}
                        <div style={{
                          padding: '0.5rem 1rem',
                          background: index === 0 ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                          borderBottom: '1px solid var(--border-color)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: index === 0 ? 'var(--primary)' : 'var(--text-secondary)',
                          fontWeight: '600'
                        }}>
                          <span>{index === 0 ? 'SLIDE 1 — TITLE' : `SLIDE ${index + 1}`}</span>
                          <span>{rawLines.length} line{rawLines.length === 1 ? '' : 's'}</span>
                        </div>
                        
                        {/* 16:9 inner preview box */}
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          paddingTop: '56.25%', // 16:9 Aspect Ratio
                          background: '#121215'
                        }}>
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            padding: '1.25rem 1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            textAlign: 'center',
                            overflow: 'hidden'
                          }}>
                            <h4 style={{
                              fontFamily: index === 0 ? 'var(--font-serif)' : 'var(--font-sans)',
                              fontSize: index === 0 ? '1.15rem' : '1rem',
                              fontWeight: index === 0 ? '700' : '600',
                              lineHeight: '1.3',
                              color: '#ffffff', // High contrast white for visibility
                              marginBottom: bodyText ? '0.4rem' : '0',
                              wordBreak: 'break-word',
                              width: '100%',
                              maxHeight: bodyText ? '40%' : '80%',
                              overflow: 'hidden'
                            }}>
                              {headerText}
                            </h4>
                            {bodyText && (
                              <p style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: '0.85rem',
                                fontWeight: '400',
                                lineHeight: '1.4',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: 'rgba(255, 255, 255, 0.85)',
                                width: '100%',
                                maxHeight: '55%',
                                overflow: 'hidden'
                              }}>
                                {bodyText}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
