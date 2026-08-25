import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import { useDictionary } from '@components/dictionary-provider'
import { Plate, Shell } from '@components/enclosure'
import { InstallCard } from '@components/install-card'
import { Crumb, Spine } from '@components/spine'
import { useInstallPrompt } from '@hooks/useInstallPrompt'
import { useOnline } from '@hooks/useOnline'
import { BENCH_ORDER, entryFor, UNKNOWN_TYPE_MESSAGE } from '@registry'
import { cachedPackDates, readMeta, readPack, readProgress, STORAGE_EVENT } from '@services/storage'
import { Pack, PackDate, Puzzle } from '@types'
import { difficultyLabel, lengthLabel } from '@utils/labels'
import { toPackDate } from '@utils/pack-dates'

export interface ShelfProps {
  locale?: string
  now?: () => number
}

// Node 24 defines globalThis.navigator, so the export build reads the build machine's
// ICU default rather than throwing. That is still the wrong language for everyone else,
// which is why nothing formatted here survives the first render.
const defaultLocale = (): string => globalThis.navigator?.language ?? 'en-US'

// A PackDate is a plain YYYY-MM-DD string, and new Date() on one depends on the runtime
// zone. The fields are read out and rebuilt in UTC so no label below can ever name a
// different day than the key it was read from.
const utcDay = (date: PackDate): Date => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

// The plate cut: the date has a line to itself and is the one focal point on the screen,
// so it is spelled out in full.
const dayLabel = (date: PackDate, locale: string): string =>
  utcDay(date).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC', weekday: 'long' })

// The crumb cut, written the way the puzzle frame writes it, because it is the same crumb
// in the same 40px bar and the two surfaces must not spell one day two ways. Short enough
// that the day never spends the whole bar on a 320px viewport.
const crumbLabel = (date: PackDate, locale: string): string =>
  utcDay(date).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC', weekday: 'short' })

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

interface Snapshot {
  pack: Pack | null
  states: Map<string, PuzzleState>
}

// Solved wins over started, because a solved puzzle keeps its winning progress inside the
// retention window and would otherwise report itself as merely begun.
const stateOf = (puzzleId: string, solved: Set<string>): PuzzleState => {
  if (solved.has(puzzleId)) return 'solved'
  return (readProgress(puzzleId) ?? '') === '' ? 'unsolved' : 'started'
}

// The newest pack the device holds that the local date has actually reached. Two rules
// in one line, because cachedPackDates comes back newest-first:
//
//   west of UTC, the prefetch stages TOMORROW's local pack before midnight -- it is on
//     the device on purpose, and showing it would hand out a day early;
//   east of UTC, the local date can run ahead of the newest pack the generator has made,
//     and the shelf falls back to the most recent one rather than reporting an empty day.
//
// Walks the candidates rather than taking only the newest. readPack can return null for a
// date cachedPackDates still lists -- the value failed validation or would not parse, and
// it discards the key on the way out. With a single-shot `.find()` that one bad key
// rendered "No puzzles on this device" while every other pack on the device sat unread.
const shelfPack = (localToday: PackDate): Pack | null => {
  for (const date of cachedPackDates().filter((cached) => cached <= localToday)) {
    const pack = readPack(date)
    if (pack !== null) {
      return pack
    }
  }
  return null
}

// The breadcrumb, in place of the Back button no surface carries any more. Lull points at
// this very page on purpose: the day directory IS Lull's home -- there is exactly one day,
// and it is today -- and the alternative, a crumb with no href, would put a second
// aria-current="page" in a trail that can only be standing on one thing.
//
// A device with no pack knows no day, so the trail stops at Lull rather than inventing a
// date the reader could not have got here from.
const trailFor = (pack: Pack | null, locale: string): Crumb[] =>
  pack === null ? [{ label: 'Lull' }] : [{ href: '/', label: 'Lull' }, { label: crumbLabel(pack.date, locale) }]

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

export const Shelf = ({ locale = defaultLocale(), now = Date.now }: ShelfProps): React.ReactNode => {
  const isOnline = useOnline()
  const { dismiss, install, mode, platform, reopen } = useInstallPrompt()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // Frozen at mount on purpose. Depending on the now prop directly would re-run the
  // effect for any caller that passes an inline arrow, and the effect sets state.
  const [clock] = useState(() => now)

  useEffect(() => {
    // Read in one pass, with the pack, so the states cannot disagree with the rows they
    // label. Progress is read here rather than per row for the same reason every other
    // fact on this screen is: the listeners below re-read the whole snapshot, and a row
    // that fetched its own state during render would miss those writes.
    const read = (): void => {
      const pack = shelfPack(toPackDate(new Date(clock())))
      const solved = new Set(readMeta().solved)
      const states = new Map<string, PuzzleState>(
        (pack?.puzzles ?? []).map((puzzle) => [puzzle.id, stateOf(puzzle.id, solved)]),
      )
      setSnapshot({ pack, states })
    }
    read()

    // localStorage tells this tab nothing about its own writes, and every fact on this
    // screen is one of those writes: usePrefetch fills the device seconds after mount
    // and again on every reconnect and install, and a win lands through markSolved.
    // None of that moves a route, so the shelf listens to the writes themselves.
    window.addEventListener(STORAGE_EVENT, read)
    window.addEventListener('online', read)
    window.addEventListener('appinstalled', read)
    // Resume, not merely visibility. An installed app keeps its JS context across days,
    // so without this the shelf still names yesterday the next morning.
    document.addEventListener('visibilitychange', read)
    return () => {
      window.removeEventListener(STORAGE_EVENT, read)
      window.removeEventListener('online', read)
      window.removeEventListener('appinstalled', read)
      document.removeEventListener('visibilitychange', read)
    }
  }, [clock])

  // Nothing above this line may depend on the date, the clock, or the device. This
  // component is rendered in Node at build time and shipped as HTML to everyone, so a
  // date resolved there freezes at the moment of deploy and a label formatted there is
  // in the build machine's language.
  if (snapshot === null) return <div aria-hidden="true" className="min-h-[320px]" />

  const { pack, states } = snapshot
  const isToday = pack !== null && pack.date === toPackDate(new Date(clock()))

  return (
    // No seam and no floor. There is no instrument on this surface because there is nothing
    // to operate: you are choosing here, not working, and the bench is what you choose.
    <>
      <Spine trail={trailFor(pack, locale)} />

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
                    than either alone. */}
                <p className="text-[11.5px] font-semibold tracking-[0.11em] text-[var(--lull-muted)] uppercase">
                  {isToday ? 'Today' : 'Most recent'}
                </p>
                {/* The one focal point in the product, so it takes the largest sign anywhere
                    outside the goal plate. leading-[1.04] rather than leading-none: at 38px a
                    line box exactly one em tall drops the descender of "Wednesday" into the
                    sentence underneath, and this is the one line on the surface a reader is
                    guaranteed to look at. */}
                <h1 className="lull-sign mt-[6px] mb-[var(--lull-s3)] text-[38px] leading-[1.04] tracking-[-0.02em] text-[var(--lull-ink)]">
                  {dayLabel(pack.date, locale)}
                </h1>
                <p className="text-[12.5px] leading-[1.45] text-[var(--lull-muted)]">
                  {isToday
                    ? 'Gentlest first. Pick any one.'
                    : 'Today’s puzzles aren’t ready yet. This is the most recent set.'}
                </p>
              </Plate>
            </Shell>

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

        {/* usePrefetch no longer gates anything on isInstalled() -- it asks for today's
            pack and nothing else, in a tab or on a home screen alike. This card is now an
            offer of a launcher icon and a standalone window, and on iOS and Firefox for
            Android it is the only place either is explained. Its copy still promises the
            old seven-day fill; see the note in install-card. */}
        <InstallCard mode={mode} onDismiss={dismiss} onInstall={install} onReopen={reopen} platform={platform} />
      </section>
    </>
  )
}
