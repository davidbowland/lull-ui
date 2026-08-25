import { DEFAULT_WIDTH, MAX_TILE, MIN_TILE, tileSize } from './layout'

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

  // Below the 44px keypad key on purpose: a tile the size of a key reads as a key, and the one
  // thing this bench must not teach is that a tile can be pressed.
  it('caps a tile below the keypad key', () => {
    expect(MAX_TILE).toEqual(40)
  })

  // The board paints with this before its first ResizeObserver measurement lands, so a typo here is
  // a first paint at the wrong size on every phrase. There is no DEFAULT_HEIGHT to pin beside it:
  // height stopped being an input when the grid stopped having a fixed number of rows.
  it('guesses the grid box at a 390 viewport before it has been measured', () => {
    expect(DEFAULT_WIDTH).toEqual(358)
  })
})

describe('tileSize', () => {
  // TOE HOLD at 390: seven tiles, five interior gaps and one word gap leave 336px over seven, which
  // is 48 -- so the ceiling is what answers. Asserted rather than assumed, because "the short phrase
  // gets the biggest tile" is the claim the ceiling exists to keep true.
  it('gives the design phrase the whole ceiling at a 390 viewport', () => {
    expect(tileSize(AT_390, [3, 4])).toEqual(MAX_TILE)
  })

  // THE WIDTH FIT BINDING, which is the case the whole function is for: sixteen letters in three
  // words leave 308px over sixteen, so the phrase sits on one line at 19px rather than at the
  // ceiling. A 390 board is not always a 40px board.
  it('sizes a long phrase to one line rather than to the ceiling', () => {
    expect(tileSize(AT_390, [5, 6, 5])).toEqual(19)
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
  it.each<[string, number[], number]>([
    ['the ceiling for the design phrase', [3, 4], MAX_TILE],
    ['a width-bound size for a long phrase', [5, 6, 5], 19],
    ['the floor for the densest phrase the corpus can hold', [7, 7, 7], MIN_TILE],
  ])('sizes from the width alone, giving %s', (_description, wordLengths, expected) => {
    expect(tileSize(AT_390, wordLengths)).toEqual(expected)
  })

  it('never grows past the ceiling for a two-letter phrase on a wide board', () => {
    expect(tileSize(1000, [2])).toEqual(MAX_TILE)
  })

  // §8.11's dense case, and the ONE assertable half of "no horizontal scroll at any width": three
  // seven-letter words is 21 tiles, which needs ~470px and has 288. The floor is what decides
  // whether the grid CAN fit, and a floor that silently moved is the realistic way that promise
  // breaks. Whether the browser then draws it inside the box is layout, and jsdom has none.
  it('floors twenty-one tiles at a 320 viewport', () => {
    expect(tileSize(AT_320, [7, 7, 7])).toEqual(MIN_TILE)
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
