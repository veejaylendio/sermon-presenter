# SermonPresenter — Developer Guide

This document is the single source of truth for understanding, running, and extending
this codebase without needing to ask the original author questions. If something here
goes stale, trust the code and update this doc in the same PR.

---

## 1. Overview

**SermonPresenter** (package name `tmp-app`) is a web app that turns raw preaching /
sermon notes into a styled, presentable slideshow.

**What it does:**

1. A user pastes their sermon notes into a textarea.
2. The app splits the notes into slides using a strict rule: **any blank line starts a
   new slide**. Nothing more complex than that — no AI involved in the split itself.
3. The user picks a visual style — either one of 14 built-in themes, an "Auto" pick
   derived from the sermon's content (scripture book, liturgical season, emotional
   tone), or a bespoke one-off design generated live by an LLM (Google Gemini).
4. The app renders a full, self-contained HTML slide deck and stores it in Supabase
   Storage.
5. The user views the deck embedded in the app (never as a downloadable file), edits
   slide text/widgets inline, and enters **Present Mode** — a fullscreen view with a
   presenter control dock (prev/next, slide counter, fullscreen toggle).

**Target users:** pastors, preachers, and worship leaders who want a fast, decent-looking
slideshow from their notes without opening PowerPoint or Keynote.

**Key features:**
- Blank-line slide parsing with live preview while typing.
- 14 curated presentation themes (via the `frontend-slides` design system, vendored as a
  git submodule) covering dark/light, formal/casual registers.
- Rule-based "Auto" theme recommendation (`sermonAnalyzer.ts`) — no network call, purely
  regex/keyword scoring over scripture references, liturgical season language, and
  emotional register.
- Optional AI-custom theme: a one-off design authored per-sermon by Gemini
  (`gemini-flash-latest`), generated in the background and polled by the client.
- In-browser deck editor (owned by the `frontend-slides` generated HTML/JS, not this
  app's React code) with autosave back to Supabase Storage.
- Supabase Auth (email/password) with row-level security scoping every row to its
  owning user.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, Server Actions, `after()` background execution) |
| UI | **React 19** |
| Language | **TypeScript** (strict mode) |
| Database / Auth / Storage | **Supabase** (Postgres + Row-Level Security, Supabase Auth, Supabase Storage) |
| Supabase SDKs | `@supabase/supabase-js`, `@supabase/ssr` (cookie-based SSR session handling) |
| AI (optional feature) | **Google AI Studio / Gemini** (`gemini-flash-latest`) for the "AI-custom" theme |
| Slide design engine | **`frontend-slides`** — a git submodule / Claude Code skill that owns the actual HTML/CSS slide templates and in-deck editor JS |
| Linting | ESLint 9 (`eslint-config-next`, flat config) |
| Fonts | `next/font/google` — Outfit (sans) + Playfair Display (serif) |

> ⚠️ **Read `AGENTS.md` before writing code.** This project pins **Next.js 16.2.10**,
> which is newer than most training data for AI coding assistants. Conventions (Server
> Actions, `after()`, caching, routing) may differ from what you expect — check
> `node_modules/next/dist/docs/` for the version actually installed before assuming an
> API works the way an older Next.js did.

No test framework, no CSS framework (styling is hand-written inline styles + a small
`globals.css` design-token stylesheet), no state management library — this is a small,
server-action-driven app, not a large SPA.

---

## 3. Project Structure

```
Sermon-Presenter/
├── AGENTS.md / CLAUDE.md      # Instructions for AI coding agents working in this repo
├── next.config.ts             # Raises Server Action body limit to 10mb (deck autosave)
├── eslint.config.mjs
├── tsconfig.json              # Path alias: @/* -> ./src/*
├── .env.local                 # Local secrets (gitignored) — see §5
├── .mcp.json                  # Supabase MCP server config — contains a live access
│                               #   token, gitignored, DO NOT commit
│
├── supabase/
│   └── schema.sql             # Full DB schema, RLS policies, and the new-user trigger.
│                               # This is the source of truth for the DB — there is no
│                               # separate migrations/ folder in this repo.
│
├── docs/
│   ├── DEVELOPER_GUIDE.md     # This file
│   ├── build-prompt.md        # Original spec used to bootstrap the app (historical —
│   │                           # schema has since evolved past what's written there)
│   └── flow-chart.md          # ER diagram + plain-English walkthrough of the schema
│
├── frontend-slides/           # Git submodule (github.com/veejaylendio/frontend-slides).
│                               # Owns slide *design* — themes, CSS, in-deck editor JS.
│                               # This app's code never hand-rolls slide HTML/CSS; see
│                               # src/utils/slideTemplates.ts, which is this app's own
│                               # port/adaptation of that design system into TS functions.
│
├── public/                    # Static assets (default Next.js SVGs, favicon)
│
└── src/
    ├── middleware.ts          # Runs Supabase session refresh + route protection on
    │                           # every request (see matcher config inside the file)
    │
    ├── app/
    │   ├── layout.tsx         # Root layout: fonts, <html>, metadata
    │   ├── page.tsx           # Public marketing/landing page ("/") — redirects signed-in
    │   │                       # users straight to /sermons
    │   ├── globals.css        # Design tokens (CSS custom properties) + shared classes
    │   │                       # (.glass, .btn, .badge, .input-field, etc.)
    │   │
    │   ├── login/page.tsx     # Login form -> auth/actions.ts#login
    │   ├── register/page.tsx  # Signup form -> auth/actions.ts#signup
    │   ├── auth/actions.ts    # Server Actions: login, signup, signOut
    │   │
    │   ├── sermons/
    │   │   ├── page.tsx               # Dashboard: list of sermons, Generate/View/Delete
    │   │   ├── actions.ts              # THE core server-side logic (see §9)
    │   │   ├── new/page.tsx            # "New Sermon" — paste notes, live slide preview
    │   │   └── [id]/
    │   │       ├── generate/
    │   │       │   ├── page.tsx              # Server component: fetches sermon + builds
    │   │       │   │                          #   theme previews
    │   │       │   └── ThemeSelectorClient.tsx # Client component: theme picker UI,
    │   │       │                                #   AI-theme generation + polling
    │   │       └── view/
    │   │           ├── page.tsx                    # Server component: guards on
    │   │           │                                #   presentation.status === 'generated'
    │   │           └── PresentationViewerClient.tsx # Client component: iframe host for
    │   │                                              #   the generated deck, Edit/Present
    │   │                                              #   mode toggle, autosave plumbing
    │   │
    │   └── api/
    │       └── proxy-html/route.ts   # GET proxy that re-fetches a Supabase Storage
    │                                  #   HTML URL with cache disabled (works around
    │                                  #   CDN caching stale decks after regeneration)
    │
    ├── components/
    │   └── DeleteSermonButton.tsx    # Client component wrapping the delete Server Action
    │                                  #   with a confirm() dialog
    │
    └── utils/
        ├── sermonParser.ts       # parseSermonNotes() — the blank-line slide-split rule
        │                          #   + getSermonTitle()
        ├── sermonAnalyzer.ts     # analyzeSermon() — rule-based (no network) theme
        │                          #   recommendation from scripture/season/register signal
        ├── themeMetadata.ts      # Plain data: the 14-theme catalog's metadata (register/
        │                          #   genre/season tags), used by both analyzer and UI.
        │                          #   Deliberately has NO functions/CSS so it's safe to
        │                          #   import into client components.
        ├── slideTemplates.ts     # THE big one (~5,300 lines): actual CSS/HTML per theme,
        │                          #   generatePreviewHtml(), generatePresentationHtml()
        ├── aiThemePrompt.ts      # Builds the Gemini system/user prompt for AI-custom
        │                          #   themes; loose JSON parsing/repair of the LLM reply
        ├── aiThemeSanitizer.ts   # Validates/sanitizes the LLM's theme JSON before it can
        │                          #   ever be rendered (blocks <script>, event handlers,
        │                          #   non-Google-Fonts hosts, banned words, etc.)
        └── supabase/
            ├── client.ts         # Browser Supabase client (createBrowserClient)
            ├── server.ts         # Server Component / Server Action Supabase client
            │                      #   (cookie-based, createServerClient)
            └── middleware.ts     # updateSession() — refreshes the auth cookie and
                                   #   enforces route protection; called from middleware.ts
```

---

## 4. Getting Started

### Prerequisites

- **Node.js** (version matching `@types/node ^20` — Node 20 LTS recommended)
- **npm** (repo has a committed `package-lock.json`)
- A **Supabase project** (free tier is fine) — see §5 for what to configure in it
- *(Optional, for the AI-custom theme feature only)* a **Google AI Studio** API key

### Installation

```bash
# Clone with the frontend-slides submodule
git clone --recurse-submodules <repo-url>
cd Sermon-Presenter

# If already cloned without submodules:
git submodule update --init --recursive

npm install
```

### Set up Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` against it (Supabase Dashboard → SQL Editor, paste and
   run — this is the entire schema, RLS policies, and the `handle_new_user` trigger in
   one file).
3. Create a **Storage bucket named `presentations`** and make it public (the app calls
   `.storage.from('presentations').getPublicUrl(...)` and expects an anonymously
   readable URL back — private buckets will break the viewer and the proxy route).
4. Copy your project's URL and anon/public key into `.env.local` (see §5).

### Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`. The landing page redirects signed-in users to
`/sermons`; new users should hit `/register` first (a `profiles` row is auto-created by
the `handle_new_user` Postgres trigger on signup — no app-side code creates it).

### Other scripts

```bash
npm run build   # production build
npm run start   # run the production build
npm run lint    # ESLint
```

There is no test suite in this repo currently.

---

## 5. Environment Variables / Configuration

All variables live in `.env.local` (gitignored — never commit real values). Sample keys
present in this repo's local file:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. Public (client-exposed) by the `NEXT_PUBLIC_` prefix — safe, this is meant to be public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public API key. Also client-exposed by design — RLS policies in `supabase/schema.sql` are what actually restrict access, not secrecy of this key. |
| `OPENROUTER_API_KEY` | No (currently unused by any code path found in `src/`) | Present in the sample env file; not referenced anywhere in `src/`. Confirm with whoever set it up before relying on it, or remove it if dead. |
| `GOOGLE_AI_STUDIO_API_KEY` | Only for the AI-custom theme feature | Read server-side only in `src/app/sermons/actions.ts` (`requestAiTheme`). Without it, `generateAiCustomTheme()` fails immediately with `'AI design generation is not configured.'` — every other feature (parsing, catalog themes, Auto theme, present mode) works fine without it. |

**Note on `.mcp.json`:** this repo also has a `.mcp.json` at the root configuring a
Supabase MCP server for AI coding assistants. It embeds a live Supabase **access
token** directly in the file. It's already gitignored (see the comment above its entry
in `.gitignore`) — do not remove it from `.gitignore`, and rotate the token if it is
ever exposed.

**Next.js config note:** `next.config.ts` raises the Server Action body size limit to
`10mb`, specifically because `saveDeckHtml()` (autosave for the in-deck editor)
re-uploads the entire generated deck's HTML/CSS/JS on every save. If you see a Server
Action payload-too-large error, this is the first place to look.

---

## 6. Architecture

```
Browser
  │
  ├─ Next.js Middleware (src/middleware.ts)
  │     Refreshes Supabase session cookie on every request; redirects
  │     unauthenticated users away from protected routes, and authenticated
  │     users away from /login and /register.
  │
  ├─ Server Components (app/**/page.tsx)
  │     Read data directly via the Supabase server client (src/utils/supabase/server.ts),
  │     which is RLS-scoped to the logged-in user's cookie session. No separate
  │     API/backend layer for reads.
  │
  ├─ Server Actions ('use server' functions)
  │     - src/app/auth/actions.ts     → login / signup / signOut
  │     - src/app/sermons/actions.ts  → createSermon, deleteSermon, selectThemeAndGenerateDeck,
  │                                      generateAiCustomTheme, getAiThemeStatus, saveDeckHtml
  │     Client components call these directly as functions (Next.js serializes the
  │     call over the wire) — there is no hand-written REST/JSON API for app data.
  │
  ├─ Client Components ('use client')
  │     - ThemeSelectorClient.tsx  → theme picker, polls getAiThemeStatus() every 3s
  │       while an AI theme is generating
  │     - PresentationViewerClient.tsx → hosts the generated deck in an <iframe>,
  │       talks to it via postMessage (slide nav, save-on-edit, present/edit mode)
  │     - NewSermonPage           → live client-side call to parseSermonNotes() as
  │       the user types, for the instant slide-preview panel
  │
  └─ Generated deck (<iframe> content)
        A fully self-contained HTML document (inline CSS + JS) produced by
        generatePresentationHtml() / generatePreviewHtml() in slideTemplates.ts,
        uploaded to Supabase Storage, and loaded either directly or through
        /api/proxy-html (to bypass any CDN caching of a just-regenerated deck).
        This HTML owns its own in-browser slide editor and communicates upward to
        PresentationViewerClient via window.postMessage — it is NOT React and is
        not part of this app's component tree.

Supabase (external)
  ├─ Postgres — sermons, slides, presentations, style_previews, presentation_slides,
  │              presentation_sessions, profiles (see §8), all RLS-protected
  ├─ Auth — email/password; a Postgres trigger (handle_new_user) mirrors new
  │          auth.users rows into public.profiles
  └─ Storage — bucket "presentations": generated deck HTML at
               generated/{presentationId}/index.html, and (optionally) style preview
               HTML at previews/{presentationId}/{theme}.html

External API (optional)
  └─ Google AI Studio (Gemini) — called only from generateAiCustomTheme's background
     job (src/app/sermons/actions.ts, runAiThemeGeneration → requestAiTheme), which
     runs via Next's after() so it doesn't block the request/response cycle. Client
     polls getAiThemeStatus() for the result rather than getting it pushed.
```

**Ownership boundary worth knowing:** this app's own code (`src/`) handles auth, CRUD,
theme selection/storage, and the presenter chrome (prev/next/fullscreen dock). The
actual visual design of a slide deck — CSS, layout, the in-deck WYSIWYG editor — is
owned by `slideTemplates.ts` (an adaptation of the `frontend-slides` design system) and
the HTML/JS it emits. If a bug is about how a slide *looks* or how in-deck *editing*
behaves, look there first, not in the React components.

---

## 7. API Documentation

This app has **no conventional REST/JSON API** for its own data — Server Actions are the
entire data-mutation surface, called as plain async functions from client components
(Next.js handles the wire protocol). There is exactly one real HTTP route handler:

### `GET /api/proxy-html?url=<encoded-url>`

Proxies and re-serves HTML content from a given URL (in practice, always a Supabase
Storage public URL for a generated deck), forcing `Cache-Control: no-store` on both the
outbound fetch and the response. Exists because decks are regenerated in place at the
same storage path — without this, a CDN or browser cache would keep serving a
previously-generated theme after the user picks a new one.

- **Query params:** `url` (required) — the upstream HTML URL to fetch and relay.
- **Response:** the fetched HTML body, `Content-Type: text/html; charset=utf-8`.
- **Errors:** `400` if `url` is missing; passes through the upstream status code on a
  failed fetch; `500` on a network/fetch exception.
- **Auth:** none enforced by this route itself — access control lives on the Supabase
  Storage bucket/object, not here.

### Server Actions (call as functions from client components, not via `fetch`)

All defined in `src/app/sermons/actions.ts` unless noted. Each does its own
`supabase.auth.getUser()` check or relies on RLS to scope/deny access — see the source
for exact per-action authorization logic (some throw `'Unauthorized'` explicitly, others
rely on RLS returning no rows for a call on data you don't own).

| Action | Purpose |
|---|---|
| `login(formData)` / `signup(formData)` / `signOut()` (`auth/actions.ts`) | Supabase Auth email/password flows. Redirect on success/failure; failures redirect back with `?error=` in the query string. |
| `createSermon(rawNotes: string)` | Parses notes into slides, inserts `sermons` + `slides` rows + a stub `presentations` row (`status: 'not_generated'`). Rolls back the sermon insert if slide/presentation insert fails. |
| `deleteSermon(id: string)` | Deletes a sermon row (cascades to slides/presentations/etc. via FK `on delete cascade`). |
| `generatePreviews(sermonId)` | **Legacy/unused by current UI** — uploads one preview HTML per theme to Storage. Superseded by inline preview rendering via `generatePreviewHtml()`; kept for cases needing a durable, shareable preview URL. |
| `generateAiCustomTheme(sermonId)` | Kicks off a background LLM call (via `after()`) to author a bespoke theme; returns `{status: 'pending'}` immediately. |
| `getAiThemeStatus(sermonId)` | Polled by the client every 3s while pending. Returns `idle \| pending \| ready \| failed`, with a rendered preview HTML and/or the sanitized theme data. |
| `selectThemeAndGenerateDeck(sermonId, themeSlug)` | Resolves `themeSlug` (`'auto'`, `'ai-custom'`, or a catalog slug), renders the full deck HTML, uploads it to Storage with a cache-busting `?v=timestamp` query param, populates `presentation_slides`, and flips `presentations.status` to `'generated'`. |
| `saveDeckHtml(presentationId, html)` | Re-uploads the in-iframe-edited deck HTML over the same storage path (autosave from the deck editor). Ownership-checked via an RLS-filtered `select` before touching Storage. |

---

## 8. Database Schema

Source of truth: **`supabase/schema.sql`** (run this file directly against Postgres —
there is no separate migrations directory/tool in this repo). See also
`docs/flow-chart.md` for an ER diagram with plain-English descriptions of each table
(written for an earlier version of the schema — `presentations.custom_theme`,
`ai_theme_status`, and `ai_theme_error` were added later; `schema.sql` is authoritative).

### Tables

**`profiles`** — mirrors `auth.users`, one row per user.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `references auth.users(id) on delete cascade` |
| `full_name` | text | |
| `email` | text | |

Auto-populated on signup by the `handle_new_user()` trigger function
(`on_auth_user_created`, fires `after insert on auth.users`).

**`sermons`** — one row per pasted set of notes.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users` | not null |
| `title` | text | derived from slide 1's first line |
| `raw_notes` | text | not null; the original pasted text |
| `status` | text | `draft \| parsed` |
| `created_at` | timestamptz | default `now()` |

**`slides`** — the blank-line-split result of a sermon's notes.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sermon_id` | uuid FK → `sermons`, `on delete cascade` | not null |
| `order_index` | int | not null |
| `content` | text | not null |

**`presentations`** — the "generated deck" record for a sermon (1:1 in practice, though
modeled as 1:many).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sermon_id` | uuid FK → `sermons`, `on delete cascade` | not null |
| `theme_slug` | text | catalog slug, or the `'ai-custom'` sentinel |
| `custom_theme` | jsonb | sanitized AI-authored `CustomThemeData`, or null |
| `ai_theme_status` | text | `idle \| pending \| ready \| failed` |
| `ai_theme_error` | text | last failure message; cleared on new attempt |
| `content_storage_path` | text | the generated deck's public Storage URL (versioned with `?v=`) — internal, never surfaced to the user as a "file" |
| `public_share_url` | text | optional Vercel deploy link (share feature — not wired up in current UI code) |
| `pdf_storage_path` | text | set only if/when PDF export is used (not currently wired up in `src/`) |
| `status` | text | `not_generated \| previewing_styles \| generating \| generated` — drives the Generate/View button on the dashboard |
| `generated_at` | timestamptz | |
| `shared_at` | timestamptz | |

**`style_previews`** — one row per catalog theme once previews are generated (only
populated by the legacy `generatePreviews()` action; current UI renders previews
inline without writing this table on the preview step, but still writes `is_selected`
here at generation time).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `presentation_id` | uuid FK → `presentations`, cascade | not null |
| `theme_slug` | text | not null |
| `preview_thumbnail_url` | text | |
| `is_selected` | boolean | default false |

**`presentation_slides`** — powers the filmstrip/thumbnail concept; one row per slide
in a generated presentation.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `presentation_id` | uuid FK → `presentations`, cascade | not null |
| `slide_id` | uuid FK → `slides`, `on delete set null` | |
| `order_index` | int | not null |
| `thumbnail_url` | text | currently always `null` — control panel renders layout-based text previews instead of images |

**`presentation_sessions`** — live "who's presenting, on what slide, for how long"
state, wired for Supabase Realtime multi-screen sync (schema is present; a second
"audience display" screen consuming this table is not implemented in current `src/`
code — Present Mode today is single-screen/local only).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `presentation_id` | uuid FK → `presentations`, cascade | not null |
| `screen_label` | text | |
| `current_slide_index` | int | default 0 |
| `elapsed_seconds` | int | default 0 |
| `status` | text | `active \| ended` |

### Relationships

```
profiles 1───1 auth.users
sermons  N───1 auth.users (user_id)
slides   N───1 sermons (cascade delete)
presentations N───1 sermons (cascade delete)   -- modeled N:1, used as 1:1
style_previews N───1 presentations (cascade delete)
presentation_slides N───1 presentations (cascade delete)
presentation_slides N───1 slides (set null on delete)
presentation_sessions N───1 presentations (cascade delete)
```

### Row-Level Security

Every table has RLS **enabled**, and every policy ultimately traces ownership back to
`sermons.user_id = auth.uid()` — either directly (`sermons`, `slides`) or via a nested
`exists (...)` subquery joining through `presentations → sermons` (`style_previews`,
`presentation_slides`, `presentation_sessions`). `profiles` policies are scoped to
`auth.uid() = id` directly. **Supabase Storage objects are not covered by these
Postgres RLS policies** — the `presentations` bucket's own access rules (public-read, in
this app's design) are what govern object access, and app code (e.g.
`saveDeckHtml`) does its own ownership check via a table `select` before writing to
Storage.

---

## 9. Key Modules/Features

- **Slide splitting** — [`src/utils/sermonParser.ts`](../src/utils/sermonParser.ts).
  The entire rule is: normalize line endings, split on one-or-more blank lines, trim
  and drop empties. `getSermonTitle()` takes the first line of slide 1. This is
  intentionally dumb and deterministic — resist the urge to make it "smarter" with NLP;
  that was an explicit non-goal in the original spec (`docs/build-prompt.md`).

- **Rule-based theme recommendation ("Auto")** —
  [`src/utils/sermonAnalyzer.ts`](../src/utils/sermonAnalyzer.ts). Pure, offline, no
  API key needed. Extracts scripture references via regex against a book-name table →
  maps to literary genre; scores keyword models for emotional "register" (comfort,
  lament, celebration, conviction, etc.) and liturgical season; scores all 14 themes in
  `themeMetadata.ts` against that signal and returns the best match plus reasoning text
  shown in the UI. Falls back to the `paper-ink` theme when there's no usable signal.

- **AI-custom theme generation** —
  [`src/app/sermons/actions.ts`](../src/app/sermons/actions.ts) (`generateAiCustomTheme`,
  `runAiThemeGeneration`, `requestAiTheme`) +
  [`src/utils/aiThemePrompt.ts`](../src/utils/aiThemePrompt.ts) +
  [`src/utils/aiThemeSanitizer.ts`](../src/utils/aiThemeSanitizer.ts). Calls Gemini with
  a detailed design-rules system prompt, asking for CSS + two Mustache-style HTML
  templates (never full documents, never `<script>`). Runs in the background via Next's
  `after()`, retries up to 3 times on transient failures (timeout/malformed output; not
  on config errors or hard HTTP errors), and the result is **strictly sanitized**
  (`sanitizeCustomTheme`) before it can ever be rendered — this is the one place in the
  app that treats external/LLM input as untrusted enough to need an allowlist-based
  validator (blocks `<script>`, `javascript:`, event-handler attributes, non-Google-Fonts
  `fontsLink` hosts, banned marketing words, unbalanced/unsupported template sections).

- **Deck rendering** —
  [`src/utils/slideTemplates.ts`](../src/utils/slideTemplates.ts) (~5,300 lines).
  `THEMES` is the 14-entry catalog (each a `ThemeConfig` with its own CSS + a
  `renderSlide` function). `generatePreviewHtml()` renders a single-slide preview (used
  in the theme picker); `generatePresentationHtml()` renders the complete multi-slide,
  self-contained deck (inline CSS + JS, includes the in-deck editor) that gets uploaded
  to Storage. Both accept either a catalog theme slug or a `CustomThemeData` object (the
  AI-custom path) via `resolveThemeConfig()`.

- **Deck viewing / editing / presenting** —
  [`PresentationViewerClient.tsx`](../src/app/sermons/[id]/view/PresentationViewerClient.tsx).
  Loads the deck in an `<iframe>` (through `/api/proxy-html` if the URL is absolute, to
  dodge caching). Talks to the iframe via `postMessage` in both directions: outbound
  `set-slide` / `set-mode` commands, inbound `slide-changed` / `slide-count-changed` /
  `request-save` events. Autosave is debounced/coalesced so only one `saveDeckHtml` call
  is ever in flight, with the latest full-DOM payload queued if edits arrive mid-save.

- **Auth & session handling** —
  [`src/middleware.ts`](../src/middleware.ts) +
  [`src/utils/supabase/middleware.ts`](../src/utils/supabase/middleware.ts). Runs on
  (almost) every request to refresh the Supabase session cookie and redirect based on
  auth state. `/`, `/login`, `/register`, `/share/*`, and static assets are the only
  routes reachable while signed out.

---

## 10. Deployment

There is no CI/CD config or deploy script committed in this repo (`frontend-slides`
does ship a `scripts/deploy.sh` for *generated decks*, unrelated to deploying this app
itself). To deploy this Next.js app:

1. **Vercel (recommended, zero-config for Next.js):**
   - Push to GitHub (`origin` is already set to
     `https://github.com/veejaylendio/sermon-presenter.git`).
   - Import the repo in Vercel. Vercel auto-detects Next.js and runs `next build`.
   - **Enable git submodules** in the Vercel project settings, or the build will fail —
     this repo depends on the `frontend-slides` submodule at build/runtime import time
     (`src/utils/slideTemplates.ts` is this app's own port, but confirm nothing else
     resolves paths into `frontend-slides/` before assuming it's unnecessary at deploy
     time).
   - Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
     `GOOGLE_AI_STUDIO_API_KEY` (if using AI-custom themes) as Vercel project environment
     variables — never commit them.
2. **Any Node host:** `npm run build && npm run start` after setting the same
   environment variables.

**Before shipping to production**, double check:
- The Supabase Storage `presentations` bucket exists and is public-read.
- `supabase/schema.sql` has been applied to the target Supabase project.
- Storage/Postgres are in the same Supabase project referenced by
  `NEXT_PUBLIC_SUPABASE_URL`.

---

## 11. Troubleshooting / FAQ

**"Unauthorized" thrown from a Server Action.**
`supabase.auth.getUser()` returned no user — the session cookie is missing/expired.
Check that `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` match the project
the user actually signed up against, and that middleware (`src/middleware.ts`) isn't
being bypassed by a matcher misconfiguration.

**Sermon dashboard shows a sermon but "Generate" always fails / presentation not found.**
`createSermon()` inserts a stub `presentations` row alongside the sermon; if that insert
failed partway (check server logs for `Failed to create sermon` style errors) the sermon
row may have been rolled back, or you're looking at data seeded before this schema
existed. Re-create the sermon.

**Regenerating a deck (changing theme) still shows the old theme.**
This is exactly what `Cache-Control: no-store` + the `?v=timestamp` query param on
`content_storage_path` + `/api/proxy-html` exist to prevent. If it still happens, check
browser devtools network tab for a `200 (from disk/memory cache)` response and hard-
refresh; if it's server-side, check that the Storage bucket itself has no
CDN-level cache override configured outside what the app sets on upload
(`cacheControl: '0'`).

**"AI design generation is not configured."**
`GOOGLE_AI_STUDIO_API_KEY` is unset in the running environment. This only blocks the
AI-custom theme option — the catalog themes and Auto recommendation work without it.

**"AI design service is rate-limited — retrying shortly." / generation eventually fails.**
Google AI Studio free tier has zero quota on `gemini-pro-latest` (verified live, per the
comment in `actions.ts`) — this app deliberately uses `gemini-flash-latest` instead,
which has real free-tier quota. If you've swapped models, confirm the new model has
quota before assuming this is a bug in the retry logic.

**Deck edits aren't persisting after reload.**
Autosave goes through `saveDeckHtml()`, which re-uploads the *entire* deck HTML on every
save — watch for `bodySizeLimit` errors (`next.config.ts` raises this to `10mb`; a
sufficiently large/long deck could still exceed it) and for the debounce/queue logic in
`PresentationViewerClient.tsx` (`flushSave`/`requestSave`) silently dropping an update
if you've modified that logic.

**Slides aren't splitting where expected.**
The rule is *blank line = new slide*, nothing else — no markdown headers, no manual
markers. Check for stray whitespace-only lines vs. truly empty lines (both count as a
separator; see `parseSermonNotes()`), and remember Windows line endings are normalized
first.

**"frontend-slides" folder is empty after cloning.**
It's a git submodule — run `git submodule update --init --recursive`.

---

## 12. Contributing Guidelines

- **Read `AGENTS.md`/`CLAUDE.md` first**, especially if you're an AI coding agent — this
  project pins a Next.js version newer than most training data and expects
  version-correct API usage.
- **Code style:** no comments explaining *what* code does (names should make that
  obvious); comments are reserved for *why* — a non-obvious constraint, a workaround for
  a specific observed bug, a subtle invariant. Skim any existing file before adding to
  it (e.g. `sermonAnalyzer.ts`, `actions.ts`) — the comment style there is the house
  style.
- **No test suite currently exists.** If you add meaningfully complex logic (especially
  anything touching `sermonAnalyzer.ts`'s scoring or `aiThemeSanitizer.ts`'s validation),
  consider whether it needs one rather than assuming none is expected.
- **Server Actions over API routes:** this codebase's convention is Server Actions
  (`'use server'` files) for all app data mutations; `/api/proxy-html` is a rare
  exception because it needs to be a real HTTP route (fetched by the browser's `<iframe
  src>`, not callable as an RPC). Follow the existing pattern rather than introducing a
  parallel REST API.
- **Ownership checks:** every Server Action that touches user data should either rely on
  an RLS-scoped Supabase query (the default — most reads/writes go through the
  cookie-scoped server client) or, when writing to Storage (not covered by Postgres
  RLS), do an explicit ownership `select` first, as `saveDeckHtml()` does.
- **`frontend-slides` submodule:** treat it as vendored/external. If the deck design
  needs to change, prefer changing this app's adaptation in `slideTemplates.ts` for
  app-specific behavior, and only touch the submodule itself if you intend to contribute
  changes back upstream (separate repo: `github.com/veejaylendio/frontend-slides`).
- **Before opening a PR:** run `npm run lint` and `npm run build` locally — there is no
  CI configured in this repo to catch either automatically.
- **Branching/PR process:** not formally defined in this repo (single-contributor
  history as of this writing). Default to feature branches + PRs against `main` unless
  told otherwise by whoever owns the repo.
