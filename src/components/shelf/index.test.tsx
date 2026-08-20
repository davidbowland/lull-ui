import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { Shelf } from './index'
import { markSolved, STORAGE_EVENT, writePack } from '@services/storage'
import { goFigurePuzzle, incompletePack, pack, puzzleId } from '@test/__mocks__'

const mockPush = jest.fn()
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush }) }))

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

  const rows = (): HTMLElement[] => within(screen.getByRole('list')).getAllByRole('button')

  describe('the day', () => {
    it('names the day the puzzles belong to', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(screen.getByRole('heading', { name: 'Tuesday, August 18' })).toBeInTheDocument()
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

  describe('the puzzles', () => {
    // The fixture pack lists the long puzzle first, so a passthrough would fail here.
    it('puts the quickest puzzle first', () => {
      setup()
      writePack('2026-08-18', pack)

      renderShelf()

      expect(rows()[0]).toHaveTextContent('About 1 min')
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

    // Never by colour alone, and never by a tick with no name.
    it('marks a solved puzzle in words', () => {
      setup()
      writePack('2026-08-18', pack)
      markSolved(puzzleId)

      renderShelf()

      expect(within(rows()[1]).getByText('Solved')).toBeInTheDocument()
    })

    it('leaves an unsolved puzzle unmarked', () => {
      setup()
      writePack('2026-08-18', pack)
      markSolved(puzzleId)

      renderShelf()

      expect(within(rows()[0]).queryByText('Solved')).not.toBeInTheDocument()
    })

    it('opens a puzzle by its id', async () => {
      const user = userEvent.setup()
      setup()
      writePack('2026-08-18', pack)

      renderShelf()
      await user.click(rows()[1])

      expect(mockPush).toHaveBeenCalledWith(`/p/${encodeURIComponent(puzzleId)}`)
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

    it('removes the exact listeners it added on unmount', () => {
      setup()
      const addEventListener = jest.spyOn(window, 'addEventListener')
      const removeEventListener = jest.spyOn(window, 'removeEventListener')
      const storageCalls = (calls: unknown[][]): unknown[][] => calls.filter(([type]) => type === STORAGE_EVENT)

      renderShelf().unmount()

      expect(storageCalls(addEventListener.mock.calls)).toHaveLength(1)
      expect(storageCalls(removeEventListener.mock.calls)).toEqual(storageCalls(addEventListener.mock.calls))
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
    it('reaches the first puzzle with the keyboard alone', async () => {
      const user = userEvent.setup()
      setup()
      writePack('2026-08-18', pack)

      renderShelf()
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
      window.localStorage.clear()
      writePack('2026-08-18', fullPack as never)

      render(<Shelf now={() => Date.parse('2026-08-18T12:00:00.000Z')} />)

      const names = (await screen.findAllByRole('button')).map((button) => button.textContent ?? '')
      const rows = names.filter((name) => name.includes('Go Figure!'))
      expect(rows).toHaveLength(5)
      expect(new Set(rows).size).toEqual(rows.length)
    })
  })
})
