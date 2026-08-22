/**
 * Core Business Rule: Slide Separation
 * 
 * 1. Any text separated by one or more blank lines must be treated as a new slide.
 * 2. Text that appears together without a blank line belongs to the same slide.
 * 3. A blank line indicates the end of the current slide and the beginning of a new slide.
 * 4. Do not merge content across blank lines.
 * 5. Do not split content that is not separated by a blank line.
 * 
 * The title of a presentation is whatever content appears on slide 1 (order_index = 0).
 */
export function parseSermonNotes(rawNotes: string): string[] {
  if (!rawNotes) return [];

  // Normalize line endings cross-platform
  const normalized = rawNotes.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split by one or more blank lines (lines containing only whitespace)
  const blocks = normalized.split(/\n\s*\n/);

  return blocks
    .map(block => block.trim())
    .filter(block => block.length > 0);
}

/**
 * Extracts the title from the first slide content.
 * If the first slide has multiple lines, we take the first line as the title.
 */
export function getSermonTitle(slides: string[]): string {
  if (slides.length === 0) return 'Untitled Sermon';
  const firstSlide = slides[0];
  const firstLine = firstSlide.split('\n')[0].trim();
  // Strip markdown formatting if any
  return firstLine.replace(/^[#\s*_\-]+/g, '').substring(0, 100).trim() || 'Untitled Sermon';
}

/**
 * Photo cue detection.
 *
 * Preachers drop stage directions for images directly into their notes
 * ("insert photo of the empty tomb", "[Slide: baptism photo]", "pic of the
 * altar"). Each pattern below just tests whether a line contains a trigger
 * phrase; the caption itself is the line's own words (see buildPhotoCaption),
 * so "Slide: pic of a Mona Lisa" reads on the placeholder as "Pic of a Mona
 * Lisa" - a full description, not a bare noun stripped down to "a Mona Lisa".
 */
const PHOTO_CUE_DETECT_PATTERNS: RegExp[] = [
  /^\[?\s*slide\s*:/i,
  /\b(?:insert|add|drop|place|show)\s+(?:an?|the)?\s*(?:photo|picture|pic|image)s?\b/i,
  /\b(?:photo|picture|pic|image)s?\s+(?:of|for|showing)\b/i,
  /\bimage\s+here\b/i,
  /\b(?:photo|picture|pic|image)s?\s*[:\-]/i,
  // Side-by-side comparison cues ("pic on the left", "second photo on the
  // right") - a common before/after illustration where each line describes
  // one half of a two-image slide rather than using an insert/of/for verb.
  /\b(?:photo|picture|pic|image)s?\s+(?:on|to)\s+the\s+(?:left|right)\b/i,
  /\b(?:first|second|third|fourth|left|right)\s+(?:photo|picture|pic|image)\b/i,
];

// Bare trigger word with nothing else on the line ("pic", "[picture]") - no
// descriptive text to keep, so the placeholder falls back to a generic label.
const BARE_PHOTO_CUE_PATTERN = /^\[?\s*(?:photo|picture|pic|image)\s*\]?$/i;

function buildPhotoCaption(line: string): string {
  let caption = line.trim();
  // Strip pure stage-direction scaffolding - wrapping brackets, a leading
  // "Slide:" label, a leading imperative verb ("insert/add/show a/an/the") -
  // but keep the photo-noun phrase that follows ("pic of X", "photo of X")
  // so the caption reads as a complete description straight from the notes.
  caption = caption.replace(/^\[+\s*/, '').replace(/\s*\]+$/, '');
  caption = caption.replace(/^slide\s*:\s*/i, '');
  caption = caption.replace(/^(?:insert|add|drop|place|show)\s+(?:an?|the)?\s*/i, '');
  caption = caption.replace(/[\s\-:;,.]+$/g, '').trim();
  if (!caption || /^here$/i.test(caption)) return 'Photo';
  return caption.charAt(0).toUpperCase() + caption.slice(1);
}

/**
 * Returns the placeholder caption for a single note line if it contains a
 * photo trigger keyword, or null if the line is ordinary sermon text.
 */
export function extractPhotoCue(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (BARE_PHOTO_CUE_PATTERN.test(trimmed)) return 'Photo';

  const isCue = PHOTO_CUE_DETECT_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!isCue) return null;

  return buildPhotoCaption(trimmed);
}

export interface SlidePhotoCue {
  caption: string;
}

/**
 * Widget-count declarations ("two pics in one", "3 pictures", "single
 * image") are a different thing from a per-photo description line: they're
 * a meta-instruction about how many placeholders the slide should end up
 * with, not a description of any one photo. Matched separately from
 * PHOTO_CUE_DETECT_PATTERNS below so a heading like "Two pics in one" never
 * becomes a placeholder of its own - it just sets the target count that the
 * slide's real per-photo cue lines get reconciled against.
 */
const QUANTITY_WORD_VALUES: Record<string, number> = {
  one: 1, single: 1, '1': 1,
  two: 2, '2': 2,
  three: 3, '3': 3,
  four: 4, '4': 4,
};

// \s* (not \s+) between the number and the noun so "2pic"/"2pics" match
// alongside "2 pic"/"2 pics".
const QUANTITY_PATTERN = /\b(one|two|three|four|single|[1-4])\s*(pictures?|pics?|images?)\b/i;

function detectQuantity(line: string): number | null {
  const match = QUANTITY_PATTERN.exec(line);
  if (!match) return null;
  return QUANTITY_WORD_VALUES[match[1].toLowerCase()] ?? null;
}

/**
 * Scans one slide's raw note block for photo cue lines. Matched lines are
 * stage directions, not sermon text, so they're stripped from cleanedText -
 * the caller renders the caption on a photo placeholder widget instead.
 *
 * A slide may also declare an explicit widget count ("Two pics in one" as
 * the slide's heading). When present, the closest such declaration to the
 * slide's own heading (its first line) wins over any others, and the
 * per-line photo cues are reconciled against it: extra cues beyond the
 * declared count are dropped (still stripped from cleanedText - they're
 * still stage directions - just not turned into a widget), and a shortfall
 * is padded with generic, caption-less placeholders so the widget count
 * always matches what the notes asked for. With no declaration, every
 * matched line becomes its own cue, same as before - we only enforce a
 * count when the notes actually state one, never by guessing.
 */
export function extractSlidePhotoCues(slideText: string): { cleanedText: string; cues: SlidePhotoCue[] } {
  const lines = slideText.split(/\r?\n/);

  let declaredCount: number | null = null;
  let declaredCountLineIndex = -1;
  lines.forEach((line, idx) => {
    const quantity = detectQuantity(line);
    if (quantity === null) return;
    if (declaredCount === null || Math.abs(idx) < Math.abs(declaredCountLineIndex)) {
      declaredCount = quantity;
      declaredCountLineIndex = idx;
    }
  });

  const cues: SlidePhotoCue[] = [];
  const keptLines: string[] = [];

  lines.forEach((line, idx) => {
    if (idx === declaredCountLineIndex) return; // meta-instruction, not sermon text or its own cue
    const caption = extractPhotoCue(line);
    if (caption !== null) {
      cues.push({ caption });
    } else {
      keptLines.push(line);
    }
  });

  if (declaredCount !== null) {
    if (cues.length > declaredCount) {
      cues.length = declaredCount;
    } else {
      while (cues.length < declaredCount) {
        cues.push({ caption: 'Photo' });
      }
    }
  }

  return { cleanedText: keptLines.join('\n'), cues };
}
