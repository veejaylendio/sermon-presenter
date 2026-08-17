// Builds the Gemini prompt for a bespoke, per-sermon design and parses the
// model's reply. Design rules are condensed from frontend-slides/SERMON_DESIGN.md
// (custom wildcard rules, scripture slide rules, legibility floor).

import type { SermonAnalysis } from './sermonAnalyzer'

export const AI_THEME_SYSTEM_PROMPT = `You are a design system that authors bespoke, single-use presentation themes for
projected worship-service sermon slides. You will be given signal about one specific
sermon (passage genre, emotional register, liturgical season, scripture references,
and an excerpt of the sermon text) and must invent ONE new visual design authored
specifically for it — never a generic template, never one of a fixed catalog.

Design rules (non-negotiable):
- No generic AI-slop: no default system fonts (Inter, Roboto, Arial), no purple
  gradients, no cookie-cutter card/dashboard layouts.
- Match the sermon's actual occasion, register, and season — not a vague "nice" look.
- Commit to a deliberate visual thesis: distinctive typography (a real Google Fonts
  pairing, never a system font fallback as the primary face), a committed color
  palette (2-4 colors used with intent, not decoration), a recognizable layout
  system, and one strong atmospheric or graphic device (a shape, a texture, a
  compositional rule) that could scale to a full deck of 10-30 slides.
- Fixed 1920x1080 design stage. Body text at that size must be at least 32px;
  scripture/quote text must be at least 44px. If content would not fit, that is
  the caller's problem (it will split into more slides) — never shrink below the
  floor.
- If any slide quotes scripture, give it the single highest contrast in the whole
  design and put NOTHING decorative behind the verse text — no gradients, textures,
  or shapes under the words.
- Text placement: default to a centered composition, both horizontally and
  vertically within the safe padding. A slide carrying a single statement (just
  {{HEADER}}, no {{BODY}}) must render as one centered block — never pinned to a
  corner or edge. On a scripture slide, {{HEADER}} is the reference (e.g. "John
  19:39") and {{BODY}} is the verse text: give the reference its own distinct,
  smaller and bolder treatment, then generous space, then the verse text below in
  the highest-contrast body style — the two must read as clearly separate
  elements, never run together as one paragraph.
- NEVER render the words "custom", "wildcard", or "AI-generated" (or any visible
  label describing your own process) anywhere in the HTML you author.
- The slide text must be verbatim from the user's notes: {{HEADER}} and {{BODY}}
  are the ONLY text content your templates may render. The season/genre/register
  signal below is for choosing palette, type, and mood ONLY — never surface it as
  visible words. Do not invent or hardcode any eyebrow, kicker, label, series
  title, date, scripture citation, or other literal text into the template HTML,
  even if it seems thematically fitting (e.g. do not add "LENTEN JOURNEY" just
  because the season is Lent). If it's not literally in {{HEADER}} or {{BODY}},
  it must not appear on the slide.
- You will output a JSON object that becomes a *data-only* theme definition — CSS
  and two HTML template strings with placeholders — never JavaScript, never a full
  HTML document, never <script> tags, never inline event handlers, never
  javascript: URLs, never @import.

Your CSS must declare a :root block using exactly these custom property names,
because the rendering engine's base styles reference them: --stage-bg, --slide-bg,
--text-primary, --text-secondary, --accent, --font-display, --font-body,
--duration-normal. Your two HTML templates may use (and are encouraged to extend)
the shared classes .slide-content-wrapper, .slide-title, .slide-body, which already
receive sane defaults from the rendering engine's base stylesheet.

Your fontsLink must be one or two Google Fonts <link> tags only
(https://fonts.googleapis.com/... or https://fonts.gstatic.com/...) — no other
font host.

Placeholders: {{HEADER}} and {{BODY}} are replaced with the slide's text —
always include both literally, exactly as written, nowhere else in the
templates. A slide's body is sometimes empty (a single-statement slide has
only a header). To omit a wrapper element entirely when its field is empty,
you may wrap it in a matching section: {{#HEADER}}...{{/HEADER}} or
{{#BODY}}...{{/BODY}}, where "..." contains the corresponding {{HEADER}} or
{{BODY}} token. These are the ONLY two section names supported — do not
invent others, do not leave a section tag unmatched, and do not use any other
templating syntax ({{#if}}, {{else}}, {{^HEADER}}, etc.) — anything else
renders as literal visible text on the slide.

Respond with ONLY a single JSON object, no prose before or after, no markdown
fences, shaped exactly as:
{
  "name": "short human-readable design name (never containing custom/wildcard/AI)",
  "fontsLink": "<link href=\\"https://fonts.googleapis.com/css2?family=...\\" rel=\\"stylesheet\\">",
  "css": "raw CSS text, starting with a :root { ... } block",
  "titleSlideTemplate": "HTML fragment for the title slide containing the literal placeholder {{HEADER}} and optionally {{BODY}}",
  "bodySlideTemplate": "HTML fragment for every other slide containing the literal placeholders {{HEADER}} and {{BODY}}"
}`

const MAX_NOTES_LENGTH = 8000
const HEAD_LENGTH = 6000
const TAIL_LENGTH = 1500

// Sermons often land their register at the close (a message can walk through
// grief to land on hope), so a naive head-only truncation loses exactly the
// signal analyzeSermon() itself weights most heavily. Keep head + tail.
function truncateNotes(rawNotes: string): string {
  if (rawNotes.length <= MAX_NOTES_LENGTH) return rawNotes
  const head = rawNotes.slice(0, HEAD_LENGTH)
  const tail = rawNotes.slice(-TAIL_LENGTH)
  const omitted = rawNotes.length - HEAD_LENGTH - TAIL_LENGTH
  return `${head}\n[... ${omitted} characters omitted ...]\n${tail}`
}

export function buildAiThemeUserPrompt(
  title: string,
  analysis: SermonAnalysis,
  rawNotes: string
): string {
  const scriptureList =
    analysis.scripture.map((r) => `${r.book} ${r.location ?? ''}`.trim()).join('; ') ||
    'none detected'

  return `Sermon title: ${title}

Signal already extracted from this sermon:
- Literary genre(s) of the passage: ${analysis.genres.join(', ') || 'none detected'}
- Emotional/rhetorical register(s), strongest first: ${analysis.registers.join(', ') || 'none detected'}
- Liturgical season/occasion: ${analysis.seasons.join(', ') || 'none detected'}
- Scripture references: ${scriptureList}
- Rule-based confidence in this reading: ${analysis.confidence}%
- Rule-based reasoning: ${analysis.reasoning}

Sermon text (may be truncated for length):
---
${truncateNotes(rawNotes || title)}
---

Design a single bespoke theme for this specific sermon, following every rule in
the system message. Output only the JSON object.`
}

// Observed live: Gemini sometimes writes a literal newline/tab inside a JSON
// string value (typically right after a CSS "/* comment */" line) instead of
// escaping it as \n, which JSON.parse rejects as a "bad control character."
// responseMimeType: 'application/json' does not prevent this. Repairs it by
// tracking string-boundary state and escaping only control characters that
// fall inside a string literal — text outside strings (the JSON structure
// itself) is left untouched.
function escapeBareControlCharsInStrings(text: string): string {
  let result = ''
  let inString = false
  let escapeNext = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!inString) {
      if (ch === '"') inString = true
      result += ch
      continue
    }
    if (escapeNext) {
      result += ch
      escapeNext = false
      continue
    }
    if (ch === '\\') {
      result += ch
      escapeNext = true
      continue
    }
    if (ch === '"') {
      inString = false
      result += ch
      continue
    }
    if (ch === '\n') { result += '\\n'; continue }
    if (ch === '\r') { result += '\\r'; continue }
    if (ch === '\t') { result += '\\t'; continue }
    result += ch
  }
  return result
}

/**
 * Tries, in order: direct JSON.parse, a fenced ```json code block, then the
 * widest {...} slice — first against the raw content, then again against a
 * control-character-repaired copy (see escapeBareControlCharsInStrings).
 * Gemini's responseMimeType: 'application/json' makes fenced/prose wrapping
 * unlikely, but this stays defensive rather than trusting it unconditionally.
 */
export function parseJsonLoosely(content: string): unknown {
  const buildAttempts = (text: string): Array<() => unknown> => [
    () => JSON.parse(text),
    () => {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (!match) throw new Error('no fenced block')
      return JSON.parse(match[1])
    },
    () => {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start === -1 || end === -1 || end <= start) throw new Error('no braces')
      return JSON.parse(text.slice(start, end + 1))
    },
  ]

  for (const text of [content, escapeBareControlCharsInStrings(content)]) {
    for (const attempt of buildAttempts(text)) {
      try {
        return attempt()
      } catch {
        continue
      }
    }
  }
  return null
}
