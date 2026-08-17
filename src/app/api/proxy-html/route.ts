import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

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

    const html = await res.text()

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
    let hasVersion = false
    try {
      hasVersion = new URL(url).searchParams.has('v')
    } catch {
      // Malformed url - fall through to the safe no-store default below.
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
