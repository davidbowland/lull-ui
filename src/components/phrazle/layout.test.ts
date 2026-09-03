import { DEFAULT_WIDTH, GUESS_GAP, LETTER_GAP, MAX_TILE, MIN_TILE, tileSize, WORD_GAP, WRAP_GAP } from './layout'

// The grid box's CONTENT width at a 390 viewport and at a 320 one, after the plate's own 16px a
// side. Measured with a ResizeObserver in the board, never derived from the viewport -- so these
// are inputs, not assumptions about a device.
const AT_390 = 358
const AT_320 = 288

// Pinned to literals, not to the constants themselves. Every assertion below compares against
// MIN_TILE and MAX_TILE, which is self-referential: set them to 22 and 36 and the rest of this file
// still passes.
describe('the sizes themselves', () => {
  // 18, and deliberately NOT cryptogram's 24. That number is WCAG 2.5.8 Target Size (Minimum), a
  // criterion about CONTROLS, and a Phrazle tile is not one -- it is never tapped, has no handler,
  // and carries role="img". The floor here is readability, and this is the only place in the repo
  // where that distinction can ever be checked, because CLAUDE.md forbids style assertions.
  it('floors a tile at the readable size rather than at a target size', () => {
    expect(MIN_TILE).toEqual(18)
  })

  // A LEGIBILITY CEILING, and it used to be a key-size one: 40 was picked to sit under the pad's
  // 44px key, because a tile the size of a key reads as a key. The pad is a QWERTY keyboard now and
  // its keys are 31.1 by 59, so a tile is neither the size nor the shape of one at any width, and
  // what holds 40 up is that past it a short phrase in a wide window draws playing cards.
  it('caps a tile at the readable size', () => {
    expect(MAX_TILE).toEqual(40)
  })

  // THE ORDERING IS THE BUG FIX, so it is pinned as arithmetic rather than left to the two literals
  // agreeing by accident. One `ROW_GAP` used to be spent on both breaks a row can take, which drew
  // a wrapped guess and a pair of guesses at exactly the same 6px -- four evenly spaced lines with
  // nothing saying which pair was one attempt. Equalizing them again is a one-character edit, and
  // this is the assertion that refuses it. CLAUDE.md forbids style assertions, so the constants are
  // the only place the relationship can be checked at all.
  it('separates one guess from the next by more than a wrapped line', () => {
    expect(GUESS_GAP).toBeGreaterThan(WRAP_GAP)
  })

  // The whole ladder in one line, and it is the mnemonic the grid is read by: letters cling into
  // words, words sit apart inside a guess, a wrapped line hangs below its own guess, and one guess
  // stands clear of the next. Break any rung and two things that mean different things start to
  // look alike.
  it('keeps the four gaps in reading order', () => {
    expect([LETTER_GAP, WRAP_GAP, GUESS_GAP, WORD_GAP]).toStrictEqual([2, 6, 8, 12])
  })

  // The board paints with this before its first ResizeObserver measurement lands, so a typo here is
  // a first paint at the wrong size on every phrase. There is no DEFAULT_HEIGHT to pin beside it:
  // height stopped being an input when the grid stopped having a fixed number of rows.
  it('guesses the grid box at a 390 viewport before it has been measured', () => {
    expect(DEFAULT_WIDTH).toEqual(358)
  })
})

describe('tileSize', () => {
  // TOE HOLD at 390: the longest word is four tiles with three interior gaps, which leaves 88px a
  // tile -- so the ceiling is what answers. Asserted rather than assumed, because "the short phrase
  // gets the biggest tile" is the claim the ceiling exists to keep true.
  it('gives the design phrase the whole ceiling at a 390 viewport', () => {
    expect(tileSize(AT_390, [3, 4])).toEqual(MAX_TILE)
  })

  // THE REGRESSION THIS FILE EXISTS TO REFUSE, and it is stated as an equality rather than as a
  // number so that it survives every future move of the ceiling, the floor and the gaps. A phrase
  // used to be sized to fit ON ONE LINE, so `PLAIN SPOKEN TRUTH` drew at 19px while `TOE HOLD` drew
  // at 40 -- the tile measured the pack rather than the board, and the phrases whose marks are
  // hardest to read were the ones drawn smallest. Three seven-letter words and one seven-letter word
  // now size identically, because seven tiles is what a line has to hold either way; the extra words
  // wrap.
  it('sizes a phrase to its longest word rather than to the whole phrase', () => {
    expect(tileSize(AT_320, [7, 7, 7])).toEqual(tileSize(AT_320, [7]))
  })

  // THE HEIGHT IS GONE, AND THESE THREE NUMBERS ARE WHAT SAYS SO. The band used to divide its
  // height by the row count, which is how a fixed six-row grid was kept whole on screen. With the
  // row count unbounded that goal is unreachable rather than merely expensive: every guess would
  // shrink every tile, and a board would grind to the 18px floor at around guess fifteen and keep
  // going. The grid scrolls instead -- .lull-board already carries `flex: 1 1 0%` and
  // `overflow-y: auto` -- so a tile's size does not depend on how many rows are above it.
  //
  // That claim cannot be asserted DIRECTLY any more, because there is no row count to vary: the
  // arity is the assertion, and it is checked by the compiler. What these rows defend instead is the
  // arithmetic that replaced it. All three sit on ONE width and land on three different answers --
  // the ceiling, a width-bound middle, and the floor -- so a height divisor smuggled back in moves
  // at least one of them.
  //
  // THE LAST TWO ARE MALFORMED PACKS RATHER THAN PUZZLES, and that is the honest reading of what
  // sizing to the longest word bought: a twelve-letter word is longer than anything the corpus
  // ships, and it still draws at 28. Every real phrase now sits at the ceiling on this width.
  it.each<[string, number[], number]>([
    ['the ceiling for the densest phrase the corpus can hold', [7, 7, 7], MAX_TILE],
    ['a width-bound size for a word longer than the corpus ships', [12], 28],
    ['the floor for a word no pack should contain', [20], MIN_TILE],
  ])('sizes from the width alone, giving %s', (_description, wordLengths, expected) => {
    expect(tileSize(AT_390, wordLengths)).toEqual(expected)
  })

  it('never grows past the ceiling for a two-letter phrase on a wide board', () => {
    expect(tileSize(1000, [2])).toEqual(MAX_TILE)
  })

  // §8.11's dense case at the narrowest supported width, and the ONE assertable half of "no
  // horizontal scroll at any width": a line has to hold seven tiles and six interior gaps in 288px,
  // which is 39 and comfortably above the floor. The other two words wrap onto their own lines. It
  // is pinned as a literal because it is the SMALLEST tile the corpus can produce on the smallest
  // device -- the number the whole change is judged on -- and 18 is what it used to be.
  it('holds a readable tile for the densest phrase at a 320 viewport', () => {
    expect(tileSize(AT_320, [7, 7, 7])).toEqual(39)
  })

  // A box that has not been laid out yet reports zero, and honoring that would size every tile to
  // a negative number the board writes straight into a px width.
  it('falls back to the floor when the box reports zero', () => {
    expect(tileSize(0, [3, 4])).toEqual(MIN_TILE)
  })

  // TWO ROWS, ONE PER ARM OF THE ONE GUARD, and they are not interchangeable. The NaN row is the
  // Math.max(18, NaN) trap: an unmeasured box yields NaN, the clamp does not rescue it, and the
  // board writes the result straight into a px width. The empty-phrase row is the division by zero
  // -- an answer that did not arrive splits to [], and 358/0 is Infinity, which Math.min(40, ...)
  // would happily return as 40 for a grid with nothing in it.
  //
  // The old third and fourth arms are GONE rather than adapted: `a height that has not been
  // measured` and `a grid with no rows` were the two heightFit failures, and heightFit no longer
  // exists. Keeping them would mean passing arguments the function does not take.
  it.each<[string, number, number[]]>([
    ['a width that has not been measured', Number.NaN, [3, 4]],
    ['a phrase with no words', AT_390, []],
  ])('falls back to the floor on %s', (_description, width, wordLengths) => {
    expect(tileSize(width, wordLengths)).toEqual(MIN_TILE)
  })
})
