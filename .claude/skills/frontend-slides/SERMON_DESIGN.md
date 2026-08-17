# Sermon Design Layer

How to read a sermon and choose its design **from the sermon itself**, rather than from
generic "what's this deck for?" answers.

Read this file whenever the deck is a sermon, Bible study, or worship-service message.
It replaces Phase 1 intake and drives Phase 2 style selection in [SKILL.md](SKILL.md).
Everything else in SKILL.md — fixed 1920×1080 stage, anti-AI-slop aesthetics, single-file
output, preview authenticity — still applies unchanged.

---

## Why this layer exists

The base skill matches a template's `mood` / `tone` / `formality` / `density` / `scheme`
against what the user *says* they want. For a sermon that is the wrong input. The
preacher already knows the passage, the season, and the emotional arc of the message —
and that content predicts the right design far better than "pitch deck vs. conference
talk" ever will.

So: **analyze the sermon, derive a design vector, then match.** A message on Lamentations
and one on Easter morning must not land on the same design.

---

## Phase S0: Detect sermon mode

Route here when any of these are true:

- The user says sermon, preaching, message, homily, worship service, Sunday, devotional,
  Bible study, small group, or names a church context.
- The content is built around a Bible passage, or the user pastes a manuscript, outline,
  or sermon notes.
- The project itself is sermon-oriented (this repository is `Sermon-Presenter`).

If it is a sermon, use **Phase S1–S3 below instead of SKILL.md Phase 1 and Phase 2 Step 2.0**,
then continue into SKILL.md Phase 3 as normal.

---

## Phase S1: Sermon intake

Ask these together in one structured question set. Keep it to four questions — the point
of this layer is that you infer the rest, not interrogate the preacher.

**Question 1 — Passage** (header: "Passage")
What passage is the message on? *(Free text. Accept "Romans 8:28-39", "the prodigal son",
or "not sure yet".)*

**Question 2 — Occasion** (header: "Occasion")
Options: Regular Sunday service / Seasonal or holy day / Special service (funeral, wedding,
baptism, dedication) / Study, small group, or class

**Question 3 — Setting** (header: "Setting")
Options: Main sanctuary projection / Small room or classroom screen / Online or streamed /
Printed handout too

**Question 4 — Content** (header: "Content")
Options: Full manuscript ready / Outline or notes / Passage and big idea only / Just the topic

**Do not ask for the design mood.** That is what you are about to infer. Ask about mood
only if S2 analysis genuinely cannot resolve the register — and then ask about the
*message*, not about design ("Is this message more comfort or more challenge?").

If the user has a manuscript, outline, or notes, **ask them to share it now.** The analysis
in S2 is much stronger with the real text.

---

## Phase S2: Analyze the sermon → design vector

Read whatever content exists (manuscript, outline, or just the passage) and derive five
values. Show your reading back to the user in one or two sentences before previews — it
builds trust and catches misreads early.

### S2.1 — Passage genre

| Genre | Signals | Pulls design toward |
| ----- | ------- | ------------------- |
| OT narrative / Torah | Genesis–Esther, story, covenant, exodus, law | Tactile, archival, earthy; stone and parchment |
| Psalms / poetry | Psalms, Song of Songs, poetic parallelism, lament or praise language | Literary serif, quiet, warm, spacious |
| Wisdom | Proverbs, Ecclesiastes, Job; aphorism, paradox | Restrained, ledger-like, high formality, minimal color |
| Prophets | Isaiah–Malachi; "thus says the LORD", justice, judgment, oracle | Bold, dramatic, high contrast, editorial-newspaper weight |
| Gospels / parable | Matthew–John; story, dialogue, "kingdom of heaven is like" | Warm, intimate, human, handmade |
| Acts / history | Acts; mission, expansion, church-planting | Graphic, confident, movement-forward |
| Epistle / doctrine | Romans–Jude; argument, "therefore", theological reasoning | Structured, studious, grid-driven, scholarly |
| Apocalyptic | Revelation, Daniel; vision, symbol, cosmic scale | Dark, weighty, atmospheric, high drama |

### S2.2 — Message register

The dominant emotional and rhetorical mode. This is the **strongest single signal** —
weight it above genre when the two disagree.

| Register | Signals in the text | `scheme` | `formality` | `mood` / `tone` keywords to match |
| -------- | ------------------- | -------- | ----------- | --------------------------------- |
| Exposition / teaching | Verse-by-verse, definitions, structure, "first… second…" | light or dark | medium-high–high | `considered`, `literary`, `studious`, `intellectual` |
| Comfort / pastoral | Grief, anxiety, weariness, assurance, "do not fear" | light or mixed | medium-high | `warm`, `quiet`, `soft`, `patient`, `intimate` |
| Lament / grief | Loss, death, suffering, unanswered prayer, "how long" | light or mixed, muted | high | `restrained`, `quiet`, `honest`, `literary` |
| Celebration / praise | Resurrection, thanksgiving, joy, victory, doxology | light or mixed, bright | medium | `bold`, `warm`, `confident`, `punchy` |
| Conviction / repentance | Sin, confession, warning, "turn from", holiness | dark or mixed | medium-high | `weighty`, `dramatic`, `sober`, `graphic` |
| Exhortation / call to action | "Go", mission, service, justice, obedience | light or mixed | medium | `direct`, `punchy`, `honest`, `activist` |
| Awe / transcendence | Glory, holiness, majesty, mystery, the character of God | dark | high | `atmospheric`, `scholarly`, `elegant`, `luxe`-adjacent but reverent |
| Hope / expectation | Waiting, promise, Advent, "not yet", longing | mixed | medium-high | `considered`, `moody`, `warm`, `contemplative` |

When a sermon moves through several registers — most good ones do — design for the
**register it lands on**, not the one it opens with. A message that walks through grief
to resurrection hope is a hope deck, not a lament deck.

### S2.3 — Liturgical season / occasion

| Occasion | Palette instinct | Strong picks |
| -------- | ---------------- | ------------ |
| Advent | Deep blue, violet, muted gold | `editorial-tri-tone`, `vellum`, `biennale-yellow`, Dark Botanical |
| Christmas | Cream, evergreen, warm gold | `grove`, `emerald-editorial`, `biennale-yellow`, `soft-editorial` |
| Epiphany | Light, star, radiance | `biennale-yellow`, `vellum` |
| Lent | Ash, muted purple, bare | `cartesian`, `monochrome`, `editorial-tri-tone`, `stencil-tablet` |
| Holy Week / Good Friday | Black, crimson, stripped-back | `monochrome`, `broadside`, `vellum` |
| Easter | White, gold, brilliant accent | `bold-poster`, `coral`, `biennale-yellow` |
| Pentecost | Fire, red, wind | `broadside`, `coral`, `bold-poster` |
| Ordinary Time | Green, warm neutral | `editorial-forest`, `mat`, `grove`, Vintage Editorial |
| Funeral / memorial | Muted, dignified, no brightness | `monochrome`, `cartesian`, `soft-editorial`, `grove` |
| Wedding | Warm, elegant, celebratory restraint | `soft-editorial`, `cartesian`, `long-table` |
| Baptism / dedication | Water, light, fresh | `soft-editorial`, `capsule`, `grove` |
| Communion | Table, bread, gathering | `long-table`, `grove`, `pin-and-paper` |
| Missions | Map, sending, urgency | `stencil-tablet`, `peoples-platform`, `signal` |
| Vision Sunday / business | Institutional trust | `signal`, `emerald-editorial`, `blue-professional` |
| Youth service | Energy, contemporary | `studio`, `block-frame`, `raw-grid`, `neo-grid-bold` |
| Kids / VBS | Bright, friendly | `daisy-days`, `scatterbrain`, `capsule`, Split Pastel |
| Bible study / class | Structured, readable | `cobalt-grid`, `monochrome`, `editorial-forest`, Notebook Tabs |

Season **overrides** register for the high holy days. A joyful Good Friday deck is a
category error even if the manuscript ends on hope.

### S2.4 — Density

Default for a **preached sermon: low density / speaker-led.** The congregation is
listening, not reading; the screen supports the preacher rather than duplicating them.

Choose high density only when the setting is a study, class, or printed handout — i.e.
when someone will read the slides without the preacher present.

### S2.5 — Scheme, decided by the room

Ask-or-infer from the S1 setting answer. This is a practical constraint, not taste:

- **Older/washed-out sanctuary projector** → light scheme. Dark backgrounds turn muddy
  grey and scripture becomes unreadable.
- **Modern LED wall or good projector in a darkened room** → dark scheme is available and
  often more reverent.
- **Streamed / online** → either works; favor high contrast for small phone screens.
- **Printed handout** → light scheme only. Never send a dark deck to a printer.

If you cannot determine the projector quality, **default to light** and say why. A light
deck that looks slightly plain always beats a dark deck nobody can read.

---

## Phase S3: Select and preview

Match the S2 vector against
[bold-template-pack/selection-index.json](bold-template-pack/selection-index.json)
(`mood`, `tone`, `formality`, `density`, `scheme`) and the presets in
[STYLE_PRESETS.md](STYLE_PRESETS.md). Use [STYLE_CATALOG.md](STYLE_CATALOG.md) for the
full 46-design view and the sermon-fit grading.

**Preview mix for sermons** — three previews, as always, but constrained:

1. **Anchor** — the strongest match for the derived register and season. Must be graded
   **Yes** for sermon fit in STYLE_CATALOG.md.
2. **Alternate register** — a second sermon-safe design that reads the message a
   defensibly different way (e.g. if the anchor leans reverent-quiet, offer warm-human).
3. **Wildcard** — a custom design authored to the passage, following the SKILL.md custom
   wildcard rules. This is where sermon-specific imagery belongs: the light of Epiphany,
   the bare branches of Lent, the long table of communion — expressed as **abstract CSS
   form, color, and typography only.**

**Tell the user what you inferred and why**, in one short paragraph, before opening the
previews. For example: *"Reading this as an exposition of Romans 8 landing on assurance —
so: quiet, scholarly, high-formality, light scheme for your sanctuary projector."*

### Never offer for a worship service

`8-bit-orbit`, `retro-windows`, `sakura-chroma`, `pink-script`, Neon Cyber, Terminal Green.

`pink-script` in particular carries a `sultry` / `luxe` / `after-hours` register that is
wrong for preaching regardless of how good it looks. These stay fully available for any
non-sermon deck.

---

## Sermon slide grammar

A sermon deck is not a pitch deck with verses pasted in. Build from these slide types:

| Slide type | Purpose | Rules |
| ---------- | ------- | ----- |
| **Series / title** | Name the series and this message | Series name, message title, date, preacher, passage reference |
| **Scripture** | Display the passage | See the scripture rules below — this is the highest-stakes slide |
| **Big idea** | The one sentence of the message | One sentence, largest type in the deck, nothing else on the slide |
| **Point** | Movement I / II / III | Number + short phrase; never a full paragraph |
| **Illustration** | Story or image | Minimal text; let the story carry it |
| **Word study** | Original-language term | Greek/Hebrew word, transliteration, gloss; do not overcrowd |
| **Application** | So what, and now what | 1–3 concrete actions, imperative voice |
| **Response / invitation** | The call | Single focus; generous negative space |
| **Closing** | Benediction, next steps | Next week's passage, series continuation, or the blessing text |

### Scripture slide rules (non-negotiable)

Scripture is the one slide type the congregation actually reads word-for-word, often from
30 metres away. Treat it as the hardest layout problem in the deck.

1. **Cite every time.** Book chapter:verse **and** translation (ESV, NIV, NASB, KJV, CSB…).
   Never display a verse without its reference.
2. **Quote accurately.** Never paraphrase, compress, or "tidy" scripture text. If the user
   supplies the text, use it verbatim. If you are unsure of the wording of a translation,
   ask rather than reconstruct it from memory.
3. **Split long passages.** Roughly 40–45 words maximum per slide at low density. Continue
   onto further slides rather than shrinking the type.
4. **Never decorate behind verse text.** No gradients, textures, shapes, or images under
   the words. Decorative elements go in the margins or on other slide types.
5. **Highest contrast in the deck.** Scripture slides get the strongest available
   foreground/background contrast, even if that means a plainer slide than its neighbours.
6. **No animated reveal of scripture text mid-verse.** The passage may fade in as a whole
   block, but never word-by-word or line-by-line — the congregation reads ahead of you and
   a partial verse reads as a partial thought.
7. **Ellipses must be honest.** If a passage is abridged, show `…` and say so.
8. **Emphasis is the preacher's call, not yours.** Do not bold or color individual words in
   a verse unless the user asked for that emphasis.

### Legibility floor for projection

- Body text on a sanctuary slide: no smaller than **32px at the 1920×1080 design size**.
- Scripture text: no smaller than **44px** at that size.
- If content will not fit at those sizes, **split the slide.** Never shrink below the floor.

---

## Handoff to Phase 3

Once the user picks a style, continue with SKILL.md Phase 3 exactly as written — read the
chosen `design.md` (bold template) or expand the wildcard's system, include the full
`viewport-base.css`, keep it single-file. Carry these sermon constraints through generation:

- Low density unless the setting said otherwise.
- The scripture slide rules above outrank any template's decorative instinct. If a
  template wants a textured panel where the verse goes, the verse wins.
- Verify legibility in rendered screenshots at 1280×720, not just that nothing overflows.
