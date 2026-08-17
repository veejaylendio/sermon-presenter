import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ThemeSelectorClient from './ThemeSelectorClient'
import { generatePreviewHtml, type CustomThemeData } from '@/utils/slideTemplates'
import { THEME_META, AUTO_THEME_SLUG, AI_CUSTOM_THEME_SLUG } from '@/utils/themeMetadata'
import { analyzeSermon } from '@/utils/sermonAnalyzer'
import { sanitizeCustomTheme } from '@/utils/aiThemeSanitizer'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function GeneratePage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Get user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  // 2. Fetch sermon and presentation details
  const { data: sermon, error: sermonError } = await supabase
    .from('sermons')
    .select('*, slides(*), presentations(*, style_previews(*))')
    .eq('id', id)
    .single()

  if (sermonError || !sermon) {
    notFound()
  }

  const presentation = sermon.presentations?.[0]

  // Previews are rendered inline rather than uploaded to storage. generatePreviewHtml
  // is pure and cheap, so building one per theme here costs a few milliseconds and
  // avoids a round of storage writes for every style the user might never pick.
  const firstSlideText =
    sermon.slides?.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)[0]
      ?.content ||
    sermon.title ||
    'Untitled Sermon'

  const previews = THEME_META.map((theme) => ({
    slug: theme.slug,
    html: generatePreviewHtml(theme.slug, firstSlideText),
  }))

  // Derive the design recommendation from the sermon text itself.
  const analysis = analyzeSermon(sermon.raw_notes || firstSlideText)

  // If a bespoke AI design was already generated for this presentation, re-render
  // its preview from the stored (sanitized) data — free and synchronous, no network
  // call. sanitizeCustomTheme() re-validates rather than trusting the stored row
  // verbatim, closing the gap if it were ever edited out-of-band.
  const storedCustomTheme: CustomThemeData | null = sanitizeCustomTheme(presentation?.custom_theme)
  const initialCustomThemePreview = storedCustomTheme
    ? generatePreviewHtml(storedCustomTheme, firstSlideText)
    : null

  const defaultSelected =
    presentation?.theme_slug ||
    (storedCustomTheme ? AI_CUSTOM_THEME_SLUG : AUTO_THEME_SLUG)

  const initialAiThemeStatus: 'idle' | 'pending' | 'ready' | 'failed' =
    presentation?.ai_theme_status || 'idle'
  const initialAiThemeError: string | null = presentation?.ai_theme_error || null

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
              {sermon.title}
            </span>
          </div>
          <span className="badge badge-accent">frontend-slides AI engine</span>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '3rem 0' }}>
        <div className="container" style={{ maxWidth: '1200px' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
              Choose a Presentation Style
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.125rem', maxWidth: '700px', margin: '0 auto' }}>
              Powered by <code style={{ color: 'var(--accent)', background: 'rgba(245, 158, 11, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>@frontend-slides</code>. Let AI read your sermon and choose the design, or pick from {THEME_META.length} styles yourself.
            </p>
          </div>

          <ThemeSelectorClient
            sermonId={id}
            previews={previews}
            analysis={analysis}
            defaultSelected={defaultSelected}
            initialCustomTheme={storedCustomTheme}
            initialCustomThemePreview={initialCustomThemePreview}
            initialAiThemeStatus={initialAiThemeStatus}
            initialAiThemeError={initialAiThemeError}
          />
        </div>
      </main>
    </div>
  )
}
