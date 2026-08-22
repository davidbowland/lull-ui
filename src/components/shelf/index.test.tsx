import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { orderPuzzles, Shelf } from './index'
import { REGISTRY } from '@registry'
import { markSolved, STORAGE_EVENT, writePack } from '@services/storage'
import { goFigurePuzzle, incompletePack, pack, puzzleId, quickPuzzleId } from '@test/__mocks__'
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
    // choosing here is visibly choosing between three different rooms.
    it('draws the bench glyph of the puzzle it opens', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[0].querySelector(`path[d="${REGISTRY.gofigure.glyph}"]`)).toBeInTheDocument()
    })

    // Never by colour alone, and never by a tick with no name.
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
    // throw during a render with no error boundary above it.
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
    // usePrefetch gates the whole seven-day window on isInstalled(), so the shelf is
    // where the offer has to live: without it a first-time visitor gets one pack and
    // never sees the offline behaviour the app is built around.
    it('offers to install once the browser says it can', async () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()
      act(() => {
        window.dispatchEvent(new Event('beforeinstallprompt'))
      })

      expect(await screen.findByRole('heading', { name: 'Have tomorrow ready' })).toBeInTheDocument()
    })

    // Chromium withholds beforeinstallprompt from an installed app, and jsdom is
    // neither, so nothing is offered until the browser speaks.
    it('offers nothing while the browser has not spoken', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.queryByRole('heading', { name: 'Have tomorrow ready' })).not.toBeInTheDocument()
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

    it('has no accessibility violations', async () => {
      setup()
      writePack('2026-08-18', pack)

      const { container } = renderShelf()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations with an empty device', async () => {
      setup()

      const { container } = renderShelf()

      expect(await axe(container)).toHaveNoViolations()
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

    it('has no accessibility violations while offline', async () => {
      setup()
      setNavigatorOnLine(false)
      writePack('2026-08-18', pack)

      const { container } = renderShelf()

      expect(await axe(container)).toHaveNoViolations()
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
