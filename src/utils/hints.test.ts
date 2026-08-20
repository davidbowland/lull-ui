import { hintsOf } from './hints'
import { goFigurePuzzle, missingVowelsHints, missingVowelsPuzzle } from '@test/__mocks__'
import { Puzzle } from '@types'

describe('hintsOf', () => {
  const withData = (data: unknown): Puzzle<unknown> => ({ ...missingVowelsPuzzle, data }) as Puzzle<unknown>

  it('returns the ladder from a phrase puzzle', () => {
    expect(hintsOf(missingVowelsPuzzle)).toEqual(missingVowelsHints)
  })

  // goFigure has no phrase in it at all, which is the case this guard exists for: PuzzleFrame asks
  // every puzzle and must get null for the ones that carry no ladder.
  it('returns null for a puzzle with no hints', () => {
    expect(hintsOf(goFigurePuzzle)).toBeNull()
  })

  // A pack is JSON off the network that was persisted. readPack deliberately leaves `data` opaque,
  // so this is the choke point for anything the frame dereferences inside it.
  it.each([
    ['data is not an object', 'hints'],
    ['data is null', null],
    ['hints is not an array', { hints: 'one, two, three' }],
    ['there are two hints', { hints: ['one', 'two'] }],
    ['there are four hints', { hints: ['one', 'two', 'three', 'four'] }],
    ['a hint is blank', { hints: ['one', '   ', 'three'] }],
    ['a hint is not a string', { hints: ['one', 2, 'three'] }],
  ])('returns null when %s', (_description, data) => {
    expect(hintsOf(withData(data))).toBeNull()
  })
})
