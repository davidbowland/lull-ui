import { crypticClueSolve } from './solve'
import { crypticCluePuzzle } from '@test/__mocks__'
import { CrypticClueData, Puzzle } from '@types'

describe('crypticClueSolve', () => {
  const PUZZLE = crypticCluePuzzle as Puzzle<unknown>

  // The answer and not the clue, which is the one confusion available on a bench where both are
  // strings on `data` and only one of them is what the player types.
  it('types the answer onto the line', () => {
    expect(crypticClueSolve(PUZZLE)).toEqual('TANGO')
  })

  it.each<[string, unknown]>([
    ['the answer never arrived', { clue: 'Brown and leave for a dance' }],
    ['the answer is blank', { answer: '   ' }],
    ['the answer is not a string', { answer: 7 }],
    ['there is no data at all', null],
  ])('has no finished board to give when %s', (_description, data) => {
    expect(crypticClueSolve({ ...PUZZLE, data } as Puzzle<CrypticClueData>)).toBeNull()
  })
})
