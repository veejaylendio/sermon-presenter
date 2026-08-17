# SermonPresenter — User Guide

This guide is for anyone *using* the app: pastors, preachers, and worship leaders
turning sermon notes into a presentable slideshow. It assumes the app is already
running (locally or deployed) — if you need to install and configure the app itself,
see [`DEVELOPER_GUIDE.md`](./DEVELOPER_GUIDE.md) §4–5 instead; that's not repeated here.

---

## 1. Getting in

1. Open the app in your browser.
2. If you're new, click **Register** and create an account with your email and a
   password. A profile is created for you automatically — no extra setup step.
3. If you already have an account, click **Login**.
4. Once signed in, you land on your **Sermon Dashboard** (`/sermons`) — a list of every
   sermon you've created.

---

## 2. Creating a sermon

1. From the dashboard, click **New Sermon**.
2. Paste or type your preaching notes into the text box.
3. **The only rule that matters: a blank line starts a new slide.** As you type, a live
   preview on the side shows exactly how your notes will be split — so you can adjust
   spacing until the slide breaks look right, before you ever generate a deck.
   - No blank line = stays on the same slide.
   - One or more blank lines = new slide.
   - There's no special syntax (no `#` headers, no markers) — just paragraph breaks.
4. When the preview looks right, save the sermon. Its title is taken automatically from
   the first line of your first slide.
5. You're returned to the dashboard, where your new sermon now appears with a
   **Generate** button.

**Tip:** you can create and save a sermon's notes without generating a deck yet — the
slide split step and the visual design step are separate, so you can draft your notes
first and pick a look later.

---

## 3. Choosing a look (theme)

Click **Generate** on a sermon to open the theme picker. You have three ways to choose
how your deck looks:

### A. Pick a built-in theme

There are 14 curated themes to choose from, each with a live preview of your first
slide so you can see it rendered before committing:

Bold Signal · Dark Botanical · Vintage Editorial · Paper & Ink · Vellum · Grove ·
Monochrome · Soft Editorial · Broadside · Stencil & Tablet · Long Table · Cobalt Grid ·
Biennale Yellow, and more — covering a mix of dark/light and formal/casual styles.

Click any preview, then confirm to generate your deck in that style.

### B. Let the app pick for you ("Auto")

Choose **Auto** and the app reads your notes — scripture references, the season
implied by your language (e.g. Advent, Lent), and the emotional tone (comfort, lament,
celebration, conviction, etc.) — and recommends the theme it thinks fits best, along
with a short explanation of why. This happens instantly and doesn't call any external
AI service.

### C. Generate a one-of-a-kind design with AI

Choose **AI-Custom** to have an AI design a bespoke look just for this sermon,
rather than picking from the catalog. This takes a little longer (it's generated in the
background — the picker will show a pending state and update automatically once it's
ready, usually within a few seconds to a couple of minutes). Every AI-generated design
is checked for safety before you ever see it, so it will always be a plain, static
slide design.

> If AI-Custom isn't available in your setup, the person who deployed the app hasn't
> configured the AI service yet — the built-in themes and Auto still work regardless.

Once you pick a theme, the app builds your full slide deck. You'll be taken to the
deck view when it's ready.

---

## 4. Viewing and editing your deck

Every generated sermon has a **View** button on the dashboard that takes you to its
deck.

The deck opens in **Edit Mode** by default:
- Click directly into any slide's text to edit it in place.
- Your changes are saved automatically in the background as you type — there's no
  separate "Save" button to remember.

From here you can:
- **Present ▶** — switch into fullscreen Present Mode (see below).
- **✎ Exit to Edit** — return to Edit Mode from Present Mode.

---

## 5. Presenting

Click **Present ▶** to enter Present Mode — a distraction-free, fullscreen view meant
for the projector/screen the congregation sees:

- **← Prev / Next →** — step backward/forward one slide at a time. Once you're in
  Present Mode, your keyboard's arrow keys and spacebar also navigate slides.
- **Fullscreen ⛶ / Exit Fullscreen ↙** — toggle true browser fullscreen (recommended
  when driving a projector or second display).
- **✎ Exit to Edit** — leaves Present Mode and returns to the editable deck view, e.g.
  if you spot a typo mid-service and need to fix it.

Present Mode today is a single screen you control directly (no separate confidence
monitor / audience-screen sync) — drive it from the same device connected to your
display.

---

## 6. Regenerating with a different theme

Not happy with the look? Go back to the sermon's **Generate** step and pick a different
theme — the deck at that same "View" link is replaced with the new design. Give it a
moment and refresh if you still see the old look, since the app aggressively avoids
caching a stale deck.

Note: switching themes replaces the deck's design. If you'd made manual text edits in
Edit Mode, re-generating rebuilds the deck from your original slide notes, so make any
wording changes you want to keep *after* you've settled on a theme, not before.

---

## 7. Deleting a sermon

From the dashboard, use the **Delete** button on any sermon. This permanently removes
the sermon, its slides, and its generated deck — there's no undo, so make sure it's the
one you meant to remove.

---

## 8. Troubleshooting

**My slides aren't splitting where I expected.**
Check for stray blank lines you didn't intend, or missing blank lines where you wanted
a break. The rule is strictly "blank line = new slide," nothing smarter — no headers,
no keywords.

**"Generate" doesn't seem to do anything, or View is missing.**
Give it a moment — generation happens on the server before you're redirected. If it
still fails, try again; if it keeps failing, contact whoever manages your app
deployment.

**I picked a new theme but the old one still shows up.**
Hard-refresh your browser (the app already takes steps to avoid this, but a browser or
network cache can occasionally still serve a stale version).

**The AI-Custom option is missing or always fails.**
That feature depends on an AI service being configured by whoever set up the app. The
built-in themes and Auto recommendation always work without it.

**I lost an edit I made in Edit Mode.**
Edits autosave a moment after you stop typing. If you closed the tab or lost connection
immediately after typing, that last save may not have completed — re-open the deck and
check before redoing work.

For anything setup/configuration-related (accounts you can't create, the app not
loading at all, environment/deployment issues), see
[`DEVELOPER_GUIDE.md`](./DEVELOPER_GUIDE.md), particularly §5 (Environment Variables)
and §11 (Troubleshooting / FAQ).
