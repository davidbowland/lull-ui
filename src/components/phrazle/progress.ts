import { splitPhrase } from '@rules/is-valid-guess'

import { PhrazleProgress } from '@types'

// A FUNCTION, not a shared constant. Every refusal hands its caller an object nobody else holds a
// reference to; one shared value would let a board that restored an empty puzzle write through it
// into every later restore in the same session.
const empty = (): PhrazleProgress => ({ guesses: [] })

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
 */
export const encode = (guesses: string[]): string =>
  JSON.stringify({ guesses: guesses.slice(-MAX_STORED).map((guess) => splitPhrase(guess).join(' ')) })

/**
 * The guesses a stored string carries, truncated at the first one that no longer fits the answer.
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
export const decode = (progress: string | null, answer: string): PhrazleProgress => {
  if (progress === null || progress === '') return empty()

  let parsed: unknown
  try {
    parsed = JSON.parse(progress)
  } catch (error: unknown) {
    console.error('discarding a malformed stored Phrazle board', { error })
    return empty()
  }

  if (typeof parsed !== 'object' || parsed === null) return empty()
  const stored: unknown = (parsed as { guesses?: unknown }).guesses
  if (!Array.isArray(stored) || stored.some((guess) => typeof guess !== 'string')) return empty()

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
  return { guesses: kept.slice(-MAX_STORED) }
}
