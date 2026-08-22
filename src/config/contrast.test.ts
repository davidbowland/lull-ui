import { DARK, LIGHT, Palette, THEME_COLOR } from './colors'
import { contrastRatio } from './contrast'

// These assertions are the WCAG AA floor the repo's own guidelines set, expressed so
// that a later colour change fails here rather than shipping.
describe('contrastRatio', () => {
  it('reports 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('reports 1:1 for a colour against itself', () => {
    expect(contrastRatio('#8e3438', '#8e3438')).toBeCloseTo(1, 5)
  })

  it('is order-independent', () => {
    expect(contrastRatio('#201d1e', '#dcd8d3')).toEqual(contrastRatio('#dcd8d3', '#201d1e'))
  })
})

// Every surface a colour is actually set on, not a representative sample. The three
// grounds are genuinely all used -- ground is the page, plate is a raised surface, and
// raised is a control face -- so a pair that passes on one and fails on another is a
// real defect and this is where it surfaces.
const TEXT_ON_SURFACE: [keyof Palette, keyof Palette][] = [
  ['ink', 'ground'],
  ['ink', 'plate'],
  ['ink', 'raised'],
  ['muted', 'ground'],
  ['muted', 'plate'],
  ['muted', 'raised'],
  ['accent', 'ground'],
  ['accent', 'plate'],
  ['accent', 'raised'],
  ['onAccent', 'accent'],
  ['floorInk', 'floor'],
  ['floorMuted', 'floor'],
  ['floorAccent', 'floor'],
]

// 1.4.11 Non-text Contrast. A control outline a player cannot see is a control they
// cannot find, which is the same failure as unreadable type one level down.
//
// `hair` is deliberately NOT in this list. It is decorative -- section separators and
// the outer bezel of a nested enclosure -- and colors.ts forbids it from ever drawing a
// boundary that identifies a control or its state. Adding it here would either fail the
// build or, worse, pass after someone lightened it and thereby licensed its use as a
// state outline. The rule is enforced by the palette's contract, not by a ratio.
const BOUNDARY_ON_SURFACE: [keyof Palette, keyof Palette][] = [
  ['rule', 'ground'],
  ['rule', 'plate'],
  ['rule', 'raised'],
  ['floorRule', 'floor'],
  // The focus ring, which is a boundary and is held to the same 3:1. The floor band is
  // dark in BOTH themes, so it takes its ring from floorAccent rather than from accent;
  // this pair is the assertion that the scoped rule in index.css has something to stand
  // on. Its absence is what let the ring sit at 1.92:1 on every instrument key in light
  // mode -- a pair a real primitive drew on a real surface, checked by nothing.
  ['floorAccent', 'floor'],
  ['rule', 'floor'],
]

// Why the floor band needs its own focus ring, asserted rather than left in a comment.
//
// In DARK the ordinary accent and the floor accent are the same value, so drawing the
// global ring on the floor happens to be fine. In LIGHT the accent is a dark madder
// chosen to read on the light grounds, and the floor is near-black in both themes -- so
// the ring lands at 1.92:1 there, under the 3:1 that 1.4.11 and 2.4.11 require, on every
// key of every bench's instrument in the theme most people use.
//
// That asymmetry is the trap: the bug is invisible if you check dark mode, and "just use
// --lull-accent everywhere" looks like a correct simplification right up until it isn't.
const FORBIDDEN_ON_LIGHT_FLOOR: (keyof Palette)[] = ['accent', 'muted']

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s palette', (_name: string, palette: Palette) => {
  it.each(TEXT_ON_SURFACE)('clears 4.5:1 for %s on %s', (ink: keyof Palette, ground: keyof Palette) => {
    expect(contrastRatio(palette[ink], palette[ground])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(BOUNDARY_ON_SURFACE)('clears 3:1 for %s on %s', (boundary: keyof Palette, ground: keyof Palette) => {
    expect(contrastRatio(palette[boundary], palette[ground])).toBeGreaterThanOrEqual(3)
  })
})

describe('the floor band', () => {
  // Documentary, and deliberately light-only: see FORBIDDEN_ON_LIGHT_FLOOR. These fail
  // loudly if someone ever "simplifies" the floor to use the ordinary accent, which reads
  // as the obvious tidy-up and is the exact regression the scoped focus rule prevents.
  it.each(FORBIDDEN_ON_LIGHT_FLOOR)('cannot draw %s on the light floor', (ink: keyof Palette) => {
    expect(contrastRatio(LIGHT[ink], LIGHT.floor)).toBeLessThan(3)
  })

  // And the token that must be used instead, in both themes, so the scoped rule has
  // something to stand on either way.
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ])('draws its focus ring from floorAccent in %s', (_name: string, palette: Palette) => {
    expect(contrastRatio(palette.floorAccent, palette.floor)).toBeGreaterThanOrEqual(3)
  })
})

describe('THEME_COLOR', () => {
  // Android paints the splash screen from this before any stylesheet exists, so it
  // cannot react to a media query and must be one of the two grounds rather than a
  // third value that matches neither.
  it('is the dark ground', () => {
    expect(THEME_COLOR).toBe(DARK.ground)
  })
})
