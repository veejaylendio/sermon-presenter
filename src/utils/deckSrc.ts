export type DeckMode = 'edit' | 'present'

// Storage-hosted decks (anything starting with http) go through the proxy route
// so caching headers can be controlled from our own server (see /api/proxy-html) -
// locally-stored fixtures/tests can pass a bare path straight through.
export function buildDeckSrc(presentationUrl: string, mode: DeckMode): string {
  const proxied = presentationUrl.startsWith('http')
    ? `/api/proxy-html?url=${encodeURIComponent(presentationUrl)}`
    : presentationUrl
  const sep = proxied.includes('?') ? '&' : '?'
  return `${proxied}${sep}editorMode=${mode}`
}
