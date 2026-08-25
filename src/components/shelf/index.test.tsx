import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { orderPuzzles, Shelf } from './index'
import { DictionaryContext, DictionaryState } from '@components/dictionary-provider'
import { REGISTRY } from '@registry'
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
import { Difficulty, Puzzle } from '@types'

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
  // leak into the next.
  const setup = (): void => {
    window.localStorage.clear()
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
    it('reaches the first puzzle with the keyboard alone', async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      writePack('2026-08-18', pack)

      renderShelf()
      await user.tab()
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
      expect(screen.getByText('Middling · About 4 min')).toBeInTheDocument()
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

    // The same, for a puzzle left half-played. Progress is pruned with the pack it belongs to, so
    // this is the row a player comes back to the same day.
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
