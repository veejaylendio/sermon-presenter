import { createClient } from '@/utils/supabase/server'
import AppShell from '@/components/AppShell'
import { THEME_META, REGISTER_LABELS } from '@/utils/themeMetadata'

export const dynamic = 'force-dynamic'

export default async function ThemesPage() {
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
    <AppShell active="themes" displayName={displayName} title="Themes">
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '-1.25rem', marginBottom: '1.75rem', maxWidth: '65ch' }}>
        {THEME_META.length} presentation designs available when generating a sermon. Each one is tuned for a
        different mood, genre, and formality — pick one directly on a sermon&apos;s Generate page, or let the app
        auto-match based on the passage.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1.25rem',
      }}>
        {THEME_META.map((theme) => (
          <div key={theme.slug} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{theme.name}</h3>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}>
                {theme.tag}
              </span>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.55, margin: 0 }}>
              {theme.description}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
              {theme.registers.slice(0, 3).map((r) => (
                <span
                  key={r}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    background: 'var(--bg-surface-hover)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {REGISTER_LABELS[r]}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
