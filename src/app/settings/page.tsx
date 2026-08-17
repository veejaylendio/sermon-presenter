import { createClient } from '@/utils/supabase/server'
import AppShell from '@/components/AppShell'
import { updateProfile, signOut } from '@/app/auth/actions'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const error = resolvedSearchParams.error as string | undefined
  const saved = resolvedSearchParams.saved as string | undefined

  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unauthorized')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.full_name || user.email || 'Pastor'

  return (
    <AppShell active="settings" displayName={displayName} title="Settings">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '480px' }}>
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Profile</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            This is the name shown across the app.
          </p>

          {error && (
            <div style={{
              padding: '0.75rem 1rem',
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}>
              {error}
            </div>
          )}

          {saved && (
            <div style={{
              padding: '0.75rem 1rem',
              background: 'rgba(21, 128, 61, 0.08)',
              border: '1px solid rgba(21, 128, 61, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--success)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}>
              Saved.
            </div>
          )}

          <form action={updateProfile}>
            <div className="input-group">
              <label className="input-label" htmlFor="fullName">Display name</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                defaultValue={profile?.full_name || ''}
                placeholder="Your name"
                className="input-field"
              />
            </div>

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={user.email || ''}
                disabled
                className="input-field"
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '1.25rem' }}>
              Save changes
            </button>
          </form>
        </div>

        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Account</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Sign out of SermonPresenter on this device.
          </p>
          <form action={signOut}>
            <button type="submit" className="btn btn-secondary">
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  )
}
