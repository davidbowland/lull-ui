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
 * One tile size for the whole grid, large enough that the LONGEST WORD sits on one line.
 *
 * THE LONGEST WORD, NOT THE PHRASE, and that is the whole of what this function decides. Sizing the
 * phrase to one line made the tile a function of how much the pack happened to ship: `TOE HOLD` drew
 * at the 40px ceiling and `PLAIN SPOKEN TRUTH` drew at 19px, on the same device, in the same
 * session, minutes apart. So the size of a tile carried no meaning -- it measured the phrase rather
 * than the board -- and the dense phrases, the ones whose marks are hardest to read, were the ones
 * drawn smallest. The cipher bench has always sized to its longest word for exactly this reason, and
 * a player moving between the two benches met two different sizes of the same square.
 *
 * WHAT PAYS FOR IT IS THE WRAP, which this board already draws and already has a gap for. A guess
 * whose words do not fit the width breaks BETWEEN words -- words never break, because word shape is
 * a solving cue and a broken word reads as two words -- at WRAP_GAP, with GUESS_GAP and a hairline
 * still separating one guess from the next. So a long phrase costs height, which .lull-board is
 * built to spend (index.css gives it `flex: 1 1 0%` and `overflow-y: auto`), instead of costing
 * legibility, which nothing gives back. WORD_GAP is therefore not in the arithmetic below: it is
 * spent between words on a line the browser decides, and a size computed against gaps that may not
 * be drawn would shrink the tile to pay for them anyway.
 *
 * WIDTH ONLY, and the height that used to sit beside it is gone rather than defaulted. This function
 * took the band's height and a row count and returned `min(widthFit, heightFit)`, which kept a fixed
 * six-row grid whole on screen -- the right answer for a board that could never grow a seventh row.
 * There is no guess limit now: the grid adds a row whenever the player needs one, so a height budget
 * divided by the row count would shrink every tile on every guess and hit the 18px floor at around
 * guess fifteen, on a board with no last guess.
 *
 * Pure and DOM-free on purpose: the measurement is the grid box's CONTENT width, handed in by the
 * board, never derived from the viewport. A viewport-derived size is wrong inside any container that
 * is not the full width, and this one sits inside two levels of horizontal padding.
 *
 * THE FLOOR IS NOW ALL BUT UNREACHABLE from the corpus, and it stays anyway. The densest phrase the
 * corpus can hold is three seven-letter words, which needs 7 tiles on a line rather than 21 -- 39px
 * at a 320 viewport. It takes a fifteen-letter word to reach 18 there, and a word that long is a
 * malformed pack rather than a puzzle. A guard that only fires on bad data is still a guard.
 */
export const tileSize = (availableWidth: number, wordLengths: number[]): number => {
  // `reduce` rather than `Math.max(...wordLengths)`, so an empty phrase yields 0 and divides by zero
  // -- the arm the guard below already catches -- instead of -Infinity, which makes the numerator
  // Infinity and the quotient a NaN that says nothing about which input was wrong.
  const longest = wordLengths.reduce((most, length) => Math.max(most, length), 0)
  const widthFit = (availableWidth - LETTER_GAP * (longest - 1)) / longest

  // STILL GUARDED, and both arms it has to catch are live. A phrase with no words divides by zero
  // and yields Infinity, which Math.min(40, Infinity) returns as a perfectly ordinary 40 for a grid
  // with nothing in it. A NaN measurement is not rescued by the clamp either -- Math.max(18, NaN) is
  // NaN and so is Math.min(40, NaN) -- and the board writes this number straight into a px width.
  if (!Number.isFinite(widthFit)) return MIN_TILE

  return Math.min(MAX_TILE, Math.max(MIN_TILE, Math.floor(widthFit)))
}
