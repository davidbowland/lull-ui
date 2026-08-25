import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { orderPuzzles, Shelf } from './index'
import { DictionaryContext, DictionaryState } from '@components/dictionary-provider'
import { keepThisSession } from '@hooks/usePrefetch'
import { REGISTRY } from '@registry'
import { fetchPack } from '@services/lull'
import { markSolved, STORAGE_EVENT, writePack, writeProgress } from '@services/storage'
import {
  goFigurePuzzle,
  incompletePack,
  missingVowelsPuzzle,
  pack,
  phrazleDictionary,
  phrazlePack,
  phrazlePuzzle,
  phrazlePuzzleId,
  puzzleId,
  quickPuzzle,
  quickPuzzleId,
} from '@test/__mocks__'
import { Difficulty, Pack, Puzzle } from '@types'

// jsdom reports navigator.onLine as true, so an unmocked fetchPack fires a real request against a
// 35-second axios timeout the moment a day is asked for.
jest.mock('@services/lull')

// ONE EXPORT OF IT, and the rest left real. keepThisSession writes into a module-level Set the
// prune reads, and that Set has the session's lifetime -- so a real one would carry a date from one
// test in this file into every test after it. The shelf's side of the contract is the CALL: it hands
// over the date it just fetched and learns nothing back, which is what the two cases below pin.
jest.mock('@hooks/usePrefetch', () => ({
  ...jest.requireActual('@hooks/usePrefetch'),
  keepThisSession: jest.fn(),
}))

// The shelf is the only surface that navigates imperatively -- Up Next hands back a puzzle id
// rather than an href, and choosing a day goes through the router so the history entry carries the
// marker Next's onPopState looks for. There is no router above a component rendered on its own, so
// useRouter is answered here.
//
// THE MOCK MOVES THE ADDRESS BAR, because the real router does and the shelf reads
// window.location. Its default implementation is installed in beforeAll below -- clearMocks calls
// mockClear, which forgets calls and keeps implementations.
//
// asPath is a module variable rather than a second jest.fn, because it is state the router
// exposes rather than a call: the shelf re-reads the day on every change of it, and a test that
// wants to model a soft navigation sets it and re-renders. Named with the `mock` prefix so the
// factory may close over it.
//
// ONE OBJECT, HANDED BACK ON EVERY CALL, and that is a property of the real router rather than a
// convenience here: useRouter reads a singleton off a context set once, so `router` is stable across
// renders. `read` now depends on it -- it calls router.replace to clear a `?d=` the device cannot
// show -- and a factory returning a fresh literal per call would make that callback a new function
// every render, which re-runs the effect that calls it, which sets state, forever. asPath is a
// getter so the module variable above stays the way a test moves the address bar.
const mockPush = jest.fn()
const mockReplace = jest.fn()
let mockAsPath = '/'
const mockRouter = {
  get asPath() {
    return mockAsPath
  },
  push: mockPush,
  replace: mockReplace,
}
jest.mock('next/router', () => ({ useRouter: () => mockRouter }))

// Built here rather than taken from a real pack: this is an ordering function, and the
// fixtures exist to make two puzzles differ in exactly one key at a time. A real pack
// varies in all three at once and could not tell which key did the work.
const puzzleFixture = (id: string, difficulty: Difficulty, type: string): Puzzle => ({
  data: {},
  difficulty,
  estimatedSeconds: 60,
  id,
  type: type as Puzzle['type'],
})

const ids = (puzzles: Puzzle[]): string[] => puzzles.map((puzzle) => puzzle.id)

// What Next does on a query-only push: it writes a history entry carrying the `__N` marker its own
// onPopState looks for -- whose absence is the entire reason the shelf no longer calls
// window.history.pushState -- and then reports the new address as asPath. Nothing re-renders on its
// own here, exactly as nothing does in the app: the next render the shelf does for its own reasons
// is the one that sees the new asPath.
beforeAll(() => {
  mockPush.mockImplementation(async (url: string) => {
    window.history.pushState({ __N: true, as: url, url: '/' }, '', url)
    mockAsPath = url
    return true
  })
  // The same, replacing rather than pushing -- which is what the shelf asks for when it clears a
  // `?d=` naming a day the device cannot show: nothing happened that a player could want to go Back
  // through. The `__N` marker is written here for the same reason it is written above, and it is the
  // whole point of routing this through the router at all.
  mockReplace.mockImplementation(async (url: string) => {
    window.history.replaceState({ __N: true, as: url, url: '/' }, '', url)
    mockAsPath = url
    return true
  })
})

describe('orderPuzzles', () => {
  // Gentlest first is the on-ramp, and every id here would sort the other way, so a
  // passthrough or an id-only sort fails this.
  it('puts the gentlest puzzle first', () => {
    const hard = puzzleFixture('a', 5, 'gofigure')
    const gentle = puzzleFixture('z', 1, 'gofigure')

    expect(ids(orderPuzzles([hard, gentle]))).toEqual(['z', 'a'])
  })

  // The bug that started this. toSorted is stable, so before the order was total, rows
  // that compared equal kept whatever order the pack arrived in -- and that order changed
  // between refetches.
  it('gives one day the same order whatever order it arrives in', () => {
    const day = [
      puzzleFixture('d1', 1, 'cryptogram'),
      puzzleFixture('d2', 1, 'gofigure'),
      puzzleFixture('d3', 1, 'missingvowels'),
      puzzleFixture('d4', 3, 'cryptogram'),
      puzzleFixture('d5', 3, 'gofigure'),
      puzzleFixture('d6', 3, 'missingvowels'),
    ]
    const shuffled = [day[4], day[0], day[5], day[2], day[3], day[1]]

    expect(ids(orderPuzzles(shuffled))).toEqual(ids(orderPuzzles(day)))
  })

  // Every id here would sort the other way, so only the bench order can produce this.
  it('breaks a tie in difficulty with the registry order of the benches', () => {
    const cipher = puzzleFixture('z', 2, 'cryptogram')
    const writing = puzzleFixture('m', 2, 'missingvowels')
    const tile = puzzleFixture('a', 2, 'gofigure')

    expect(ids(orderPuzzles([tile, writing, cipher]))).toEqual(['z', 'm', 'a'])
  })

  // TWO TYPES ON ONE BENCH, which is new and which is the case the total order was built for. A
  // shared bench means a shared benchRank, so difficulty and bench both tie and only `byId` can
  // separate them -- and ids are unique by construction, so the comparator can never return 0 and
  // toSorted's stability stops mattering. The ids here sort the opposite way from the arguments, so
  // a passthrough fails.
  // THE PREMISE IS ASSERTED, not assumed, and that is the whole of what this case adds over the
  // full-tie one below it. Its name says these two types share a bench; without the first line,
  // moving crypticclue to 'cipher' would leave it green while the BENCH term silently took over
  // from `byId` -- rank 0 beats 'writing', so cryptic still sorts first and the ordering agrees
  // with the assertion for a reason the test no longer describes.
  //
  // A MIRRORED PAIR CANNOT DO THIS JOB, which is worth writing down because it is the obvious fix
  // and it does not work. An id is `${date}:${type}:${shortId}`, so `byId` reaches the type segment
  // before the suffix: 'crypticclue' < 'missingvowels' at the first differing character, and no
  // choice of suffix makes Missing Vowels sort first between these two. The reversed row fails
  // against correct code.
  it('breaks a tie between two types on the same bench on the puzzle id', () => {
    expect(REGISTRY.crypticclue.bench).toBe(REGISTRY.missingvowels.bench)

    const cryptic = puzzleFixture('2026-08-18:crypticclue:aaaa1111', 3, 'crypticclue')
    const vowels = puzzleFixture('2026-08-18:missingvowels:zzzz9999', 3, 'missingvowels')

    expect(ids(orderPuzzles([vowels, cryptic]))).toEqual([
      '2026-08-18:crypticclue:aaaa1111',
      '2026-08-18:missingvowels:zzzz9999',
    ])
  })

  // The tiebreak of last resort, and what makes the order TOTAL: ids are unique, so the
  // comparator can never return 0 for two different puzzles and stability stops mattering.
  it('breaks a full tie on the puzzle id', () => {
    const second = puzzleFixture('b', 2, 'gofigure')
    const first = puzzleFixture('a', 2, 'gofigure')
    const third = puzzleFixture('c', 2, 'gofigure')

    expect(ids(orderPuzzles([second, third, first]))).toEqual(['a', 'b', 'c'])
  })

  // A pack is JSON off the network and lull-api can ship a generator before the UI that
  // draws it, so entryFor returns undefined. The row still has to have a place, and it is
  // after every row the day can actually draw.
  it('sorts a type this build has never heard of last', () => {
    const unknown = puzzleFixture('a', 2, 'crossword')
    const known = puzzleFixture('z', 2, 'gofigure')

    expect(ids(orderPuzzles([unknown, known]))).toEqual(['z', 'a'])
  })

  // Ids are unique by construction, so this is the one comparison the order cannot break
  // any further. It answers 0 rather than picking a side, because a comparator that said
  // "first is greater" for two equal ids would disagree with itself the moment a malformed
  // pack off the network repeated one.
  it('answers a repeated id with a tie', () => {
    const twin = puzzleFixture('a', 2, 'gofigure')

    expect(ids(orderPuzzles([twin, { ...twin }]))).toEqual(['a', 'a'])
  })

  it('leaves the pack it was handed alone', () => {
    const day = [puzzleFixture('z', 5, 'gofigure'), puzzleFixture('a', 1, 'gofigure')]

    orderPuzzles(day)

    expect(ids(day)).toEqual(['z', 'a'])
  })
})

describe('Shelf', () => {
  // Noon, so the local date under TZ=UTC is unambiguous.
  const now = (): number => Date.UTC(2026, 7, 18, 12)

  const setNavigatorOnLine = (value: boolean): void => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value, writable: true })
  }

  // Every test that touches localStorage clears it first, or the packs written by one
  // leak into the next. The address bar is reset with it: mockPush moves it, so a test in this
  // file that navigates would otherwise hand the next one a ?d= it never asked for.
  // THE STATE OBJECT IS NEXT'S, not `{}`, and that is not decoration. Next writes `__N: true` onto
  // the current entry on a microtask after hydration, and its onPopState ignores any pop whose state
  // lacks it -- so a bare replaceState({}) in a setup helper hands the component the exact corrupt
  // entry the app is supposed to avoid producing, and a test written on top of it cannot see the
  // difference between code that preserves the marker and code that wipes it.
  const setup = (): void => {
    window.localStorage.clear()
    window.history.replaceState({ __N: true, as: '/', url: '/' }, '', '/')
    mockAsPath = '/'
    setNavigatorOnLine(true)
  }

  const renderShelf = (): ReturnType<typeof render> => render(<Shelf locale="en-US" now={now} />)

  // The rows are the only links inside the region: the breadcrumb is a landmark of its
  // own outside it, and the install card offers buttons rather than links.
  const rows = (): HTMLElement[] => within(screen.getByRole('region', { name: 'Puzzles' })).getAllByRole('link')

  const spine = (): HTMLElement => screen.getByRole('navigation', { name: 'Breadcrumb' })

  describe('the date plate', () => {
    it('names the day the puzzles belong to', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.getByRole('heading', { name: 'Tuesday, August 18' })).toBeInTheDocument()
    })

    it('calls the day today when it is', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    it('says how the rows are ordered', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.getByText('Gentlest first. Pick any one.')).toBeInTheDocument()
    })

    // The generator works to UTC, so east of it a local date can run ahead of the newest
    // pack that exists. The shelf names the pack it is showing rather than the date it
    // wishes it had.
    it('falls back to the most recent pack when the local date runs ahead', () => {
      setup()
      writePack('2026-08-17', { ...pack, date: '2026-08-17' })

      renderShelf()

      expect(screen.getByRole('heading', { name: 'Monday, August 17' })).toBeInTheDocument()
    })

    // "Today" over a fallback pack would contradict the sentence directly beneath it.
    it('does not call a fallback day today', () => {
      setup()
      writePack('2026-08-17', { ...pack, date: '2026-08-17' })

      renderShelf()

      expect(screen.getByText('Most recent')).toBeInTheDocument()
    })

    it('says why the day on screen is not today', () => {
      setup()
      writePack('2026-08-17', { ...pack, date: '2026-08-17' })

      renderShelf()

      expect(screen.getByText('Today’s puzzles aren’t ready yet. This is the most recent set.')).toBeInTheDocument()
    })

    // West of UTC the prefetch stages tomorrow's local pack hours before midnight. It is
    // on the device on purpose; showing it would hand out a day early.
    it('never shows a pack from ahead of the local date', () => {
      setup()
      writePack('2026-08-18', pack)
      writePack('2026-08-19', { ...pack, date: '2026-08-19' })

      renderShelf()

      expect(screen.getByRole('heading', { name: 'Tuesday, August 18' })).toBeInTheDocument()
    })
  })

  describe('the spine', () => {
    it('names the day it is showing', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(within(spine()).getByText('Tue, Aug 18')).toBeInTheDocument()
    })

    it('names the product', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(within(spine()).getByRole('link', { name: 'Lull' })).toHaveAttribute('href', '/')
    })

    // An empty device knows no day, so there is nothing true to put after Lull.
    it('names no day when the device holds no pack', () => {
      setup()

      renderShelf()

      expect(within(spine()).queryByRole('link')).not.toBeInTheDocument()
    })
  })

  describe('the rows', () => {
    // The fixture pack lists the harder puzzle first, so a passthrough would fail here.
    it('puts the gentlest puzzle first', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[0]).toHaveTextContent('Gentle')
    })

    it('says how long each puzzle takes', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[1]).toHaveTextContent('About 3 min')
    })

    it('names the type of each puzzle', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[0]).toHaveTextContent('Go Figure!')
    })

    it('names how hard each puzzle is', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[1]).toHaveTextContent('Tricky')
    })

    // The thesis of the surface: each row shows the shape of the BENCH it opens, so
    // choosing here is visibly choosing between four different rooms.
    it('draws the bench glyph of the puzzle it opens', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[0].querySelector(`path[d="${REGISTRY.gofigure.glyph}"]`)).toBeInTheDocument()
    })

    // Never by color alone, and never by a tick with no name.
    it('marks a solved puzzle in words', () => {
      setup()
      writePack('2026-08-18', pack)
      markSolved(puzzleId)

      renderShelf()

      expect(within(rows()[1]).getByText('Solved')).toBeInTheDocument()
    })

    it('marks an unsolved puzzle in words too', () => {
      setup()
      writePack('2026-08-18', pack)
      markSolved(puzzleId)

      renderShelf()

      expect(within(rows()[0]).getByText('Not started')).toBeInTheDocument()
    })

    it('opens a puzzle by its id', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[1]).toHaveAttribute('href', `/p/${encodeURIComponent(puzzleId)}`)
    })

    it('encodes the colons an id carries', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[0]).toHaveAttribute('href', `/p/${encodeURIComponent(quickPuzzleId)}`)
    })
  })

  describe('what is missing', () => {
    it('says so when no pack has reached the device', () => {
      setup()

      renderShelf()

      expect(screen.getByRole('heading', { name: 'No puzzles on this device' })).toBeInTheDocument()
    })

    it('says how puzzles get here', () => {
      setup()

      renderShelf()

      expect(
        screen.getByText('They arrive on their own while you’re online. If you just opened Lull, give it a moment.'),
      ).toBeInTheDocument()
    })

    // A partial day is served on purpose and is playable now. Saying so is the
    // difference between "this is all there is" and "there is more coming".
    it('says a day is still being filled in', () => {
      setup()
      writePack('2026-08-18', incompletePack)

      renderShelf()

      expect(screen.getByText('More puzzles for this day are still on the way.')).toBeInTheDocument()
    })

    // lull-api can ship a generator before the UI that draws it. The row says what it
    // cannot do rather than destructuring an undefined registry entry, which would
    // throw during render, which ErrorBoundary answers by replacing the whole day.
    it('says so when a pack names a type this build does not know', () => {
      setup()
      writePack('2026-08-18', {
        ...pack,
        puzzles: [{ ...goFigurePuzzle, type: 'crossword' as typeof goFigurePuzzle.type }],
      })

      renderShelf()

      expect(screen.getByText('A newer kind of puzzle. Reload while you’re online to play it.')).toBeInTheDocument()
    })

    it('says nothing about filling in once a day is complete', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.queryByText('More puzzles for this day are still on the way.')).not.toBeInTheDocument()
    })

    // A day holds a day, so a pack with nothing in it collapses to the plate, the status
    // line and the install notice rather than to an apology.
    it('keeps the day on screen when the pack is empty', () => {
      setup()
      writePack('2026-08-18', { ...pack, puzzles: [] })

      renderShelf()

      expect(screen.getByRole('heading', { name: 'Tuesday, August 18' })).toBeInTheDocument()
    })
  })

  describe('being offline', () => {
    it('says so', () => {
      setup()
      setNavigatorOnLine(false)
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.getByRole('status')).toHaveTextContent('You’re offline. Only puzzles already here will open.')
    })

    // Always mounted, empty while online: NVDA and JAWS announce a change of text inside
    // a region they are already watching, and routinely miss one inserted with its
    // message already in it.
    it('keeps the live region mounted while online', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
  })

  describe('keeping up with the device', () => {
    // usePrefetch fills the device seconds after mount, and localStorage tells this tab
    // nothing about its own writes. Without listening for the announcement the shelf
    // keeps painting the first read it ever made.
    it('picks up a pack written after it rendered', async () => {
      setup()

      renderShelf()
      act(() => writePack('2026-08-18', pack))

      expect(await screen.findByRole('heading', { name: 'Tuesday, August 18' })).toBeInTheDocument()
    })

    it('removes the exact storage listener it added on unmount', () => {
      setup()
      const addEventListener = jest.spyOn(window, 'addEventListener')
      const removeEventListener = jest.spyOn(window, 'removeEventListener')
      const storageCalls = (calls: unknown[][]): unknown[][] => calls.filter(([type]) => type === STORAGE_EVENT)

      renderShelf().unmount()

      expect(storageCalls(addEventListener.mock.calls)).toHaveLength(1)
      expect(storageCalls(removeEventListener.mock.calls)).toEqual(storageCalls(addEventListener.mock.calls))
    })

    // Resume, not merely visibility. An installed app keeps its JS context across days,
    // so without this the shelf still names yesterday the next morning.
    it('removes the exact resume listener it added on unmount', () => {
      setup()
      const addEventListener = jest.spyOn(document, 'addEventListener')
      const removeEventListener = jest.spyOn(document, 'removeEventListener')
      const resumeCalls = (calls: unknown[][]): unknown[][] => calls.filter(([type]) => type === 'visibilitychange')

      renderShelf().unmount()

      expect(resumeCalls(addEventListener.mock.calls)).toHaveLength(1)
      expect(resumeCalls(removeEventListener.mock.calls)).toEqual(resumeCalls(addEventListener.mock.calls))
    })

    // The device can fill without this tab hearing the custom event -- another tab's
    // write, or a service worker's -- so the shelf re-reads on reconnect and on install
    // as well. Written straight to localStorage here, which is exactly what a write this
    // tab never announced looks like.
    it('re-reads the device when the app is installed', async () => {
      setup()

      renderShelf()
      window.localStorage.setItem('lull:pack:2026-08-18', JSON.stringify(pack))
      act(() => {
        window.dispatchEvent(new Event('appinstalled'))
      })

      expect(await screen.findByRole('heading', { name: 'Tuesday, August 18' })).toBeInTheDocument()
    })

    it('re-reads the device on a reconnect', async () => {
      setup()

      renderShelf()
      window.localStorage.setItem('lull:pack:2026-08-18', JSON.stringify(pack))
      act(() => {
        window.dispatchEvent(new Event('online'))
      })

      expect(await screen.findByRole('heading', { name: 'Tuesday, August 18' })).toBeInTheDocument()
    })
  })

  describe('the offer to install', () => {
    // The shelf is where the offer lives because it is the first screen and the only one
    // every visitor sees. It no longer changes what is fetched -- usePrefetch asks for
    // today's pack either way -- so what is asserted here is that the offer appears, not
    // that installing widens a window.
    it('offers to install once the browser says it can', async () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()
      act(() => {
        window.dispatchEvent(new Event('beforeinstallprompt'))
      })

      expect(await screen.findByRole('heading', { name: 'Put Lull on your home screen' })).toBeInTheDocument()
    })

    // Chromium withholds beforeinstallprompt from an installed app, and jsdom is
    // neither, so nothing is offered until the browser speaks.
    it('offers nothing while the browser has not spoken', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.queryByRole('heading', { name: 'Put Lull on your home screen' })).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    // The spine's one link comes first, which is the point of it: the way back is the
    // first thing the keyboard meets on every surface.
    //
    // THE PLATE CONTROL IS THE SECOND STOP AND THE ROWS MOVE TO THE THIRD, which is the one thing
    // adding a control to the plate costs every keyboard user on the surface. It is asserted here
    // rather than absorbed by a third bare tab, so the order is stated and a control inserted
    // above it later reddens this with a sentence naming what moved.
    it('reaches the first puzzle with the keyboard alone', async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      writePack('2026-08-18', pack)

      renderShelf()
      await user.tab()

      // ASSERTED RATHER THAN COUNTED OFF. The comment above claims the spine's link is the first
      // stop on every surface, and a bare tab checks nothing -- a control inserted ahead of it
      // would shift all three stops and leave the last assertion green a tab too late.
      expect(screen.getByRole('link', { name: 'Lull' })).toHaveFocus()

      await user.tab()

      expect(screen.getByRole('button', { name: 'Pick another day' })).toHaveFocus()

      await user.tab()

      expect(rows()[0]).toHaveFocus()
    })

    // Rendered with no props at all, which is how the page renders it: the clock and the
    // language come off the device, and neither may be read before the effect has run.
    // The assertion is date-free on purpose -- an empty device says the same thing on
    // every day there has ever been.
    it('reads the clock and the language off the device by default', () => {
      setup()

      render(<Shelf />)

      expect(screen.getByRole('heading', { name: 'No puzzles on this device' })).toBeInTheDocument()
    })
  })

  // A row for a type this build CAN draw that is missing a one-time download. The shelf is wrapped
  // in a context value rather than in the provider, so no network, no timers and no Cache API are
  // involved and the state under test is stated in one literal.
  describe('a row that needs the dictionary', () => {
    // Every chip the shelf can draw at once, on one day: a Phrazle the word list is missing for, a
    // solved puzzle, a half-played one, and one nobody has touched.
    const fourStatePack = { ...phrazlePack, puzzles: [phrazlePuzzle, goFigurePuzzle, quickPuzzle, missingVowelsPuzzle] }

    const setupShelf = (state: DictionaryState): void => {
      setup()
      writePack('2026-08-18', phrazlePack)
      render(
        <DictionaryContext.Provider value={state}>
          <Shelf locale="en-US" now={now} />
        </DictionaryContext.Provider>,
      )
    }

    // The one row in this fixture, addressed by role so the assertions below are about what a
    // screen reader walks past rather than about a class on a div.
    const dictionaryRow = (): HTMLElement =>
      within(screen.getByRole('region', { name: 'Puzzles' })).getByRole('listitem')

    // POSITIVE FIRST. A queryBy coming back null also passes on a shelf that rendered nothing at
    // all, which is exactly what a broken shelf does -- so the sentence is found before anything is
    // looked for and not found.
    //
    // THE TWO TESTS THIS FOLDS TOGETHER both ended on "there is no Phrazle link", one through
    // queryByRole and one through queryAllByRole, so one mutation reddened both and neither defended
    // anything the other did not. What is left is the copy plus a stronger statement of the same
    // promise: NOT A LINK AND NOT A DISABLED LINK AND NOT A BUTTON. A link to a board the shell will
    // refuse to mount is a trap -- the player arrives at a dead end they were invited to -- so
    // nothing in this row may be pressed and nothing in it may be reached by Tab. The explanation is
    // visible text read in place, the same shape the unknown-type row already has, which is why the
    // tab-order promise is asserted as an observable fact rather than by reading a tabIndex.
    //
    // REDDENS ON: dropping either sentence, or drawing the row as the <Link> branch does.
    it('says what will fix it, and offers nothing to press', () => {
      setupShelf({ status: 'absent', words: null })
      const row = dictionaryRow()

      expect(row).toHaveTextContent('Needs a connection to set up.')
      expect(screen.getByText('Needs setup')).toBeInTheDocument()
      expect(row.querySelectorAll('a, button, [tabindex]')).toHaveLength(0)
    })

    // It still says WHAT it is. Everything a player uses to choose -- the bench glyph, the name, the
    // difficulty, the time -- is exactly where it is on every other row, and only the last two
    // columns say "not yet".
    //
    // THE GLYPH'S aria-hidden IS RESOLVED HERE, because nothing else can. The bench sign is
    // decoration beside the words and never instead of them, so a reader hears the row's name once
    // and not twice -- but the row has no accessible name of its own, so no role query fails if the
    // attribute is deleted and the querySelector below finds the path either way.
    //
    // REDDENS ON: deleting aria-hidden from the glyph span in the unavailable branch.
    it('still names the puzzle and its shape', () => {
      setupShelf({ status: 'absent', words: null })
      const glyph = dictionaryRow().querySelector(`path[d="${REGISTRY.phrazle.glyph}"]`)

      expect(screen.getByText('Phrazle')).toBeInTheDocument()
      expect(screen.getByText('Medium · About 4 min')).toBeInTheDocument()
      expect(glyph).toBeInTheDocument()
      expect(glyph?.closest('span')).toHaveAttribute('aria-hidden', 'true')
    })

    // A WORD LIST STILL ON THE WAY IS NOT A WORD LIST THAT FAILED, and this row used to say it was.
    // The provider starts at `loading` because reading the Cache API is asynchronous, so on a cold
    // open this row paints before anything is known -- and "Needs a connection to set up." there is
    // false on a device that already has the word list and useless on one that does not, because
    // reconnecting is not the action and there is no action.
    //
    // REDDENS ON: putting the branch back to `status !== 'ready'` for the sentence and the chip --
    // the row then reads "Needs a connection to set up." and "Needs setup" while the shell is still
    // looking.
    it('says nothing a player could act on while the word list is still arriving', () => {
      setupShelf({ status: 'loading', words: null })
      const row = dictionaryRow()

      expect(row).toHaveTextContent('Getting ready')
      expect(row).not.toHaveTextContent('Needs a connection to set up.')
      expect(row).not.toHaveTextContent('Needs setup')
      expect(row.querySelectorAll('a, button, [tabindex]')).toHaveLength(0)
    })

    // WCAG 1.4.1, over the WHOLE table rather than over one pair. Every chip on this screen is drawn
    // in the same muted ink, so what separates them for a reader who cannot tell the hues apart is
    // the SHAPE -- and the word beside them is what separates them for a reader who cannot see
    // either. The words come first here because they are the stronger promise.
    //
    // FOUR ROWS AND TWO RENDERS, and both are the point. The earlier version held one Phrazle and
    // one goFigure, so the only pair it ever compared was `unavailable` against `unsolved` while its
    // name promised the new shape was distinct from all the others: setting `unavailable` to the
    // solved tick's own path left every test in this file green. Four rows put `solved`, `started`
    // and `unsolved` on screen beside it; the second render is what compares `preparing` with
    // `unavailable`, which cannot both be on one screen because one dictionary status answers the
    // whole shelf. The union of the two is every pair.
    //
    // REDDENS ON: giving any two entries of STATE_GLYPH the same path.
    it('gives every state chip a shape of its own, and a word of its own', () => {
      const shapesOn = (state: DictionaryState): string[] => {
        setup()
        writePack('2026-08-18', fourStatePack)
        markSolved(puzzleId)
        writeProgress(quickPuzzleId, '1+2')
        render(
          <DictionaryContext.Provider value={state}>
            <Shelf locale="en-US" now={now} />
          </DictionaryContext.Provider>,
        )
        // Inside the region, because the breadcrumb is a list of its own outside it. The second path
        // in a row is the chip's; the first is the bench sign.
        return within(screen.getByRole('region', { name: 'Puzzles' }))
          .getAllByRole('listitem')
          .map((row) => row.querySelectorAll('path')[1]?.getAttribute('d') ?? '')
      }

      const refused = shapesOn({ status: 'absent', words: null })

      expect(screen.getByText('Needs setup')).toBeInTheDocument()
      expect(screen.getByText('Solved')).toBeInTheDocument()
      expect(screen.getByText('Started')).toBeInTheDocument()
      expect(screen.getByText('Not started')).toBeInTheDocument()
      cleanup()

      const waiting = shapesOn({ status: 'loading', words: null })

      expect(screen.getByText('Getting ready')).toBeInTheDocument()
      expect(refused).toHaveLength(4)
      expect(waiting).toHaveLength(4)
      expect(new Set([...refused, ...waiting]).size).toEqual(5)
    })

    // THE PROGRESS THE PLAYER MADE SURVIVES THE WORD LIST GOING AWAY, and the row used to throw it
    // out. `unavailable` replaced the progress state outright, on an argument that a puzzle cannot
    // be started without a dictionary -- true within one session and false across two, which is the
    // only span that matters. Solve today's Phrazle, then reopen offline, or after the Cache API
    // evicts the entry: the player was told their solved puzzle needed setup, with the Solved chip
    // gone. The chip says what the PLAYER did; the sentence beside it says what the DEVICE needs.
    //
    // REDDENS ON: putting `<StateChip state="unavailable" />` back on the row.
    it('keeps the chip a solved puzzle earned when the word list is gone', () => {
      setup()
      writePack('2026-08-18', phrazlePack)
      markSolved(phrazlePuzzleId)
      render(
        <DictionaryContext.Provider value={{ status: 'absent', words: null }}>
          <Shelf locale="en-US" now={now} />
        </DictionaryContext.Provider>,
      )
      const row = dictionaryRow()

      expect(row).toHaveTextContent('Solved')
      expect(row).toHaveTextContent('Needs a connection to set up.')
      expect(row).not.toHaveTextContent('Needs setup')
    })

    // The same, for a puzzle left half-played. The PACK is what ages out, not the progress, so this
    // is the row a player comes back to on any day the pack is still on the device -- and it stops
    // being drawn at all on the day the pack goes, which is what bounds the case.
    //
    // REDDENS ON: putting `<StateChip state="unavailable" />` back on the row.
    it('keeps the chip a half-played puzzle earned when the word list is gone', () => {
      setup()
      writePack('2026-08-18', phrazlePack)
      writeProgress(phrazlePuzzleId, 'HOLD')
      render(
        <DictionaryContext.Provider value={{ status: 'absent', words: null }}>
          <Shelf locale="en-US" now={now} />
        </DictionaryContext.Provider>,
      )
      const row = dictionaryRow()

      expect(row).toHaveTextContent('Started')
      expect(row).toHaveTextContent('Needs a connection to set up.')
      expect(row).not.toHaveTextContent('Needs setup')
    })

    // When the dictionary lands mid-session the row becomes a link, because the shelf re-renders on
    // context change the same way it re-renders on STORAGE_EVENT. A benign change: it adds an
    // option, removes none, and moves no focus.
    it('becomes a link once the dictionary is ready', () => {
      setupShelf({ status: 'ready', words: phrazleDictionary })

      expect(screen.getByRole('link', { name: /Phrazle/ })).toHaveAttribute(
        'href',
        `/p/${encodeURIComponent(phrazlePuzzleId)}`,
      )
    })

    // THE ORDERING. An unknown type has NO entry to ask about needsDictionary, so the unknown-type
    // guard must stay FIRST -- put the new branch above it and the row dereferences
    // entry.needsDictionary on an entry that may be undefined, which is a throw during a render that
    // ErrorBoundary answers by replacing the whole day. The fixture is what makes this a real guard
    // test rather than a shape: a pack holding a type this build has never heard of, read with NO
    // dictionary, so BOTH branches are live and only their order decides which one answers.
    it('answers an unknown type before it asks about the dictionary', () => {
      setup()
      writePack('2026-08-18', {
        ...phrazlePack,
        puzzles: [{ ...phrazlePuzzle, type: 'crossword' as typeof phrazlePuzzle.type }],
      })

      render(
        <DictionaryContext.Provider value={{ status: 'absent', words: null }}>
          <Shelf locale="en-US" now={now} />
        </DictionaryContext.Provider>,
      )

      expect(screen.getByText('A newer kind of puzzle. Reload while you’re online to play it.')).toBeInTheDocument()
      expect(screen.queryByText('Needs a connection to set up.')).toBeNull()
    })
  })

  // A real complete pack is five goFigures at 60/90/120/150/180 seconds, which round to
  // 1, 2, 2, 3, 3 minutes -- so before difficulty was rendered, two pairs of rows had
  // byte-identical accessible names. The old two-puzzle fixture could never collide, so
  // the suite could not see it. This builds the real thing.
  describe('a full five-puzzle pack', () => {
    const fullPack = {
      complete: true,
      date: '2026-08-18',
      puzzles: [1, 2, 3, 4, 5].map((difficulty) => ({
        data: { acceptedSolutions: ['1+1'], bank: [1, 1], goal: 2, operators: ['+'] },
        difficulty,
        estimatedSeconds: 60 + 30 * (difficulty - 1),
        id: `2026-08-18:gofigure:${difficulty}aa`,
        type: 'gofigure',
      })),
    }

    it('gives every row a distinct accessible name', async () => {
      setup()
      writePack('2026-08-18', fullPack as never)

      renderShelf()

      const names = (await screen.findAllByRole('link')).map((link) => link.textContent ?? '')
      const puzzleRows = names.filter((name) => name.includes('Go Figure!'))
      expect(puzzleRows).toHaveLength(5)
      expect(new Set(puzzleRows).size).toEqual(puzzleRows.length)
    })

    // The same five puzzles, handed over in a different order, land on the screen in the
    // same order -- which is the whole of the fix.
    it('renders the same day identically whatever order the pack arrived in', () => {
      setup()
      writePack('2026-08-18', fullPack as never)
      const arrived = renderShelf()
      const first = rows().map((row) => row.textContent)
      arrived.unmount()

      setup()
      writePack('2026-08-18', { ...fullPack, puzzles: fullPack.puzzles.toReversed() } as never)
      renderShelf()
      const second = rows().map((row) => row.textContent)

      expect(second).toEqual(first)
    })
  })
})

// The locale is en-GB here and en-US above, deliberately: every date literal below is what Intl
// actually emits for en-GB, which puts NO comma after the weekday and DOES put one before a year.
// 'Friday 14 August' against 'Tuesday, 18 August 2026'. Verified with node rather than copied out
// of the spec's copy table, which writes '{Tuesday, 25 August}' to show the shape of an
// interpolated value and not a string any locale produces.
describe('Shelf, choosing a day', () => {
  const mockFetchPack = jest.mocked(fetchPack)
  const mockKeepThisSession = jest.mocked(keepThisSession)

  // 2026-08-18T12:00:00Z. Noon, so the local date under TZ=UTC is unambiguous.
  const now = (): number => Date.UTC(2026, 7, 18, 12)

  // A day of one puzzle whose id carries that day's date. summarizeDay counts solves by the date
  // prefix of an id, so a pack built by spreading a fixture and changing only `date` would report
  // its solves against the fixture's day and its rows would be a day out.
  const dayOf = (date: string, difficulty: Difficulty): Pack => ({
    complete: true,
    date,
    puzzles: [{ ...quickPuzzle, difficulty, id: `${date}:gofigure:1a2b3c4d` }],
  })

  const olderDay = dayOf('2026-08-17', 1)

  interface SetupOptions {
    // The address bar, written the way the shelf reads it: off window.location rather than
    // router.query. jsdom keeps the origin across replaceState, so this is same-document.
    date?: string
    packs?: Pack[]
    shelfNow?: () => number
    solved?: string[]
  }

  const setupShelf = ({ date, packs = [pack], shelfNow = now, solved = [] }: SetupOptions = {}): ReturnType<
    typeof render
  > => {
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true, writable: true })
    const url = date === undefined ? '/' : `/?d=${date}`
    // Next's own state shape and not `{}`. See the note on the other setup helper above: the marker
    // is what makes "the shelf left the entry usable" observable at all.
    window.history.replaceState({ __N: true, as: url, url: '/' }, '', url)
    // The address the router would report for that same URL. Both halves are set, because the
    // shelf reads the parameter off window.location and watches asPath to know when to read it
    // again -- and a test that set only one of them would be modeling a state the browser cannot
    // be in.
    mockAsPath = url
    packs.forEach((each) => writePack(each.date, each))
    solved.forEach(markSolved)
    return render(<Shelf locale="en-GB" now={shelfNow} />)
  }

  // Everything on the device solved, so nothing is left to recommend and the pool notice is the
  // whole of Up Next.
  const setupSweptDevice = (): ReturnType<typeof render> => setupShelf({ solved: [puzzleId, quickPuzzleId] })

  // Opens the panel from the pool notice, names March, and presses the fourteenth. What the
  // request answers with is whatever mockFetchPack was told to answer with.
  const askForMarch = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByRole('button', { name: 'Bring back an earlier day' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-03')
    await user.click(screen.getByRole('button', { name: /Sat 14 Mar/ }))
  }

  describe('the plate control', () => {
    it('opens the day panel from the plate', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf()

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))

      expect(screen.getByRole('heading', { name: 'Choose a day' })).toBeInTheDocument()
    })

    it('reports the plate control’s state and points it at the panel', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf()
      const control = screen.getByRole('button', { name: 'Pick another day' })

      expect(control).toHaveAttribute('aria-expanded', 'false')

      await user.click(control)
      const open = screen.getByRole('button', { name: 'Hide the days' })

      expect(open).toHaveAttribute('aria-expanded', 'true')
      // aria-controls contributes no accessible name, so nothing else in this suite can catch it
      // rotting: every role query goes on passing while the relationship it asserts is gone.
      expect(document.getElementById(open.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
    })

    it('closes the panel again from the same control', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf()

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))
      await user.click(screen.getByRole('button', { name: 'Hide the days' }))

      expect(screen.queryByRole('heading', { name: 'Choose a day' })).not.toBeInTheDocument()
    })

    // THE PRUNE COLLECTS BY AGE AND DOES NOT CARE HOW THE DAY WAS REACHED. retentionFloor is
    // today - 6, so the oldest row in the seven-day list sits exactly ON the floor and drops below
    // it the moment the local date rolls over: the next resume deletes the day the player is looking
    // at, the shelf finds it unheld, and the address bar is rewritten to `/`. Naming a day in the
    // month field was already exempt; pressing it in the list -- the ordinary way in -- was not.
    it('asks for a selected day to be kept for the session', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf({ packs: [pack, olderDay] })

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))
      await user.click(screen.getByRole('button', { name: /Mon 17 Aug/ }))

      expect(mockKeepThisSession).toHaveBeenCalledWith('2026-08-17')
    })

    // The panel opens below the plate and runs well past the fold, so leaving the keyboard on the
    // control would strand a reader at a press whose whole effect is off screen.
    it('moves focus into the panel when it opens', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf()

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))

      expect(screen.getAllByRole('button', { name: /solved\.$/ })[0]).toHaveFocus()
    })

    it('returns focus to the plate control when dismissed', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf()
      await user.click(screen.getByRole('button', { name: 'Pick another day' }))

      await user.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(screen.getByRole('button', { name: 'Pick another day' })).toHaveFocus()
    })

    // SAFARI DOES NOT FOCUS A <button> ON CLICK, so the element holding the keyboard at the moment
    // of the press is <body> -- which is connected, and therefore passed the "is the opener still
    // on the page" check and then took body.focus(). That drops the keyboard to the top of the
    // document and restarts the next Tab there, which is the failure every other focus move on this
    // surface exists to prevent.
    //
    // fireEvent rather than a userEvent instance, and it is the only thing that can model this: the
    // whole job of userEvent.click is to do what a browser does, and every browser except Safari
    // focuses the target -- so the state under test is unreachable through it. This test declares no
    // instance because it drives no typing and no tab order; it is one press that deliberately
    // leaves focus where it found it.
    it('returns focus to the plate control when the press never focused anything', () => {
      setupShelf()

      fireEvent.click(screen.getByRole('button', { name: 'Pick another day' }))
      fireEvent.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(document.body).not.toHaveFocus()
      expect(screen.getByRole('button', { name: 'Pick another day' })).toHaveFocus()
    })
  })

  describe('the day in the address bar', () => {
    it('renders the day named in the address bar', () => {
      setupShelf({ date: '2026-08-14', packs: [pack, dayOf('2026-08-14', 1)] })

      expect(screen.getByRole('heading', { level: 1, name: 'Friday 14 August' })).toBeInTheDocument()
    })

    // A reached past day is NOT the same fact as "today's pack has not been generated yet", which
    // is what the shipping "Most recent" eyebrow means.
    it('says a reached past day is an earlier day', () => {
      setupShelf({ date: '2026-08-14', packs: [pack, dayOf('2026-08-14', 1)] })

      expect(screen.getByText('Earlier day')).toBeInTheDocument()
    })

    // "Today's puzzles aren't ready yet" is a claim about the generator. Over a day the player
    // deliberately reached it is flatly false, and changing the eyebrow alone would have left it
    // standing there.
    it('does not blame the generator for a day the player reached', () => {
      setupShelf({ date: '2026-08-14', packs: [pack, dayOf('2026-08-14', 1)] })

      expect(screen.getByText('Gentlest first. Pick any one.')).toBeInTheDocument()
    })

    it('names the reached day in the breadcrumb', () => {
      setupShelf({ date: '2026-08-14', packs: [pack, dayOf('2026-08-14', 1)] })

      expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Fri 14 Aug')).toBeInTheDocument()
    })

    // A bad ?d= is a link someone mangled. An error screen would accuse the player of it, and
    // today is always a correct answer. '2026-02-30' is the one that a format test alone lets
    // through.
    it.each(['2026-08-19', '2025-12-31', '2026-02-30', 'nonsense', ''])(
      'ignores the unusable ?d= value %p',
      (value) => {
        setupShelf({ date: value })

        expect(screen.getByText('Today')).toBeInTheDocument()
      },
    )

    // A shared link naming a day this device has never held. Nothing is fetched for it: the four
    // request states live in the panel, so a silent thirty-second wait under today's rows would
    // report itself nowhere.
    it('falls back to the newest pack for a day the device does not hold', () => {
      setupShelf({ date: '2026-03-14' })

      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'Tuesday 18 August' })).toBeInTheDocument()
    })

    // AND THE ADDRESS BAR IS PUT RIGHT, rather than left naming 14 March over today's rows. Packs
    // live seven days and the month field reaches back to January, so a link shared off a phone
    // routinely names a day the second device never held -- and nothing fetches it, so the
    // disagreement was permanent.
    it('clears a day the device does not hold out of the address bar', () => {
      setupShelf({ date: '2026-03-14' })

      expect(window.location.search).toEqual('')
    })

    // THROUGH THE ROUTER HERE TOO, and this line got it wrong first: it cleared the parameter with a
    // raw window.history.replaceState({}, '', '/'), thirty lines above the comment in selectDay
    // explaining why that is never safe. Next writes `__N: true` onto the current entry after
    // hydration and its onPopState returns early without it, so the state left behind was truthy,
    // unmarked, and silently swallowed the next pop -- open a shared /?d=2026-03-14 on a device that
    // never held March, tap a puzzle, press Back, and the address bar reads `/` with the puzzle still
    // on screen. next/router is mocked, so what is asserted is the call that hands Next the entry.
    it('hands the correction to the router rather than replacing at the history stack', () => {
      setupShelf({ date: '2026-03-14' })

      expect(mockReplace).toHaveBeenCalledWith('/', undefined, { scroll: false, shallow: true })
    })

    // The property underneath that call, asserted on the entry itself rather than on the caller. The
    // setup helper writes the state Next holds after hydration, so this fails against a raw
    // replaceState({}) for the same reason the app did.
    it('leaves the history entry usable after clearing the address bar', () => {
      setupShelf({ date: '2026-03-14' })

      expect(window.history.state).toHaveProperty('__N', true)
    })

    // THE OTHER HALF OF THAT, and the reason the two are not one rule. A ?d= this build refuses is
    // mangled or in the future, and a link to tomorrow starts working tomorrow -- rewriting it away
    // would take that from the reader to settle a disagreement that lasts as long as they look at
    // the screen.
    it('leaves a day that has not arrived yet in the address bar', () => {
      setupShelf({ date: '2026-08-19' })

      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(window.location.search).toEqual('?d=2026-08-19')
    })

    // TWO CLOCKS IN ONE RENDER is what this defends. dayLabel adds a year only when the day is not
    // in the reader's current year, so a bare call reads the wall clock -- and the year is the one
    // observable difference, which makes this the only assertion that can catch it.
    it('gives the day its year once the year has turned', () => {
      setupShelf({ shelfNow: () => Date.UTC(2027, 0, 4, 12) })

      expect(screen.getByRole('heading', { level: 1, name: 'Tuesday, 18 August 2026' })).toBeInTheDocument()
    })

    it('puts the day the player chose in the address bar', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf({ packs: [pack, olderDay] })

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))
      await user.click(screen.getByRole('button', { name: /Mon 17 Aug/ }))

      expect(window.location.search).toEqual('?d=2026-08-17')
      expect(screen.getByRole('heading', { level: 1, name: 'Monday 17 August' })).toBeInTheDocument()
    })

    // THROUGH THE ROUTER, NEVER window.history.pushState, and this is the assertion that pins it.
    // Next's pages router owns this history stack: its onPopState returns without changing route
    // when the popped state carries no `__N` marker, so a raw pushState({}) entry was SILENTLY
    // IGNORED on the way back. Pick a day, open a puzzle, press Back, and the address bar read
    // `/?d=2026-08-17` while the puzzle stayed on screen. Nothing else in this suite can see that,
    // because next/router is mocked -- so what is asserted is the call that hands Next the entry.
    //
    // scroll: false because the plate control is already scrolled into view by the focus move;
    // shallow: true because pages/index.tsx has no getStaticProps and there is nothing to re-fetch.
    it('hands the chosen day to the router rather than pushing at the history stack', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf({ packs: [pack, olderDay] })

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))
      await user.click(screen.getByRole('button', { name: /Mon 17 Aug/ }))

      expect(mockPush).toHaveBeenCalledWith('/?d=2026-08-17', undefined, { scroll: false, shallow: true })
    })

    // Today is the shelf's default, so /?d=2026-08-18 and / are the same screen -- and only one of
    // them is still right tomorrow morning.
    it('clears the address bar when the day chosen is today', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf({ date: '2026-08-17', packs: [pack, olderDay] })

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))
      await user.click(screen.getByRole('button', { name: /Tue 18 Aug/ }))

      expect(window.location.search).toEqual('')
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    // The row that was just pressed goes away with the panel. Without somewhere to send the
    // keyboard first it falls to <body> and the next Tab restarts at the top of the document.
    it('moves focus back to the plate control after choosing a day', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf({ packs: [pack, olderDay] })

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))
      await user.click(screen.getByRole('button', { name: /Mon 17 Aug/ }))

      expect(screen.getByRole('button', { name: 'Pick another day' })).toHaveFocus()
    })

    // pushState does not fire popstate, so the listener costs nothing on the way in and everything
    // on the way back: without it Back changes the address bar and the screen keeps showing the
    // day the player just left. Dispatched here rather than driven through history.back(), which
    // jsdom answers on a later task this suite would have to wait on.
    it('goes back to today when the address bar does', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf({ packs: [pack, olderDay] })
      await user.click(screen.getByRole('button', { name: 'Pick another day' }))
      await user.click(screen.getByRole('button', { name: /Mon 17 Aug/ }))

      act(() => {
        window.history.replaceState({}, '', '/')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })

      expect(await screen.findByRole('heading', { level: 1, name: 'Tuesday 18 August' })).toBeInTheDocument()
    })

    // THE SPINE'S LULL CRUMB IS NOW A LINK TO A DIFFERENT SCREEN, and following it fires no
    // popstate: it is a pushState navigation onto the same route, so _app.tsx -- which renders
    // <Component> with no key -- keeps this very instance mounted and re-runs nothing. The address
    // bar cleared to `/` and the plate went on reading "Monday 17 August". What the shelf watches
    // instead is router.asPath, which is what this test moves.
    it('follows the spine back to today with no popstate at all', () => {
      const view = setupShelf({ date: '2026-08-17', packs: [pack, olderDay] })

      expect(screen.getByRole('heading', { level: 1, name: 'Monday 17 August' })).toBeInTheDocument()

      window.history.pushState({ __N: true, as: '/', url: '/' }, '', '/')
      mockAsPath = '/'
      view.rerender(<Shelf locale="en-GB" now={now} />)

      expect(screen.getByRole('heading', { level: 1, name: 'Tuesday 18 August' })).toBeInTheDocument()
      expect(screen.getByText('Today')).toBeInTheDocument()
    })
  })

  describe('asking for an older day', () => {
    it('asks for a day that is not on the device', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockResolvedValueOnce({ ...pack, date: '2026-03-14' })
      setupSweptDevice()

      await askForMarch(user)

      expect(await screen.findByText('Saturday 14 March is here.')).toBeInTheDocument()
      expect(mockFetchPack).toHaveBeenCalledWith('2026-03-14')
    })

    // get-pack-by-date answers 404 when nothing could be generated. axios throws, and the
    // difference between that and a dropped connection is the status on the response -- which is
    // the only thing separating a permanent answer from a retryable one.
    it('reports an empty day as having no puzzles', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: { status: 404 } }))
      setupSweptDevice()

      await askForMarch(user)

      expect(await screen.findByText('Trying again won’t help. Choose another day.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Try again/ })).not.toBeInTheDocument()
    })

    it('reports a dropped connection as retryable', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(new Error('Network Error'))
      setupSweptDevice()

      await askForMarch(user)

      expect(await screen.findByRole('button', { name: 'Try again — Saturday 14 March.' })).toBeInTheDocument()
    })

    // TWO DAYS CAN BE IN FLIGHT AT ONCE, because a row stays pressable through the wait on purpose
    // and nothing stops the next press being a different row. Both writes land in the one `request`
    // slot, so without a guard the order they RESOLVE in decides what the panel says: the earlier
    // ask answering second announces "14 March is here." over a 15 March that is still on its way,
    // takes "On its way" off its row, and clears aria-busy off the month list mid-fetch.
    //
    // The second ask never settles, so the only thing that can move the panel is the first one
    // coming back late -- which is exactly what must not move it.
    it('ignores a day that settles after the player has asked for another', async () => {
      const user = userEvent.setup({ delay: null })
      const marchDay = dayOf('2026-03-14', 1)
      // Deferred by hand rather than by a timer: the point is the ORDER two settles arrive in, and a
      // fake clock would only be a slower way of choosing it.
      let landTheFourteenth = (): void => {}
      mockFetchPack.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            landTheFourteenth = () => {
              // Written through the way the real fetchPack writes, so the late settle arrives by the
              // route it arrives by in the app -- storage, and the event storage announces.
              writePack(marchDay.date, marchDay)
              resolve(marchDay)
            }
          }),
      )
      mockFetchPack.mockImplementationOnce(() => new Promise(() => {}))
      setupSweptDevice()

      await askForMarch(user)
      await user.click(screen.getByRole('button', { name: 'Sun 15 Mar — bring this day back.' }))
      await act(async () => {
        landTheFourteenth()
      })
      const panel = within(screen.getByRole('region', { name: 'Choose a day' }))

      expect(panel.getByRole('status')).toHaveTextContent('Bringing back Sunday 15 March…')
      expect(screen.queryByText('Saturday 14 March is here.')).not.toBeInTheDocument()
    })

    // THE PANEL IS ALSO OPENED BY A CONTROL THAT IS ON SCREEN WHILE IT IS OPEN. Up Next's offer sits
    // at the foot of the shelf whatever the panel is doing, and openPanel used to clear the request
    // unconditionally -- so this press blanked the live region a reader was waiting on, dropped the
    // "up to half a minute" aside, returned the pending row to its ordinary name, and brought all of
    // it back when the fetch settled. The reset belongs to the three ways the panel LEAVES.
    it('leaves a request in flight alone when the panel is already open', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockImplementationOnce(() => new Promise(() => {}))
      setupSweptDevice()
      await askForMarch(user)

      await user.click(screen.getByRole('button', { name: 'Bring back an earlier day' }))
      const panel = within(screen.getByRole('region', { name: 'Choose a day' }))

      expect(panel.getByRole('status')).toHaveTextContent('Bringing back Saturday 14 March…')
      expect(
        screen.getByText('This can take up to half a minute. The days already on this device still open right away.'),
      ).toBeInTheDocument()
    })
  })

  describe('up next', () => {
    // A recommendation parked above unsolved rows competes with the screen it sits on, which is
    // the one idea in this design most likely to be lost in a build.
    it('holds its tongue while the day still has puzzles open', () => {
      setupShelf({ packs: [pack, olderDay] })

      expect(
        screen.getByText('Two puzzles are still open on this day. Another one is waiting when you finish.'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Play/ })).not.toBeInTheDocument()
    })

    it('names one puzzle to play next once the day is finished', () => {
      setupShelf({ packs: [pack, olderDay], solved: [puzzleId, quickPuzzleId] })

      expect(screen.getByRole('button', { name: 'Play Go Figure!' })).toBeInTheDocument()
      expect(screen.getByText('From Monday 17 August. The gentlest puzzle you haven’t solved.')).toBeInTheDocument()
    })

    it('says the day is finished and that something is waiting', () => {
      setupShelf({ packs: [pack, olderDay], solved: [puzzleId, quickPuzzleId] })

      expect(screen.getByText('All two solved. One from an earlier day is waiting below.')).toBeInTheDocument()
    })

    // The second clause comes off when there is nothing left to wait for -- Up Next renders the
    // pool notice instead of a card, and a plate promising a puzzle below an empty foot is the
    // same lie in the other direction.
    it('drops the promise when nothing is left to recommend', () => {
      setupSweptDevice()

      expect(screen.getByText('All two solved.')).toBeInTheDocument()
    })

    it('opens the puzzle it names', async () => {
      const user = userEvent.setup({ delay: null })
      setupShelf({ packs: [pack, olderDay], solved: [puzzleId, quickPuzzleId] })

      await user.click(screen.getByRole('button', { name: 'Play Go Figure!' }))

      expect(mockPush).toHaveBeenCalledWith(`/p/${encodeURIComponent('2026-08-17:gofigure:1a2b3c4d')}`)
    })

    // The pick is drawn with the day on screen EXCLUDED, so a null pick means "everything outside
    // today is solved" and never "everything is solved". With one day on the device and all of it
    // swept, the pool genuinely is spent.
    it('offers to bring back an earlier day when the pool is spent', () => {
      setupSweptDevice()

      expect(
        screen.getByText('You’ve solved everything on this device. Lull can bring back an earlier day.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bring back an earlier day' })).toBeInTheDocument()
    })

    // IN THIS STATE EVERY DAY ROW IS "ALL SOLVED" AND THEREFORE NOT A CONTROL, so opening the
    // panel the usual way would land the keyboard on a run of inert rows with the only working
    // control below them and off screen on a phone.
    it('lands the keyboard on the month control when the pool is spent', async () => {
      const user = userEvent.setup({ delay: null })
      setupSweptDevice()

      await user.click(screen.getByRole('button', { name: 'Bring back an earlier day' }))

      expect(screen.getByRole('combobox', { name: 'Month' })).toHaveFocus()
    })

    // A 404 IS ONE DATE, AND THE READER'S NEXT MOVE IS TO NAME A DIFFERENT ONE. Up Next used to
    // withhold this button on exactly that press -- so the screen said "choose another day" twice,
    // in two components' words, and removed the control that does it. The panel's own line is the
    // whole report; the offer behind it is what makes the advice actionable.
    it('goes on offering after a day came back empty', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: { status: 404 } }))
      setupSweptDevice()

      await askForMarch(user)
      await screen.findByText('Trying again won’t help. Choose another day.')

      expect(screen.getByRole('button', { name: 'Bring back an earlier day' })).toBeInTheDocument()
    })

    // AND THE KEYBOARD GOES BACK TO IT. The offer is the control that opened the panel, and it is
    // still mounted after a 404 -- so "Never mind" returns focus to the press that started this
    // rather than falling through to the plate control below. The fallback was reached on this path
    // only because the offer used to be taken away; a real opener outranks it.
    it('returns the keyboard to the offer after a day came back empty', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: { status: 404 } }))
      setupSweptDevice()
      await askForMarch(user)
      await screen.findByText('Trying again won’t help. Choose another day.')

      await user.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(screen.getByRole('button', { name: 'Bring back an earlier day' })).toHaveFocus()
    })

    // ONE EVENT, ONE COMPONENT REPORTING IT. The day panel owns the 404 because the day panel asked;
    // Up Next's sentence is about what is left to play and is still true in both clauses after one
    // date fails. And neither of them calls the archive finished -- only GET /packs could support
    // that, and §2 keeps it undeployed.
    it('leaves the news of an empty day to the panel that asked for it', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: { status: 404 } }))
      setupSweptDevice()

      await askForMarch(user)
      await screen.findByText('Trying again won’t help. Choose another day.')

      expect(screen.queryByText('There was nothing for that day. Pick another day.')).not.toBeInTheDocument()
      expect(screen.queryByText(/every puzzle Lull has made/)).not.toBeInTheDocument()
      expect(
        screen.getByText('You’ve solved everything on this device. Lull can bring back an earlier day.'),
      ).toBeInTheDocument()
    })

    // WHAT THE SESSION LEARNED OUTLIVES THE PANEL THAT REPORTED IT, and this is the one reader left
    // to prove it. Clearing `request` on dismissal is what stops a reopened panel talking about a
    // day it can no longer show -- but the player still went and got 14 March, so the card has to go
    // on saying the pick is what they have left THERE after the panel that fetched it is gone.
    it('remembers which day the player went and got once the panel is dismissed', async () => {
      const user = userEvent.setup({ delay: null })
      const marchDay = dayOf('2026-03-14', 1)
      mockFetchPack.mockImplementationOnce(async (date) => {
        writePack(date, marchDay)
        return marchDay
      })
      setupSweptDevice()
      await askForMarch(user)
      await screen.findByText('Saturday 14 March is here.')

      await user.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(screen.getByText('From Saturday 14 March. The gentlest one you have left there.')).toBeInTheDocument()
    })

    // A REGION THAT MOUNTS WITH ITS MESSAGE ALREADY IN IT NEVER ANNOUNCES -- said three times in this
    // codebase, and this was the one place doing it. `request` was never cleared, so closing the
    // panel after a failure and opening it again brought back the status line, its aside and its
    // "Try again" primary -- about 14 March, while DayPanel's own `month` state had reset with the
    // unmount, so the panel could not even show the day it was talking about.
    it('opens a fresh panel after a request the player walked away from', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(new Error('Network Error'))
      setupSweptDevice()
      await askForMarch(user)
      await screen.findByText('The connection dropped before the day came back.')

      await user.click(screen.getByRole('button', { name: 'Never mind' }))
      await user.click(screen.getByRole('button', { name: 'Pick another day' }))

      const panel = screen.getByRole('region', { name: 'Choose a day' })
      expect(within(panel).getByRole('status')).toBeEmptyDOMElement()
      expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument()
      expect(screen.queryByText('The connection dropped before the day came back.')).not.toBeInTheDocument()
    })

    // THE OFFER STANDS IN EVERY STATE A REQUEST CAN BE IN, and the three below plus the 404 above
    // are all four of them. This started as a null check on `request`, which withdrew the offer on
    // every press ever made; then it read the settled state and withdrew it on a 404 only; it now
    // reads no request state at all. Each of the four is here because each was once a way for the
    // panel to stop offering something that was still worth offering.
    //
    // A dropped connection is the plainest: nothing was learned, the panel's own sentence directly
    // above says so ("The connection dropped before the day came back"), and the offer was withdrawn
    // on the one press where asking again is the right next action.
    it('goes on offering after a request the connection dropped', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(new Error('Network Error'))
      setupSweptDevice()

      await askForMarch(user)
      await screen.findByText('The connection dropped before the day came back.')

      expect(screen.getByRole('button', { name: 'Bring back an earlier day' })).toBeInTheDocument()
    })

    // A request in flight has not answered yet, and announcing exhaustion during a wait the panel
    // is already describing ("This can take up to half a minute") contradicted it. It also used to
    // take the offer away on the very press that used it, which is how the detached opener below was
    // first reached; a landed day is now the only way there.
    it('goes on offering while a day is still on its way', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockReturnValueOnce(new Promise<Pack>(() => {}))
      setupSweptDevice()

      await askForMarch(user)

      expect(screen.getByText('Bringing back Saturday 14 March…')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bring back an earlier day' })).toBeInTheDocument()
    })

    // THE ONE PATH THAT WORKED WAS THE ONE PUNISHED. Sweep the device, ask for a day, play what
    // comes back, and the pick is null again while `request` still says `landed` -- so the app
    // announced that Lull has made no more puzzles at the exact moment the feature had just proved
    // it has.
    it('goes on offering once a day that landed has itself been played out', async () => {
      const user = userEvent.setup({ delay: null })
      const marchDay = dayOf('2026-03-14', 1)
      mockFetchPack.mockImplementationOnce(async (date) => {
        writePack(date, marchDay)
        return marchDay
      })
      setupSweptDevice()

      await askForMarch(user)
      await screen.findByText('Saturday 14 March is here.')
      act(() => {
        markSolved(marchDay.puzzles[0].id)
      })

      expect(screen.getByRole('button', { name: 'Bring back an earlier day' })).toBeInTheDocument()
    })

    // THE RETENTION RULE COLLECTS BY AGE, and a day the player waited thirty seconds for is by
    // definition past the floor -- so without this call the next resume deletes 14 March out from
    // under the screen showing it, rewrites the address bar to `/`, and bounces the player to today
    // with no message. usePrefetch owns the exemption; what the shelf owes it is the date, once the
    // day has actually landed.
    it('asks for a landed day to be kept for the session', async () => {
      const user = userEvent.setup({ delay: null })
      const marchDay = dayOf('2026-03-14', 1)
      mockFetchPack.mockImplementationOnce(async (date) => {
        writePack(date, marchDay)
        return marchDay
      })
      setupSweptDevice()

      await askForMarch(user)
      await screen.findByText('Saturday 14 March is here.')

      expect(mockKeepThisSession).toHaveBeenCalledWith('2026-03-14')
    })

    // ON SUCCESS AND ONLY ON SUCCESS. A day that never arrived left no pack behind, so exempting it
    // would put a date in the session's keep-set that names nothing -- and the set is the one thing
    // standing between the prune and a day the player is looking at, so it holds only days that are
    // actually there.
    it('keeps nothing when the day never arrived', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockRejectedValueOnce(new Error('Network Error'))
      setupSweptDevice()

      await askForMarch(user)
      await screen.findByText('The connection dropped before the day came back.')

      expect(mockKeepThisSession).not.toHaveBeenCalled()
    })

    // The control that opened the panel was Up Next's offer, and a day that LANDS gives Up Next a
    // puzzle to name -- so its card replaces the offer and "Never mind" has nowhere to put the
    // keyboard back. Focusing a detached node drops it to <body> and restarts the next Tab at the
    // top of the document. This is the only press that still detaches the opener: a 404 and a
    // dropped connection both leave the offer exactly where it was.
    it('falls back to the plate control when the opener has gone', async () => {
      const user = userEvent.setup({ delay: null })
      const marchDay = dayOf('2026-03-14', 1)
      mockFetchPack.mockImplementationOnce(async (date) => {
        writePack(date, marchDay)
        return marchDay
      })
      setupSweptDevice()
      await askForMarch(user)
      await screen.findByText('Saturday 14 March is here.')

      await user.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(screen.getByRole('button', { name: 'Pick another day' })).toHaveFocus()
    })
  })

  describe('an empty device', () => {
    // There is no plate, therefore nowhere for the plate control to live. The panel stops being a
    // disclosure and becomes the screen.
    it('promotes the panel when the device holds nothing', () => {
      setupShelf({ packs: [] })

      expect(screen.getByRole('heading', { name: 'No puzzles on this device' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Bring a day back' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bring back today, Tuesday 18 August.' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pick another day' })).not.toBeInTheDocument()
    })

    // The shelf's own empty state says more than Up Next could, and there is nothing for it to be
    // next to. It is also what keeps the panel's primary the ONE filled control on the screen.
    it('says nothing about what is next', () => {
      setupShelf({ packs: [] })

      expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument()
    })

    it('asks for today from the panel’s primary', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockResolvedValueOnce(pack)
      setupShelf({ packs: [] })

      await user.click(screen.getByRole('button', { name: 'Bring back today, Tuesday 18 August.' }))

      expect(await screen.findByText('Tuesday 18 August is here.')).toBeInTheDocument()
      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-18')
    })

    // THE PRESS UNMOUNTS ITS OWN CONTROL, and this is the one screen where it cannot be helped: the
    // request that lands is what fills the device, so the `pack === null` branch is replaced by the
    // plate and takes the promoted panel -- and the primary that was just pressed -- with it. The
    // panel is not open as a disclosure on that path, so nothing remounts it and DayPanel's own
    // focus effect cannot run, because the component is gone. The keyboard fell to <body> and the
    // next Tab restarted at the top of the document (WCAG 2.4.3).
    //
    // The existing case above cannot see this: it resolves without WRITING, so the device stays
    // empty, the panel stays mounted and nothing is ever taken away.
    it('catches the keyboard when the request that lands takes the panel away', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockImplementationOnce(async (date) => {
        writePack(date, pack)
        return pack
      })
      setupShelf({ packs: [] })

      await user.click(screen.getByRole('button', { name: 'Bring back today, Tuesday 18 August.' }))
      const control = await screen.findByRole('button', { name: 'Pick another day' })

      expect(document.body).not.toHaveFocus()
      expect(control).toHaveFocus()
    })

    // THE THIRD WAY THE PANEL LEAVES THE SCREEN, and the one nobody dismissed: the request that
    // lands is what fills the device, so the panel stops being the page, becomes a disclosure, and
    // unmounts. Reopening it brought "Tuesday 18 August is here." back into a role="status" that had
    // only just mounted -- an announcement about a request finished several presses ago.
    it('opens a fresh panel after the request that filled the device', async () => {
      const user = userEvent.setup({ delay: null })
      mockFetchPack.mockImplementationOnce(async (date) => {
        writePack(date, pack)
        return pack
      })
      setupShelf({ packs: [] })
      await user.click(screen.getByRole('button', { name: 'Bring back today, Tuesday 18 August.' }))
      await screen.findByRole('button', { name: 'Pick another day' })

      await user.click(screen.getByRole('button', { name: 'Pick another day' }))

      const panel = screen.getByRole('region', { name: 'Choose a day' })
      expect(within(panel).getByRole('status')).toBeEmptyDOMElement()
    })
  })
})

// The four cases below reach state the shelf can produce and the block above cannot: a device
// whose every cached day is finished, a pick this build could not mount, a day the player asked
// for and got, and the card's own way into the panel.
describe('Shelf, the states behind the pick', () => {
  const mockFetchPack = jest.mocked(fetchPack)

  const now = (): number => Date.UTC(2026, 7, 18, 12)

  const dayOf = (date: string, difficulty: Difficulty): Pack => ({
    complete: true,
    date,
    puzzles: [{ ...quickPuzzle, difficulty, id: `${date}:gofigure:1a2b3c4d` }],
  })

  // A day whose one puzzle needs the word list. The id carries the day's own date, like every
  // other fixture here, because solves are counted off the date prefix of an id.
  const phrazleDay: Pack = {
    complete: true,
    date: '2026-08-17',
    puzzles: [{ ...phrazlePuzzle, id: '2026-08-17:phrazle:9c8b7a65' }],
  }

  interface SetupOptions {
    dictionary?: DictionaryState
    packs?: Pack[]
    solved?: string[]
  }

  const setupShelf = ({
    dictionary = { status: 'absent', words: null },
    packs = [pack],
    solved = [puzzleId, quickPuzzleId],
  }: SetupOptions = {}): void => {
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true, writable: true })
    window.history.replaceState({ __N: true, as: '/', url: '/' }, '', '/')
    mockAsPath = '/'
    packs.forEach((each) => writePack(each.date, each))
    solved.forEach(markSolved)
    render(
      <DictionaryContext.Provider value={dictionary}>
        <Shelf locale="en-GB" now={now} />
      </DictionaryContext.Provider>,
    )
  }

  // The same fallback the pool notice's primary gets, reached from the plate instead. Every day on
  // the device is finished, so no row is a control and the query for one finds nothing -- without
  // the fallback the keyboard would go nowhere at all and stay on the control that was pressed.
  it('lands the keyboard on the month control when no day row can be opened', async () => {
    const user = userEvent.setup({ delay: null })
    setupShelf()

    await user.click(screen.getByRole('button', { name: 'Pick another day' }))

    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveFocus()
  })

  // IT NEVER NAMES A PUZZLE IT CANNOT OPEN. The shelf asks the registry and the dictionary, and
  // hands nextUnsolved the answer -- that function has no business knowing what a word list is.
  it('refuses to recommend a puzzle the word list has not arrived for', () => {
    setupShelf({ packs: [pack, phrazleDay] })

    expect(screen.queryByRole('button', { name: 'Play Phrazle' })).not.toBeInTheDocument()
  })

  // AND IT SAYS NOTHING RATHER THAN SOMETHING FALSE. A null pick means "nothing to recommend", which
  // is not "nothing is left": the Phrazle above is unsolved and sitting in the rows. Reading the one
  // as the other printed "You've solved everything on this device" over a day with open work on it
  // -- and flashed it on every cold open, where the status is 'loading' until the Cache API answers.
  // The pool is now measured off what is solved and never off what is playable.
  it('claims nothing about the pool while an unsolved puzzle cannot be opened', () => {
    setupShelf({ packs: [pack, phrazleDay] })

    expect(
      screen.queryByText('You’ve solved everything on this device. Lull can bring back an earlier day.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument()
  })

  // The other side of that line, and what keeps the sentence available: solve the Phrazle too and
  // everything on the device really is solved, word list or no word list.
  it('says the pool is spent once every puzzle on the device is solved', () => {
    setupShelf({ packs: [pack, phrazleDay], solved: [puzzleId, quickPuzzleId, phrazleDay.puzzles[0].id] })

    expect(
      screen.getByText('You’ve solved everything on this device. Lull can bring back an earlier day.'),
    ).toBeInTheDocument()
  })

  it('recommends it once the word list is in hand', () => {
    setupShelf({ dictionary: { status: 'ready', words: phrazleDictionary }, packs: [pack, phrazleDay] })

    expect(screen.getByRole('button', { name: 'Play Phrazle' })).toBeInTheDocument()
  })

  // A DAY THE PLAYER NAMED reads differently from a day the app chose, and the pick's date is what
  // decides it: they asked for 14 March, it came back, and what is left there is what is offered.
  // The mock writes through the way the real fetchPack does, so the landed pack reaches the shelf
  // by the route it reaches it in the app -- storage, and the event storage announces.
  it('says a day the player asked for is the day the pick came from', async () => {
    const user = userEvent.setup({ delay: null })
    const marchDay = dayOf('2026-03-14', 1)
    mockFetchPack.mockImplementationOnce(async (date) => {
      writePack(date, marchDay)
      return marchDay
    })
    setupShelf()

    await user.click(screen.getByRole('button', { name: 'Bring back an earlier day' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-03')
    await user.click(screen.getByRole('button', { name: /Sat 14 Mar/ }))

    expect(await screen.findByText('From Saturday 14 March. The gentlest one you have left there.')).toBeInTheDocument()
  })

  // The card's own way into the panel. Here there IS a day row to land on, so the keyboard goes to
  // the first one rather than to the month field -- the same press, a different destination,
  // decided by whether anything in the panel can be opened.
  it('opens the panel on the day rows from the card', async () => {
    const user = userEvent.setup({ delay: null })
    setupShelf({ packs: [pack, dayOf('2026-08-17', 1)] })

    await user.click(screen.getByRole('button', { name: 'Pick another' }))

    expect(screen.getByRole('button', { name: /Mon 17 Aug/ })).toHaveFocus()
  })
})
