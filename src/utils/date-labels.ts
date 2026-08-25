import { PackDate } from '@types'

// Lifted out of components/shelf, where dayLabel and crumbLabel used to live privately, because the
// day panel now spells the same days. The shelf's plate and the panel's rows must not spell one day
// two ways, and two private copies drift the moment either is edited -- which is the same argument
// @utils/labels makes about difficulty and length.
//
// THERE WAS A THIRD COPY, AND IT ANSWERED TO THE SAME NAME. components/puzzle-frame kept a private
// `dayLabel` that produced what this file calls crumbLabel -- the short cut, for the middle crumb of
// "Lull > ... > Missing Vowels" in a 40px bar. This note used to say the two must stay in step, and
// they did not: crumbLabel grew a year for a day outside the reader's current year, the copy did
// not, and from 2027-01-01 one trail spelled one day two ways ("Lull > Sat, 14 Mar 2026" on the
// shelf, "Lull > Sat, 14 Mar > Cryptogram" on the puzzle). A note asking the next editor to remember
// is not a mechanism. The frame imports crumbLabel now, so there is one cut and one place to change
// it -- which is what this file was lifted out of the shelf to be.

// A PackDate is a plain YYYY-MM-DD string. The fields are read out and rebuilt through Date.UTC
// rather than handed to the string parser, so the Date is built from the key's own numbers and
// monthLabel can append a day to a YYYY-MM key without the parser rejecting it.
//
// Building it in UTC is NOT what keeps the label honest, and it is worth being exact about which
// half does the work. A date-only ISO string already parses as UTC midnight by spec, so this
// function and `new Date(date)` agree on the instant; what varies with the device is the
// FORMATTING. `timeZone: 'UTC'` on every options bag below is the entire guard -- delete it and a
// device west of UTC names the day before, so 2026-01-01 reads "Wednesday 31 December". The suite
// runs TZ=UTC and cannot see that, and neither can any assertion in it: mid-test writes to
// process.env.TZ do not reach Node, because Jest hands each environment a copy of process.env.
const utcDay = (date: PackDate): Date => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

// The year, but only when the day is not in the reader's current year -- the convention mail
// clients and `git log` both use, and the reason today's shelf reads exactly as it does now.
//
// It exists because the day panel reaches back to 2026-01-01. A plate reading "Saturday 14 March"
// and a request line reading "Bringing back Saturday, 14 March..." name a day in no particular year,
// which is fine while every label is inside the last seven days and genuinely ambiguous from
// 2027-01-01 on.
//
// The comparison is between the day's UTC year and the DEVICE'S LOCAL year, and the mismatch is
// deliberate: the label names a pack day, which is a UTC key, while "the current year" is the one on
// the reader's wall calendar -- the same year @utils/pack-dates reads local fields to find.
const yearField = (date: PackDate, now: () => number): { year?: 'numeric' } =>
  utcDay(date).getUTCFullYear() === new Date(now()).getFullYear() ? {} : { year: 'numeric' }

// The plate cut: the date has a line to itself and is the one focal point on the screen, so it is
// spelled out in full.
export const dayLabel = (date: PackDate, locale: string, now: () => number = Date.now): string =>
  utcDay(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    weekday: 'long',
    ...yearField(date, now),
  })

// The crumb cut, used in the breadcrumb and in every row of the day panel. Short enough that the day
// never spends the whole bar on a 320px viewport.
export const crumbLabel = (date: PackDate, locale: string, now: () => number = Date.now): string =>
  utcDay(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    weekday: 'short',
    ...yearField(date, now),
  })

// The month cut, from a YYYY-MM key rather than a full date -- the key monthsOf produces. The first
// of the month is appended to make it a date at all; nothing reads the day back out. This one always
// carries its year: a month heading is the only place the panel says which year the rows under it
// belong to.
//
// YYYY-MM keys are the whole contract and there is no guard, because monthsOf builds every key by
// `date.slice(0, 7)` and a guard on a value that cannot arrive is dead code. Anything else is
// garbage in, garbage out, and the shapes are worth knowing before someone calls this from a second
// place: a full date silently drops its extra field ('2026-03-14' -> March 2026), a two-digit year
// lands in the twentieth century ('26-03' -> March 1926, because Date.UTC maps years 0-99 to
// 1900+), a thirteenth month rolls forward ('2026-13' -> January 2027), and anything that is not two
// numbers formats as the literal string "Invalid Date" -- rendered into the UI rather than thrown.
export const monthLabel = (month: string, locale: string): string =>
  utcDay(`${month}-01`).toLocaleDateString(locale, { month: 'long', timeZone: 'UTC', year: 'numeric' })
