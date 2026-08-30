import { getPresentationContext } from '../getPresentationContext'
import PresentationOutputClient from './PresentationOutputClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function PresentationOutputPage({ params }: PageProps) {
  const { id } = await params
  const { sermon, presentation } = await getPresentationContext(id)

  return (
    <PresentationOutputClient
      presentationId={presentation.id}
      presentationUrl={presentation.content_storage_path}
      initialSlideCount={(sermon.slides || []).length}
    />
  )
}
