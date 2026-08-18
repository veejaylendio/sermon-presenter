import { parseSermonNotes } from './sermonParser'

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalises punctuation for on-screen reading.
 *
 * Em dashes are hard to read at projection distance and often render as a stray
 * floating bar, so they become commas. Verse ranges use en dashes/hyphens and are
 * deliberately left alone ("Romans 12:18-21" must survive intact).
 */
function normalizePunctuation(str: string): string {
  if (!str) return '';
  return str
    // Leading attribution dash on its own ("— Romans 12:18") is decoration; drop it.
    .replace(/^\s*[—–]\s*/gm, '')
    // A trailing em dash has nothing to join to, so a comma would dangle.
    .replace(/\s*—\s*$/gm, '')
    // Sentence-internal em dash (or typed double hyphen) reads fine as a comma.
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ')
    // Guard against doubling up when the dash already followed punctuation.
    .replace(/([,;:])\s*,\s*/g, '$1 ')
    .trim();
}

export function parseSlideContent(content: string): { header: string; body: string } {
  const rawLines = (content || '')
    .split(/\r?\n/)
    .map(l => normalizePunctuation(l.trim()))
    .filter(l => l.length > 0);
  if (rawLines.length === 0) {
    const trimmed = normalizePunctuation((content || '').trim());
    return { header: escapeHtml(trimmed || 'Untitled Slide'), body: '' };
  }
  const header = escapeHtml(rawLines[0]);
  const body = rawLines.slice(1).map(escapeHtml).join('\n');
  return { header, body };
}

// Base viewport-base.css contents to be injected in every HTML slide page
const VIEWPORT_BASE_CSS = `
html,
body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: var(--stage-bg, #000);
}
.deck-viewport {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: var(--stage-bg, #000);
}
.deck-stage {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    transform-origin: 0 0;
    background: var(--slide-bg, #fff);
}
.deck-stage.panel-transition {
    transition: transform 0.25s ease;
}
.slide {
    position: absolute;
    inset: 0;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    display: block;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    background: var(--slide-bg, #fff);
}
.slide.active,
.slide.visible {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
    z-index: 1;
}
img,
video,
canvas,
svg {
    max-width: 100%;
    max-height: 100%;
}
.deck-controls {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    z-index: 1000;
}
@media print {
    html,
    body {
        width: 1920px;
        height: auto;
        overflow: visible;
        background: #fff;
    }
    .deck-viewport {
        position: static;
        overflow: visible;
        background: #fff;
    }
    .deck-stage {
        position: static;
        width: auto;
        height: auto;
        transform: none !important;
        background: none;
    }
    .slide {
        position: relative;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        width: 1920px;
        height: 1080px;
        break-after: page;
        page-break-after: always;
    }
    .slide:last-child {
        break-after: auto;
        page-break-after: auto;
    }
    .deck-controls {
        display: none !important;
    }
}
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.2s !important;
    }
}
`;

export interface ThemeConfig {
  slug: string;
  name: string;
  fontsLink: string;
  css: string;
  renderSlide: (content: string, isTitle: boolean, orderIndex: number, totalSlides: number) => string;
}

// A bespoke, AI-authored design for one specific sermon. Data-only — CSS and two
// HTML template strings with {{HEADER}}/{{BODY}} placeholders — never executable
// code, so it can be safely interpolated without eval() or a Function constructor.
// Validate with sanitizeCustomTheme() (aiThemeSanitizer.ts) before it ever reaches here.
export interface CustomThemeData {
  name: string;
  fontsLink: string;
  css: string;
  titleSlideTemplate: string;
  bodySlideTemplate: string;
}

// AI-authored templates often reach for Mustache-style conditional sections
// (`{{#HEADER}}...{{/HEADER}}`) to hide a wrapper when that field is empty —
// a reasonable, common pattern, so it's supported as a real feature rather
// than just forbidden in the prompt. Sections are resolved first (deciding
// inclusion from the raw header/body values), then the surviving inner
// {{HEADER}}/{{BODY}} tokens are substituted in a second pass. Anything
// deviating from this exact shape is rejected earlier by sanitizeCustomTheme,
// so this never needs to handle malformed/unknown tags defensively.
function applyCustomTemplate(template: string, header: string, body: string): string {
  const withSections = template
    .replace(/\{\{#HEADER\}\}([\s\S]*?)\{\{\/HEADER\}\}/g, header ? '$1' : '')
    .replace(/\{\{#BODY\}\}([\s\S]*?)\{\{\/BODY\}\}/g, body ? '$1' : '')
  return withSections.replace(/\{\{HEADER\}\}/g, header).replace(/\{\{BODY\}\}/g, body)
}

function buildThemeConfigFromCustom(custom: CustomThemeData): ThemeConfig {
  return {
    slug: 'ai-custom',
    name: custom.name,
    fontsLink: custom.fontsLink,
    css: custom.css,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      const template = isTitle ? custom.titleSlideTemplate : custom.bodySlideTemplate;
      return applyCustomTemplate(template, header, body);
    },
  };
}

function resolveThemeConfig(themeOrCustom: string | CustomThemeData): ThemeConfig {
  return typeof themeOrCustom === 'string'
    ? (THEMES[themeOrCustom] || THEMES['bold-signal'])
    : buildThemeConfigFromCustom(themeOrCustom);
}

// Shared staggered-reveal animation. The three original themes declare their own
// variants; every theme added afterwards composes this instead of restating it.
const REVEAL_CSS = `
  .reveal {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity var(--duration-normal, 0.7s) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)),
                transform var(--duration-normal, 0.7s) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .slide.visible .reveal {
    opacity: 1;
    transform: translateY(0);
  }
  .slide.visible .reveal:nth-child(1) { transition-delay: 0.10s; }
  .slide.visible .reveal:nth-child(2) { transition-delay: 0.25s; }
  .slide.visible .reveal:nth-child(3) { transition-delay: 0.40s; }
`;

// Every theme reuses these class names so the inline editor (which binds to
// .slide-title / .slide-body) and the fixed-stage CSS keep working uniformly.
// These are real fallback values, not just hooks: this block is injected into
// every rendered slide (see generatePreviewHtml / generatePresentationHtml)
// BEFORE the theme's own CSS, so a theme (especially an AI-authored one) that
// forgets to set padding, font-size, or alignment still lands on a safe,
// legible layout instead of raw unstyled browser defaults glued to the corner.
const BASE_SLIDE_CSS = `
  .slide-content-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 120px 140px;
    background: var(--slide-bg);
  }
  .slide-title {
    font-family: var(--font-display);
    font-size: 88px;
    line-height: 1.15;
    margin-bottom: 44px;
    color: var(--text-primary);
    word-break: break-word;
  }
  .slide-body {
    font-family: var(--font-body);
    font-size: 40px;
    line-height: 1.6;
    max-width: 1400px;
    color: var(--text-secondary);
    white-space: pre-wrap;
  }
`;

export const THEMES: { [key: string]: ThemeConfig } = {
  'bold-signal': {
    slug: 'bold-signal',
    name: 'Bold Signal',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #0f0f0f;
        --slide-bg: #1a1a1a;
        --card-bg: #FF5722;
        --text-primary: #ffffff;
        --text-on-card: #121212;
        --font-display: 'Archivo Black', sans-serif;
        --font-body: 'Space Grotesk', sans-serif;
        --duration-normal: 0.6s;
        --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
      }
      .slide-content-wrapper {
        width: 100%;
        height: 100%;
        padding: 90px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        background: linear-gradient(135deg, #1a1a1a 0%, #252525 50%, #111111 100%);
      }
      .slide-card {
        background: var(--card-bg);
        color: var(--text-on-card);
        padding: 60px 80px;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        max-width: 1500px;
        align-self: flex-start;
      }
      .slide-title {
        font-family: var(--font-display);
        font-size: 80px;
        line-height: 1.1;
        margin-bottom: 20px;
        text-transform: uppercase;
        word-break: break-word;
      }
      .slide-body {
        font-family: var(--font-body);
        font-size: 40px;
        font-weight: 500;
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .reveal {
        opacity: 0;
        transform: translateY(40px);
        transition: opacity var(--duration-normal) var(--ease-out-expo),
                    transform var(--duration-normal) var(--ease-out-expo);
      }
      .slide.visible .reveal {
        opacity: 1;
        transform: translateY(0);
      }
      .slide.visible .reveal:nth-child(1) { transition-delay: 0.1s; }
      .slide.visible .reveal:nth-child(2) { transition-delay: 0.25s; }
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);

      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="justify-content: center; align-items: center; text-align: center;">
            <div class="slide-card reveal" style="align-self: center; border-radius: 24px; padding: 80px 100px;">
              <h1 class="slide-title" style="font-size: 96px; margin-bottom: 30px;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 44px; opacity: 0.9;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }

      return `
        <div class="slide-content-wrapper">
          <div class="slide-card reveal">
            <h2 class="slide-title">${header}</h2>
            ${body ? `<p class="slide-body">${body}</p>` : ''}
          </div>
        </div>
      `;
    }
  },
  'dark-botanical': {
    slug: 'dark-botanical',
    name: 'Dark Botanical',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #090909;
        --slide-bg: #0f0f0f;
        --text-primary: #e8e4df;
        --text-secondary: #9a9590;
        --accent: #d4a574;
        --accent-glow: rgba(212, 165, 116, 0.2);
        --font-display: 'Cormorant Garamond', serif;
        --font-body: 'IBM Plex Sans', sans-serif;
        --duration-normal: 0.8s;
        --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
      }
      .slide-content-wrapper {
        width: 100%;
        height: 100%;
        padding: 100px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        background: #0f0f0f;
        position: relative;
        overflow: hidden;
      }
      /* Blurred glow circles in corners */
      .glow-circle {
        position: absolute;
        border-radius: 50%;
        filter: blur(150px);
        opacity: 0.15;
        pointer-events: none;
      }
      .glow-circle-1 {
        width: 600px;
        height: 600px;
        background: var(--accent);
        top: -150px;
        right: -150px;
      }
      .glow-circle-2 {
        width: 500px;
        height: 500px;
        background: #e8b4b8;
        bottom: -150px;
        left: -150px;
      }
      .content-container {
        position: relative;
        z-index: 10;
        max-width: 1400px;
      }
      .slide-title {
        font-family: var(--font-display);
        font-size: 90px;
        font-weight: 600;
        line-height: 1.15;
        color: var(--text-primary);
        margin-bottom: 40px;
        border-bottom: 1px solid rgba(232, 228, 223, 0.1);
        padding-bottom: 20px;
        word-break: break-word;
      }
      .slide-body {
        font-family: var(--font-body);
        font-size: 38px;
        font-weight: 300;
        line-height: 1.5;
        color: var(--text-secondary);
        white-space: pre-wrap;
      }
      .slide-body strong {
        color: var(--accent);
        font-weight: 500;
      }
      .reveal {
        opacity: 0;
        transform: translateY(25px);
        transition: opacity var(--duration-normal) var(--ease-out-expo),
                    transform var(--duration-normal) var(--ease-out-expo);
      }
      .slide.visible .reveal {
        opacity: 1;
        transform: translateY(0);
      }
      .slide.visible .reveal:nth-child(1) { transition-delay: 0.15s; }
      .slide.visible .reveal:nth-child(2) { transition-delay: 0.3s; }
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);

      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="glow-circle glow-circle-1"></div>
            <div class="glow-circle glow-circle-2"></div>
            <div class="content-container reveal">
              <h1 class="slide-title" style="font-size: 110px; font-style: italic; border: none; margin-bottom: 30px;">
                ${header}
              </h1>
              <div style="width: 80px; height: 1px; background: var(--accent); margin: 30px auto;"></div>
              ${body ? `<p class="slide-body" style="font-size: 42px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }

      return `
        <div class="slide-content-wrapper">
          <div class="glow-circle glow-circle-1"></div>
          <div class="glow-circle glow-circle-2"></div>
          <div class="content-container">
            <h2 class="slide-title reveal">${header}</h2>
            ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
          </div>
        </div>
      `;
    }
  },
  'vintage-editorial': {
    slug: 'vintage-editorial',
    name: 'Vintage Editorial',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;0,9..144,900;1,9..144,400&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #eae6df;
        --slide-bg: #f5f3ee;
        --text-primary: #1a1a1a;
        --text-secondary: #4a4a4a;
        --accent-warm: #e8d4c0;
        --font-display: 'Fraunces', serif;
        --font-body: 'Work Sans', sans-serif;
        --duration-normal: 0.7s;
        --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
      }
      .slide-content-wrapper {
        width: 100%;
        height: 100%;
        padding: 100px 120px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background-color: var(--slide-bg);
        border: 24px solid var(--stage-bg);
        position: relative;
      }
      /* Top bar elements */
      .content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        margin-top: 40px;
        max-width: 1400px;
      }
      .slide-title {
        font-family: var(--font-display);
        font-size: 85px;
        font-weight: 900;
        line-height: 1.1;
        color: var(--text-primary);
        margin-bottom: 30px;
        word-break: break-word;
      }
      .slide-body {
        font-family: var(--font-body);
        font-size: 38px;
        line-height: 1.55;
        color: var(--text-secondary);
        white-space: pre-wrap;
      }
      /* Geometric shape accent */
      .shape-accent {
        position: absolute;
        bottom: 80px;
        right: 120px;
        display: flex;
        align-items: center;
        gap: 15px;
      }
      .circle-outline {
        width: 30px;
        height: 30px;
        border: 2px solid var(--text-primary);
        border-radius: 50%;
      }
      .accent-line {
        width: 60px;
        height: 2px;
        background: var(--text-primary);
      }
      .accent-dot {
        width: 12px;
        height: 12px;
        background: var(--text-primary);
        border-radius: 50%;
      }
      .reveal {
        opacity: 0;
        transform: translateY(30px);
        transition: opacity var(--duration-normal) var(--ease-out-expo),
                    transform var(--duration-normal) var(--ease-out-expo);
      }
      .slide.visible .reveal {
        opacity: 1;
        transform: translateY(0);
      }
      .slide.visible .reveal:nth-child(1) { transition-delay: 0.1s; }
      .slide.visible .reveal:nth-child(2) { transition-delay: 0.25s; }
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);

      if (isTitle) {
        return `
          <div class="slide-content-wrapper">
            <div class="content-area reveal" style="align-items: center; text-align: center;">
              <h1 class="slide-title" style="font-size: 105px; font-style: italic; margin-bottom: 25px;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 42px;">${body}</p>` : ''}
            </div>
            <div class="shape-accent">
              <div class="circle-outline"></div>
              <div class="accent-line"></div>
              <div class="accent-dot"></div>
            </div>
          </div>
        `;
      }

      return `
        <div class="slide-content-wrapper">
          <div class="content-area">
            <h2 class="slide-title reveal">${header}</h2>
            ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
          </div>
          <div class="shape-accent">
            <div class="circle-outline"></div>
            <div class="accent-line"></div>
            <div class="accent-dot"></div>
          </div>
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Paper & Ink — warm cream, crimson rule, classical serif.
  // Exposition, Psalms, wisdom, funerals. The safest all-purpose sermon theme.
  // -------------------------------------------------------------------------
  'paper-ink': {
    slug: 'paper-ink',
    name: 'Paper & Ink',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #efece4;
        --slide-bg: #faf9f7;
        --text-primary: #1a1a1a;
        --text-secondary: #4a4744;
        --accent: #c41e3a;
        --font-display: 'Cormorant Garamond', serif;
        --font-body: 'Source Serif 4', serif;
        --duration-normal: 0.8s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 120px 140px; justify-content: center; }
      .rule {
        width: 120px;
        height: 3px;
        background: var(--accent);
        margin-bottom: 48px;
      }
      .slide-title { font-size: 92px; font-weight: 600; line-height: 1.12; margin-bottom: 36px; }
      .slide-body { font-size: 40px; font-weight: 300; line-height: 1.6; max-width: 1450px; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="reveal" style="display: flex; flex-direction: column; align-items: center;">
              <div class="rule" style="margin-bottom: 40px;"></div>
              <h1 class="slide-title" style="font-size: 118px; font-style: italic;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 42px;">${body}</p>` : ''}
              <div class="rule" style="margin: 44px 0 0;"></div>
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="rule reveal"></div>
          <h2 class="slide-title reveal">${header}</h2>
          ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Vellum — deep navy, warm-gold serif, dusty teal. Scholarly and quiet.
  // Exposition of the epistles, apocalyptic, Advent, Holy Week.
  // -------------------------------------------------------------------------
  'vellum': {
    slug: 'vellum',
    name: 'Vellum',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,600;1,300&family=Karla:wght@300;400;500&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #0a1220;
        --slide-bg: #101c2e;
        --text-primary: #f0d9a8;
        --text-secondary: #b9c6d4;
        --accent: #6fa8a0;
        --font-display: 'Spectral', serif;
        --font-body: 'Karla', sans-serif;
        --duration-normal: 0.85s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 120px 140px; justify-content: center; }
      .slide-title { font-size: 88px; font-weight: 600; line-height: 1.15; margin-bottom: 40px; }
      .slide-body { font-size: 38px; font-weight: 300; line-height: 1.62; max-width: 1400px; }
      .hairline {
        width: 100%;
        height: 1px;
        background: linear-gradient(90deg, var(--accent), rgba(111,168,160,0));
        margin-bottom: 44px;
      }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="reveal" style="max-width: 1500px;">
              <h1 class="slide-title" style="font-size: 112px; font-style: italic; margin-bottom: 34px;">${header}</h1>
              <div style="width: 90px; height: 1px; background: var(--accent); margin: 0 auto 34px;"></div>
              ${body ? `<p class="slide-body" style="font-size: 40px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="hairline reveal"></div>
          <h2 class="slide-title reveal">${header}</h2>
          ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Grove — forest green, cream classical serif, rust accent. Rooted, patient.
  // Psalms, creation, Christmas, communion, memorial.
  // -------------------------------------------------------------------------
  'grove': {
    slug: 'grove',
    name: 'Grove',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Source+Sans+3:wght@300;400;600&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #16281f;
        --slide-bg: #1d3327;
        --text-primary: #f2ece0;
        --text-secondary: #c4cec2;
        --accent: #c96b3f;
        --font-display: 'Playfair Display', serif;
        --font-body: 'Source Sans 3', sans-serif;
        --duration-normal: 0.8s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 110px 130px; justify-content: center; }
      .grove-arch {
        position: absolute;
        top: -220px;
        right: -180px;
        width: 720px;
        height: 720px;
        border: 2px solid var(--accent);
        border-radius: 50%;
        opacity: 0.22;
        pointer-events: none;
      }
      .grove-arch.two {
        top: auto;
        right: auto;
        bottom: -260px;
        left: -220px;
        width: 620px;
        height: 620px;
        opacity: 0.14;
      }
      .slide-title { font-size: 90px; font-weight: 700; line-height: 1.14; margin-bottom: 34px; }
      .slide-body { font-size: 38px; font-weight: 300; line-height: 1.6; max-width: 1400px; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="grove-arch"></div>
            <div class="grove-arch two"></div>
            <div class="reveal" style="position: relative; z-index: 2; max-width: 1500px;">
              <h1 class="slide-title" style="font-size: 116px; margin-bottom: 30px;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 40px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="grove-arch"></div>
          <div style="position: relative; z-index: 2;">
            <h2 class="slide-title reveal">${header}</h2>
            ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
          </div>
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Monochrome — ivory ledger, all-black type, zero colour.
  // Good Friday, funerals, wisdom literature, study handouts.
  // -------------------------------------------------------------------------
  'monochrome': {
    slug: 'monochrome',
    name: 'Monochrome',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #e6e3dc;
        --slide-bg: #fbfaf7;
        --text-primary: #0d0d0d;
        --text-secondary: #3a3a3a;
        --accent: #0d0d0d;
        --font-display: 'Lora', serif;
        --font-body: 'Jost', sans-serif;
        --duration-normal: 0.7s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 110px 130px; justify-content: flex-start; }
      .mono-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        border-bottom: 3px solid var(--text-primary);
        padding-bottom: 20px;
        margin-bottom: 70px;
        font-family: var(--font-body);
        font-size: 22px;
        font-weight: 500;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--text-primary);
      }
      .slide-title { font-size: 86px; font-weight: 700; line-height: 1.16; margin-bottom: 36px; }
      .slide-body { font-size: 38px; font-weight: 300; line-height: 1.62; max-width: 1420px; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="justify-content: center; align-items: center; text-align: center;">
            <div class="reveal" style="max-width: 1500px;">
              <div style="width: 160px; height: 3px; background: var(--text-primary); margin: 0 auto 50px;"></div>
              <h1 class="slide-title" style="font-size: 104px;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 40px; margin-top: 26px;">${body}</p>` : ''}
              <div style="width: 160px; height: 3px; background: var(--text-primary); margin: 50px auto 0;"></div>
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="mono-head"></div>
          <h2 class="slide-title reveal">${header}</h2>
          ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Soft Editorial — warm paper, sage and blush, gentle serif.
  // Comfort, pastoral care, weddings, communion.
  // -------------------------------------------------------------------------
  'soft-editorial': {
    slug: 'soft-editorial',
    name: 'Soft Editorial',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Nunito+Sans:wght@300;400;600&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #ece7de;
        --slide-bg: #f7f3ec;
        --text-primary: #2e2a26;
        --text-secondary: #5c564f;
        --accent-sage: #9aab8e;
        --accent-blush: #e0b7b0;
        --font-display: 'EB Garamond', serif;
        --font-body: 'Nunito Sans', sans-serif;
        --duration-normal: 0.85s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 120px 150px; justify-content: center; }
      .soft-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(90px);
        opacity: 0.5;
        pointer-events: none;
      }
      .soft-blob.sage { width: 520px; height: 520px; background: var(--accent-sage); top: -160px; left: -140px; }
      .soft-blob.blush { width: 460px; height: 460px; background: var(--accent-blush); bottom: -170px; right: -130px; }
      .slide-title { font-size: 92px; font-weight: 500; line-height: 1.14; margin-bottom: 34px; }
      .slide-body { font-size: 38px; font-weight: 300; line-height: 1.65; max-width: 1380px; }
      .soft-mark {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 34px;
      }
      .soft-dot { width: 14px; height: 14px; border-radius: 50%; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      const dots = `
        <div class="soft-mark">
          <span class="soft-dot" style="background: var(--accent-sage);"></span>
          <span class="soft-dot" style="background: var(--accent-blush);"></span>
        </div>`;
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="soft-blob sage"></div>
            <div class="soft-blob blush"></div>
            <div class="reveal" style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center;">
              ${dots}
              <h1 class="slide-title" style="font-size: 116px; font-style: italic;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 40px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="soft-blob sage"></div>
          <div class="soft-blob blush"></div>
          <div style="position: relative; z-index: 2;">
            <div class="reveal">${dots}</div>
            <h2 class="slide-title reveal">${header}</h2>
            ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
          </div>
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Broadside — dark editorial canvas, fire-orange accent, newspaper weight.
  // Prophets, repentance, justice, Pentecost.
  // -------------------------------------------------------------------------
  'broadside': {
    slug: 'broadside',
    name: 'Broadside',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #111111;
        --slide-bg: #181818;
        --text-primary: #f5f2ed;
        --text-secondary: #b0aaa2;
        --accent: #ff5a1f;
        --font-display: 'Anton', sans-serif;
        --font-body: 'Barlow', sans-serif;
        --duration-normal: 0.6s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 100px 120px; justify-content: flex-end; }
      .bs-masthead {
        position: absolute;
        top: 80px;
        left: 120px;
        right: 120px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 4px solid var(--accent);
        padding-bottom: 18px;
        font-family: var(--font-body);
        font-size: 24px;
        font-weight: 600;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .slide-title {
        font-size: 118px;
        line-height: 0.96;
        text-transform: uppercase;
        letter-spacing: -0.01em;
        margin-bottom: 34px;
      }
      .slide-body { font-size: 38px; font-weight: 300; line-height: 1.5; max-width: 1400px; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="justify-content: center;">
            <div class="reveal">
              <h1 class="slide-title" style="font-size: 150px;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 42px; border-left: 6px solid var(--accent); padding-left: 30px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="bs-masthead"></div>
          <div>
            <h2 class="slide-title reveal">${header}</h2>
            ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
          </div>
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Stencil & Tablet — bone paper, stencil headlines, earth palette.
  // Old Testament narrative, covenant, Exodus, missions.
  // -------------------------------------------------------------------------
  'stencil-tablet': {
    slug: 'stencil-tablet',
    name: 'Stencil & Tablet',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow+Condensed:wght@300;400;500&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #ddd6c7;
        --slide-bg: #ece5d8;
        --text-primary: #2b2519;
        --text-secondary: #554c3c;
        --accent: #a8552c;
        --accent-2: #6b7148;
        --font-display: 'Oswald', sans-serif;
        --font-body: 'Barlow Condensed', sans-serif;
        --duration-normal: 0.65s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 110px 130px; justify-content: center; }
      .st-bars {
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        height: 18px;
        width: 100%;
      }
      .st-bars span { flex: 1; }
      .slide-title {
        font-size: 96px;
        font-weight: 700;
        line-height: 1.06;
        text-transform: uppercase;
        letter-spacing: 0.01em;
        margin-bottom: 32px;
      }
      .slide-body { font-size: 40px; font-weight: 300; line-height: 1.5; max-width: 1400px; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      const bars = `
        <div class="st-bars">
          <span style="background: var(--accent);"></span>
          <span style="background: var(--accent-2);"></span>
          <span style="background: #c9a227;"></span>
          <span style="background: #7d6b55;"></span>
        </div>`;
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            ${bars}
            <div class="reveal">
              <h1 class="slide-title" style="font-size: 122px;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 42px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          ${bars}
          <h2 class="slide-title reveal">${header}</h2>
          ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Long Table — warm cream and rust, bold uppercase. Gathered and human.
  // Communion, fellowship, hospitality, church family.
  // -------------------------------------------------------------------------
  'long-table': {
    slug: 'long-table',
    name: 'Long Table',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Karla:wght@300;400;500;600&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #f0e6d8;
        --slide-bg: #faf2e6;
        --text-primary: #2a1f18;
        --text-secondary: #5b4a3d;
        --accent: #b5452e;
        --font-display: 'Bebas Neue', sans-serif;
        --font-body: 'Karla', sans-serif;
        --duration-normal: 0.7s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 110px 130px; justify-content: center; }
      .slide-title {
        font-size: 130px;
        line-height: 0.98;
        letter-spacing: 0.02em;
        margin-bottom: 30px;
      }
      .slide-body { font-size: 38px; font-weight: 400; line-height: 1.55; max-width: 1380px; }
      .lt-line {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 120px;
        height: 6px;
        background: var(--accent);
        opacity: 0.85;
      }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="reveal" style="display: flex; flex-direction: column; align-items: center;">
              <h1 class="slide-title" style="font-size: 160px;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 40px;">${body}</p>` : ''}
            </div>
            <div class="lt-line"></div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <h2 class="slide-title reveal">${header}</h2>
          ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
          <div class="lt-line"></div>
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Cobalt Grid — graph-paper canvas, cobalt serif, hairline rules.
  // Structured exposition, doctrine, Bible study, word studies.
  // -------------------------------------------------------------------------
  'cobalt-grid': {
    slug: 'cobalt-grid',
    name: 'Cobalt Grid',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #eceff3;
        --slide-bg: #f8fafc;
        --text-primary: #12234a;
        --text-secondary: #46536e;
        --accent: #1f4fd8;
        --grid-line: rgba(31, 79, 216, 0.10);
        --font-display: 'Libre Baskerville', serif;
        --font-body: 'JetBrains Mono', monospace;
        --duration-normal: 0.6s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper {
        padding: 110px 130px;
        justify-content: center;
        background-image:
          linear-gradient(var(--grid-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
        background-size: 60px 60px;
      }
      .slide-title { font-size: 78px; font-weight: 700; line-height: 1.2; margin-bottom: 34px; }
      .slide-body { font-size: 34px; font-weight: 300; line-height: 1.7; max-width: 1380px; }
      .cg-rule { width: 100%; height: 2px; background: var(--accent); opacity: 0.5; margin-bottom: 36px; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="reveal" style="max-width: 1500px;">
              <h1 class="slide-title" style="font-size: 100px;">${header}</h1>
              <div style="width: 140px; height: 2px; background: var(--accent); margin: 34px auto;"></div>
              ${body ? `<p class="slide-body" style="font-size: 36px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="cg-rule reveal"></div>
          <h2 class="slide-title reveal">${header}</h2>
          ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
        </div>
      `;
    }
  },

  // -------------------------------------------------------------------------
  // Biennale Yellow — solar yellow on parchment, indigo serif, sun-glow.
  // Easter, Epiphany, celebration, hope.
  // -------------------------------------------------------------------------
  'biennale-yellow': {
    slug: 'biennale-yellow',
    name: 'Biennale Yellow',
    fontsLink: '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">',
    css: `
      :root {
        --stage-bg: #efe7d6;
        --slide-bg: #f7f0df;
        --text-primary: #1e2464;
        --text-secondary: #454a80;
        --accent: #f5c518;
        --font-display: 'DM Serif Display', serif;
        --font-body: 'DM Sans', sans-serif;
        --duration-normal: 0.8s;
      }
      ${BASE_SLIDE_CSS}
      .slide-content-wrapper { padding: 110px 130px; justify-content: center; overflow: hidden; }
      .by-sun {
        position: absolute;
        width: 900px;
        height: 900px;
        border-radius: 50%;
        background: radial-gradient(circle, var(--accent) 0%, rgba(245,197,24,0.35) 45%, rgba(245,197,24,0) 72%);
        top: -320px;
        right: -240px;
        pointer-events: none;
      }
      .slide-title { font-size: 100px; line-height: 1.08; margin-bottom: 32px; }
      .slide-body { font-size: 38px; font-weight: 300; line-height: 1.6; max-width: 1380px; }
      .by-bar { width: 180px; height: 10px; background: var(--accent); margin-bottom: 40px; }
      ${REVEAL_CSS}
    `,
    renderSlide: (content, isTitle) => {
      const { header, body } = parseSlideContent(content);
      if (isTitle) {
        return `
          <div class="slide-content-wrapper" style="align-items: center; text-align: center;">
            <div class="by-sun"></div>
            <div class="reveal" style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center;">
              <div class="by-bar"></div>
              <h1 class="slide-title" style="font-size: 124px; font-style: italic;">${header}</h1>
              ${body ? `<p class="slide-body" style="font-size: 40px;">${body}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="slide-content-wrapper">
          <div class="by-sun"></div>
          <div style="position: relative; z-index: 2;">
            <h2 class="slide-title reveal">${header}</h2>
            ${body ? `<p class="slide-body reveal">${body}</p>` : ''}
          </div>
        </div>
      `;
    }
  }
};

export function generatePreviewHtml(themeOrCustom: string | CustomThemeData, content: string = 'Untitled Sermon'): string {
  const themeConfig = resolveThemeConfig(themeOrCustom);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview - ${themeConfig.name}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    ${themeConfig.fontsLink}
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        /* Base Viewport Styles */
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            overflow: hidden;
            background: var(--stage-bg, #000);
        }
        .deck-stage {
            position: absolute;
            left: 0;
            top: 0;
            width: 1920px;
            height: 1080px;
            overflow: hidden;
            transform-origin: 0 0;
            background: var(--slide-bg, #fff);
        }
        .slide {
            position: absolute;
            inset: 0;
            width: 1920px;
            height: 1080px;
            overflow: hidden;
            visibility: visible;
            opacity: 1;
            background: var(--slide-bg, #fff);
        }

        /* Base slide layout fallbacks (padding/sizing/centering safety net) */
        ${BASE_SLIDE_CSS}

        /* Custom Theme Styles */
        ${themeConfig.css}
    </style>
</head>
<body>
    <main class="deck-stage" id="deckStage">
        <section class="slide visible">
            ${themeConfig.renderSlide(content, true, 0, 1)}
        </section>
    </main>
    <script>
        function setupStageScale() {
            const stage = document.getElementById('deckStage');
            const scale = () => {
                const w = window.innerWidth || document.documentElement.clientWidth;
                const h = window.innerHeight || document.documentElement.clientHeight;
                if (!w || !h) {
                    requestAnimationFrame(scale);
                    return;
                }
                const factor = Math.min(w / 1920, h / 1080);
                const x = (w - 1920 * factor) / 2;
                const y = (h - 1080 * factor) / 2;
                stage.style.transform = \`translate(\${x}px, \${y}px) scale(\${factor})\`;
            };
            scale();
            window.addEventListener('resize', scale);
            window.addEventListener('load', scale);
            document.addEventListener('DOMContentLoaded', scale);
            if (typeof ResizeObserver !== 'undefined' && document.body) {
                new ResizeObserver(scale).observe(document.body);
            }
        }
        setupStageScale();
    </script>
</body>
</html>`;
}

// Styles for the in-deck widget system (Add button, popover, canvas widgets, config panel).
// Lives alongside the Edit Mode styles injected into generatePresentationHtml.
const WIDGET_SYSTEM_CSS = `
/* --dock-offset shifts every left-docked toolbar button clear of the Edit Mode
   filmstrip (200px wide, docked at left:0). Defaults to a plain 20px margin
   (no filmstrip present); the bootstrap script overwrites it on
   document.documentElement whenever body.mode-edit is active. Each button below
   keeps its original spacing from the previous one, just re-based on the
   variable instead of a bare 20px. */
:root {
    --dock-offset: 20px;
}
.add-widget-toggle,
.toolbar-btn {
    position: fixed;
    top: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #ffffff;
    border: 1px solid rgba(0,0,0,0.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: 26px;
    line-height: 1;
    color: var(--primary, #6366f1);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transform: translateY(-8px) scale(0.9);
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease, left 0.2s ease;
    z-index: 10001;
}
.add-widget-toggle { left: calc(var(--dock-offset) + 62px); }
.toolbar-btn svg { width: 22px; height: 22px; }
#addSlideToggle { left: calc(var(--dock-offset) + 124px); }
#deleteSlideToggle { left: calc(var(--dock-offset) + 186px); }
#undoToggle { left: calc(var(--dock-offset) + 248px); }
#redoToggle { left: calc(var(--dock-offset) + 310px); }
.add-widget-toggle.show,
.toolbar-btn.show {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
}
.add-widget-toggle:hover,
.add-widget-toggle.active,
.toolbar-btn:hover:not(:disabled) {
    background: var(--primary, #6366f1);
    color: #fff;
}
.toolbar-btn.show:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    pointer-events: none;
}
/* Structural edit controls (edit toggle, add widget, add/delete slide,
   undo/redo) now live in the parent app's title-bar toolbar instead of
   floating over the deck - the buttons/handlers above stay fully wired
   (driven via postMessage commands relayed from the parent, see
   postToParent/postEditorState below) but are never rendered in this
   iframe itself. */
.edit-hotzone,
.edit-toggle,
.add-widget-toggle,
.toolbar-btn {
    display: none !important;
}
.widget-popover {
    position: fixed;
    top: 82px;
    left: 82px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.22);
    padding: 8px;
    display: none;
    flex-direction: column;
    gap: 2px;
    min-width: 180px;
    z-index: 10002;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.widget-popover.open { display: flex; }
.widget-popover-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 8px;
    cursor: pointer;
    color: #1a1a1a;
    font-size: 14px;
    font-weight: 500;
    border: none;
    background: transparent;
    text-align: left;
}
.widget-popover-item:hover { background: rgba(99,102,241,0.1); color: var(--primary, #6366f1); }
.widget-popover-item svg { width: 18px; height: 18px; flex-shrink: 0; }
.slide-widget {
    position: absolute;
    box-sizing: border-box;
    touch-action: none;
    user-select: none;
}
.slide-widget > *:first-child {
    overflow: hidden;
}
.edit-active .slide-widget { cursor: move; }
.edit-active .slide-widget:hover { outline: 1px dashed rgba(99,102,241,0.6); }
.slide-widget.selected {
    outline: 2px solid var(--primary, #6366f1) !important;
    outline-offset: 2px;
}
.widget-delete-btn,
.widget-resize-handle {
    position: absolute;
    display: none;
    z-index: 5;
}
.edit-active .slide-widget.selected .widget-delete-btn,
.edit-active .slide-widget.selected .widget-resize-handle {
    display: flex;
}
.widget-delete-btn {
    top: -14px;
    right: -14px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #ef4444;
    color: #fff;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.widget-resize-handle {
    bottom: -8px;
    right: -8px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary, #6366f1);
    border: 2px solid #fff;
    cursor: nwse-resize;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.widget-text-el {
    width: 100%;
    height: 100%;
    outline: none;
    word-wrap: break-word;
    user-select: text;
}
.widget-shape-el {
    width: 100%;
    height: 100%;
}
.widget-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 12px;
    background: rgba(99,102,241,0.06);
    border: 2px dashed rgba(99,102,241,0.35);
    color: rgba(60,60,60,0.6);
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-sizing: border-box;
}
.widget-config-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    height: 100%;
    background: #ffffff;
    box-shadow: -8px 0 24px rgba(0,0,0,0.18);
    z-index: 10003;
    transform: translateX(100%);
    transition: transform 0.25s ease;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #1a1a1a;
}
.widget-config-panel.open { transform: translateX(0); }
.widget-config-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    position: sticky;
    top: 0;
    background: #fff;
    z-index: 1;
}
.widget-config-header h3 { font-size: 15px; font-weight: 600; margin: 0; text-transform: capitalize; }
.widget-config-close {
    width: 28px; height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(0,0,0,0.06);
    cursor: pointer;
    font-size: 15px;
    display: flex; align-items: center; justify-content: center;
}
.widget-config-body { padding: 6px 18px 24px; }
.widget-field-group { margin: 14px 0; }
.widget-field-group label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 6px;
}
.widget-field-group input[type="text"],
.widget-field-group input[type="number"],
.widget-field-group select,
.widget-field-group textarea {
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(0,0,0,0.15);
    font-size: 13px;
    box-sizing: border-box;
    font-family: inherit;
}
.widget-field-group textarea { resize: vertical; min-height: 60px; }
.widget-field-group input[type="color"] {
    width: 40px; height: 30px; border: none; border-radius: 6px; padding: 0; cursor: pointer;
}
.widget-field-row { display: flex; align-items: center; gap: 10px; }
.widget-field-row input[type="range"] { flex: 1; }
.widget-range-val { font-size: 12px; color: #6b7280; min-width: 34px; text-align: right; }
.widget-checkbox-row { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
.widget-checkbox-row label { margin: 0; font-size: 13px; font-weight: 500; color: #1a1a1a; text-transform: none; letter-spacing: normal; }
.widget-toggle-group { display: flex; gap: 6px; flex-wrap: wrap; }
.widget-toggle-btn {
    padding: 6px 11px;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.15);
    background: #fff;
    font-size: 12px;
    cursor: pointer;
}
.widget-toggle-btn.active { background: var(--primary, #6366f1); color: #fff; border-color: var(--primary, #6366f1); }
.widget-icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.widget-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    padding: 7px;
    border-radius: 8px;
    border: 1px solid rgba(0,0,0,0.15);
    background: #fff;
    color: #4b5563;
    cursor: pointer;
}
.widget-icon-btn svg { width: 100%; height: 100%; }
.widget-icon-btn:hover { background: rgba(99,102,241,0.08); }
.widget-icon-btn.active { background: rgba(99,102,241,0.1); border-color: var(--primary, #6366f1); color: var(--primary, #6366f1); }
.widget-section-title {
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    margin: 20px 0 6px;
    padding-top: 14px;
    border-top: 1px solid rgba(0,0,0,0.06);
}
.widget-section-title:first-child { border-top: none; padding-top: 0; margin-top: 6px; }
.widget-file-btn {
    display: inline-block;
    padding: 7px 12px;
    border-radius: 8px;
    background: rgba(99,102,241,0.1);
    color: var(--primary, #6366f1);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}
`;

/* ==== Filmstrip (Edit Mode slide navigator) ====
   Canva-style slide rail docked at the left edge, edit mode only. A dark/glass
   surface deliberately, so it reads as chrome distinct from both the light
   .widget-config-panel (docked right) and the slide content itself; the shadow
   shape/blur mirrors widget-config-panel's own box-shadow, just flipped to the
   opposite edge and intensified for a dark background. */
const FILMSTRIP_CSS = `
.slide-filmstrip {
    position: fixed;
    top: 0;
    left: 0;
    width: 200px;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    z-index: 500;
    background: rgba(17, 17, 22, 0.92);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-right: 1px solid rgba(255,255,255,0.08);
    box-shadow: 8px 0 24px rgba(0,0,0,0.18);
    padding: 16px 12px;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.filmstrip-thumb {
    position: relative;
    width: 100%;
    padding-top: 56.25%; /* 16:9 */
    margin-bottom: 12px;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: #000;
    border: 2px solid transparent;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: border-color 0.15s ease;
}
.filmstrip-thumb:hover {
    border-color: rgba(255,255,255,0.28);
}
.filmstrip-thumb.active {
    border-color: var(--primary, #6366f1);
    box-shadow: 0 0 0 2px rgba(99,102,241,0.35), 0 2px 8px rgba(0,0,0,0.3);
}
.filmstrip-thumb.dragging {
    opacity: 0.4;
}
.filmstrip-thumb-number {
    position: absolute;
    top: 4px;
    left: 6px;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.85);
    background: rgba(0,0,0,0.55);
    padding: 1px 6px;
    border-radius: 4px;
    z-index: 2;
    pointer-events: none;
}
.filmstrip-thumb-inner {
    position: absolute;
    top: 0;
    left: 0;
    width: 1920px;
    height: 1080px;
    transform-origin: 0 0;
    pointer-events: none;
}
body.mode-present .slide-filmstrip {
    display: none;
}
`;

/* ==== Right-click context menu ====
   Shown on right-click over a widget, a slide's empty background, or the
   title/body text. Same floating-chrome visual language as .widget-popover
   (white surface, rounded, box-shadow: 0 12px 32px rgba(0,0,0,0.22)) so it
   reads as part of the same UI family, just point-anchored instead of
   anchored to a toggle button. z-index is deliberately higher than every
   other floating panel (widget-config-panel 10003, widget-popover 10002)
   so it's never hidden behind one that happens to be open. */
const CONTEXT_MENU_CSS = `
.context-menu {
    position: fixed;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.22);
    padding: 6px;
    display: none;
    flex-direction: column;
    gap: 1px;
    min-width: 200px;
    z-index: 10050;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.context-menu.open { display: flex; }
.context-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 8px;
    cursor: pointer;
    color: #1a1a1a;
    font-size: 13px;
    font-weight: 500;
    border: none;
    background: transparent;
    text-align: left;
    width: 100%;
}
.context-menu-item .context-menu-shortcut {
    margin-left: auto;
    font-size: 11px;
    color: rgba(0,0,0,0.4);
    font-weight: 400;
}
.context-menu-item:hover:not([disabled]) { background: rgba(99,102,241,0.1); color: var(--primary, #6366f1); }
.context-menu-item.danger:hover:not([disabled]) { background: rgba(239,68,68,0.1); color: #ef4444; }
.context-menu-item[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
    pointer-events: none;
}
.context-menu-separator {
    height: 1px;
    background: rgba(0,0,0,0.08);
    margin: 4px 6px;
}
body.mode-present .context-menu {
    display: none !important;
}
`;

/* ==== Title/body free-position drag/resize handles ====
   Analogous to .widget-delete-btn/.widget-resize-handle above: a small circular
   move handle (top-left, mirroring the delete button's top-right convention) plus
   the widget system's own .widget-resize-handle class reused as-is (bottom-right).
   Shown only on focus (see InlineEditor.prototype.showTextHandles/hideTextHandles)
   so they never sit on top of the text itself or interfere with placing a cursor
   to type - hence display:none as the CSS default here rather than any hover rule. */
const TEXT_HANDLES_CSS = `
.text-move-handle {
    position: absolute;
    display: none;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--primary, #6366f1);
    color: #fff;
    cursor: move;
    z-index: 6;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.text-move-handle svg {
    width: 14px;
    height: 14px;
}
.edit-active .slide-title:hover,
.edit-active .slide-body:hover {
    outline: 1px dashed rgba(99,102,241,0.6);
}
body.mode-present .text-move-handle,
body.mode-present .text-resize-handle {
    display: none !important;
}
`;

/* ==== Smart Guides (Canva-style alignment/snapping overlay) ====
   One reused overlay per SmartGuides instance (see SMART_GUIDES_JS), re-parented
   into whichever .slide is currently being dragged in - same single-reused
   -instance pattern as ThumbnailManager/FloatingToolbar rather than one overlay
   per slide. Sized/positioned exactly like a .slide-widget (1920x1080,
   position:absolute, design-pixel left/top) so it inherits the #deckStage scale
   transform automatically. z-index 7 clears .widget-resize-handle/.widget
   -delete-btn (5) and .text-move-handle (6) - the in-slide elements it must sit
   above - but stays well under editor chrome like .floating-toolbar (10010).
   Magenta deliberately, not this app's own --primary indigo/violet (used for
   selection outlines), so a guide reads as a distinct, purpose-specific signal. */
const SMART_GUIDES_CSS = `
.smart-guides {
    position: absolute;
    inset: 0;
    width: 1920px;
    height: 1080px;
    pointer-events: none;
    z-index: 7;
}
.smart-guide-line {
    position: absolute;
    display: none;
    background: #ff4dd8;
}
.smart-guide-line.vertical {
    top: 0;
    width: 2px;
    height: 100%;
}
.smart-guide-line.horizontal {
    left: 0;
    height: 2px;
    width: 100%;
}
body.mode-present .smart-guides {
    display: none !important;
}
`;

// Runtime for in-deck slide structure: Add Slide / Delete Slide, backed by a
// stable data-slide-id (independent of position) so widget/text-edit storage
// keyed by slide id stays correctly attached across inserts/deletes. Persists
// to its own localStorage key and replays before SlidePresentation snapshots
// the slide list (see the init order at the bottom of this template). Written
// without template literals/backticks throughout since this whole file is
// itself one giant template literal — note any backslash meant to survive
// into the embedded script (e.g. the \\d+ regex below) must be doubled here,
// since this outer literal's own string-escape parsing runs first.
const SLIDE_SYSTEM_JS = `
function SlideManager() {
    this.storageKey = 'sermon_slides_' + window.location.pathname;
    this.order = [];
    this.blankSet = {};
    this.nextSeq = 0;
    this.addBtn = null;
    this.deleteBtn = null;
    this.clipboardSlide = null;
    // Deliberately NOT calling this.load() here anymore: it replayed this
    // browser's localStorage-cached slide order/blank-slide state over
    // whatever was just freshly baked into the HTML, which meant regenerating
    // a presentation with a different theme (or after editing raw notes)
    // could come back scrambled by leftover local state from a previous
    // editing session on the SAME pathname - a real, confusing bug once full
    // -deck autosave to Supabase became the actual source of truth (the
    // loaded HTML is already authoritative; there's nothing left to replay).
    this.initFromBakedSlides();
    this.wireToolbar();
}

SlideManager.prototype.initFromBakedSlides = function () {
    var stage = document.getElementById('deckStage');
    var bakedEls = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
    this.order = bakedEls.map(function (el) { return el.getAttribute('data-slide-id'); });
    this.nextSeq = bakedEls.length;
    this.reindex();
};

SlideManager.prototype.createBlankSlideEl = function (id) {
    var el = document.createElement('section');
    el.className = 'slide';
    el.setAttribute('data-slide-id', id);
    return el;
};

SlideManager.prototype.load = function () {
    var stage = document.getElementById('deckStage');
    var bakedEls = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
    var self = this;

    var raw = null;
    try { raw = localStorage.getItem(this.storageKey); } catch (e) {}
    var data = null;
    if (raw) {
        try { data = JSON.parse(raw); } catch (e) { data = null; }
    }

    if (!data || !data.order || !data.order.length) {
        this.order = bakedEls.map(function (el) { return el.getAttribute('data-slide-id'); });
        this.nextSeq = bakedEls.length;
        this.reindex();
        return;
    }

    var bakedById = {};
    bakedEls.forEach(function (el) { bakedById[el.getAttribute('data-slide-id')] = el; });
    var blankSet = {};
    (data.blankIds || []).forEach(function (id) { blankSet[id] = true; });

    var finalEls = data.order.map(function (id) {
        if (bakedById[id]) return bakedById[id];
        if (blankSet[id]) return self.createBlankSlideEl(id);
        return null;
    }).filter(function (el) { return !!el; });

    if (finalEls.length === 0) {
        this.order = bakedEls.map(function (el) { return el.getAttribute('data-slide-id'); });
        this.nextSeq = bakedEls.length;
        this.blankSet = {};
        this.reindex();
        return;
    }

    finalEls.forEach(function (el) { stage.appendChild(el); });
    bakedEls.forEach(function (el) {
        if (finalEls.indexOf(el) === -1) el.remove();
    });

    this.blankSet = blankSet;

    var maxSeq = bakedEls.length - 1;
    var seqPattern = new RegExp('^slide-new-(\\d+)$');
    data.order.forEach(function (id) {
        var m = seqPattern.exec(id);
        if (m) {
            var n = parseInt(m[1], 10);
            if (n > maxSeq) maxSeq = n;
        }
    });
    this.nextSeq = maxSeq + 1;

    this.reindex();
};

SlideManager.prototype.reindex = function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll('#deckStage .slide'));
    slides.forEach(function (el, i) { el.setAttribute('data-index', String(i)); });
    this.order = slides.map(function (el) { return el.getAttribute('data-slide-id'); });
    this.updateDeleteButtonState();
};

SlideManager.prototype.save = function () {
    var payload = { order: this.order, blankIds: Object.keys(this.blankSet) };
    try { localStorage.setItem(this.storageKey, JSON.stringify(payload)); } catch (e) {}
    scheduleSave();
};

SlideManager.prototype.attachNode = function (el, beforeSiblingOrNull) {
    var stage = document.getElementById('deckStage');
    if (beforeSiblingOrNull && beforeSiblingOrNull.parentNode === stage) {
        stage.insertBefore(el, beforeSiblingOrNull);
    } else {
        stage.appendChild(el);
    }
    this.reindex();
    this.save();
};

SlideManager.prototype.detachNode = function (el) {
    if (el.parentNode) el.parentNode.removeChild(el);
    this.reindex();
    this.save();
};

SlideManager.prototype.afterStructuralChange = function (focusSlideId) {
    window.presentationController.refreshSlides();
    var idx = this.order.indexOf(focusSlideId);
    window.presentationController.showSlide(idx < 0 ? 0 : idx);
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'slide-count-changed', count: this.order.length }, '*');
    }
    // Add/delete/reorder are infrequent discrete actions (unlike typing/dragging),
    // so a full filmstrip re-render here is cheap and simplest.
    if (window.thumbnailManager) window.thumbnailManager.renderAll();
};

SlideManager.prototype.getCurrentSlideId = function () {
    var idx = (window.presentationController && window.presentationController.currentSlide) || 0;
    var el = document.querySelector('#deckStage .slide[data-index="' + idx + '"]');
    return el ? el.getAttribute('data-slide-id') : null;
};

SlideManager.prototype.updateDeleteButtonState = function () {
    if (this.deleteBtn) this.deleteBtn.disabled = this.order.length <= 1;
    postEditorState();
};

SlideManager.prototype.addSlideAfter = function (afterId) {
    var afterEl = afterId ? document.querySelector('#deckStage .slide[data-slide-id="' + afterId + '"]') : null;
    var id = 'slide-new-' + (this.nextSeq++);
    var el = this.createBlankSlideEl(id);
    var nextSibling = afterEl ? afterEl.nextSibling : null;
    this.blankSet[id] = true;
    this.attachNode(el, nextSibling);
    window.historyManager.push({ kind: 'slide-structural', op: 'add', node: el, nextSibling: nextSibling });
    this.afterStructuralChange(id);
};

SlideManager.prototype.deleteSlide = function (id) {
    if (!id || this.order.length <= 1) return false;
    var el = document.querySelector('#deckStage .slide[data-slide-id="' + id + '"]');
    if (!el) return false;
    var idxBefore = this.order.indexOf(id);
    var nextSibling = el.nextSibling;
    this.detachNode(el);
    window.historyManager.push({ kind: 'slide-structural', op: 'delete', node: el, nextSibling: nextSibling });
    var order = this.order;
    var newIdx = Math.min(Math.max(idxBefore, 0), order.length - 1);
    this.afterStructuralChange(order[newIdx]);
    return true;
};

// Clones a slide (title/body text + styles + widgets) and inserts the copy
// right after the source. Reuses the same 'slide-new-N' id scheme as
// addSlideAfter so it plugs into load()'s nextSeq-restore regex unchanged.
// Widgets are stripped from the raw DOM clone and rebuilt through the real
// rendering pipeline instead of left as inert cloned markup, because
// cloneNode never carries event listeners - a naive clone would render
// undraggable, unselectable duplicate widgets with colliding ids. The whole
// operation (node insert + widget rebuild) is pushed as a single
// 'slide-structural' history entry, so it undoes/redoes atomically.
// Shared by duplicateSlide and pasteSlideAfter: takes a (possibly already-
// detached) clone of a slide's DOM, strips its widgets (cloneNode never
// carries event listeners - a naive clone would render undraggable,
// unselectable duplicate widgets with colliding ids, so they're rebuilt
// through the real rendering pipeline instead), inserts it after afterId,
// then repopulates widgets/text styles from sourceStateId's *current* state.
// sourceStateId is separate from the clone itself because pasteSlideAfter
// wants a possibly-stale DOM snapshot (taken at copy time) paired with the
// source slide's live widget/style data (simplest correct behavior if the
// source was edited, or even deleted, between copy and paste).
SlideManager.prototype._insertSlideClone = function (cloneEl, afterId, sourceStateId) {
    var newId = 'slide-new-' + (this.nextSeq++);
    cloneEl.setAttribute('data-slide-id', newId);
    cloneEl.removeAttribute('data-index');
    var clonedWidgets = Array.prototype.slice.call(cloneEl.querySelectorAll('.slide-widget'));
    clonedWidgets.forEach(function (w) { w.remove(); });

    var afterEl = afterId ? document.querySelector('#deckStage .slide[data-slide-id="' + afterId + '"]') : null;
    var nextSibling = afterEl ? afterEl.nextSibling : null;
    this.attachNode(cloneEl, nextSibling);

    if (window.widgetManager) window.widgetManager.duplicateWidgetsForSlide(sourceStateId, newId);
    if (window.editorController) window.editorController.duplicateSlideStyles(sourceStateId, cloneEl);

    window.historyManager.push({ kind: 'slide-structural', op: 'add', node: cloneEl, nextSibling: nextSibling });
    this.afterStructuralChange(newId);
    return newId;
};

SlideManager.prototype.duplicateSlide = function (id) {
    var srcEl = document.querySelector('#deckStage .slide[data-slide-id="' + id + '"]');
    if (!srcEl) return;
    this._insertSlideClone(srcEl.cloneNode(true), id, id);
};

// Whole-slide clipboard for the filmstrip's Copy/Paste (distinct from
// WidgetManager's copyWidget/pasteWidget, which is scoped to a single widget
// and used by the canvas right-click menu instead). Snapshotting the DOM node
// at copy time (rather than keeping a live reference by id) matches how
// copyWidget snapshots a widget - "paste" should reproduce what you copied,
// not whatever the source has drifted into by paste time.
SlideManager.prototype.copySlide = function (id) {
    var srcEl = document.querySelector('#deckStage .slide[data-slide-id="' + id + '"]');
    if (!srcEl) return;
    this.clipboardSlide = { el: srcEl.cloneNode(true), sourceId: id };
};

SlideManager.prototype.pasteSlideAfter = function (afterId) {
    if (!this.clipboardSlide) return;
    this._insertSlideClone(this.clipboardSlide.el.cloneNode(true), afterId, this.clipboardSlide.sourceId);
};

// Physically relocates a slide's DOM node so it ends up at targetIndex in the
// final order, then reindexes/saves. Used both by SlideManager.reorderSlide
// (filmstrip drag-reorder) and by HistoryManager's 'slide-reorder' undo/redo,
// which is why the DOM move is split out from the history-push/notify parts.
SlideManager.prototype.moveNodeToIndex = function (el, targetIndex) {
    var stage = document.getElementById('deckStage');
    var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
    var idx = slides.indexOf(el);
    if (idx === -1) return;
    slides.splice(idx, 1);
    targetIndex = Math.max(0, Math.min(targetIndex, slides.length));
    var refEl = slides[targetIndex] || null;
    if (refEl) {
        stage.insertBefore(el, refEl);
    } else {
        stage.appendChild(el);
    }
    this.reindex();
    this.save();
};

SlideManager.prototype.reorderSlide = function (id, newIndex) {
    var el = document.querySelector('#deckStage .slide[data-slide-id="' + id + '"]');
    if (!el) return false;
    var fromIndex = this.order.indexOf(id);
    if (fromIndex === -1) return false;
    var maxIndex = this.order.length - 1;
    newIndex = Math.max(0, Math.min(newIndex, maxIndex));
    if (newIndex === fromIndex) return false;
    this.moveNodeToIndex(el, newIndex);
    window.historyManager.push({ kind: 'slide-reorder', id: id, fromIndex: fromIndex, toIndex: newIndex });
    this.afterStructuralChange(id);
    return true;
};

SlideManager.prototype.wireToolbar = function () {
    var self = this;
    this.addBtn = document.getElementById('addSlideToggle');
    this.deleteBtn = document.getElementById('deleteSlideToggle');
    this.addBtn.addEventListener('click', function () {
        self.addSlideAfter(self.getCurrentSlideId());
    });
    this.deleteBtn.addEventListener('click', function () {
        self.deleteSlide(self.getCurrentSlideId());
    });
    this.updateDeleteButtonState();
};

SlideManager.prototype.setEditMode = function (active) {
    if (this.addBtn) this.addBtn.classList.toggle('show', active);
    if (this.deleteBtn) this.deleteBtn.classList.toggle('show', active);
};
`;

// Canva-style Edit Mode slide navigator docked at the left edge (see
// FILMSTRIP_CSS). Only constructed while body.mode-edit is active; kept alive
// (hidden, not destroyed) across set-mode switches so re-entering edit mode
// doesn't need a full rebuild. Written without template literals/backticks
// throughout since this whole file is itself one giant template literal.
const FILMSTRIP_SYSTEM_JS = `
function ThumbnailManager() {
    this.container = document.createElement('div');
    this.container.className = 'slide-filmstrip';
    this.container.id = 'slideFilmstrip';
    document.body.appendChild(this.container);
    this.refreshTimers = {};
    this.dragId = null;
    this.renderAll();
}

// Coordinate width the real stage-scaling code assumes (see setupStageScale's
// own 1920 reference) - reused here rather than re-derived so a thumbnail
// clone's scale-down factor always matches the deck's actual proportions.
ThumbnailManager.BASE_WIDTH = 1920;
ThumbnailManager.BASE_HEIGHT = 1080;

ThumbnailManager.prototype.renderAll = function () {
    var self = this;
    this.container.innerHTML = '';
    var slides = Array.prototype.slice.call(document.querySelectorAll('#deckStage .slide'));
    slides.forEach(function (slideEl, i) {
        self.container.appendChild(self.buildThumb(slideEl, i));
    });
    this.updateActive(window.presentationController ? window.presentationController.currentSlide : 0);
};

ThumbnailManager.prototype.stripIds = function (el) {
    if (el.hasAttribute && el.hasAttribute('id')) el.removeAttribute('id');
    var withIds = el.querySelectorAll ? el.querySelectorAll('[id]') : [];
    Array.prototype.forEach.call(withIds, function (node) { node.removeAttribute('id'); });
    // The clone must never itself become editable/interactive - it's a
    // pointer-events:none preview only.
    var editable = el.querySelectorAll ? el.querySelectorAll('[contenteditable]') : [];
    Array.prototype.forEach.call(editable, function (node) { node.removeAttribute('contenteditable'); });
    // promoteToFreeform() re-parents move/resize handles to be direct children
    // of .slide (see InlineEditor), so a full cloneNode(true) of a slide picks
    // up whatever handles that slide currently has - dead, unstyled duplicates
    // once inside a thumbnail (no JS is ever attached to a clone). Strip them.
    var handles = el.querySelectorAll ? el.querySelectorAll('.text-move-handle, .text-resize-handle, .widget-resize-handle, .widget-delete-btn, .smart-guides') : [];
    Array.prototype.forEach.call(handles, function (node) { node.parentNode.removeChild(node); });
};

ThumbnailManager.prototype.buildThumb = function (slideEl, index) {
    var self = this;
    var id = slideEl.getAttribute('data-slide-id');
    var thumb = document.createElement('div');
    thumb.className = 'filmstrip-thumb';
    thumb.setAttribute('data-slide-id', id);
    thumb.setAttribute('draggable', 'true');

    var numberLabel = document.createElement('div');
    numberLabel.className = 'filmstrip-thumb-number';
    numberLabel.textContent = String(index + 1);
    thumb.appendChild(numberLabel);

    var inner = document.createElement('div');
    inner.className = 'filmstrip-thumb-inner';
    var clone = slideEl.cloneNode(true);
    this.stripIds(clone);
    clone.classList.add('active', 'visible');
    inner.appendChild(clone);
    thumb.appendChild(inner);

    // 200px filmstrip minus its 12px*2 padding = 176px of usable thumb width.
    var scale = 176 / ThumbnailManager.BASE_WIDTH;
    inner.style.width = ThumbnailManager.BASE_WIDTH + 'px';
    inner.style.height = ThumbnailManager.BASE_HEIGHT + 'px';
    inner.style.transform = 'scale(' + scale + ')';

    thumb.addEventListener('click', function () {
        if (!window.presentationController) return;
        window.presentationController.showSlide(index);
    });

    thumb.addEventListener('dragstart', function (e) {
        self.dragId = id;
        thumb.classList.add('dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', id); } catch (err) {}
        }
    });
    thumb.addEventListener('dragend', function () {
        thumb.classList.remove('dragging');
        self.dragId = null;
    });
    thumb.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    thumb.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!self.dragId || self.dragId === id) return;
        var targetIndex = Array.prototype.indexOf.call(self.container.children, thumb);
        window.slideManager.reorderSlide(self.dragId, targetIndex);
    });

    return thumb;
};

// Re-clones a single slide's thumbnail rather than the whole filmstrip, so
// live edits (typing, widget field tweaks) don't re-render every thumbnail on
// every keystroke. Debounced per-slide.
ThumbnailManager.prototype.refresh = function (slideId) {
    var self = this;
    clearTimeout(this.refreshTimers[slideId]);
    this.refreshTimers[slideId] = setTimeout(function () {
        var slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + slideId + '"]');
        var oldThumb = self.container.querySelector('.filmstrip-thumb[data-slide-id="' + slideId + '"]');
        if (!slideEl || !oldThumb) return;
        var index = Array.prototype.indexOf.call(self.container.children, oldThumb);
        var wasActive = oldThumb.classList.contains('active');
        var newThumb = self.buildThumb(slideEl, index);
        if (wasActive) newThumb.classList.add('active');
        self.container.replaceChild(newThumb, oldThumb);
    }, 400);
};

ThumbnailManager.prototype.updateActive = function (index) {
    var thumbs = Array.prototype.slice.call(this.container.querySelectorAll('.filmstrip-thumb'));
    thumbs.forEach(function (t, i) {
        t.classList.toggle('active', i === index);
    });
};

ThumbnailManager.prototype.show = function () {
    this.renderAll();
};

ThumbnailManager.prototype.hide = function () {
    // Visibility is handled declaratively by the body.mode-present CSS rule;
    // the container/instance is kept alive so re-entering edit mode is cheap.
};
`;

// Linear undo/redo for the whole in-deck edit surface (text edits, widget field
// edits, widget add/delete, slide add/delete). Continuous edits (typing, dragging
// a slider, dragging/resizing a widget) collapse into one undo step via a
// begin/commit pattern; discrete edits (checkbox/select/color/add/delete) push
// one step immediately. Structural entries hold live DOM node / widget object
// references (not clones) and are only ever replayed in strict LIFO pop order —
// see the undo()/redo() methods below; a "jump to arbitrary history index"
// feature would need to revisit that assumption. Written without template
// literals/backticks throughout since this whole file is itself one giant
// template literal.
const HISTORY_SYSTEM_JS = `
function HistoryManager() {
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
    this.maxSize = 50;
    this.undoBtn = null;
    this.redoBtn = null;
    this.wireToolbar();
}

HistoryManager.prototype.begin = function (partial) {
    this.pending = partial;
};

HistoryManager.prototype.commit = function (extra) {
    if (!this.pending) return;
    var entry = Object.assign({}, this.pending, extra);
    this.pending = null;
    if (JSON.stringify(entry.before) === JSON.stringify(entry.after)) return;
    this.push(entry);
};

HistoryManager.prototype.push = function (entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack.length = 0;
    this.updateButtons();
};

HistoryManager.prototype.undo = function () {
    if (!this.undoStack.length) return;
    var entry = this.undoStack.pop();
    this.apply(entry, true);
    this.redoStack.push(entry);
    this.updateButtons();
};

HistoryManager.prototype.redo = function () {
    if (!this.redoStack.length) return;
    var entry = this.redoStack.pop();
    this.apply(entry, false);
    this.undoStack.push(entry);
    this.updateButtons();
};

HistoryManager.prototype.apply = function (entry, inverse) {
    if (entry.kind === 'widget-field') {
        window.widgetManager.restoreFieldSnapshot(entry.widgetId, inverse ? entry.before : entry.after);
    } else if (entry.kind === 'text-field') {
        window.editorController.restoreTextSnapshot(entry.slideId, entry.field, inverse ? entry.before : entry.after);
    } else if (entry.kind === 'widget-structural') {
        var doAdd = inverse ? entry.op === 'delete' : entry.op === 'add';
        if (doAdd) {
            window.widgetManager.attachWidget(entry);
            window.widgetManager.selectWidget(entry.widget.id);
        } else {
            window.widgetManager.detachWidget(entry);
        }
    } else if (entry.kind === 'widget-layer') {
        window.widgetManager.moveWidgetToIndex(entry.widgetId, inverse ? entry.fromIndex : entry.toIndex);
        window.widgetManager.selectWidget(entry.widgetId);
    } else if (entry.kind === 'slide-structural') {
        var doAttach = inverse ? entry.op === 'delete' : entry.op === 'add';
        if (doAttach) {
            window.slideManager.attachNode(entry.node, entry.nextSibling);
            window.slideManager.afterStructuralChange(entry.node.getAttribute('data-slide-id'));
        } else {
            var idxBefore = window.slideManager.order.indexOf(entry.node.getAttribute('data-slide-id'));
            window.slideManager.detachNode(entry.node);
            var order = window.slideManager.order;
            var newIdx = Math.min(Math.max(idxBefore, 0), order.length - 1);
            window.slideManager.afterStructuralChange(order[newIdx]);
        }
    } else if (entry.kind === 'slide-reorder') {
        var reorderEl = document.querySelector('#deckStage .slide[data-slide-id="' + entry.id + '"]');
        if (reorderEl) {
            window.slideManager.moveNodeToIndex(reorderEl, inverse ? entry.fromIndex : entry.toIndex);
            window.slideManager.afterStructuralChange(entry.id);
        }
    } else if (entry.kind === 'text-style') {
        window.editorController.restoreTextStyleSnapshot(entry.slideId, entry.field, inverse ? entry.before : entry.after);
    } else if (entry.kind === 'text-structural') {
        var doAttachText = inverse ? entry.op === 'delete' : entry.op === 'add';
        if (doAttachText) {
            window.editorController.attachTextElement(entry);
        } else {
            window.editorController.detachTextElement(entry);
        }
    }
};

HistoryManager.prototype.wireToolbar = function () {
    var self = this;
    this.undoBtn = document.getElementById('undoToggle');
    this.redoBtn = document.getElementById('redoToggle');
    this.undoBtn.addEventListener('click', function () { self.undo(); });
    this.redoBtn.addEventListener('click', function () { self.redo(); });
    document.addEventListener('keydown', function (e) {
        if (!window.editorController || !window.editorController.isActive) return;
        var tag = e.target.tagName;
        if (e.target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        var mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        var key = e.key.toLowerCase();
        if (key === 'z' && e.shiftKey) {
            e.preventDefault();
            self.redo();
        } else if (key === 'z') {
            e.preventDefault();
            self.undo();
        } else if (key === 'y') {
            e.preventDefault();
            self.redo();
        }
    });
    this.updateButtons();
};

HistoryManager.prototype.setEditMode = function (active) {
    if (this.undoBtn) this.undoBtn.classList.toggle('show', active);
    if (this.redoBtn) this.redoBtn.classList.toggle('show', active);
};

HistoryManager.prototype.updateButtons = function () {
    if (this.undoBtn) this.undoBtn.disabled = this.undoStack.length === 0;
    if (this.redoBtn) this.redoBtn.disabled = this.redoStack.length === 0;
    postEditorState();
};
`;

// Runtime for the in-deck widget system: an Add (+) button beneath the pencil/edit
// toggle that opens a popover of widget types (Video, Photo, Shape, Text). Each
// added widget is a draggable/resizable canvas element with a type-specific
// configuration panel. Written without template literals/backticks throughout
// since this whole file is itself one giant template literal.
const WIDGET_SYSTEM_JS = `
var WIDGET_ICONS = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"></rect><polygon points="22 8 16 12 22 16 22 8"></polygon></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    shape: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><circle cx="17.5" cy="6.5" r="3.5"></circle><path d="M3 21l4.5-8 4.5 8z"></path></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>'
};

// Shape-type picker: rendered as an icon grid (see openConfigPanel/buildShapeFields)
// instead of a <select>, so choosing a shape is a visual pick rather than reading
// label text. Each icon is a rough glyph for the shape, not a literal preview of
// its clip-path - kept as plain stroke outlines to match WIDGET_ICONS' style.
var SHAPE_ICON_SVG = {
    rectangle: '<rect x="3" y="5" width="18" height="14" rx="1"></rect>',
    snip: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path>',
    circle: '<ellipse cx="12" cy="12" rx="9" ry="6"></ellipse>',
    triangle: '<polygon points="12 3 21 20 3 20"></polygon>',
    rightTriangle: '<polygon points="4 4 4 20 20 20"></polygon>',
    diamond: '<polygon points="12 2 22 12 12 22 2 12"></polygon>',
    pentagon: '<polygon points="12 2 22 9.5 18 21 6 21 2 9.5"></polygon>',
    polygon: '<polygon points="7 2 17 2 22 12 17 22 7 22 2 12"></polygon>',
    star: '<polygon points="12 2 15 9 22 9.5 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.5 9 9"></polygon>',
    arrow: '<path d="M2 10h11V6l9 6-9 6v-4H2z"></path>',
    chevron: '<polygon points="0 0 18 0 24 12 18 24 0 24 6 12"></polygon>',
    parallelogram: '<polygon points="6 0 24 0 18 24 0 24"></polygon>',
    trapezoid: '<polygon points="5 0 19 0 24 24 0 24"></polygon>',
    line: '<line x1="4" y1="20" x2="20" y2="4"></line>'
};

var SHAPE_TYPES = [
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'snip', label: 'Snipped Rectangle' },
    { value: 'circle', label: 'Oval' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'rightTriangle', label: 'Right Triangle' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'pentagon', label: 'Pentagon' },
    { value: 'polygon', label: 'Hexagon' },
    { value: 'star', label: 'Star' },
    { value: 'arrow', label: 'Arrow' },
    { value: 'chevron', label: 'Chevron' },
    { value: 'parallelogram', label: 'Parallelogram' },
    { value: 'trapezoid', label: 'Trapezoid' },
    { value: 'line', label: 'Line' }
].map(function (t) {
    return {
        value: t.value,
        label: t.label,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + SHAPE_ICON_SVG[t.value] + '</svg>'
    };
});

/* ==== Bare control factories ====
   Each factory builds ONE input/control element and wires its raw input/change
   DOM listener to call onChange(value) - nothing about labels, history
   (begin/commit/push), or save(). WidgetManager's field-builder methods below
   (textField/numberField/...) are thin wrappers around these: they add the
   fieldGroup/label, and call the existing history+save exactly as before. The
   SAME factories are reused (unwrapped) by FloatingToolbar so the sidebar and
   the floating toolbar share one literal code path instead of two toolbars
   that merely look alike. */
function makeTextInput(value, onChange, multiline) {
    var input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value || '';
    input.addEventListener('input', function () { onChange(input.value); });
    return input;
}

function makeNumberInput(value, onChange, opts) {
    opts = opts || {};
    var input = document.createElement('input');
    input.type = 'number';
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    input.value = value;
    input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        if (isNaN(v)) return;
        onChange(v);
    });
    return input;
}

function makeSelect(value, options, onChange) {
    var select = document.createElement('select');
    options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === value) o.selected = true;
        select.appendChild(o);
    });
    select.addEventListener('change', function () { onChange(select.value); });
    return select;
}

function makeColorInput(value, onChange) {
    var input = document.createElement('input');
    input.type = 'color';
    input.value = value || '#000000';
    input.addEventListener('input', function () { onChange(input.value); });
    return input;
}

function makeRangeInput(value, min, max, step, onChange, onLiveValue) {
    var input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    input.value = value;
    input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        if (onLiveValue) onLiveValue(v);
        onChange(v);
    });
    return input;
}

function makeCheckboxInput(checked, onChange) {
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.addEventListener('change', function () { onChange(input.checked); });
    return input;
}

function makeButtonGroup(value, options, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'widget-toggle-group';
    var buttons = [];
    options.forEach(function (opt) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'widget-toggle-btn' + (opt.value === value ? ' active' : '');
        b.textContent = opt.label;
        b.addEventListener('click', function () {
            buttons.forEach(function (bb) { bb.classList.remove('active'); });
            b.classList.add('active');
            onChange(opt.value);
        });
        buttons.push(b);
        wrap.appendChild(b);
    });
    return wrap;
}

// Icon-grid variant of makeButtonGroup, for pickers (shape type) where a
// glyph reads faster than label text - same active/onChange contract, just
// options carry an icon (svg markup string) instead of relying on textContent.
function makeIconButtonGroup(value, options, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'widget-icon-grid';
    var buttons = [];
    options.forEach(function (opt) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'widget-icon-btn' + (opt.value === value ? ' active' : '');
        b.title = opt.label;
        b.setAttribute('aria-label', opt.label);
        b.innerHTML = opt.icon;
        b.addEventListener('click', function () {
            buttons.forEach(function (bb) { bb.classList.remove('active'); });
            b.classList.add('active');
            onChange(opt.value);
        });
        buttons.push(b);
        wrap.appendChild(b);
    });
    return wrap;
}

// A <video src> element can only play a direct media file - it can't play a
// YouTube/Vimeo *page* link (their watch pages require the site's own player
// and don't expose a raw, hotlinkable file for <video> to fetch). Detecting
// those page URLs and switching to the provider's <iframe> embed instead is
// what makes pasting an ordinary "copied from the address bar" video link
// actually work, rather than silently producing a blank/broken player.
//
// Deliberately no regex literals here: this whole block is itself text
// inside the WIDGET_SYSTEM_JS template literal (see the note at the top of
// this file about avoiding backticks), and a backslash escape like \. or \/
// only survives being embedded twice - once when this .ts file's own
// template literal is evaluated, once when the resulting <script> text is
// parsed by the browser - if it's doubled up exactly right. Getting that
// wrong silently truncates the regex and throws a SyntaxError that kills the
// entire deck script, not just this widget - plain indexOf/slice sidesteps
// the whole hazard.
function findMarker(haystack, needle) {
    var idx = haystack.indexOf(needle);
    return idx === -1 ? -1 : idx + needle.length;
}

function extractToken(src, from) {
    var stops = '&#?/ ';
    var end = src.length;
    for (var i = from; i < src.length; i++) {
        if (stops.indexOf(src.charAt(i)) !== -1) { end = i; break; }
    }
    return src.slice(from, end);
}

function isDigitsOnly(s) {
    if (!s) return false;
    for (var i = 0; i < s.length; i++) {
        var code = s.charCodeAt(i);
        if (code < 48 || code > 57) return false;
    }
    return true;
}

function getVideoEmbedInfo(src) {
    if (!src) return null;
    var lower = src.toLowerCase();
    if (lower.indexOf('youtube.com') !== -1 || lower.indexOf('youtube-nocookie.com') !== -1 || lower.indexOf('youtu.be') !== -1) {
        var from = -1;
        if (lower.indexOf('watch') !== -1 && findMarker(lower, 'v=') !== -1) {
            from = findMarker(lower, 'v=');
        } else if (findMarker(lower, 'youtu.be/') !== -1) {
            from = findMarker(lower, 'youtu.be/');
        } else if (findMarker(lower, '/shorts/') !== -1) {
            from = findMarker(lower, '/shorts/');
        } else if (findMarker(lower, '/embed/') !== -1) {
            from = findMarker(lower, '/embed/');
        }
        if (from === -1) return null;
        var id = extractToken(src, from);
        return id ? { provider: 'youtube', id: id } : null;
    }
    if (lower.indexOf('vimeo.com') !== -1) {
        var marker = findMarker(lower, '/video/') !== -1 ? '/video/' : 'vimeo.com/';
        var vFrom = findMarker(lower, marker);
        if (vFrom === -1) return null;
        var vId = extractToken(src, vFrom);
        return isDigitsOnly(vId) ? { provider: 'vimeo', id: vId } : null;
    }
    return null;
}

function buildVideoEmbedSrc(info, widget) {
    if (info.provider === 'youtube') {
        var params = ['rel=0'];
        if (widget.autoplay) { params.push('autoplay=1'); params.push('mute=1'); }
        if (widget.loop) { params.push('loop=1'); params.push('playlist=' + info.id); }
        if (widget.controls === false) params.push('controls=0');
        return 'https://www.youtube.com/embed/' + info.id + '?' + params.join('&');
    }
    var vparams = [];
    if (widget.autoplay) { vparams.push('autoplay=1'); vparams.push('muted=1'); }
    if (widget.loop) vparams.push('loop=1');
    if (widget.controls === false) vparams.push('controls=0');
    return 'https://player.vimeo.com/video/' + info.id + (vparams.length ? '?' + vparams.join('&') : '');
}

function openWidgetLightbox(src) {
    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '20000';
    overlay.style.cursor = 'zoom-out';
    var img = document.createElement('img');
    img.src = src;
    img.style.maxWidth = '90%';
    img.style.maxHeight = '90%';
    img.style.borderRadius = '8px';
    img.style.boxShadow = '0 20px 60px rgba(0,0,0,0.5)';
    overlay.appendChild(img);
    overlay.addEventListener('click', function () {
        document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
}

function widgetDefaults(type) {
    var common = {
        x: 660, y: 390, width: 480, height: 240, rotation: 0, opacity: 100,
        borderWidth: 0, borderColor: '#000000', borderStyle: 'solid', cornerRadius: 0,
        shadowEnabled: false, shadowColor: '#000000', shadowBlur: 16, shadowOffsetX: 0, shadowOffsetY: 6
    };
    if (type === 'text') {
        common.width = 480; common.height = 140;
        return Object.assign(common, {
            text: 'New text', fontFamily: 'Inter, sans-serif', fontSize: 32, fontWeight: '600',
            color: '#111111', align: 'left', lineHeight: 1.3, letterSpacing: 0,
            bold: false, italic: false, underline: false, strikethrough: false, uppercase: false,
            bgTransparent: true, bgColor: '#ffffff', padding: 8, maxLines: 0
        });
    }
    if (type === 'photo') {
        return Object.assign(common, {
            src: '', fit: 'cover', aspectRatio: 'free',
            brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0,
            linkAction: 'none', linkUrl: '', lazy: true
        });
    }
    if (type === 'video') {
        common.height = 270;
        return Object.assign(common, {
            src: '', poster: '', fit: 'cover', aspectRatio: 'free',
            autoplay: false, muted: true, loop: false, speed: '1', controls: true,
            fullscreenAllowed: true, preload: 'metadata', linkAction: 'none', linkUrl: ''
        });
    }
    common.width = 240; common.height = 240;
    return Object.assign(common, {
        shapeType: 'rectangle', fillType: 'solid', fillColor: '#6366f1',
        gradientFrom: '#6366f1', gradientTo: '#8b5cf6'
    });
}

function WidgetManager() {
    this.widgetsBySlide = {};
    this.selectedId = null;
    this.nextId = 1;
    this.clipboardWidget = null;
    this.storageKey = 'sermon_widgets_' + window.location.pathname;
    this.addToggle = document.getElementById('addWidgetToggle');
    this.popover = document.getElementById('widgetPopover');
    this.panel = document.getElementById('widgetConfigPanel');
    this.init();
}

WidgetManager.prototype.init = function () {
    var self = this;
    var types = ['video', 'photo', 'shape', 'text'];
    var labels = { video: 'Video', photo: 'Photo', shape: 'Shape', text: 'Text' };
    types.forEach(function (type) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'widget-popover-item';
        btn.innerHTML = WIDGET_ICONS[type] + '<span>' + labels[type] + '</span>';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            self.addWidget(type);
        });
        self.popover.appendChild(btn);
    });

    this.addToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        self.togglePopover();
    });

    document.addEventListener('click', function (e) {
        var onAddToggle = e.target === self.addToggle || (e.target.closest && e.target.closest('#addWidgetToggle'));
        if (self.popover.classList.contains('open') && !self.popover.contains(e.target) && !onAddToggle) {
            self.closePopover();
        }
        if (self.selectedId && self.panel && !self.panel.contains(e.target)) {
            var selEl = document.getElementById('widget-' + self.selectedId);
            // Clicks on the slide-structure/history toolbar (Add Slide, Delete Slide,
            // Undo, Redo) shouldn't deselect the current widget — those buttons often
            // need the config panel to stay open/refreshed (e.g. undo restoring a
            // widget's field values back into view).
            var onToolbar = e.target.closest && e.target.closest('.toolbar-btn, .add-widget-toggle');
            if (selEl && !selEl.contains(e.target) && !onToolbar) {
                self.deselectAll();
            }
        }
        if (window.contextMenu && !window.contextMenu.contains(e.target)) {
            window.contextMenu.hide();
        }
    });

    this.load();
    this.wireKeyboardShortcuts();
};

WidgetManager.prototype.togglePopover = function () {
    if (this.popover.classList.contains('open')) {
        this.closePopover();
    } else {
        this.popover.classList.add('open');
        this.addToggle.classList.add('active');
        postEditorState();
    }
};

WidgetManager.prototype.closePopover = function () {
    this.popover.classList.remove('open');
    this.addToggle.classList.remove('active');
    postEditorState();
};

WidgetManager.prototype.setEditMode = function (active) {
    if (!active) {
        this.closePopover();
        this.deselectAll();
        this.addToggle.classList.remove('show');
    } else {
        this.addToggle.classList.add('show');
    }
};

WidgetManager.prototype.getCurrentSlide = function () {
    var id = window.slideManager.getCurrentSlideId();
    var el = id ? document.querySelector('#deckStage .slide[data-slide-id="' + id + '"]') : null;
    return { id: id, el: el };
};

WidgetManager.prototype.getStageScale = function () {
    var stage = document.getElementById('deckStage');
    var rect = stage.getBoundingClientRect();
    return rect.width / 1920;
};

WidgetManager.prototype.ratioValue = function (key) {
    if (key === '1:1') return 1;
    if (key === '4:3') return 4 / 3;
    if (key === '16:9') return 16 / 9;
    return 1;
};

WidgetManager.prototype.addWidget = function (type) {
    var slide = this.getCurrentSlide();
    if (!slide.el) return;
    var widget = widgetDefaults(type);
    widget.id = 'w' + (this.nextId++);
    widget.type = type;
    var list = this.widgetsBySlide[slide.id] || (this.widgetsBySlide[slide.id] = []);
    var offset = (list.length % 8) * 44;
    widget.x = widget.x - 120 + offset;
    widget.y = widget.y - 60 + offset;
    list.push(widget);
    this.renderWidget(widget, slide.el);
    this.selectWidget(widget.id);
    this.closePopover();
    window.historyManager.push({ kind: 'widget-structural', op: 'add', widget: widget, slideId: slide.id, listPosition: list.length - 1, nextSibling: null });
    this.save();
};

// Used by InlineEditor.duplicateTextAsWidget to turn a slide's title/body text
// into an independent text widget - same add-widget flow as addWidget() above,
// but seeded with the caller's exact fields (text/position/typography) instead
// of widgetDefaults()'s placeholder text and centered position.
WidgetManager.prototype.addTextWidgetFrom = function (slideId, fields) {
    var slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + slideId + '"]');
    if (!slideEl) return null;
    var widget = widgetDefaults('text');
    Object.assign(widget, fields);
    widget.id = 'w' + (this.nextId++);
    widget.type = 'text';
    var list = this.widgetsBySlide[slideId] || (this.widgetsBySlide[slideId] = []);
    list.push(widget);
    this.renderWidget(widget, slideEl);
    this.selectWidget(widget.id);
    this.closePopover();
    window.historyManager.push({ kind: 'widget-structural', op: 'add', widget: widget, slideId: slideId, listPosition: list.length - 1, nextSibling: null });
    this.save();
    return widget;
};

// Shared by duplicateWidget, pasteWidget, and SlideManager.duplicateSlide (via
// duplicateWidgetsForSlide): clones a widget's data (snapshotWidget already
// strips the DOM-only 'el' field, and every remaining field is a flat
// primitive per widgetDefaults(), so a shallow copy is exact) into
// targetSlideId, offset by (dx, dy) and clamped into the slide bounds the
// same way a drag gesture is. opts.select/opts.pushHistory default to true;
// duplicateWidgetsForSlide passes both false so an N-widget slide duplication
// undoes/redoes as a single slide-structural entry, not N+1 separate ones.
WidgetManager.prototype._cloneWidgetInto = function (widget, targetSlideId, dx, dy, opts) {
    var slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + targetSlideId + '"]');
    if (!slideEl) return null;
    opts = opts || {};
    var clone = this.snapshotWidget(widget);
    clone.id = 'w' + (this.nextId++);
    clone.x = Math.max(0, Math.min(1920 - clone.width, clone.x + dx));
    clone.y = Math.max(0, Math.min(1080 - clone.height, clone.y + dy));
    var list = this.widgetsBySlide[targetSlideId] || (this.widgetsBySlide[targetSlideId] = []);
    list.push(clone);
    this.renderWidget(clone, slideEl);
    if (opts.select !== false) this.selectWidget(clone.id);
    if (opts.pushHistory !== false) {
        window.historyManager.push({ kind: 'widget-structural', op: 'add', widget: clone, slideId: targetSlideId, listPosition: list.length - 1, nextSibling: null });
    }
    this.save();
    return clone;
};

WidgetManager.prototype.duplicateWidget = function (id) {
    var widget = this.findWidget(id);
    var slideId = this.findWidgetSlideId(id);
    if (!widget || slideId === null) return;
    this._cloneWidgetInto(widget, slideId, 24, 24);
};

WidgetManager.prototype.copyWidget = function (id) {
    var widget = this.findWidget(id);
    if (!widget) return;
    // In-memory clipboard, not navigator.clipboard: everything lives in this
    // one iframe's JS heap already, so there's no OS-clipboard permission
    // prompt or serialization to deal with. Lost on iframe reload, which is
    // an acceptable, easily-understood limitation.
    this.clipboardWidget = this.snapshotWidget(widget);
};

WidgetManager.prototype.pasteWidget = function (targetSlideId) {
    if (!this.clipboardWidget) return;
    targetSlideId = targetSlideId || this.getCurrentSlide().id;
    if (!targetSlideId) return;
    this._cloneWidgetInto(this.clipboardWidget, targetSlideId, 24, 24);
};

// Used by SlideManager.duplicateSlide to repopulate a cloned slide's widgets
// (the DOM clone strips .slide-widget children since cloneNode never carries
// event listeners - see duplicateSlide for why). dx/dy are 0 since the widgets
// should land in the exact same spot on the new slide, not offset.
WidgetManager.prototype.duplicateWidgetsForSlide = function (sourceSlideId, targetSlideId) {
    var list = this.widgetsBySlide[sourceSlideId] || [];
    var self = this;
    list.slice().forEach(function (widget) {
        self._cloneWidgetInto(widget, targetSlideId, 0, 0, { select: false, pushHistory: false });
    });
};

WidgetManager.prototype.widgetIndex = function (id) {
    var slideId = this.findWidgetSlideId(id);
    if (slideId === null) return -1;
    var list = this.widgetsBySlide[slideId];
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return i;
    }
    return -1;
};

// Re-appends every widget in a slide's array, in array order, so DOM paint
// order matches list order. There's no explicit z-index on .slide-widget
// today - stacking is pure DOM order - so this is the entire layering
// mechanism, and a full per-slide resync is simplest/safest given slides
// typically hold only a handful of widgets.
WidgetManager.prototype.reorderDom = function (slideId) {
    var slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + slideId + '"]');
    var list = this.widgetsBySlide[slideId];
    if (!slideEl || !list) return;
    list.forEach(function (widget) {
        if (widget.el) slideEl.appendChild(widget.el);
    });
};

// Pure data+DOM move, no history push - mirrors SlideManager.moveNodeToIndex,
// which is why HistoryManager's 'widget-layer' undo/redo (see HISTORY_SYSTEM_JS)
// can call this directly for both directions.
WidgetManager.prototype.moveWidgetToIndex = function (id, targetIndex) {
    var slideId = this.findWidgetSlideId(id);
    if (slideId === null) return;
    var list = this.widgetsBySlide[slideId];
    var idx = this.widgetIndex(id);
    if (idx === -1) return;
    var widget = list[idx];
    list.splice(idx, 1);
    targetIndex = Math.max(0, Math.min(targetIndex, list.length));
    list.splice(targetIndex, 0, widget);
    this.reorderDom(slideId);
    this.save();
};

WidgetManager.prototype.bringToFront = function (id) {
    var slideId = this.findWidgetSlideId(id);
    if (slideId === null) return;
    var fromIndex = this.widgetIndex(id);
    var toIndex = this.widgetsBySlide[slideId].length - 1;
    if (fromIndex === -1 || fromIndex === toIndex) return;
    this.moveWidgetToIndex(id, toIndex);
    window.historyManager.push({ kind: 'widget-layer', widgetId: id, slideId: slideId, fromIndex: fromIndex, toIndex: toIndex });
};

WidgetManager.prototype.sendToBack = function (id) {
    var slideId = this.findWidgetSlideId(id);
    if (slideId === null) return;
    var fromIndex = this.widgetIndex(id);
    var toIndex = 0;
    if (fromIndex === -1 || fromIndex === toIndex) return;
    this.moveWidgetToIndex(id, toIndex);
    window.historyManager.push({ kind: 'widget-layer', widgetId: id, slideId: slideId, fromIndex: fromIndex, toIndex: toIndex });
};

// Global keyboard shortcuts for the widget actions above (Delete/Backspace,
// Cmd/Ctrl+D/C/V/]/[). Kept as its own listener rather than folded into
// HistoryManager's undo/redo one so widget-action logic stays colocated with
// WidgetManager; guarded identically (isContentEditable/INPUT/TEXTAREA/SELECT)
// so it never hijacks typing inside a text field or form control.
WidgetManager.prototype.wireKeyboardShortcuts = function () {
    var self = this;
    document.addEventListener('keydown', function (e) {
        if (!window.editorController || !window.editorController.isActive) return;
        var tag = e.target.tagName;
        if (e.target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if ((e.key === 'Delete' || e.key === 'Backspace') && self.selectedId) {
            e.preventDefault();
            self.deleteWidget(self.selectedId);
            return;
        }

        var mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        var key = e.key.toLowerCase();
        if (key === 'd' && self.selectedId) {
            e.preventDefault();
            self.duplicateWidget(self.selectedId);
        } else if (key === 'c' && self.selectedId && window.getSelection().toString() === '') {
            // Only hijack Cmd/Ctrl+C when there's no active text selection to
            // copy natively - otherwise this would steal a normal browser copy
            // of selected widget text.
            e.preventDefault();
            self.copyWidget(self.selectedId);
        } else if (key === 'v' && self.clipboardWidget) {
            e.preventDefault();
            self.pasteWidget();
        } else if (key === ']' && self.selectedId) {
            e.preventDefault();
            self.bringToFront(self.selectedId);
        } else if (key === '[' && self.selectedId) {
            e.preventDefault();
            self.sendToBack(self.selectedId);
        }
    });
};

WidgetManager.prototype.buildInner = function (widget) {
    var inner;
    if (widget.type === 'text') {
        inner = document.createElement('div');
        inner.className = 'widget-text-el';
        inner.textContent = widget.text;
    } else if (widget.type === 'photo') {
        if (widget.src) {
            inner = document.createElement('img');
            inner.className = 'widget-photo-el';
            inner.src = widget.src;
            inner.alt = '';
            inner.loading = widget.lazy ? 'lazy' : 'eager';
            inner.draggable = false;
            inner.addEventListener('error', function () {
                var wrapper = widget.el;
                if (!wrapper || wrapper.firstChild !== inner) return;
                var msg = document.createElement('div');
                msg.className = 'widget-placeholder';
                msg.textContent = "Couldn't load image — the URL must point directly to an image file, not a webpage";
                wrapper.replaceChild(msg, inner);
            });
            inner.addEventListener('click', function (e) {
                if (window.editorController && window.editorController.isActive) return;
                if (widget.linkAction === 'lightbox') {
                    e.preventDefault();
                    openWidgetLightbox(widget.src);
                } else if (widget.linkAction === 'external' && widget.linkUrl) {
                    e.preventDefault();
                    window.open(widget.linkUrl, '_blank', 'noopener');
                }
            });
        } else {
            inner = document.createElement('div');
            inner.className = 'widget-placeholder';
            inner.textContent = 'Click to set image source';
        }
    } else if (widget.type === 'video') {
        if (widget.src) {
            var embedInfo = getVideoEmbedInfo(widget.src);
            if (embedInfo) {
                // A YouTube/Vimeo *page* link, not a direct media file - <video src>
                // can't play these, so embed the provider's own player instead.
                inner = document.createElement('iframe');
                inner.className = 'widget-video-el widget-video-embed';
                inner.src = buildVideoEmbedSrc(embedInfo, widget);
                inner.setAttribute('frameborder', '0');
                inner.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
                inner.style.border = 'none';
                if (widget.fullscreenAllowed) inner.setAttribute('allowfullscreen', '');
                inner.addEventListener('click', function () {
                    if (window.editorController && window.editorController.isActive) return;
                    if (widget.linkAction === 'external' && widget.linkUrl) {
                        window.open(widget.linkUrl, '_blank', 'noopener');
                    }
                });
            } else {
                inner = document.createElement('video');
                inner.className = 'widget-video-el';
                inner.src = widget.src;
                if (widget.poster) inner.poster = widget.poster;
                inner.loop = !!widget.loop;
                inner.controls = !!widget.controls;
                inner.preload = widget.preload || 'metadata';
                inner.muted = widget.autoplay ? true : !!widget.muted;
                inner.autoplay = !!widget.autoplay;
                inner.playbackRate = parseFloat(widget.speed) || 1;
                if (!widget.fullscreenAllowed) inner.setAttribute('controlsList', 'nofullscreen');
                inner.addEventListener('loadedmetadata', function () {
                    inner.playbackRate = parseFloat(widget.speed) || 1;
                });
                inner.addEventListener('error', function () {
                    var wrapper = widget.el;
                    if (!wrapper || wrapper.firstChild !== inner) return;
                    var msg = document.createElement('div');
                    msg.className = 'widget-placeholder';
                    msg.textContent = "Couldn't load video — use a direct video file URL, or a YouTube/Vimeo link";
                    wrapper.replaceChild(msg, inner);
                });
                inner.addEventListener('click', function () {
                    if (window.editorController && window.editorController.isActive) return;
                    if (widget.linkAction === 'fullscreen') {
                        if (inner.requestFullscreen) inner.requestFullscreen();
                    } else if (widget.linkAction === 'external' && widget.linkUrl) {
                        window.open(widget.linkUrl, '_blank', 'noopener');
                    }
                });
            }
        } else {
            inner = document.createElement('div');
            inner.className = 'widget-placeholder';
            inner.textContent = 'Click to set video source';
        }
    } else {
        inner = document.createElement('div');
        inner.className = 'widget-shape-el';
    }
    return inner;
};

WidgetManager.prototype.refreshInner = function (widget) {
    var wrapper = widget.el;
    if (!wrapper) return;
    var oldInner = wrapper.firstChild;
    var newInner = this.buildInner(widget);
    wrapper.replaceChild(newInner, oldInner);
    this.applyStyles(widget);
};

WidgetManager.prototype.renderWidget = function (widget, slideEl) {
    var self = this;
    var wrapper = document.createElement('div');
    wrapper.className = 'slide-widget';
    wrapper.id = 'widget-' + widget.id;
    wrapper.dataset.widgetId = widget.id;

    var inner = this.buildInner(widget);
    wrapper.appendChild(inner);

    var delBtn = document.createElement('div');
    delBtn.className = 'widget-delete-btn';
    delBtn.innerHTML = '&#215;';
    delBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.deleteWidget(widget.id);
    });
    wrapper.appendChild(delBtn);

    var handle = document.createElement('div');
    handle.className = 'widget-resize-handle';
    wrapper.appendChild(handle);

    wrapper.addEventListener('click', function (e) {
        if (!window.editorController || !window.editorController.isActive) return;
        e.stopPropagation();
        self.selectWidget(widget.id);
    });

    this.attachDrag(wrapper, widget);
    this.attachResize(handle, wrapper, widget);

    widget.el = wrapper;
    slideEl.appendChild(wrapper);
    this.applyStyles(widget);
};

WidgetManager.prototype.applyStyles = function (widget) {
    var wrapper = widget.el;
    if (!wrapper) return;
    wrapper.style.left = widget.x + 'px';
    wrapper.style.top = widget.y + 'px';
    wrapper.style.width = widget.width + 'px';
    wrapper.style.height = widget.height + 'px';
    wrapper.style.transform = 'rotate(' + widget.rotation + 'deg)';
    wrapper.style.opacity = String(widget.opacity / 100);
    wrapper.style.borderRadius = widget.cornerRadius + 'px';
    wrapper.style.borderWidth = widget.borderWidth + 'px';
    wrapper.style.borderStyle = widget.borderWidth > 0 ? widget.borderStyle : 'none';
    wrapper.style.borderColor = widget.borderColor;
    wrapper.style.boxShadow = widget.shadowEnabled
        ? (widget.shadowOffsetX + 'px ' + widget.shadowOffsetY + 'px ' + widget.shadowBlur + 'px ' + widget.shadowColor)
        : 'none';

    var inner = wrapper.firstChild;
    if (!inner) return;

    if (widget.type !== 'text') {
        inner.style.borderRadius = widget.cornerRadius + 'px';
    }

    if (widget.type === 'text') {
        inner.style.fontFamily = widget.fontFamily;
        inner.style.fontSize = widget.fontSize + 'px';
        inner.style.color = widget.color;
        inner.style.textAlign = widget.align;
        inner.style.lineHeight = String(widget.lineHeight);
        inner.style.letterSpacing = widget.letterSpacing + 'px';
        inner.style.fontStyle = widget.italic ? 'italic' : 'normal';
        inner.style.fontWeight = widget.bold ? '700' : widget.fontWeight;
        var decorations = [];
        if (widget.underline) decorations.push('underline');
        if (widget.strikethrough) decorations.push('line-through');
        inner.style.textDecoration = decorations.length ? decorations.join(' ') : 'none';
        inner.style.textTransform = widget.uppercase ? 'uppercase' : 'none';
        inner.style.background = widget.bgTransparent ? 'transparent' : widget.bgColor;
        inner.style.padding = widget.padding + 'px';
        inner.style.boxSizing = 'border-box';
        if (widget.maxLines && widget.maxLines > 0) {
            inner.style.display = '-webkit-box';
            inner.style.WebkitBoxOrient = 'vertical';
            inner.style.WebkitLineClamp = String(widget.maxLines);
            inner.style.overflow = 'hidden';
        } else {
            inner.style.display = 'block';
            inner.style.WebkitLineClamp = '';
            inner.style.overflow = 'auto';
        }
    } else if (widget.type === 'photo' && inner.tagName === 'IMG') {
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.display = 'block';
        inner.style.objectFit = widget.fit === 'original' ? 'none' : (widget.fit === 'stretch' ? 'fill' : widget.fit);
        var filterParts = [];
        filterParts.push('brightness(' + widget.brightness + '%)');
        filterParts.push('contrast(' + widget.contrast + '%)');
        filterParts.push('saturate(' + widget.saturation + '%)');
        filterParts.push('blur(' + widget.blur + 'px)');
        filterParts.push('grayscale(' + widget.grayscale + '%)');
        inner.style.filter = filterParts.join(' ');
        inner.style.cursor = widget.linkAction !== 'none' ? 'pointer' : '';
    } else if (widget.type === 'video' && (inner.tagName === 'VIDEO' || inner.tagName === 'IFRAME')) {
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.display = 'block';
        if (inner.tagName === 'VIDEO') {
            inner.style.objectFit = widget.fit === 'original' ? 'none' : (widget.fit === 'stretch' ? 'fill' : widget.fit);
        }
    } else if (widget.type === 'shape') {
        var bg;
        if (widget.fillType === 'transparent') {
            bg = 'transparent';
        } else if (widget.fillType === 'gradient') {
            bg = 'linear-gradient(135deg, ' + widget.gradientFrom + ', ' + widget.gradientTo + ')';
        } else {
            bg = widget.fillColor;
        }
        inner.style.background = bg;
        inner.style.width = '100%';
        inner.style.height = '100%';
        if (widget.shapeType === 'circle') {
            inner.style.clipPath = 'none';
            inner.style.borderRadius = '50%';
            wrapper.style.borderRadius = '50%';
        } else if (widget.shapeType === 'triangle') {
            inner.style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'polygon') {
            inner.style.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'rightTriangle') {
            inner.style.clipPath = 'polygon(0% 0%, 0% 100%, 100% 100%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'diamond') {
            inner.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'pentagon') {
            inner.style.clipPath = 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'star') {
            inner.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'arrow') {
            inner.style.clipPath = 'polygon(0% 35%, 60% 35%, 60% 10%, 100% 50%, 60% 90%, 60% 65%, 0% 65%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'chevron') {
            inner.style.clipPath = 'polygon(0% 0%, 75% 0%, 100% 50%, 75% 100%, 0% 100%, 25% 50%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'parallelogram') {
            inner.style.clipPath = 'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'trapezoid') {
            inner.style.clipPath = 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'snip') {
            inner.style.clipPath = 'polygon(0% 0%, 80% 0%, 100% 20%, 100% 100%, 0% 100%)';
            inner.style.borderRadius = '0';
        } else if (widget.shapeType === 'line') {
            inner.style.clipPath = 'none';
            inner.style.borderRadius = '0';
        } else {
            inner.style.clipPath = 'none';
            inner.style.borderRadius = widget.cornerRadius + 'px';
        }
    }
};

WidgetManager.prototype.attachDrag = function (wrapper, widget) {
    var self = this;
    var dragging = false;
    var startX, startY, startWX, startWY;

    wrapper.addEventListener('pointerdown', function (e) {
        if (!window.editorController || !window.editorController.isActive) return;
        if (e.target.closest('.widget-resize-handle') || e.target.closest('.widget-delete-btn')) return;
        if (e.target.isContentEditable) return;
        dragging = true;
        self.selectWidget(widget.id);
        self.beginFieldEdit(widget);
        startX = e.clientX;
        startY = e.clientY;
        startWX = widget.x;
        startWY = widget.y;
        window.smartGuides.cacheTargets(wrapper.closest('.slide'), widget);
        wrapper.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    wrapper.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var scale = self.getStageScale();
        var dx = (e.clientX - startX) / scale;
        var dy = (e.clientY - startY) / scale;
        widget.x = Math.max(0, Math.min(1920 - widget.width, startWX + dx));
        widget.y = Math.max(0, Math.min(1080 - widget.height, startWY + dy));
        var snapped = window.smartGuides.check({ x: widget.x, y: widget.y, width: widget.width, height: widget.height }, scale);
        widget.x = snapped.x;
        widget.y = snapped.y;
        window.smartGuides.showGuides(snapped.guideX, snapped.guideY, wrapper.closest('.slide'));
        wrapper.style.left = widget.x + 'px';
        wrapper.style.top = widget.y + 'px';
    });

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        window.smartGuides.hideGuides();
        self.save();
        self.commitFieldEdit(widget);
        if (self.selectedId === widget.id) self.openConfigPanel(widget);
    }
    wrapper.addEventListener('pointerup', endDrag);
    wrapper.addEventListener('pointercancel', endDrag);
};

WidgetManager.prototype.attachResize = function (handle, wrapper, widget) {
    var self = this;
    var resizing = false;
    var startX, startY, startW, startH;

    handle.addEventListener('pointerdown', function (e) {
        resizing = true;
        self.beginFieldEdit(widget);
        startX = e.clientX;
        startY = e.clientY;
        startW = widget.width;
        startH = widget.height;
        handle.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    handle.addEventListener('pointermove', function (e) {
        if (!resizing) return;
        var scale = self.getStageScale();
        var dx = (e.clientX - startX) / scale;
        var dy = (e.clientY - startY) / scale;
        var newW = Math.max(40, startW + dx);
        var newH;
        if ((widget.type === 'photo' || widget.type === 'video') && widget.aspectRatio && widget.aspectRatio !== 'free') {
            newH = newW / self.ratioValue(widget.aspectRatio);
        } else {
            newH = Math.max(30, startH + dy);
        }
        widget.width = newW;
        widget.height = Math.max(30, newH);
        wrapper.style.width = widget.width + 'px';
        wrapper.style.height = widget.height + 'px';
    });

    function endResize() {
        if (!resizing) return;
        resizing = false;
        self.save();
        self.commitFieldEdit(widget);
        if (self.selectedId === widget.id) self.openConfigPanel(widget);
    }
    handle.addEventListener('pointerup', endResize);
    handle.addEventListener('pointercancel', endResize);
};

WidgetManager.prototype.findWidget = function (id) {
    var keys = Object.keys(this.widgetsBySlide);
    for (var i = 0; i < keys.length; i++) {
        var list = this.widgetsBySlide[keys[i]];
        for (var j = 0; j < list.length; j++) {
            if (list[j].id === id) return list[j];
        }
    }
    return null;
};

WidgetManager.prototype.findWidgetSlideId = function (id) {
    var keys = Object.keys(this.widgetsBySlide);
    for (var i = 0; i < keys.length; i++) {
        var list = this.widgetsBySlide[keys[i]];
        for (var j = 0; j < list.length; j++) {
            if (list[j].id === id) return keys[i];
        }
    }
    return null;
};

WidgetManager.prototype.selectWidget = function (id) {
    this.deselectAllVisual();
    this.selectedId = id;
    var widget = this.findWidget(id);
    if (!widget) return;
    if (widget.el) widget.el.classList.add('selected');
    this.openConfigPanel(widget);
    // Text widgets also get the shared floating toolbar (same code path as the
    // slide title/body text), positioned over the widget's text element.
    if (widget.type === 'text' && window.floatingToolbar && widget.el) {
        var textEl = widget.el.querySelector('.widget-text-el');
        if (textEl) window.floatingToolbar.showFor(textEl, 'widget', widget);
    } else if (window.floatingToolbar) {
        window.floatingToolbar.hide();
    }
};

WidgetManager.prototype.deselectAllVisual = function () {
    Object.keys(this.widgetsBySlide).forEach(function (idx) {
        this.widgetsBySlide[idx].forEach(function (w) {
            if (w.el) w.el.classList.remove('selected');
        });
    }, this);
};

WidgetManager.prototype.deselectAll = function () {
    this.deselectAllVisual();
    this.selectedId = null;
    if (this.panel) {
        this.panel.classList.remove('open');
        this.panel.innerHTML = '';
    }
    if (window.presentationController) window.presentationController.setPanelOpen(false);
    if (window.floatingToolbar) window.floatingToolbar.hide();
};

WidgetManager.prototype.deleteWidget = function (id) {
    var slideId = this.findWidgetSlideId(id);
    if (slideId === null) return;
    var list = this.widgetsBySlide[slideId];
    var pos = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { pos = i; break; } }
    if (pos === -1) return;
    var widget = list[pos];
    var nextSibling = widget.el ? widget.el.nextSibling : null;
    if (widget.el && widget.el.parentNode) widget.el.parentNode.removeChild(widget.el);
    list.splice(pos, 1);
    if (this.selectedId === id) this.deselectAll();
    window.historyManager.push({ kind: 'widget-structural', op: 'delete', widget: widget, slideId: slideId, listPosition: pos, nextSibling: nextSibling });
    this.save();
};

WidgetManager.prototype.attachWidget = function (entry) {
    var arr = this.widgetsBySlide[entry.slideId] || (this.widgetsBySlide[entry.slideId] = []);
    arr.splice(entry.listPosition, 0, entry.widget);
    var slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + entry.slideId + '"]');
    if (!slideEl) return;
    if (entry.nextSibling && entry.nextSibling.parentNode === slideEl) {
        slideEl.insertBefore(entry.widget.el, entry.nextSibling);
    } else {
        slideEl.appendChild(entry.widget.el);
    }
    this.save();
};

WidgetManager.prototype.detachWidget = function (entry) {
    var arr = this.widgetsBySlide[entry.slideId];
    if (arr) {
        var i = arr.indexOf(entry.widget);
        if (i > -1) arr.splice(i, 1);
    }
    if (entry.widget.el && entry.widget.el.parentNode) entry.widget.el.parentNode.removeChild(entry.widget.el);
    if (this.selectedId === entry.widget.id) this.deselectAll();
    this.save();
};

WidgetManager.prototype.snapshotWidget = function (w) {
    var copy = {};
    Object.keys(w).forEach(function (k) {
        if (k !== 'el') copy[k] = w[k];
    });
    return copy;
};

WidgetManager.prototype.save = function () {
    var self = this;
    var serializable = {};
    Object.keys(this.widgetsBySlide).forEach(function (idx) {
        serializable[idx] = self.widgetsBySlide[idx].map(function (w) {
            return self.snapshotWidget(w);
        });
    });
    try {
        localStorage.setItem(this.storageKey, JSON.stringify(serializable));
    } catch (e) {}
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'slide-widgets-changed', widgets: serializable }, '*');
    }
    scheduleSave();
    // Widget edits only ever touch the currently displayed slide, so refresh
    // just that one thumbnail (debounced inside ThumbnailManager.refresh)
    // rather than re-rendering the whole filmstrip on every field tweak.
    if (window.thumbnailManager && window.slideManager) {
        var curId = window.slideManager.getCurrentSlideId();
        if (curId) window.thumbnailManager.refresh(curId);
    }
};

WidgetManager.prototype.load = function () {
    var raw;
    try {
        raw = localStorage.getItem(this.storageKey);
    } catch (e) {
        raw = null;
    }
    if (!raw) return;
    var data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        return;
    }
    var self = this;
    Object.keys(data).forEach(function (idx) {
        var slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + idx + '"]');
        if (!slideEl) return;
        self.widgetsBySlide[idx] = data[idx];
        data[idx].forEach(function (widget) {
            var num = parseInt(widget.id.replace('w', ''), 10);
            if (!isNaN(num) && num >= self.nextId) self.nextId = num + 1;
            // Object URLs (blob:) from a file upload are revoked when the page that
            // created them unloads, so any carried over from a previous session are
            // guaranteed dead — clear them back to the empty/placeholder state
            // instead of rendering a permanently broken video/image.
            if (widget.src && widget.src.indexOf('blob:') === 0) widget.src = '';
            self.renderWidget(widget, slideEl);
        });
    });
};

WidgetManager.prototype.fieldGroup = function (labelText) {
    var group = document.createElement('div');
    group.className = 'widget-field-group';
    if (labelText) {
        var label = document.createElement('label');
        label.textContent = labelText;
        group.appendChild(label);
    }
    return group;
};

WidgetManager.prototype.sectionTitle = function (container, text) {
    var t = document.createElement('div');
    t.className = 'widget-section-title';
    t.textContent = text;
    container.appendChild(t);
};

WidgetManager.prototype.beginFieldEdit = function (widget) {
    if (!widget) return;
    window.historyManager.begin({ kind: 'widget-field', widgetId: widget.id, before: this.snapshotWidget(widget) });
};

WidgetManager.prototype.commitFieldEdit = function (widget) {
    if (!widget) return;
    window.historyManager.commit({ after: this.snapshotWidget(widget) });
};

WidgetManager.prototype.pushFieldEdit = function (widget, before, after) {
    if (!widget) return;
    window.historyManager.push({ kind: 'widget-field', widgetId: widget.id, before: before, after: after });
};

WidgetManager.prototype.restoreFieldSnapshot = function (widgetId, snapshot) {
    var widget = this.findWidget(widgetId);
    if (!widget || !snapshot) return;
    var el = widget.el;
    Object.keys(snapshot).forEach(function (k) { widget[k] = snapshot[k]; });
    widget.el = el;
    this.refreshInner(widget);
    if (this.selectedId === widgetId) this.openConfigPanel(widget);
    this.save();
};

// The methods below are thin wrappers over the bare-control factories above:
// each one builds the fieldGroup/label, delegates the actual input/change
// wiring to its matching factory, and adds the same history (begin/commit or
// snapshot-before/push) + save() calls as before the refactor. Behavior
// (visual result, undo/redo, persistence) is unchanged from pre-refactor.
WidgetManager.prototype.textField = function (container, labelText, value, onChange, multiline, widget) {
    var group = this.fieldGroup(labelText);
    var self = this;
    var input = makeTextInput(value, function (v) {
        onChange(v);
        self.save();
    }, multiline);
    input.addEventListener('focus', function () { self.beginFieldEdit(widget); });
    input.addEventListener('blur', function () { self.commitFieldEdit(widget); });
    group.appendChild(input);
    container.appendChild(group);
    return input;
};

WidgetManager.prototype.numberField = function (container, labelText, value, onChange, opts, widget) {
    var group = this.fieldGroup(labelText);
    var self = this;
    var input = makeNumberInput(value, function (v) {
        onChange(v);
        self.save();
    }, opts);
    input.addEventListener('focus', function () { self.beginFieldEdit(widget); });
    input.addEventListener('blur', function () { self.commitFieldEdit(widget); });
    group.appendChild(input);
    container.appendChild(group);
    return input;
};

WidgetManager.prototype.selectField = function (container, labelText, value, options, onChange, widget) {
    var group = this.fieldGroup(labelText);
    var self = this;
    var select = makeSelect(value, options, function (v) {
        var before = widget ? self.snapshotWidget(widget) : null;
        onChange(v);
        if (widget) self.pushFieldEdit(widget, before, self.snapshotWidget(widget));
        self.save();
    });
    group.appendChild(select);
    container.appendChild(group);
    return select;
};

WidgetManager.prototype.colorField = function (container, labelText, value, onChange, widget) {
    var group = this.fieldGroup(labelText);
    var self = this;
    var input = makeColorInput(value, function (v) {
        onChange(v);
        self.save();
    });
    input.addEventListener('focus', function () { self.beginFieldEdit(widget); });
    input.addEventListener('change', function () { self.commitFieldEdit(widget); });
    input.addEventListener('blur', function () { self.commitFieldEdit(widget); });
    group.appendChild(input);
    container.appendChild(group);
    return input;
};

WidgetManager.prototype.rangeField = function (container, labelText, value, min, max, step, onChange, suffix, widget) {
    var group = this.fieldGroup(labelText);
    var row = document.createElement('div');
    row.className = 'widget-field-row';
    var valSpan = document.createElement('span');
    valSpan.className = 'widget-range-val';
    valSpan.textContent = value + (suffix || '');
    var self = this;
    var input = makeRangeInput(value, min, max, step, function (v) {
        onChange(v);
        self.save();
    }, function (v) { valSpan.textContent = v + (suffix || ''); });
    input.addEventListener('pointerdown', function () { self.beginFieldEdit(widget); });
    input.addEventListener('change', function () { self.commitFieldEdit(widget); });
    input.addEventListener('blur', function () { self.commitFieldEdit(widget); });
    row.appendChild(input);
    row.appendChild(valSpan);
    group.appendChild(row);
    container.appendChild(group);
    return input;
};

WidgetManager.prototype.checkboxField = function (container, labelText, checked, onChange, widget) {
    var row = document.createElement('div');
    row.className = 'widget-checkbox-row';
    var self = this;
    var input = makeCheckboxInput(checked, function (v) {
        var before = widget ? self.snapshotWidget(widget) : null;
        onChange(v);
        if (widget) self.pushFieldEdit(widget, before, self.snapshotWidget(widget));
        self.save();
    });
    var id = 'chk_' + Math.random().toString(36).slice(2);
    input.id = id;
    var label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;
    row.appendChild(input);
    row.appendChild(label);
    container.appendChild(row);
    return input;
};

WidgetManager.prototype.buttonGroupField = function (container, labelText, value, options, onChange, widget) {
    var group = this.fieldGroup(labelText);
    var self = this;
    var wrap = makeButtonGroup(value, options, function (v) {
        var before = widget ? self.snapshotWidget(widget) : null;
        onChange(v);
        if (widget) self.pushFieldEdit(widget, before, self.snapshotWidget(widget));
        self.save();
    });
    group.appendChild(wrap);
    container.appendChild(group);
};

WidgetManager.prototype.iconButtonGroupField = function (container, labelText, value, options, onChange, widget) {
    var group = this.fieldGroup(labelText);
    var self = this;
    var wrap = makeIconButtonGroup(value, options, function (v) {
        var before = widget ? self.snapshotWidget(widget) : null;
        onChange(v);
        if (widget) self.pushFieldEdit(widget, before, self.snapshotWidget(widget));
        self.save();
    });
    group.appendChild(wrap);
    container.appendChild(group);
};

WidgetManager.prototype.fileField = function (container, labelText, onDataUrl, widget, accept) {
    var group = this.fieldGroup(labelText);
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || 'image/*,video/*';
    input.style.display = 'none';
    var btn = document.createElement('label');
    btn.className = 'widget-file-btn';
    btn.textContent = 'Upload file';
    btn.appendChild(input);
    var self = this;
    input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        // Object URLs reference the file/blob directly (no re-encoding, no giant
        // in-memory string) instead of FileReader.readAsDataURL's base64 string,
        // which for anything past a few MB (especially video) blows up memory
        // across JSON.stringify/localStorage/postMessage and can crash the tab.
        // Tradeoff: object URLs don't survive a reload (revoked with the page),
        // so WidgetManager.load() clears any stale blob: src back to the
        // placeholder state on load rather than leaving a dead reference.
        var before = widget ? self.snapshotWidget(widget) : null;
        var url = URL.createObjectURL(file);
        onDataUrl(url);
        if (widget) self.pushFieldEdit(widget, before, self.snapshotWidget(widget));
    });
    group.appendChild(btn);
    container.appendChild(group);
};

WidgetManager.prototype.buildAppearanceFields = function (body, widget) {
    var self = this;
    this.sectionTitle(body, 'Appearance');
    this.rangeField(body, 'Opacity', widget.opacity, 0, 100, 1, function (v) { widget.opacity = v; self.applyStyles(widget); }, '%', widget);
    this.numberField(body, 'Corner radius (px)', widget.cornerRadius, function (v) { widget.cornerRadius = v; self.applyStyles(widget); }, { min: 0 }, widget);

    this.sectionTitle(body, 'Border');
    this.selectField(body, 'Style', widget.borderStyle, [
        { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }
    ], function (v) { widget.borderStyle = v; self.applyStyles(widget); }, widget);
    this.numberField(body, 'Width (px)', widget.borderWidth, function (v) { widget.borderWidth = v; self.applyStyles(widget); }, { min: 0 }, widget);
    this.colorField(body, 'Color', widget.borderColor, function (v) { widget.borderColor = v; self.applyStyles(widget); }, widget);

    this.sectionTitle(body, 'Shadow');
    this.checkboxField(body, 'Enable shadow', widget.shadowEnabled, function (v) { widget.shadowEnabled = v; self.applyStyles(widget); }, widget);
    this.colorField(body, 'Shadow color', widget.shadowColor, function (v) { widget.shadowColor = v; self.applyStyles(widget); }, widget);
    this.rangeField(body, 'Blur', widget.shadowBlur, 0, 60, 1, function (v) { widget.shadowBlur = v; self.applyStyles(widget); }, 'px', widget);
    this.numberField(body, 'Offset X', widget.shadowOffsetX, function (v) { widget.shadowOffsetX = v; self.applyStyles(widget); }, {}, widget);
    this.numberField(body, 'Offset Y', widget.shadowOffsetY, function (v) { widget.shadowOffsetY = v; self.applyStyles(widget); }, {}, widget);
};

WidgetManager.prototype.buildTextFields = function (body, widget) {
    var self = this;
    this.sectionTitle(body, 'Content');
    this.textField(body, 'Text', widget.text, function (v) {
        widget.text = v;
        if (widget.el) {
            var t = widget.el.querySelector('.widget-text-el');
            if (t) t.textContent = v;
        }
    }, true, widget);

    this.sectionTitle(body, 'Typography');
    this.selectField(body, 'Font family', widget.fontFamily, [
        { value: 'Inter, sans-serif', label: 'Inter' },
        { value: 'Georgia, serif', label: 'Georgia' },
        { value: '"Playfair Display", serif', label: 'Playfair Display' },
        { value: 'Arial, sans-serif', label: 'Arial' },
        { value: '"Courier New", monospace', label: 'Courier New' },
        { value: 'system-ui, sans-serif', label: 'System UI' }
    ], function (v) { widget.fontFamily = v; self.applyStyles(widget); }, widget);
    this.numberField(body, 'Font size (px)', widget.fontSize, function (v) { widget.fontSize = v; self.applyStyles(widget); }, { min: 8, max: 300 }, widget);
    this.selectField(body, 'Font weight', widget.fontWeight, [
        { value: '300', label: 'Light' }, { value: '400', label: 'Regular' },
        { value: '500', label: 'Medium' }, { value: '600', label: 'Semibold' },
        { value: '700', label: 'Bold' }, { value: '800', label: 'Extra bold' }
    ], function (v) { widget.fontWeight = v; self.applyStyles(widget); }, widget);
    this.colorField(body, 'Color', widget.color, function (v) { widget.color = v; self.applyStyles(widget); }, widget);
    this.buttonGroupField(body, 'Alignment', widget.align, [
        { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' }, { value: 'justify', label: 'Justify' }
    ], function (v) { widget.align = v; self.applyStyles(widget); }, widget);
    this.numberField(body, 'Line height', widget.lineHeight, function (v) { widget.lineHeight = v; self.applyStyles(widget); }, { step: 0.1, min: 0.5, max: 4 }, widget);
    this.numberField(body, 'Letter spacing (px)', widget.letterSpacing, function (v) { widget.letterSpacing = v; self.applyStyles(widget); }, { step: 0.5 }, widget);

    this.checkboxField(body, 'Bold', widget.bold, function (v) { widget.bold = v; self.applyStyles(widget); }, widget);
    this.checkboxField(body, 'Italic', widget.italic, function (v) { widget.italic = v; self.applyStyles(widget); }, widget);
    this.checkboxField(body, 'Underline', widget.underline, function (v) { widget.underline = v; self.applyStyles(widget); }, widget);
    this.checkboxField(body, 'Strikethrough', widget.strikethrough, function (v) { widget.strikethrough = v; self.applyStyles(widget); }, widget);
    this.checkboxField(body, 'Uppercase', widget.uppercase, function (v) { widget.uppercase = v; self.applyStyles(widget); }, widget);

    this.sectionTitle(body, 'Box');
    this.checkboxField(body, 'Transparent background', widget.bgTransparent, function (v) { widget.bgTransparent = v; self.applyStyles(widget); }, widget);
    this.colorField(body, 'Background color', widget.bgColor, function (v) { widget.bgColor = v; self.applyStyles(widget); }, widget);
    this.numberField(body, 'Padding (px)', widget.padding, function (v) { widget.padding = v; self.applyStyles(widget); }, { min: 0 }, widget);
    this.numberField(body, 'Max lines (0 = unlimited)', widget.maxLines, function (v) { widget.maxLines = v; self.applyStyles(widget); }, { min: 0 }, widget);
};

WidgetManager.prototype.buildPhotoFields = function (body, widget) {
    var self = this;
    this.sectionTitle(body, 'Source');
    this.textField(body, 'Image URL', widget.src, function (v) {
        widget.src = v;
        self.refreshInner(widget);
    }, false, widget);
    this.fileField(body, 'Or upload', function (dataUrl) {
        widget.src = dataUrl;
        self.refreshInner(widget);
        self.save();
        self.openConfigPanel(widget);
    }, widget, 'image/*');

    this.sectionTitle(body, 'Fit & Ratio');
    this.selectField(body, 'Fit', widget.fit, [
        { value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' },
        { value: 'fill', label: 'Fill' }, { value: 'stretch', label: 'Stretch' },
        { value: 'original', label: 'Original size' }
    ], function (v) { widget.fit = v; self.applyStyles(widget); }, widget);
    this.buttonGroupField(body, 'Aspect ratio', widget.aspectRatio, [
        { value: 'free', label: 'Free' }, { value: '1:1', label: '1:1' },
        { value: '4:3', label: '4:3' }, { value: '16:9', label: '16:9' }
    ], function (v) {
        widget.aspectRatio = v;
        if (v !== 'free') {
            widget.height = widget.width / self.ratioValue(v);
            self.applyStyles(widget);
        }
    }, widget);

    this.sectionTitle(body, 'Filters');
    this.rangeField(body, 'Brightness', widget.brightness, 0, 200, 1, function (v) { widget.brightness = v; self.applyStyles(widget); }, '%', widget);
    this.rangeField(body, 'Contrast', widget.contrast, 0, 200, 1, function (v) { widget.contrast = v; self.applyStyles(widget); }, '%', widget);
    this.rangeField(body, 'Saturation', widget.saturation, 0, 200, 1, function (v) { widget.saturation = v; self.applyStyles(widget); }, '%', widget);
    this.rangeField(body, 'Blur', widget.blur, 0, 20, 1, function (v) { widget.blur = v; self.applyStyles(widget); }, 'px', widget);
    this.rangeField(body, 'Grayscale', widget.grayscale, 0, 100, 1, function (v) { widget.grayscale = v; self.applyStyles(widget); }, '%', widget);

    this.buildAppearanceFields(body, widget);

    this.sectionTitle(body, 'Interaction');
    this.selectField(body, 'Tap action', widget.linkAction, [
        { value: 'none', label: 'None' }, { value: 'lightbox', label: 'Open lightbox' },
        { value: 'external', label: 'Open link' }
    ], function (v) { widget.linkAction = v; self.applyStyles(widget); }, widget);
    this.textField(body, 'Link URL', widget.linkUrl, function (v) { widget.linkUrl = v; }, false, widget);
    this.checkboxField(body, 'Lazy load', widget.lazy, function (v) { widget.lazy = v; self.refreshInner(widget); }, widget);
};

WidgetManager.prototype.buildVideoFields = function (body, widget) {
    var self = this;
    this.sectionTitle(body, 'Source');
    this.textField(body, 'Video URL', widget.src, function (v) { widget.src = v; self.refreshInner(widget); }, false, widget);
    this.fileField(body, 'Or upload video', function (dataUrl) {
        widget.src = dataUrl;
        self.refreshInner(widget);
        self.save();
        self.openConfigPanel(widget);
    }, widget, 'video/*');
    this.textField(body, 'Poster image URL', widget.poster, function (v) { widget.poster = v; self.refreshInner(widget); }, false, widget);

    this.sectionTitle(body, 'Fit & Ratio');
    this.selectField(body, 'Fit', widget.fit, [
        { value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' },
        { value: 'fill', label: 'Fill' }, { value: 'stretch', label: 'Stretch' },
        { value: 'original', label: 'Original size' }
    ], function (v) { widget.fit = v; self.applyStyles(widget); }, widget);
    this.buttonGroupField(body, 'Aspect ratio', widget.aspectRatio, [
        { value: 'free', label: 'Free' }, { value: '1:1', label: '1:1' },
        { value: '4:3', label: '4:3' }, { value: '16:9', label: '16:9' }
    ], function (v) {
        widget.aspectRatio = v;
        if (v !== 'free') {
            widget.height = widget.width / self.ratioValue(v);
            self.applyStyles(widget);
        }
    }, widget);

    this.sectionTitle(body, 'Playback');
    this.checkboxField(body, 'Autoplay', widget.autoplay, function (v) {
        widget.autoplay = v;
        if (v) widget.muted = true;
        self.refreshInner(widget);
        self.openConfigPanel(widget);
    }, widget);
    this.checkboxField(body, 'Muted by default', widget.muted, function (v) { widget.muted = v; self.refreshInner(widget); }, widget);
    this.checkboxField(body, 'Loop', widget.loop, function (v) { widget.loop = v; self.refreshInner(widget); }, widget);
    this.selectField(body, 'Playback speed', widget.speed, [
        { value: '0.5', label: '0.5x' }, { value: '0.75', label: '0.75x' },
        { value: '1', label: '1x' }, { value: '1.25', label: '1.25x' },
        { value: '1.5', label: '1.5x' }, { value: '2', label: '2x' }
    ], function (v) { widget.speed = v; self.refreshInner(widget); }, widget);
    this.checkboxField(body, 'Show controls', widget.controls, function (v) { widget.controls = v; self.refreshInner(widget); }, widget);
    this.checkboxField(body, 'Allow fullscreen', widget.fullscreenAllowed, function (v) { widget.fullscreenAllowed = v; self.refreshInner(widget); }, widget);
    this.selectField(body, 'Preload', widget.preload, [
        { value: 'auto', label: 'Auto' }, { value: 'metadata', label: 'Metadata only' }, { value: 'none', label: 'None' }
    ], function (v) { widget.preload = v; self.refreshInner(widget); }, widget);

    this.buildAppearanceFields(body, widget);

    this.sectionTitle(body, 'Interaction');
    this.selectField(body, 'Tap action', widget.linkAction, [
        { value: 'none', label: 'None' }, { value: 'fullscreen', label: 'Open fullscreen' },
        { value: 'external', label: 'Open link' }
    ], function (v) { widget.linkAction = v; }, widget);
    this.textField(body, 'Link URL', widget.linkUrl, function (v) { widget.linkUrl = v; }, false, widget);
};

WidgetManager.prototype.buildShapeFields = function (body, widget) {
    var self = this;
    this.sectionTitle(body, 'Shape');
    this.iconButtonGroupField(body, 'Shape type', widget.shapeType, SHAPE_TYPES, function (v) {
        widget.shapeType = v;
        self.applyStyles(widget);
    }, widget);
    this.selectField(body, 'Fill type', widget.fillType, [
        { value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' },
        { value: 'transparent', label: 'Transparent' }
    ], function (v) { widget.fillType = v; self.applyStyles(widget); self.openConfigPanel(widget); }, widget);
    if (widget.fillType === 'solid') {
        this.colorField(body, 'Fill color', widget.fillColor, function (v) { widget.fillColor = v; self.applyStyles(widget); }, widget);
    } else if (widget.fillType === 'gradient') {
        this.colorField(body, 'Gradient from', widget.gradientFrom, function (v) { widget.gradientFrom = v; self.applyStyles(widget); }, widget);
        this.colorField(body, 'Gradient to', widget.gradientTo, function (v) { widget.gradientTo = v; self.applyStyles(widget); }, widget);
    }

    this.buildAppearanceFields(body, widget);
};

WidgetManager.prototype.openConfigPanel = function (widget) {
    var self = this;
    var panel = this.panel;
    panel.innerHTML = '';
    panel.classList.add('open');
    if (window.presentationController) window.presentationController.setPanelOpen(true);

    var header = document.createElement('div');
    header.className = 'widget-config-header';
    var h3 = document.createElement('h3');
    h3.textContent = widget.type + ' settings';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'widget-config-close';
    closeBtn.innerHTML = '&#215;';
    closeBtn.addEventListener('click', function () { self.deselectAll(); });
    header.appendChild(h3);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var body = document.createElement('div');
    body.className = 'widget-config-body';
    panel.appendChild(body);

    this.sectionTitle(body, 'Position & Size');
    this.numberField(body, 'X', Math.round(widget.x), function (v) { widget.x = v; self.applyStyles(widget); }, { step: 1 }, widget);
    this.numberField(body, 'Y', Math.round(widget.y), function (v) { widget.y = v; self.applyStyles(widget); }, { step: 1 }, widget);
    this.numberField(body, 'Width', Math.round(widget.width), function (v) { widget.width = v; self.applyStyles(widget); }, { min: 20, step: 1 }, widget);
    this.numberField(body, 'Height', Math.round(widget.height), function (v) { widget.height = v; self.applyStyles(widget); }, { min: 20, step: 1 }, widget);
    this.numberField(body, 'Rotation (deg)', widget.rotation, function (v) { widget.rotation = v; self.applyStyles(widget); }, { step: 1 }, widget);

    if (widget.type === 'text') this.buildTextFields(body, widget);
    else if (widget.type === 'photo') this.buildPhotoFields(body, widget);
    else if (widget.type === 'video') this.buildVideoFields(body, widget);
    else if (widget.type === 'shape') this.buildShapeFields(body, widget);
};
`;

// One shared rich-text formatting bridge for BOTH slide title/body text and
// text widgets (Issue 3) - a single code path, not two that merely look
// alike. For kind:'widget' it calls directly into WidgetManager's existing
// applyStyles/beginFieldEdit/commitFieldEdit/pushFieldEdit/save methods - the
// exact same underlying code path the sidebar uses, just driven by the
// parent's toolbar instead. Written without template literals/backticks
// throughout since this whole file is itself one giant template literal.
const TOOLBAR_SYSTEM_JS = `
// Bridge for the shared rich-text formatting toolbar (Issue 3): the actual
// controls now live in the parent app's title-bar toolbar, outside this
// iframe entirely (see PresentationViewerClient.tsx's editor-toolbar), so
// this class builds no DOM of its own anymore. It just tracks which
// element/widget is currently being edited, mirrors its style fields to the
// parent via postToParent, and applies format changes the parent sends back
// through the exact same getAccessor()-based code path the old in-page pill
// used for BOTH slide title/body text and text widgets.
function FloatingToolbar() {
    this.currentKind = null;
    this.currentTarget = null;
    this.accessor = null;
}

// Builds a { get, beginEdit, commitEdit, pushEdit, snapshot, setField, fields }
// accessor that abstracts over the two very different underlying data models
// (a live widget object vs. a per-slide textStyleDefaults() style record), so
// buildContent() below only has to be written once.
FloatingToolbar.prototype.getAccessor = function (kind, targetEl, ctx) {
    if (kind === 'widget') {
        var widget = ctx;
        return {
            beginEdit: function () { window.widgetManager.beginFieldEdit(widget); },
            commitEdit: function () { window.widgetManager.commitFieldEdit(widget); },
            pushEdit: function (before, after) { window.widgetManager.pushFieldEdit(widget, before, after); },
            snapshot: function () { return window.widgetManager.snapshotWidget(widget); },
            setField: function (key, value) {
                widget[key] = value;
                window.widgetManager.applyStyles(widget);
                window.widgetManager.save();
            },
            fields: {
                fontFamily: widget.fontFamily, fontSize: widget.fontSize, color: widget.color,
                align: widget.align, bold: !!widget.bold, italic: !!widget.italic,
                underline: !!widget.underline, strikethrough: !!widget.strikethrough,
                uppercase: !!widget.uppercase
            }
        };
    }
    var slideId = ctx.slideId;
    var field = ctx.field;
    var style = window.editorController.getTextStyle(slideId, field);
    return {
        beginEdit: function () {
            window.historyManager.begin({ kind: 'text-style', slideId: slideId, field: field, before: Object.assign({}, style) });
        },
        commitEdit: function () {
            window.historyManager.commit({ after: Object.assign({}, style) });
        },
        pushEdit: function (before, after) {
            window.historyManager.push({ kind: 'text-style', slideId: slideId, field: field, before: before, after: after });
        },
        snapshot: function () { return Object.assign({}, style); },
        setField: function (key, value) {
            style[key] = value;
            window.editorController.applyTextStyles(targetEl, style);
            window.editorController.persistTextEdit(slideId, field, targetEl.innerText, style);
        },
        fields: style
    };
};

FloatingToolbar.prototype.showFor = function (targetEl, kind, ctx) {
    if (!document.body.classList.contains('mode-edit')) return;
    if (!targetEl) return;
    this.currentKind = kind;
    this.currentTarget = targetEl;
    this.accessor = this.getAccessor(kind, targetEl, ctx);
    postToParent({ type: 'sp-text-focused', kind: kind, fields: this.accessor.fields });
};

FloatingToolbar.prototype.hide = function () {
    if (!this.currentKind && !this.currentTarget) return;
    this.currentKind = null;
    this.currentTarget = null;
    this.accessor = null;
    postToParent({ type: 'sp-text-blurred' });
};

// Always false now that the controls live outside this document - kept as a
// no-op so the cross-document blur guard in InlineEditor.bindElement (which
// used to skip hiding when focus moved INTO this toolbar's own DOM) simply
// falls through to its activeElement recheck, which still does the right
// thing since the parent side handles that guard for its own controls now.
FloatingToolbar.prototype.contains = function (node) {
    return false;
};

// Driven by Escape and the capture-phase mousedown listener below (both
// unambiguous - see their comments), and by the parent telling us the user
// clicked/Esc'd outside its own toolbar. For a widget, deselectAll() already
// hides this toolbar itself. For text, .blur() only runs bindElement's
// commit/persist cleanup (see the note there) - this.hide() is what actually
// closes the toolbar and notifies the parent, since blur alone no longer does.
FloatingToolbar.prototype.blurActive = function () {
    if (this.currentKind === 'widget') {
        if (window.widgetManager) window.widgetManager.deselectAll();
    } else if (this.currentTarget) {
        this.currentTarget.blur();
        this.hide();
    }
};

// One-shot controls: font family select, B/I/U/S/uppercase toggles, alignment.
FloatingToolbar.prototype.applyAtomic = function (key, value) {
    if (!this.accessor) return;
    var before = this.accessor.snapshot();
    this.accessor.setField(key, value);
    this.accessor.pushEdit(before, this.accessor.snapshot());
};

// Continuous controls: font size stepper, color picker. begin/live/end
// mirrors the focus/input/blur sequence the old raw <input> elements drove
// directly - live changes apply without pushing history, only the final end
// commits one history entry for the whole drag/type sequence.
FloatingToolbar.prototype.beginContinuous = function () {
    if (this.accessor) this.accessor.beginEdit();
};
FloatingToolbar.prototype.applyLive = function (key, value) {
    if (this.accessor) this.accessor.setField(key, value);
};
FloatingToolbar.prototype.endContinuous = function () {
    if (this.accessor) this.accessor.commitEdit();
};
`;

// Right-click context menu for the slide editor: widgets, empty slide
// background, and title/body text each get a different action list (see
// getActions). Structurally a point-anchored sibling of FloatingToolbar above
// (single reused fixed-position DOM node, show/hide/position/contains), just
// keyed off click coordinates instead of a target element's bounding rect.
const CONTEXT_MENU_JS = `
function ContextMenu() {
    // A deck saved before buildSaveableHtml() started excluding this element
    // (see its stale-removal list) can have an old copy of this menu baked
    // directly into the loaded markup - frozen mid-interaction, with no JS
    // ever bound to it, so it could never be dismissed (the exact bug that
    // comment already documents for .floating-toolbar). Strip any such
    // leftover before creating the real, live one.
    var staleMenus = document.querySelectorAll('.context-menu');
    for (var i = 0; i < staleMenus.length; i++) {
        staleMenus[i].parentNode.removeChild(staleMenus[i]);
    }
    this.el = document.createElement('div');
    this.el.className = 'context-menu';
    document.body.appendChild(this.el);
    this.currentKind = null;
    this.currentCtx = null;
    this.wireEvents();
}

ContextMenu.prototype.wireEvents = function () {
    var self = this;
    document.addEventListener('contextmenu', function (e) {
        if (!window.editorController || !window.editorController.isActive) return;

        // Filmstrip thumbnails get their own slide-level menu ('slide-thumb',
        // see getActions) - whole-slide Copy/Paste/Add Slide, matching the
        // PowerPoint convention for right-clicking the slide panel - distinct
        // from the canvas background's widget-scoped 'slide' menu below.
        // Handled as its own branch (not folded into the '.slide' case below)
        // because a thumbnail is a *clone* of that slide - the same clone that
        // makes plain '.slide'/'.slide-widget' selectors misfire here if not
        // excluded (see ThumbnailManager.buildThumb/stripIds) - so its contents
        // are inert markup, not the real interactive slide/widgets. Navigating
        // to the slide first (like a left-click already does) keeps every menu
        // action targeting the slide the user actually clicked.
        var thumbEl = e.target.closest('.filmstrip-thumb');
        if (thumbEl) {
            e.preventDefault();
            var thumbSlideId = thumbEl.getAttribute('data-slide-id');
            var thumbIndex = window.slideManager.order.indexOf(thumbSlideId);
            if (thumbIndex !== -1 && window.presentationController) window.presentationController.showSlide(thumbIndex);
            window.widgetManager.deselectAll();
            self.showFor(e.clientX, e.clientY, 'slide-thumb', { slideId: thumbSlideId });
            return;
        }

        var stageTarget = e.target.closest('#deckStage');
        if (!stageTarget) {
            self.hide();
            return;
        }
        e.preventDefault();

        var widgetEl = e.target.closest('.slide-widget');
        // A right-click can land on the text move/resize handle instead of the
        // title/body element itself - those handles are positioned siblings of
        // .slide (see createTextHandles), not descendants of .slide-title/
        // .slide-body, so closest() alone can't reach the owning element from
        // there. Fall back to the _textOwner back-reference stashed on the
        // handle when that happens, so right-clicking the handle still opens
        // the text element's own menu (Duplicate as Widget / Delete) instead of
        // misfiring the canvas-background 'slide' menu.
        var textHandleEl = e.target.closest('.text-move-handle, .text-resize-handle');
        var textEl = e.target.closest('.slide-title, .slide-body') || (textHandleEl && textHandleEl._textOwner) || null;
        var slideEl = e.target.closest('.slide');

        if (widgetEl) {
            var widgetId = widgetEl.dataset.widgetId;
            window.widgetManager.selectWidget(widgetId);
            self.showFor(e.clientX, e.clientY, 'widget', { widgetId: widgetId });
        } else if (textEl && slideEl) {
            self.showFor(e.clientX, e.clientY, 'text', {
                el: textEl,
                slideId: slideEl.getAttribute('data-slide-id'),
                field: textEl.classList.contains('slide-title') ? 'title' : 'body'
            });
        } else if (slideEl) {
            window.widgetManager.deselectAll();
            self.showFor(e.clientX, e.clientY, 'slide', { slideId: slideEl.getAttribute('data-slide-id') });
        } else {
            self.hide();
        }
    });

    // Dismiss on any ordinary click elsewhere - contextmenu above only ever
    // fires for right-clicks (opening a new menu, or hiding when the target
    // is outside #deckStage entirely), so without this a left-click on the
    // slide, a widget, or anywhere else in the document left the menu sitting
    // open indefinitely.
    document.addEventListener('mousedown', function (e) {
        if (!self.el.classList.contains('open')) return;
        if (self.contains(e.target)) return;
        self.hide();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.hide();
    });
};

ContextMenu.prototype.getActions = function (kind, ctx) {
    if (kind === 'widget') {
        var index = window.widgetManager.widgetIndex(ctx.widgetId);
        var slideId = window.widgetManager.findWidgetSlideId(ctx.widgetId);
        var count = slideId !== null ? window.widgetManager.widgetsBySlide[slideId].length : 0;
        return [
            { label: 'Edit Properties', run: function () { window.widgetManager.selectWidget(ctx.widgetId); } },
            { label: 'Duplicate', shortcut: '⌘D', run: function () { window.widgetManager.duplicateWidget(ctx.widgetId); } },
            { label: 'Copy', shortcut: '⌘C', run: function () { window.widgetManager.copyWidget(ctx.widgetId); } },
            'separator',
            { label: 'Bring to Front', shortcut: '⌘]', disabled: index === -1 || index === count - 1, run: function () { window.widgetManager.bringToFront(ctx.widgetId); } },
            { label: 'Send to Back', shortcut: '⌘[', disabled: index === -1 || index === 0, run: function () { window.widgetManager.sendToBack(ctx.widgetId); } },
            'separator',
            { label: 'Delete', shortcut: 'Del', danger: true, run: function () { window.widgetManager.deleteWidget(ctx.widgetId); } }
        ];
    }
    if (kind === 'slide') {
        // Canvas background (empty area of the currently-displayed slide) -
        // widget-scoped paste, since that's what a canvas right-click is "on".
        var slideCount = window.slideManager.order.length;
        return [
            { label: 'Add Widget', run: function () { window.widgetManager.togglePopover(); } },
            { label: 'Paste', shortcut: '⌘V', disabled: !window.widgetManager.clipboardWidget, run: function () { window.widgetManager.pasteWidget(ctx.slideId); } },
            'separator',
            { label: 'Duplicate Slide', run: function () { window.slideManager.duplicateSlide(ctx.slideId); } },
            { label: 'Delete Slide', danger: true, disabled: slideCount <= 1, run: function () { window.slideManager.deleteSlide(ctx.slideId); } }
        ];
    }
    if (kind === 'slide-thumb') {
        // Filmstrip thumbnail - slide-scoped actions, matching the PowerPoint
        // convention of right-clicking the slide panel: whole-slide Copy/Paste
        // (SlideManager.copySlide/pasteSlideAfter) rather than the canvas
        // menu's widget-scoped Paste above, plus an explicit "Add Slide" that
        // the canvas menu has no equivalent surface for.
        var thumbSlideCount = window.slideManager.order.length;
        return [
            { label: 'Add Slide', run: function () { window.slideManager.addSlideAfter(ctx.slideId); } },
            { label: 'Duplicate Slide', run: function () { window.slideManager.duplicateSlide(ctx.slideId); } },
            'separator',
            { label: 'Copy', shortcut: '⌘C', run: function () { window.slideManager.copySlide(ctx.slideId); } },
            { label: 'Paste', shortcut: '⌘V', disabled: !window.slideManager.clipboardSlide, run: function () { window.slideManager.pasteSlideAfter(ctx.slideId); } },
            'separator',
            { label: 'Delete Slide', danger: true, disabled: thumbSlideCount <= 1, run: function () { window.slideManager.deleteSlide(ctx.slideId); } }
        ];
    }
    if (kind === 'text') {
        // Native contenteditable field - delegate to execCommand rather than
        // the widget clipboard above, since the browser already knows how to
        // cut/copy/paste text selections here correctly.
        return [
            { label: 'Cut', shortcut: '⌘X', run: function () { document.execCommand('cut'); } },
            { label: 'Copy', shortcut: '⌘C', run: function () { document.execCommand('copy'); } },
            { label: 'Paste', shortcut: '⌘V', run: function () { document.execCommand('paste'); } },
            'separator',
            // Unlike widgets, title/body are fixed slots baked into every slide
            // template, not a freeform list - so "Duplicate" copies the text out
            // into the widget system (a real, independently movable/deletable
            // element) rather than creating a second title/body slot that
            // wouldn't have anywhere to live.
            { label: 'Duplicate as Widget', run: function () { window.editorController.duplicateTextAsWidget(ctx.el, ctx.slideId, ctx.field); } },
            { label: 'Delete', danger: true, run: function () { window.editorController.deleteTextElement(ctx.el, ctx.slideId, ctx.field); } }
        ];
    }
    return [];
};

ContextMenu.prototype.buildContent = function (actions) {
    var self = this;
    this.el.innerHTML = '';
    actions.forEach(function (action) {
        if (action === 'separator') {
            var sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            self.el.appendChild(sep);
            return;
        }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'context-menu-item' + (action.danger ? ' danger' : '');
        if (action.disabled) btn.disabled = true;
        var labelSpan = document.createElement('span');
        labelSpan.textContent = action.label;
        btn.appendChild(labelSpan);
        if (action.shortcut) {
            var shortcutSpan = document.createElement('span');
            shortcutSpan.className = 'context-menu-shortcut';
            shortcutSpan.textContent = action.shortcut;
            btn.appendChild(shortcutSpan);
        }
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            action.run();
            self.hide();
        });
        self.el.appendChild(btn);
    });
};

ContextMenu.prototype.showFor = function (x, y, kind, ctx) {
    if (!window.editorController || !window.editorController.isActive) return;
    this.currentKind = kind;
    this.currentCtx = ctx;
    this.buildContent(this.getActions(kind, ctx));
    this.el.classList.add('open');
    this.position(x, y);
};

ContextMenu.prototype.position = function (x, y) {
    var rect = this.el.getBoundingClientRect();
    var left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    var top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    this.el.style.left = left + 'px';
    this.el.style.top = top + 'px';
};

ContextMenu.prototype.hide = function () {
    this.el.classList.remove('open');
    this.currentKind = null;
    this.currentCtx = null;
};

ContextMenu.prototype.contains = function (node) {
    return !!node && this.el.contains(node);
};
`;

// Canva-style alignment/snapping guides shown while dragging a widget or the
// slide title/body. One instance, constructed once alongside
// window.floatingToolbar/window.thumbnailManager (see the bootstrap at the
// bottom of this template) and re-parented into whichever .slide a drag
// belongs to. Targets are cached once per drag gesture (cacheTargets, called
// from pointerdown) rather than recomputed on every pointermove, per the
// feature's own performance requirement. Written without template literals/
// backticks throughout since this whole file is itself one giant template
// literal.
const SMART_GUIDES_JS = `
function SmartGuides() {
    this.container = document.createElement('div');
    this.container.className = 'smart-guides';
    this.vLine = document.createElement('div');
    this.vLine.className = 'smart-guide-line vertical';
    this.hLine = document.createElement('div');
    this.hLine.className = 'smart-guide-line horizontal';
    this.container.appendChild(this.vLine);
    this.container.appendChild(this.hLine);
    this.targetsX = [];
    this.targetsY = [];
}

// Restricted to currentSlideEl only (never other slides). excludeEl is either
// the widget object being dragged (widgets are matched by id) or the DOM
// title/body element being dragged (text elements are matched by reference) -
// whichever the caller passes, only the matching check below can ever fire.
SmartGuides.prototype.cacheTargets = function (currentSlideEl, excludeEl) {
    if (!currentSlideEl) return;
    if (this.container.parentNode !== currentSlideEl) currentSlideEl.appendChild(this.container);

    var targetsX = [{ value: 0 }, { value: 960 }, { value: 1920 }];
    var targetsY = [{ value: 0 }, { value: 540 }, { value: 1080 }];

    var slideId = currentSlideEl.getAttribute('data-slide-id');
    var widgetList = (window.widgetManager && window.widgetManager.widgetsBySlide[slideId]) || [];
    widgetList.forEach(function (w) {
        if (excludeEl && w.id === excludeEl.id) return;
        targetsX.push({ value: w.x });
        targetsX.push({ value: w.x + w.width / 2 });
        targetsX.push({ value: w.x + w.width });
        targetsY.push({ value: w.y });
        targetsY.push({ value: w.y + w.height / 2 });
        targetsY.push({ value: w.y + w.height });
    });

    // Same rect-diffing pattern promoteToFreeform/positionTextHandles use:
    // measure the element's actual rendered box relative to .slide and divide
    // by the stage scale, so this works uniformly whether title/body is still
    // in flow or already promoted to a free position.
    var scale = window.widgetManager.getStageScale();
    var slideRect = currentSlideEl.getBoundingClientRect();
    var textEls = currentSlideEl.querySelectorAll('.slide-title, .slide-body');
    Array.prototype.forEach.call(textEls, function (el) {
        if (el === excludeEl) return;
        var rect = el.getBoundingClientRect();
        var x = (rect.left - slideRect.left) / scale;
        var y = (rect.top - slideRect.top) / scale;
        var w = rect.width / scale;
        var h = rect.height / scale;
        targetsX.push({ value: x });
        targetsX.push({ value: x + w / 2 });
        targetsX.push({ value: x + w });
        targetsY.push({ value: y });
        targetsY.push({ value: y + h / 2 });
        targetsY.push({ value: y + h });
    });

    this.targetsX = targetsX;
    this.targetsY = targetsY;
};

// box = { x, y, width, height } is the dragged element's current, already
// -clamped-to-slide-bounds candidate position for this tick. X and Y are
// checked and matched fully independently, so a drag can snap on one axis,
// both, or neither on any given tick.
SmartGuides.prototype.check = function (box, scale) {
    var threshold = 6 / scale;
    var result = { x: box.x, y: box.y, guideX: null, guideY: null };

    var candidatesX = [box.x, box.x + box.width / 2, box.x + box.width];
    var bestXDist = Infinity, bestXTarget = null, bestXCandidate = null;
    this.targetsX.forEach(function (t) {
        candidatesX.forEach(function (c) {
            var d = Math.abs(t.value - c);
            if (d < bestXDist) {
                bestXDist = d;
                bestXTarget = t.value;
                bestXCandidate = c;
            }
        });
    });
    if (bestXTarget !== null && bestXDist <= threshold) {
        result.x = box.x + (bestXTarget - bestXCandidate);
        result.guideX = bestXTarget;
    }

    var candidatesY = [box.y, box.y + box.height / 2, box.y + box.height];
    var bestYDist = Infinity, bestYTarget = null, bestYCandidate = null;
    this.targetsY.forEach(function (t) {
        candidatesY.forEach(function (c) {
            var d = Math.abs(t.value - c);
            if (d < bestYDist) {
                bestYDist = d;
                bestYTarget = t.value;
                bestYCandidate = c;
            }
        });
    });
    if (bestYTarget !== null && bestYDist <= threshold) {
        result.y = box.y + (bestYTarget - bestYCandidate);
        result.guideY = bestYTarget;
    }

    return result;
};

SmartGuides.prototype.showGuides = function (guideX, guideY, slideEl) {
    if (slideEl && this.container.parentNode !== slideEl) slideEl.appendChild(this.container);
    if (guideX !== null && guideX !== undefined) {
        this.vLine.style.left = guideX + 'px';
        this.vLine.style.display = 'block';
    } else {
        this.vLine.style.display = 'none';
    }
    if (guideY !== null && guideY !== undefined) {
        this.hLine.style.top = guideY + 'px';
        this.hLine.style.display = 'block';
    } else {
        this.hLine.style.display = 'none';
    }
};

SmartGuides.prototype.hideGuides = function () {
    this.vLine.style.display = 'none';
    this.hLine.style.display = 'none';
};
`;

// Toolbar icons for the slide-structure/history controls (add slide, delete slide,
// undo, redo). Interpolated directly with real template-literal syntax (unlike the
// WIDGET_SYSTEM_JS/SLIDE_SYSTEM_JS/HISTORY_SYSTEM_JS runtime strings above), since
// this constant lives at the TypeScript level, not inside the embedded script.
const TOOLBAR_ICONS = {
  addSlide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="12" y1="9" x2="12" y2="15"></line><line x1="9" y1="12" x2="15" y2="12"></line></svg>',
  deleteSlide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"></path></svg>',
};

// Generates the final full interactive presentation HTML file content
export function generatePresentationHtml(title: string, rawNotes: string, themeOrCustom: string | CustomThemeData): string {
  const theme = resolveThemeConfig(themeOrCustom);
  const slideTexts = parseSermonNotes(rawNotes);
  const totalSlides = slideTexts.length;

  const slidesHtml = slideTexts.map((text, idx) => {
    const isTitle = idx === 0;
    const slideClass = isTitle ? 'slide title-slide active visible' : 'slide';
    const innerContent = theme.renderSlide(text, isTitle, idx, totalSlides);
    return `
      <section class="${slideClass}" data-index="${idx}" data-slide-id="slide-${idx}">
        ${innerContent}
      </section>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    ${theme.fontsLink}
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        /* Base Viewport Styles */
        ${VIEWPORT_BASE_CSS}

        /* Base slide layout fallbacks (padding/sizing/centering safety net) */
        ${BASE_SLIDE_CSS}

        /* Custom Theme Styles */
        ${theme.css}

        /* Edit Mode Styles */
        .edit-hotzone {
            position: fixed; 
            top: 0; 
            left: 0;
            width: 80px; 
            height: 80px;
            z-index: 10000;
            cursor: pointer;
        }
        .edit-toggle {
            position: fixed;
            top: 20px;
            left: var(--dock-offset);
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #ffffff;
            border: 1px solid rgba(0,0,0,0.1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease, transform 0.2s ease;
            z-index: 10001;
        }
        .edit-toggle.show,
        .edit-toggle.active {
            opacity: 1;
            pointer-events: auto;
        }
        .edit-toggle.active {
            background: var(--primary, #6366f1);
            color: #fff;
            transform: scale(1.1);
        }
        [contenteditable="true"] {
            outline: 2px dashed var(--primary, #6366f1) !important;
            padding: 4px;
            border-radius: 4px;
            background: rgba(99, 102, 241, 0.05);
        }

        /* Widget System Styles */
        ${WIDGET_SYSTEM_CSS}

        /* Filmstrip (Edit Mode slide navigator) */
        ${FILMSTRIP_CSS}

        /* Right-click context menu */
        ${CONTEXT_MENU_CSS}

        /* Title/body free-position drag/resize handles */
        ${TEXT_HANDLES_CSS}

        /* Smart Guides (alignment/snapping overlay) */
        ${SMART_GUIDES_CSS}
    </style>
</head>
<body>
    <div class="edit-hotzone"></div>
    <button class="edit-toggle" id="editToggle" title="Edit mode (E)">✏️</button>
    <button class="add-widget-toggle" id="addWidgetToggle" title="Add widget">+</button>
    <button class="toolbar-btn" id="addSlideToggle" title="Add slide">${TOOLBAR_ICONS.addSlide}</button>
    <button class="toolbar-btn" id="deleteSlideToggle" title="Delete slide">${TOOLBAR_ICONS.deleteSlide}</button>
    <button class="toolbar-btn" id="undoToggle" title="Undo (Ctrl+Z)">${TOOLBAR_ICONS.undo}</button>
    <button class="toolbar-btn" id="redoToggle" title="Redo (Ctrl+Shift+Z)">${TOOLBAR_ICONS.redo}</button>
    <div class="widget-popover" id="widgetPopover"></div>
    <aside class="widget-config-panel" id="widgetConfigPanel"></aside>

    <div class="deck-viewport">
        <main class="deck-stage" id="deckStage">
            ${slidesHtml}
        </main>
    </div>

    <script>
        // State Realtime Sync interface
        // If we are embedded in SermonPresenter, we communicate current index with parent window
        function syncSlideWithParent(index) {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'slide-changed',
                    index: index
                }, '*');
            }
        }

        function postToParent(msg) {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(msg, '*');
            }
        }

        // Snapshot of the structural toolbar's button states (edit-active,
        // undo/redo availability, delete-slide availability, add-widget-popover
        // open) - sent to the parent app whenever any of it changes, since the
        // buttons that used to live in this document (and read this document's
        // own DOM/class state directly) now live in the parent's title bar.
        function postEditorState() {
            postToParent({
                type: 'sp-editor-state',
                isEditActive: !!(window.editorController && window.editorController.isActive),
                canUndo: !!(window.historyManager && window.historyManager.undoStack.length > 0),
                canRedo: !!(window.historyManager && window.historyManager.redoStack.length > 0),
                canDeleteSlide: !!(window.slideManager && window.slideManager.order.length > 1),
                addWidgetOpen: !!(window.widgetManager && window.widgetManager.popover && window.widgetManager.popover.classList.contains('open'))
            });
        }

        // document.documentElement.outerHTML on its own would also capture the
        // editor's own transient UI: #slideFilmstrip's thumbnails (each one a
        // cloneNode(true) of an entire slide, so N slides roughly doubles the
        // saved payload), .floating-toolbar, and the per-element move/resize
        // handles from createTextHandles - none of these exist in the static
        // template (grep the <body> above: only editToggle/addWidgetToggle/
        // the slide-structure toolbar buttons/widgetPopover/widgetConfigPanel
        // are static; filmstrip, floating toolbar, and text handles are all
        // appended by JS at runtime). Left in, they don't just bloat the saved
        // file - past a certain deck size that alone was enough to exceed
        // Next's default 1MB Server Action body limit - they also become
        // stale, non-functional leftover markup on the NEXT load, since the
        // bootstrap script unconditionally creates fresh new instances of all
        // of these without knowing to remove old ones already baked into the
        // HTML. That produced a duplicate/stuck floating toolbar: a frozen
        // copy from a previous save sitting alongside a live new one, with no
        // JS ever wired to the frozen copy so it could never be dismissed.
        // widgetConfigPanel/widgetPopover ARE part of the static template, so
        // they stay, just with any transient contents cleared instead of
        // removed outright. outerHTML also never includes the <!DOCTYPE html>
        // preceding <html> (it's a sibling node, not a descendant) even though
        // the original generation output always has one - re-added here so a
        // reloaded, edited deck doesn't silently start rendering in quirks mode.
        function buildSaveableHtml() {
            var clone = document.documentElement.cloneNode(true);
            var stale = clone.querySelectorAll('#slideFilmstrip, .floating-toolbar, .text-move-handle, .text-resize-handle, .smart-guides, .context-menu');
            for (var i = 0; i < stale.length; i++) {
                stale[i].parentNode.removeChild(stale[i]);
            }
            var panel = clone.querySelector('#widgetConfigPanel');
            if (panel) { panel.innerHTML = ''; panel.classList.remove('open'); }
            var popover = clone.querySelector('#widgetPopover');
            if (popover) { popover.innerHTML = ''; popover.classList.remove('open'); }
            // .show/.active are transient hover/edit-state toggles (see
            // setupHoverControls() and the various setEditMode() methods) driven
            // by live JS state, not real content. A fresh load reconstructs that
            // JS state from scratch (a new InlineEditor always starts inactive),
            // so if these were baked into the saved markup - e.g. the user's mouse
            // was over the edit hotzone at the exact moment this saved - nothing
            // would ever clean them back up, leaving edit-only buttons visibly
            // stuck open in Present Mode.
            var toggles = clone.querySelectorAll('.edit-toggle, .add-widget-toggle, .toolbar-btn');
            for (var t = 0; t < toggles.length; t++) {
                toggles[t].classList.remove('show', 'active');
            }
            return '<!DOCTYPE html>\\n' + clone.outerHTML;
        }

        // Debounced save-to-parent: coalesces rapid edits (typing, dragging,
        // widget field tweaks) into a single postMessage carrying the full
        // serialized document, which the parent re-uploads to Supabase
        // Storage. The various localStorage.setItem(...) calls throughout this
        // file remain as an instant same-browser fallback - this is additive.
        var __saveTimer = null;
        function scheduleSave() {
            if (document.body.classList.contains('mode-present')) return;
            clearTimeout(__saveTimer);
            __saveTimer = setTimeout(function () {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'request-save', html: buildSaveableHtml() }, '*');
                }
            }, 1500);
        }

        // Listen for slide change / mode-switch requests from parent window
        window.addEventListener('message', (e) => {
            if (!e.data) return;
            const action = e.data.action || e.data.type;

            // Toolbar bridge (see postEditorState/FloatingToolbar above): the
            // structural buttons and the rich-text formatting controls both now
            // live in the parent app's title bar instead of this document, and
            // talk to this document exclusively through these sp-* messages.
            if (e.data.type === 'sp-command') {
                const idMap = {
                    'toggle-edit': 'editToggle',
                    'toggle-add-widget': 'addWidgetToggle',
                    'add-slide': 'addSlideToggle',
                    'delete-slide': 'deleteSlideToggle',
                    'undo': 'undoToggle',
                    'redo': 'redoToggle'
                };
                const btnId = idMap[e.data.command];
                const btn = btnId && document.getElementById(btnId);
                if (btn) btn.click();
                return;
            }
            if (e.data.type === 'sp-format-set') {
                if (window.floatingToolbar) window.floatingToolbar.applyAtomic(e.data.key, e.data.value);
                return;
            }
            if (e.data.type === 'sp-format-begin') {
                if (window.floatingToolbar) window.floatingToolbar.beginContinuous();
                return;
            }
            if (e.data.type === 'sp-format-live') {
                if (window.floatingToolbar) window.floatingToolbar.applyLive(e.data.key, e.data.value);
                return;
            }
            if (e.data.type === 'sp-format-end') {
                if (window.floatingToolbar) window.floatingToolbar.endContinuous();
                return;
            }
            if (e.data.type === 'sp-toolbar-blur') {
                if (window.floatingToolbar) window.floatingToolbar.blurActive();
                return;
            }
            if (e.data.type === 'sp-request-state') {
                postEditorState();
                return;
            }

            if (action === 'set-mode' && (e.data.mode === 'edit' || e.data.mode === 'present')) {
                applyMode(e.data.mode);
                return;
            }
            if (action === 'flush-save') {
                // Bypasses scheduleSave()'s debounce so a caller (e.g. "Present",
                // right before it opens a separate window that re-fetches the saved
                // deck from storage) can be sure the latest edits are captured
                // instead of racing the normal 1.5s timer.
                clearTimeout(__saveTimer);
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'request-save', html: buildSaveableHtml() }, '*');
                }
                return;
            }
            if (!window.presentationController) return;
            if (action === 'set-slide' && typeof e.data.index === 'number') {
                window.presentationController.showSlide(e.data.index);
            } else if (action === 'next') {
                window.presentationController.nextSlide();
            } else if (action === 'prev') {
                window.presentationController.prevSlide();
            }
        });

        /* Slide Presentation Controller */
        class SlidePresentation {
            constructor() {
                this.slides = document.querySelectorAll('.slide');
                this.currentSlide = 0;
                this.stage = document.getElementById('deckStage');
                this.setupStageScale();
                this.setupKeyboardNav();
                this.setupTouchNav();
                this.setupMouseWheel();
                this.showSlide(0);
            }

            setupStageScale() {
                this.panelOpen = false;
                const scale = () => {
                    const w = window.innerWidth || document.documentElement.clientWidth || (document.body ? document.body.clientWidth : 0);
                    const h = window.innerHeight || document.documentElement.clientHeight || (document.body ? document.body.clientHeight : 0);
                    if (!w || !h) {
                        setTimeout(scale, 50);
                        requestAnimationFrame(scale);
                        return;
                    }
                    const panelEl = this.panelOpen ? document.getElementById('widgetConfigPanel') : null;
                    const panelWidth = panelEl ? panelEl.getBoundingClientRect().width : 0;
                    // Filmstrip is docked left in Edit Mode only; subtract its width the
                    // same way panelWidth is already subtracted for the right-docked
                    // widget config panel, and offset x so the stage centers in the
                    // remaining space instead of sliding under the filmstrip.
                    const filmstripEl = document.body.classList.contains('mode-edit') ? document.getElementById('slideFilmstrip') : null;
                    const filmstripWidth = filmstripEl ? filmstripEl.getBoundingClientRect().width : 0;
                    const availableW = Math.max(w - panelWidth - filmstripWidth, 0);
                    const factor = Math.min(availableW / 1920, h / 1080);
                    const x = filmstripWidth + (availableW - 1920 * factor) / 2;
                    const y = (h - 1080 * factor) / 2;
                    this.stage.style.transform = \`translate(\${x}px, \${y}px) scale(\${factor})\`;
                };
                this.scale = scale;
                scale();
                setTimeout(scale, 50);
                setTimeout(scale, 200);
                setTimeout(scale, 500);
                setTimeout(scale, 1000);
                window.addEventListener('resize', scale);
                window.addEventListener('load', scale);
                document.addEventListener('DOMContentLoaded', scale);
                if (typeof ResizeObserver !== 'undefined' && document.body) {
                    new ResizeObserver(scale).observe(document.body);
                }
            }

            setPanelOpen(isOpen) {
                if (this.panelOpen === isOpen) return;
                this.panelOpen = isOpen;
                if (this.stage) this.stage.classList.add('panel-transition');
                this.scale();
                clearTimeout(this._panelTransitionTimer);
                this._panelTransitionTimer = setTimeout(() => {
                    if (this.stage) this.stage.classList.remove('panel-transition');
                }, 300);
            }

            setupKeyboardNav() {
                document.addEventListener('keydown', (e) => {
                    if (e.target.getAttribute('contenteditable') === 'true') return;
                    
                    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
                        this.nextSlide();
                    } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') {
                        this.prevSlide();
                    } else if (e.key === 'Home') {
                        this.showSlide(0);
                    } else if (e.key === 'End') {
                        this.showSlide(this.slides.length - 1);
                    }
                });
            }

            setupTouchNav() {
                let startX = 0;
                document.addEventListener('touchstart', (e) => {
                    startX = e.touches[0].clientX;
                });
                document.addEventListener('touchend', (e) => {
                    const diffX = e.changedTouches[0].clientX - startX;
                    if (diffX < -50) {
                        this.nextSlide();
                    } else if (diffX > 50) {
                        this.prevSlide();
                    }
                });
            }

            setupMouseWheel() {
                let lastScrollTime = 0;
                window.addEventListener('wheel', (e) => {
                    if (e.target.closest('[contenteditable="true"]')) return;
                    // Scrolling inside the filmstrip (left) or widget config
                    // panel (right) should only scroll their own content, not
                    // also drive slide navigation - each already has its own
                    // overflow-y:auto container, this just stops the event
                    // from also being read as a stage-level wheel gesture.
                    if (e.target.closest('#slideFilmstrip, #widgetConfigPanel')) return;

                    const now = Date.now();
                    if (now - lastScrollTime < 1000) return; // Debounce wheel
                    
                    if (e.deltaY > 50) {
                        this.nextSlide();
                        lastScrollTime = now;
                    } else if (e.deltaY < -50) {
                        this.prevSlide();
                        lastScrollTime = now;
                    }
                }, { passive: true });
            }

            nextSlide() {
                if (this.currentSlide < this.slides.length - 1) {
                    this.showSlide(this.currentSlide + 1);
                }
            }

            prevSlide() {
                if (this.currentSlide > 0) {
                    this.showSlide(this.currentSlide - 1);
                }
            }

            showSlide(index) {
                // Blur whatever's focused before switching slides - browsers don't blur
                // an element just because it becomes visibility:hidden (which is how
                // slide switching works, not display:none), so without this a focused
                // .slide-title/.slide-body on the outgoing slide would stay "focused"
                // while invisible, leaving the floating toolbar and its move/resize
                // handles stuck on screen (now floating over whatever slide is shown
                // next) and any in-progress edit never committed to history/save.
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                if (window.floatingToolbar) window.floatingToolbar.hide();

                this.currentSlide = Math.max(0, Math.min(index, this.slides.length - 1));
                this.slides.forEach((slide, i) => {
                    const isActive = i === this.currentSlide;
                    slide.classList.toggle('active', isActive);
                    slide.classList.toggle('visible', isActive);
                });
                syncSlideWithParent(this.currentSlide);
                if (window.thumbnailManager) window.thumbnailManager.updateActive(this.currentSlide);
            }

            // Slides can be inserted/removed after construction (SlideManager); this.slides
            // is a static NodeList snapshot, so re-query it after any structural change.
            refreshSlides() {
                this.slides = document.querySelectorAll('#deckStage .slide');
                if (this.currentSlide > this.slides.length - 1) {
                    this.currentSlide = this.slides.length - 1;
                }
            }
        }

        /* Inline Editor Handler */
        // Per-slide title/body style override model. null/false means "inherit the
        // theme default" - an untouched slide (every field left at its default)
        // must render pixel-identical to before this feature existed, since
        // applyTextStyles() below sets an empty string (not a value) for any
        // field left at its default, which lets the theme's own CSS class rule
        // win again instead of leaving a stray inline override behind.
        function textStyleDefaults() {
            return {
                fontFamily: null, fontSize: null, fontWeight: null, color: null,
                align: null, bold: false, italic: false, underline: false,
                strikethrough: false, uppercase: null,
                x: null, y: null, width: null, height: null
            };
        }

        // Captures the on-screen box of a still-in-flow title/body element and turns
        // it into an explicit position/size override, so the very first drag/resize
        // never causes a visual jump - the element switches to position:absolute at
        // exactly the rect it already occupied. Idempotent: once a field has been
        // promoted (style.x !== null), later calls just return the existing style.
        //
        // Coordinates are measured relative to the element's own .slide (a fixed
        // 1920x1080 box per BASE_SLIDE_CSS, position:absolute, that never resizes
        // due to child content changes) rather than el.offsetParent. offsetParent
        // seems like the natural choice - it's the actual CSS containing block
        // position:absolute will resolve against - but several themes nest the
        // title/body inside a shrink-to-fit flex container (e.g. vintage-editorial's
        // .content-area, sized by its own children's natural width). The instant
        // this function flips the element to position:absolute, it's removed from
        // that container's flow, the container can resize/recenter around its
        // remaining content, and everything downstream that positions relative to
        // it - including the freshly-computed style.x/y themselves, applied a
        // moment later - inherits that shift as a visible jump. Re-parenting into
        // .slide (done below, right after measuring) sidesteps the whole class of
        // bug: .slide's own box never depends on what's inside it.
        function promoteToFreeform(el, slideId, field) {
            var style = window.editorController.getTextStyle(slideId, field);
            if (style.x !== null) return style;
            var slide = el.closest('.slide');
            var slideRect = slide.getBoundingClientRect();
            var scale = window.widgetManager.getStageScale();
            var rect = el.getBoundingClientRect();
            style.x = (rect.left - slideRect.left) / scale;
            style.y = (rect.top - slideRect.top) / scale;
            style.width = rect.width / scale;
            style.height = rect.height / scale;
            // Must happen before applyTextStyles() sets position:absolute - and
            // synchronously, with no paint in between, so there's no visible flash
            // of the element rendering (even briefly) at the wrong position under
            // its new parent before left/top/width/height get applied.
            slide.appendChild(el);
            return style;
        }

        // Grip glyph for the title/body move handle, matching the plain-SVG-string
        // convention WIDGET_ICONS uses (see WIDGET_SYSTEM_JS) rather than the
        // stroke-outline TOOLBAR_ICONS convention, since this is a small filled
        // glyph rather than a line icon.
        var TEXT_MOVE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor">' +
            '<circle cx="8" cy="6" r="1.8"></circle><circle cx="16" cy="6" r="1.8"></circle>' +
            '<circle cx="8" cy="12" r="1.8"></circle><circle cx="16" cy="12" r="1.8"></circle>' +
            '<circle cx="8" cy="18" r="1.8"></circle><circle cx="16" cy="18" r="1.8"></circle></svg>';

        class InlineEditor {
            constructor() {
                this.isActive = false;
                this.editToggle = document.getElementById('editToggle');
                this.hotzone = document.querySelector('.edit-hotzone');
                // A plain mutable array, not a live NodeList/static snapshot - slides
                // duplicated later via SlideManager.duplicateSlide need to register
                // their cloned title/body elements here too (see registerElement).
                this.editableElements = Array.prototype.slice.call(document.querySelectorAll('.slide-title, .slide-body'));
                this.textStyles = {}; // slideId -> { title: {...}, body: {...} }
                this.setupHoverControls();
                this.setupKeyboardTrigger();
                this.setupTextHistory();
                // Deliberately reading style state back from the DOM rather than
                // replaying this browser's localStorage cache over it (the old
                // loadStoredEdits() behavior): now that full-deck autosave to
                // Supabase actually works, the just-loaded HTML IS the
                // authoritative source, and reapplying a separate stale local
                // cache on top of it was silently overwriting freshly
                // regenerated/edited content with old edits from a previous
                // session on this same browser/pathname - a real, confusing bug.
                this.initFromBakedStyles();
            }

            // Reconstructs this.textStyles from whatever's already applied as
            // inline styles on each element - correct whether that's nothing
            // (freshly generated, theme defaults only) or a previous save's
            // overrides (baked directly into the loaded HTML by applyTextStyles
            // itself, which is why reading them back is exact, not a guess).
            // Without this, getTextStyle() would hand back a blank default
            // object for an already-styled element, and the next toolbar edit
            // (which writes ALL style fields, not just the one being changed)
            // would silently blank out every other property that was set.
            initFromBakedStyles() {
                this.editableElements.forEach(el => {
                    const slide = el.closest('.slide');
                    if (!slide) return;
                    const slideId = slide.getAttribute('data-slide-id');
                    const field = el.classList.contains('slide-title') ? 'title' : 'body';
                    const style = this.getTextStyle(slideId, field);
                    if (el.style.fontFamily) style.fontFamily = el.style.fontFamily;
                    if (el.style.fontSize) style.fontSize = parseFloat(el.style.fontSize);
                    if (el.style.color) style.color = el.style.color;
                    if (el.style.textAlign) style.align = el.style.textAlign;
                    if (el.style.fontWeight) style.bold = el.style.fontWeight === '700' || el.style.fontWeight === 'bold';
                    if (el.style.fontStyle) style.italic = el.style.fontStyle === 'italic';
                    const decoration = el.style.textDecoration || '';
                    style.underline = decoration.indexOf('underline') !== -1;
                    style.strikethrough = decoration.indexOf('line-through') !== -1;
                    if (el.style.textTransform === 'uppercase') style.uppercase = true;
                    else if (el.style.textTransform === 'none') style.uppercase = false;
                    if (el.style.position === 'absolute') {
                        style.x = parseFloat(el.style.left) || 0;
                        style.y = parseFloat(el.style.top) || 0;
                        style.width = parseFloat(el.style.width) || 0;
                        style.height = parseFloat(el.style.height) || 0;
                    }
                });
            }

            getTextStyle(slideId, field) {
                if (!this.textStyles[slideId]) {
                    this.textStyles[slideId] = { title: textStyleDefaults(), body: textStyleDefaults() };
                }
                if (!this.textStyles[slideId][field]) {
                    this.textStyles[slideId][field] = textStyleDefaults();
                }
                return this.textStyles[slideId][field];
            }

            // Setting el.style.* directly always wins over the theme's CSS class rule
            // by specificity - the same mechanism WidgetManager.applyStyles already
            // relies on for widgets, so this is a known-safe pattern here, not a new
            // risk. An empty string clears an inline override (falls back to the
            // theme rule) rather than merely omitting the property.
            applyTextStyles(el, style) {
                if (!el || !style) return;
                el.style.fontFamily = style.fontFamily || '';
                el.style.fontSize = style.fontSize ? (typeof style.fontSize === 'number' ? style.fontSize + 'px' : style.fontSize) : '';
                el.style.color = style.color || '';
                el.style.textAlign = style.align || '';
                // Explicit fontWeight wins if set; otherwise the bold toggle switches
                // between a plain '400'/'700'.
                el.style.fontWeight = style.fontWeight || (style.bold ? '700' : '');
                el.style.fontStyle = style.italic ? 'italic' : '';
                const decorations = [];
                if (style.underline) decorations.push('underline');
                if (style.strikethrough) decorations.push('line-through');
                el.style.textDecoration = decorations.length ? decorations.join(' ') : '';
                // Unlike the other fields, uppercase is tri-state (see textStyleDefaults):
                // null means "inherit the theme's own text-transform", but false must
                // still force 'none' - otherwise unchecking the toolbar's Uppercase
                // toggle on a theme whose title/body is uppercase by default (e.g.
                // Bold Signal) would have no visible effect, since clearing the inline
                // override just lets that same theme rule win again.
                el.style.textTransform = style.uppercase === true ? 'uppercase' : style.uppercase === false ? 'none' : '';

                // Free-position/size override (move/resize handles below). Only ever
                // set once the user has dragged/resized this element at least once -
                // see promoteToFreeform() - so an untouched slide never gets a stray
                // position:absolute and renders pixel-identical to before this existed.
                // max-width is cleared alongside it since most themes cap .slide-body's
                // width, which would otherwise silently defeat a widen-past-default resize.
                if (style.x !== null && style.y !== null && style.width !== null && style.height !== null) {
                    el.style.position = 'absolute';
                    el.style.left = style.x + 'px';
                    el.style.top = style.y + 'px';
                    el.style.width = style.width + 'px';
                    el.style.height = style.height + 'px';
                    el.style.maxWidth = 'none';
                } else {
                    el.style.position = '';
                    el.style.left = '';
                    el.style.top = '';
                    el.style.width = '';
                    el.style.height = '';
                    el.style.maxWidth = '';
                }
            }

            // Copies a title/body element's text and rendered style out into the
            // widget system as an independent, movable/deletable text widget -
            // see the 'text-structural' comment above deleteTextElement for why
            // this is "duplicate" for a fixed title/body slot instead of a second
            // copy of the slot itself. Falls back to the element's computed style
            // for any field textStyles never overrode (fontFamily/fontSize/
            // fontWeight/color/align - the only nullable textStyleDefaults()
            // fields), so an unstyled title still duplicates looking like itself.
            duplicateTextAsWidget(el, slideId, field) {
                if (!el || !window.widgetManager) return;
                const slide = el.closest('.slide');
                if (!slide) return;
                const scale = window.widgetManager.getStageScale();
                const slideRect = slide.getBoundingClientRect();
                const rect = el.getBoundingClientRect();
                const style = this.getTextStyle(slideId, field);
                const computed = window.getComputedStyle(el);
                window.widgetManager.addTextWidgetFrom(slideId, {
                    text: el.innerText,
                    x: Math.max(0, (rect.left - slideRect.left) / scale + 24),
                    y: Math.max(0, (rect.top - slideRect.top) / scale + 24),
                    width: rect.width / scale,
                    height: rect.height / scale,
                    fontFamily: style.fontFamily || computed.fontFamily || '',
                    fontSize: style.fontSize || parseFloat(computed.fontSize) || 32,
                    fontWeight: style.fontWeight || (style.bold ? '700' : computed.fontWeight) || '600',
                    color: style.color || computed.color || '#ffffff',
                    align: style.align || computed.textAlign || 'left',
                    bold: !!style.bold,
                    italic: !!style.italic,
                    underline: !!style.underline,
                    strikethrough: !!style.strikethrough,
                    uppercase: !!style.uppercase
                });
            }

            // Removes a title/body element from its slide entirely (as opposed to
            // just clearing its text) - the user-facing "Delete" action in the
            // context menu. Structural, like SlideManager.detachNode/attachNode
            // and WidgetManager.attachWidget/detachWidget, so it goes through the
            // same 'text-structural' undo/redo entry kind (see HistoryManager.apply)
            // rather than the 'text-field' before/after-text kind used for normal
            // editing.
            deleteTextElement(el, slideId, field) {
                if (!el || !el.parentNode) return;
                const entry = {
                    kind: 'text-structural',
                    op: 'delete',
                    node: el,
                    parent: el.parentNode,
                    nextSibling: el.nextSibling,
                    handles: el._textHandles,
                    slideId: slideId,
                    field: field
                };
                this.detachTextElement(entry);
                window.historyManager.push(entry);
            }

            attachTextElement(entry) {
                const beforeSibling = entry.nextSibling && entry.nextSibling.parentNode === entry.parent ? entry.nextSibling : null;
                if (beforeSibling) entry.parent.insertBefore(entry.node, beforeSibling);
                else entry.parent.appendChild(entry.node);
                if (this.editableElements.indexOf(entry.node) === -1) this.editableElements.push(entry.node);
                if (entry.handles) {
                    entry.handles.parent.appendChild(entry.handles.moveHandle);
                    entry.handles.parent.appendChild(entry.handles.resizeHandle);
                }
                if (window.thumbnailManager) window.thumbnailManager.refresh(entry.slideId);
                scheduleSave();
            }

            detachTextElement(entry) {
                if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
                const idx = this.editableElements.indexOf(entry.node);
                if (idx !== -1) this.editableElements.splice(idx, 1);
                if (entry.handles) {
                    if (entry.handles.moveHandle.parentNode) entry.handles.moveHandle.parentNode.removeChild(entry.handles.moveHandle);
                    if (entry.handles.resizeHandle.parentNode) entry.handles.resizeHandle.parentNode.removeChild(entry.handles.resizeHandle);
                }
                if (window.thumbnailManager) window.thumbnailManager.refresh(entry.slideId);
                scheduleSave();
            }

            restoreTextStyleSnapshot(slideId, field, style) {
                if (!this.textStyles[slideId]) this.textStyles[slideId] = { title: textStyleDefaults(), body: textStyleDefaults() };
                this.textStyles[slideId][field] = Object.assign(textStyleDefaults(), style);
                const slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + slideId + '"]');
                const el = slideEl && slideEl.querySelector(field === 'title' ? '.slide-title' : '.slide-body');
                if (!el) return;
                this.applyTextStyles(el, this.textStyles[slideId][field]);
                this.persistTextEdit(slideId, field, el.innerText, this.textStyles[slideId][field]);
            }

            // ==== Title/body free-position drag/resize handles ====
            // Same interaction WidgetManager already implements for .slide-widget
            // (see attachDrag/attachResize), reused here for .slide-title/.slide-body.
            // A move handle and a resize handle are built once per element (not
            // per-focus) and appended into el.offsetParent - the same positioned
            // ancestor promoteToFreeform() measures against - as absolutely
            // positioned siblings kept in sync with el's box on every focus/drag/
            // resize tick, since these elements have no wrapper of their own to hang
            // widget-style negative-offset child handles off of.
            createTextHandles(el) {
                // Anchored to .slide, same stable reference promoteToFreeform uses -
                // NOT el.offsetParent, which can be a shrink-to-fit container that
                // resizes/shifts once the element it's measuring is promoted out of
                // its flow (see promoteToFreeform's comment for the full story).
                const parent = el.closest('.slide') || document.getElementById('deckStage');

                const moveHandle = document.createElement('div');
                moveHandle.className = 'text-move-handle';
                moveHandle.innerHTML = TEXT_MOVE_ICON;
                moveHandle.title = 'Drag to move';
                // Back-reference so the contextmenu handler can resolve a
                // right-click landing on the handle itself (a sibling of el, not
                // a descendant - closest('.slide-title, .slide-body') alone can't
                // find el from here) back to the text element it belongs to.
                moveHandle._textOwner = el;
                parent.appendChild(moveHandle);

                // Reuses .widget-resize-handle as-is for the exact same bottom-right
                // circular handle styling as widgets; .text-resize-handle is just a
                // marker class for the mode-present guard in TEXT_HANDLES_CSS.
                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'widget-resize-handle text-resize-handle';
                resizeHandle.title = 'Drag to resize';
                resizeHandle._textOwner = el;
                parent.appendChild(resizeHandle);

                const handles = { moveHandle: moveHandle, resizeHandle: resizeHandle, parent: parent };
                this.attachTextDrag(el, handles);
                this.attachTextResize(el, handles);
                return handles;
            }

            // Mirrors el's current rendered box (whether still in flow or already
            // promoted) in the same .slide-relative units promoteToFreeform uses, so
            // the handles track el exactly regardless of promotion state.
            positionTextHandles(el, handles) {
                const parent = handles.parent;
                const parentRect = parent.getBoundingClientRect();
                const scale = window.widgetManager.getStageScale();
                const rect = el.getBoundingClientRect();
                const x = (rect.left - parentRect.left) / scale;
                const y = (rect.top - parentRect.top) / scale;
                const w = rect.width / scale;
                const h = rect.height / scale;
                handles.moveHandle.style.left = (x - 14) + 'px';
                handles.moveHandle.style.top = (y - 14) + 'px';
                handles.resizeHandle.style.left = (x + w - 8) + 'px';
                handles.resizeHandle.style.top = (y + h - 8) + 'px';
            }

            showTextHandles(el, handles) {
                if (document.body.classList.contains('mode-present')) return;
                this.positionTextHandles(el, handles);
                handles.moveHandle.style.display = 'flex';
                handles.resizeHandle.style.display = 'flex';
            }

            hideTextHandles(handles) {
                handles.moveHandle.style.display = '';
                handles.resizeHandle.style.display = '';
            }

            // pointerdown calls preventDefault() so pressing the handle never blurs
            // the still-focused contenteditable title/body underneath it - otherwise
            // the blur handler in setupTextHistory() would hide these handles out
            // from under the very click meant to start dragging them.
            attachTextDrag(el, handles) {
                const self = this;
                handles.moveHandle.addEventListener('pointerdown', (e) => {
                    if (!self.isActive) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const slide = el.closest('.slide');
                    const slideId = slide.getAttribute('data-slide-id');
                    const field = el.classList.contains('slide-title') ? 'title' : 'body';
                    const style = promoteToFreeform(el, slideId, field);
                    self.applyTextStyles(el, style);
                    self.positionTextHandles(el, handles);
                    window.historyManager.begin({ kind: 'text-style', slideId: slideId, field: field, before: Object.assign({}, style) });
                    window.smartGuides.cacheTargets(slide, el);

                    let dragging = true;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startSX = style.x;
                    const startSY = style.y;
                    handles.moveHandle.setPointerCapture(e.pointerId);

                    const onMove = (ev) => {
                        if (!dragging) return;
                        const scale = window.widgetManager.getStageScale();
                        const dx = (ev.clientX - startX) / scale;
                        const dy = (ev.clientY - startY) / scale;
                        style.x = Math.max(0, Math.min(1920 - style.width, startSX + dx));
                        style.y = Math.max(0, Math.min(1080 - style.height, startSY + dy));
                        const snapped = window.smartGuides.check({ x: style.x, y: style.y, width: style.width, height: style.height }, scale);
                        style.x = snapped.x;
                        style.y = snapped.y;
                        window.smartGuides.showGuides(snapped.guideX, snapped.guideY, slide);
                        self.applyTextStyles(el, style);
                        self.positionTextHandles(el, handles);
                    };
                    const onUp = () => {
                        if (!dragging) return;
                        dragging = false;
                        window.smartGuides.hideGuides();
                        handles.moveHandle.removeEventListener('pointermove', onMove);
                        handles.moveHandle.removeEventListener('pointerup', onUp);
                        handles.moveHandle.removeEventListener('pointercancel', onUp);
                        window.historyManager.commit({ after: Object.assign({}, style) });
                        self.persistTextEdit(slideId, field, el.innerText, style);
                        if (window.thumbnailManager) window.thumbnailManager.refresh(slideId);
                    };
                    handles.moveHandle.addEventListener('pointermove', onMove);
                    handles.moveHandle.addEventListener('pointerup', onUp);
                    handles.moveHandle.addEventListener('pointercancel', onUp);
                });
            }

            attachTextResize(el, handles) {
                const self = this;
                handles.resizeHandle.addEventListener('pointerdown', (e) => {
                    if (!self.isActive) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const slide = el.closest('.slide');
                    const slideId = slide.getAttribute('data-slide-id');
                    const field = el.classList.contains('slide-title') ? 'title' : 'body';
                    const style = promoteToFreeform(el, slideId, field);
                    self.applyTextStyles(el, style);
                    self.positionTextHandles(el, handles);
                    window.historyManager.begin({ kind: 'text-style', slideId: slideId, field: field, before: Object.assign({}, style) });

                    let resizing = true;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startW = style.width;
                    const startH = style.height;
                    handles.resizeHandle.setPointerCapture(e.pointerId);

                    const onMove = (ev) => {
                        if (!resizing) return;
                        const scale = window.widgetManager.getStageScale();
                        const dx = (ev.clientX - startX) / scale;
                        const dy = (ev.clientY - startY) / scale;
                        style.width = Math.max(40, startW + dx);
                        style.height = Math.max(30, startH + dy);
                        self.applyTextStyles(el, style);
                        self.positionTextHandles(el, handles);
                    };
                    const onUp = () => {
                        if (!resizing) return;
                        resizing = false;
                        handles.resizeHandle.removeEventListener('pointermove', onMove);
                        handles.resizeHandle.removeEventListener('pointerup', onUp);
                        handles.resizeHandle.removeEventListener('pointercancel', onUp);
                        window.historyManager.commit({ after: Object.assign({}, style) });
                        self.persistTextEdit(slideId, field, el.innerText, style);
                        if (window.thumbnailManager) window.thumbnailManager.refresh(slideId);
                    };
                    handles.resizeHandle.addEventListener('pointermove', onMove);
                    handles.resizeHandle.addEventListener('pointerup', onUp);
                    handles.resizeHandle.addEventListener('pointercancel', onUp);
                });
            }

            setupHoverControls() {
                let hideTimeout = null;

                const showBtn = () => {
                    clearTimeout(hideTimeout);
                    this.editToggle.classList.add('show');
                };

                const hideBtn = () => {
                    hideTimeout = setTimeout(() => {
                        if (!this.isActive) this.editToggle.classList.remove('show');
                    }, 400);
                };

                this.hotzone.addEventListener('mouseenter', showBtn);
                this.hotzone.addEventListener('mouseleave', hideBtn);
                this.editToggle.addEventListener('mouseenter', showBtn);
                this.editToggle.addEventListener('mouseleave', hideBtn);

                this.editToggle.addEventListener('click', () => this.toggleEditMode());
                this.hotzone.addEventListener('click', () => this.toggleEditMode());
            }

            setupKeyboardTrigger() {
                document.addEventListener('keydown', (e) => {
                    if ((e.key === 'e' || e.key === 'E') && !e.target.getAttribute('contenteditable')) {
                        e.preventDefault();
                        this.toggleEditMode();
                    }
                });
            }

            // Wired once (not per-toggle, unlike the old blur-only version) so repeated
            // edit-mode toggles never accumulate duplicate listeners, which would double
            // -push history entries and double-write storage.
            setupTextHistory() {
                this.editableElements.forEach(el => this.bindElement(el));
            }

            // Body of setupTextHistory's per-element wiring, split out so that
            // registerElement() (used when a slide is duplicated) can bind a
            // freshly-cloned title/body element the same way without duplicating
            // this logic.
            bindElement(el) {
                const handles = this.createTextHandles(el);
                // Stashed on the element itself (rather than a side map) so
                // deleteTextElement/attachTextElement/detachTextElement can move
                // this element's handles along with it without needing their own
                // lookup - createTextHandles is only ever called once per element.
                el._textHandles = handles;
                el.addEventListener('focus', () => {
                    if (!this.isActive) return;
                    const slide = el.closest('.slide');
                    const slideId = slide.getAttribute('data-slide-id');
                    const field = el.classList.contains('slide-title') ? 'title' : 'body';
                    window.historyManager.begin({
                        kind: 'text-field',
                        slideId: slideId,
                        field: field,
                        before: el.innerText
                    });
                    if (window.floatingToolbar) window.floatingToolbar.showFor(el, field, { slideId, field });
                    this.showTextHandles(el, handles);
                });
                // Live thumbnail refresh while typing, separate from the persisted
                // history/save on blur below - debounced per-slide inside
                // ThumbnailManager.refresh so rapid keystrokes don't re-render.
                el.addEventListener('input', () => {
                    if (!this.isActive || !window.thumbnailManager) return;
                    const slide = el.closest('.slide');
                    window.thumbnailManager.refresh(slide.getAttribute('data-slide-id'));
                });
                // Deliberately does NOT touch floatingToolbar here - deciding
                // "should the format toolbar actually close" from a blur event is
                // unreliable now that its controls live in the parent document:
                // clicking one of them blurs this element the exact same way a
                // genuine click-away does (both leave this document's
                // activeElement at <body>), so there's no way to tell the two
                // apart from in here. That decision is instead made explicitly by
                // the capture-phase mousedown listener below (unambiguous - it
                // only ever fires for clicks that land inside THIS document) and
                // by the parent, which closes its own toolbar and tells this
                // document to blur/deselect via sp-toolbar-blur (see blurActive).
                el.addEventListener('blur', () => {
                    if (!this.isActive) return;
                    const slide = el.closest('.slide');
                    const slideId = slide.getAttribute('data-slide-id');
                    const field = el.classList.contains('slide-title') ? 'title' : 'body';
                    const text = el.innerText;
                    window.historyManager.commit({ after: text });
                    this.persistTextEdit(slideId, field, text, this.textStyles[slideId] && this.textStyles[slideId][field]);
                    this.hideTextHandles(handles);
                });
            }

            // Registers a title/body element that didn't exist when editableElements
            // was first built - used by duplicateSlideStyles() below for a slide
            // clone's title/body, so the copy is actually editable instead of silently
            // inert (cloneNode never carries listeners, and contenteditable is only
            // ever set on elements this class knows about).
            registerElement(el) {
                this.editableElements.push(el);
                this.bindElement(el);
                if (this.isActive) el.setAttribute('contenteditable', 'true');
            }

            // Called by SlideManager.duplicateSlide once the cloned slide node is in
            // the DOM: copies any style overrides for the source slide's title/body
            // onto the new slide id, then registers the clone's title/body elements.
            duplicateSlideStyles(oldSlideId, newEl) {
                const titleEl = newEl.querySelector('.slide-title');
                const bodyEl = newEl.querySelector('.slide-body');
                const oldStyles = this.textStyles[oldSlideId];
                if (oldStyles) {
                    const newSlideId = newEl.getAttribute('data-slide-id');
                    this.textStyles[newSlideId] = {
                        title: Object.assign({}, oldStyles.title),
                        body: Object.assign({}, oldStyles.body)
                    };
                    if (titleEl) this.applyTextStyles(titleEl, this.textStyles[newSlideId].title);
                    if (bodyEl) this.applyTextStyles(bodyEl, this.textStyles[newSlideId].body);
                }
                if (titleEl) this.registerElement(titleEl);
                if (bodyEl) this.registerElement(bodyEl);
            }

            toggleEditMode() {
                this.isActive = !this.isActive;
                this.editToggle.classList.toggle('active', this.isActive);
                document.body.classList.toggle('edit-active', this.isActive);

                if (this.isActive) {
                    this.editableElements.forEach(el => {
                        el.setAttribute('contenteditable', 'true');
                    });
                } else {
                    this.editableElements.forEach(el => {
                        el.removeAttribute('contenteditable');
                    });
                    if (window.floatingToolbar) window.floatingToolbar.hide();
                }

                if (window.widgetManager) window.widgetManager.setEditMode(this.isActive);
                if (window.slideManager) window.slideManager.setEditMode(this.isActive);
                if (window.historyManager) window.historyManager.setEditMode(this.isActive);
                postEditorState();
            }

            // style is optional (backward compatible with the original 3-arg call
            // sites) - when provided it's persisted alongside the text so a reload
            // restores both content and per-element style overrides.
            persistTextEdit(slideId, field, text, style) {
                const storageKey = 'sermon_edit_' + window.location.pathname;
                let edits = {};
                try { edits = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (e) {}
                if (!edits[slideId]) edits[slideId] = {};
                edits[slideId][field] = text;
                if (style) edits[slideId][field + 'Style'] = style;
                try { localStorage.setItem(storageKey, JSON.stringify(edits)); } catch (e) {}

                if (window.parent && window.parent !== window) {
                    // Sent but not specially handled parent-side - the parent's source
                    // of truth going forward is the full-HTML 'request-save' message
                    // from scheduleSave(), triggered below.
                    window.parent.postMessage({
                        type: 'slide-edited',
                        slideId: slideId,
                        field: field,
                        content: text,
                        style: style || null
                    }, '*');
                }
                scheduleSave();
            }

            restoreTextSnapshot(slideId, field, text) {
                const slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + slideId + '"]');
                if (!slideEl) return;
                const el = slideEl.querySelector(field === 'title' ? '.slide-title' : '.slide-body');
                if (!el) return;
                el.innerText = text;
                this.persistTextEdit(slideId, field, text, this.textStyles[slideId] && this.textStyles[slideId][field]);
            }

            loadStoredEdits() {
                const storageKey = 'sermon_edit_' + window.location.pathname;
                let edits = null;
                try { edits = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (e) {}
                if (!edits) return;
                Object.keys(edits).forEach(slideId => {
                    const slideEl = document.querySelector('#deckStage .slide[data-slide-id="' + slideId + '"]');
                    if (!slideEl) return;
                    const entry = edits[slideId];
                    const titleEl = slideEl.querySelector('.slide-title');
                    const bodyEl = slideEl.querySelector('.slide-body');
                    if (typeof entry.title === 'string' && titleEl) titleEl.innerText = entry.title;
                    if (typeof entry.body === 'string' && bodyEl) bodyEl.innerText = entry.body;

                    const titleStyle = Object.assign(textStyleDefaults(), entry.titleStyle || {});
                    const bodyStyle = Object.assign(textStyleDefaults(), entry.bodyStyle || {});
                    this.textStyles[slideId] = { title: titleStyle, body: bodyStyle };
                    if (titleEl) this.applyTextStyles(titleEl, titleStyle);
                    if (bodyEl) this.applyTextStyles(bodyEl, bodyStyle);
                });
            }
        }

        ${SLIDE_SYSTEM_JS}

        ${HISTORY_SYSTEM_JS}

        ${WIDGET_SYSTEM_JS}

        ${FILMSTRIP_SYSTEM_JS}

        ${TOOLBAR_SYSTEM_JS}

        ${CONTEXT_MENU_JS}

        ${SMART_GUIDES_JS}

        // ==== Editor/Present mode bootstrap ====
        // --dock-offset shifts the left-docked toolbar buttons (see WIDGET_SYSTEM_CSS)
        // clear of the 200px filmstrip whenever it's on screen.
        function updateDockOffset() {
            var isEdit = document.body.classList.contains('mode-edit');
            document.documentElement.style.setProperty('--dock-offset', isEdit ? '220px' : '20px');
        }

        // Single entry point for both the initial ?editorMode= URL param and the
        // live { type: 'set-mode' } postMessage from the parent - both funnel
        // through here so the two paths can never drift apart.
        function applyMode(mode) {
            mode = (mode === 'edit' || mode === 'present') ? mode : 'edit';
            document.body.classList.remove('mode-edit', 'mode-present');
            document.body.classList.add('mode-' + mode);
            updateDockOffset();

            var isEdit = mode === 'edit';
            if (window.editorController) {
                // Reuses the InlineEditor's own on/off mechanism (the same one the
                // pencil-icon button calls) instead of re-implementing contentEditable
                // toggling here - this also cascades to widgetManager/slideManager/
                // historyManager.setEditMode() and hides the floating toolbar, exactly
                // as a manual click would.
                if (isEdit && !window.editorController.isActive) window.editorController.toggleEditMode();
                if (!isEdit && window.editorController.isActive) window.editorController.toggleEditMode();
            }

            if (isEdit) {
                if (!window.thumbnailManager) {
                    window.thumbnailManager = new ThumbnailManager();
                } else {
                    window.thumbnailManager.show();
                }
            } else {
                if (window.thumbnailManager) window.thumbnailManager.hide();
                if (window.floatingToolbar) window.floatingToolbar.hide();
            }

            if (window.presentationController && window.presentationController.scale) {
                window.presentationController.scale();
            }
        }

        // Order matters: SlideManager must finish replaying any stored slide
        // structure into the DOM before SlidePresentation snapshots the slide
        // list, and historyManager must exist before widgetManager/editorController
        // are constructed since their setup code can reference it.
        window.slideManager = new SlideManager();
        window.presentationController = new SlidePresentation();
        window.historyManager = new HistoryManager();
        window.widgetManager = new WidgetManager();
        window.editorController = new InlineEditor();
        window.floatingToolbar = new FloatingToolbar();
        window.contextMenu = new ContextMenu();
        window.smartGuides = new SmartGuides();

        // Escape closes the formatting toolbar when focus is still inside this
        // iframe (a title/body field or a selected text widget) - the mirror
        // case, Escape while focus is in the parent's own toolbar controls, is
        // handled on the parent side and arrives here as sp-toolbar-blur.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (window.floatingToolbar) window.floatingToolbar.blurActive();
        });

        // Closes the formatting toolbar on a genuine click elsewhere in THIS
        // document while a title/body field is being edited (a click on a text
        // widget is instead handled by WidgetManager's own click listener, which
        // already does the equivalent target-containment check against the
        // whole widget, not just its text element). Deliberately keyed off the
        // click's target rather than the resulting blur/focus state - unlike
        // blur, a click target is unambiguous even now that the toolbar's own
        // controls live in the parent document (see the note on bindElement's
        // blur handler): this listener simply never fires for a click that
        // lands there, since it's a different document entirely. Capture phase
        // so it runs before the click's own default focus-shifting.
        document.addEventListener('mousedown', function (e) {
            if (!window.floatingToolbar) return;
            var kind = window.floatingToolbar.currentKind;
            if (kind !== 'title' && kind !== 'body') return;
            var target = window.floatingToolbar.currentTarget;
            if (!target || target.contains(e.target)) return;
            window.floatingToolbar.blurActive();
        }, true);

        (function initEditorMode() {
            var requested = new URLSearchParams(window.location.search).get('editorMode');
            var mode = (requested === 'edit' || requested === 'present') ? requested : 'edit';
            applyMode(mode);
            postEditorState();
        })();
    </script>
</body>
</html>
`;
}
