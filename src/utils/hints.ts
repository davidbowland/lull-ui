import { Hint, HintLadder, Puzzle } from '@types'

// ONE TO THREE, and the range is the wire contract rather than a tolerance. `HintLadder` has been a
// one-to-three tuple since 2026-08-24; this file kept asking for exactly three for a year of commits
// after that, and the two disagreed silently because a refused ladder is `null` and `null` is also
// what a MALFORMED ladder returns.
//
// What that cost was the bench with the best reason to offer a hint. Cryptic Clue drops a rung
// whenever the clue's own indicator already announces the device -- see `tellingIndicators` in
// lull-api -- so a ladder of two is the correct output of a working rule, not a short pack. Every one
// of those puzzles came back null here, the frame read null as "malformed, draw nothing", and the
// hint bar disappeared from the board a player was most likely to want it on.
//
// The floor is 1 and not 0. An empty array is a well-formed array and still has to be refused: the
// bar it would draw counts rungs out in its own label and opens a sheet with nothing in it, which
// spends a press to say nothing. Same refusal a blank rung gets, for the same reason.
const MIN_HINT_COUNT = 1
const MAX_HINT_COUNT = 3

/**
 * The ladder a puzzle carries, or null.
 *
 * It cannot live in src/types.ts: that file is a copy-verbatim mirror of lull-api with zero runtime
 * exports, and jest.config.ts lists it in coveragePathIgnorePatterns -- so the one guard the whole
 * shell depends on would be exempt from the coverage gate.
 *
 * Structural, not exhaustive, in the same spirit as isValidPuzzle: it checks what the shell
 * dereferences, not what a puzzle type means. EVERY puzzle type carries a ladder now -- goFigure's
 * rungs place an operator where a phrase puzzle's describe a meaning -- so null no longer means "this
 * game has no hints". It means the shape is malformed, and nothing downstream should touch it.
 *
 * A SHORT LADDER IS NOT MALFORMED. See MIN_HINT_COUNT above: one to three rungs is what the wire
 * promises and what a bench that drops a redundant rung actually sends. Everything downstream reads
 * the array's own length -- HintBar draws one marker per rung and counts them out in its label -- so
 * there is nothing here that needs the count to be a literal 3.
 */
export const hintsOf = (puzzle: Puzzle<unknown>): HintLadder | null => {
  const data = puzzle.data as Record<string, unknown> | null
  if (typeof data !== 'object' || data === null) return null

  // A rung is an OBJECT with prose in it, and the object-ness is checked before the prose because a
  // bare string was the old wire format. A guard that only asked for a non-empty `.text` would reject
  // a string rung BY ACCIDENT -- `'abc'.text` is undefined, which is not a string, so that arm
  // happens to hold -- and an accident is not a guarantee. The explicit object check is what makes
  // the rejection principled, which matters because `metadata` has no such luck: the board reads
  // `hint.metadata.slot` and would throw on a string that got this far.
  //
  // `metadata` itself is deliberately NOT checked. This guard is shared by the two phrase types whose
  // rungs legitimately have none, and the goFigure board is the only reader that needs it -- so the
  // narrowing to GoFigureHint belongs there, where a missing slot is a real failure, rather than here
  // where it would reject every phrase ladder in the pack.
  const isRung = (hint: unknown): hint is Hint =>
    typeof hint === 'object' &&
    hint !== null &&
    typeof (hint as Hint).text === 'string' &&
    (hint as Hint).text.trim() !== ''

  const hints = data.hints
  const isLadder =
    Array.isArray(hints) && hints.length >= MIN_HINT_COUNT && hints.length <= MAX_HINT_COUNT && hints.every(isRung)

  return isLadder ? (hints as HintLadder) : null
}

// WRITTEN OUT rather than described, because "a serial comma" is the kind of sentence two people
// implement differently. Two words join with `and` and no comma; three or more take the serial comma
// before the last, which is American English and which also stops the last two reading as one item.
//
// Module-private. Nothing outside this file may build this sentence: `HintBar` renders what it is
// handed verbatim, and a second composer would be a second place for the wording to drift.
const listOf = (words: string[]): string =>
  words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')}, and ${words.at(-1)}`

/**
 * The sentence the bar prints once every rung is spent, or null.
 *
 * TWO SHAPES, AND IT DISPATCHES ON THE SHAPE RATHER THAN ON THE TYPE. A phrase puzzle carries one
 * `answer` string and gets "The answer is X."; Themed Anagrams carries `entries`, four objects each
 * with an `answer`, and gets one sentence naming all four in ROW ORDER. Neither branch reads
 * `puzzle.type`, which is what keeps the shell type-blind: the registry is the only place in this app
 * that knows what a type is.
 *
 * A TOP-LEVEL `answer` WINS, stated rather than left to fall out of statement order. No wire type
 * carries both -- Themed Anagrams deliberately has no top-level answer -- so this is a rule about a
 * pack that is already wrong, and the phrase branch is the older and narrower of the two.
 *
 * It names all four rather than the three a spent ladder has not already given away. Subtracting one
 * would mean reading `metadata.entryIndex` and `metadata.reveal` -- the first metadata read in the
 * shell -- and it cannot be done correctly anyway, because the rung order is the BACKEND's and
 * nothing promises the ladder spends a rung on a full answer at all.
 *
 * goFigure reaches neither branch, and it DOES reach this function -- the two are different claims and
 * only the first one is true. puzzle-frame/index.tsx:176 evaluates `answerOf(puzzle) ?? undefined` for
 * every puzzle it opens; `hasHintBar` on line 194 gates which bar is DRAWN, not whether this is called,
 * and hints.test.ts calls it on the goFigure fixture directly. What that bench ships is
 * `acceptedSolutions`, an array of expressions several of which are right, so there is no answer here to
 * state and neither `data.answer` nor `data.entries` is present: both guards decline and the result is
 * null. That bench composes its own line -- it has to redraw the operators with × and ÷, and it has to
 * hedge, because its ladder pins an operator tuple rather than an expression -- and it renders its own
 * bar.
 *
 * The SENTENCE and not the answer, because the caller is a wire-up: `HintBar` renders what it is
 * handed verbatim, the same contract `hint.text` has, and a component that took a bare answer would
 * have to know which bench's phrasing to wrap it in.
 *
 * Structural, like `hintsOf` above and for the same reason -- a pack is JSON off the network that was
 * persisted, and `isValidPuzzle` deliberately leaves `data` opaque. A blank answer is refused rather
 * than printed, and one blank member refuses the whole list: "The answer is ." and "The answers are
 * KETTLE, , SKILLET, and SPATULA." both spend the player's last press to say nothing.
 */
export const answerOf = (puzzle: Puzzle<unknown>): string | null => {
  const data = puzzle.data as Record<string, unknown> | null
  if (typeof data !== 'object' || data === null) return null

  const answer = data.answer
  if (typeof answer === 'string' && answer.trim() !== '') return `The answer is ${answer}.`

  const entries = data.entries
  if (!Array.isArray(entries) || entries.length === 0) return null

  // EVERY MEMBER, not the first: a partial list prints "The answers are KETTLE, , SKILLET, and
  // SPATULA.", which spends the player's last press to say something malformed. Same refusal the
  // blank answer above gets, for the same reason.
  const words = entries.map((entry: unknown) =>
    typeof entry === 'object' && entry !== null ? (entry as { answer?: unknown }).answer : null,
  )
  if (!words.every((word): word is string => typeof word === 'string' && word.trim() !== '')) return null

  // The singular exists because this function is structural over untrusted JSON: the wire type is a
  // four-tuple, but a one-entry array must not produce "The answers are KETTLE."
  return words.length === 1 ? `The answer is ${words[0]}.` : `The answers are ${listOf(words)}.`
}
