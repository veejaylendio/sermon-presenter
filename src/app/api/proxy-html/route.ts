import { NextResponse } from 'next/server'
import { EDITOR_RUNTIME_JS } from '@/utils/slideTemplates'

// A saved deck's <script> tag is exactly whatever editor JS was already
// loaded in the browser at the moment it was last saved (buildSaveableHtml in
// slideTemplates.ts clones the live document as-is) - saving just re-persists
// that same script forward, so a deck saved under an older version of this
// app would otherwise stay frozen at whatever ran then, forever, no matter
// how many times it's reopened. The editor-runtime bootstrap is always the
// LAST <script>...</script> block in the document (see
// generatePresentationHtml, the only producer - a pristine never-saved deck
// also has an earlier #initialPhotoWidgetsSeed script, but buildSaveableHtml
// strips that on every save, and either way it's never last). Swapping just
// that block's content for the current EDITOR_RUNTIME_JS applies every editor
// fix shipped since, while leaving the actual slide content/widgets/styles -
// plain DOM the editor script reads, not something it embeds - untouched.
function resyncEditorRuntime(html: string): string {
  const scriptTagRe = /<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g
  let lastMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = scriptTagRe.exec(html)) !== null) {
    lastMatch = match
  }
  if (!lastMatch) return html
  const start = lastMatch.index
  const end = start + lastMatch[0].length
  return html.slice(0, start) + '<script>\n' + EDITOR_RUNTIME_JS + '\n</script>' + html.slice(end)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const editorMode = searchParams.get('editorMode')

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  try {
    // Bypass any intermediate cache on the way to storage as well — a regenerated
    // deck reuses the same object path, so a cached hit here serves the old theme.
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return new NextResponse(`Failed to fetch content from URL: ${res.statusText}`, { status: res.status })
    }

    let html = await res.text()

    // Only the actual editing session gets resynced - present-mode output
    // (the fullscreen/controller windows) and any other consumer of this
    // route keep rendering exactly what was saved, unmodified, which matters
    // both for stability mid-service and for the hard immutable caching below
    // (a live show should never have editor logic swapped under it).
    if (editorMode === 'edit') {
      html = resyncEditorRuntime(html)
    }

    // Presentations are regenerated in place at the same storage path whenever
    // the user changes style or saves an edit - so a bare, unversioned url can
    // legitimately point at different content over time, and must never be
    // cached (that's what previously made a new theme render as the old one).
    // But every url this app actually generates (selectThemeAndGenerateDeck,
    // saveDeckHtml) is stamped with a `?v=<timestamp>` that changes on every
    // save, making that specific versioned url immutable forever - so it's
    // safe, and a real win, to let the browser cache it hard. This matters a
    // lot for the presenter controller, which opens one iframe per slide (plus
    // a main preview) all pointing at this exact same versioned url - without
    // caching, that's N+1 full independent fetches of an identical payload.
    // An edit-mode response is never the byte-for-byte content behind its own
    // versioned url (the script block above was just swapped in fresh), so it
    // must never take the immutable-cache branch below - that would pin
    // whatever EDITOR_RUNTIME_JS was current at that moment to this url for a
    // year, defeating the resync for every future fix the same way the
    // original frozen-script problem did.
    let hasVersion = false
    if (editorMode !== 'edit') {
      try {
        hasVersion = new URL(url).searchParams.has('v')
      } catch {
        // Malformed url - fall through to the safe no-store default below.
      }
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': hasVersion
          ? 'public, max-age=31536000, immutable'
          : 'no-store, must-revalidate',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new NextResponse(`Error fetching HTML content: ${message}`, { status: 500 })
  }
}
