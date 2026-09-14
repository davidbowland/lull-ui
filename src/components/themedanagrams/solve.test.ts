import { decode } from './progress'
import { themedAnagramsSolve } from './solve'
import { themedAnagramsPuzzle } from '@test/__mocks__'
import { Puzzle, ThemedAnagramsData } from '@types'

describe('themedAnagramsSolve', () => {
  const PUZZLE = themedAnagramsPuzzle as Puzzle<unknown>

  it('stands all four answers in their own rows', () => {
    expect(themedAnagramsSolve(PUZZLE)).toEqual('KETTLE\nSAUCEPAN\nSKILLET\nSPATULA')
  })

  // Row order is WIRE order, and it is the one thing a four-row write can get silently wrong: the
  // rungs carry ordinals into this same array, so a board that reordered these would break its own
  // hints as well as its answers.
  it('keeps the rows in the order the pack sent them', () => {
    expect(decode(themedAnagramsSolve(PUZZLE) ?? '').guesses).toEqual(['KETTLE', 'SAUCEPAN', 'SKILLET', 'SPATULA'])
  })

  // FOUR OR NOTHING, the refusal `entriesOf` and the board itself both make. A half-revealed board --
  // three answers standing and a fourth row blank -- is a state with no way to read it, and `Guesses`
  // is a 4-tuple besides.
  it.each<[string, unknown]>([
    ['the entries never arrived', { theme: 'Kitchen tools' }],
    ['the entries are not a list', { entries: 'KETTLE' }],
    ['there are three of them', { entries: themedAnagramsPuzzle.data.entries.slice(0, 3) }],
    ['one entry is not an object', { entries: ['KETTLE', ...themedAnagramsPuzzle.data.entries.slice(1)] }],
    ['there is no data at all', null],
  ])('has no finished board to give when %s', (_description, data) => {
    expect(themedAnagramsSolve({ ...PUZZLE, data } as Puzzle<ThemedAnagramsData>)).toBeNull()
  })

  // One blank answer refuses the WHOLE board rather than filling three rows, which is the same
  // all-or-nothing `answerOf` applies to the sentence it composes for this bench.
  it('has no finished board to give when one answer never arrived', () => {
    const entries = [{ answer: '', scrambles: ['ELKTET'] }, ...themedAnagramsPuzzle.data.entries.slice(1)]
    expect(themedAnagramsSolve({ ...PUZZLE, data: { entries, theme: 'Kitchen tools' } } as Puzzle<unknown>)).toBeNull()
  })
})
