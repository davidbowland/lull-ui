import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { PuzzleFrame } from './index'
import { fetchPack } from '@services/lull'
import { markSolved, readMeta, readProgress, writePack, writeProgress } from '@services/storage'
import { goFigurePuzzle, pack, puzzleId } from '@test/__mocks__'

// jsdom reports navigator.onLine === true, so an unmocked frame fires a real axios
// request against a 35-second timeout for every deep link in this file.
jest.mock('@services/lull')

const mockPush = jest.fn()
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush }) }))

describe('PuzzleFrame', () => {
  const mockFetchPack = fetchPack as jest.Mock

  beforeAll(() => {
    // Cache-first, exactly as the real one: the shell re-reads storage afterwards
    // rather than trusting the return value, so the mock has to write.
    mockFetchPack.mockImplementation(async (date: string) => {
      writePack(date, pack)
      return pack
    })
  })

  // Every test that touches localStorage clears it first, or one test's pack and
  // progress answer the next test's reads.
  const setup = (): void => {
    window.localStorage.clear()
  }

  const renderFrame = (id: string | undefined = puzzleId): ReturnType<typeof render> =>
    render(<PuzzleFrame puzzleId={id} />)

  describe('a puzzle on the device', () => {
    it('names the kind of puzzle', async () => {
      setup()
      writePack('2026-08-18', pack)

      renderFrame()

      expect(await screen.findByRole('heading', { level: 1, name: 'goFigure' })).toBeInTheDocument()
    })

    it('renders the board for the type the pack names', async () => {
      setup()
      writePack('2026-08-18', pack)

      renderFrame()

      expect(await screen.findByRole('heading', { name: 'Make 154' })).toBeInTheDocument()
    })

    // Found by id, never by position: the id is opaque past its date prefix and carries
    // no order, so a pack cannot be indexed into.
    it('finds the puzzle the id names rather than the first in the pack', async () => {
      setup()
      writePack('2026-08-18', pack)

      renderFrame('2026-08-18:gofigure:1a2b3c4d')

      expect(await screen.findByRole('heading', { name: 'Make 10' })).toBeInTheDocument()
    })

    it('hands the board the progress it left behind', async () => {
      setup()
      writePack('2026-08-18', pack)
      writeProgress(puzzleId, '6+9')

      renderFrame()

      expect(await screen.findByRole('status', { name: 'Your expression' })).toHaveTextContent('6+9')
    })
  })

  describe('what the shell keeps', () => {
    it('stores progress as the board reports it', async () => {
      const user = userEvent.setup()
      setup()
      writePack('2026-08-18', pack)

      renderFrame()
      await user.click(await screen.findByRole('button', { name: 'Use 6' }))

      expect(readProgress(puzzleId)).toEqual('6')
    })

    it('records the puzzle as solved', async () => {
      const user = userEvent.setup()
      setup()
      writePack('2026-08-18', pack)

      renderFrame()
      await screen.findByRole('heading', { name: 'Make 154' })
      for (const name of ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Multiply', 'Use 7']) {
        await user.click(
          screen.getAllByRole('button', { name }).filter((button) => !button.hasAttribute('disabled'))[0],
        )
      }

      expect(readMeta().solved).toContain(puzzleId)
    })

    // Solved is one bit, and it outlives the pack it names -- progress is pruned with
    // the pack, so a puzzle solved last week reopens on an empty board. Saying so is
    // the difference between a fresh puzzle and one already finished.
    it('says the puzzle was already solved', async () => {
      setup()
      writePack('2026-08-18', pack)
      markSolved(puzzleId)

      renderFrame()

      expect(await screen.findByText('You solved this one. Play it again if you like.')).toBeInTheDocument()
    })

    it('says nothing of the kind about an unsolved puzzle', async () => {
      setup()
      writePack('2026-08-18', pack)

      renderFrame()
      await screen.findByRole('heading', { name: 'Make 154' })

      expect(screen.queryByText('You solved this one. Play it again if you like.')).not.toBeInTheDocument()
    })
  })

  describe('a puzzle that is not here', () => {
    it('asks for the pack a deep link names', async () => {
      setup()

      renderFrame()
      await screen.findByRole('heading', { name: 'Make 154' })

      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-18')
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

    // The date prefix is the only part of an id a client may read, and an id without one
    // names no pack at all. Asking the network for it would be a request that cannot
    // succeed.
    it('never asks the network for an id that names no day', async () => {
      setup()

      renderFrame('not-a-puzzle-id')
      await screen.findByRole('heading', { name: 'That puzzle isn’t here' })

      expect(mockFetchPack).not.toHaveBeenCalled()
    })

    it('offers the way back', async () => {
      const user = userEvent.setup()
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      renderFrame()
      await user.click(await screen.findByRole('button', { name: 'Back to today’s puzzles' }))

      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  describe('a puzzle this build cannot draw', () => {
    // lull-api can ship a generator before the UI that draws it, so a pack off the
    // network can name a type this build has never heard of. Destructuring the missing
    // registry entry would throw during a render with no error boundary above it.
    it('says so rather than white-screening', async () => {
      setup()
      // The real fetchPack answers a COMPLETE stored pack without a request, which here
      // means leaving the cache below exactly as this test wrote it.
      mockFetchPack.mockResolvedValueOnce(undefined)
      writePack('2026-08-18', {
        ...pack,
        puzzles: [{ ...goFigurePuzzle, type: 'crossword' as typeof goFigurePuzzle.type }],
      })

      renderFrame()

      expect(
        await screen.findByText('A newer kind of puzzle. Reload while you’re online to play it.'),
      ).toBeInTheDocument()
    })
  })

  describe('before the route is known', () => {
    // The page reads the id out of window.location in an effect, so the first render
    // has nothing. Painting "not here" for that frame would accuse every deep link of
    // being broken.
    it('says nothing at all until the id arrives', () => {
      setup()

      renderFrame(undefined)

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations', async () => {
      setup()
      writePack('2026-08-18', pack)

      const { container } = renderFrame()
      await screen.findByRole('heading', { name: 'Make 154' })

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations when the puzzle is missing', async () => {
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      const { container } = renderFrame()
      await screen.findByRole('heading', { name: 'That puzzle isn’t here' })

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
