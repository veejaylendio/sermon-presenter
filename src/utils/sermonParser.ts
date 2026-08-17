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
