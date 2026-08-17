'use server'

import { createClient } from '@/utils/supabase/server'
import { parseSermonNotes, getSermonTitle } from '@/utils/sermonParser'
import { THEMES, generatePresentationHtml, generatePreviewHtml, type CustomThemeData } from '@/utils/slideTemplates'
import { AUTO_THEME_SLUG, AI_CUSTOM_THEME_SLUG } from '@/utils/themeMetadata'
import { analyzeSermon, type SermonAnalysis } from '@/utils/sermonAnalyzer'
import { sanitizeCustomTheme } from '@/utils/aiThemeSanitizer'
import { AI_THEME_SYSTEM_PROMPT, buildAiThemeUserPrompt, parseJsonLoosely } from '@/utils/aiThemePrompt'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'

// Verified live against GET /v1beta/models — 'gemini-pro-latest' resolves to
// gemini-3.1-pro, which has zero free-tier quota on this account (429,
// limit: 0). 'gemini-flash-latest' has real free-tier quota and produces
// genuinely content-specific designs (tested against a real sermon: correctly
// picked up wilderness/fire imagery from Numbers 11 rather than defaulting to
// a generic palette).
const AI_THEME_MODEL = 'gemini-flash-latest'
const AI_THEME_MAX_ATTEMPTS = 3
// Gemini Flash responded in ~20s in testing, well under this — the ceiling is
// headroom for a slow day, not the expected case.
const AI_THEME_ATTEMPT_TIMEOUT_MS = 60_000
// Longer than a typical inter-attempt delay: free-tier 429s came back with a
// server-suggested "retry in ~45s", so a short backoff would just fail again.
const AI_THEME_RETRY_DELAY_MS = 15_000

export async function createSermon(rawNotes: string) {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unauthorized')
  }

  // Parse slides
  const parsedSlides = parseSermonNotes(rawNotes)
  if (parsedSlides.length === 0) {
    throw new Error('Sermon notes cannot be empty')
  }

  const title = getSermonTitle(parsedSlides)

  // 1. Insert Sermon
  const { data: sermon, error: sermonError } = await supabase
    .from('sermons')
    .insert({
      user_id: user.id,
      title,
      raw_notes: rawNotes,
      status: 'parsed',
    })
    .select()
    .single()

  if (sermonError || !sermon) {
    throw new Error(sermonError?.message || 'Failed to create sermon')
  }

  // 2. Insert Slides
  const slidesData = parsedSlides.map((content, index) => ({
    sermon_id: sermon.id,
    order_index: index,
    content,
  }))

  const { error: slidesError } = await supabase
    .from('slides')
    .insert(slidesData)

  if (slidesError) {
    await supabase.from('sermons').delete().eq('id', sermon.id)
    throw new Error(slidesError.message)
  }

  // 3. Create Presentation
  const { error: presError } = await supabase
    .from('presentations')
    .insert({
      sermon_id: sermon.id,
      status: 'not_generated',
    })

  if (presError) {
    await supabase.from('sermons').delete().eq('id', sermon.id)
    throw new Error(presError.message)
  }

  revalidatePath('/sermons')
  return { success: true, sermonId: sermon.id }
}

export async function deleteSermon(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('sermons')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/sermons')
}

// Render every style preview and upload it to Supabase Storage.
//
// NOTE: the generate page no longer calls this. Previews are now rendered inline
// from generatePreviewHtml(), which avoids one storage write per theme for styles
// the user may never choose. This remains available for cases that need durable,
// shareable preview URLs — but it performs one upload per theme, so it is slow.
export async function generatePreviews(sermonId: string) {
  const supabase = await createClient()

  // 1. Fetch sermon and slides
  const { data: sermon, error: sermonError } = await supabase
    .from('sermons')
    .select('*, slides(*), presentations(*)')
    .eq('id', sermonId)
    .single()

  if (sermonError || !sermon) {
    throw new Error('Sermon not found')
  }

  const presentation = sermon.presentations?.[0]
  if (!presentation) {
    throw new Error('Presentation not found')
  }

  // Update presentation status
  await supabase
    .from('presentations')
    .update({ status: 'previewing_styles' })
    .eq('id', presentation.id)

  const firstSlideText = sermon.slides?.[0]?.content || sermon.title || 'Untitled Sermon'
  const title = sermon.title || 'Untitled Sermon'

  const previewsToGenerate = Object.keys(THEMES).map((theme) => ({
    key: theme,
    theme,
  }))

  for (const item of previewsToGenerate) {
    const htmlContent = generatePreviewHtml(item.theme, firstSlideText)

    const storagePath = `previews/${presentation.id}/${item.key}.html`
    const { error: uploadError } = await supabase.storage
      .from('presentations')
      .upload(storagePath, htmlContent, {
        contentType: 'text/html',
        upsert: true,
      })

    if (uploadError) {
      console.error(`Upload error for ${item.key}:`, uploadError)
      throw new Error(`Failed to upload ${item.theme} preview`)
    }

    const { data: { publicUrl } } = supabase.storage
      .from('presentations')
      .getPublicUrl(storagePath)

    // Clean up any existing style preview rows for this theme to prevent duplicates
    await supabase
      .from('style_previews')
      .delete()
      .eq('presentation_id', presentation.id)
      .eq('theme_slug', item.theme)

    await supabase
      .from('style_previews')
      .insert({
        presentation_id: presentation.id,
        theme_slug: item.theme,
        preview_thumbnail_url: publicUrl,
        is_selected: false,
      })
  }
}

// Polled by the client while a background generation is in flight.
type AiThemeStatusResult =
  | { status: 'idle' | 'pending' }
  | { status: 'ready'; customTheme: CustomThemeData; previewHtml: string }
  | { status: 'failed'; error: string; fallbackSlug: string; fallbackPreviewHtml: string }

// Single attempt: call Google AI Studio (Gemini), parse, sanitize. Returns the
// safe theme or throws with a user-facing message — the retry loop in
// runAiThemeGeneration decides whether to try again or give up.
async function requestAiTheme(title: string, analysis: SermonAnalysis, rawNotes: string): Promise<CustomThemeData> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!apiKey) {
    throw new Error('AI design generation is not configured.')
  }

  const userPrompt = buildAiThemeUserPrompt(title, analysis, rawNotes)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_THEME_ATTEMPT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_THEME_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: AI_THEME_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.9,
            // gemini-flash-latest is a thinking model — reasoning tokens are
            // billed against maxOutputTokens too. Verified live: with no cap,
            // a single request spent 3840 of a 4000 budget on hidden thinking
            // and left ~150 for the actual theme, truncating it mid-response
            // and surfacing as "Could not understand the AI design response."
            // Capping thinking + raising the ceiling fixed it in the same repro.
            maxOutputTokens: 8000,
            thinkingConfig: { thinkingBudget: 512 },
            responseMimeType: 'application/json',
          },
        }),
      }
    )
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    throw new Error(timedOut ? 'AI design generation timed out.' : 'Could not reach the AI design service.')
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    // 429 (free-tier quota) is transient and worth retrying; the message
    // deliberately avoids "service returned an error" so the retry loop
    // below doesn't treat it as permanent.
    if (res.status === 429) {
      throw new Error('AI design service is rate-limited — retrying shortly.')
    }
    throw new Error(`AI design service returned an error (${res.status}).`)
  }

  const json = await res.json()
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) {
    throw new Error('AI design service returned an empty response.')
  }

  const parsed = parseJsonLoosely(content)
  if (!parsed) {
    throw new Error('Could not understand the AI design response.')
  }

  const safe = sanitizeCustomTheme(parsed)
  if (!safe) {
    throw new Error('The AI design did not pass safety checks.')
  }

  return safe
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Runs in the background via after() — outside the request/response cycle, so
// it can take as long as the free model needs (up to AI_THEME_ATTEMPT_TIMEOUT_MS
// per attempt) without blocking the click that started it. Retries a few times
// before giving up, since a single bad/slow attempt is common but rarely
// repeats across all attempts.
async function runAiThemeGeneration(sermonId: string) {
  const supabase = await createClient()

  const { data: sermon } = await supabase
    .from('sermons')
    .select('*, slides(*), presentations(*)')
    .eq('id', sermonId)
    .single()

  const presentation = sermon?.presentations?.[0]
  if (!sermon || !presentation) return

  const rawNotes = sermon.raw_notes || sermon.title || ''
  const title = sermon.title || 'Untitled Sermon'
  const analysis = analyzeSermon(rawNotes)

  let lastError = 'AI design generation failed.'
  for (let attempt = 1; attempt <= AI_THEME_MAX_ATTEMPTS; attempt++) {
    try {
      const safe = await requestAiTheme(title, analysis, rawNotes)
      await supabase
        .from('presentations')
        .update({ custom_theme: safe, ai_theme_status: 'ready', ai_theme_error: null })
        .eq('id', presentation.id)
      revalidatePath(`/sermons/${sermonId}/generate`)
      return
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
      // A missing API key or an HTTP-level service error won't fix itself on
      // retry — only malformed-output/timeout failures are worth repeating.
      if (/not configured|service returned an error/.test(lastError)) break
      if (attempt < AI_THEME_MAX_ATTEMPTS) await delay(AI_THEME_RETRY_DELAY_MS)
    }
  }

  await supabase
    .from('presentations')
    .update({ ai_theme_status: 'failed', ai_theme_error: lastError })
    .eq('id', presentation.id)
  revalidatePath(`/sermons/${sermonId}/generate`)
}

// Kicks off a bespoke, per-sermon AI design in the background — the "wildcard"
// design concept from the frontend-slides skill's SERMON_DESIGN.md, done live
// instead of picking from the 14-theme catalog. Returns immediately after
// marking the presentation 'pending'; the client polls getAiThemeStatus() for
// the result. Uses after() (next/server) so the actual Gemini call runs after
// the response is sent rather than blocking this action's caller or risking
// a platform request timeout.
export async function generateAiCustomTheme(sermonId: string): Promise<{ status: 'pending' }> {
  const supabase = await createClient()

  const { data: sermon, error: sermonError } = await supabase
    .from('sermons')
    .select('id, presentations(id)')
    .eq('id', sermonId)
    .single()

  if (sermonError || !sermon) {
    throw new Error('Sermon not found')
  }
  const presentation = sermon.presentations?.[0]
  if (!presentation) {
    throw new Error('Presentation not found')
  }

  await supabase
    .from('presentations')
    .update({ ai_theme_status: 'pending', ai_theme_error: null })
    .eq('id', presentation.id)
  revalidatePath(`/sermons/${sermonId}/generate`)

  after(() => runAiThemeGeneration(sermonId))

  return { status: 'pending' }
}

// Polled by the client while status is 'pending'. Persistence is the same
// presentations row generateAiCustomTheme already updates, so this is a plain
// read — no coupling to the request that kicked off the background job.
export async function getAiThemeStatus(sermonId: string): Promise<AiThemeStatusResult> {
  const supabase = await createClient()

  const { data: sermon } = await supabase
    .from('sermons')
    .select('*, slides(*), presentations(*)')
    .eq('id', sermonId)
    .single()

  const presentation = sermon?.presentations?.[0]
  if (!sermon || !presentation) {
    throw new Error('Presentation not found')
  }

  const status = (presentation.ai_theme_status ?? 'idle') as 'idle' | 'pending' | 'ready' | 'failed'
  const firstSlideText = sermon.slides?.[0]?.content || sermon.title || 'Untitled Sermon'

  if (status === 'ready') {
    const safe = sanitizeCustomTheme(presentation.custom_theme)
    if (!safe) {
      // Stored data failed re-validation (e.g. edited out-of-band) — treat as failed.
      const analysis = analyzeSermon(sermon.raw_notes || sermon.title || '')
      return {
        status: 'failed',
        error: 'The saved AI design is no longer valid.',
        fallbackSlug: analysis.themeSlug,
        fallbackPreviewHtml: generatePreviewHtml(analysis.themeSlug, firstSlideText),
      }
    }
    return { status: 'ready', customTheme: safe, previewHtml: generatePreviewHtml(safe, firstSlideText) }
  }

  if (status === 'failed') {
    const analysis = analyzeSermon(sermon.raw_notes || sermon.title || '')
    return {
      status: 'failed',
      error: presentation.ai_theme_error || 'AI design generation failed.',
      fallbackSlug: analysis.themeSlug,
      fallbackPreviewHtml: generatePreviewHtml(analysis.themeSlug, firstSlideText),
    }
  }

  return { status }
}

// Select a theme, generate the full presentation and store it.
//
// `themeSlug` may be the sentinel 'auto' (derive the design from the sermon text)
// or 'ai-custom' (reuse the previously-generated presentations.custom_theme —
// never re-call the LLM here, since its output isn't deterministic and the user
// already confirmed the previewed design). Resolution happens here as well as in
// the UI so the choice can never be spoofed or go stale between render and submit.
export async function selectThemeAndGenerateDeck(sermonId: string, themeSlug: string) {
  const supabase = await createClient()

  // 1. Fetch sermon, slides, presentation
  const { data: sermon, error: sermonError } = await supabase
    .from('sermons')
    .select('*, slides(*), presentations(*)')
    .eq('id', sermonId)
    .single()

  if (sermonError || !sermon) {
    throw new Error('Sermon not found')
  }

  const presentation = sermon.presentations?.[0]
  if (!presentation) {
    throw new Error('Presentation not found')
  }

  const title = sermon.title || 'Untitled Sermon'
  const isAiCustom = themeSlug === AI_CUSTOM_THEME_SLUG

  // Resolve 'auto' to a concrete theme, and reject anything we cannot render.
  // 'ai-custom' resolves separately below, since there is no catalog slug to
  // validate against THEMES.
  let resolvedSlug = themeSlug
  if (!isAiCustom) {
    if (resolvedSlug === AUTO_THEME_SLUG) {
      resolvedSlug = analyzeSermon(sermon.raw_notes || sermon.title || '').themeSlug
    }
    if (!THEMES[resolvedSlug]) {
      throw new Error(`Unknown presentation theme: ${themeSlug}`)
    }
  }

  // Update presentation status
  await supabase
    .from('presentations')
    .update({ status: 'generating' })
    .eq('id', presentation.id)

  let htmlContent: string

  if (isAiCustom) {
    // Re-fetch is unnecessary — sermon.presentations already carries custom_theme
    // from the select above (row is not re-read after the 'generating' update).
    const safe = sanitizeCustomTheme(presentation.custom_theme)
    if (!safe) {
      throw new Error(
        'No valid AI design has been generated for this presentation yet. Generate one first.'
      )
    }
    htmlContent = generatePresentationHtml(title, sermon.raw_notes, safe)
    // No style_previews bookkeeping for the AI design — that table only tracks
    // the fixed 14-theme catalog.
  } else {
    // 2. Mark is_selected in style_previews
    await supabase
      .from('style_previews')
      .update({ is_selected: false })
      .eq('presentation_id', presentation.id)

    await supabase
      .from('style_previews')
      .update({ is_selected: true })
      .eq('presentation_id', presentation.id)
      .eq('theme_slug', resolvedSlug)

    // 3. Generate Full HTML
    htmlContent = generatePresentationHtml(title, sermon.raw_notes, resolvedSlug)
  }

  const resolvedSlugForDb = isAiCustom ? AI_CUSTOM_THEME_SLUG : resolvedSlug

  const storagePath = `generated/${presentation.id}/index.html`
  const { error: uploadError } = await supabase.storage
     .from('presentations')
     .upload(storagePath, htmlContent, {
       contentType: 'text/html',
       upsert: true,
       // Regenerating overwrites this exact path, so the object must never be held
       // by the storage CDN — otherwise switching themes keeps serving the old deck.
       cacheControl: '0',
     })

  if (uploadError) {
    throw new Error(`Failed to upload generated presentation: ${uploadError.message}`)
  }

  const { data: { publicUrl } } = supabase.storage
    .from('presentations')
    .getPublicUrl(storagePath)

  // Version the URL so each generation is a distinct resource. Without this the
  // browser (and the proxy route) reuse the previously cached response for what is
  // a byte-different deck, and the user sees the theme they picked last time.
  const versionedUrl = `${publicUrl}?v=${Date.now()}`

  // 4. Populate presentation_slides table
  // Clear any existing presentation slides
  await supabase
    .from('presentation_slides')
    .delete()
    .eq('presentation_id', presentation.id)

  const slides = sermon.slides || []
  const presentationSlidesData = slides.map((slide: any) => ({
    presentation_id: presentation.id,
    slide_id: slide.id,
    order_index: slide.order_index,
    thumbnail_url: null, // Control panel handles layout-based text previews
  }))

  const { error: slidesInsertError } = await supabase
    .from('presentation_slides')
    .insert(presentationSlidesData)

  if (slidesInsertError) {
    console.error('Error inserting presentation slides:', slidesInsertError)
  }

  // 5. Update presentations row
  const { error: updateError } = await supabase
    .from('presentations')
    .update({
      theme_slug: resolvedSlugForDb,
      content_storage_path: versionedUrl,
      status: 'generated',
      generated_at: new Date().toISOString(),
    })
    .eq('id', presentation.id)

  if (updateError) {
    throw new Error(`Failed to update presentation: ${updateError.message}`)
  }

  revalidatePath('/sermons')
  revalidatePath(`/sermons/${sermonId}/view`)
  return { success: true }
}

// Re-uploads the live-edited deck HTML (from the in-iframe editor: text edits,
// widget edits, slide reorders) over the same storage object the generate flow
// wrote, so Edit Mode changes survive a reload. Ownership is enforced the same
// way as the rest of this file: the RLS-filtered select below returns nothing
// for a presentation the caller doesn't own, and we throw before ever touching
// storage (storage.upload itself isn't covered by a Postgres RLS policy).
export async function saveDeckHtml(presentationId: string, html: string) {
  const supabase = await createClient()

  const { data: presentation, error } = await supabase
    .from('presentations')
    .select('id, sermon_id')
    .eq('id', presentationId)
    .single()

  if (error || !presentation) {
    throw new Error('Presentation not found')
  }

  const storagePath = `generated/${presentationId}/index.html`
  const { error: uploadError } = await supabase.storage
    .from('presentations')
    .upload(storagePath, html, {
      contentType: 'text/html',
      upsert: true,
      // Same reasoning as the generate flow: never let the CDN hold this path,
      // or the next load can serve edits from a stale cached response.
      cacheControl: '0',
    })

  if (uploadError) {
    throw new Error(`Failed to save edits: ${uploadError.message}`)
  }

  const { data: { publicUrl } } = supabase.storage
    .from('presentations')
    .getPublicUrl(storagePath)

  const versionedUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabase
    .from('presentations')
    .update({ content_storage_path: versionedUrl })
    .eq('id', presentationId)

  if (updateError) {
    throw new Error(`Failed to update presentation: ${updateError.message}`)
  }

  revalidatePath(`/sermons/${presentation.sermon_id}/view`)
  return { success: true, url: versionedUrl }
}
