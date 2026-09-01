import { answerOf, hintsOf } from './hints'
import {
  goFigureData,
  goFigureHints,
  goFigurePuzzle,
  missingVowelsHints,
  missingVowelsPuzzle,
  themedAnagramsPuzzle,
} from '@test/__mocks__'
import { Puzzle } from '@types'

describe('hintsOf', () => {
  const withData = (data: unknown): Puzzle<unknown> => ({ ...missingVowelsPuzzle, data }) as Puzzle<unknown>

  it('returns the ladder from a phrase puzzle', () => {
    expect(hintsOf(missingVowelsPuzzle)).toEqual(missingVowelsHints)
  })

  // Go Figure used to be the reason this function could return null at all -- it carried no phrase,
  // so it carried no ladder. It carries one now, and the rungs place an operator rather than describe
  // a meaning, so the guard has to let it through unchanged.
  it('returns the ladder from a goFigure puzzle', () => {
    expect(hintsOf(goFigurePuzzle)).toEqual(goFigureHints)
  })

  // The regression this whole task exists to stop. Rungs shipped as bare strings until the wire
  // format changed, and a guard that still accepted them would hand the bar a ladder whose `.text` is
  // undefined -- a bar that renders three empty list items and reports nothing wrong.
  it('returns null when the rungs are still strings', () => {
    expect(hintsOf(withData({ ...goFigureData, hints: ['a', 'b', 'c'] }))).toBeNull()
  })

  // A pack is JSON off the network that was persisted. readPack deliberately leaves `data` opaque,
  // so this is the choke point for anything the frame dereferences inside it.
  it.each([
    ['data is not an object', 'hints'],
    ['data is null', null],
    ['hints is not an array', { hints: 'one, two, three' }],
    ['there are no hints', { hints: [] }],
    ['there are four hints', { hints: [{ text: 'one' }, { text: 'two' }, { text: 'three' }, { text: 'four' }] }],
    ['a hint is blank', { hints: [{ text: 'one' }, { text: '   ' }, { text: 'three' }] }],
    ['a hint text is not a string', { hints: [{ text: 'one' }, { text: 2 }, { text: 'three' }] }],
    ['a hint has no text at all', { hints: [{ text: 'one' }, { metadata: {} }, { text: 'three' }] }],
    ['a rung is null', { hints: [null, { text: 'two' }, { text: 'three' }] }],
    ['a rung is not an object', { hints: [{ text: 'one' }, 2, { text: 'three' }] }],
  ])('returns null when %s', (_description, data) => {
    expect(hintsOf(withData(data))).toBeNull()
  })
})

// THE ARRAY IS THE CONTRACT AND THE COUNT IS NOT. The wire has said one to three rungs since
// 2026-08-24, and crypticclue really ships two whenever its conditional rungs drop -- a ladder whose
// rung would have named the device the clue's own indicator announces is a rung worth dropping, so
// that bench legitimately arrives short. Under the old exact-three check `hintsOf` answered null on
// exactly those puzzles, and null is what the frame reads as "malformed, draw nothing": the bar
// vanished from the bench that had the most reason to offer one.
//
// Its own describe rather than rows on the table above, because these are the accepting cases and
// that table is the refusing one.
describe('hintsOf with a short ladder', () => {
  const withData = (data: unknown): Puzzle<unknown> => ({ ...missingVowelsPuzzle, data }) as Puzzle<unknown>

  it('accepts a two-rung ladder, which crypticclue really ships', () => {
    expect(hintsOf(withData({ hints: [{ text: 'One.' }, { text: 'Two.' }] }))).toHaveLength(2)
  })

  it('accepts a one-rung ladder', () => {
    expect(hintsOf(withData({ hints: [{ text: 'Only.' }] }))).toHaveLength(1)
  })

  // The floor and the ceiling, pinned from the accepting side as well as the refusing one. The table
  // above reddens a widened bound; these two redden a bound that was widened and then narrowed back.
  it('still accepts a three-rung ladder', () => {
    expect(hintsOf(withData({ hints: [{ text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }] }))).toHaveLength(3)
  })

  it('refuses an empty ladder, which promises a bar with nothing behind it', () => {
    expect(hintsOf(withData({ hints: [] }))).toBeNull()
  })

  it('refuses more than three rungs', () => {
    expect(hintsOf(withData({ hints: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] }))).toBeNull()
  })

  // A SHORT LADDER IS NOT A LICENSE FOR A BLANK RUNG. Widening the count is the only thing that
  // changed: one rung with nothing in it is still a bar that spends a press to print nothing.
  it('refuses a lone rung with no text', () => {
    expect(hintsOf(withData({ hints: [{ text: '' }] }))).toBeNull()
  })

  it('refuses a two-rung ladder whose second rung is blank', () => {
    expect(hintsOf(withData({ hints: [{ text: 'One.' }, { text: '   ' }] }))).toBeNull()
  })
})

// The sentence the shell's hint bar prints once every rung is spent. It is composed HERE rather than
// in the bar, because the bar serves benches whose answers are different kinds of thing -- a phrase
// reads as itself, a goFigure expression has to be redrawn with × and ÷ -- so each caller says its
// own sentence and the bar renders whatever it is handed.
describe('answerOf', () => {
  const withData = (data: unknown): Puzzle<unknown> => ({ ...missingVowelsPuzzle, data }) as Puzzle<unknown>

  it('states the answer a phrase puzzle carries', () => {
    expect(answerOf(missingVowelsPuzzle)).toBe('The answer is The Empire Strikes Back.')
  })

  // goFigure's answer is not a phrase and is not on `data.answer` at all -- the pack ships
  // `acceptedSolutions`, several of which are right. The board composes its own line; this function
  // must decline rather than invent one, and today the shell never renders a bar for that bench
  // anyway.
  //
  // NAMED FOR THE FIXTURE, not for a rule. "Carries no phrase answer" stopped being a reason to
  // decline the moment the entries branch existed -- a themed anagrams puzzle carries no phrase
  // answer either and gets a sentence. What is true of goFigure is that it carries NEITHER shape.
  it('declines a goFigure puzzle, which carries neither shape', () => {
    expect(answerOf(goFigurePuzzle)).toBeNull()
  })

  // ROW ORDER, so a player can read the sentence straight down the board. Serial comma, which is
  // American English and which also keeps the last two from reading as one item. Pinned as a whole
  // string rather than with a substring match, because a list is a place where "KETTLE, SAUCEPAN"
  // appearing inside something longer would be a different sentence.
  it('names every answer a themed anagrams puzzle carries, in row order', () => {
    expect(answerOf(themedAnagramsPuzzle)).toBe('The answers are KETTLE, SAUCEPAN, SKILLET, and SPATULA.')
  })

  // TWO words join with `and` and NO comma. Three or more take the serial comma before the last.
  // The wire type is a four-tuple, so neither of these two rows can arrive from a generator -- they
  // are here because this function is structural over untrusted JSON and a shorter array is a shape
  // it has to have an answer for.
  it('joins two answers with and, and no comma', () => {
    expect(answerOf(withData({ entries: [{ answer: 'KETTLE' }, { answer: 'SAUCEPAN' }] }))).toBe(
      'The answers are KETTLE and SAUCEPAN.',
    )
  })

  // THE SINGULAR, and it is why the branch exists at all: a one-entry array must not produce
  // "The answers are KETTLE."
  it('takes the singular for a one-entry list', () => {
    expect(answerOf(withData({ entries: [{ answer: 'KETTLE' }] }))).toBe('The answer is KETTLE.')
  })

  // THREE IS WHERE THE SERIAL COMMA FIRST APPEARS, and until this row nothing pinned it. The
  // two-entry row takes one side of `words.length < 3` and the four-entry row takes the other, so
  // branch coverage read 100% while the boundary itself was free to move: `< 4` printed `KETTLE and
  // SAUCEPAN and SKILLET` and the whole suite stayed green. Measured, not supposed.
  it('takes the serial comma from three answers on', () => {
    expect(answerOf(withData({ entries: [{ answer: 'KETTLE' }, { answer: 'SAUCEPAN' }, { answer: 'SKILLET' }] }))).toBe(
      'The answers are KETTLE, SAUCEPAN, and SKILLET.',
    )
  })

  // PRECEDENCE, stated rather than left to statement order. No wire type carries both, so this is a
  // rule about a pack that is already wrong -- and the older, narrower branch is the one that wins.
  it('prefers a top-level answer to a list of entries', () => {
    expect(answerOf(withData({ answer: 'TANGO', entries: [{ answer: 'KETTLE' }, { answer: 'SAUCEPAN' }] }))).toBe(
      'The answer is TANGO.',
    )
  })

  // EVERY MEMBER, never the first: a partial list prints "The answers are KETTLE, , SKILLET, and
  // SPATULA.", which spends the player's last press to say something malformed. That is the same
  // refusal a blank top-level answer already gets, for the same reason.
  //
  // The generic on `it.each` is load-bearing, exactly as it is on the cryptic bench's shape tables:
  // without it the rows infer as a union of seven object literals and every row is a type error at
  // the call site.
  //
  // ONE ROW HERE ISOLATES NOTHING, and it is named rather than left to be rediscovered. `an entry is
  // not an object` cannot be reddened by any mutation of the object check: drop `typeof entry ===
  // 'object'` and `'SAUCEPAN'.answer` is undefined, so the member check below refuses it anyway;
  // drop `entry !== null` and the null row catches that instead. The only thing the typeof clause
  // uniquely stops is an `undefined` array member, which JSON.parse cannot produce. It stays as a
  // specification row -- `hintsOf` documents the same reasoning two functions up, that a string
  // failing a property check is an accident rather than a guarantee -- but it defends no line.
  it.each<[string, unknown]>([
    ['entries is not an array', { entries: 'KETTLE' }],
    ['entries is empty', { entries: [] }],
    ['an entry is not an object', { entries: [{ answer: 'KETTLE' }, 'SAUCEPAN'] }],
    ['an entry is null', { entries: [{ answer: 'KETTLE' }, null] }],
    ['an entry has no answer at all', { entries: [{ answer: 'KETTLE' }, { scramble: 'UNASAPCE' }] }],
    ['an entry answer is not a string', { entries: [{ answer: 'KETTLE' }, { answer: 42 }] }],
    ['an entry answer is blank', { entries: [{ answer: 'KETTLE' }, { answer: '   ' }] }],
  ])('returns null when %s', (_description, data) => {
    expect(answerOf(withData(data))).toBeNull()
  })

  // Structural, in the same register as hintsOf: a pack is JSON off the network that was persisted,
  // and readPack deliberately leaves `data` opaque. A blank answer is refused rather than printed,
  // because "The answer is ." is a control that spends the player's last press to say nothing.
  it.each([
    ['data is not an object', 'answer'],
    ['data is null', null],
    ['the answer is missing', { hints: missingVowelsHints }],
    ['the answer is not a string', { answer: 42 }],
    ['the answer is blank', { answer: '   ' }],
  ])('returns null when %s', (_description, data) => {
    expect(answerOf(withData(data))).toBeNull()
  })
})
