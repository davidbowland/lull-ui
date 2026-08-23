import { answerOf, hintsOf } from './hints'
import { goFigureData, goFigureHints, goFigurePuzzle, missingVowelsHints, missingVowelsPuzzle } from '@test/__mocks__'
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
    ['there are two hints', { hints: [{ text: 'one' }, { text: 'two' }] }],
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
  it('declines a puzzle that carries no phrase answer', () => {
    expect(answerOf(goFigurePuzzle)).toBeNull()
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
