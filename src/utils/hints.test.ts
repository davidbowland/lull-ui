import { hintsOf } from './hints'
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
