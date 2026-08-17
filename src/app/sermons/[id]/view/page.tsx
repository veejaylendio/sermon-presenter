import { getPresentationContext } from '../getPresentationContext'
import PresentationViewerClient from './PresentationViewerClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ViewPresentationPage({ params }: PageProps) {
  const { id } = await params
  const { sermon, presentation } = await getPresentationContext(id)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
      {/* Main Fullscreen Presentation Deck Viewer - the single consolidated
          toolbar (breadcrumb, structural icons, title, save status, Change
          Style, Present) is rendered by PresentationViewerClient itself, since
          it needs to be part of the same client-side row as the icons/status
          that talk to the deck iframe. */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <PresentationViewerClient
          sermonId={id}
          sermonTitle={sermon.title}
          presentationId={presentation.id}
          presentationUrl={presentation.content_storage_path}
          initialSlideCount={(sermon.slides || []).length}
        />
      </main>
    </div>
  )
}
