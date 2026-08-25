import { PackDate } from '@types'

// Ported from connections-ui/src/utils/game-ids.ts. Two of its five exports are
// deliberately left behind:
//
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
// it a client may read. It exists so a client can tell which DAY a puzzle belongs to
// without holding the pack that names it -- which is what lets the day panel count a
// March day's solved ids months after the March pack was dropped. It used to exist so
// progress could be pruned by age; nothing prunes progress any more (see writeHints in
// services/storage.ts), and this prefix outlived that job. The remainder is opaque:
// never index a pack by it, never infer order from it, never parse the type out of it
// when the puzzle object carries `type` as a field.
const PUZZLE_ID_PATTERN = /^(\d{4}-\d{2}-\d{2}):.+$/

// The whole string, unlike PUZZLE_ID_PATTERN which reads a prefix. It rejects '2026-8-25' and
// anything with a suffix, which matters because the value comes off the address bar.
const PACK_DATE_PATTERN_STRICT = /^\d{4}-\d{2}-\d{2}$/

export const packDateOf = (puzzleId: string): PackDate | null => PUZZLE_ID_PATTERN.exec(puzzleId)?.[1] ?? null

// Duplicated from lull-api's PACK_START_DATE, deliberately and with no sync mechanism. It is one
// date that has never changed, the archive floor is a product decision rather than an API detail,
// and the alternative -- GET /packs -- is a full paginated Scan that lull-api withholds on purpose
// (see the comment on GetPackDatesFunction in its template.yaml). connections-ui does exactly this
// with FIRST_GAME_ID for the same reason: a list computed on the device needs no network, so the
// day panel still works offline for the days that are actually openable offline.
//
// All six generator contributions carry availableFrom: '2026-01-01', the same value, so every date
// at or after this one can hold every puzzle type.
export const FIRST_PACK_DATE: PackDate = '2026-01-01'

// Every playable date, newest first. Local fields rather than UTC, like toPackDate above: the shelf
// renders the device's local date, so the list has to end on the day the reader thinks it is.
//
// Recomputed rather than cached. It is ~240 strings today and grows by one a day, which is cheap
// enough to build on demand -- but a FRESH array every call, so the caller memoizes it. Hand the
// result straight to a prop and every React.memo below it re-renders and every dependency array
// holding it fires, on every render, forever.
export const allPackDates = (now = Date.now): PackDate[] => {
  const dates: PackDate[] = []
  for (const cursor = new Date(now()); toPackDate(cursor) >= FIRST_PACK_DATE; cursor.setDate(cursor.getDate() - 1)) {
    dates.push(toPackDate(cursor))
  }
  return dates
}

// The pattern alone accepts impossible dates: '2026-02-30' is not NaN, it rolls forward to March
// 2nd. Only the round trip catches that -- the same check lull-api's isPackDateFormat makes.
// Local fields on BOTH sides: `new Date(y, m - 1, d)` and toPackDate both read local, so the round
// trip is zone-independent. Parsing the string as UTC instead would fail every date west of UTC.
const isRealDate = (value: string): boolean => {
  const [year, month, day] = value.split('-').map(Number)
  return toPackDate(new Date(year, month - 1, day)) === value
}

// What ?d= is held to before it reaches state or a request. Both bounds are YYYY-MM-DD, so a
// lexical comparison is a chronological one -- the same property lull-api's isValidPackDate relies
// on, and the reason the format test has to come first.
//
// Tomorrow BY THE DEVICE'S CALENDAR is refused even though the API accepts it: isValidPackDate
// allows up to tomorrow so the generator can work a day ahead. The refusal is local and the risk it
// answers is UTC, so east of UTC they part company -- at 00:30 in Tokyo the device's today already
// is the day the generator is working to, and this returns true for it. That is the whole shelf's
// behavior and not this check's to fix: every date here is the date the reader thinks it is.
export const isSelectablePackDate = (value: string, now = Date.now): boolean =>
  PACK_DATE_PATTERN_STRICT.test(value) &&
  isRealDate(value) &&
  value >= FIRST_PACK_DATE &&
  value <= toPackDate(new Date(now()))

// One key per month, in the order the dates arrive. A single pass with no map and no sort, because
// allPackDates is contiguous and newest-first -- the same shape connections-ui's groupByMonth relies
// on.
export const monthsOf = (dates: PackDate[]): string[] =>
  dates.reduce<string[]>((months, date) => {
    const month = date.slice(0, 7)
    return months.at(-1) === month ? months : [...months, month]
  }, [])
