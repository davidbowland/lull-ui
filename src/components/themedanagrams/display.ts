import { pinnedIndices, ThemedAnagramsSpentRung } from '@rules/hint-themed-anagrams'

// HOW A PINNED ROW IS DRAWN, and whether there is anything left to draw.
//
// `pinnedDisplay` USED TO LIVE IN `@rules/hint-themed-anagrams` and was moved here in the same
// sitting it was deleted from lull-api. It is not vendored and it is not shared: nothing in
// lull-api's `src/` ever imported it and its sweep test never called it, so its whole life over there
// was a copy travelling beside code that IS shared. What the rule still owns is which POSITIONS a
// rung reveals -- `pinnedIndices`, which `rungFor` calls to count free positions and which is
// therefore load-bearing in the chooser. How those positions are drawn is the board's, and that is
// the seam.
//
// The move is what lets the two decisions below exist at all. Both are about the row a player is
// looking at rather than about which rung to sell, and neither could be made in a file that lull-api
// executes.

/**
 * The scramble to draw, with revealed letters standing in their true positions.
 *
 * Revealed letters are PINNED at their real indices; every other position is filled from the current
 * scramble in its own order, skipping ONE occurrence per pinned letter. So the tiles the player was
 * already reading stay in the order they were reading them, and the hint moves only what it bought.
 *
 * ONE OCCURRENCE, NOT EVERY OCCURRENCE, and that is what keeps the letter multiset right on a word
 * like KETTLE: pinning one E must not remove the other from the pool.
 *
 * THE POOL IS TAKEN FROM THE SCRAMBLE rather than re-shuffled, which was the alternative. A fresh
 * shuffle churns letters the player is actively reading, so the board would change more than the
 * hint justifies. Choosing a different pre-gated scramble was also rejected: the generator's severity
 * dial MINIMIZES positional agreement, so usually no member of `scrambles` has the letter in place.
 *
 * MODULE-PRIVATE, because the board must never draw this string directly -- see `drawnRun`, which is
 * this plus the one guarantee it cannot make on its own.
 */
const pinnedDisplay = (answer: string, scramble: string, pinned: ReadonlySet<number>): string => {
  const pool = [...scramble]
  for (const index of pinned) {
    const at = pool.indexOf(answer[index])
    if (at >= 0) pool.splice(at, 1)
  }

  let next = 0
  return [...answer].map((letter, index) => (pinned.has(index) ? letter : (pool[next++] ?? letter))).join('')
}

/**
 * WHETHER THE PINS HAVE SETTLED THE WHOLE WORD, asked over the positions a rung did NOT reveal.
 *
 * At most one DISTINCT letter left is the whole condition, and it is one condition rather than the
 * two it looks like. Zero unpinned positions is a word entirely revealed; one is a word with a single
 * gap, and a gap that can hold only the one letter left in the row is not a gap. Both are the case a
 * player reads as "I have been given this word", which is why they get the same answer.
 *
 * THE THIRD CASE IS WHY IT COUNTS DISTINCT LETTERS RATHER THAN POSITIONS. Two or more positions left
 * whose letters are all the SAME letter -- SEES with both S's pinned -- is equally settled: every
 * arrangement of what remains spells the answer, so there is nothing left to work out and nothing
 * `drawnRun` could rearrange to avoid spelling it. A rule stated over position COUNT would call that
 * row unfinished, draw the answer on the plate, and leave the player typing out a word the board was
 * already showing them.
 *
 * NOTHING PINNED IS NEVER SETTLED, and that clause is load-bearing rather than defensive. `data` is
 * opaque JSON off the network, so an answer of one repeated letter is representable -- and without
 * the check, a board would hand that row over at mount, before the player had bought anything or
 * even read the theme.
 *
 * IT TAKES THE SPENT LIST RATHER THAN A PINNED SET, deliberately. Two callers ask this question --
 * the board, to decide what stands in the box, and the adapter, to decide what to store -- and if
 * they built the pinned set separately they could disagree about a row, which is the state where a
 * keystroke in row 3 silently clobbers the answer a rung put in row 1. One call, one answer.
 *
 * `answer` IS `unknown` for the reason `isEntry` and `entriesOf` are structural: isValidPuzzle leaves
 * `data` opaque, so the wire can deliver a number or nothing where a string is promised, and a guard
 * at each of two call sites is a guard that can be written twice and dropped once.
 */
export const isGivenAway = (answer: unknown, spent: ThemedAnagramsSpentRung[], entryIndex: number): boolean => {
  if (typeof answer !== 'string' || answer.length === 0) return false

  const pinned = pinnedIndices(spent, entryIndex, answer.length)
  return pinned.size > 0 && new Set([...answer].filter((_letter, at) => !pinned.has(at))).size <= 1
}

/**
 * The run the board actually draws: `pinnedDisplay`, plus the guarantee it cannot make on its own.
 *
 * THE ROW MUST NOT SPELL THE ANSWER. `pinnedDisplay` fills the unpinned positions from the scramble
 * in the scramble's own order and never looks at what that spells, so when the leftovers happen to
 * fall into place the plate quietly prints the word -- a rung that bought two letters handing over
 * seven. It is not rare on a hinted row: the free positions are few by then, and the arrangements
 * that spell the answer are a fixed fraction of very few.
 *
 * IT HOLDS ON AN UNHINTED ROW TOO, which follows from the rule rather than being aimed at. With
 * nothing pinned the run is the scramble, so this fires only on a pack that shipped an answer as its
 * own scramble -- which lull-api's severity dial makes impossible and `data` being opaque JSON makes
 * representable. Two tiles trade places and the row stops printing the word, which is a better answer
 * than drawing it.
 *
 * ONE SWAP, NOT A RESHUFFLE, and the difference is the whole reason this is a repair rather than a
 * different fill rule. `pinnedDisplay`'s contract is that a hint moves only what it bought -- the
 * tiles a player is mid-way through reading stay where they were reading them -- and re-drawing the
 * remainder would break that on exactly the rows where the player has the most invested. So the
 * first two unpinned positions holding different letters trade places and nothing else moves: on
 * `123__6` with 4 and 5 left, the row draws `123546`.
 *
 * THE MISSING PAIR IS THE ONLY REFUSAL, AND IT IS NOT A SECOND CHECK OF `settled`. Two rows reach
 * this with nothing to trade: a row whose unpinned positions all hold the same letter -- SEES with
 * both S's pinned -- where every arrangement spells the answer and there is nothing to hide, and a
 * blank answer, which spells itself vacuously and has no positions at all. Asking `settled` first
 * instead would answer both, and the branch that answered them would then be unreachable: a row with
 * two DIFFERENT letters left always has a pair to trade, because `run` is the answer here and its
 * free positions therefore hold the answer's own letters. So the search IS the question, and a
 * `settled` call in front of it would be an unreachable guard reading as a live hazard.
 */
export const drawnRun = (answer: string, scramble: string, pinned: ReadonlySet<number>): string => {
  const run = pinnedDisplay(answer, scramble, pinned)
  if (run !== answer) return run

  const free = [...answer].map((_letter, at) => at).filter((at) => !pinned.has(at))
  const other = free.find((at) => run[at] !== run[free[0]])
  if (other === undefined) return run

  const swapped = [...run]
  swapped[free[0]] = run[other]
  swapped[other] = run[free[0]]
  return swapped.join('')
}
