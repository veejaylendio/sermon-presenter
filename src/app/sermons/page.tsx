import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { signOut } from '@/app/auth/actions'
import DeleteSermonButton from '@/components/DeleteSermonButton'

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Dashboard Header */}
      <header className="glass" style={{ borderBottom: '1px solid var(--border-color)', padding: '1rem 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <span style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              fontFamily: 'var(--font-serif)',
              color: 'var(--primary)'
            }}>
              SermonPresenter
            </span>
            <nav style={{ display: 'flex', gap: '1rem' }}>
              <Link href="/sermons" style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '0.9rem' }}>
                My Sermons
              </Link>
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Pastor: <strong>{profile?.full_name || user.email}</strong>
            </span>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main style={{ flex: 1, padding: '3rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Sermon Dashboard</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Manage your preaching notes and presentation slides</p>
            </div>
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
              <span style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>📖</span>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>No sermons created yet</h2>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', marginBottom: '2rem', lineHeight: '1.6' }}>
                Create your first sermon by pasting your preaching notes. We will automatically split them into slides and help you generate a gorgeous interactive presentation.
              </p>
              <Link href="/sermons/new" className="btn btn-primary" style={{ padding: '1rem 2rem' }}>
                Create First Sermon
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {orderedSermons.map((sermon, index) => {
                const presentation = sermon.presentations?.[0]
                const isGenerated = presentation?.status === 'generated'
                const isPinned = index === 0 && (!presentation || presentation.status !== 'generated')
                const slideCount = sermon.slides?.length || 0

                return (
                  <div
                    key={sermon.id}
                    className="glass-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.5rem 2rem',
                      borderLeft: isPinned ? '4px solid var(--accent)' : undefined,
                      background: isPinned ? 'rgba(245, 158, 11, 0.03)' : undefined,
                    }}
                  >
                    <div style={{ flex: 1, marginRight: '2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {sermon.title}
                        </h3>
                        {isPinned && (
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: 'var(--accent)',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            In Progress
                          </span>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <span>Slides: <strong>{slideCount}</strong></span>
                        <span>Created: <strong>{new Date(sermon.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}</strong></span>
                        <span>Theme: <strong style={{ color: presentation?.theme_slug ? 'var(--primary)' : 'inherit' }}>
                          {presentation?.theme_slug || 'None'}
                        </strong></span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {/* Action Button */}
                      {isGenerated ? (
                        <Link
                          href={`/sermons/${sermon.id}/view`}
                          className="btn btn-secondary"
                          style={{
                            minWidth: '110px',
                            background: 'rgba(99, 102, 241, 0.1)',
                            borderColor: 'var(--primary)',
                            color: 'var(--primary)',
                          }}
                        >
                          View
                        </Link>
                      ) : (
                        <Link
                          href={`/sermons/${sermon.id}/generate`}
                          className="btn btn-accent"
                          style={{ minWidth: '110px' }}
                        >
                          Generate
                        </Link>
                      )}

                      {/* Delete Button */}
                      <DeleteSermonButton sermonId={sermon.id} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
