import { nextUnsolved } from './up-next'
import { Difficulty, Pack, Puzzle } from '@types'

// Built here rather than taken from a real pack, for the reason components/shelf gives about
// orderPuzzles: this is a ranking function, and the fixtures exist to make two puzzles differ in
// exactly one key at a time.
const puzzleFixture = (id: string, difficulty: Difficulty, type = 'gofigure'): Puzzle => ({
  data: {},
  difficulty,
  estimatedSeconds: 60,
  id,
  type: type as Puzzle['type'],
})

const packFixture = (date: string, puzzles: Puzzle[]): Pack => ({ complete: true, date, puzzles })

describe('nextUnsolved', () => {
  it('picks the gentlest unsolved puzzle on the device', () => {
    const packs = [
      packFixture('2026-08-25', [puzzleFixture('2026-08-25:gofigure:aa', 4)]),
      packFixture('2026-08-24', [puzzleFixture('2026-08-24:gofigure:bb', 1)]),
    ]

    expect(nextUnsolved({ packs, solved: new Set() })?.puzzle.id).toEqual('2026-08-24:gofigure:bb')
  })

  it('reports the date the pick came from', () => {
    const packs = [packFixture('2026-08-20', [puzzleFixture('2026-08-20:gofigure:aa', 2)])]

    expect(nextUnsolved({ packs, solved: new Set() })?.date).toEqual('2026-08-20')
  })

  it('skips a solved puzzle', () => {
    const packs = [
      packFixture('2026-08-25', [
        puzzleFixture('2026-08-25:gofigure:aa', 1),
        puzzleFixture('2026-08-25:gofigure:bb', 3),
      ]),
    ]
    const solved = new Set(['2026-08-25:gofigure:aa'])

    expect(nextUnsolved({ packs, solved })?.puzzle.id).toEqual('2026-08-25:gofigure:bb')
  })

  // The shelf already lists the day on screen, so recommending out of it would point at a row
  // eighteen pixels above the panel. connections' nextUnplayed takes `current` for the same reason.
  it('never picks from the day already on screen', () => {
    const packs = [
      packFixture('2026-08-25', [puzzleFixture('2026-08-25:gofigure:aa', 1)]),
      packFixture('2026-08-24', [puzzleFixture('2026-08-24:gofigure:bb', 5)]),
    ]

    expect(nextUnsolved({ excludeDate: '2026-08-25', packs, solved: new Set() })?.puzzle.id).toEqual(
      '2026-08-24:gofigure:bb',
    )
  })

  // "Never name a puzzle it cannot open" is the rule the whole option holds to. A Phrazle with no
  // word list on the device is a row the shell would refuse to mount.
  it('skips a puzzle the caller says is not playable', () => {
    const packs = [
      packFixture('2026-08-25', [
        puzzleFixture('2026-08-25:phrazle:aa', 1, 'phrazle'),
        puzzleFixture('2026-08-25:gofigure:bb', 4),
      ]),
    ]

    const pick = nextUnsolved({ packs, playable: (puzzle) => puzzle.type !== 'phrazle', solved: new Set() })

    expect(pick?.puzzle.id).toEqual('2026-08-25:gofigure:bb')
  })

  it('returns null when everything is solved', () => {
    const packs = [packFixture('2026-08-25', [puzzleFixture('2026-08-25:gofigure:aa', 1)])]

    expect(nextUnsolved({ packs, solved: new Set(['2026-08-25:gofigure:aa']) })).toBeNull()
  })

  it('returns null for an empty device', () => {
    expect(nextUnsolved({ packs: [], solved: new Set() })).toBeNull()
  })

  // Totality, the same property orderPuzzles guarantees. Two puzzles of equal difficulty on
  // different days must not depend on which order the packs happened to arrive in.
  it('breaks a difficulty tie with the more recent day', () => {
    const packs = [
      packFixture('2026-08-24', [puzzleFixture('2026-08-24:gofigure:zz', 2)]),
      packFixture('2026-08-25', [puzzleFixture('2026-08-25:gofigure:aa', 2)]),
    ]

    expect(nextUnsolved({ packs, solved: new Set() })?.date).toEqual('2026-08-25')
  })

  // The same two candidates in the other order, and it is the order production actually uses:
  // cachedPackDates returns dates newest-first, so the shelf always hands this function its packs
  // reversed from the test above. "The answer cannot change between two reads of the same device"
  // is a claim about the comparator, not about the list, so it has to be asserted from both ends.
  it('picks the same day whichever order the packs arrive in', () => {
    const packs = [
      packFixture('2026-08-25', [puzzleFixture('2026-08-25:gofigure:aa', 2)]),
      packFixture('2026-08-24', [puzzleFixture('2026-08-24:gofigure:zz', 2)]),
    ]

    expect(nextUnsolved({ packs, solved: new Set() })?.date).toEqual('2026-08-25')
  })

  it('breaks a same-day difficulty tie with the id', () => {
    const packs = [
      packFixture('2026-08-25', [
        puzzleFixture('2026-08-25:gofigure:zz', 2),
        puzzleFixture('2026-08-25:gofigure:aa', 2),
      ]),
    ]

    expect(nextUnsolved({ packs, solved: new Set() })?.puzzle.id).toEqual('2026-08-25:gofigure:aa')
  })
})
