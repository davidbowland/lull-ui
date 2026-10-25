import { missingVowelsSolve } from './solve'
import { missingVowelsPuzzle } from '@test/__mocks__'
import { MissingVowelsData, Puzzle } from '@types'

describe('missingVowelsSolve', () => {
  const PUZZLE = missingVowelsPuzzle as Puzzle<unknown>

  // The answer verbatim, vowels and spaces and all -- NOT the respaced consonant string the board
  // displays, whose spacing deliberately lies. Writing `displayed` would put the puzzle back on
  // screen in place of its answer.
  it('types the answer onto the line', () => {
    expect(missingVowelsSolve(PUZZLE)).toEqual('The Empire Strikes Back')
  })

  it('types a punctuated answer onto the line as the pack wrote it', () => {
    const punctuated = { ...PUZZLE, data: { answer: "HERE'S LOOKING AT YOU, KID" } } as Puzzle<MissingVowelsData>
    expect(missingVowelsSolve(punctuated)).toEqual("HERE'S LOOKING AT YOU, KID")
  })

  it.each<[string, unknown]>([
    ['the answer never arrived', { displayed: 'THMP RSTR KSBCK' }],
    ['the answer is blank', { answer: '   ' }],
    ['the answer is not a string', { answer: 7 }],
    ['there is no data at all', null],
  ])('has no finished board to give when %s', (_description, data) => {
    expect(missingVowelsSolve({ ...PUZZLE, data } as Puzzle<MissingVowelsData>)).toBeNull()
  })
})
