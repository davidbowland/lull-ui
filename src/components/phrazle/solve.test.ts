import { encode } from './progress'
import { phrazleSolve } from './solve'
import { phrazlePuzzle } from '@test/__mocks__'
import { PhrazleData, Puzzle } from '@types'

describe('phrazleSolve', () => {
  const PUZZLE = phrazlePuzzle as Puzzle<unknown>

  it('stands the answer in the board’s last row', () => {
    expect(phrazleSolve(PUZZLE, '')).toEqual('{"guesses":["TOE HOLD"]}')
  })

  // APPENDED, NOT WRITTEN OVER, which is this bench's whole reason for taking the progress at all. A
  // committed guess is the player's record of the game; a reveal that replaced the rows would read as
  // having lost the session rather than as having been answered.
  it('keeps the rows the player already committed', () => {
    expect(phrazleSolve(PUZZLE, encode(['HOT HAND', 'OLD HOLE']))).toEqual(
      '{"guesses":["HOT HAND","OLD HOLE","TOE HOLD"]}',
    )
  })

  // THE REVEAL IS REACHABLE ON A WON BOARD. The bar deliberately stands after a win -- the ladder is
  // worth reading once you have the phrase -- so a ladder with a step left can sell the answer to a
  // player who already typed it. A second identical row is a guess they never made.
  it('adds no second row to a board that already guessed the phrase', () => {
    expect(phrazleSolve(PUZZLE, encode(['HOT HAND', 'TOE HOLD']))).toEqual('{"guesses":["HOT HAND","TOE HOLD"]}')
  })

  // Canonical on both sides, which is what makes the row above hold for a pack whose answer is spelled
  // with slack in it. `markGuess` works on canonical words, so a row whose characters are not the
  // characters the marker marks would restore uncolored.
  it('writes the answer in the form the marker marks', () => {
    const slack = { ...PUZZLE, data: { answer: '  TOE   HOLD ' } } as Puzzle<PhrazleData>
    expect(phrazleSolve(slack, '')).toEqual('{"guesses":["TOE HOLD"]}')
  })

  it.each<[string, unknown]>([
    ['the answer never arrived', {}],
    ['the answer is blank', { answer: '   ' }],
    ['the answer is not a string', { answer: 7 }],
    ['there is no data at all', null],
  ])('has no finished board to give when %s', (_description, data) => {
    expect(phrazleSolve({ ...PUZZLE, data } as Puzzle<PhrazleData>, '')).toBeNull()
  })
})
