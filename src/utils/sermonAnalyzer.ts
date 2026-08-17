// Rule-based sermon analyzer.
//
// Reads sermon notes and derives a design recommendation from the text itself:
//   scripture reference -> literary genre
//   seasonal language   -> liturgical season
//   word choice         -> emotional/rhetorical register
//
// Pure and dependency-free: no network, no API key, no cost. Safe to run on the
// server or the client. Deterministic — the same notes always yield the same design.

import {
  THEME_META,
  type Genre,
  type Register,
  type Season,
  type ThemeMeta,
  GENRE_LABELS,
  REGISTER_LABELS,
  SEASON_LABELS,
} from './themeMetadata'

// ---------------------------------------------------------------------------
// Scripture books -> genre
// ---------------------------------------------------------------------------

// Keys are lowercase and punctuation-free. Numbered books are normalised so that
// "1 John", "1John", "I John" and "first john" all collapse to "1 john".
const BOOK_GENRE: Record<string, Genre> = {}

function registerBooks(genre: Genre, names: string[]) {
  for (const n of names) BOOK_GENRE[n] = genre
}

registerBooks('ot-narrative', [
  'genesis', 'gen', 'exodus', 'exod', 'ex', 'leviticus', 'lev', 'numbers', 'num',
  'deuteronomy', 'deut', 'dt', 'joshua', 'josh', 'judges', 'judg', 'ruth',
  '1 samuel', '1 sam', '2 samuel', '2 sam', '1 kings', '1 kgs', '2 kings', '2 kgs',
  '1 chronicles', '1 chron', '1 chr', '2 chronicles', '2 chron', '2 chr',
  'ezra', 'nehemiah', 'neh', 'esther', 'esth',
])

registerBooks('psalms', ['psalm', 'psalms', 'ps', 'psa', 'song of songs', 'song of solomon', 'canticles', 'lamentations', 'lam'])

registerBooks('wisdom', ['job', 'proverbs', 'prov', 'prv', 'ecclesiastes', 'eccl', 'eccles', 'qoheleth'])

registerBooks('prophets', [
  'isaiah', 'isa', 'jeremiah', 'jer', 'ezekiel', 'ezek', 'hosea', 'hos', 'joel',
  'amos', 'obadiah', 'obad', 'jonah', 'micah', 'mic', 'nahum', 'nah',
  'habakkuk', 'hab', 'zephaniah', 'zeph', 'haggai', 'hag', 'zechariah', 'zech',
  'malachi', 'mal',
])

registerBooks('gospels', ['matthew', 'matt', 'mt', 'mark', 'mk', 'luke', 'lk', 'john', 'jn'])

registerBooks('acts', ['acts', 'acts of the apostles'])

registerBooks('epistle', [
  'romans', 'rom', '1 corinthians', '1 cor', '2 corinthians', '2 cor',
  'galatians', 'gal', 'ephesians', 'eph', 'philippians', 'phil', 'philip',
  'colossians', 'col', '1 thessalonians', '1 thess', '2 thessalonians', '2 thess',
  '1 timothy', '1 tim', '2 timothy', '2 tim', 'titus', 'philemon', 'phlm',
  'hebrews', 'heb', 'james', 'jas', '1 peter', '1 pet', '2 peter', '2 pet',
  '1 john', '2 john', '3 john', 'jude',
])

registerBooks('apocalyptic', ['revelation', 'rev', 'apocalypse', 'daniel', 'dan'])

// "1", "i", "first" -> "1"
const ORDINAL_PREFIX: Record<string, string> = {
  i: '1', ii: '2', iii: '3', first: '1', second: '2', third: '3',
  '1st': '1', '2nd': '2', '3rd': '3',
}

function normaliseBookName(raw: string): string {
  let s = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
  const parts = s.split(' ')
  if (parts.length > 1 && ORDINAL_PREFIX[parts[0]]) {
    parts[0] = ORDINAL_PREFIX[parts[0]]
    s = parts.join(' ')
  }
  // "1john" -> "1 john"
  s = s.replace(/^([123])([a-z])/, '$1 $2')
  return s
}

export interface ScriptureRef {
  /** Book name as matched, title-cased for display. */
  book: string
  /** e.g. "12:18" or "12:18-21", when present. */
  location?: string
  genre: Genre
}

// Longest names first so "1 john" wins over "john", and "song of songs" over "song".
const BOOK_PATTERN = Object.keys(BOOK_GENRE)
  .sort((a, b) => b.length - a.length)
  .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s.]*'))
  .join('|')

const SCRIPTURE_RE = new RegExp(
  // optional ordinal prefix, then book name, then optional chapter:verse(-verse)
  `\\b((?:[123]|i{1,3}|first|second|third)[\\s.]*)?(${BOOK_PATTERN})\\b\\.?\\s*(\\d{1,3}\\s*[:.]\\s*\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3}(?:\\s*[:.]\\s*\\d{1,3})?)?|\\d{1,3})?`,
  'gi'
)

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase())
}

// Book names that are also ordinary English words. Without a chapter/verse number
// these produce false positives ("it is our job to act", "acts of kindness",
// "John from accounting"), so a bare mention of one is never treated as scripture.
const AMBIGUOUS_BARE = new Set([
  'job', 'acts', 'mark', 'john', 'numbers', 'judges', 'kings', '1 kings', '2 kings',
  'james', 'titus', 'jude', 'ruth', 'amos', 'revelation', 'song of songs',
])

export function extractScriptureRefs(text: string): ScriptureRef[] {
  const found: ScriptureRef[] = []
  const seen = new Set<string>()

  for (const m of text.matchAll(SCRIPTURE_RE)) {
    const prefix = (m[1] || '').trim()
    const bookRaw = m[2] || ''
    const location = (m[3] || '').replace(/\s+/g, '')

    const key = normaliseBookName(`${prefix} ${bookRaw}`.trim())
    const genre = BOOK_GENRE[key] ?? BOOK_GENRE[normaliseBookName(bookRaw)]
    if (!genre) continue

    // A reference with no chapter/verse is only credible when the book name is
    // capitalised in the source, long enough not to be an abbreviation, and not a
    // word that does double duty in ordinary English.
    if (!location) {
      const capitalised = /^[A-Z]/.test(bookRaw.trim())
      const bareKey = normaliseBookName(bookRaw)
      if (!capitalised || bareKey.length < 5 || AMBIGUOUS_BARE.has(key) || AMBIGUOUS_BARE.has(bareKey)) {
        continue
      }
    }

    const dedupeKey = `${key}|${location}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    found.push({ book: titleCase(key), location: location || undefined, genre })
  }

  return found
}

// ---------------------------------------------------------------------------
// Keyword models
// ---------------------------------------------------------------------------

type KeywordModel<K extends string> = Record<K, string[]>

// Weighted by specificity: a term appearing here scores 1 point per occurrence,
// capped per term so one repeated word cannot dominate the whole reading.
const REGISTER_KEYWORDS: KeywordModel<Register> = {
  exposition: [
    'therefore', 'context', 'greek', 'hebrew', 'literally', 'the text says',
    'verse', 'passage', 'doctrine', 'theology', 'exposition', 'structure',
    'first point', 'secondly', 'in other words', 'observe', 'note that', 'means that',
  ],
  comfort: [
    'comfort', 'do not fear', 'fear not', 'peace', 'rest', 'weary', 'burden',
    'anxious', 'anxiety', 'assurance', 'shepherd', 'refuge', 'shelter', 'gentle',
    'never leave you', 'be still', 'consolation', 'reassure', 'safe',
  ],
  lament: [
    'lament', 'grief', 'grieve', 'mourn', 'mourning', 'sorrow', 'suffering',
    'death', 'died', 'loss', 'tears', 'weep', 'weeping', 'how long', 'why lord',
    'despair', 'ashes', 'valley of the shadow', 'funeral', 'memorial',
  ],
  celebration: [
    'rejoice', 'joy', 'celebrate', 'praise', 'hallelujah', 'alleluia', 'glory to god',
    'thanksgiving', 'victory', 'triumph', 'risen', 'resurrection', 'he is alive',
    'sing', 'shout', 'feast', 'good news', 'blessing',
  ],
  conviction: [
    'sin', 'sinful', 'repent', 'repentance', 'confess', 'confession', 'guilt',
    'judgment', 'judgement', 'warning', 'wrath', 'holiness', 'turn from',
    'idolatry', 'rebellion', 'accountable', 'conviction', 'sober', 'perish',
  ],
  exhortation: [
    'go and', 'therefore go', 'obey', 'obedience', 'command', 'called to',
    'must', 'action', 'serve', 'service', 'mission', 'justice', 'love your neighbor',
    'love your neighbour', 'do not merely', 'put into practice', 'live out',
    'let us', 'apply', 'challenge', 'peaceably', 'reconcile', 'reconciliation',
    'forgive', 'forgiveness', 'unity', 'harmony', 'as far as it depends',
  ],
  awe: [
    'glory', 'majesty', 'holy holy', 'holiness of god', 'sovereign', 'sovereignty',
    'almighty', 'eternal', 'infinite', 'mystery', 'transcendent', 'awe', 'wonder',
    'throne', 'heavens declare', 'creator', 'worship', 'reverence', 'tremble',
  ],
  hope: [
    'hope', 'promise', 'await', 'awaiting', 'waiting', 'expectation', 'not yet',
    'longing', 'anticipate', 'coming', 'future', 'restore', 'restoration',
    'new creation', 'dawn', 'light will', 'one day', 'redemption',
  ],
}

const SEASON_KEYWORDS: KeywordModel<Season> = {
  advent: ['advent', 'waiting for the messiah', 'coming of christ', 'prepare the way', 'o come'],
  christmas: ['christmas', 'nativity', 'bethlehem', 'incarnation', 'word became flesh', 'manger', 'immanuel', 'emmanuel'],
  epiphany: ['epiphany', 'magi', 'wise men', 'star of', 'light of the world', 'revealed to the nations'],
  lent: ['lent', 'lenten', 'ash wednesday', 'forty days', '40 days', 'wilderness', 'fasting', 'temptation of christ'],
  'holy-week': ['holy week', 'good friday', 'maundy', 'palm sunday', 'crucifixion', 'crucified', 'the cross', 'calvary', 'golgotha', 'passion of christ'],
  easter: ['easter', 'resurrection sunday', 'he is risen', 'empty tomb', 'risen indeed', 'first fruits'],
  pentecost: ['pentecost', 'holy spirit came', 'tongues of fire', 'upper room', 'outpouring of the spirit'],
  ordinary: ['ordinary time'],
  funeral: ['funeral', 'memorial service', 'celebration of life', 'in loving memory', 'passed away', 'eulogy'],
  wedding: ['wedding', 'marriage ceremony', 'bride and groom', 'covenant of marriage', 'vows'],
  communion: ['communion', 'lord\u2019s supper', 'lords supper', 'eucharist', 'breaking of bread', 'the table', 'this is my body'],
  missions: ['missions', 'missionary', 'great commission', 'unreached', 'send', 'go into all the world', 'evangelism'],
}

/** Counts non-overlapping occurrences of a phrase, capped so repetition can't dominate. */
function countTerm(haystack: string, term: string, cap = 3): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`, 'g')
  let n = 0
  while (re.exec(haystack) !== null) {
    n++
    if (n >= cap) break
    // step back one char so adjacent matches aren't skipped
    re.lastIndex = Math.max(0, re.lastIndex - 1)
  }
  return n
}

function scoreModel<K extends string>(text: string, model: KeywordModel<K>): Record<K, number> {
  const out = {} as Record<K, number>
  for (const key of Object.keys(model) as K[]) {
    out[key] = model[key].reduce<number>((sum, term) => sum + countTerm(text, term), 0)
  }
  return out
}

function topKeys<K extends string>(scores: Record<K, number>, min = 1): K[] {
  return (Object.keys(scores) as K[])
    .filter((k) => scores[k] >= min)
    .sort((a, b) => scores[b] - scores[a])
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface ThemeScore {
  slug: string
  name: string
  score: number
  /** 0-100, relative to the best possible score for this sermon. */
  confidence: number
}

export interface SermonAnalysis {
  /** Winning theme slug. */
  themeSlug: string
  themeName: string
  confidence: number
  /** Human-readable sentence explaining the pick. */
  reasoning: string
  /** Signals the analyzer actually found, for display. */
  scripture: ScriptureRef[]
  genres: Genre[]
  registers: Register[]
  seasons: Season[]
  /** Every theme, best first — powers "other good fits". */
  ranked: ThemeScore[]
}

const W_REGISTER_PRIMARY = 6
const W_REGISTER_SECONDARY = 3
const W_SEASON = 7
const W_GENRE = 4

function scoreTheme(
  theme: ThemeMeta,
  registers: Register[],
  genres: Genre[],
  seasons: Season[]
): number {
  let score = 0
  let matched = 0

  // Register: the strongest single signal. Primary register counts double.
  registers.forEach((r, i) => {
    if (!theme.registers.includes(r)) return
    score += i === 0 ? W_REGISTER_PRIMARY : W_REGISTER_SECONDARY / (i + 1)
    matched++
  })

  // Season overrides register on the high holy days, so it is weighted highest.
  seasons.forEach((s, i) => {
    if (!theme.seasons.includes(s)) return
    score += W_SEASON / (i + 1)
    matched++
  })

  genres.forEach((g, i) => {
    if (!theme.genres.includes(g)) return
    score += W_GENRE / (i + 1)
    matched++
  })

  if (score === 0) return 0

  // Precision bonus. Two themes can accumulate identical raw scores while claiming
  // very different breadth — a specialist that lists one register and hits it is a
  // better answer than a generalist that lists six and hits one. Without this,
  // ties fall back to declaration order in THEME_META, which is meaningless.
  const breadth = theme.registers.length + theme.genres.length + theme.seasons.length
  const precision = matched / breadth
  return score * (1 + 0.35 * precision)
}

/**
 * Analyze sermon notes and recommend a theme.
 *
 * Falls back to a sensible sermon-safe default when the notes carry no usable
 * signal (very short notes, or a topic with no scripture and no seasonal language).
 */
export function analyzeSermon(rawNotes: string): SermonAnalysis {
  const text = ` ${(rawNotes || '').toLowerCase().replace(/\s+/g, ' ')} `

  const scripture = extractScriptureRefs(rawNotes || '')

  // Genre comes from scripture references, ranked by how often each genre appears.
  const genreCounts = scripture.reduce<Record<string, number>>((acc, r) => {
    acc[r.genre] = (acc[r.genre] || 0) + 1
    return acc
  }, {})
  const genres = Object.keys(genreCounts).sort(
    (a, b) => genreCounts[b] - genreCounts[a]
  ) as Genre[]

  const registerScores = scoreModel(text, REGISTER_KEYWORDS)
  const seasonScores = scoreModel(text, SEASON_KEYWORDS)

  const registers = topKeys(registerScores)
  const seasons = topKeys(seasonScores)

  const ranked: ThemeScore[] = THEME_META.map((theme) => ({
    slug: theme.slug,
    name: theme.name,
    score: scoreTheme(theme, registers, genres, seasons),
  }))
    .sort((a, b) => b.score - a.score)
    .map((t) => ({ ...t, confidence: 0 }))

  const best = ranked[0]
  const maxScore = best?.score ?? 0

  // No signal at all -> a dependable, non-committal default rather than a coin flip.
  if (maxScore === 0) {
    const fallback = THEME_META.find((t) => t.slug === 'paper-ink') ?? THEME_META[0]
    return {
      themeSlug: fallback.slug,
      themeName: fallback.name,
      confidence: 25,
      reasoning:
        'These notes did not carry a clear scripture reference, seasonal language, or emotional register, so this is a restrained, readable default that suits almost any message. Add a passage reference or more of your manuscript for a sharper match.',
      scripture: [],
      genres: [],
      registers: [],
      seasons: [],
      ranked: ranked.map((t) => ({ ...t, confidence: 0 })),
    }
  }

  const withConfidence = ranked.map((t) => ({
    ...t,
    confidence: Math.round((t.score / maxScore) * 100),
  }))

  return {
    themeSlug: best.slug,
    themeName: best.name,
    confidence: Math.min(99, Math.round(30 + Math.min(maxScore, 20) * 3.5)),
    reasoning: buildReasoning(best.name, registers, genres, seasons),
    scripture,
    genres,
    registers,
    seasons,
    ranked: withConfidence,
  }
}

function buildReasoning(
  themeName: string,
  registers: Register[],
  genres: Genre[],
  seasons: Season[]
): string {
  const clauses: string[] = []

  if (seasons.length) {
    clauses.push(`seasonal language pointing to ${SEASON_LABELS[seasons[0]].toLowerCase()}`)
  }
  if (genres.length) {
    clauses.push(`a passage from ${GENRE_LABELS[genres[0]].toLowerCase()}`)
  }
  if (registers.length) {
    clauses.push(`a tone of ${REGISTER_LABELS[registers[0]].toLowerCase()}`)
  }

  if (!clauses.length) return `${themeName} is a dependable fit for these notes.`

  const list =
    clauses.length === 1
      ? clauses[0]
      : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`

  return `Your notes show ${list}; ${themeName} matches that.`
}
