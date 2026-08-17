import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import DeleteSermonButton from '@/components/DeleteSermonButton'
import { BookIcon, SlidesIcon, CalendarIcon } from '@/components/icons'

export const dynamic = 'force-dynamic'

export default async function SermonsPage() {
  const supabase = await createClient()

  // Get current user info
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unauthorized')
  }

  // Fetch profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Fetch sermons with slides count and presentations status
  const { data: sermons, error: sermonsError } = await supabase
    .from('sermons')
    .select(`
      id,
      title,
      created_at,
      status,
      slides (id),
      presentations (
        id,
        status,
        theme_slug
      )
    `)
    .order('created_at', { ascending: false })

  if (sermonsError) {
    console.error('Error fetching sermons:', sermonsError)
  }

  // Pinned logic: Pin the newest sermon that is not generated at the very top.
  // The rest are listed by created_at desc.
  const listSermons = sermons || []
  const pinnedIndex = listSermons.findIndex(s => {
    const pres = s.presentations?.[0]
    return !pres || pres.status !== 'generated'
  })

  let orderedSermons = [...listSermons]
  if (pinnedIndex > 0) {
    const pinnedSermon = orderedSermons.splice(pinnedIndex, 1)[0]
    orderedSermons.unshift(pinnedSermon)
  }

  const displayName = profile?.full_name || user.email || 'Pastor'

  return (
    <AppShell active="sermons" displayName={displayName} title="Sermons">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <Link href="/sermons/new" className="btn btn-primary">
          + New Sermon
        </Link>
      </div>

      {orderedSermons.length === 0 ? (
        <div className="glass-card" style={{
          textAlign: 'center',
          padding: '5rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--primary-glow)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem',
          }}>
            <BookIcon size={28} />
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>No sermons created yet</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', marginBottom: '2rem', lineHeight: '1.6' }}>
            Create your first sermon by pasting your preaching notes. We will automatically split them into slides and help you generate a gorgeous interactive presentation.
          </p>
          <Link href="/sermons/new" className="btn btn-primary" style={{ padding: '1rem 2rem' }}>
            Create First Sermon
          </Link>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem 0.5rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr>
                  {['Sermon', 'Theme', 'Slides', 'Created', 'Status', ''].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        textAlign: heading === '' ? 'right' : 'left',
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        padding: '0 0.5rem 0.7rem',
                        borderBottom: '1px solid var(--border-color-hover)',
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderedSermons.map((sermon, index) => {
                  const presentation = sermon.presentations?.[0]
                  const isGenerated = presentation?.status === 'generated'
                  const isPinned = index === 0 && (!presentation || presentation.status !== 'generated')
                  const slideCount = sermon.slides?.length || 0

                  return (
                    <tr key={sermon.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.9rem 0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: isPinned ? 'var(--accent-glow)' : 'var(--bg-surface-hover)',
                            border: '1px solid var(--border-color)',
                            color: isPinned ? 'var(--accent)' : 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <BookIcon size={14} />
                          </div>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{sermon.title}</span>
                          {isPinned && (
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              color: 'var(--accent)',
                              whiteSpace: 'nowrap',
                            }}>
                              Continue
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-secondary)' }}>
                        {presentation?.theme_slug || '—'}
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          <SlidesIcon size={13} />
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{slideCount}</span>
                        </span>
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <CalendarIcon size={13} />
                          {new Date(sermon.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: isGenerated ? 'var(--success)' : 'var(--text-muted)',
                        }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor' }} />
                          {isGenerated ? 'Generated' : 'Not Generated'}
                        </span>
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          {isGenerated ? (
                            <Link href={`/sermons/${sermon.id}/view`} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
                              View
                            </Link>
                          ) : (
                            <Link href={`/sermons/${sermon.id}/generate`} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
                              Generate
                            </Link>
                          )}
                          <DeleteSermonButton sermonId={sermon.id} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  )
}
