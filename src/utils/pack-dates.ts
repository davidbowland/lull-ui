import { PackDate } from '@types'

// Ported from connections-ui/src/utils/game-ids.ts. Three of its five exports are
// deliberately left behind:
//
//   allGameIds / FIRST_GAME_ID -- connections computes its archive arithmetically from
//     a fixed start date, which works because a missing game is generated on demand.
//     Lull cannot generate on demand, so the list of playable dates is GET /packs and
//     not date arithmetic. Copying this would advertise dead links.
//   nextUnplayed / NextUnplayedOptions -- the recommendation belongs to an archive
//     screen this slice does not have.

// Local calendar fields, not toISOString: the shelf renders the device's local date.
export const toPackDate = (date: Date): PackDate =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// utcPackDate is deliberately absent. It named the date the generator is working to,
// which west of UTC runs a day ahead of toPackDate, and usePrefetch used it to stage
// tomorrow's pack. Nothing stages anything now -- one local date is requested -- and an
// unused date helper is an untested one.

// A puzzle id is `${date}:${type}:${shortId}`, and the date prefix is the ONLY part of
// it a client may read. It exists so progress can be pruned by age. The remainder is
// opaque: never index a pack by it, never infer order from it, never parse the type out
// of it when the puzzle object carries `type` as a field.
const PUZZLE_ID_PATTERN = /^(\d{4}-\d{2}-\d{2}):.+$/

export const packDateOf = (puzzleId: string): PackDate | null => PUZZLE_ID_PATTERN.exec(puzzleId)?.[1] ?? null
