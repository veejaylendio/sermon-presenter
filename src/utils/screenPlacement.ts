// Wraps the Window Management API (Chromium-only, secure-context-only). Every
// caller must treat a null return as "can't enumerate displays" and fall back
// to single/unknown-monitor behavior - never assume the API exists.
export async function detectScreens(): Promise<ScreenDetailed[] | null> {
  if (typeof window === 'undefined' || typeof window.getScreenDetails !== 'function') {
    return null
  }
  try {
    const details = await window.getScreenDetails()
    return details.screens
  } catch (err) {
    // Permission denied/dismissed, or (most commonly) called without a fresh
    // enough user activation - logged rather than swallowed outright, since a
    // silent failure here looks identical to "only one monitor" to the rest
    // of the app (no dialog, presents wherever the window currently is).
    console.warn('getScreenDetails() failed - falling back to single-monitor presenting:', err)
    return null
  }
}

const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 700

// Builds the `left=,top=,width=,height=` feature string window.open() expects,
// so the popup opens already positioned/sized on the target screen - no
// blank/placeholder window, no visible jump. Falls back to a centered default
// size when the screen is unknown (API unsupported/denied).
export function windowFeaturesForScreen(screen: ScreenDetailed | null): string {
  if (!screen) {
    const left = Math.max(0, Math.round((window.screen.width - DEFAULT_WIDTH) / 2))
    const top = Math.max(0, Math.round((window.screen.height - DEFAULT_HEIGHT) / 2))
    return `left=${left},top=${top},width=${DEFAULT_WIDTH},height=${DEFAULT_HEIGHT}`
  }
  return `left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`
}

// The controller always targets the OS-reported default (primary) display,
// and must never end up on the same screen as the output - falls back to any
// other screen, and finally to the output screen itself for the genuine
// single-monitor edge case (which the caller shouldn't hit in practice, since
// presenting on the primary monitor skips the controller entirely).
export function pickControllerScreen(
  screens: ScreenDetailed[],
  outputScreen: ScreenDetailed
): ScreenDetailed {
  const others = screens.filter((s) => s !== outputScreen)
  return others.find((s) => s.isPrimary) ?? others[0] ?? outputScreen
}
