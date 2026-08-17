import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PresentationViewerClient from './PresentationViewerClient'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ViewPresentationPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Get user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  // 2. Fetch sermon with slides & presentation
  const { data: sermon, error: sermonError } = await supabase
    .from('sermons')
    .select('*, slides(*), presentations(*)')
    .eq('id', id)
    .single()

  if (sermonError || !sermon) {
    notFound()
  }

  const presentation = sermon.presentations?.[0]
  if (!presentation || presentation.status !== 'generated' || !presentation.content_storage_path) {
    redirect(`/sermons/${id}/generate`)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
      {/* Top Bar Navigation */}
      <header className="glass" style={{
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/sermons" style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.9rem' }}>
            ← Sermons
          </Link>
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {sermon.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="badge badge-accent">
            Theme: {presentation.theme_slug}
          </span>
          <Link href={`/sermons/${id}/generate`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            🎨 Change Style
          </Link>
        </div>
      </header>

      {/* Main Fullscreen Presentation Deck Viewer */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <PresentationViewerClient
          presentationId={presentation.id}
          presentationUrl={presentation.content_storage_path}
          slides={sermon.slides || []}
        />
      </main>
    </div>
  )
}
