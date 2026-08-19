'use client'

import { toPng } from 'html-to-image'
import pptxgenjs from 'pptxgenjs'
import { buildDeckSrc } from './deckSrc'

// Every linear dimension (position, size, AND font size) uses this one scale
// so text keeps the same proportion of the slide it had on screen. 144px/in
// is chosen because it maps the deck's native 1920x1080 stage exactly onto
// pptxgenjs's standard 16:9 "widescreen" layout (13.333in x 7.5in) - not
// because it matches any browser DPI assumption.
const PX_PER_INCH = 144
const SLIDE_W_IN = 1920 / PX_PER_INCH
const SLIDE_H_IN = 1080 / PX_PER_INCH

function pxToIn(px: number): number {
  return px / PX_PER_INCH
}

// Font size intentionally uses the same 144px/in scale (not the browser's
// native 96dpi px->pt ratio) so text occupies the same fraction of the slide
// height it did when rendered - see PX_PER_INCH above.
function pxToPt(px: number): number {
  return (px / PX_PER_INCH) * 72
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return '000000'
  const [, r, g, b] = m
  return [r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function mapAlign(textAlign: string): 'left' | 'center' | 'right' | 'justify' {
  if (textAlign === 'center' || textAlign === 'right' || textAlign === 'justify') return textAlign
  return 'left'
}

interface CapturedText {
  text: string
  x: number
  y: number
  w: number
  h: number
  fontPt: number
  fontFace: string
  color: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right' | 'justify'
}

interface CapturedSlide {
  backgroundPng: string
  texts: CapturedText[]
}

async function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.addEventListener('error', () => reject(new Error('Failed to load presentation for export')), { once: true })
  })
  const doc = iframe.contentDocument
  const win = iframe.contentWindow as (Window & { presentationController?: { showSlide: (i: number) => void } }) | null
  if (!doc || !win) throw new Error('Presentation iframe did not load')
  if (doc.fonts) {
    await doc.fonts.ready
  }
  // The controller script runs on DOMContentLoaded/load, same events this
  // promise already waited on, but give it one microtask turn to finish
  // constructing `window.presentationController` before it's used below.
  await new Promise((r) => setTimeout(r, 30))
  if (!win.presentationController) {
    throw new Error('Presentation controller did not initialize')
  }
}

function captureSlideTexts(slideEl: Element): CapturedText[] {
  const slideRect = slideEl.getBoundingClientRect()
  const nodes = Array.from(slideEl.querySelectorAll<HTMLElement>('.slide-title, .slide-body'))
  return nodes
    .filter((el) => el.innerText.trim().length > 0)
    .map((el) => {
      const rect = el.getBoundingClientRect()
      const style = el.ownerDocument.defaultView!.getComputedStyle(el)
      const fontFace = style.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
      return {
        text: el.innerText,
        x: pxToIn(rect.left - slideRect.left),
        y: pxToIn(rect.top - slideRect.top),
        w: pxToIn(rect.width),
        h: pxToIn(rect.height),
        fontPt: pxToPt(parseFloat(style.fontSize)),
        fontFace,
        color: rgbToHex(style.color),
        bold: parseInt(style.fontWeight, 10) >= 600,
        italic: style.fontStyle === 'italic',
        align: mapAlign(style.textAlign),
      }
    })
}

async function captureSlide(slideEl: HTMLElement): Promise<CapturedSlide> {
  const textNodes = Array.from(slideEl.querySelectorAll<HTMLElement>('.slide-title, .slide-body'))
  const texts = captureSlideTexts(slideEl)

  const previousVisibility = textNodes.map((el) => el.style.visibility)
  textNodes.forEach((el) => { el.style.visibility = 'hidden' })
  let backgroundPng: string
  try {
    // The only text that needs its real font is .slide-title/.slide-body,
    // which is hidden above and rendered separately as native PPTX text -
    // html-to-image doesn't need to embed @font-face rules for this
    // background-only capture. That embedding step also throws a
    // SecurityError here: it reads each stylesheet's cssRules to find fonts
    // to inline, and the deck's Google Fonts <link> has no crossorigin
    // attribute, so the browser treats its CSSStyleSheet as opaque even
    // though the font renders fine visually.
    backgroundPng = await toPng(slideEl, { width: 1920, height: 1080, pixelRatio: 1, skipFonts: true })
  } finally {
    textNodes.forEach((el, i) => { el.style.visibility = previousVisibility[i] })
  }

  return { backgroundPng, texts }
}

export type ExportPresentationOptions = { title: string; slideCount: number } & (
  | { deckUrl: string; html?: undefined }
  // Bypasses storage entirely - used by the deck viewer, which already has
  // just-flushed HTML in memory. Reading back from `deckUrl` there would race
  // the save's own revalidation and could silently export a stale version.
  | { html: string; deckUrl?: undefined }
)

export async function exportPresentationToPptx(options: ExportPresentationOptions): Promise<void> {
  const { title, slideCount } = options
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = '1920px'
  iframe.style.height = '1080px'
  iframe.style.border = 'none'
  if ('html' in options && options.html) {
    iframe.srcdoc = options.html
  } else if ('deckUrl' in options && options.deckUrl) {
    iframe.src = buildDeckSrc(options.deckUrl, 'present')
  }
  document.body.appendChild(iframe)

  try {
    await waitForIframeLoad(iframe)
    const doc = iframe.contentDocument!
    const win = iframe.contentWindow as unknown as { presentationController: { showSlide: (i: number) => void } }

    // Kill transitions/animations so reveal-in slides don't get captured
    // mid-fade - every slide should render in its final, settled state.
    const killAnim = doc.createElement('style')
    killAnim.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'
    doc.head.appendChild(killAnim)

    const slides: CapturedSlide[] = []
    for (let i = 0; i < slideCount; i++) {
      win.presentationController.showSlide(i)
      const slideEl = doc.querySelector<HTMLElement>('.slide.visible') || doc.querySelector<HTMLElement>(`[data-index="${i}"]`)
      if (!slideEl) continue
      slides.push(await captureSlide(slideEl))
    }

    const pptx = new pptxgenjs()
    pptx.defineLayout({ name: 'SP_16x9', width: SLIDE_W_IN, height: SLIDE_H_IN })
    pptx.layout = 'SP_16x9'

    for (const slide of slides) {
      const s = pptx.addSlide()
      s.addImage({ data: slide.backgroundPng, x: 0, y: 0, w: SLIDE_W_IN, h: SLIDE_H_IN })
      for (const t of slide.texts) {
        s.addText(t.text, {
          x: t.x,
          y: t.y,
          w: t.w,
          h: t.h,
          fontSize: t.fontPt,
          fontFace: t.fontFace,
          color: t.color,
          bold: t.bold,
          italic: t.italic,
          align: t.align,
          valign: 'top',
        })
      }
    }

    const fileName = `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'presentation'}.pptx`
    await pptx.writeFile({ fileName })
  } finally {
    document.body.removeChild(iframe)
  }
}
