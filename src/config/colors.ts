// PROVISIONAL PALETTE. The mark and the colours are placeholders, chosen to be
// defensible rather than designed: a warm neutral ground, one cool accent, nothing
// that carries meaning by hue alone. Expect a redesign. What must survive it is the
// contrast floor recorded below — every pair here is measured, not assumed, and
// src/config/contrast.test.ts fails the build if a later edit drops one under AA.
//
// connections-ui/src/config/colors.ts could not be copied: it is eight category
// backgrounds for a grid game, with no foreground/background pairs at all, so it
// cannot express the thing this file exists to guarantee.
//
// Ratios (WCAG 2.1, computed by src/config/contrast.ts):
//
//   light  ink        #1b1b18 on page    #f5f5f3   15.813:1
//   light  ink        #1b1b18 on surface #ffffff   17.262:1
//   light  inkMuted   #56564e on page    #f5f5f3    6.781:1
//   light  inkMuted   #56564e on surface #ffffff    7.403:1
//   light  accentInk  #ffffff on accent  #2f5d8a    6.877:1
//   light  accent     #2f5d8a on page    #f5f5f3    6.300:1
//   light  border     #8a8a82 on page    #f5f5f3    3.186:1  (non-text, 1.4.11 wants 3:1)
//   light  border     #8a8a82 on surface #ffffff    3.478:1
//
//   dark   ink        #ebeae5 on page    #111214   15.559:1
//   dark   ink        #ebeae5 on surface #1b1c1f   14.145:1
//   dark   inkMuted   #9d9d96 on page    #111214    6.869:1
//   dark   inkMuted   #9d9d96 on surface #1b1c1f    6.245:1
//   dark   accentInk  #111214 on accent  #8fbcea    9.415:1
//   dark   accent     #8fbcea on page    #111214    9.415:1
//   dark   border     #6f6f68 on page    #111214    3.703:1
//   dark   border     #6f6f68 on surface #1b1c1f    3.367:1

export interface Palette {
  // Filled control background, and the ink that reads on it.
  accent: string
  accentInk: string
  // Outline of a control, which 1.4.11 holds to 3:1 against whatever it sits on.
  border: string
  ink: string
  inkMuted: string
  page: string
  surface: string
}

export const LIGHT: Palette = {
  accent: '#2f5d8a',
  accentInk: '#ffffff',
  border: '#8a8a82',
  ink: '#1b1b18',
  inkMuted: '#56564e',
  page: '#f5f5f3',
  surface: '#ffffff',
}

export const DARK: Palette = {
  accent: '#8fbcea',
  accentInk: '#111214',
  border: '#6f6f68',
  ink: '#ebeae5',
  inkMuted: '#9d9d96',
  page: '#111214',
  surface: '#1b1c1f',
}

// The manifest's theme_color and background_color, and the <meta name="theme-color">
// in _document.tsx. One value, not a pair: Android paints the splash screen from it
// before any stylesheet exists, so it cannot react to a media query.
export const THEME_COLOR = DARK.page
