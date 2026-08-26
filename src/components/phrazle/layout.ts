// px, between letters INSIDE a word, against the gap between words. Word boundaries come from
// proximity rather than from a box, exactly as the cipher bench states it: equal gaps plus a bracket
// is what made a wrapped word read as two words in the first place. 2 against 12 is the ratio that
// carries them.
export const LETTER_GAP = 2
export const WORD_GAP = 12
// TWO GAPS WHERE THERE WAS ONE, and splitting them is a bug fix rather than a refinement. A single
// `ROW_GAP` was spent in both places a row can be broken -- between one guess and the next, and
// between the wrapped lines of a SINGLE guess whose words did not fit the width -- so at 390 a
// three-word phrase of sixteen letters drew two guesses as four evenly spaced lines with nothing on
// screen saying which pair belonged together. The name is what hid it: "row" meant a guess in one
// call site and a line of tiles in the other.
//
// WRAP_GAP is the smaller one, INSIDE a guess. It stays at 6 -- larger than the letter gap and
// smaller than the word gap, so a wrapped line still reads as a continuation of the line above it.
export const WRAP_GAP = 6
// GUESS_GAP is the larger one, BETWEEN guesses, and the board draws a hairline in it. Two channels,
// because one is not enough: a gap alone asks a reader to judge 8px against 6px, and a rule alone
// puts the whole boundary in a single hairline. The board asserts the hairlines by counting DOM
// elements; this constant is what stops the gap being quietly equalized again, which is the exact
// regression that produced the four-identical-lines board.
export const GUESS_GAP = 8

// The floor, and it is NOT cryptogram's MIN_SQUARE. That constant is 24 because 24x24 is WCAG 2.5.8
// Target Size (Minimum) -- a criterion about CONTROLS. A Phrazle tile is not a control: it is never
// tapped, has no handler, and carries role="img" rather than a button role, because the player types
// from the pad and only from the pad. So 2.5.8 does not reach a tile and the floor here is
// READABILITY, which is 18. Below it the tile stops shrinking and .lull-board scrolls instead.
export const MIN_TILE = 18
// The ceiling. It was set below the pad's 44px key, because a tile the size of a key reads as a key
// and the one thing this bench must not teach is that a tile can be pressed -- and that argument no
// longer holds the number up: the pad is a QWERTY keyboard now, whose keys are 31.1 wide and 59
// tall at a 320 viewport, so a tile is not the size or the shape of a key at any width.
//
// 40 STAYS ANYWAY, on the reason that was always underneath the first one: a tile carries a letter
// and a 2px bar, and past 40 a short phrase in a wide window draws playing cards. What changed is
// that this is now the whole of the argument, so a future edit is judged on legibility rather than
// on a key size that has moved.
export const MAX_TILE = 40

// What the grid box's WIDTH is worth at a 390 viewport before the first ResizeObserver measurement
// lands, so the first paint is not a guess of zero. 390 less the plate's own 16px a side.
//
// There is no DEFAULT_HEIGHT beside it any more, and nothing measures the band's height at all.
export const DEFAULT_WIDTH = 358

/**
 * One tile size for the whole grid, large enough that the phrase sits on one line.
 *
 * WIDTH ONLY, and the height that used to sit beside it is gone rather than defaulted. This function
 * took the band's height and a row count and returned `min(widthFit, heightFit)`, which kept a fixed
 * six-row grid whole on screen -- the right answer for a board that could never grow a seventh row.
 * There is no guess limit now: the grid adds a row whenever the player needs one, so a height budget
 * divided by the row count would shrink every tile on every guess and hit the 18px floor at around
 * guess fifteen, on a board with no last guess. Tiles hold their size and .lull-board scrolls, which
 * it is already built to do -- index.css gives it `flex: 1 1 0%` and `overflow-y: auto`.
 *
 * Pure and DOM-free on purpose: the measurement is the grid box's CONTENT width, handed in by the
 * board, never derived from the viewport. A viewport-derived size is wrong inside any container that
 * is not the full width, and this one sits inside two levels of horizontal padding.
 *
 * When the width cannot hold the phrase at the floor, the row's word groups wrap BETWEEN words --
 * words never break, because word shape is a solving cue and a broken word reads as two words -- and
 * the grid gets taller and scrolls. That is deterministic and it degrades rather than clipping.
 */
export const tileSize = (availableWidth: number, wordLengths: number[]): number => {
  const letters = wordLengths.reduce((total, length) => total + length, 0)
  const insideWords = LETTER_GAP * (letters - wordLengths.length)
  const betweenWords = WORD_GAP * (wordLengths.length - 1)
  const widthFit = (availableWidth - insideWords - betweenWords) / letters

  // STILL GUARDED, and the guard did not get simpler by losing an operand -- it got NARROWER, and
  // both arms it still has to catch are live. A phrase with no words divides by zero and yields
  // Infinity, which Math.min(40, Infinity) returns as a perfectly ordinary 40 for a grid with
  // nothing in it. A NaN measurement is not rescued by the clamp either -- Math.max(18, NaN) is NaN
  // and so is Math.min(40, NaN) -- and the board writes this number straight into a px width.
  if (!Number.isFinite(widthFit)) return MIN_TILE

  return Math.min(MAX_TILE, Math.max(MIN_TILE, Math.floor(widthFit)))
}
