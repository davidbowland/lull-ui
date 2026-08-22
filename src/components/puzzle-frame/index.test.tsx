import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { PuzzleFrame } from './index'
import { entryFor, REGISTRY, RegistryEntry } from '@registry'
import { fetchPack } from '@services/lull'
import { markSolved, readMeta, readProgress, writePack, writeProgress } from '@services/storage'
import {
  cryptogramPack,
  cryptogramPuzzleId,
  goFigurePuzzle,
  missingVowelsPuzzleId,
  pack,
  packDate,
  phrasePack,
  puzzleId,
  quickPuzzleId,
} from '@test/__mocks__'
import { Pack, PuzzleComponent, PuzzleComponentProps } from '@types'

// jsdom reports navigator.onLine === true, so an unmocked frame fires a real axios request
// against a 35-second timeout for every deep link in this file.
jest.mock('@services/lull')

// Only entryFor, and only its Component. Every other export stays real, so the benches and
// labels asserted below are the ones the product ships -- but the board itself is a recorder,
// because the four-prop contract is a claim about what the frame HANDS a board and asserting
// it through a real board's rendered output would test the board instead. It also keeps this
// suite from breaking every time a bench is rebuilt: the frame's job is the chrome around a
// board, not the board.
jest.mock('@registry', () => ({ ...jest.requireActual('@registry'), entryFor: jest.fn() }))

describe('PuzzleFrame', () => {
  const mockEntryFor = entryFor as jest.Mock
  const mockFetchPack = fetchPack as jest.Mock

  // The two elements every puzzle component renders, marked the way the band order in
  // index.css expects to find them. The buttons stand in for whatever a real board would do
  // to reach the two callbacks it is handed.
  const Board = jest.fn(({ onProgress, onSolved, puzzle }: PuzzleComponentProps) => (
    <>
      <section aria-label="Board" className="lull-board">
        <h2>{puzzle.id}</h2>
        <button onClick={() => onProgress('kept')} type="button">
          Record progress
        </button>
        <button onClick={onSolved} type="button">
          Record a win
        </button>
      </section>
      <div className="lull-instrument" />
    </>
  ))

  const lastProps = (): PuzzleComponentProps => Board.mock.calls[Board.mock.calls.length - 1][0]

  beforeAll(() => {
    mockEntryFor.mockImplementation((type: string) =>
      Object.hasOwn(REGISTRY, type)
        ? { ...(REGISTRY as Record<string, RegistryEntry>)[type], Component: Board as unknown as PuzzleComponent }
        : undefined,
    )
    // Cache-first, exactly as the real one: the shell re-reads storage afterwards rather than
    // trusting the return value, so the mock has to write.
    mockFetchPack.mockImplementation(async (date: string) => {
      writePack(date, pack)
      return pack
    })
  })

  // Every test that touches localStorage clears it first, or one test's pack and progress
  // answer the next test's reads.
  const setup = (): void => {
    window.localStorage.clear()
  }

  // The shared fetch mock writes the goFigure pack over whatever date it is asked for, and the
  // frame re-reads storage after the request -- so a bench that is not the tile bench has to own
  // the fetch too, or its puzzle is gone by the time the frame looks for it.
  const setupPack = (loaded: Pack): void => {
    setup()
    writePack(packDate, loaded)
    mockFetchPack.mockImplementationOnce(async (date: string) => {
      writePack(date, loaded)
      return loaded
    })
  }

  const renderFrame = (id: string | undefined = puzzleId): ReturnType<typeof render> =>
    render(<PuzzleFrame locale="en-US" puzzleId={id} />)

  const breadcrumb = async (): Promise<HTMLElement> => screen.findByRole('navigation', { name: 'Breadcrumb' })

  describe('a puzzle on the device', () => {
    it('names the kind of puzzle', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()

      expect(await screen.findByRole('heading', { level: 1, name: 'Go Figure!' })).toBeInTheDocument()
    })

    it('renders the board for the type the pack names', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()

      expect(await screen.findByRole('region', { name: 'Board' })).toBeInTheDocument()
    })

    // Found by id, never by position: the id is opaque past its date prefix and carries no
    // order, so a pack cannot be indexed into.
    it('finds the puzzle the id names rather than the first in the pack', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame(quickPuzzleId)
      await screen.findByRole('region', { name: 'Board' })

      expect(lastProps().puzzle.id).toEqual(quickPuzzleId)
    })

    it('hands the board the progress it left behind', async () => {
      setup()
      writePack(packDate, pack)
      writeProgress(puzzleId, '6+9')

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(lastProps().progress).toEqual('6+9')
    })

    // The contract, asserted rather than assumed. A board that could reach routing, storage, or
    // the network would make "this app displays, the backend decides" a convention instead of a
    // structure, so the KEY SET is the assertion: a fifth prop fails this test.
    it('hands the board four props and nothing else', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(Object.keys(lastProps()).toSorted()).toEqual(['onProgress', 'onSolved', 'progress', 'puzzle'])
    })
  })

  describe('what the shell keeps', () => {
    it('stores progress as the board reports it', async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      writePack(packDate, pack)

      renderFrame()
      await user.click(await screen.findByRole('button', { name: 'Record progress' }))

      expect(readProgress(puzzleId)).toEqual('kept')
    })

    it('records the puzzle as solved', async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      writePack(packDate, pack)

      renderFrame()
      await user.click(await screen.findByRole('button', { name: 'Record a win' }))

      expect(readMeta().solved).toContain(puzzleId)
    })

    // Solved is one bit, and it outlives the pack it names -- progress is pruned with the pack,
    // so a puzzle solved last week reopens on an empty board. Saying so is the difference
    // between a fresh puzzle and one already finished.
    it('says the puzzle was already solved', async () => {
      setup()
      writePack(packDate, pack)
      markSolved(puzzleId)

      renderFrame()

      expect(await screen.findByText('You solved this one. Play it again if you like.')).toBeInTheDocument()
    })

    // Play again empties the board and stores that, so a solved puzzle can hold progress that is
    // the empty string. Empty is not started: this line is what tells the player the puzzle is
    // already in the bag, and the board below it has nothing to say so.
    it('says the puzzle was already solved when playing again emptied the board', async () => {
      setup()
      writePack(packDate, pack)
      markSolved(puzzleId)
      writeProgress(puzzleId, '')

      renderFrame()

      expect(await screen.findByText('You solved this one. Play it again if you like.')).toBeInTheDocument()
    })

    // Within the retention window a solved puzzle still holds its winning answer, so the board
    // restores it and announces the win itself. Saying it here too would be one screen carrying
    // the same news twice.
    it('leaves a restored win for the board to announce', async () => {
      setup()
      writePack(packDate, pack)
      markSolved(puzzleId)
      writeProgress(puzzleId, '6+9+7*7')

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(screen.queryByText('You solved this one. Play it again if you like.')).not.toBeInTheDocument()
    })

    it('says nothing of the kind about an unsolved puzzle', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(screen.queryByText('You solved this one. Play it again if you like.')).not.toBeInTheDocument()
    })
  })

  describe('the trail', () => {
    it('names Lull, the day, and the bench on a bench', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Lull' })).toHaveAttribute('href', '/')
      expect(within(trail).getByRole('link', { name: 'Tue, Aug 18' })).toHaveAttribute('href', '/')
      expect(within(trail).getByText('Go Figure!')).toHaveAttribute('aria-current', 'page')
    })

    it('puts the trail on the cipher bench too', async () => {
      setupPack(cryptogramPack)

      renderFrame(cryptogramPuzzleId)
      const trail = await breadcrumb()

      expect(within(trail).getByText('Cryptogram')).toHaveAttribute('aria-current', 'page')
    })

    it('puts the trail on the writing bench too', async () => {
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)
      const trail = await breadcrumb()

      expect(within(trail).getByText('Missing Vowels')).toHaveAttribute('aria-current', 'page')
    })

    // The day is formatted for the reader, and which reader that is can only be known on the
    // device. Nothing formatted with it survives the first render: the frame paints the
    // placeholder until an effect has run, which is what keeps the build-time HTML honest.
    it('reads the day in the device locale when none is given', async () => {
      setup()
      writePack(packDate, pack)

      render(<PuzzleFrame puzzleId={puzzleId} />)
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Tue, Aug 18' })).toBeInTheDocument()
    })

    // Not knowing what the puzzle was is the whole reason this is a dead end, so the trail
    // stops at the day. A third crumb here would be the frame inventing the thing it just
    // failed to find.
    it('stops at the day when the puzzle cannot be found', async () => {
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      renderFrame()
      const trail = await breadcrumb()

      expect(within(trail).getByText('Tue, Aug 18')).toHaveAttribute('aria-current', 'page')
    })

    // An id with no date prefix names no day either, so there is nothing true to put after Lull.
    // Lull keeps its href even here, and that is the whole point of the case. An id with no date
    // names no day, so there is nothing true to put after Lull -- but a trail of one href-less
    // crumb renders as an aria-current span, which is not a link, and this surface has no other
    // control. The manifest is display: standalone, so there is no browser back button and no
    // address bar either: a mistyped share link stranded the reader inside the app.
    it('still offers a way home when the id names no day', async () => {
      setup()

      renderFrame('not-a-puzzle-id')
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Lull' })).toHaveAttribute('href', '/')
    })

    // The trail replaced every "Back to today's puzzles" button in the product. Two ways home
    // on one screen is one more than anybody needs, and the button was the one that cost the
    // board a row.
    it('offers no Back button on a bench', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
    })

    it('offers no Back button on a dead end', async () => {
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      renderFrame()
      await screen.findByRole('heading', { name: 'That puzzle isn’t here' })

      expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
    })
  })

  describe('the bands', () => {
    // The title row belongs to every bench, and it carries the two facts the day directory's row
    // already stated -- so a player who chose a puzzle by what it costs finds the same two words at
    // the top of the board rather than a paraphrase of them.
    it('states the difficulty and the length on the title row', async () => {
      setupPack(cryptogramPack)

      renderFrame(cryptogramPuzzleId)

      expect(await screen.findByText('About 4 min')).toBeInTheDocument()
      expect(screen.getByText('Easy')).toBeInTheDocument()
    })

    // Cipher and writing get the docked hint bar; the tile bench spends its 60px on the goal plate
    // and its worked example instead. Read off the bench, so a second type on the same surface
    // inherits the decision rather than repeating it.
    it('gives the cipher bench a hint bar', async () => {
      setupPack(cryptogramPack)

      renderFrame(cryptogramPuzzleId)

      expect(await screen.findByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    it('gives the writing bench a hint bar', async () => {
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)

      expect(await screen.findByText('About 2 min')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // The tile bench keeps the title row -- every bench does -- and loses only the bar it has no
    // hints to fill.
    it('gives the tile bench the title row but no hint bar', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(screen.getByText(/^About \d+ min$/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
    })

    // Hints belong to the shell. Game components never learn they exist, and every future
    // phrase type gets the bar for free.
    it('never tells the board that hints exist', async () => {
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)
      await screen.findByRole('region', { name: 'Board' })

      expect(Object.keys(lastProps())).not.toContain('hints')
    })

    // DOM order is the whole mechanism and the only part of it a test can hold: CLAUDE.md
    // forbids style assertions and jsdom lays nothing out to measure. The board and the
    // instrument come out of one component, so the hint bar can only land between them if the
    // frame renders it after both -- which is exactly what the `order` rules then undo.
    it('renders the hint bar after the component that owns the two bands around it', async () => {
      setupPack(cryptogramPack)

      renderFrame(cryptogramPuzzleId)
      const board = await screen.findByRole('region', { name: 'Board' })
      const bar = screen.getByRole('button', { name: 'Open hint 1 of 3' })

      expect(board.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('a puzzle that is not here', () => {
    it('asks for the pack a deep link names', async () => {
      setup()

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(mockFetchPack).toHaveBeenCalledWith(packDate)
    })

    it('waits before saying anything is missing', () => {
      setup()

      renderFrame()

      expect(screen.getByRole('status')).toHaveTextContent('Looking for this puzzle…')
    })

    it('says so when the pack cannot be reached and nothing is cached', async () => {
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      renderFrame()

      expect(await screen.findByRole('heading', { name: 'That puzzle isn’t here' })).toBeInTheDocument()
    })

    it('says what might have happened to it', async () => {
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      renderFrame()

      expect(
        await screen.findByText('It may have been cleared to make room for newer ones, or the link may be wrong.'),
      ).toBeInTheDocument()
    })

    it('says so when the pack arrives without the puzzle in it', async () => {
      setup()

      renderFrame('2026-08-18:gofigure:deadbeef')

      expect(await screen.findByRole('heading', { name: 'That puzzle isn’t here' })).toBeInTheDocument()
    })

    // The date prefix is the only part of an id a client may read, and an id without one names
    // no pack at all. Asking the network for it would be a request that cannot succeed.
    it('never asks the network for an id that names no day', async () => {
      setup()

      renderFrame('not-a-puzzle-id')
      await screen.findByRole('heading', { name: 'That puzzle isn’t here' })

      expect(mockFetchPack).not.toHaveBeenCalled()
    })

    // storage.ts swallows write failures on purpose, so when localStorage throws -- cookies
    // blocked, a partitioned context, quota exhausted -- writePack no-ops and readPack returns
    // null. Trusting the re-read alone answered a SUCCESSFUL fetch with "That puzzle isn't
    // here" and left the app permanently broken while blaming the link.
    it('plays a pack the network answered even when the device cannot store it', async () => {
      setup()
      mockFetchPack.mockResolvedValueOnce(pack)

      renderFrame()

      expect(await screen.findByRole('heading', { level: 1, name: 'Go Figure!' })).toBeInTheDocument()
    })

    // The request takes real time, and the id can change or the reader can leave inside it. A
    // resolution that still set state would paint a puzzle nobody asked for.
    it('drops a pack that arrives after the reader has moved on', async () => {
      setup()
      let settle: (loaded: Pack) => void = () => undefined
      mockFetchPack.mockImplementationOnce(
        async () =>
          new Promise<Pack>((resolve) => {
            settle = resolve
          }),
      )

      const { unmount } = renderFrame()
      unmount()
      await act(async () => settle(pack))

      expect(Board).not.toHaveBeenCalled()
    })
  })

  describe('a puzzle this build cannot draw', () => {
    // lull-api can ship a generator before the UI that draws it, so a pack off the network can
    // name a type this build has never heard of. Destructuring the missing registry entry would
    // throw during a render with no error boundary above it.
    it('says so rather than white-screening', async () => {
      setup()
      // The real fetchPack answers a COMPLETE stored pack without a request, which here means
      // leaving the cache below exactly as this test wrote it.
      mockFetchPack.mockResolvedValueOnce(undefined)
      writePack(packDate, {
        ...pack,
        puzzles: [{ ...goFigurePuzzle, type: 'crossword' as typeof goFigurePuzzle.type }],
      })

      renderFrame()

      expect(
        await screen.findByText('A newer kind of puzzle. Reload while you’re online to play it.'),
      ).toBeInTheDocument()
    })

    it('names the day it could not draw, and nothing after it', async () => {
      setup()
      mockFetchPack.mockResolvedValueOnce(undefined)
      writePack(packDate, {
        ...pack,
        puzzles: [{ ...goFigurePuzzle, type: 'crossword' as typeof goFigurePuzzle.type }],
      })

      renderFrame()
      const trail = await breadcrumb()

      expect(within(trail).getByText('Tue, Aug 18')).toHaveAttribute('aria-current', 'page')
    })
  })

  describe('before the route is known', () => {
    // The page reads the id out of window.location in an effect, so the first render has
    // nothing. Painting "not here" for that frame would accuse every deep link of being broken.
    it('says nothing at all until the id arrives', () => {
      setup()

      renderFrame(undefined)

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations on a bench', async () => {
      setup()
      writePack(packDate, pack)

      const { container } = renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations on a bench with a hint bar', async () => {
      setupPack(cryptogramPack)

      const { container } = renderFrame(cryptogramPuzzleId)
      await screen.findByRole('button', { name: 'Open hint 1 of 3' })

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations when the puzzle is missing', async () => {
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      const { container } = renderFrame()
      await screen.findByRole('heading', { name: 'That puzzle isn’t here' })

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations on a type this build cannot draw', async () => {
      setup()
      mockFetchPack.mockResolvedValueOnce(undefined)
      writePack(packDate, {
        ...pack,
        puzzles: [{ ...goFigurePuzzle, type: 'crossword' as typeof goFigurePuzzle.type }],
      })

      const { container } = renderFrame()
      await screen.findByRole('heading', { name: 'A newer kind of puzzle. Reload while you’re online to play it.' })

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
