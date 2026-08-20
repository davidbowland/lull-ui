import { DEFAULT_AVAILABLE, MAX_SQUARE, MIN_SQUARE, squareSize } from './layout'

// The two widths the spec works through: the phrase box's CONTENT width at a 390 viewport and at a
// 320 one, after the page's px-4 and the box's own px-3. Measured with a ResizeObserver in the
// board, never derived from the viewport -- so these are inputs, not assumptions about a device.
const AT_390 = 334
const AT_320 = 264

// Pinned to literals, not to the constants themselves. Every assertion below compares against
// MIN_SQUARE and MAX_SQUARE, which is self-referential: set them to 26 and 36 and the whole file
// still passes. 24 carries an explicit accessibility claim -- WCAG 2.5.8 Target Size (Minimum),
// the AA criterion this app is held to -- and since CLAUDE.md forbids style assertions, this pure
// function is the only place in the repo where that number can ever be checked.
describe('the sizes themselves', () => {
  it('floors a square at the AA target size', () => {
    expect(MIN_SQUARE).toEqual(24)
  })

  it('caps a square at the size the keypad keys use', () => {
    expect(MAX_SQUARE).toEqual(44)
  })

  // The board paints with this before its first ResizeObserver measurement lands, so a typo here
  // is a first paint at the wrong size on every phrase.
  it('guesses the phrase box at a 390 viewport before it has been measured', () => {
    expect(DEFAULT_AVAILABLE).toEqual(334)
  })
})

describe('squareSize', () => {
  // A wrapped word reads as two words, so the whole phrase computes ONE size, large enough that the
  // longest word fits on one line. Sized off the longest word only: a phrase of many short words
  // gets large squares and more rows, and scrolls. That is deliberate -- shrinking a whole phrase to
  // avoid a scroll that already works costs legibility for nothing.
  it.each([
    [9, 35],
    [10, 31],
    [12, 26],
    [13, MIN_SQUARE],
  ])('fits a %i-letter word at a 390 viewport in %ipx squares', (longest, expected) => {
    expect(squareSize(AT_390, longest)).toEqual(expected)
  })

  it.each([
    [9, 27],
    [10, MIN_SQUARE],
    [12, MIN_SQUARE],
    [13, MIN_SQUARE],
  ])('fits a %i-letter word at a 320 viewport in %ipx squares', (longest, expected) => {
    expect(squareSize(AT_320, longest)).toEqual(expected)
  })

  // NECESSITY is the nine-letter case the spec calls out: it never wraps at either width.
  it('keeps a nine-letter word above the floor at both widths', () => {
    expect(squareSize(AT_390, 9)).toBeGreaterThan(MIN_SQUARE)
    expect(squareSize(AT_320, 9)).toBeGreaterThan(MIN_SQUARE)
  })

  // 24x24 is WCAG 2.5.8 Target Size (Minimum), the AA criterion -- not a guess, and not the 44x44 of
  // 2.5.5, which is AAA. Below the floor the word wraps instead; the square never shrinks further.
  it('never goes below the AA target-size floor', () => {
    expect(squareSize(AT_320, 40)).toEqual(MIN_SQUARE)
  })

  // A short phrase in a wide box would otherwise produce squares the size of playing cards.
  it('never grows past the ceiling', () => {
    expect(squareSize(1000, 3)).toEqual(MAX_SQUARE)
  })

  // A single-letter word has no interior gap to subtract, so `longest - 1` must be 0 rather than a
  // negative width silently added back.
  it('handles a one-letter word', () => {
    expect(squareSize(AT_390, 1)).toEqual(MAX_SQUARE)
  })

  // The box has no width before its first measurement, and a negative here would render every
  // square at whatever a bad calc() evaluates to.
  it('falls back to the floor when the box has not been measured yet', () => {
    expect(squareSize(0, 9)).toEqual(MIN_SQUARE)
  })

  // A NaN is NOT rescued by the clamp -- Math.max(24, NaN) is NaN and so is Math.min(44, NaN) --
  // so it needs its own guard, or a width that arrived as NaN sizes every square to `NaNpx` and
  // the whole phrase collapses to whatever a bad calc() evaluates to.
  it('falls back to the floor on a width that is not a number', () => {
    expect(squareSize(Number.NaN, 9)).toEqual(MIN_SQUARE)
  })

  // A word of no letters cannot happen -- the board filters empty words and floors `longest` at 1
  // -- but the division by zero it would produce is Infinity, which the clamp turns into a 44px
  // square for a word that is not there rather than into an error anyone would see.
  it('falls back to the floor on a word of no letters', () => {
    expect(squareSize(AT_390, 0)).toEqual(MIN_SQUARE)
  })
})
