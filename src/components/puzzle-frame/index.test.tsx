import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { PuzzleFrame } from './index'
import { fetchPack } from '@services/lull'
import { markSolved, readMeta, readProgress, writePack, writeProgress } from '@services/storage'
import {
  cryptogramPack,
  cryptogramPuzzleId,
  goFigurePuzzle,
  missingVowelsPuzzleId,
  pack,
  phrasePack,
  puzzleId,
} from '@test/__mocks__'

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

      expect(await screen.findByRole('heading', { level: 1, name: 'Go Figure!' })).toBeInTheDocument()
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
      await user.click(await screen.findByRole('button', { name: /^Use 6/ }))

      expect(readProgress(puzzleId)).toEqual('6')
    })

    it('records the puzzle as solved', async () => {
      const user = userEvent.setup()
      setup()
      writePack('2026-08-18', pack)

      renderFrame()
      await screen.findByRole('heading', { name: 'Make 154' })
      // Tiles carry their position in the accessible name and are aria-disabled rather
      // than disabled, so they stay focusable and a tap does not blur the button it just
      // activated.
      for (const name of [/^Use 6/, 'Add', /^Use 9/, 'Add', /^Use 7/, 'Multiply', /^Use 7/]) {
        await user.click(
          screen
            .getAllByRole('button', { name })
            .filter((button) => button.getAttribute('aria-disabled') !== 'true')[0],
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

    // Play again empties the board and stores that, so a solved puzzle can hold progress
    // that is the empty string. Empty is not started: the banner is what tells the player
    // this one is already in the bag, and the board below it has nothing to say so.
    it('says the puzzle was already solved when playing again emptied the board', async () => {
      setup()
      writePack('2026-08-18', pack)
      markSolved(puzzleId)
      writeProgress(puzzleId, '')

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

  describe('the hint drawer', () => {
    // Hints belong to the shell. Game components never learn they exist, and every future phrase
    // type gets the drawer for free.
    it('renders the drawer under a puzzle that carries hints', async () => {
      setup()
      mockFetchPack.mockImplementationOnce(async (date: string) => {
        writePack(date, phrasePack)
        return phrasePack
      })

      render(<PuzzleFrame puzzleId={missingVowelsPuzzleId} />)

      expect(await screen.findByRole('button', { name: 'Reveal hint 1 of 3' })).toBeInTheDocument()
    })

    // goFigure has no phrase in it, so hintsOf returns null and nothing renders.
    it('renders no drawer under a puzzle that carries none', async () => {
      setup()

      renderFrame()

      expect(await screen.findByRole('heading', { name: 'Make 154' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Reveal hint/ })).not.toBeInTheDocument()
    })

    it('has no axe violations with the drawer present', async () => {
      setup()
      mockFetchPack.mockImplementationOnce(async (date: string) => {
        writePack(date, phrasePack)
        return phrasePack
      })

      const { container } = render(<PuzzleFrame puzzleId={missingVowelsPuzzleId} />)
      await screen.findByRole('button', { name: 'Reveal hint 1 of 3' })

      expect(await axe(container)).toHaveNoViolations()
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

  // A docked keypad covers whatever is under it, and today's Back button sits under the board. The
  // whole point of this layout is that nothing but the phrase gives up vertical space.
  describe('the docked layout', () => {
    // The shared fetch mock writes the goFigure pack over whatever date it is asked for, and the
    // frame re-reads storage after the request -- so a docked case has to own the fetch too or its
    // puzzle is gone by the time the frame looks for it.
    const setupDocked = (): void => {
      setup()
      writePack('2026-08-18', cryptogramPack)
      mockFetchPack.mockImplementationOnce(async (date: string) => {
        writePack(date, cryptogramPack)
        return cryptogramPack
      })
    }

    const renderDocked = (): ReturnType<typeof render> => {
      setupDocked()
      return renderFrame(cryptogramPuzzleId)
    }

    it('puts the back control above the board rather than under it', async () => {
      renderDocked()

      const back = await screen.findByRole('button', { name: 'Back to today’s puzzles' })
      const board = screen.getByRole('region', { name: 'Cryptogram' })

      expect(back.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    // Shortened visible label, whole accessible name. WCAG 2.5.3 needs the accessible name to
    // contain the visible text, and "Back to today's puzzles" contains "Back".
    it('shortens the visible label to fit beside the title', async () => {
      renderDocked()

      expect(await screen.findByRole('button', { name: 'Back to today’s puzzles' })).toHaveTextContent('Back')
    })

    it('offers exactly one back control', async () => {
      renderDocked()

      await screen.findByRole('region', { name: 'Cryptogram' })

      expect(screen.getAllByRole('button', { name: 'Back to today’s puzzles' })).toHaveLength(1)
    })

    it('still names the kind of puzzle', async () => {
      renderDocked()

      expect(await screen.findByRole('heading', { level: 1, name: 'Cryptogram' })).toBeInTheDocument()
    })

    // The drawer is rendered by PuzzleView and is reached through entry.layout, so it must survive
    // the branch. A board that lost its hints to a layout change is a regression nothing else here
    // would catch.
    it('still renders the hint drawer', async () => {
      renderDocked()

      expect(await screen.findByRole('button', { name: 'Reveal hint 1 of 3' })).toBeInTheDocument()
    })

    // The compact drawer, threaded from entry.layout. The heading plus its gap is 40px, and the
    // docked column is budgeting a 98px phrase cap at a 320 viewport against a 96px hard floor --
    // so a word the button underneath already says is not worth the room.
    it('gives the docked layout a drawer with no heading of its own', async () => {
      renderDocked()

      await screen.findByRole('button', { name: 'Reveal hint 1 of 3' })

      expect(screen.getByRole('region', { name: 'Hints' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Hints' })).not.toBeInTheDocument()
    })

    // Spec decision 7, verbatim: the keypad never moves -- "not when a hint opens". The keypad is
    // the board's last child and the board fills what is left of the column, so a drawer BELOW the
    // board pushes the keypad up by however much the revealed list grows. Above the board, the
    // phrase box absorbs it instead and the keypad's bottom edge is genuinely pinned. DOM order is
    // the whole mechanism, and it is the only part of it a test can hold: CLAUDE.md forbids style
    // assertions, and jsdom lays nothing out to measure.
    it('puts the hint drawer above the board so the keypad cannot be pushed', async () => {
      renderDocked()

      const drawer = await screen.findByRole('region', { name: 'Hints' })
      const board = screen.getByRole('region', { name: 'Cryptogram' })

      expect(drawer.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    // The banner PuzzleView renders on the default flow would cost a row the phrase cap cannot
    // spare -- 98px at a 320 viewport -- so the header row says it in space it already occupies.
    it('notes a prior solve in the header row instead of a banner', async () => {
      setupDocked()
      markSolved(cryptogramPuzzleId)

      renderFrame(cryptogramPuzzleId)

      expect(await screen.findByText('Solved earlier')).toBeInTheDocument()
      expect(screen.queryByText('You solved this one. Play it again if you like.')).not.toBeInTheDocument()
    })

    it('says nothing about a prior solve on a puzzle that was never solved', async () => {
      renderDocked()

      await screen.findByRole('region', { name: 'Cryptogram' })

      expect(screen.queryByText('Solved earlier')).not.toBeInTheDocument()
    })

    it('has no axe violations', async () => {
      const { container } = renderDocked()

      await screen.findByRole('region', { name: 'Cryptogram' })

      expect(await axe(container)).toHaveNoViolations()
    })
  })

  // The other two types must be provably untouched: the layout is opt-in, and every existing test
  // in this file passing UNCHANGED is most of that proof. This is the rest of it.
  describe('the default flow', () => {
    // The mirror of the docked case. Nothing is pinned here, so the drawer stays where it has
    // always been -- under the board, after the thing it is a hint about.
    it('keeps the hint drawer below the board for a type that did not opt in', async () => {
      setup()
      mockFetchPack.mockImplementationOnce(async (date: string) => {
        writePack(date, phrasePack)
        return phrasePack
      })

      renderFrame(missingVowelsPuzzleId)

      const board = await screen.findByRole('region', { name: 'Missing Vowels' })
      const drawer = screen.getByRole('region', { name: 'Hints' })

      expect(board.compareDocumentPosition(drawer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('keeps the drawer’s heading for a type that did not opt in', async () => {
      setup()
      mockFetchPack.mockImplementationOnce(async (date: string) => {
        writePack(date, phrasePack)
        return phrasePack
      })

      renderFrame(missingVowelsPuzzleId)

      expect(await screen.findByRole('heading', { name: 'Hints' })).toBeInTheDocument()
    })

    it('keeps the back control below the board for a type that did not opt in', async () => {
      setup()
      writePack('2026-08-18', pack)

      renderFrame()

      const heading = await screen.findByRole('heading', { name: 'Make 154' })
      const back = screen.getByRole('button', { name: 'Back to today’s puzzles' })

      expect(heading.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
