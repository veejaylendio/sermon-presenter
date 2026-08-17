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

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Presentations are regenerated in place whenever the user changes style.
        // Caching this response is what made a new theme render as the previous one.
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new NextResponse(`Error fetching HTML content: ${message}`, { status: 500 })
  }
}
