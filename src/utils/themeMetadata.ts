// Plain, serializable theme metadata.
//
// This module deliberately contains NO functions and NO CSS so it can be imported
// from both server components and client components without dragging the whole
// rendering engine (slideTemplates.ts) into the client bundle.
//
// slideTemplates.ts owns *how a theme looks*.
// This file owns *what a theme is for* — which is what the sermon analyzer matches against.

export type Scheme = 'dark' | 'light' | 'mixed'

/** The dominant emotional / rhetorical mode a sermon lands on. */
export type Register =
  | 'exposition'
  | 'comfort'
  | 'lament'
  | 'celebration'
  | 'conviction'
  | 'exhortation'
  | 'awe'
  | 'hope'

/** Literary genre of the primary passage. */
export type Genre =
  | 'ot-narrative'
  | 'psalms'
  | 'wisdom'
  | 'prophets'
  | 'gospels'
  | 'acts'
  | 'epistle'
  | 'apocalyptic'

/** Liturgical season or special service. */
export type Season =
  | 'advent'
  | 'christmas'
  | 'epiphany'
  | 'lent'
  | 'holy-week'
  | 'easter'
  | 'pentecost'
  | 'ordinary'
  | 'funeral'
  | 'wedding'
  | 'communion'
  | 'missions'

export interface ThemeMeta {
  slug: string
  name: string
  /** Short uppercase chip shown on the selection card. */
  tag: string
  /** One-line card description. */
  description: string
  scheme: Scheme
  /** 1 = casual, 5 = highly formal. */
  formality: number
  registers: Register[]
  genres: Genre[]
  seasons: Season[]
}

export const REGISTER_LABELS: Record<Register, string> = {
  exposition: 'Exposition & teaching',
  comfort: 'Comfort & pastoral care',
  lament: 'Lament & grief',
  celebration: 'Celebration & praise',
  conviction: 'Conviction & repentance',
  exhortation: 'Exhortation & call to action',
  awe: 'Awe & transcendence',
  hope: 'Hope & expectation',
}

export const GENRE_LABELS: Record<Genre, string> = {
  'ot-narrative': 'Old Testament narrative',
  psalms: 'Psalms & poetry',
  wisdom: 'Wisdom literature',
  prophets: 'The Prophets',
  gospels: 'Gospels & parables',
  acts: 'Acts & church history',
  epistle: 'Epistle & doctrine',
  apocalyptic: 'Apocalyptic',
}

export const SEASON_LABELS: Record<Season, string> = {
  advent: 'Advent',
  christmas: 'Christmas',
  epiphany: 'Epiphany',
  lent: 'Lent',
  'holy-week': 'Holy Week',
  easter: 'Easter',
  pentecost: 'Pentecost',
  ordinary: 'Ordinary Time',
  funeral: 'Funeral or memorial',
  wedding: 'Wedding',
  communion: 'Communion',
  missions: 'Missions',
}

export const THEME_META: ThemeMeta[] = [
  {
    slug: 'bold-signal',
    name: 'Bold Signal',
    tag: 'Dark / High Contrast',
    description:
      'Confident visual language with vivid orange accents and bold typography designed to hold attention.',
    scheme: 'dark',
    formality: 2,
    // Deliberately does NOT claim 'conviction' — this is a high-energy proclamation
    // theme, and letting it compete for repentance messages beat out Broadside.
    registers: ['celebration', 'exhortation'],
    genres: ['acts'],
    seasons: ['pentecost', 'missions'],
  },
  {
    slug: 'dark-botanical',
    name: 'Dark Botanical',
    tag: 'Dark / Warm Luxury',
    description:
      'Refined serif typography on warm black background with soft gold accent glows for reflective messages.',
    scheme: 'dark',
    formality: 4,
    registers: ['awe', 'hope', 'comfort'],
    genres: ['psalms', 'apocalyptic'],
    seasons: ['advent', 'christmas'],
  },
  {
    slug: 'vintage-editorial',
    name: 'Vintage Editorial',
    tag: 'Light / Vintage Paper',
    description:
      'Clean cream-paper styling with classic editorial typography and structured frame layouts.',
    scheme: 'light',
    formality: 3,
    registers: ['exposition', 'exhortation'],
    genres: ['gospels', 'epistle'],
    seasons: ['ordinary'],
  },
  {
    slug: 'paper-ink',
    name: 'Paper & Ink',
    tag: 'Light / Literary',
    description:
      'Warm cream page with a single crimson accent and classical serif type. Quiet, literary, unhurried.',
    scheme: 'light',
    formality: 5,
    registers: ['exposition', 'comfort', 'lament'],
    genres: ['psalms', 'wisdom', 'epistle'],
    seasons: ['funeral', 'lent', 'ordinary'],
  },
  {
    slug: 'vellum',
    name: 'Vellum',
    tag: 'Dark / Scholarly',
    description:
      'Deep navy canvas with warm-gold serif headlines and a dusty teal accent. A quiet, scholarly aesthetic.',
    scheme: 'dark',
    formality: 5,
    registers: ['exposition', 'awe', 'hope'],
    genres: ['epistle', 'apocalyptic', 'wisdom'],
    seasons: ['advent', 'holy-week'],
  },
  {
    slug: 'grove',
    name: 'Grove',
    tag: 'Dark / Natural',
    description:
      'Forest-green canvas with cream classical serifs and a single rust accent. Rooted and patient.',
    scheme: 'dark',
    formality: 4,
    registers: ['comfort', 'awe', 'hope'],
    genres: ['psalms', 'ot-narrative'],
    seasons: ['christmas', 'ordinary', 'communion', 'funeral'],
  },
  {
    slug: 'monochrome',
    name: 'Monochrome',
    tag: 'Light / Restrained',
    description:
      'Ivory ledger paper with all-black type and no color at all. Sober, honest, and completely undistracting.',
    scheme: 'light',
    formality: 5,
    registers: ['lament', 'conviction', 'exposition'],
    genres: ['wisdom', 'prophets', 'epistle'],
    seasons: ['holy-week', 'funeral', 'lent'],
  },
  {
    slug: 'soft-editorial',
    name: 'Soft Editorial',
    tag: 'Light / Gentle',
    description:
      'Elegant serif on warm paper with sage and blush accents. Gentle, spacious, and pastoral.',
    scheme: 'light',
    formality: 4,
    registers: ['comfort', 'hope', 'celebration'],
    genres: ['psalms', 'gospels'],
    seasons: ['wedding', 'communion', 'ordinary'],
  },
  {
    slug: 'broadside',
    name: 'Broadside',
    tag: 'Dark / Editorial',
    description:
      'Dark editorial canvas with a single fire-orange accent and heavy newspaper-weight headlines.',
    scheme: 'dark',
    formality: 3,
    registers: ['conviction', 'exhortation', 'lament'],
    genres: ['prophets', 'apocalyptic'],
    seasons: ['lent', 'holy-week', 'pentecost'],
  },
  {
    slug: 'stencil-tablet',
    name: 'Stencil & Tablet',
    tag: 'Light / Archival',
    description:
      'Bone paper with stencil-cut headlines and an earth palette. Ancient, tactile, and weighty.',
    scheme: 'light',
    formality: 4,
    registers: ['exposition', 'conviction', 'exhortation'],
    genres: ['ot-narrative', 'prophets'],
    seasons: ['missions', 'lent'],
  },
  {
    slug: 'long-table',
    name: 'Long Table',
    tag: 'Light / Hospitable',
    description:
      'Warm cream and rust-red with bold uppercase headlines. Gathered, generous, and human.',
    scheme: 'light',
    formality: 2,
    registers: ['celebration', 'comfort', 'exhortation'],
    genres: ['gospels', 'acts'],
    seasons: ['communion', 'ordinary', 'wedding'],
  },
  {
    slug: 'cobalt-grid',
    name: 'Cobalt Grid',
    tag: 'Light / Studious',
    description:
      'Electric cobalt serifs on a graph-paper canvas with hairline rules. Built for structured teaching.',
    scheme: 'light',
    formality: 4,
    registers: ['exposition'],
    genres: ['epistle', 'wisdom'],
    seasons: ['ordinary'],
  },
  {
    slug: 'biennale-yellow',
    name: 'Biennale Yellow',
    tag: 'Light / Radiant',
    description:
      'Solar yellow on warm parchment with deep indigo serifs and atmospheric sun-glow gradients.',
    scheme: 'light',
    formality: 3,
    registers: ['celebration', 'hope', 'awe'],
    genres: ['gospels', 'psalms', 'acts'],
    seasons: ['easter', 'epiphany', 'advent'],
  },
]

export const THEME_META_BY_SLUG: Record<string, ThemeMeta> = Object.fromEntries(
  THEME_META.map((t) => [t.slug, t])
)

/** Sentinel slug for "let the app choose based on the sermon". */
export const AUTO_THEME_SLUG = 'auto'

/** Sentinel slug for "use the AI-authored bespoke design generated for this sermon". */
export const AI_CUSTOM_THEME_SLUG = 'ai-custom'
