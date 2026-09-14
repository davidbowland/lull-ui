import { decode } from './mapping'
import { cryptogramSolve } from './solve'
import { cryptogramPuzzle } from '@test/__mocks__'
import { CryptogramData, Puzzle } from '@types'

describe('cryptogramSolve', () => {
  const PUZZLE = cryptogramPuzzle as Puzzle<unknown>

  // 'Ate ate tea' under 'VZQ VZQ ZQV': V is A, Z is T, Q is E, written in the sorted pair grammar
  // `encode` uses. Spelled out rather than computed, because an expectation built by calling
  // `trueMapping` would agree with this function however wrong both were.
  it('maps every cipher letter to the letter it stands for', () => {
    expect(cryptogramSolve(PUZZLE)).toEqual('QEVAZT')
  })

  // THE ROUND TRIP IS THE POINT, not the string. What the board restores from this has to be a board
  // the board's own codec accepts, and `decode` is the only thing that can say so -- a string that
  // encodes cleanly and decodes to nothing would pass the row above and put an empty grid on screen.
  it('composes a board the board’s own codec reads back', () => {
    const { ciphertext } = cryptogramPuzzle.data
    expect(decode(cryptogramSolve(PUZZLE), ciphertext).mapping).toEqual({ Q: 'E', V: 'A', Z: 'T' })
  })

  // A pack a player can genuinely be handed: `isValidPuzzle` leaves `data` opaque, so a puzzle whose
  // answer or ciphertext never arrived is a VALID pack with nothing to compose a finished board out
  // of. Null and not '' -- '' is what this codec spells "no progress" with, so writing it would mark
  // the puzzle solved while clearing every square the player had filled.
  it.each<[string, unknown]>([
    ['the answer never arrived', { ciphertext: 'VZQ' }],
    ['the ciphertext never arrived', { answer: 'Ate' }],
    ['neither letter stream has a letter in it', { answer: '123', ciphertext: '456' }],
    ['there is no data at all', null],
  ])('has no finished board to give when %s', (_description, data) => {
    expect(cryptogramSolve({ ...PUZZLE, data } as Puzzle<CryptogramData>)).toBeNull()
  })
})
