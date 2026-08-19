// Provider-agnostic callers for the AI theme design step (see aiThemePrompt.ts
// for the shared system prompt). getAiThemeProviders() returns whichever
// providers have an API key configured, in fallback order: Google AI Studio
// (Gemini) first — best-tested design quality — then four backups with
// independent quotas, so one provider's outage or exhausted free-tier quota
// doesn't block presentation generation. requestAiTheme() in actions.ts walks
// this list and stops at the first provider that returns a usable design.

const ATTEMPT_TIMEOUT_MS = 60_000

export type AiThemeProvider = {
  label: string
  run: (systemPrompt: string, userPrompt: string) => Promise<string>
}

async function callGoogleAiStudio(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY!
  // Verified live against GET /v1beta/models — 'gemini-pro-latest' resolves to
  // gemini-3.1-pro, which has zero free-tier quota on this account (429, limit:
  // 0). 'gemini-flash-latest' has real free-tier quota and produces genuinely
  // content-specific designs (tested against a real sermon: correctly picked up
  // wilderness/fire imagery from Numbers 11 rather than defaulting to a generic
  // palette).
  const model = 'gemini-flash-latest'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.9,
            // gemini-flash-latest is a thinking model — reasoning tokens are
            // billed against maxOutputTokens too. Verified live: with no cap, a
            // single request spent 3840 of a 4000 budget on hidden thinking and
            // left ~150 for the actual theme, truncating it mid-response.
            maxOutputTokens: 8000,
            thinkingConfig: { thinkingBudget: 512 },
            responseMimeType: 'application/json',
          },
        }),
      }
    )
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    throw new Error(timedOut ? 'Google AI Studio timed out.' : 'Could not reach Google AI Studio.')
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    if (res.status === 429) throw new Error('Google AI Studio is rate-limited.')
    throw new Error(`Google AI Studio returned an error (${res.status}).`)
  }

  const json = await res.json()
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) throw new Error('Google AI Studio returned an empty response.')
  return content
}

// Groq, Cerebras, Mistral, and OpenRouter all expose an OpenAI-compatible
// /chat/completions endpoint, so one function drives all four.
async function callOpenAiCompatibleChat(
  label: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(baseUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    throw new Error(timedOut ? `${label} timed out.` : `Could not reach ${label}.`)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    if (res.status === 429) throw new Error(`${label} is rate-limited.`)
    throw new Error(`${label} returned an error (${res.status}).`)
  }

  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new Error(`${label} returned an empty response.`)
  return content
}

// Free-tier model catalogs shift more than paid ones — Llama 3.3 70B has
// already been pulled from both Groq's and OpenRouter's free lineups once
// since this was written. Verified live against each provider's /models
// endpoint. If a model here 404s again, re-check the current catalog and
// swap the slug — nothing else needs to change.
const GROQ_MODEL = 'openai/gpt-oss-120b'
const CEREBRAS_MODEL = 'gpt-oss-120b'
const MISTRAL_MODEL = 'mistral-large-latest'
// Last-resort fallback: OpenRouter's free tier has the lowest rate limits of
// the five (~20 req/min, ~200 req/day shared across all :free models), so it
// sits at the end of the chain rather than earlier.
const OPENROUTER_MODEL = 'openai/gpt-oss-20b:free'

// Returns providers with a configured API key, in fallback order. Each entry's
// run() throws with a user-facing message on failure; it never rejects with a
// raw fetch/parse error.
export function getAiThemeProviders(): AiThemeProvider[] {
  const providers: AiThemeProvider[] = []

  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    providers.push({ label: 'Google AI Studio', run: callGoogleAiStudio })
  }

  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    providers.push({
      label: 'Groq',
      run: (sys, user) =>
        callOpenAiCompatibleChat('Groq', 'https://api.groq.com/openai/v1/chat/completions', groqKey, GROQ_MODEL, sys, user),
    })
  }

  const cerebrasKey = process.env.CEREBRAS_API_KEY
  if (cerebrasKey) {
    providers.push({
      label: 'Cerebras',
      run: (sys, user) =>
        callOpenAiCompatibleChat('Cerebras', 'https://api.cerebras.ai/v1/chat/completions', cerebrasKey, CEREBRAS_MODEL, sys, user),
    })
  }

  const mistralKey = process.env.MISTRAL_API_KEY
  if (mistralKey) {
    providers.push({
      label: 'Mistral',
      run: (sys, user) =>
        callOpenAiCompatibleChat('Mistral', 'https://api.mistral.ai/v1/chat/completions', mistralKey, MISTRAL_MODEL, sys, user),
    })
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY
  if (openRouterKey) {
    providers.push({
      label: 'OpenRouter',
      run: (sys, user) =>
        callOpenAiCompatibleChat(
          'OpenRouter',
          'https://openrouter.ai/api/v1/chat/completions',
          openRouterKey,
          OPENROUTER_MODEL,
          sys,
          user,
          {
            'HTTP-Referer': 'https://sermon-presenter.app',
            'X-Title': 'Sermon Presenter',
          }
        ),
    })
  }

  return providers
}
