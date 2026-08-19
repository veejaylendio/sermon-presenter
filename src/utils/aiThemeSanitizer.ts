// Validates and sanitizes an LLM-authored theme before it can ever reach the
// browser. The theme is data (CSS + HTML template strings with placeholders),
// never executable code, but an adversarial or malformed response could still
// smuggle <script>, event handlers, or a non-Google-Fonts resource. Reject
// outright on anything suspicious rather than trying to half-repair it.

import type { CustomThemeData } from './slideTemplates'

const DANGEROUS = /<script[\s>]|javascript:|@import\b|expression\(|on[a-z]+\s*=\s*["']/i
const HTML_TAG_IN_CSS = /<\/?[a-z][\s\S]*>/i
const BANNED_WORDS = /\b(custom|wildcard|ai[- ]?generated)\b/i
const ALLOWED_FONT_HOSTS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|api\.fontshare\.com)\//i

// The system prompt tells the model every body/scripture text must be at
// least 32px at the fixed 1920x1080 stage, but that's only an instruction —
// smaller open-weight fallback models (unlike the tested Gemini path) have
// been observed ignoring it and shipping ~24-29px text. Enforce it for real:
// reject any theme with a font-size below the floor anywhere in its CSS or
// templates, so it falls through to the next provider instead of shipping an
// illegible deck.
const MIN_FONT_SIZE_PX = 32

function hasFontSizeBelowFloor(text: string): boolean {
  for (const match of text.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi)) {
    if (parseFloat(match[1]) < MIN_FONT_SIZE_PX) return true
  }
  return false
}

// The renderer (applyCustomTemplate in slideTemplates.ts) only understands two
// section tags, {{#HEADER}}/{{/HEADER}} and {{#BODY}}/{{/BODY}}. Any other
// {{#tag}} / {{/tag}} — a hallucinated block, a typo, an unmatched open/close —
// would fall through untouched and render as literal visible text on the slide
// (observed live: "{{#HEADER}}" printed above the actual header). Reject
// outright rather than trying to repair arbitrary template syntax.
const UNSUPPORTED_SECTION_TAG = /\{\{[#/](?!HEADER\}\}|BODY\}\})\w*\}\}/

function hasBalancedSections(text: string): boolean {
  const count = (re: RegExp) => (text.match(re) || []).length
  return (
    count(/\{\{#HEADER\}\}/g) === count(/\{\{\/HEADER\}\}/g) &&
    count(/\{\{#BODY\}\}/g) === count(/\{\{\/BODY\}\}/g)
  )
}

export function sanitizeCustomTheme(raw: unknown): CustomThemeData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : ''
  const css = typeof r.css === 'string' ? r.css : ''
  const fontsLinkRaw = typeof r.fontsLink === 'string' ? r.fontsLink : ''
  const titleTpl = typeof r.titleSlideTemplate === 'string' ? r.titleSlideTemplate : ''
  const bodyTpl = typeof r.bodySlideTemplate === 'string' ? r.bodySlideTemplate : ''
  if (!name || !css || !titleTpl || !bodyTpl) return null

  if (
    DANGEROUS.test(css) ||
    DANGEROUS.test(titleTpl) ||
    DANGEROUS.test(bodyTpl) ||
    DANGEROUS.test(fontsLinkRaw)
  ) {
    return null
  }
  if (HTML_TAG_IN_CSS.test(css)) return null
  if (hasFontSizeBelowFloor(css) || hasFontSizeBelowFloor(titleTpl) || hasFontSizeBelowFloor(bodyTpl)) return null
  if (BANNED_WORDS.test(titleTpl) || BANNED_WORDS.test(bodyTpl) || BANNED_WORDS.test(name)) return null
  if (UNSUPPORTED_SECTION_TAG.test(titleTpl) || UNSUPPORTED_SECTION_TAG.test(bodyTpl)) return null
  if (!hasBalancedSections(titleTpl) || !hasBalancedSections(bodyTpl)) return null

  const linkTags = fontsLinkRaw.match(/<link\b[^>]*>/gi) ?? []
  const safeLinks = linkTags.filter((tag) => {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
    return ALLOWED_FONT_HOSTS.test(href)
  })
  const fontsLink = safeLinks.join('\n')

  if (!titleTpl.includes('{{HEADER}}') || !bodyTpl.includes('{{HEADER}}')) return null

  return { name, css, fontsLink, titleSlideTemplate: titleTpl, bodySlideTemplate: bodyTpl }
}
