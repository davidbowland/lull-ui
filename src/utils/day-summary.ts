import { Pack, PackDate } from '@types'
import { packDateOf } from '@utils/pack-dates'

// What the day panel may say about a day it has not opened.
//
// THERE IS NO DENOMINATOR HERE AND THERE MUST NOT BE ONE. Packs live seven days; solved ids live
// forever in lull:meta and carry a date prefix. So "how many did I solve on 14 March" is answerable
// for every date on the calendar, and "how many did 14 March hold" is answerable only for a day
// still in hand. A row reading "3 of 6" would work on the top seven rows of the panel and die on the
// eighth -- teaching a number the list cannot keep, which is worse than never offering it.
export type DayStatus = 'allSolved' | 'hasUnsolved' | 'notHere'

export interface DaySummary {
  date: PackDate
  solvedCount: number
  status: DayStatus
}

export const summarizeDay = (date: PackDate, pack: Pack | null, solved: ReadonlySet<string>): DaySummary => {
  // The date prefix is the one part of a puzzle id a client may read. Counted off the solved set
  // rather than off the pack, which is the whole point: this number survives the pack.
  const solvedCount = [...solved].filter((puzzleId) => packDateOf(puzzleId) === date).length

  // `puzzles.length > 0` before `every`, and it is load-bearing rather than defensive. `every` is
  // vacuously true over an empty array, so an empty pack would report itself allSolved -- and
  // allSolved rows are not controls, so the day would go unpressable with nothing behind it. An
  // empty pack should not reach here (get-pack-by-date answers 404 on zero puzzles) but a poisoned
  // localStorage key can produce one, and readPack validates shape rather than emptiness.
  const status: DayStatus =
    pack === null || pack.puzzles.length === 0
      ? 'notHere'
      : pack.puzzles.every((puzzle) => solved.has(puzzle.id))
        ? 'allSolved'
        : 'hasUnsolved'

  return { date, solvedCount, status }
}
