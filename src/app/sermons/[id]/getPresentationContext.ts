import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'

// Shared by the edit view, the presentation output window, and the presenter
// controller window - all three need the exact same sermon+slides+presentation
// fetch, auth check, and "not generated yet" redirect.
export async function getPresentationContext(id: string) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

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

  return { sermon, presentation }
}
