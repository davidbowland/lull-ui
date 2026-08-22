// px, between letters INSIDE a word. Word boundaries come from proximity rather than from a box:
// 2px inside a word against 16px between words. Equal gaps plus a bracket is exactly what made a
// wrapped word read as two words in the first place.
export const GAP = 2

// 24x24 is WCAG 2.5.8 Target Size (Minimum) -- the AA criterion this app is held to. It is NOT the
// 44x44 of 2.5.5, which is AAA and is what the keypad keys use: those are the repeatedly-tapped
// control and have the room. Nothing in this repo enforces 44 and nothing could -- style assertions
// are forbidden here -- and goFigure's tiles are already 56.
export const MIN_SQUARE = 24
export const MAX_SQUARE = 44

// What the phrase box is worth at a 390 viewport, after the plate's own 16px a side. The bench
// column carries no gutter -- every band pays for its own inset, and the board's plate is one of the
// bands that reaches the screen edge -- so this is 390 - 32 rather than the 326 it was when the
// column was padded too. Used only until the first ResizeObserver measurement lands, so the first
// paint is not a guess of zero.
export const DEFAULT_AVAILABLE = 358

/**
 * One square size for every letter of the phrase, large enough that the longest word fits one line.
 *
 * Pure and DOM-free on purpose: `available` is the phrase box's measured CONTENT width, handed in by
 * the board, never derived from the viewport. A viewport-derived size is wrong inside any container
 * that is not the full width, and this one sits inside two levels of horizontal padding.
 *
 * Below the floor the size stops shrinking and the word wraps instead (see the board's continuation
 * rows), because a 20px square is unhittable long before it is unreadable.
 */
export const squareSize = (available: number, longest: number): number => {
  const raw = Math.floor((available - GAP * (longest - 1)) / longest)
  // The clamp does not rescue a NaN or an Infinity: Math.max(24, NaN) is NaN, Math.min(44, NaN) is
  // NaN, and the board writes the result straight into a px width. A measurement that arrived as
  // NaN, or a word of no letters dividing by zero, would size every square to nothing at all.
  if (!Number.isFinite(raw)) return MIN_SQUARE
  return Math.min(MAX_SQUARE, Math.max(MIN_SQUARE, raw))
}
