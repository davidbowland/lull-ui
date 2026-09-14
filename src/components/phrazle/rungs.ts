import { splitPhrase } from '@rules/is-valid-guess'

import { STRONGEST_FIRST, WEAKEST_FIRST } from './letter-strengths'

// THE PHRAZLE HINT LADDER: which rung to sell next, and what that rung says. lull-ui owns this file
// outright. It sat in src/rules/ while that directory meant "vendored from lull-api", but nothing in
// lull-api's src/ ever imported it, so it moved here beside the board that does.
//
// IT STILL READS ONE VENDORED RULE, and that is the expected direction rather than a leftover.
// `splitPhrase` comes from @rules/is-valid-guess, which lull-api genuinely imports and which
// therefore stays vendored under the rule in CLAUDE.md. An app-owned file reading a shared rule costs
// nothing; a shared rule reading an app-owned one would put a file lull-api cannot compile into its
// bundle. `letter-strengths.ts` is the other import and it is a sibling now -- it travelled here
// because this was the only file that ever read it.
//
// It lives here rather than shipping as data on the puzzle because it runs over the guesses a player
// invents at play time, which no generator can enumerate in advance. lull-api ships no phrazle hints
// at all; the sweep is test/rungs-sweep.test.ts, which travelled with it.
//
// THE THREE RUNGS ARE ABOUT THE ALPHABET, NOT THE PHRASE'S MEANING, and that is the whole point of
// replacing the ladder that stood here. A Phrazle player is doing letter work: which letters are in
// play, which are wasted. A rung that describes what the phrase MEANS is aimed at a different game,
// and a rung that names a tile position is aimed at a board four guesses have already colored in.

export type PhrazleSpentRung =
  { index: number; kind: 'word' } | { kind: 'absent'; letters: string } | { kind: 'present'; letters: string }

export interface PhrazleHintData {
  answer: string
}

export interface PhrazlePlayerState {
  guesses: string[]
}

const RUNG_COUNT = 3
const LETTERS_PER_RUNG = 3

// The window rung 1 draws from. Ten rather than three so the draw has somewhere to go: picking the
// three strongest absent letters every time would make the rung identical on every puzzle sharing a
// letter set, which is the variety this change exists to add.
const ABSENT_WINDOW = 10

// The letters this rung will not spend more than one of its three slots on.
//
// IT IS A CEILING ON THE RUNG, NOT A FLOOR UNDER THE POOL, and the difference is the whole design. A
// frequency floor was the obvious fix and is the wrong one: it takes the rung away in exactly the
// state where the player has ruled out everything above the floor, and "no Q" alongside two letters
// they might actually have tried is a fair third of a hint. What is not a hint is all three at once.
//
// WHY THE POOL GETS HERE AT ALL. `ABSENT_WINDOW` is applied AFTER the player's own guesses are
// filtered out, so it does not hold the ten strongest absent letters for long -- it holds the ten
// strongest SURVIVORS. Measured on TOE HOLD, one guess at a time, the pool runs ARINSCUPMG,
// RINCUPMGBF, UPMGBFYWKV, UGBFYWKVXZ, FYWKVXZJQ. By the fourth guess -- about when a player reaches
// for a hint -- every letter left is under 2%, and the draw over it is uniform and always was: 82 of
// the 84 possible three-letter draws appeared across 400 puzzle ids, per-letter hits 122 to 142
// against an expectation of 133. From a nine-letter pool, P(a draw of three contains Q, Z or X) is
// 1 - C(6,3)/C(9,3) = 76%, so a WORKING shuffle strikes one of them three times out of four. The
// shuffle was never the defect; the pool having nothing else in it was.
//
// J IS NOT IN THIS SET AND IS THE RAREST LETTER IN THE TABLE -- 0.1965 against Q's 0.1962, a
// difference of three ten-thousandths. It is left out because the set is the one named in the
// request, not because the arithmetic distinguishes them. Adding it is one entry here and nothing
// else; the two rows in rungs.test.ts that pin the cap read the set through this constant's
// behavior rather than restating it.
const RARE_LETTERS: ReadonlySet<string> = new Set(['Q', 'X', 'Z'])

// How many of the rung's letters are drawn before the rare ones are let in. Two of three, so a rung
// carries at most one rare letter whenever the pool holds two that are not.
const COMMON_PER_RUNG = 2

// This type's own cap, and it is derived rather than asserted. The longest rung this composer can
// produce is the word sentence: a 42-character frame -- "Word 1 uses these letters, alphabetized: "
// and the closing period -- plus the letter list. MAX_WORD_LETTERS in
// generators/phrazle/difficulty.ts is 11, so the list is at most
// "A, B, C, D, E, F, G, H, I, J, and K" -- eleven letters, nine ", " separators and one ", and " --
// which is 35 characters, and the whole sentence 77.
//
// THAT LEAVES THREE CHARACTERS, which is why the arithmetic is spelled out rather than waved at. An
// earlier revision of this comment derived 65 from a MAX_WORD_LETTERS of 7, which is not and has
// never been the value in that file; the cap held by luck rather than by the reasoning given for it.
// A longer frame does not fit. Widening the frame, or a floor that admits a twelfth letter, breaks
// the cap and must move it deliberately.
//
// Asserted in the test rather than enforced here: a composer that cannot reach anything unbounded
// has nothing to reject, and a clamp would truncate a letter list into a false hint.
export const MAX_PHRAZLE_RUNG_LENGTH = 80

/**
 * A deterministic number source from a string seed -- mulberry32 over a cheap string hash.
 *
 * IT EXISTS FOR REPRODUCIBILITY, NOT FOR STABILITY. A rung is frozen into the board's progress the
 * moment it is bought, so re-opening it never re-draws and does not depend on this. What the seed
 * buys is a fixture sweep whose failures are repeatable and a caller that behaves the same on two
 * machines. The caller seeds it from the puzzle id.
 */
export const seededRandom = (seed: string): (() => number) => {
  let state = 0x6d2b79f5
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 2654435761)
    state >>>= 0
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const lettersOf = (words: string[]): Set<string> => new Set(words.join(''))

/** Every letter the player has put on the board, in any guess. */
const guessedLetters = (state: PhrazlePlayerState): Set<string> =>
  new Set(state.guesses.flatMap((guess) => [...splitPhrase(guess).join('')]))

/** A partial Fisher-Yates draw: `count` members of `pool`, without replacement. */
const draw = (pool: readonly string[], count: number, random: () => number): string[] => {
  const shuffled = [...pool]
  const taken = Math.min(count, shuffled.length)
  for (let index = 0; index < taken; index += 1) {
    const swap = index + Math.floor(random() * (shuffled.length - index))
    const held = shuffled[index]
    shuffled[index] = shuffled[swap]
    shuffled[swap] = held
  }
  return shuffled.slice(0, taken)
}

// Sorted so the stored record has ONE spelling per choice, which is what lets a frozen rung compare
// equal to itself across a reload. The draw stays random; only the way it is written down is fixed.
const canonical = (letters: readonly string[]): string => [...letters].sort().join('')

/**
 * The letters one absent rung names: two drawn with the rare letters held back, then the rest drawn
 * from the whole pool.
 *
 * TWO DRAWS RATHER THAN A FILTER AND A TOP-UP BY LENGTH, because the second draw has to be able to
 * reach a rare letter even when the first found two common ones -- that is the third slot, and it is
 * the reason this is a ceiling rather than a ban. `rest` is the WHOLE pool minus what was already
 * taken, not the rare letters alone, so the third slot is a fair draw over everything left.
 *
 * THE SHORTFALL CASE IS THE SAME EXPRESSION. `draw` takes `min(count, pool.length)`, so a common pool
 * of one yields one letter and `LETTERS_PER_RUNG - common.length` asks for two from the rest -- which
 * is how "if the first two have nothing but Q, Z and X to offer, they may use them" falls out without
 * a branch. A common pool of none yields none, and all three slots come from the rest.
 *
 * It never returns more than `LETTERS_PER_RUNG`, and that holds by arithmetic rather than by a clamp:
 * `common.length` is at most `COMMON_PER_RUNG`, which is less than `LETTERS_PER_RUNG`.
 */
const drawAbsent = (pool: readonly string[], random: () => number): string[] => {
  const common = draw(
    pool.filter((letter) => !RARE_LETTERS.has(letter)),
    COMMON_PER_RUNG,
    random,
  )
  const rest = pool.filter((letter) => !common.includes(letter))
  return [...common, ...draw(rest, LETTERS_PER_RUNG - common.length, random)]
}

/**
 * The next rung, or null when the ladder is spent or no kind has anything left worth saying.
 *
 * THE LADDER TAKES THE FIRST KIND THAT STILL HAS SOMETHING TO SAY, not the kind at position
 * `spent.length`, and that distinction is a bug fix rather than a refinement. Each kind draws from
 * its own pool, and a positional ladder returned null the moment the pool AT THAT POSITION was
 * empty -- which killed every LATER rung too. TOE HOLD after the single guess DOT HELL is the
 * worked case: that guess touches T, O, E, H, L and D, so rung 2's pool of unmet present letters is
 * empty, and the player lost the word rung permanently. Backwards, because the word rung is exactly
 * what still helps them -- they know every letter in the phrase and still do not know which word
 * each one is in.
 *
 * The preference order is unchanged, so a fresh board produces the ladder it always did: absent
 * letters prune the search, present letters aim it, a word's letters are most of a word. Each kind
 * is used at most once, `null` now means no kind has anything left, and that is the only honest
 * reason to shorten the ladder.
 *
 * WHAT THE PLAYER ALREADY KNOWS IS COMPUTED AGAINST THE ANSWER, which this board already holds in
 * plaintext, rather than by re-deriving tile colors. A letter that has appeared in any guess has
 * been answered by the board one way or the other, so it is spent information either way.
 *
 * `random` IS REQUIRED. It has no honest default here: the spec's "a seed derived from the puzzle
 * id" is unreachable in a module that never sees a puzzle id, and defaulting to Math.random would
 * hand a caller who forgot it a speculative rung that re-draws on every render. A required
 * parameter makes that a compile error instead of a play-time surprise.
 */
export const choosePhrazleRung = (
  data: PhrazleHintData,
  state: PhrazlePlayerState,
  spent: PhrazleSpentRung[],
  random: () => number,
): PhrazleSpentRung | null => {
  // Counts rather than kinds, and it is reachable: stored progress is untrusted, so a malformed
  // record can name one kind three times and would otherwise buy a fourth rung below.
  if (spent.length >= RUNG_COUNT) return null

  const words = splitPhrase(data.answer)
  if (words.length === 0) return null

  const present = lettersOf(words)
  const guessed = guessedLetters(state)
  const used = new Set(spent.map((rung) => rung.kind))

  if (!used.has('absent')) {
    // Strongest first, absent from the phrase, not already ruled out -- then the window, then the
    // draw. Filtering BEFORE the window is what widens it: a player who has ruled out four of the
    // ten strongest gets the next four pulled up rather than a shorter pool.
    const pool = STRONGEST_FIRST.filter((letter) => !present.has(letter) && !guessed.has(letter)).slice(
      0,
      ABSENT_WINDOW,
    )
    if (pool.length > 0) return { kind: 'absent', letters: canonical(drawAbsent(pool, random)) }
  }

  if (!used.has('present')) {
    // The rarest present letters, because they are the ones a player is least likely to try.
    const pool = WEAKEST_FIRST.filter((letter) => present.has(letter) && !guessed.has(letter)).slice(
      0,
      LETTERS_PER_RUNG,
    )
    if (pool.length > 0) return { kind: 'present', letters: canonical(pool) }
  }

  if (used.has('word')) return null

  // The word holding the most letters the player has not yet met, ties broken by length and then by
  // position, so the choice is total. Its pool CANNOT run dry: a phrase with at least one word
  // always has a word whose letters the player does not know the placement of, which is what this
  // rung sells -- unlike the two letter rungs, whose pools a diligent player empties.
  let best = 0
  let bestUnknown = -1
  words.forEach((word, index) => {
    const unknown = new Set([...word].filter((letter) => !guessed.has(letter))).size
    const better = unknown > bestUnknown || (unknown === bestUnknown && word.length > words[best].length)
    if (better) {
      best = index
      bestUnknown = unknown
    }
  })

  return { index: best, kind: 'word' }
}

// "A and B" on two, "A, B, and C" on three or more -- the serial comma joins a LIST, and on two
// items it is a comma splice. The same rule utils/hints.ts already applies to its answer sentence,
// restated here rather than imported. The original reason was vendoring -- this file was copied into
// lull-ui and could not reach a lull-ui utility -- and that reason left with the copy. What stands is
// that a board directory reaching into the shell's utilities to share four lines of punctuation is a
// worse trade than typing them twice.
//
// TWO IS ROUTINE, NOT AN EDGE: rung 2 draws from the present letters a player has not met, and two
// survivors is normal after a couple of guesses; the word rung hits it on any two-letter word.
//
// One joiner for all three rungs so they cannot drift apart.
const list = (parts: string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : parts.length === 2
      ? parts.join(' and ')
      : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`

/**
 * The sentence for a frozen rung. Pure in `data`, so a spent rung reads the same forever.
 *
 * THE WORD RUNG ALPHABETIZES rather than shuffling. It is deterministic, needs no seed, cannot
 * accidentally spell the answer, and is the same idea Themed Anagrams uses as its anagram class key.
 * Out of order with respect to the word is all the rung promises.
 *
 * AND THE SENTENCE SAYS SO. "Word 2 is made from the letters D, H, L, and O" invites a player to
 * read a spelling off a list that is alphabetical, which is worse than no order at all -- a hint
 * that misleads costs more than one that stays quiet. Naming the ordering costs 9 characters and
 * removes the reading. The list keeps one entry per CELL, so a repeated letter appears once per
 * occurrence: BANANA gives "A, A, A, B, N, and N", which reads oddly and tells the player the
 * letter multiset, and the multiset is most of what a Phrazle word rung is worth.
 */
export const phrazleHintFor = (data: PhrazleHintData, rung: PhrazleSpentRung): { text: string } => {
  if (rung.kind === 'absent') {
    // "no" repeats on every member rather than distributing across the list. "The phrase has no D,
    // G, and P" reads as one absent thing spelled oddly; repeating the word makes three facts.
    return { text: `The phrase has ${list([...rung.letters].map((letter) => `no ${letter}`))}.` }
  }
  if (rung.kind === 'present') {
    return { text: `The phrase contains ${list([...rung.letters])}.` }
  }
  const word = splitPhrase(data.answer)[rung.index] ?? ''
  return { text: `Word ${rung.index + 1} uses these letters, alphabetized: ${list([...word].sort())}.` }
}
