# Project Build Prompt — Sermon-to-Slides App

Use this prompt with Claude Code (or another coding agent) inside your project repo, where
the `frontend-slides` Claude Code skill is already cloned/installed.

---

## Project Overview

Build a web app where a user pastes in their preaching/sermon notes, the app splits the
notes into slides using a strict text-separation rule, and then generates a styled,
presentable slideshow using the **Frontend Slides** Claude Code skill (already installed in
this repo — do not reimplement its slide-design logic; invoke it as described below).

The generated slideshow is **never exposed to the user as a file**. Users experience it
entirely inside the app: a "View" screen renders it embedded, and a "Present" screen renders
it fullscreen with a custom presenter control panel (timer, filmstrip, multi-screen
support). Think "Canva-style in-app experience," not "download your PowerPoint."

## Tech Stack

- **Framework:** Next.js (App Router)
- **Backend/DB:** Supabase (Postgres)
- **Auth:** Supabase Auth
- **Data access pattern:** CRUD via Supabase client (server actions or route handlers —
  agent's choice, but be consistent)
- **Design/slide generation:** Frontend Slides Claude Code skill (already cloned in this
  repo at the standard skill install path — invoke via the agent workflow described in its
  `SKILL.md`, do not hand-roll HTML slide generation)
- **File storage:** Supabase Storage (for generated slide content, thumbnails, and optional
  PDF exports)
- **Live sync (for present mode):** Supabase Realtime

## Data Model

Implement the following schema in Supabase. Include RLS policies scoping every table to
`user_id = auth.uid()` (via the `sermons.user_id` chain) from the start — do not add this
later.

```sql
-- Extends auth.users
create table profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  email text
);

create table sermons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text,
  raw_notes text not null,
  status text not null default 'draft', -- draft | parsed
  created_at timestamptz default now()
);

create table slides (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid references sermons(id) on delete cascade not null,
  order_index int not null,
  content text not null
);

create table presentations (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid references sermons(id) on delete cascade not null,
  theme_slug text,
  content_storage_path text, -- internal only, never surfaced to the user as a "file"
  public_share_url text,     -- optional Vercel deploy link
  pdf_storage_path text,     -- nullable, only set if user exports to PDF
  status text not null default 'not_generated', -- not_generated | previewing_styles | generating | generated
  generated_at timestamptz,
  shared_at timestamptz
);

create table style_previews (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid references presentations(id) on delete cascade not null,
  theme_slug text not null,
  preview_thumbnail_url text,
  is_selected boolean default false
);

create table presentation_slides (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid references presentations(id) on delete cascade not null,
  slide_id uuid references slides(id),
  order_index int not null,
  thumbnail_url text
);

create table presentation_sessions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid references presentations(id) on delete cascade not null,
  screen_label text,
  current_slide_index int default 0,
  elapsed_seconds int default 0,
  status text not null default 'active' -- active | ended
);
```

## Core Business Rule: Slide Separation

When parsing `sermons.raw_notes` into `slides` rows, apply these rules exactly:

1. Any text separated by one or more blank lines must be treated as a new slide.
2. Text that appears together without a blank line belongs to the same slide.
3. A blank line indicates the end of the current slide and the beginning of a new slide.
4. Do not merge content across blank lines.
5. Do not split content that is not separated by a blank line.

The **title** of a presentation is whatever content appears on slide 1 (`order_index = 0`).

## User Flow

1. **Input screen** — user pastes preaching notes into `sermons.raw_notes`.
2. **Preview screen** (same page) — apply the slide-separation rule, save resulting rows to
   `slides`, and show the user their notes broken into slides so they can confirm the split
   is correct. Set `sermons.status = 'parsed'`.
3. **Next screen** — list all previously created presentations, with the current
   (in-progress) one pinned at the top. Each list item shows a button on the far right:
   - If `presentations.status != 'generated'` for this sermon → show **Generate**
   - If `presentations.status == 'generated'` → show **View** (do not regenerate)
4. **Generate action** — clicking Generate invokes the Frontend Slides skill:
   - Set `presentations.status = 'previewing_styles'`
   - Ask the skill to generate 3 style previews based on the sermon content — save each as a
     row in `style_previews`
   - Let the user pick one → mark `is_selected = true` on that row
   - Set `presentations.status = 'generating'`, then invoke the skill to produce the full
     styled presentation
   - Save the result path to `content_storage_path`, set `status = 'generated'`,
     `generated_at = now()`
   - The Generate button now becomes **View**
5. **View screen** — renders the generated presentation embedded inside the app's own layout
   (no raw file download, no "here's your HTML" language anywhere in the UI). Includes a
   **Present** button at the top.
6. **Present button** — clicking it opens a modal for the user to select which screen the
   presentation should appear on (for multi-monitor setups), using the browser's Window
   Management API.
7. **Present mode (default/control screen)** shows:
   - **Main Slide (center):** exactly what the audience is currently seeing
   - **Carousel/Filmstrip (bottom):** thumbnails from `presentation_slides`, letting the
     presenter preview upcoming slides or jump to any slide
   - **Top Bar:** running timer, clock, and presentation tools (draw tool, shortcuts)
   - Sync `current_slide_index` and `elapsed_seconds` in `presentation_sessions` via
     Supabase Realtime so a second screen (the actual audience-facing display) stays in sync
     with the control panel.

## Explicit Non-Goals (do not build these)

- No drag-and-drop slide editor (text boxes, image repositioning, etc.) — the presentation
  is generated as a finished whole, not edited piece-by-piece afterward.
- No actual `.pptx` file generation/export — output is a styled web presentation only, plus
  optional PDF export.
- No exposing "HTML," "file," or storage paths in any user-facing copy or UI.

## Build Order Suggestion

1. Supabase schema + RLS policies
2. Auth (Supabase Auth, basic sign in/up)
3. Sermon input + slide-separation parsing + preview screen
4. Presentations list screen with Generate/View button logic
5. Frontend Slides skill integration (style previews → selection → full generation)
6. View screen (embedded render)
7. Present mode (control panel, filmstrip, timer, multi-screen modal, Realtime sync)
8. PDF export action (on-demand, via the skill's existing export script)
9. Optional: public share link deploy action (via the skill's existing deploy script)

## Open Decisions to Confirm Before/During Build

- If a user edits `raw_notes` after a presentation is already `generated`, should
  `presentations.status` revert to force regeneration, or should the old version stay valid
  until the user explicitly regenerates?
- Should style-preview generation take sermon tone/content into account when prompting the
  skill (e.g. a somber sermon shouldn't default to a bright, playful theme)? If so, pass a
  short content summary alongside the style-preview request rather than just requesting
  generic options.
