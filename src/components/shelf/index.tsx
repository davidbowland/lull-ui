import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@components/button'
import { DayPanel, DayRequest } from '@components/day-panel'
import { useDictionary } from '@components/dictionary-provider'
import { Plate, Shell } from '@components/enclosure'
import { InstallCard } from '@components/install-card'
import { Crumb, Spine } from '@components/spine'
import { UpNext } from '@components/up-next'
import { useInstallPrompt } from '@hooks/useInstallPrompt'
import { useOnline } from '@hooks/useOnline'
import { keepThisSession } from '@hooks/usePrefetch'
import { BENCH_ORDER, entryFor, UNKNOWN_TYPE_MESSAGE } from '@registry'
import { fetchPack } from '@services/lull'
import { cachedPackDates, readMeta, readPack, readProgress, STORAGE_EVENT } from '@services/storage'
import { Pack, PackDate, Puzzle } from '@types'
import { crumbLabel, dayLabel } from '@utils/date-labels'
import { DaySummary, summarizeDay } from '@utils/day-summary'
import { difficultyLabel, lengthLabel } from '@utils/labels'
import { isSelectablePackDate, toPackDate } from '@utils/pack-dates'
import { nextUnsolved } from '@utils/up-next'

export interface ShelfProps {
  locale?: string
  now?: () => number
}

// Node 24 defines globalThis.navigator, so the export build reads the build machine's
// ICU default rather than throwing. That is still the wrong language for everyone else,
// which is why nothing formatted here survives the first render.
const defaultLocale = (): string => globalThis.navigator?.language ?? 'en-US'

// dayLabel and crumbLabel used to live here privately and now come from @utils/date-labels,
// because the day panel spells the same days and two private copies drift the moment either is
// edited. THEY TAKE THE CLOCK NOW, and every call site below passes `clock` rather than letting
// the parameter default: each adds a year only when the day's year differs from the current one,
// so a bare call reads the wall clock -- a second clock in a render that has already frozen one,
// disagreeing across midnight and across New Year, and pinnable by no test.

// Spelled out to nine, then numeric, which is how every other sentence on this surface writes a
// small number. LOWER CASE, unlike the two other copies of this list in day-panel and up-next:
// both of those start their sentence with the number ("Seven days are on this device."), and this
// one sits mid-sentence, after "All".
//
// THE CASING IS NOT THE REASON TO LEAVE THEM APART, and the earlier note said it was -- which is a
// justification the next reader disproves in ten seconds by opening the other two files and finding
// their arrays character-for-character identical. Two casings, three copies.
//
// THE SECOND REASON RECORDED HERE DOES NOT HOLD EITHER, and it is worth striking rather than leaving
// to be inherited. It said the FUNCTIONS differ -- this one and day-panel's index and fall through
// to `${count}`, up-next's range-checks 2..9 -- so merging the arrays would leave three wrappers
// behind. They do differ, but in ROBUSTNESS rather than in behavior: hand any of the three a count
// either one could actually receive and they answer with the same word. What differs is which counts
// they SURVIVE, and this one survives zero only because `isFinished` twenty lines below checks
// `pack.puzzles.length > 0` first -- a guard in a different function. Without it, `COUNT_WORDS[0]` is
// '' and the plate reads "All  solved."
//
// So the more careful of the three is the one worth sharing, and what would be left at three call
// sites is three SENTENCES, which is not the same thing as three number-to-word wrappers. These are
// still three copies because nobody has converged them, not because they cannot be.
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

const countWord = (count: number): string => COUNT_WORDS[count] ?? `${count}`

// Where a type sits in the reading order of the benches. Two misses land at the END rather
// than at the front, which is where indexOf's raw -1 would put them:
//
//   entryFor returns undefined for a type this build has never heard of -- a pack is JSON
//     off the network and lull-api can ship a generator before the UI that draws it -- and
//     a row the day cannot draw belongs after every row it can;
//   a bench missing from BENCH_ORDER is a registry mistake, and burying it is still better
//     than promoting it above every bench that was declared properly.
const benchRank = (type: string): number => {
  const entry = entryFor(type)
  const rank = entry === undefined ? -1 : BENCH_ORDER.indexOf(entry.bench)
  return rank === -1 ? BENCH_ORDER.length : rank
}

// Plain string order, never localeCompare: an id is ASCII, and collation differs between
// engines and locales -- which would make the order device-dependent, the exact class of
// bug this function exists to remove.
const byId = (first: string, second: string): number => (first < second ? -1 : first > second ? 1 : 0)

/**
 * A TOTAL order over a day's puzzles: no two rows can ever compare equal.
 *
 * The day used to sort by estimatedSeconds alone. toSorted is STABLE, so equal-time rows
 * kept whatever order the backend happened to send, and that order changed between
 * refetches. Because estimatedSeconds tracks difficulty, the result looked like deliberate
 * difficulty bands with an interior that reshuffled every time the pack was re-read -- the
 * reader saw "Game 1 easy, Game 2 easy, Game 3 easy, then G3 medium, G1 medium, G2 medium"
 * and was right to call it arbitrary.
 *
 * Difficulty first, because gentlest first is the honest on-ramp and estimatedSeconds stays
 * printed on every row, so choosing by time still works. Bench second, from the registry's
 * fixed BENCH_ORDER, so a reader meets the four rooms in the same sequence every day. Id
 * last, which is what guarantees totality -- ids are unique, so the comparator cannot
 * return 0 for two different puzzles and stability stops mattering at all.
 */
export const orderPuzzles = (puzzles: Puzzle[]): Puzzle[] =>
  puzzles.toSorted(
    (first, second) =>
      first.difficulty - second.difficulty ||
      benchRank(first.type) - benchRank(second.type) ||
      byId(first.id, second.id),
  )

// ONE READ OF THE DEVICE, and it now carries every pack rather than one. The day panel needs a
// summary per cached day, Up Next needs every pack to rank a pick out of, and the plate needs
// whichever day the address bar named -- three facts that must agree about what is on the device,
// so they come out of a single pass rather than three.
//
// `solved` is held here rather than rebuilt during render, and that is a measured requirement
// rather than tidiness: DayPanel's solvedByDate memo is keyed on this set's identity, and a set
// built inline in the render body is a new object every time, so the ~50ms desktop / 150-300ms
// mobile pass over it would run on every render forever. `days` and `states` are stable for the
// same reason.
interface Snapshot {
  days: DaySummary[]
  packs: Pack[]
  solved: ReadonlySet<string>
  states: Map<string, PuzzleState>
}

// Solved wins over started, because a solved puzzle keeps its winning progress and would
// otherwise report itself as merely begun. That used to hold only inside the retention window,
// when progress was collected with the pack it named; nothing collects progress by age now, so
// the collision is permanent rather than a seven-day one and this order matters more, not less.
const stateOf = (puzzleId: string, solved: ReadonlySet<string>): PuzzleState => {
  if (solved.has(puzzleId)) return 'solved'
  return (readProgress(puzzleId) ?? '') === '' ? 'unsolved' : 'started'
}

// Every pack the device holds that the local date has actually reached, newest first, because
// cachedPackDates comes back newest-first. Two rules in the filter:
//
//   west of UTC, the prefetch stages TOMORROW's local pack before midnight -- it is on
//     the device on purpose, and showing it would hand out a day early;
//   east of UTC, the local date can run ahead of the newest pack the generator has made,
//     and the shelf falls back to the most recent one rather than reporting an empty day.
//
// Reads every candidate rather than stopping at the newest, which used to be the whole of this
// function's job and is now only half of it. readPack answers null for a date cachedPackDates
// still lists -- the value failed validation or would not parse, and it discards the key on the
// way out -- so a single-shot `.find()` let one bad key render "No puzzles on this device" while
// every other pack on the device sat unread. Dropping the nulls here keeps that fix and gives the
// panel and Up Next the same list the plate is drawn from.
const cachedPacks = (localToday: PackDate): Pack[] =>
  cachedPackDates()
    .filter((cached) => cached <= localToday)
    .map((date) => readPack(date))
    .filter((pack): pack is Pack => pack !== null)

// The breadcrumb, in place of the Back button no surface carries any more. Lull points at `/`,
// which is TODAY'S shelf and is no longer necessarily the page you are standing on: on `/?d=`
// the crumb is a real way back to today, and on `/` it is the self-href a trail's root has
// always carried here -- the alternative, a crumb with no href, would put a second
// aria-current="page" in a trail that can only be standing on one thing.
//
// THAT LINK IS A SAME-ROUTE SOFT NAVIGATION and fires no popstate, so the effect that re-reads
// `?d=` watches router.asPath as well. Without it the address bar cleared to `/` while the plate
// went on naming the day the player had just left.
//
// A device with no pack knows no day, so the trail stops at Lull rather than inventing a
// date the reader could not have got here from.
//
// `now` is passed rather than defaulted, here as everywhere: the crumb names a reached day now,
// and a day in a prior year has to carry its year in the trail exactly as it does on the plate.
const trailFor = (pack: Pack | null, locale: string, now: () => number): Crumb[] =>
  pack === null ? [{ label: 'Lull' }] : [{ href: '/', label: 'Lull' }, { label: crumbLabel(pack.date, locale, now) }]

// A distinct SHAPE per state, not a distinct color. Both chips are drawn in the same muted
// ink, so the tick and the empty ring are what separate them for a reader who cannot tell
// the hues apart (WCAG 1.4.1) -- and the word beside them is what separates them for a
// reader who cannot see either. Each is the `d` of one path in a 0 0 12 12 viewBox, stroked
// with no fill, like every other glyph in this product.
//
// Five shapes for five states: a tick, a half-filled ring, an hourglass, a download arrow over a
// tray, an empty ring.
const STATE_GLYPH = {
  // An hourglass -- a fifth SHAPE, and the one that has to be told from the download arrow beside
  // it, because the two states it separates are the two the player can do nothing about and the
  // one they can. Full width top and bottom, pinched in the middle, which is nothing else here.
  preparing: 'M3.4 2h5.2M3.4 10h5.2M3.4 2l2.6 4-2.6 4M8.6 2 6 6l2.6 4',
  solved: 'M2.3 6.3 5 9 9.7 3.2',
  started: 'M6 1.9a4.1 4.1 0 1 0 0.01 0M6 1.9v8.2',
  // A download arrow over a tray -- a fourth SHAPE, distinct from the tick, the ring and the
  // half-ring, so a reader who cannot tell the hues apart is not being asked to. It takes
  // --lull-muted like every non-solved chip; only `solved` spends the accent.
  unavailable: 'M6 1.6v5.6M3.6 5.4 6 7.8l2.4-2.4M2.2 9.9h7.6',
  unsolved: 'M6 1.9a4.1 4.1 0 1 0 0.01 0',
}

// What the shell may and may not say about a puzzle it has not opened.
//
// `Started` is the presence of stored progress, never its contents. PuzzleProgress is an
// opaque per-type string -- goFigure stores an expression, Cryptogram stores a mapping,
// and the next type will store something else again -- and the shell persists it verbatim
// without reading inside it. So the design's `Started - 10 of 22` is not available here
// and was never going to be: counting filled squares means knowing what a square is, which
// is exactly the knowledge this contract exists to deny the shell.
//
// Presence is not interpretation, though, and the honest third state is worth having: a
// half-played puzzle reading `Not started` is simply wrong, and it is the state a returning
// player most wants to find.
//
// Empty counts as absent. Play again empties a board and stores that, so an empty string
// means the player wiped it rather than leaving one keystroke behind.
//
// TWO STATES THAT stateOf CANNOT PRODUCE AND MUST NOT LEARN TO. That function reads storage and
// answers "what has the player done here"; these two answer "can this build open this puzzle right
// now" -- a fact that comes from the registry entry and the dictionary's status, neither of which
// stateOf has or should be handed. ShelfRow derives them, at the point where it already has both.
export type PuzzleState = 'preparing' | 'solved' | 'started' | 'unavailable' | 'unsolved'

const STATE_LABEL: Record<PuzzleState, string> = {
  preparing: 'Getting ready',
  solved: 'Solved',
  started: 'Started',
  unavailable: 'Needs setup',
  unsolved: 'Not started',
}

/**
 * Which chip a row that cannot be opened yet wears.
 *
 * THE PROGRESS STATE WINS WHEREVER THERE IS ONE, and the earlier version of this row replaced it
 * outright on the argument that "a puzzle cannot be started without a dictionary, so `started` and
 * `unavailable` are not simultaneously reachable". That was false across sessions, which is the
 * only span that matters here: play or solve today's Phrazle while the word list is in hand, then
 * reopen offline, or after a Cache API eviction, or during the window before the cache read
 * settles. A player who had just solved it was told their solved puzzle needed setup, with the
 * Solved chip gone.
 *
 * The two facts are about different things -- the chip says what the PLAYER has done, the sentence
 * beside it says what the DEVICE still needs -- and the row has room for both, so nothing has to be
 * dropped. Only `unsolved` has nothing to report, so it is the only one the dictionary's state may
 * speak in place of.
 */
const chipFor = (state: PuzzleState, missing: 'preparing' | 'unavailable'): PuzzleState =>
  state === 'unsolved' ? missing : state

interface StateChipProps {
  state: PuzzleState
}

const StateChip = ({ state }: StateChipProps): React.ReactNode => (
  // No pill and no outline. The row is already a bordered card, so a bordered chip inside it was
  // a box inside a box on every row of the directory -- four nested outlines down one screen, on
  // a design whose one enclosure technique is reserved for the two plates that carry weight. The
  // state is carried by a distinct GLYPH paired with a word, which is what it was always carried
  // by; the border was drawing nothing the glyph and the word did not already say.
  //
  // Solved takes the accent, and that is not the state's only signal either: the tick is a
  // different shape from either ring, and the word beside it says which.
  <span
    className={`flex shrink-0 items-center gap-[6px] text-[12px] font-semibold tracking-[0.03em] whitespace-nowrap ${
      state === 'solved' ? 'text-[var(--lull-accent)]' : 'text-[var(--lull-muted)]'
    }`}
  >
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 12 12"
      width="12"
    >
      <path d={STATE_GLYPH[state]} />
    </svg>
    {STATE_LABEL[state]}
  </span>
)

interface ShelfRowProps {
  puzzle: Puzzle
  state: PuzzleState
}

// A ROW OF THE DIRECTORY, drawn as a plate with a hairline round it rather than as a band between
// two divider rules.
//
// The divided version was the more austere of the two and it was the wrong austerity for a touch
// surface: a divider is a line BETWEEN two things and gives neither of them an edge, so a 76px
// link with 44px of glyph in it read as a paragraph you happened to be able to press. The card
// says where the target starts and stops, which on the one screen in the product that exists to be
// chosen from is the whole job.
//
// --lull-rule, NOT --lull-hair, and the argument above is exactly why. If the card edge is what
// makes a row read as a target, then the card edge is identifying a user interface component, and
// 1.4.11 holds it to 3:1 -- which hair cannot reach on any surface (1.44 on the plate) and is
// forbidden from trying by its own contract in colors.ts. rule on plate measures 3.836 and is
// already registered. Drawing this edge in hair would have been claiming the row is a container
// while relying on it to be a control.
//
// A grid, not a flex row: the glyph column is a fixed 44 and the state chip is intrinsic, so the
// name and its meta line get everything left over and every row's text starts at the same x
// whatever is beside it.
const CARD =
  'rounded-[var(--lull-r-lg)] border border-[var(--lull-rule)] bg-[var(--lull-plate)] ' +
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)]'

// The three-column geometry every row has, pressable or not, so the glyph, the name and the chip
// sit at the same x on all of them.
const ROW = `${CARD} grid min-h-11 grid-cols-[44px_1fr_auto] items-center gap-[var(--lull-s4)] p-[var(--lull-s3)]`

// The hover is a LIFT and nothing else. A border-color hover has nowhere left to go now that the
// resting edge is the load-bearing one, and an accent edge on hover would spend the accent on
// every row of the directory -- a color this design uses in exactly three places.
//
// IT LIVES HERE AND NOT ON ROW, because the rows that are not links must not lift. A row that rises
// under the pointer is advertising that pressing it does something, and on a row the shell will not
// let you open that is a promise broken on every pointer device -- the same trap the <div> below
// exists to avoid, reintroduced by a class. NOTHING IN THIS SUITE CAN CATCH IT: this repo forbids
// style assertions, jsdom computes no layout, and a hover transform is invisible to every query
// Testing Library offers. So the split is stated here, and the reason it cannot be pinned is stated
// with it.
const ROW_LINK = `${ROW} transition-transform duration-[420ms] ease-[cubic-bezier(0.22,0.68,0.12,1)] hover:-translate-y-[2px]`

const ShelfRow = ({ puzzle, state }: ShelfRowProps): React.ReactNode => {
  // Called unconditionally and before the guard below, because a hook may not sit under a return.
  // That is not the same as the BRANCH order, which is the thing that matters here.
  const { status } = useDictionary()
  const entry = entryFor(puzzle.type)

  // A type this build has never heard of. lull-api can ship a generator before the UI
  // that draws it, and a pack is JSON off the network -- so the row says what it cannot
  // do rather than destructuring undefined during render, which ErrorBoundary (_app.tsx)
  // would answer by replacing the whole day with "Lull got stuck". One unknown type
  // would cost every playable row on the shelf.
  if (entry === undefined) {
    // The same card, minus the grid: there is no glyph to put in the first column and no state to
    // put in the last, because the whole point of this row is that this build cannot draw the
    // puzzle. A three-column grid with one child would wedge the sentence into the 44px meant for
    // a bench sign.
    return <li className={`${CARD} p-[var(--lull-s4)] text-[13px] text-[var(--lull-muted)]`}>{UNKNOWN_TYPE_MESSAGE}</li>
  }

  // BELOW the guard above, and the order is not a preference. An unknown type has no `entry` to ask
  // about needsDictionary, so reading it first dereferences a possible undefined -- a throw during a
  // render, which ErrorBoundary (_app.tsx) would answer by replacing the whole day with "Lull got
  // stuck", which is the exact failure the comment on that guard exists to prevent. The frame's
  // suite asserts the same ordering on the same pair.
  if (entry.needsDictionary && status !== 'ready') {
    return (
      // The same three-column grid as a playable row, so the glyph, the name and the meta line sit
      // exactly where they do everywhere else -- but a <div>, never a <Link> and never a disabled
      // one. A link to a board the shell will refuse to mount is a trap: the player arrives at a
      // dead end they were invited to. There is nothing to press, so there is nothing to keep in
      // the tab order, and whatever explanation the row carries is visible text read in place by a
      // screen reader working down the list, exactly as the unknown-type row's sentence is. This is
      // the one place the usual "keep disabled controls focusable" advice does not apply, because
      // what is being removed is a navigation and not a control.
      //
      // ROW AND NOT ROW_LINK: this row does not lift under the pointer, because it cannot be
      // pressed. See ROW_LINK for why that split cannot be asserted here.
      <li>
        <div className={ROW}>
          {/* The identical glyph span the link branch draws, repeated rather than referred to: the
              row still says WHAT it is, so the bench sign is exactly where it is on every other
              row. Decoration beside the words and never instead of them, which is why it is
              hidden and the label is not. */}
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] text-[var(--lull-ink)]"
          >
            <svg
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.3"
              viewBox="0 0 22 16"
              width="22"
            >
              <path d={entry.glyph} />
            </svg>
          </span>

          <span className="flex min-w-0 grow flex-col">
            <span className="lull-sign text-xl leading-[1.15] text-[var(--lull-ink)]">{entry.label}</span>
            <span className="mt-[3px] text-[12.5px] text-[var(--lull-muted)]">
              {difficultyLabel(puzzle.difficulty)} · {lengthLabel(puzzle.estimatedSeconds)}
            </span>
            {/* ONLY WHEN WE HAVE ACTUALLY LOOKED. Concrete noun, active, no jargon, no hedge, and
                it names the one thing that will fix it. It deliberately does not say dictionary,
                word list, or download -- those are all true and none of them is the player's next
                action.

                While the status is 'loading' nothing is known yet, and telling a player to
                reconnect is then both false and useless: on a cold open this row paints before the
                Cache API has answered, so the sentence would run on a device that has the word
                list. The row says nothing at all in that window and the chip carries the wait. */}
            {status === 'absent' && (
              <span className="mt-[3px] text-[12.5px] text-[var(--lull-muted)]">Needs a connection to set up.</span>
            )}
          </span>

          {/* The chip reports the PLAYER's progress wherever there is any -- see chipFor -- and
              speaks for the dictionary only on a row with nothing else to say. */}
          <StateChip state={chipFor(state, status === 'absent' ? 'unavailable' : 'preparing')} />
        </div>
      </li>
    )
  }

  return (
    <li>
      {/* Encoded, because a puzzle id carries colons. The id is opaque past its date
          prefix, so it is passed along whole and never taken apart. */}
      <Link className={ROW_LINK} href={`/p/${encodeURIComponent(puzzle.id)}`}>
        {/* The sign in the directory. Each row draws the shape of the BENCH it opens, not a
            badge for the game, so choosing here is visibly choosing between four different
            rooms -- said one screen before you walk into one. Decoration beside the words
            and never instead of them, which is why it is hidden and the label is not. */}
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] text-[var(--lull-ink)]"
        >
          <svg
            fill="none"
            height="16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.3"
            viewBox="0 0 22 16"
            width="22"
          >
            <path d={entry.glyph} />
          </svg>
        </span>

        <span className="flex min-w-0 grow flex-col">
          <span className="lull-sign text-xl leading-[1.15] text-[var(--lull-ink)]">{entry.label}</span>
          {/* Difficulty and length on one line, in that order, because that is the order
              the rows are sorted in. */}
          <span className="mt-[3px] text-[12.5px] text-[var(--lull-muted)]">
            {difficultyLabel(puzzle.difficulty)} · {lengthLabel(puzzle.estimatedSeconds)}
          </span>
        </span>

        <StateChip state={state} />
      </Link>
    </li>
  )
}

// Where the keyboard goes when the panel opens or closes. Held as state rather than acted on in
// the press handler, because the panel is not on the page yet at the moment of the press -- the
// effect below runs after the commit that mounted it.
type PanelFocus = 'day' | 'month' | 'plate'

// The panel's month field, found by STRUCTURE because it cannot be found by id: DayPanel builds
// that id from its own useId(), so the shelf has no name for it and asking for one would widen a
// contract that is deliberately six props wide. Two shapes, because the field has two: the
// <select> while online, and the aria-disabled button face that replaces it when the connection
// drops (a native select ignores aria-disabled, which is why the substitution exists).
//
// The coupling is asserted rather than assumed -- the test that presses "Bring back an earlier
// day" ends on getByRole('combobox', { name: 'Month' }) holding focus, so a change to either
// shape reddens here rather than silently landing the keyboard nowhere.
//
// IT REACHES INTO ANOTHER COMPONENT BY STRUCTURE, and that is worth naming rather than leaving to be
// discovered. `button[aria-describedby]` is correct today because the offline month face is the only
// described button DayPanel renders. It is one attribute away from being wrong: put an
// aria-describedby on the empty-device "Bring back today" primary -- which sits ABOVE the field in
// the DOM -- and this query silently lands the keyboard on that button instead. Nothing would throw,
// nothing would fail; the reader would simply arrive somewhere else. The test named above covers the
// online shape only, because the offline face is unreachable from the shelf's own suite.
const monthControlIn = (root: HTMLElement | null): HTMLElement | null =>
  root?.querySelector<HTMLElement>('select, button[aria-describedby]') ?? null

export const Shelf = ({ locale = defaultLocale(), now = Date.now }: ShelfProps): React.ReactNode => {
  const isOnline = useOnline()
  const router = useRouter()
  const { status } = useDictionary()
  const { dismiss, install, mode, platform, reopen } = useInstallPrompt()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // Frozen at mount on purpose. Depending on the now prop directly would re-run the
  // effect for any caller that passes an inline arrow, and the effect sets state.
  const [clock] = useState(() => now)
  const [selected, setSelected] = useState<PackDate | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  // THE PANEL'S LIVE REPORT, and it is cleared when the panel is dismissed. It was not, and a panel
  // reopened after a failure mounted with "…didn't arrive." already in its role="status", its aside
  // beside it and its "Try again" primary under it -- about a day it could no longer show, because
  // DayPanel unmounts with the panel and its `month` state resets. A live region that mounts with
  // its message already in it is the announcement failure this codebase documents in three places,
  // and here it was announcing a request the player had walked away from.
  const [request, setRequest] = useState<DayRequest | null>(null)
  // WHAT THE SESSION LEARNED FROM THOSE REQUESTS, which outlives the panel and is a different fact
  // from what the panel is currently reporting. Up Next needs one thing from a request -- which day
  // the player went and got, so the card can say "the gentlest one you have left THERE" -- and that
  // does not stop being true when the panel closes. Keeping `request` alive to carry it is what made
  // the panel talk about a dismissed request, so the two lifetimes are two states. It holds only
  // SETTLED states: `pending` is not something learned.
  //
  // It carried a second fact until the 'exhausted' pool state came out, and it is down to one
  // reader: `reason`, below. A settled FAILURE is still written here on purpose -- `reason` asks
  // whether the pick came from the day the player most recently asked for and got, so a later ask
  // that came back empty or never arrived is the answer to that question changing.
  const [outcome, setOutcome] = useState<DayRequest | null>(null)
  const [pendingFocus, setPendingFocus] = useState<PanelFocus | null>(null)
  // A GENERATED ID AND NEVER A LITERAL. DayPanel builds `${panelId}-heading` and `${panelId}-month`
  // out of it, so two panels handed one literal would put two elements on a page under one id and
  // an aria-labelledby would resolve to whichever the browser found first.
  const panelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const plateControlRef = useRef<HTMLButtonElement>(null)
  // The date of the request the panel is currently about. See requestDay, where it is the whole of
  // the concurrency rule: two days can be in flight at once, and only the later one may speak.
  const requestedRef = useRef<PackDate | null>(null)
  // Whatever held the keyboard when the panel opened. Recorded rather than assumed, because there
  // are two openers -- the plate control and Up Next's "Bring back an earlier day" -- and "Never
  // mind" has to go back to the one that was actually pressed.
  const openerRef = useRef<HTMLElement | null>(null)

  // Read in one pass, with the packs, so the states cannot disagree with the rows they
  // label. Progress is read here rather than per row for the same reason every other
  // fact on this screen is: the listeners below re-read the whole snapshot, and a row
  // that fetched its own state during render would miss those writes.
  //
  // HOISTED OUT OF THE EFFECT so that two of them can share it -- the subscriptions below, and the
  // route-change read below that. One function, so there is exactly one place `?d=` is interpreted
  // and the two effects cannot disagree about what the address bar says.
  const read = useCallback((): void => {
    const packs = cachedPacks(toPackDate(new Date(clock())))
    const solved: ReadonlySet<string> = new Set(readMeta().solved)
    const states = new Map<string, PuzzleState>(
      packs.flatMap((pack) =>
        pack.puzzles.map((puzzle): [string, PuzzleState] => [puzzle.id, stateOf(puzzle.id, solved)]),
      ),
    )
    // EVERY pack's puzzles, not just the day on screen. The day on screen can change without
    // touching the device -- the address bar names it -- and a map built for one day would have
    // no state for the rows of another.
    const days = packs.map((pack) => summarizeDay(pack.date, pack, solved))

    // ?d= IS READ HERE, in the same pass and for the same reason nothing above the null guard
    // below may touch the device: this component is rendered in Node at build time and shipped
    // as HTML to everyone, so a value resolved there freezes at the moment of deploy.
    // window.location rather than router.query, which is the pattern pages/p/[puzzleId]
    // documents -- and re-reading it on every pass is what makes the address bar the one source
    // of truth, so Back through a pushed ?d= lands on the day it names.
    const asked = new URLSearchParams(window.location.search).get('d')
    // Anything unusable is IGNORED rather than reported. A bad ?d= is a link someone mangled,
    // and an error screen would accuse the player of it; today is always a correct answer.
    const usable = asked !== null && isSelectablePackDate(asked, clock) ? asked : null
    const held = usable !== null && packs.some((candidate) => candidate.date === usable)

    // THE ADDRESS BAR MAY NOT NAME A DAY THE SCREEN IS NOT SHOWING. A well-formed ?d= for a day
    // this device has never held -- a link opened on a second device, or a day pruned out of the
    // retention window since it was fetched -- still falls back to the newest pack, and used to
    // leave `?d=2026-03-14` sitting in the address bar over today's rows. Sharing a day is the
    // ordinary case for this feature (packs live seven days; the field reaches back months), so
    // the mismatch is not exotic. Replaced rather than pushed: nothing happened that a player
    // could want to go Back through.
    //
    // AN UNUSABLE ?d= IS STILL LEFT ALONE, and the asymmetry is deliberate. The values this
    // rejects are mangled or in the FUTURE, and a link to tomorrow is a link that starts working
    // tomorrow -- rewriting it away would take that from the reader to fix a disagreement that
    // lasts as long as they look at the screen. A day the device does not hold is not coming back
    // on its own: nothing fetches it, so the mismatch is permanent.
    //
    // The larger answer is to open the panel on that day and ask for it -- see the report on this
    // change. This is the honest minimum: the URL says what the screen says.
    //
    // THROUGH THE ROUTER, NEVER window.history.replaceState, for exactly the reason selectDay states
    // thirty lines below -- and this line got it wrong first. Next writes `__N: true` onto the
    // current history entry on a microtask after hydration, and its onPopState returns early when a
    // popped state has no `__N`. A raw replaceState({}) here therefore wipes the marker off the entry
    // the reader is standing on: truthy state, no marker, so the next pop moves the address bar and
    // NOT the route. It is reachable on the ordinary sharing path -- open /?d=2026-03-14 on a device
    // that never held March, tap a puzzle, press Back, and the URL reads `/` with the puzzle still on
    // screen. On a display: standalone install there is no address bar to explain it.
    //
    // Spreading window.history.state instead would be worse rather than better: Next's own `as` and
    // `url` are in there, still naming `/?d=...`, so a later pop would restore the address this line
    // exists to clear.
    if (usable !== null && !held) void router.replace('/', undefined, { scroll: false, shallow: true })

    setSelected(held ? usable : null)
    setSnapshot({ days, packs, solved, states })
    // `router` is stable in the pages router -- useRouter reads the singleton off a context that is
    // set once -- so this adds a dependency and no re-subscription.
    //
    // ANY TEST THAT MOCKS useRouter MUST MODEL THAT IDENTITY, and it is worth saying here because the
    // failure is a hang rather than a red assertion: a factory answering `() => ({ push: jest.fn() })`
    // hands back a fresh object per call, which makes this callback new on every render, which
    // re-runs the effect below that calls it, which sets state, forever. Both mocks in this repo
    // return one object.
  }, [clock, router])

  useEffect(() => {
    // localStorage tells this tab nothing about its own writes, and every fact on this
    // screen is one of those writes: usePrefetch fills the device seconds after mount
    // and again on every reconnect and install, and a win lands through markSolved.
    // None of that moves a route, so the shelf listens to the writes themselves.
    window.addEventListener(STORAGE_EVENT, read)
    window.addEventListener('online', read)
    window.addEventListener('appinstalled', read)
    // THE ADDRESS BAR ITSELF, as opposed to Next's model of it below. The two can disagree: Next
    // ignores a pop whose history entry it did not write, so a raw pushState anywhere in this app
    // would move the URL and never move `asPath`. Nothing does that any more -- see selectDay --
    // and this listener is what keeps the screen honest if something starts to again.
    window.addEventListener('popstate', read)
    // Resume, not merely visibility. An installed app keeps its JS context across days,
    // so without this the shelf still names yesterday the next morning.
    document.addEventListener('visibilitychange', read)
    return () => {
      window.removeEventListener(STORAGE_EVENT, read)
      window.removeEventListener('online', read)
      window.removeEventListener('appinstalled', read)
      window.removeEventListener('popstate', read)
      document.removeEventListener('visibilitychange', read)
    }
  }, [read])

  // THE READ ITSELF: on mount, and again on every route change. It is a separate effect from the
  // subscriptions above so that a route change does not tear five listeners down and rebuild them.
  //
  // router.asPath is the dependency because a same-route soft navigation -- the spine's Lull crumb,
  // which now points at a different day rather than at this page -- keeps this component mounted,
  // re-runs nothing, and fires no popstate. _app.tsx renders <Component> with no key, so React
  // keeps this instance across `/?d=X -> /`. Without this the address bar cleared and the plate
  // went on naming the day the player had just left.
  useEffect(() => {
    read()
  }, [read, router.asPath])

  // THE PANEL OPENS BELOW THE PLATE AND RUNS PAST THE FOLD, so leaving the keyboard on the control
  // that opened it strands a reader at a press whose whole effect is off screen. It runs after the
  // commit, which is the only moment the destination exists.
  useEffect(() => {
    if (pendingFocus === null) return
    const root = panelRef.current
    const month = monthControlIn(root)
    const target =
      pendingFocus === 'plate'
        ? plateControlRef.current
        : pendingFocus === 'month'
          ? month
          : // The first day row, and the month field when there is no first day row to land on.
            // A row with nothing left to open is not a control at all, so on a device whose seven
            // days are all finished this query finds nothing and the fallback is the only working
            // control in the panel.
            (root?.querySelector<HTMLElement>('ul button') ?? month)
    target?.focus()
    setPendingFocus(null)
  }, [pendingFocus])

  // Nothing above this line may depend on the date, the clock, or the device. This
  // component is rendered in Node at build time and shipped as HTML to everyone, so a
  // date resolved there freezes at the moment of deploy and a label formatted there is
  // in the build machine's language.
  if (snapshot === null) return <div aria-hidden="true" className="min-h-[320px]" />

  const { days, packs, solved, states } = snapshot
  const todayDate = toPackDate(new Date(clock()))

  // THE ADDRESS BAR NAMES A DAY; THE DEVICE DECIDES WHETHER IT CAN BE SHOWN. A ?d= naming a day
  // whose pack is not here -- a link shared from another device, or a day evicted since it was
  // opened -- falls back to the newest pack rather than to an apology, exactly as an unusable ?d=
  // does, and the address bar is put right where it is read. Nothing fetches it: the request states
  // live in the panel, and a silent thirty-second wait under today's rows would report itself
  // nowhere.
  //
  // No null guard before the search: `selected` is null on most renders, and no pack's date is
  // null, so the find simply misses -- one expression instead of a branch that could only ever be
  // taken one way, now that read() will not store a day it has no pack for.
  const selectedPack = packs.find((candidate) => candidate.date === selected) ?? null
  const pack = selectedPack ?? packs[0] ?? null

  const isToday = pack !== null && pack.date === todayDate
  // A REACHED PAST DAY IS NOT THE SAME FACT as "today's pack has not been generated yet", which is
  // what the shipping "Most recent" eyebrow means. A ?d= naming today is neither: it is today.
  const isEarlierDay = selectedPack !== null && selectedPack.date !== todayDate

  // Whether this build could actually mount the puzzle right now. Up Next may never name a board
  // the shell would refuse to open, and the registry and the dictionary are the two things that
  // decide that -- neither of which nextUnsolved has any business reaching for.
  const playable = (puzzle: Puzzle): boolean => {
    const entry = entryFor(puzzle.type)
    return entry !== undefined && (!entry.needsDictionary || status === 'ready')
  }

  const openCount = (pack?.puzzles ?? []).filter((puzzle) => !solved.has(puzzle.id)).length
  const pick = nextUnsolved({ excludeDate: pack?.date, packs, playable, solved })

  // WHAT IS LEFT TO PLAY BEYOND THE DAY ON SCREEN. `pick` is drawn with the day on screen excluded,
  // so a null pick never means "everything is solved" -- Up Next's own branch handles that by
  // refusing to say anything at all while open work is on screen. What is decided here is the other
  // half: 'none' is a device holding no pack, where the shelf's own empty state says more than Up
  // Next could; 'spent' is everything else.
  //
  // NO REQUEST STATE READS INTO THIS LINE, and that is the whole of it. It used to answer
  // 'exhausted' on a 404, which made Up Next print a second sentence about the request and withhold
  // its button -- while the day panel eighteen pixels up was already saying "Trying again won't
  // help. Choose another day." about the same press. Two components reporting one event, and the one
  // that knew nothing about it was the one that took the control away.
  //
  // Every version of that branch was wrong for its own reason and the list is worth keeping, because
  // each is a way of reading exhaustion into a request that never claimed it. `failed`: a dropped
  // connection taught us nothing, and the panel's own sentence says to try again. `pending`: nothing
  // has answered yet. `landed`: the one path that did what the feature is for. And `empty`: a 404 is
  // get-pack-by-date saying THAT DATE could not be built, which is permanent for one day out of
  // hundreds and says nothing about the pool. All four leave the offer standing.
  //
  // IT IS MEASURED WITHOUT `playable`, and that is the whole of this line. Up Next prints "You've
  // solved everything on this device" when it has no pick and nothing open on screen -- but `pick`
  // is null whenever every unsolved candidate is REFUSED by playable too, which is a different fact
  // and not a smaller one. Phrazle is the one type with `needsDictionary`, so a device whose only
  // unsolved puzzles are Phrazles prints that sentence, falsely, for as long as the word list is
  // absent -- and flashes it on every cold open, where `status` is 'loading' until the Cache API
  // answers. A puzzle this build cannot open right now is still a puzzle the player has not solved.
  //
  // 'none' is therefore "say nothing" rather than "no packs": no pack at all, or something unsolved
  // still on the device that the shelf cannot recommend. Both are states where the honest answer is
  // silence -- the shelf's own empty screen says more than Up Next could in the first, and the
  // Phrazle row says "Needs a connection to set up." in its own words in the second. 'spent' keeps
  // its one meaning, and it is now the only thing it can mean: every puzzle in every cached pack is
  // solved.
  const hasUnsolved = packs.some((candidate) => candidate.puzzles.some((puzzle) => !solved.has(puzzle.id)))
  const poolState = packs.length === 0 || hasUnsolved ? 'none' : 'spent'

  // A day the PLAYER named is a different offer from a day the app chose, and the pick's date is
  // the one printed in the card -- so this is a fact about where the pick came from, not about
  // the day on screen. A day the player asked for and got back reads "the gentlest one you have
  // left there"; anything else is the app's own choice.
  //
  // `outcome` and not `request`: where the pick came from does not change when the panel closes, and
  // this card is on screen long after it has. It is the only reader `outcome` has left.
  const reason = pick !== null && pick.date === outcome?.date ? 'day' : 'app'

  // A day with nothing left in it. `puzzles.length > 0` before the count, because an empty pack --
  // which readPack can produce out of a poisoned key -- has zero open puzzles and is not finished.
  const isFinished = pack !== null && pack.puzzles.length > 0 && openCount === 0

  const openPanel = (focus: PanelFocus): void => {
    const active = document.activeElement
    // <body> IS RECORDED AS NO OPENER AT ALL. Safari does not focus a <button> on click, so the
    // opener of a panel opened by mouse there is the document body -- which is connected, passes
    // dismissPanel's isConnected check, and takes body.focus(): the keyboard drops to the top of
    // the document and the next Tab starts over. Storing null instead hands the press to the
    // plate-control fallback below, which is a real destination.
    openerRef.current = active === document.body ? null : (active as HTMLElement | null)
    // A PANEL ALWAYS OPENS FRESH, and this is the line that guarantees it on every path rather than
    // on the one that is obviously a dismissal. There are three ways the panel stops being on screen
    // and only one of them is "Never mind": selectDay closes it too, and on the empty device it is
    // not closed at all -- the request that lands is what fills the device, which turns the panel
    // from the whole screen back into a disclosure and unmounts it with nothing dismissed. All three
    // used to bring the old status line, its aside and its "Try again" back on the next open.
    //
    // GUARDED, BECAUSE THIS IS ALSO AN OPENER FOR A PANEL ALREADY OPEN. Up Next's "Pick another" and
    // "Bring back an earlier day" both call this whatever is on screen, and the argument above is
    // about the three ways the panel LEAVES -- none of which is that press. Unguarded it blanked a
    // live request the reader was waiting on: the role="status" emptied, the "up to half a minute"
    // aside went with it, the pending row lost "On its way" and got its ordinary name back, and all
    // of it reappeared when the fetch settled. Nothing was reset, because nothing had ended.
    if (!isPanelOpen) setRequest(null)
    setPendingFocus(focus)
    setIsPanelOpen(true)
  }

  // Focus goes back to whichever control opened the panel, and to the plate control in the two
  // cases where there is no usable opener: the control has been unmounted -- a day that LANDS while
  // the panel is open gives Up Next a puzzle to name, and its card replaces the offer that opened
  // the panel -- or there never was one, because the press
  // left focus on <body> (see openPanel). Focusing a detached node, or <body>, drops the keyboard
  // and restarts the next Tab at the top of the page.
  const dismissPanel = (): void => {
    setIsPanelOpen(false)
    // The report goes with the panel that was reporting it -- see the note on `request` above. It is
    // stated here as well as in openPanel because it is the lifetime rule and not merely the guard:
    // this state exists to describe a panel that is on screen, so it does not outlive one. What the
    // session learned lives in `outcome` and is untouched.
    setRequest(null)
    const opener = openerRef.current
    const target = opener !== null && opener.isConnected ? opener : plateControlRef.current
    target?.focus()
  }

  const selectDay = (date: PackDate): void => {
    // PUSHED, not replaced, so Back returns to the day the player came from and the address is
    // shareable. Today clears the parameter rather than naming itself: the shelf's default IS
    // today, so `/?d=2026-08-25` and `/` are the same screen and only one of them stays right
    // overnight.
    //
    // THROUGH THE ROUTER, NEVER window.history.pushState. Next's pages router owns this history
    // stack and reads its own marker off every entry: onPopState returns without changing route
    // when `state.__N` is absent, so a raw pushState({}) entry made Next SILENTLY IGNORE the pop.
    // Pick a day, open a puzzle, press Back, and the address bar read `/?d=2026-08-17` while the
    // puzzle stayed on screen -- it took a second Back to reach the shelf. The shelf's own popstate
    // listener could not help; it had unmounted when the puzzle opened.
    //
    // scroll: false because pendingFocus below already sends the keyboard to the plate control,
    // and focusing it scrolls it into view; letting the router jump to the top as well would fight
    // that. shallow: true because there is nothing to re-fetch -- pages/index.tsx has no
    // getStaticProps, so this is a query-only change on the route already mounted.
    void router.push(date === todayDate ? '/' : `/?d=${date}`, undefined, { scroll: false, shallow: true })
    // THE SAME EXEMPTION requestDay TAKES, one step to the left, and it was missing here. A day
    // SELECTED from the seven-day list is one the prune can still collect: retentionFloor is
    // today - 6, so the oldest row in that list sits exactly ON the floor, and the moment the local
    // date rolls over it is below it. The next run() -- visibilitychange, the resume path -- deletes
    // it, removePack announces, the shelf re-reads, the day is no longer held, and read() rewrites
    // the address bar to `/`. The player is looking at 18 August and is put back on today with no
    // message, having pressed nothing. Reaching a day by naming it in the month field was protected;
    // reaching the same day by pressing it in the list was not, and it is the ordinary way in.
    //
    // Today is passed too, which costs nothing: today is never below the floor, so the entry is a
    // no-op the prune would have skipped anyway, and branching on it would be a second rule to keep
    // in step with retentionFloor.
    keepThisSession(date)
    // Set here as well as re-derived from the route change, because the router resolves on a later
    // task and the press has to change the screen now. Both paths read the same date, so the
    // asPath effect above confirms this rather than contradicting it.
    setSelected(date === todayDate ? null : date)
    setIsPanelOpen(false)
    // The row that was just pressed is about to be unmounted with the panel, so the keyboard has
    // to be sent somewhere first. The plate control is where the panel came from and now names
    // the chosen day.
    setPendingFocus('plate')
  }

  const requestDay = async (date: PackDate): Promise<void> => {
    // THE DAY THE PLAYER MOST RECENTLY ASKED FOR, so a settle that is no longer about it can be
    // dropped. Rows stay pressable through `pending` on purpose -- taking the control away unmounts
    // the button the keyboard is on -- and nothing stops the next press being a DIFFERENT row. Both
    // requests write into the one `request` slot, so without this the order they resolve in decides
    // what the panel says: press 14 March then 15 March, have 14 March answer second, and the live
    // region announces "14 March is here." while 15 March is still in flight, the 15 March row loses
    // "On its way", and aria-busy clears off the month list mid-fetch. `outcome` takes the same
    // last-writer-wins, and it is what `reason` reads to decide whose day the pick came from.
    //
    // A ref and not state: it is read after an await inside the same call, never rendered, and a
    // state write would re-render every row of the month list to record it.
    requestedRef.current = date
    setRequest({ date, state: 'pending' })
    try {
      await fetchPack(date)
      // BEFORE the state writes, and it is the one line that keeps this day on the device. The
      // retention rule in usePrefetch collects by age, and a day the player waited thirty seconds
      // for is by definition older than the floor -- so without this, the next resume deletes it out
      // from under the screen showing it. See requestedThisSession there for why the exemption is
      // held for the session rather than stored.
      keepThisSession(date)
      // ABOVE the staleness guard, and deliberately: the pack for this date is on the device
      // whatever the player pressed afterwards, and the prune does not care which request the
      // panel is currently reporting on. A day fetched and then left unprotected is the exact
      // data-loss the exemption exists to stop.
      if (requestedRef.current !== date) return
      // THE PANEL IS ABOUT TO BE UNMOUNTED BY ITS OWN SUCCESS, on the one screen where it is the
      // whole page. writePack fires STORAGE_EVENT, read() runs, the snapshot gains a pack, and the
      // `pack === null` branch is replaced by the plate -- taking the promoted panel with it, and
      // with it the "Bring back today" primary that was just pressed. isPanelOpen is false on that
      // path, so nothing remounts the panel, nothing else sets pendingFocus, and DayPanel's own
      // focus effect cannot run because the component is gone: the keyboard lands on <body> and the
      // next Tab restarts at the top of the document. The role="status" carrying "…is here." is
      // destroyed in the same commit, so nothing is announced either.
      //
      // The plate control exists on exactly the commit that mounts the plate, which is the commit
      // the pendingFocus effect runs after -- and it now names the day that just arrived. Spec 6.5's
      // rule that the panel must stay mounted through `pending` holds right up to `landed`; this is
      // what catches the keyboard at the moment it stops holding.
      if (packs.length === 0) setPendingFocus('plate')
      setRequest({ date, state: 'landed' })
      setOutcome({ date, state: 'landed' })
    } catch (error: unknown) {
      // 404 means the date was valid and nothing could be built for it -- get-pack-by-date answers
      // it only when the pack ends up empty. That is permanent, so the UI must not offer a retry
      // that will fail identically. Anything else is a timeout or a dropped connection, which is
      // transient and worth trying again.
      //
      // AND IT IS VERY NEARLY UNREACHABLE FOR ANY DATE THIS UI CAN ASK FOR, which is worth writing
      // down because a branch that never fires attracts design. lull-api fills an on-demand pack
      // from the generators marked `inRequest`, which today is goFigure alone: a pure synchronous
      // enumeration over a digit bank, no network and no model, measured at well under 2ms against a
      // 10s in-request budget. Its `availableFrom` is the archive floor itself, so it applies to
      // every date in range -- and the range the UI validates against IS that window. An empty pack
      // therefore takes a generator regression, not a thin day.
      //
      // Handled anyway, defensively and cheaply: 404 is a documented response of that endpoint and
      // it is in the shipped handler, and a client that misreports an answer it might receive is
      // worse than one that carries a rare branch. What must NOT happen is a UI state designed
      // around it -- Up Next had one, and it withheld a working control on a press that could
      // essentially never happen.
      //
      // NO abandoned REF HERE, and the one in usePrefetch is not the precedent it looks like: that
      // guard stops a localStorage PRUNE from running for a screen that is gone. These two lines
      // only set state, and a state write after unmount is a no-op under React 19 -- a guard on it
      // would be a branch nothing could ever take and nothing could ever test.
      //
      // httpStatus, not status: `status` is already the dictionary's state in this component's
      // scope, and two values under one name -- one a load state, one an HTTP code -- is a trap
      // for whoever edits this next, even though the shadowing is correct today.
      //
      // Optional-chained through the cast: `(error as ...).response` throws outright on a rejection
      // that is not an object. fetchPack only ever rejects with an Error today, so this is one
      // character against a throw inside a catch block that has nothing above it to catch.
      const httpStatus = (error as { response?: { status?: number } } | null)?.response?.status
      // A failure the player has already moved past says nothing about the day they are waiting on
      // now -- see requestedRef above. Nothing was written on this path, so there is nothing to keep
      // and no work to do before returning.
      if (requestedRef.current !== date) return
      const settled: DayRequest = { date, state: httpStatus === 404 ? 'empty' : 'failed' }
      setRequest(settled)
      setOutcome(settled)
    }
  }

  // ONE ELEMENT, TWO PLACES IT CAN LAND, and never both: the disclosure under the plate, and the
  // whole of the screen when the device holds nothing. The empty screen needs no wrapper and no
  // extra prop -- DayPanel derives its heading, its eyebrow, its primary and its floor note from
  // `days.length === 0`, and a heading added around it here would put two headings on the one
  // screen where one of them is false.
  const dayPanel = (
    <div ref={panelRef}>
      <DayPanel
        days={days}
        isOnline={isOnline}
        locale={locale}
        now={clock}
        onDismiss={dismissPanel}
        onRequestDay={requestDay}
        onSelectDay={selectDay}
        panelId={panelId}
        request={request}
        solved={solved}
        todayDate={todayDate}
      />
    </div>
  )

  return (
    // No seam and no floor. There is no instrument on this surface because there is nothing
    // to operate: you are choosing here, not working, and the bench is what you choose.
    <>
      <Spine trail={trailFor(pack, locale, clock)} />

      <section
        aria-label="Puzzles"
        // The page carries only the measure, so the gutter is here -- on the first thing under the
        // spine, which is a strip of ground that has to reach both edges.
        className="flex flex-col gap-[var(--lull-s5)] py-[var(--lull-s6)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]"
      >
        {/* Always mounted, empty while online. Going offline is the one transition this
            screen exists to report, and a role="status" inserted with its message already
            in it is routinely missed. */}
        {/* empty:h-0 rather than empty:hidden, and the difference is the whole point of
            mounting it early. `hidden` is display:none, which takes the element out of the
            accessibility tree entirely -- so the region a screen reader was supposed to be
            already watching does not exist until the moment it gains text, which is exactly
            the "inserted with its message already in it" case this is written to avoid.
            Zero height keeps the box rendered and watched while showing nothing. */}
        <p className="text-[var(--lull-muted)] empty:h-0 empty:overflow-hidden" role="status">
          {isOnline ? '' : 'You’re offline. Only puzzles already here will open.'}
        </p>

        {pack === null ? (
          <>
            {/* True whether the device is empty because this is a first visit, because
                there is no connection, or because the request failed. The shelf cannot
                tell those apart and must not pretend to. */}
            <h1 className="lull-sign text-2xl text-[var(--lull-ink)]">No puzzles on this device</h1>
            <p className="text-[var(--lull-muted)]">
              They arrive on their own while you’re online. If you just opened Lull, give it a moment.
            </p>
            {/* THE PANEL STOPS BEING A DISCLOSURE AND BECOMES THE SCREEN. There is no plate here,
                so there is nowhere for the plate control to live and nothing to expand -- no
                aria-expanded, no aria-controls, nothing hidden. */}
            {dayPanel}
          </>
        ) : (
          <>
            {/* The one focal point, and one of only two places in the product that gets the
                double bezel. Bezelling every container would turn the technique into
                background noise, which is the failure the enclosure exists to avoid. */}
            <Shell>
              <Plate className="flex flex-col px-[var(--lull-s4)] py-[var(--lull-s5)]">
                {/* "Today" would be a lie over a fallback pack, and the sentence under it
                    already says so -- an eyebrow contradicting the line beneath it is worse
                    than either alone.

                    THREE CASES, AND THE THIRD IS NOT A SHADE OF THE SECOND. "Most recent" means
                    today's pack has not been generated yet; "Earlier day" means the player went
                    and got this one. Reading either word onto the other state tells the player
                    something false about whose doing it was. */}
                <p className="text-[11.5px] font-semibold tracking-[0.11em] text-[var(--lull-muted)] uppercase">
                  {isEarlierDay ? 'Earlier day' : isToday ? 'Today' : 'Most recent'}
                </p>
                {/* The one focal point in the product, so it takes the largest sign anywhere
                    outside the goal plate. leading-[1.04] rather than leading-none: at 38px a
                    line box exactly one em tall drops the descender of "Wednesday" into the
                    sentence underneath, and this is the one line on the surface a reader is
                    guaranteed to look at. */}
                <h1 className="lull-sign mt-[6px] mb-[var(--lull-s3)] text-[38px] leading-[1.04] tracking-[-0.02em] text-[var(--lull-ink)]">
                  {dayLabel(pack.date, locale, clock)}
                </h1>
                {/* THREE NOTES, AND THE FALLBACK ONE IS NOW THE NARROW CASE. "Today's puzzles
                    aren't ready yet" is a claim about the generator, and printing it over a day
                    the player deliberately reached would be flatly false -- so it belongs to the
                    fallback pack alone, which is the one state that means it. The plan's Task 10
                    changed only the eyebrow and would have left that sentence standing over
                    14 March.

                    The second clause is withheld unless there is genuinely something waiting: Up
                    Next renders nothing at all when the pool is spent, and a plate promising a
                    puzzle below an empty foot is the same lie in the other direction. It is held
                    to TODAY as well, because "an earlier day" is only true of every other day
                    when the day on screen is the newest one -- a pick from 18 August is not an
                    earlier day than 14 August. The first clause stands alone on a finished day
                    with nothing left to recommend, where "Gentlest first. Pick any one." points
                    at rows that are all solved.

                    "below" is a layout claim, and unlike the ones the copy review struck out of
                    Up Next it is one this component can keep: the shelf owns the order of its own
                    children, and Up Next is mounted below the rows in every state that reaches
                    this line. */}
                <p className="text-[12.5px] leading-[1.45] text-[var(--lull-muted)]">
                  {!isToday && !isEarlierDay
                    ? 'Today’s puzzles aren’t ready yet. This is the most recent set.'
                    : isFinished
                      ? `All ${countWord(pack.puzzles.length)} solved.${isToday && pick !== null ? ' One from an earlier day is waiting below.' : ''}`
                      : 'Gentlest first. Pick any one.'}
                </p>
                {/* The one control on the plate, and a `default` rather than a `primary`: the
                    accent is spent in exactly three places product-wide, and on this screen it
                    belongs to Up Next's offer. aria-controls is omitted while the panel is closed
                    rather than left pointing at an element that is not there. */}
                <div className="mt-[var(--lull-s4)]">
                  <Button
                    aria-controls={isPanelOpen ? panelId : undefined}
                    aria-expanded={isPanelOpen}
                    onClick={() => (isPanelOpen ? dismissPanel() : openPanel('day'))}
                    ref={plateControlRef}
                    size="sm"
                  >
                    {isPanelOpen ? 'Hide the days' : 'Pick another day'}
                  </Button>
                </div>
              </Plate>
            </Shell>

            {/* Directly under the plate the control sits on, which is what makes it a disclosure
                rather than a second screen: the press has a visible effect where the reader is
                looking, and closing it puts the day's rows back where they were. */}
            {isPanelOpen && dayPanel}

            {/* Rows of equal weight: no ranking, no aggregate. Each is a plate with an edge of
                its own rather than a band between two dividers -- see ROW, where that edge is
                argued for. Spaced rather than stacked, because a card with no gap under it is a
                table. */}
            <ul className="flex flex-col gap-[var(--lull-s3)]">
              {orderPuzzles(pack.puzzles).map((puzzle) => (
                <ShelfRow key={puzzle.id} puzzle={puzzle} state={states.get(puzzle.id) ?? 'unsolved'} />
              ))}
            </ul>

            {/* A partial day is served on purpose and everything in it is playable now.
                Saying so is the difference between "this is all there is" and "there is
                more coming". Below the rows, because it is a fact about the list rather
                than about the day. */}
            {!pack.complete && (
              <p className="text-[var(--lull-muted)]">More puzzles for this day are still on the way.</p>
            )}
          </>
        )}

        {/* AT THE FOOT OF THE SHELF, below the day's rows and above the install offer, and mounted
            in every state: with no pack on the device it renders nothing at all, because the empty
            screen above says more than it could and there is nothing for it to be next to. */}
        <UpNext
          locale={locale}
          now={clock}
          onPickAnother={() => openPanel(pick === null ? 'month' : 'day')}
          onPlay={(puzzleId) => void router.push(`/p/${encodeURIComponent(puzzleId)}`)}
          openCount={openCount}
          // A LITERAL, and deliberately not a second useId(): uniqueness inside Up Next comes from
          // its own useId(), and this prop is only the readable half of the ids it builds.
          panelId="up-next"
          pick={pick}
          poolState={poolState}
          reason={reason}
        />

        {/* usePrefetch no longer gates anything on isInstalled() -- it asks for today's
            pack and nothing else, in a tab or on a home screen alike. This card is now an
            offer of a launcher icon and a standalone window, and on iOS and Firefox for
            Android it is the only place either is explained. Its copy was rewritten to say
            exactly that and no longer promises the old seven-day fill; see the note in
            install-card, which is where that decision is recorded. */}
        <InstallCard mode={mode} onDismiss={dismiss} onInstall={install} onReopen={reopen} platform={platform} />
      </section>
    </>
  )
}
