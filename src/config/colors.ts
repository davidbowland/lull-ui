// The "Bench" palette. Ash grounds, one madder accent, and a dark instrument floor.
//
// Chosen by a full redesign run and audited before it landed: a pairwise CIEDE2000
// matrix over every candidate palette put the nearest chromatic neighbor at dE 12.4,
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
//   light  tileGreen   #2F6146 on plate  #EBE9E6   5.937:1   onAccent  #F5F3F1 on it   6.499:1
//   light  tilePurple  #5A3A72 on plate  #EBE9E6   7.591:1   onAccent  #F5F3F1 on it   8.311:1
//   light  tileYellow  #7A5A12 on plate  #EBE9E6   5.254:1   onAccent  #F5F3F1 on it   5.752:1
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
//   dark   tileGreen   #7FBB96 on plate  #201E1F   7.460:1   onAccent  #191718 on it   8.029:1
//   dark   tilePurple  #AF87C9 on plate  #201E1F   5.629:1   onAccent  #191718 on it   6.059:1
//   dark   tileYellow  #D6B25C on plate  #201E1F   8.195:1   onAccent  #191718 on it   8.820:1
//
// The CIEDE2000 audit HAS now been re-run against the three tile fills, and it found one hit.
//
// Five of the six cleared on the first pass. The sixth did not: dark `tilePurple`, then #B898D8,
// sat at dE 8.2 from the banned Calm-Twilight lavender #C7B6F5 -- inside the header's own ">10 from
// every banned reference palette" line, and by the largest margin any value in this file has ever
// missed it by. The two colors differ almost entirely in lightness (L* 67.7 against 77.4) at nearly
// the same hue and chroma, which is exactly the near-neighbor the pairwise matrix exists to catch
// and exactly the one an eye picking swatches does not.
//
// It moved to #AF87C9: the same purple, deepened. L* 62.2, hue 314 against 311, chroma 40 against
// 37. That is dE 4.9 from the old value -- small enough that nobody who saw the first board would
// call it a different color -- and dE 13.0 from the lavender, which clears the ban-list bar and the
// 12.4 closest-chromatic-pair figure both. The frontier here is a straight line with no knee, one
// point of margin for one point of movement and about 0.2 of contrast, so the stopping point is the
// stated bar plus working room rather than a maximum.
//
// The escape did NOT go toward magenta, though a maximizer sent there first: hue-shifting runs the
// value at this palette's one madder accent, and chroma-maximizing lands on a neon that clears
// every gate and is not this palette. Deepening was the move that kept the design intact, and it
// costs contrast -- 5.629:1 on plate, down from 6.726 -- which is why the ledger line above changed
// too. Still AA on both pairs, and the letter drawn on the tile is the pair that has to be.
//
// Every other tile pair clears with room. The next-nearest chromatic to the new value is `muted` at
// dE 22.3, and the two colors this one has to be told apart FROM -- tileGreen and tileYellow -- sit
// at 38.1 and 50.2. Neutrals are exempt, on the same satisfiability argument the original audit
// made and printed rather than hid.
//
// WHAT STILL IS NOT ENFORCED, said plainly because the paragraph above reads like it is: the WCAG
// ratios in this file are measured by contrast.test.ts on every run, and these dE figures are not.
// There is no CIEDE2000 in src/, so nothing fails when a future palette edit walks a value back
// into a banned neighborhood -- which is the drift the "makes these numbers a lie" line at the top
// of this file names, applied to the other half of the audit. Building it is a real option and the
// reason it was not taken here is scope, not doubt.

export interface Palette {
  // The one filled control, the you-are-here pip, and the selected square. Nothing else.
  accent: string
  // The instrument ground. Every bench's bottom 228px sits on this, which is what makes
  // four different instruments read as one address.
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
  // The three MARKED-TILE fills on the guess bench, and the only chromatic values in this palette
  // besides the accent. Scoped to one component and drawn on no other surface. The letter on all
  // three is `onAccent` in both themes, which is why this is three keys and not six; the GRAY tile
  // takes no token at all -- plate ground, muted ink, and a `rule` border, because a plate-on-plate
  // tile has no boundary and `hair` is forbidden from drawing one.
  //
  // Color is NOT a channel on its own here. Green and yellow sit at 6.499 and 5.752 against the
  // same ink in light, close enough in luminance that a deuteranope sees two similar dark fills, so
  // the load-bearing visual channel is the segmented bar the board draws under each letter and
  // these are the redundancy.
  //
  // THE BAR TAKES NO TOKEN OF ITS OWN. It is drawn in `currentColor`, so inside a marked tile it is
  // `onAccent` -- the same pair as the letter, asserted above -- and in the board's legend, which
  // draws the identical bars on the plate to teach the mnemonic, it is `muted`. That second pair is
  // asserted as a boundary in contrast.test.ts. Painting the bar `onAccent` outright is the edit
  // this note exists to stop: it reads correct, and it makes the legend 1.095:1.
  tileGreen: string
  tilePurple: string
  tileYellow: string
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
  tileGreen: '#2f6146',
  tilePurple: '#5a3a72',
  tileYellow: '#7a5a12',
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
  tileGreen: '#7fbb96',
  // Deepened out of the banned Calm-Twilight lavender. See the CIEDE2000 note in the header.
  tilePurple: '#af87c9',
  tileYellow: '#d6b25c',
}

// The manifest's theme_color and background_color, and the <meta name="theme-color">
// in _document.tsx. One value, not a pair: Android paints the splash screen from it
// before any stylesheet exists, so it cannot react to a media query.
export const THEME_COLOR = DARK.ground
