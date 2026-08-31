import type { PhrazleSpentRung } from '@rules/hint-phrazle'
import { splitPhrase } from '@rules/is-valid-guess'

import { PhrazleProgress } from '@types'

/**
 * The ladder half of the stored record: which rungs were bought, and how many steps were paid for.
 *
 * `opened` IS STORED AND NOT DERIVED FROM `hints`, and the reason is not that the two could drift.
 * HintBar reaches "Show answer" only when `opened` exceeds the ladder's length -- see `controlLabel`
 * -- so a bar has to be able to sell one step PAST the last rung, and a count read off a three-rung
 * list can never express four. Derived, the answer reveal is unreachable. So the invariant this
 * codec enforces is the loose one the design actually has: `opened` is the number of rungs bought,
 * or one more than that when the answer has been revealed. Anything else was not written by this
 * app.
 */
export interface PhrazleHintTail {
  hints: PhrazleSpentRung[]
  opened: number
}

/**
 * What a stored Phrazle string decodes to: the guesses, and -- only when the player has bought
 * something -- the ladder.
 *
 * IT EXTENDS `PhrazleProgress` HERE RATHER THAN WIDENING IT IN types.ts, and that is a decision. That
 * file is a copy-verbatim mirror of lull-api's, and lull-api neither reads nor writes this string;
 * widening it there would put a `@rules/hint-phrazle` import into a file whose whole claim is that it
 * has no imports and no runtime exports, to declare fields the mirrored repo has no reader for.
 *
 * BOTH FIELDS ARE OPTIONAL AND BOTH ARE OMITTED WHEN NOTHING IS BOUGHT. An untouched board therefore
 * writes and reads back exactly the string it did before this existed, which is what makes every
 * board stored before this change a legacy payload that needs no migration: it has neither field, and
 * neither field is a state.
 */
export interface PhrazleBoardProgress extends PhrazleProgress {
  hints?: PhrazleSpentRung[]
  opened?: number
}

// A FUNCTION, not a shared constant. Every refusal hands its caller an object nobody else holds a
// reference to; one shared value would let a board that restored an empty puzzle write through it
// into every later restore in the same session.
const empty = (): PhrazleBoardProgress => ({ guesses: [] })

// Same rule, and it matters more here: the array inside is handed to the adapter, which spreads it
// to build the next purchase. A shared `[]` would be one array every board in the session extends.
const noHints = (): PhrazleHintTail => ({ hints: [], opened: 0 })

// The rule's own ceiling, restated rather than imported: `RUNG_COUNT` is module-private in
// hint-phrazle.ts, and a test that imported the bound this checks against would assert the cap
// against itself and pass at any value. If the rule ever sells four, this refuses the fourth and the
// suite says so.
const MAX_SPENT = 3

// The per-word lengths as one comparable string. Comparing shapes rather than walking two arrays in
// step keeps the word count and the per-word lengths in ONE comparison, which is exactly the pair
// markGuess throws on -- so there is no arrangement of this check that catches one and not the other.
const shapeOf = (words: string[]): string => words.map((word) => word.length).join(',')

/**
 * The most guesses this codec will carry across a reload. NOT A GUESS LIMIT, and the distinction is
 * the whole reason it lives here rather than on the pack: it can never end a game. A player at guess
 * 25 keeps playing on a board that keeps growing; this only decides how much of the history survives
 * being written to localStorage and read back.
 *
 * IT EXISTS BECAUSE PROGRESS IS A TEXT BOX A PLAYER CAN TYPE INTO. `maxGuesses` used to bound this
 * and came off the wire with the guess limit, so without a ceiling here a hand-edited key holding
 * fifty thousand guesses is fifty thousand rows of tiles built during render.
 *
 * THE OLDEST ROLL OFF, NOT THE NEWEST -- `slice(-MAX_STORED)` rather than `slice(0, MAX_STORED)`.
 * The recent marks are the ones still telling a player something; the first guess of a long board
 * has usually been superseded by everything after it. This is the ONE place the codec stopped being
 * conservative, and it is a deliberate trade rather than an oversight: the count in the sign row
 * restarts from what survived, so a player who made 40 guesses and reloads is told `Guess 26`. The
 * alternative is storing a spent count beside the array, which is a second field that can disagree
 * with the first about a number both of them claim to know.
 */
const MAX_STORED = 25

/**
 * The guesses as one opaque string the shell persists verbatim.
 *
 * JSON, matching `PhrazleProgress` exactly, because the type is lull-api's declaration of the shape
 * even though lull-api never reads or writes it. This is the one progress key in the repo that
 * stores JSON, and it does so because the payload is a variable-length list rather than a fixed
 * number of fields -- a list with no upper bound on the wire at all, now that the guess limit is
 * gone. The newline grammar the writing bench uses could not say "three guesses" without also saying
 * which three rows they are, and there is no fixed set of rows left to be three of.
 *
 * TRIMMED TO THE LAST MAX_STORED ON THE WAY OUT, so this never writes more than decode will read
 * back. Doing it in one direction only would leave localStorage growing without bound for a history
 * whose front is discarded at every load -- bytes paid for on every write, to store rows nothing
 * will ever restore.
 *
 * EVERY STORED GUESS IS CANONICAL -- uppercase A-Z words separated by single spaces, the output of
 * splitPhrase re-joined, which is the same form `answer` ships in. Storing raw keystrokes instead
 * would make a resumed board depend on a normalization rule that is allowed to change, which is the
 * thing PhrazleProgress exists to prevent.
 *
 * IT IS NEVER CALLED WITH AN EMPTY LIST BY THE BOARD. Play again writes `onProgress('')` directly,
 * because '' is what the shell reads as "no progress" -- `wasSolvedBefore` and the shelf's
 * started-state both key off it. The grammar is total anyway, and `decode(encode([]))` is asserted,
 * because a codec that needed a special case for its own writer's empty would be the wrong shape.
 *
 * IT WRITES `guesses` AND NOTHING ELSE, and its signature does not change now that the string can
 * carry a ladder. The board is the only caller and the board knows nothing about hints; the tail is
 * re-attached by `attachHints` below, through the adapter's `merge`, so the hint fields have exactly
 * one writer. A board that wrote them would be the second, and the second writer is what destroys a
 * rung the player paid for -- see HintAdapter in the registry.
 */
export const encode = (guesses: string[]): string =>
  JSON.stringify({ guesses: guesses.slice(-MAX_STORED).map((guess) => splitPhrase(guess).join(' ')) })

// `null` or '' is nothing stored, a value that is not JSON is nothing stored and says so, and
// anything that is not a plain object -- a JSON null, a string, an array -- describes no board.
//
// Shared by the two readers below so a single string is parsed once per read rather than once per
// field, and so the two can never disagree about what a well-formed record even is.
const parse = (progress: string | null): Record<string, unknown> | null => {
  if (progress === null || progress === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(progress)
  } catch (error: unknown) {
    console.error('discarding a malformed stored Phrazle board', { error })
    return null
  }

  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
}

// The guesses, truncated at the first one that no longer fits the answer's shape, then windowed. See
// the decode docblock below: every claim about steps 3 to 5 is about this function.
const storedGuesses = (parsed: Record<string, unknown>, answer: string): string[] => {
  const stored: unknown = parsed.guesses
  if (!Array.isArray(stored) || stored.some((guess) => typeof guess !== 'string')) return []

  const shape = shapeOf(splitPhrase(answer))
  const kept: string[] = []
  for (const guess of stored as string[]) {
    const words = splitPhrase(guess)
    // `words.length === 0` is not covered by the shape comparison and needs saying: an answer that
    // did not arrive splits to [] and so does an empty guess, so their shapes are both '' and would
    // match. A board with no answer has nothing to mark against, so it has no history either.
    if (words.length === 0 || shapeOf(words) !== shape) break
    kept.push(words.join(' '))
  }

  // A NEGATIVE SLICE ARGUMENT, WHICH IS THE POINT rather than a hazard. `slice(-25)` takes the last
  // 25 and, on a shorter list, takes all of it -- so there is no length check to get wrong and no
  // Math.max guarding a corrupt number, because MAX_STORED is a constant in this file rather than a
  // value off the pack. The old cut was `slice(0, Math.max(0, maxGuesses))` and every bit of that
  // arithmetic existed to survive `maxGuesses` arriving negative or NaN over the wire.
  return kept.slice(-MAX_STORED)
}

// ONE ROW OF THE RULE'S OWN UNION, checked field by field, because the record came out of a text box
// a player can type into and `phrazleHintFor` reads it without checking anything. `letters` is A-Z
// and non-empty -- an empty run would compose "The phrase has ." -- and a word index is a
// non-negative integer here, with the answer-relative bound applied by `withinAnswer` below, which is
// the only part of this that needs a phrase to check against.
//
// The two letter kinds are tested together and `word` is the fallthrough, so an unknown `kind` is
// refused by the last `return` rather than by a clause that has to be remembered.
const isSpentRung = (value: unknown): value is PhrazleSpentRung => {
  if (typeof value !== 'object' || value === null) return false

  const rung = value as { index?: unknown; kind?: unknown; letters?: unknown }
  if (rung.kind === 'absent' || rung.kind === 'present')
    return typeof rung.letters === 'string' && /^[A-Z]+$/.test(rung.letters)

  return rung.kind === 'word' && Number.isInteger(rung.index) && (rung.index as number) >= 0
}

// The ladder, validated as its OWN step and dropped ON ITS OWN, which is the whole difference between
// this and the guesses above. The two are separable: a rung is a sentence the shell prints and a
// guess is a row the player typed, and a malformed rung must never cost them rows. So the guesses
// truncate on a bad entry and keep what came before, while a bad ladder is dropped whole -- there is
// no "keep what came before" for three records whose ORDER is the ladder and whose count is the price
// the player paid.
//
// NEITHER FIELD IS A LEGACY PAYLOAD. Every board written before this existed has neither, and that is
// the first clause: no fields, nothing bought, nothing dropped and nothing logged.
//
// BOTH OR NEITHER after that, because `attachHints` writes both or neither. One without the other is
// not a shape this app can produce, so it is a fault like any other.
const hintTail = (parsed: Record<string, unknown> | null): PhrazleHintTail => {
  if (parsed === null) return noHints()

  const { hints, opened } = parsed
  if (hints === undefined && opened === undefined) return noHints()
  if (!Array.isArray(hints) || hints.length > MAX_SPENT || !hints.every(isSpentRung)) return noHints()
  // `opened` is the rung count, or one past it once the answer has been revealed. Below the count is
  // a record claiming rungs nobody paid for; further above it is a reveal on a ladder that never
  // reached its end.
  if (!Number.isInteger(opened) || (opened as number) < hints.length || (opened as number) > hints.length + 1)
    return noHints()

  return { hints: hints as PhrazleSpentRung[], opened: opened as number }
}

// The one check that needs the phrase. A word rung naming word 8 of a two-word phrase renders as
// "Word 8 uses these letters, alphabetized: ." -- `phrazleHintFor` reads the word with `?? ''` and
// composes the sentence anyway -- so the rung is refused here rather than printed.
const withinAnswer = (tail: PhrazleHintTail, wordCount: number): PhrazleHintTail =>
  tail.hints.every((rung) => rung.kind !== 'word' || rung.index < wordCount) ? tail : noHints()

/**
 * The guesses a stored string carries, truncated at the first one that no longer fits the answer, and
 * the ladder the player has bought.
 *
 * THIS IS THE GUARD THAT MAKES markGuess'S THROW UNREACHABLE, and it is the whole reason this
 * function takes an answer at all. `markGuess` throws by contract when the word counts differ or the
 * per-word lengths do not correspond; progress comes out of localStorage, which is a text box a
 * player can type into; and the board dereferences the result during RENDER. An unguarded decode is
 * therefore the latching failure: the bad write persists before the throw, so the board throws at
 * mount forever afterwards and nothing self-heals, because the pack is valid and no code anywhere
 * validates a progress string.
 *
 * FIVE ORDERED STEPS, and the order is the contract:
 *
 *   1. `null` or '' -- nothing stored.
 *   2. JSON.parse inside try/catch.
 *   3. an object whose `guesses` is an array of strings, or nothing.
 *   4. walk the guesses IN ORDER and stop at the first one that does not fit the answer's shape.
 *   5. keep the LAST MAX_STORED of what survived.
 *
 * A SIXTH STEP READS THE LADDER, AND IT IS SEPARATE ON PURPOSE. Steps 3 to 5 answer for `guesses`
 * and step 6 answers for `opened` and `hints`, so neither can cost the other anything: a malformed
 * rung leaves the player's rows exactly where they were, and a guess the answer no longer fits
 * leaves the rungs they paid for exactly where they were. That asymmetry -- truncate the guesses,
 * drop the ladder whole -- is argued at `hintTail` above, and it comes down to the guesses being a
 * history whose prefix is still true while a ladder is three records whose order IS the ladder.
 *
 * THE BOARD NEVER READS THE LADDER AND IS NOT MEANT TO. Phrazle's rungs are sentences in the shell's
 * hint bar -- "The phrase has no D, no G, and no P." -- and they change no tile, no color and no row,
 * so the board draws the same grid whether three rungs are bought or none. It reads `guesses` off
 * this and nothing else, and it is handed no way to reach the rest. A board reads hint state exactly
 * when a hint changes what it draws, which for this bench is never.
 *
 * STEP 5 CUTS FROM THE FRONT AND STEP 4 CUTS FROM THE BACK, and running them in this order is what
 * makes the pair safe. Step 4 stops at the first guess that no longer fits, so everything it keeps
 * has been checked against the answer's shape; step 5 then drops from the front of a list that is
 * already entirely valid. Reversed, a window taken first could slide past a malformed entry and hand
 * markGuess something it throws on.
 *
 * TRUNCATE, NEVER FILTER, in step 4. The guesses are an ordered history, so removing a bad entry
 * from the middle would change what every later row means. Truncating is conservative and monotone,
 * and the worst case is a player losing rows they can retype.
 *
 * THE WINDOW IS THE ONE PLACE THIS CODEC IS NOT CONSERVATIVE, and it does not need to be: nothing
 * downstream counts attempts against a limit any more, because there is no limit. See MAX_STORED.
 *
 * THE DICTIONARY IS NOT RE-CHECKED HERE, for two independent reasons. It may not be loaded when
 * progress is decoded -- the shell can restore a board before the word list has landed -- and a
 * later dictionary version is a SUPERSET, so a guess that was legal when it was made must stay
 * legal. Only the shape is checked, and shape is exactly what makes the throw unreachable.
 *
 * A `__proto__` key in the payload is an ordinary own property on the object JSON.parse builds, so
 * reading `.guesses` off it cannot reach a prototype, and nothing here spreads or assigns the parsed
 * value into anything.
 */
export const decode = (progress: string | null, answer: string): PhrazleBoardProgress => {
  const parsed = parse(progress)
  if (parsed === null) return empty()

  const guesses = storedGuesses(parsed, answer)
  const tail = withinAnswer(hintTail(parsed), splitPhrase(answer).length)

  // ONE CHECK AND NOT TWO, because `hintTail` has already refused any record where `opened` is below
  // the rung count -- so a count of zero is a ladder of zero, and there is no third state where one
  // field is empty and the other is not.
  return tail.opened === 0 ? { guesses } : { guesses, hints: tail.hints, opened: tail.opened }
}

/**
 * The ladder half of a stored string, read WITHOUT the answer.
 *
 * IT TAKES NO ANSWER BECAUSE `merge` HAS NONE. `HintAdapter.merge(boardWrite, current)` is handed two
 * strings and no puzzle -- deliberately, since its whole job is to say which field belongs to whom
 * and it has no business reading either side's meaning -- so the read behind it cannot ask whether a
 * word rung names a word this phrase has. `decode` does ask, because it is holding the answer.
 *
 * THE TWO THEREFORE DISAGREE ON EXACTLY ONE INPUT, and it is worth naming rather than leaving to be
 * found: a stored word rung whose index is past the end of the phrase. `decode` drops the tail and
 * this keeps it, so the bar draws a ladder of speculative rungs while `opened` still counts the
 * bought ones -- one rung shown a step early. No code in this app writes that string, the next
 * purchase overwrites it, and the alternative is either an `opened` that takes a puzzle it has no
 * other use for or a rendered sentence reading "Word 8 uses these letters, alphabetized: ."
 */
export const decodeHints = (progress: string | null): PhrazleHintTail => hintTail(parse(progress))

/**
 * A board write with the stored ladder re-attached: the codec half of the one-writer rule.
 *
 * The board wrote its own portion and knows nothing of the two hint fields, so its `encode` output
 * carries `guesses` and nothing else. This puts the tail back, and it is the ONLY writer of those
 * fields -- see HintAdapter in the registry for why a second one is unrepresentable rather than
 * merely discouraged.
 *
 * AN EMPTY TAIL RETURNS `boardWrite` UNTOUCHED, byte for byte, which is what keeps an untouched board
 * writing the shortest payload it always did. It is also why a board stored before this change reads
 * back unchanged and gets re-written unchanged: no ladder, no fields, no migration.
 *
 * It does NOT special-case an empty `boardWrite`. A board write of '' is a reset and must stay '',
 * but that is a decision about what a board MEANT, which belongs to the adapter that owns the type's
 * ladder rather than to a string joiner -- and `open` legitimately attaches a tail to '' when a
 * player buys a rung before typing anything.
 */
export const attachHints = (boardWrite: string, tail: PhrazleHintTail): string => {
  if (tail.opened === 0) return boardWrite

  const stored = parse(boardWrite)?.guesses
  const guesses =
    Array.isArray(stored) && stored.every((guess) => typeof guess === 'string') ? (stored as string[]) : []
  // Key order is the grammar the spec's table writes: guesses, then opened, then hints.
  return JSON.stringify({ guesses, opened: tail.opened, hints: tail.hints })
}
