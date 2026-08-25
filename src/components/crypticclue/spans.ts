import { ClueSpan } from '@types'

export interface ClueParts {
  after: string
  before: string
  marked: string
}

/**
 * Where to put the element boundaries for one marked span of a clue, or null if the numbers do not
 * index it.
 *
 * WHY A BAD NUMBER IS THE FAILURE WORTH CODE: it renders PLAUSIBLY wrong. A pack whose
 * definitionSpan is [0, 8) instead of [0, 5) underlines `Dance hi` and prints `“Dance hi” is the
 * definition.` -- a confident, well-typeset lie, and nothing on screen says so.
 *
 * THIS USED TO SAY that strings need no guard because "a pack with no `clue` paints an empty plate
 * any human notices in one second". That was false, and it was false in the direction that costs
 * most. This function runs on EVERY render rather than only on the win, so a missing `clue` reached
 * `end > clue.length` and threw a TypeError inside React's commit -- which the root error boundary
 * answers by replacing the WHOLE APP with "Lull got stuck". `isValidPuzzle` leaves `data` opaque and
 * the pack is persisted, so that is not one bad render: it is every load of that day, offline
 * included, which is the exact failure storage.ts's own comments describe.
 *
 * So the guard below reads the string too, and the claim is now true of `undefined`, `null` and a
 * number: no slice, no reveal, and a clue plate the player can see is empty. It is NOT true of an
 * object, which React refuses as a child before this function is reached -- every board in this app
 * has that exposure and this one is no different. The line is drawn at what this module can honor.
 *
 * The spans index `clue` BYTE FOR BYTE. They are half-open [start, end) UTF-16 code-unit offsets,
 * and the clue's charset is [A-Za-z ], so code unit, code point and grapheme coincide. `clue` is
 * NOT trimmed, whitespace-collapsed, normalized or re-encoded before slicing; each of those
 * silently moves both spans while still producing a rendering.
 *
 * THE INVARIANT: `before + marked + after === clue`, always, for every span this accepts.
 *
 * IT AUTHORS NO GAME RULE. It decides nothing about whether an answer is right -- that stays
 * entirely normalizeAnswer, vendored and unedited. It decides where to put an element boundary in a
 * string, which is rendering, and it lives beside the board for the same reason cryptogram's
 * layout.ts and mapping.ts do.
 */
export const splitAt = (clue: string, span: ClueSpan): ClueParts | null => {
  // A pack is JSON, so a bound can be a float, a NaN or an Infinity, and String.slice quietly
  // truncates all three into something that still renders.
  //
  // OPTIONAL-CHAINED, and the `?.` is the whole of what makes the spec's degradation table true.
  // `isValidPuzzle` leaves `data` opaque, so a pack that omits `definitionSpan` reaches this board
  // and the reveal calls this function unguarded. Destructuring first threw a TypeError inside
  // React's commit, which the root error boundary catches by swapping the WHOLE APP for "Lull got
  // stuck" -- where what the spec promises for an unusable span is no reveal at all, and a clue the
  // player can still solve. The type says the field is there; the network is what actually decides.
  if (typeof clue !== 'string' || !Number.isInteger(span?.start) || !Number.isInteger(span?.end)) return null

  const { end, start } = span
  if (start < 0 || end > clue.length || start >= end) return null

  const marked = clue.slice(start, end)
  // The one guard that is about the SLICE rather than the numbers. A span landing on a single space
  // is arithmetically fine and underlines nothing a reader can see, while the reveal beneath it
  // prints a pair of quotes with a space inside them.
  if (marked.trim() === '') return null

  return { after: clue.slice(end), before: clue.slice(0, start), marked }
}
