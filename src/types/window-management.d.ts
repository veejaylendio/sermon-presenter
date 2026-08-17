export {}

declare global {
  interface Screen {
    isExtended: boolean
  }

  interface ScreenDetailed extends Screen {
    availLeft: number
    availTop: number
    left: number
    top: number
    label: string
    isPrimary: boolean
    isInternal: boolean
    devicePixelRatio: number
  }

  interface ScreenDetails extends EventTarget {
    screens: ScreenDetailed[]
    currentScreen: ScreenDetailed
  }

  interface Window {
    getScreenDetails?: () => Promise<ScreenDetails>
  }

  // Fullscreen API's multi-screen extension - requestFullscreen({ screen })
  // lets a document request fullscreen on ANY connected screen, not just the
  // one it's currently on. Requires the "window-management" permission (the
  // same one getScreenDetails() uses). This is the actual fix for presenting
  // on a non-primary monitor: a *popup* is never allowed to fullscreen itself
  // programmatically (Chrome blocks that outright, as an anti-spoofing
  // measure - a fullscreen popup could hide the address bar), but the
  // window/tab the user is already interacting with requesting fullscreen on
  // a different screen is exactly what this extension exists for.
  interface FullscreenOptions {
    screen?: ScreenDetailed
  }
}
