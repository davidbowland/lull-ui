import { summarizeDay } from './day-summary'
import { Difficulty, Pack, Puzzle } from '@types'

const puzzleFixture = (id: string, difficulty: Difficulty = 1): Puzzle => ({
  data: {},
  difficulty,
  estimatedSeconds: 60,
  id,
  type: 'gofigure',
})

const packFixture = (date: string, puzzles: Puzzle[]): Pack => ({ complete: true, date, puzzles })

describe('summarizeDay', () => {
  // The whole reason this function exists. Solved ids carry a date prefix and are kept forever;
  // packs are dropped after seven days. So the count is answerable for any date on the calendar and
  // the total is answerable only for a day in hand -- which is why nothing here returns one.
  it('counts solved puzzles for a day whose pack is gone', () => {
    const solved = new Set(['2026-03-14:gofigure:aa', '2026-03-14:cryptogram:bb', '2026-08-25:gofigure:cc'])

    expect(summarizeDay('2026-03-14', null, solved).solvedCount).toBe(2)
  })

  it('reports a day with no pack as not here', () => {
    expect(summarizeDay('2026-03-14', null, new Set()).status).toEqual('notHere')
  })

  it('reports a day with an unsolved puzzle as having something to open', () => {
    const pack = packFixture('2026-08-25', [puzzleFixture('2026-08-25:gofigure:aa')])

    expect(summarizeDay('2026-08-25', pack, new Set()).status).toEqual('hasUnsolved')
  })

  // "All solved" is the same series as "6 solved" and reports a win. The row stops being a control
  // here, so getting this wrong makes a finished day unpressable or a live day dead.
  it('reports a fully solved day as all solved', () => {
    const pack = packFixture('2026-08-25', [
      puzzleFixture('2026-08-25:gofigure:aa'),
      puzzleFixture('2026-08-25:gofigure:bb'),
    ])
    const solved = new Set(['2026-08-25:gofigure:aa', '2026-08-25:gofigure:bb'])

    expect(summarizeDay('2026-08-25', pack, solved).status).toEqual('allSolved')
  })

  it('reports a partly solved day as having something to open', () => {
    const pack = packFixture('2026-08-25', [
      puzzleFixture('2026-08-25:gofigure:aa'),
      puzzleFixture('2026-08-25:gofigure:bb'),
    ])

    expect(summarizeDay('2026-08-25', pack, new Set(['2026-08-25:gofigure:aa'])).status).toEqual('hasUnsolved')
  })

  // An empty pack reaches the client only through a poisoned key -- get-pack-by-date answers 404 on
  // zero puzzles. `every` is vacuously true over an empty array, so without this guard an empty day
  // would report itself solved and go unpressable with nothing behind it.
  it('does not report an empty pack as all solved', () => {
    expect(summarizeDay('2026-08-25', packFixture('2026-08-25', []), new Set()).status).toEqual('notHere')
  })

  it('ignores solved ids from other days', () => {
    const solved = new Set(['2026-08-24:gofigure:aa'])

    expect(summarizeDay('2026-08-25', null, solved).solvedCount).toBe(0)
  })

  it('echoes the date it was asked about', () => {
    expect(summarizeDay('2026-03-14', null, new Set()).date).toEqual('2026-03-14')
  })
})
