import { getPresentationContext } from '../getPresentationContext'
import PresenterControllerClient from './PresenterControllerClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function PresenterControllerPage({ params }: PageProps) {
  const { id } = await params
  const { sermon, presentation } = await getPresentationContext(id)

  const slides = (sermon.slides || [])
    .slice()
    .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
    .map((s: { id: string }) => ({ id: s.id }))

  return (
    <PresenterControllerClient
      sermonId={id}
      presentationId={presentation.id}
      presentationUrl={presentation.content_storage_path}
      slides={slides}
    />
  )
}
