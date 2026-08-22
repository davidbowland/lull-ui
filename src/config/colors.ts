// The "Bench" palette. Ash grounds, one madder accent, and a dark instrument floor.
//
// Chosen by a full redesign run and audited before it landed: a pairwise CIEDE2000
// matrix over every candidate palette put the nearest chromatic neighbour at dE 12.4,
// and every banned reference palette -- the newsprint red, the habit-app terracotta,
// the phosphor green, the acid chartreuse escape -- clears by more than dE 10. See
// docs/design/design-assignments.md for the ledger.
//
// Every ratio below is MEASURED by src/config/contrast.test.ts, which fails the build
// if an edit drops a pair under AA. Changing a value here without running that test
// makes these numbers a lie.
//
// Two rules the palette encodes structurally:
//
//   `rule` is the LOAD-BEARING boundary and is held to 3:1 (WCAG 1.4.11). Every outline
//   that identifies a control or its state is drawn with it.
//
//   `hair` is DECORATIVE -- section separators and the outer bezel of a nested
//   enclosure -- and is deliberately absent from the contrast test. It must never draw a
//   boundary that carries state. The audit that produced this palette caught exactly
//   that drift in another direction, where a decorative hairline had quietly become the
//   thing a state ladder was read from, at 2.19:1.
//
// Ratios (WCAG 2.1, computed by src/config/contrast.ts):
//
//   light  ink         #201D1E on ground #DCD8D3  11.789:1   on plate  13.799:1   on raised 15.107:1
//   light  muted       #56504F on ground #DCD8D3   5.574:1   on plate   6.525:1   on raised  7.143:1
//   light  accent      #8E3438 on ground #DCD8D3   5.487:1   on plate   6.422:1   on raised  7.031:1
//   light  onAccent    #F5F3F1 on accent #8E3438   7.031:1
//   light  rule        #7A7371 on ground #DCD8D3   3.277:1   on plate   3.836:1   on raised  4.199:1
//   light  floorInk    #F2EFEC on floor  #2A2628  13.036:1
//   light  floorMuted  #B4ADAA on floor  #2A2628   6.754:1
//   light  floorAccent #E7A0A2 on floor  #2A2628   7.074:1
//   light  floorRule   #7C7476 on floor  #2A2628   3.283:1
//
//   dark   ink         #EEE9E6 on ground #191718  14.811:1   on plate  13.761:1   on raised 12.445:1
//   dark   muted       #A79F9D on ground #191718   6.872:1   on plate   6.385:1   on raised  5.775:1
//   dark   accent      #E7A0A2 on ground #191718   8.451:1   on plate   7.852:1   on raised  7.101:1
//   dark   onAccent    #191718 on accent #E7A0A2   8.451:1
//   dark   rule        #7C7476 on ground #191718   3.922:1   on plate   3.644:1   on raised  3.296:1
//   dark   floorInk    #EEE9E6 on floor  #141314  15.387:1
//   dark   floorMuted  #A79F9D on floor  #141314   7.140:1
//   dark   floorAccent #E7A0A2 on floor  #141314   8.780:1
//   dark   floorRule   #6E686A on floor  #141314   3.399:1

export interface Palette {
  // The one filled control, the you-are-here pip, and the selected square. Nothing else.
  accent: string
  // The instrument ground. Every bench's bottom 228px sits on this, which is what makes
  // three different instruments read as one address.
  floor: string
  floorAccent: string
  floorInk: string
  floorMuted: string
  floorRule: string
  ground: string
  // DECORATIVE ONLY. Never a boundary that identifies a control or its state.
  hair: string
  ink: string
  muted: string
  onAccent: string
  plate: string
  raised: string
  // The load-bearing boundary, held to 3:1.
  rule: string
}

export const LIGHT: Palette = {
  accent: '#8e3438',
  floor: '#2a2628',
  floorAccent: '#e7a0a2',
  floorInk: '#f2efec',
  floorMuted: '#b4adaa',
  floorRule: '#7c7476',
  ground: '#dcd8d3',
  hair: '#c9c3bd',
  ink: '#201d1e',
  muted: '#56504f',
  onAccent: '#f5f3f1',
  plate: '#ebe9e6',
  raised: '#f5f3f1',
  rule: '#7a7371',
}

export const DARK: Palette = {
  accent: '#e7a0a2',
  floor: '#141314',
  floorAccent: '#e7a0a2',
  floorInk: '#eee9e6',
  floorMuted: '#a79f9d',
  floorRule: '#6e686a',
  ground: '#191718',
  hair: '#3b3638',
  ink: '#eee9e6',
  muted: '#a79f9d',
  onAccent: '#191718',
  plate: '#201e1f',
  raised: '#292627',
  rule: '#7c7476',
}

// The manifest's theme_color and background_color, and the <meta name="theme-color">
// in _document.tsx. One value, not a pair: Android paints the splash screen from it
// before any stylesheet exists, so it cannot react to a media query.
export const THEME_COLOR = DARK.ground
