import { Pack, PackDate, Puzzle } from '@types'

export interface UpNextPick {
  date: PackDate
  puzzle: Puzzle
}

export interface NextUnsolvedOptions {
  // The day already on screen. The shelf lists it directly above the panel, so a pick out of it
  // would point at a row the reader can already see -- connections' nextUnplayed takes `current`
  // for the same reason.
  excludeDate?: PackDate
  // The packs ON THE DEVICE. Never the list of dates: this function may only name a puzzle it can
  // see, which is what "never name a puzzle it cannot open" reduces to in code.
  packs: Pack[]
  // Whether this build can actually mount the puzzle right now. The shell asks the registry and the
  // dictionary; this function is told the answer rather than reaching for either, because it has no
  // business knowing what a word list is.
  playable?: (puzzle: Puzzle) => boolean
  solved: ReadonlySet<string>
}

// Plain string order, never localeCompare: an id is ASCII, and collation differs between engines and
// locales -- which would make the pick device-dependent. Same rule components/shelf states for its
// own tie-break.
//
// The name undersells it: the comparator below runs this over DATES as well, and a PackDate sorts
// the same way for the same reason. So the `0` arm is not a formality about duplicate ids -- two
// puzzles out of one pack have equal dates, and it is the arm that hands the tie down to the id.
const byId = (first: string, second: string): number => (first < second ? -1 : first > second ? 1 : 0)

/**
 * The gentlest puzzle the player has not solved, from any day on the device.
 *
 * A TOTAL order, for the reason orderPuzzles gives: difficulty first, then the more recent day, then
 * the id. No two candidates can compare equal, so the answer cannot change between two reads of the
 * same device -- and a recommendation that moved on refresh would be worse than none.
 *
 * "Gentlest" is the RULE, and it is the thing most likely to be wrong. It will keep serving Gentle
 * puzzles until the window is swept, which is fine for a seven-day pool and would not be for a
 * larger one. It is one comparator in one pure function precisely so changing it is cheap.
 */
export const nextUnsolved = ({ excludeDate, packs, playable, solved }: NextUnsolvedOptions): UpNextPick | null => {
  const candidates = packs
    .filter((pack) => pack.date !== excludeDate)
    .flatMap((pack) => pack.puzzles.map((puzzle) => ({ date: pack.date, puzzle })))
    .filter(({ puzzle }) => !solved.has(puzzle.id) && (playable === undefined || playable(puzzle)))

  // Sorted rather than reduced, because the comparator IS the rule and a reduce would bury it in an
  // accumulator. The list is one device's worth -- about thirty puzzles -- so the cost is nothing.
  const [pick] = candidates.toSorted(
    (first, second) =>
      first.puzzle.difficulty - second.puzzle.difficulty ||
      byId(second.date, first.date) ||
      byId(first.puzzle.id, second.puzzle.id),
  )

  return pick ?? null
}
