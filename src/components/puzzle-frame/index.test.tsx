import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { PuzzleFrame } from './index'
import { DictionaryContext, DictionaryState } from '@components/dictionary-provider'
import { entryFor, HintAdapter, REGISTRY, RegistryEntry, UNKNOWN_TYPE_MESSAGE } from '@registry'
import { fetchPack } from '@services/lull'
import { markSolved, readMeta, readProgress, writePack, writeProgress } from '@services/storage'
import {
  crypticCluePack,
  crypticCluePuzzleId,
  cryptogramPack,
  cryptogramPuzzleId,
  cryptogramStalePackLadder,
  goFigurePuzzle,
  missingVowelsPuzzleId,
  pack,
  packDate,
  phrasePack,
  phrazleDictionary,
  phrazlePack,
  phrazlePuzzle,
  phrazlePuzzleId,
  phrazleStalePackLadder,
  puzzleId,
  quickPuzzleId,
  stalePackCryptogramPack,
  stalePackPhrazlePack,
  stalePackThemedAnagramsPack,
  themedAnagramsPack,
  themedAnagramsPuzzleId,
  themedAnagramsStalePackLadder,
} from '@test/__mocks__'
import { HintLadder, Pack, PuzzleComponent, PuzzleComponentProps } from '@types'

// jsdom reports navigator.onLine === true, so an unmocked frame fires a real axios request
// against a 35-second timeout for every deep link in this file.
jest.mock('@services/lull')

// Only entryFor, and only its Component. Every other export stays real, so the benches and
// labels asserted below are the ones the product ships -- but the board itself is a recorder,
// because the six-prop contract is a claim about what the frame HANDS a board and asserting
// it through a real board's rendered output would test the board instead. It also keeps this
// suite from breaking every time a bench is rebuilt: the frame's job is the chrome around a
// board, not the board.
jest.mock('@registry', () => ({ ...jest.requireActual('@registry'), entryFor: jest.fn() }))

describe('PuzzleFrame', () => {
  const mockEntryFor = entryFor as jest.Mock
  const mockFetchPack = fetchPack as jest.Mock

  // The two elements every puzzle component renders, marked the way the band order in
  // index.css expects to find them. The buttons stand in for whatever a real board would do
  // to reach the three callbacks it is handed.
  const Board = jest.fn(({ onProgress, onReset, onSolved, puzzle }: PuzzleComponentProps) => (
    <>
      <section aria-label="Board" className="lull-board">
        <h2>{puzzle.id}</h2>
        <button onClick={() => onProgress('kept')} type="button">
          Record progress
        </button>
        {/* The OTHER half of a real board's Play again, and it is a second button rather than part
            of Start over below so the two can be driven independently. Every board spells "there is
            nothing on this board" as `onProgress('')` -- goFigure, cryptogram's cleared mapping,
            Phrazle's Again -- and for an adapter type that empty string is also what takes the
            ladder with it, so it has to be reachable on its own. */}
        <button onClick={() => onProgress('')} type="button">
          Clear progress
        </button>
        <button onClick={onSolved} type="button">
          Record a win
        </button>
        {/* Stands in for whatever a real board calls Play again. It is pressed with `?.()` because
            the prop is optional on the type, and a recorder that assumed otherwise would be
            asserting a contract the shell does not make. */}
        <button onClick={() => onReset?.()} type="button">
          Start over
        </button>
      </section>
      <div className="lull-instrument" />
    </>
  ))

  const lastProps = (): PuzzleComponentProps => Board.mock.calls[Board.mock.calls.length - 1][0]

  // The adapter the mocked registry hands back, and it is a mutable binding rather than a
  // `mockImplementationOnce` because `entryFor` is called on EVERY render of the frame -- a "once"
  // would be spent on the first paint and the rest of the mount would see the shipped entry.
  //
  // `setup()` puts it back to undefined, which is the shipped state of all six entries today. Every
  // test in this file calls `setup()` or `setupPack()`, so no test can inherit a previous test's
  // adapter, and a test that means to use one says so on its own line.
  let stubbedAdapter: HintAdapter | undefined

  beforeAll(() => {
    mockEntryFor.mockImplementation((type: string) =>
      Object.hasOwn(REGISTRY, type)
        ? {
            ...(REGISTRY as Record<string, RegistryEntry>)[type],
            Component: Board as unknown as PuzzleComponent,
            // Written unconditionally, `undefined` and all: `hints?: HintAdapter` reads the same
            // absent either way, and a spread that appears only sometimes is a second statement of
            // which mode the entry is in.
            hints: stubbedAdapter,
          }
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
  // answer the next test's reads. The adapter goes with them for the same reason.
  const setup = (): void => {
    window.localStorage.clear()
    stubbedAdapter = undefined
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

  // The clock is INJECTED for every render in this file, and it reads noon on the day the mock
  // pack names. The trail is what reads it -- the crumb spells a year for a day outside the
  // reader's current year, and the day crumb's href is `/` for today and `/?d=<date>` for any
  // other day -- so a bare `Date.now` here would make two assertions in this file answer to the
  // wall clock and start failing on a date certain with no commit in between.
  const noonOnPackDate = (): number => Date.UTC(2026, 7, 18, 12)

  const renderFrame = (id: string | undefined = puzzleId): ReturnType<typeof render> =>
    render(<PuzzleFrame locale="en-US" now={noonOnPackDate} puzzleId={id} />)

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
    // structure, so the KEY SET is the assertion: a seventh prop fails this test.
    //
    // `dictionary` is the sixth and it is a FACT rather than a CAPABILITY -- a frozen set of strings
    // and no callable, carrying no URL, no version, no status and no way to ask for more. Every
    // board is handed it, including the four that read nothing off it, because that keeps the wiring
    // to ONE mount site a grep can find.
    it('hands the board six props and nothing else', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()
      await screen.findByRole('region', { name: 'Board' })

      expect(Object.keys(lastProps()).toSorted()).toEqual([
        'dictionary',
        'onProgress',
        'onReset',
        'onSolved',
        'progress',
        'puzzle',
      ])
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

    // Solved is one bit, and it outlives the pack it names. This is the case where the win was
    // recorded and no board was ever stored, so the frame has nothing to restore -- saying so is
    // the difference between a fresh puzzle and one already finished. Progress used to reach this
    // state by being pruned with the pack; it is not pruned at all now, which leaves the arrange
    // block below -- markSolved with no writeProgress -- as the honest way to reach it.
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

    // THE DAY CRUMB NAMES A DAY; `/` NAMES TODAY. They were the same address for as long as today
    // was the only day a player could reach, and the crumb was written to say so. The moment `/?d=`
    // shipped they parted company, and the way back out of an August 18th puzzle silently became a
    // way back to today -- on every bench, every time, with the crumb still reading "Tue, Aug 18".
    it('points the day crumb at the day it names rather than at today', async () => {
      setup()
      writePack(packDate, pack)

      render(<PuzzleFrame locale="en-US" now={() => Date.UTC(2026, 7, 25, 12)} puzzleId={puzzleId} />)
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Tue, Aug 18' })).toHaveAttribute('href', '/?d=2026-08-18')
    })

    // The other half, and the reason the href is not `/?d=${date}` unconditionally: the shelf's own
    // selectDay pushes `/` for today and `/?d=` for anything else, so a crumb that spelled the
    // parameter for today would hand back an address the shelf immediately rewrites -- one entry in
    // the history stack that Back has to be pressed through twice.
    it('points the day crumb at today’s shelf when the day is today', async () => {
      setup()
      writePack(packDate, pack)

      renderFrame()
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Tue, Aug 18' })).toHaveAttribute('href', '/')
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

    // ONE DAY, ONE SPELLING, ACROSS TWO SURFACES OF ONE TRAIL. This file kept a private copy of the
    // crumb cut that took no clock, while @utils/date-labels' crumbLabel adds a year for a day
    // outside the reader's current year -- so from 2027-01-01 the shelf's crumb read "Sat, 14 Mar
    // 2026" and the puzzle's read "Sat, 14 Mar", with no deploy in between to cause it. The year is
    // the one observable difference between the two cuts, which makes this the only assertion that
    // can catch the copy coming back.
    it('gives the day its year in the trail once the year has turned', async () => {
      setup()
      writePack(packDate, pack)

      render(<PuzzleFrame locale="en-US" now={() => Date.UTC(2027, 0, 4, 12)} puzzleId={puzzleId} />)
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Tue, Aug 18, 2026' })).toHaveAttribute('href', '/?d=2026-08-18')
    })

    // The day is formatted for the reader, and which reader that is can only be known on the
    // device. Nothing formatted with it survives the first render: the frame paints the
    // placeholder until an effect has run, which is what keeps the build-time HTML honest.
    it('reads the day in the device locale when none is given', async () => {
      setup()
      writePack(packDate, pack)

      render(<PuzzleFrame now={noonOnPackDate} puzzleId={puzzleId} />)
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

    // The other half of the case below, and a different render path: here the day IS known, so the
    // trail has two crumbs rather than one. The first of them is still the only way off a surface
    // that has no board, no Back button and -- under display: standalone -- no address bar either,
    // so the link is asserted in this state as well as in the one where the id names no day.
    it('still offers a way home when the puzzle cannot be found', async () => {
      setup()
      mockFetchPack.mockRejectedValueOnce(new Error('offline'))

      renderFrame()
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Lull' })).toHaveAttribute('href', '/')
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
    //
    // THE SHIPPED ADAPTER IS NAMED, because `entryFor` is mocked here and writes `hints:
    // stubbedAdapter` over whatever the registry holds -- so leaving it unset would take a real
    // entry's adapter away and test a configuration that no longer exists. This type's ladder comes
    // off the device now and its pack ships no `hints` at all, so an unset adapter means no bar and
    // the row would be asserting the wrong absence.
    it('gives the cipher bench a hint bar', async () => {
      setupPack(cryptogramPack)
      stubbedAdapter = REGISTRY.cryptogram.hints

      renderFrame(cryptogramPuzzleId)

      expect(await screen.findByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    it('gives the writing bench a hint bar', async () => {
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)

      expect(await screen.findByText('About 2 min')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // THE SECOND TYPE ON THE WRITING BENCH, and this is the assertion that `hasHintBar` was written
    // off the BENCH rather than off the type. Its own comment says it is written that way "so a
    // second type that plays on the same surface inherits the decision instead of repeating it" --
    // this is that second type, and it gets the docked bar with no shell edit at all.
    it('gives the second writing-bench type the same hint bar', async () => {
      setupPack(crypticCluePack)

      renderFrame(crypticCluePuzzleId)

      expect(await screen.findByRole('heading', { level: 1, name: 'Cryptic Clue' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // `answerOf` requires data.answer to be a non-empty string and composes the sentence itself, so
    // a type that ships one closes its ladder for free. Tested rather than argued.
    it('closes the cryptic ladder with the answer the pack shipped', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(crypticCluePack)
      renderFrame(crypticCluePuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))

      await user.click(screen.getByRole('button', { name: 'Show answer' }))

      expect(screen.getByText('The answer is TANGO.')).toBeInTheDocument()
    })

    // THE THIRD TYPE ON THE WRITING BENCH, and it needs no shell edit either: `hasHintBar` is
    // `entry.bench !== 'tile'`, so this type inherits the docked bar the way Cryptic Clue did.
    it('gives the third writing-bench type the same hint bar', async () => {
      setupPack(themedAnagramsPack)
      stubbedAdapter = REGISTRY.themedanagrams.hints

      renderFrame(themedAnagramsPuzzleId)

      expect(await screen.findByRole('heading', { level: 1, name: 'Themed Anagrams' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // THE LADDER CLOSING ON THE ONE BENCH WHERE FOUR ANSWERS HAVE TO BE NAMED, end to end through
    // the real `answerOf`: the frame evaluates `answerOf(puzzle) ?? undefined` for every puzzle it
    // opens, hands the bar the sentence, and the bar renders what it is handed verbatim. Nothing in
    // the frame changes for this type, which is the thing this test actually proves -- it renders
    // the shipped frame over the fixture pack rather than asserting that no edit was needed.
    //
    // The board itself is the recorder this suite mocks in, so what is on screen here is the bar's
    // output and not the board's.
    it('closes the themed anagrams ladder with all four answers', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(themedAnagramsPack)
      stubbedAdapter = REGISTRY.themedanagrams.hints
      renderFrame(themedAnagramsPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))

      await user.click(screen.getByRole('button', { name: 'Show answer' }))

      expect(screen.getByText('The answers are KETTLE, SAUCEPAN, SKILLET, and SPATULA.')).toBeInTheDocument()
    })

    // The shell hands the bar the answer as well as the ladder, so a player who spends all three
    // rungs and still cannot see it has somewhere left to go. The bar composes nothing -- the
    // sentence is `answerOf`'s -- so this is the wire-up, asserted through the one thing that can
    // observe it: the control the bar only offers when it has been given a solution.
    it('gives the bar the answer to offer once the ladder is spent', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(phrasePack)
      renderFrame(missingVowelsPuzzleId)

      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))

      expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument()
    })

    it('shows the answer the pack shipped', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(phrasePack)
      renderFrame(missingVowelsPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))

      await user.click(screen.getByRole('button', { name: 'Show answer' }))

      expect(screen.getByText('The answer is The Empire Strikes Back.')).toBeInTheDocument()
    })

    // The tile bench keeps the title row -- every bench does -- and the SHELL draws no bar above it.
    //
    // The comment here used to say the bench "loses only the bar it has no hints to fill", which is
    // now false in both halves: goFigure has a ladder, and it renders its own control down in the
    // tray, where a rung places a sign on the board instead of only describing one. What this test
    // can honestly hold is the shell's half of that arrangement -- puzzle-frame reads the bench and
    // declines to draw a bar for this one -- and nothing about the board's own control, because
    // `@registry` is mocked in this suite and the real board never renders. Asserting the absence of
    // every /hint/i control would therefore pass here for a reason that has nothing to do with the
    // decision under test. The board's control has its own suite; this one owns the shell.
    it('draws no hint bar of its own above the tile bench', async () => {
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
      stubbedAdapter = REGISTRY.cryptogram.hints

      renderFrame(cryptogramPuzzleId)
      const board = await screen.findByRole('region', { name: 'Board' })
      const bar = screen.getByRole('button', { name: 'Open hint 1 of 3' })

      expect(board.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    // A board that starts a puzzle over cannot clear the ladder itself -- `lull:hints:<puzzleId>`
    // is storage, and a board gets none. So it says so, and the shell is the one that deletes.
    //
    // The assertion is on the KEY, not on the count read back through it, because `readHints`
    // answers 0 for three different states and only one of them is right. `writeHints(id, 0)`
    // leaves an orphan key behind that nothing now collects -- this reset is the only thing in the
    // app that removes a hint key at all -- and a `localStorage.clear()` would take the pack and
    // the progress with it and still read 0 here.
    // Only "the key is gone" distinguishes the deletion this test is named after from the two
    // implementations that merely look like it.
    //
    // `HINTS_PREFIX` is private to storage.ts and the string is written out here on purpose: a test
    // that built the key from the same constant the code builds it from would pass whatever that
    // constant became, which is the one thing a storage-key test is for.
    it('forgets the hints the player opened when the board starts over', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Start over' }))

      expect(window.localStorage.getItem(`lull:hints:${missingVowelsPuzzleId}`)).toBeNull()
    })

    // The one that catches the real bug, and it is a different assertion from the line above rather
    // than a restatement of it. HintBar reads its count once in a state initializer and subscribes
    // to nothing -- not even STORAGE_EVENT -- so deleting the key leaves the MOUNTED bar still
    // drawing its spent rungs, still offering "Open hint 2 of 3", and still writing the old count
    // back on the next press. The stored zero above would be true and the screen would be wrong.
    it('puts the visible hint control back to its first rung when the board starts over', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Start over' }))

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // The bug that ended the remount, and the only test in this file that can see it. A changed
    // `key` is React's instruction to throw a subtree away and build a new one, and React ships no
    // focus handling with that instruction -- so the focused element simply stopped existing and
    // the browser fell back to <body>, from which the next Tab restarts at the top of the page
    // (WCAG 2.4.3). HintBar has documented that exact failure since it was written, which is why
    // its own `close` moves focus BEFORE it hides anything.
    //
    // It is driven with `fireEvent` rather than `user.click`, and that is the whole reason the
    // remount survived review. A real click focuses the button it hits in Chrome, so the click on
    // Start over moved focus off the hint control before the reset ran and there was nothing left
    // to lose -- and jsdom emulates Chrome. Safari on macOS and iOS and Firefox on macOS do NOT
    // focus a <button> on click, so on those browsers a player who reached the hint control with
    // the keyboard still held it when the pointer press landed. `fireEvent.click` is what
    // reproduces them here: it dispatches the click and moves no focus.
    it('leaves focus on the hint control when the board starts over', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)
      const control = await screen.findByRole('button', { name: 'Open hint 1 of 3' })
      control.focus()
      await user.keyboard('{Enter}')
      fireEvent.click(screen.getByRole('button', { name: 'Start over' }))

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
    })

    // The count, not a flag, and this is the test that tells the two apart. A boolean flipped on
    // reset would read `true` after the first Play again and `true` again after the second, so the
    // second reset would hand the bar a prop it already holds, no effect would run, and the ladder
    // would stay where the player had just left it. The frame comments argue that at length; this
    // is the argument with a test behind it.
    it('puts the ladder back on the second reset as well as the first', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Start over' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Start over' }))

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // The reset is a reset, not a reload. A bar that came back reading zero because it had
    // re-read an emptied key would pass the test above and still lose a returning player's rungs
    // the moment anything else remounted it, so the count that survives an untouched board is
    // asserted on its own.
    it('keeps the hints the player opened when the board never starts over', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(phrasePack)

      renderFrame(missingVowelsPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Record progress' }))

      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
    })
  })

  // THE SEAM, AND ONLY THE SEAM. Three types compute their rungs at play time from the board the
  // player has built, because a rung that cannot see the board cannot know what is still worth
  // saying -- "every Q is an E" is worth nothing to a player who already has Q. Every test below
  // drives a STUB registered against a real type, and it goes on doing so now that one of the three
  // ships for real: an adapter's own suite is where its grammar is proved.
  //
  // A stub is the right instrument here rather than a shortcut around a missing one. What this
  // describe is for is the claim that the frame reads NO grammar: it asks the registry for an
  // adapter, hands it the puzzle and the progress string, and renders whatever comes back. A test
  // that used cryptogram's real codec would prove that cryptogram's codec works and say nothing
  // about the seam.
  describe('a bench whose type carries a hint adapter', () => {
    // The cheapest grammar that can carry BOTH halves of a progress string: whatever the board
    // wrote, then one '#' per step bought. It has to carry both, because the field the shell writes
    // and the field the board writes living in one string is the whole thing `merge` is about -- a
    // stub whose progress was only a count could not tell a merge that worked from one that threw
    // the board's portion away.
    //
    // No board writes anything like this, which is the point.
    const openedOf = (progress: string): number => progress.replace(/[^#]/g, '').length

    // `open` sells one step PAST the last rung, because that step is the answer -- see HintBar's
    // `controlLabel`, where `opened > hints.length` is the reveal. goFigure's controlled owner does
    // the same thing, and an adapter that stopped at its own last rung would take the reveal away
    // from the three benches that use this seam.
    //
    // `merge` EXTENDS EVERY BOARD WRITE, '' INCLUDED, which is what all three shipped adapters do.
    // '' is not a reset: four boards write it when their last box, square or draft is emptied, and an
    // adapter that read it as one would charge a player their rungs for a backspace. The reset is
    // `onReset`, and answering it is the SHELL's job -- see the pair of rows below, which are the two
    // presses this stub exists to keep apart.
    const stubAdapter = (rungs: string[]): HintAdapter => ({
      ladder: () => rungs.map((text) => ({ text })) as HintLadder,
      merge: (boardWrite, current) => `${boardWrite}${'#'.repeat(openedOf(current))}`,
      open: (_puzzle, progress) => (openedOf(progress) > rungs.length ? null : `${progress}#`),
      opened: openedOf,
    })

    const THREE_RUNGS = ['From the adapter, first.', 'From the adapter, second.', 'From the adapter, third.']

    // A FIXTURE THAT STILL SHIPS A PACK LADDER, and that is what makes the first test an assertion
    // rather than a tautology. Both ladders are live; only the branch decides which one is drawn.
    //
    // It has to be the STALE-PACK fixture now. `cryptogramPuzzle` models the post-transition wire and
    // carries no `hints` at all, so this row against it would leave nothing for the adapter to win
    // over: `queryByText(PACK_RUNG)` finds nothing however the branch is wired, and a frame that had
    // lost the adapter branch entirely would still pass its negative half.
    const PACK_RUNG = 'A saying about a meal'

    it('draws the rungs the adapter reports rather than the ones the pack shipped', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(stalePackCryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))

      expect(screen.getByText('From the adapter, first.')).toBeInTheDocument()
      expect(screen.queryByText(PACK_RUNG)).not.toBeInTheDocument()
    })

    // The purchase, and it goes through the callback the board is handed rather than through a
    // second writer of its own. `onProgress` is the shell's one path to the progress key, so an
    // adapter that sold a rung any other way would be a second store to keep in step.
    it('writes the progress string the adapter returns when a rung is bought', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))

      expect(readProgress(cryptogramPuzzleId)).toEqual('#')
    })

    // THE ONE-WRITER RULE, AND THE REGRESSION TEST FOR THE BUG THAT PUT `merge` ON THE INTERFACE.
    //
    // Every board reads `progress` once, in a lazy initializer, and owns its state from then on. So
    // the write below is composed from a board that has never heard of the '#' the adapter just
    // stored -- and stored verbatim it would erase a rung the player paid for, silently, with no
    // board at fault for it. The frame routes it through `merge` instead, and the tail comes back.
    //
    // Asserted at BOTH ends on purpose. The stored string is what survives a reload; the control's
    // label is what the player sees, and it is the half that would still read "Open hint 1 of 3" if
    // the count had been thrown away.
    it('keeps a bought rung when the board writes its own portion afterwards', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Record progress' }))

      expect(readProgress(cryptogramPuzzleId)).toEqual('kept#')
      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
      expect(screen.getByText('From the adapter, first.')).toBeInTheDocument()
    })

    // THE BOARD'S PORTION SURVIVES TOO, which is the other half of "each field has exactly one
    // writer" and the half a merge that simply refused board writes would fail. The adapter is
    // handed what the board wrote and re-attaches the tail to it; it never invents the board's side.
    it('keeps what the board wrote when a rung is bought afterwards', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Record progress' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))

      expect(readProgress(cryptogramPuzzleId)).toEqual('kept#')
    })

    // AN EMPTIED BOARD IS NOT A RESET, and this is the row the whole repair turns on. Every board
    // spells "there is nothing on this board" as `onProgress('')`, and on Themed Anagrams that is
    // what `encode` returns on the keystroke that clears the last draft -- so a frame that read this
    // write as Play again would take two purchased rungs away for a backspace. The ladder survives
    // it, and the control still counts what was paid for.
    it('keeps a bought rung when the board empties itself', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Clear progress' }))

      expect(readProgress(cryptogramPuzzleId)).toEqual('#')
      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
    })

    // AND `onReset` IS. The board raises a signal and names no key, no route and no field; the shell
    // answers it by storing '' over the whole record, ladder included. That split is what lets an
    // adapter extend an empty board write without a Play again becoming a press that gives the
    // player their rungs back.
    //
    // Both presses in the order a real Play again makes them -- `onProgress('')` then `onReset()` --
    // because the second has to win, and it is written second in every board that has one.
    it('drops the ladder when the board says the player started over', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Clear progress' }))
      await user.click(screen.getByRole('button', { name: 'Start over' }))

      expect(readProgress(cryptogramPuzzleId)).toEqual('')
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // A TYPE WITH NO ADAPTER KEEPS ITS OWN PROGRESS THROUGH A RESET, which is the other side of the
    // gate above it. goFigure owns its ladder inside its progress string and is not reached through
    // the registry at all, so a shell that cleared progress on every `onReset` would be overwriting a
    // board it does not read. The count in `lull:hints:` is what goes.
    it('leaves progress alone on a reset when the type has no adapter', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Record progress' }))
      await user.click(screen.getByRole('button', { name: 'Start over' }))

      expect(readProgress(cryptogramPuzzleId)).toEqual('kept')
    })

    // THE REVEAL IS REACHABLE, and it is the reason `opened` is stored rather than derived from the
    // spent rungs: a bar reaches "Show answer" only when `opened` exceeds the ladder's length, and a
    // count read off a three-rung list can never express four. This walks all three rungs and then
    // the fourth step, which is the one a derived count cannot sell.
    it('sells the step past the last rung, which is the answer', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Show answer' }))

      expect(screen.getByText('The answer is Ate ate tea.')).toBeInTheDocument()
      expect(readProgress(cryptogramPuzzleId)).toEqual('####')
    })

    // WHERE THE RUNG IS NOT. `lull:hints:<puzzleId>` is the uncontrolled bar's own store, and an
    // adapter type must not touch it: the count and whatever the rung did to the board would then be
    // two records with different lifetimes, able to disagree in a state no test would think to
    // write. This is goFigure's argument, and the reason a board's Play again already clears an
    // adapter's ladder for free -- it writes `''` through the same callback.
    //
    // The key is written out rather than built from storage.ts's private prefix, exactly as the
    // reset test above writes it out: a test that built the key from the same constant the code
    // builds it from would pass whatever that constant became.
    it('keeps the count out of the hint store, because the rung lives in the board’s own progress', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))

      expect(window.localStorage.getItem(`lull:hints:${cryptogramPuzzleId}`)).toBeNull()
    })

    // A RETURNING PLAYER, and the case that proves the count is the ADAPTER's reading of progress
    // rather than anything the frame counts for itself. Two rungs are already in the progress
    // string, so the control opens on "Show 2 hints" and the press is free -- it re-shows what was
    // paid for instead of charging for it again.
    it('counts the rungs the adapter says are already bought', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      writeProgress(cryptogramPuzzleId, '##')
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Show 2 hints' }))

      expect(screen.getByText('From the adapter, second.')).toBeInTheDocument()
      expect(screen.queryByText('From the adapter, third.')).not.toBeInTheDocument()
      expect(readProgress(cryptogramPuzzleId)).toEqual('##')
    })

    // ONE TO THREE, AND A SHORT LADDER IS NOT AN ERROR. An adapter returns null from `chooseNext`
    // when the player has already established everything a rung could say, so a one-rung ladder is
    // the correct output of a working rule. The bar reads `hints.length` everywhere, so this needs
    // no arithmetic in the frame -- but nothing said so until this row.
    it('draws a one-rung adapter ladder rather than refusing it', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(['The only rung worth selling.'])

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 1' }))

      expect(screen.getByText('The only rung worth selling.')).toBeInTheDocument()
    })

    it('draws a two-rung adapter ladder rather than refusing it', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(['Adapter rung one.', 'Adapter rung two.'])

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 2' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 2' }))

      expect(screen.getByText('Adapter rung one.')).toBeInTheDocument()
      expect(screen.getByText('Adapter rung two.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Open hint/ })).not.toBeInTheDocument()
    })

    // The end of a SHORT ladder is still the end of the ladder, and the answer still closes it. The
    // sentence is `answerOf`'s -- the frame composes nothing and the bar renders what it is handed
    // -- so what this pins is that the reveal survives a ladder that is not three rungs long.
    it('closes a short adapter ladder with the answer the pack shipped', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      writeProgress(cryptogramPuzzleId, '##')
      stubbedAdapter = stubAdapter(['Adapter rung one.', 'Adapter rung two.'])

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Show 2 hints' }))
      await user.click(screen.getByRole('button', { name: 'Show answer' }))

      expect(screen.getByText('The answer is Ate ate tea.')).toBeInTheDocument()
      expect(readProgress(cryptogramPuzzleId)).toEqual('###')
    })

    // A DECLINE, which is the adapter answering null while the ladder still looks unspent. Nothing
    // is bought: no progress is written and the count does not move, which is exactly what HintBar
    // documents for a controlled owner that says no.
    //
    // The sheet opens anyway -- the bar has no way to ask for a shut one -- so the assertion that
    // matters for a player is the last one: the sheet it opened carries its own way out. Without it
    // a decline is a panel over the board with Escape as its only exit, and a touch device has none.
    it('buys nothing when the adapter declines the press', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(cryptogramPack)
      stubbedAdapter = { ...stubAdapter(THREE_RUNGS), open: () => null }

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))

      expect(readProgress(cryptogramPuzzleId)).toBeNull()
      expect(screen.queryByText('From the adapter, first.')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument()
    })

    // `ladder` MAY ANSWER NULL, and the frame reads that the way it reads a malformed pack ladder:
    // no bar at all. It is the same `hints !== null` gate the pack path has always used, which is
    // why the adapter branch needed no second guard -- and why this row exists to say the gate
    // really does cover both.
    it('draws no bar when the adapter has no ladder to give', async () => {
      setupPack(cryptogramPack)
      stubbedAdapter = { ...stubAdapter(THREE_RUNGS), ladder: () => null }

      renderFrame(cryptogramPuzzleId)
      await screen.findByRole('region', { name: 'Board' })

      expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
    })

    // The board's side of the seam, and the whole reason the adapter hangs off the REGISTRY rather
    // than off the board. The shell asks the registry its own question -- the same standing
    // `needsDictionary` has -- so the board is handed its six props and learns nothing.
    it('still tells the board nothing about hints', async () => {
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      await screen.findByRole('region', { name: 'Board' })

      expect(Object.keys(lastProps()).toSorted()).toEqual([
        'dictionary',
        'onProgress',
        'onReset',
        'onSolved',
        'progress',
        'puzzle',
      ])
    })

    // The relationship a role query cannot defend on its own. `aria-controls` contributes nothing to
    // an accessible name, so it can rot in total silence while every other assertion here keeps
    // passing -- and the adapter path is a new caller of the same bar, so both ends are resolved
    // here as well as in the bar's own suite.
    it('points the adapter bar’s control at the sheet it opens', async () => {
      setupPack(cryptogramPack)
      stubbedAdapter = stubAdapter(THREE_RUNGS)

      renderFrame(cryptogramPuzzleId)
      const control = await screen.findByRole('button', { name: 'Open hint 1 of 3' })

      expect(control).toHaveAttribute('aria-expanded', 'false')
      expect(document.getElementById(control.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
    })

    // THE OTHER SIDE OF THE BRANCH, and it is asserted on the same fixture as the first test so the
    // only difference between the two is the adapter. Three of the six types compute nothing and
    // read their ladder off the pack, which is why `hints` is optional -- and their bar keeps its
    // count in `lull:hints:` and writes no progress, which is the mirror image of the rows above.
    it('leaves a type with no adapter reading the ladder off the pack', async () => {
      const user = userEvent.setup({ delay: null })
      setupPack(stalePackCryptogramPack)

      renderFrame(cryptogramPuzzleId)
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))

      expect(screen.getByText(PACK_RUNG)).toBeInTheDocument()
      expect(window.localStorage.getItem(`lull:hints:${cryptogramPuzzleId}`)).toEqual('1')
      expect(readProgress(cryptogramPuzzleId)).toBeNull()
    })

    // A PACK THAT SHIPPED NO LADDER AT ALL, which is the wire this app is being written against and
    // the state every pack reaches once lull-api's deploy follows this one. No adapter and no
    // `hints` is the one combination that has to draw NOTHING -- `hintsOf` answers null on a missing
    // field exactly as it does on a malformed one -- and without this row the fixtures could have
    // lost their ladders while a bar drawn from stale bytes went on passing everything above.
    it('draws no bar when the pack ships no ladder and the type has no adapter', async () => {
      setupPack(cryptogramPack)

      renderFrame(cryptogramPuzzleId)
      await screen.findByRole('region', { name: 'Board' })

      expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
    })
  })

  // THE DEPLOY WINDOW, AND IT IS OPEN RIGHT NOW rather than a shape out of the archive. This app
  // ships BEFORE lull-api stops sending `hints` -- clause (b) of that repo's rebuild runbook makes
  // the order mandatory, because a pack that dropped the field first would leave three of six benches
  // with no hint bar at all -- so for the whole gap between the two deploys every pack that arrives
  // carries a ladder the adapters have already replaced. It outlives the gap on any device holding a
  // pack cached inside it, for as long as that pack is kept.
  //
  // THE SHIPPED ADAPTERS, NOT THE STUB ABOVE, and that is the difference between this describe and
  // the one before it. That one proves the frame reads no grammar and a stub is the right instrument
  // for it. This one proves that on a pack carrying BOTH ladders the sentences a player reads are the
  // ones computed from their own board -- a claim about which of two real ladders wins, which a stub
  // whose rungs are invented strings cannot make.
  //
  // EVERY RUNG IS OPENED, so the negative half is a real negative. With one rung bought the bar draws
  // one sentence whichever ladder it read, and a `queryByText` over the other two would pass on a
  // frame that had chosen wrong.
  describe('a stale pack ladder arriving beside a live adapter', () => {
    // PHRAZLE IS GATED ON THE WORD LIST and the other two are not, so every row here renders inside a
    // ready DictionaryContext rather than only the row that needs one. A frame that cannot see a word
    // list refuses a Phrazle deep link outright and draws no bar to read either ladder off -- which
    // would fail this row for a reason that has nothing to do with precedence. The value is a literal
    // rather than a provider, so no network, no timers and no Cache API are involved; the gate itself
    // is asserted in its own describe further down.
    const renderReady = (id: string): ReturnType<typeof render> =>
      render(
        <DictionaryContext.Provider value={{ status: 'ready', words: phrazleDictionary }}>
          <PuzzleFrame locale="en-US" now={noonOnPackDate} puzzleId={id} />
        </DictionaryContext.Provider>,
      )

    const openWholeLadder = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(await screen.findByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))
    }

    // The adapter rungs are WRITTEN OUT rather than folded from the adapter here, for the reason each
    // adapter's own suite gives: an expectation built by re-running the rule agrees with whatever the
    // rule became. These are what the shipped builders produce for these fixtures on a board nobody
    // has touched, and they are the same strings those suites pin.
    //
    // The table is ANNOTATED rather than inferred, because a bare literal widens every column to the
    // union of its six cells and the adapter stops being assignable to anything.
    const benches: [string, Pack, string, HintAdapter | undefined, string[], string[]][] = [
      [
        'cryptogram',
        stalePackCryptogramPack,
        cryptogramPuzzleId,
        REGISTRY.cryptogram.hints,
        ['Every E is an E.', 'Every Z is a T.', 'One of the words is ATE.'],
        cryptogramStalePackLadder.map((hint) => hint.text),
      ],
      [
        'phrazle',
        stalePackPhrazlePack,
        phrazlePuzzleId,
        REGISTRY.phrazle.hints,
        [
          'The phrase has no A, no G, and no S.',
          'The phrase contains D, H, and L.',
          'Word 2 uses these letters, alphabetized: D, H, L, and O.',
        ],
        phrazleStalePackLadder.map((hint) => hint.text),
      ],
      [
        'themedanagrams',
        stalePackThemedAnagramsPack,
        themedAnagramsPuzzleId,
        REGISTRY.themedanagrams.hints,
        [
          'The 2nd answer starts with S.',
          'The 3rd answer starts with S and ends with T.',
          'The 4th answer starts with SPA.',
        ],
        themedAnagramsStalePackLadder.map((hint) => hint.text),
      ],
    ]

    it.each(benches)(
      'shows %s the rungs its adapter computed and none the stale pack carried',
      async (_type, stalePack, id, adapter, computed, shipped) => {
        const user = userEvent.setup({ delay: null })
        setupPack(stalePack)
        stubbedAdapter = adapter

        renderReady(id)
        await openWholeLadder(user)

        expect(computed.map((text) => screen.getByText(text))).toHaveLength(3)
        expect(shipped.flatMap((text) => screen.queryAllByText(text))).toEqual([])
      },
    )

    // THE BAR DOES NOT VANISH ON THE WINNING KEYSTROKE, and this is asserted at the FRAME because
    // nothing else can see it. Two adapters had nothing left to CHOOSE on a won board -- every rung
    // aims at a square or a row the player has not got -- so `ladder` answered null, the frame's
    // `hints !== null` gate dropped the bar, and a 60px `shrink-0` band unmounted at the instant of
    // the solve with the board re-laying itself out underneath. On cryptogram it flickered, because
    // an unlocked square can still be cleared. The adapters' own null-ladder rows passed the whole
    // time: they asserted the null and nothing followed them up to here.
    //
    // The progress strings are the SOLVED shape in each type's own grammar, written straight to
    // storage, because the point is the state a returning player arrives in as much as the keystroke
    // that reaches it.
    it.each<[string, Pack, string, HintAdapter | undefined, string]>([
      ['cryptogram', cryptogramPack, cryptogramPuzzleId, REGISTRY.cryptogram.hints, 'EEVAZT'],
      [
        'themedanagrams',
        themedAnagramsPack,
        themedAnagramsPuzzleId,
        REGISTRY.themedanagrams.hints,
        'KETTLE\nSAUCEPAN\nSKILLET\nSPATULA',
      ],
    ])('keeps the %s hint bar standing on a board that is already won', async (_type, loaded, id, adapter, solved) => {
      setupPack(loaded)
      writeProgress(id, solved)
      stubbedAdapter = adapter

      renderReady(id)

      expect(await screen.findByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
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
    // throw during render, and ErrorBoundary would answer it by replacing the whole app.
    it('says so rather than losing the whole app to the boundary', async () => {
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

    // The message is what this surface IS, so it is the surface's heading rather than a line of
    // prose sitting in the middle of it. A reader who arrives by deep link is told what happened by
    // the first thing a screen reader's heading list offers, and the page has a name at all -- the
    // board that would normally supply one never rendered.
    it('makes that message the heading of the surface', async () => {
      setup()
      mockFetchPack.mockResolvedValueOnce(undefined)
      writePack(packDate, {
        ...pack,
        puzzles: [{ ...goFigurePuzzle, type: 'crossword' as typeof goFigurePuzzle.type }],
      })

      renderFrame()

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'A newer kind of puzzle. Reload while you’re online to play it.',
        }),
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

  // The gate. A context value is supplied directly rather than a provider, so no network, no timers
  // and no Cache API are involved and the state under test is one literal.
  describe('a puzzle whose type needs a word list', () => {
    const renderGated = (state: DictionaryState, id: string = phrazlePuzzleId): ReturnType<typeof render> =>
      render(
        <DictionaryContext.Provider value={state}>
          <PuzzleFrame locale="en-US" puzzleId={id} />
        </DictionaryContext.Provider>,
      )

    it('refuses a Phrazle deep link until the word list is here', async () => {
      setupPack(phrazlePack)

      renderGated({ status: 'absent', words: null })

      expect(await screen.findByRole('heading', { name: 'Phrazle needs a one-time download' })).toBeInTheDocument()
      expect(
        screen.getByText(
          'The word list downloads once and then works offline. Open this puzzle again while you’re online.',
        ),
      ).toBeInTheDocument()
    })

    // The entry is KNOWN here, so the trail names the puzzle. That is the whole difference between
    // this dead end and "That puzzle isn't here", which names the day and stops.
    it('names the puzzle on the spine, because it knows which one it is', async () => {
      setupPack(phrazlePack)

      renderGated({ status: 'absent', words: null })
      const trail = await breadcrumb()

      expect(within(trail).getByText('Phrazle')).toHaveAttribute('aria-current', 'page')
    })

    // A WORD LIST STILL ARRIVING IS NOT A WORD LIST THAT FAILED, and this surface used to say it
    // was. Every cold open passes through `loading`: the pack comes synchronously out of
    // localStorage and the provider's Cache API read does not, so the first painted frame of a
    // Phrazle deep link landed on a panel telling a player who already had the word list to
    // reconnect and open the puzzle again -- both halves false.
    //
    // What it says instead names no action, and it keeps the spine, which under a standalone
    // manifest is the only way off this surface.
    //
    // REDDENS ON: the gate put back to `status !== 'ready'` for the refusal panel -- the heading
    // then appears while the shell is still looking, and the live region does not.
    it('says only that it is still getting ready while the word list is arriving', async () => {
      setupPack(phrazlePack)

      renderGated({ status: 'loading', words: null })

      expect(await screen.findByRole('status')).toHaveTextContent('Getting this puzzle ready…')
      expect(screen.queryByRole('heading', { name: 'Phrazle needs a one-time download' })).toBeNull()
      expect(
        screen.queryByText(
          'The word list downloads once and then works offline. Open this puzzle again while you’re online.',
        ),
      ).toBeNull()
    })

    // The way home survives the wait. A blank placeholder was the other candidate for this state and
    // this is why it lost: the manifest is display: standalone, so there is no back button and no
    // address bar, and a slow first download would have left the player on a screen with nothing on
    // it and no way off.
    //
    // REDDENS ON: returning the frame's aria-hidden placeholder for `loading` instead of a DeadEnd.
    it('still offers a way home while the word list is arriving', async () => {
      setupPack(phrazlePack)

      renderGated({ status: 'loading', words: null })
      const trail = await breadcrumb()

      expect(within(trail).getByRole('link', { name: 'Lull' })).toHaveAttribute('href', '/')
      expect(within(trail).getByText('Phrazle')).toHaveAttribute('aria-current', 'page')
    })

    it('opens the board once the word list is here', async () => {
      setupPack(phrazlePack)

      renderGated({ status: 'ready', words: phrazleDictionary })

      expect(await screen.findByRole('region', { name: 'Board' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Phrazle needs a one-time download' })).toBeNull()
    })

    // THE WIRING ITSELF, which the gate above does not cover: every test in this describe asserts
    // what the frame DRAWS at a given status, and all of them stay green on a frame that opens the
    // board and hands it no word list at all. `dictionary={words ?? undefined}` is one mount site
    // and one expression, and until this row nothing read it.
    //
    // toBe RATHER THAN toEqual, and that is the assertion doing a second job. Identity is what makes
    // "one provider, one fetch, one 51,852-entry Set for the whole app however many surfaces read
    // it" true -- a frame that rebuilt the set per mount would satisfy toEqual and quietly cost a
    // rebuild on every navigation. It also pins that nothing between the context and the board
    // copies, filters or freezes it on the way past.
    //
    // The recorder is the right instrument here rather than a real Phrazle. This suite mocks
    // entryFor file-wide precisely so the frame's contract is asserted as what it HANDS a board,
    // and reading the set back out of a real board's rendered output would test the board.
    //
    // REDDENS ON: dropping the `dictionary` prop from the mount site, or replacing the value with
    // `new Set(words)`.
    it('hands the board the word set the provider published, and not a copy of it', async () => {
      setupPack(phrazlePack)

      renderGated({ status: 'ready', words: phrazleDictionary })
      await screen.findByRole('region', { name: 'Board' })

      expect(lastProps().dictionary).toBe(phrazleDictionary)
    })

    // THE OTHER HALF, and the one that says the prop is ambient rather than Phrazle's. goFigure does
    // not need a word list, so the frame never gates it -- and it is handed `undefined` rather than
    // the set, because `words` is null on a device that never fetched one. A board that predates the
    // sixth prop reads nothing and compiles unchanged, which is the whole claim the optional prop
    // makes.
    //
    // REDDENS ON: `dictionary={words ?? EMPTY}` or any default that substitutes a set for absence --
    // the value is then a Set here and a board could not tell "no dictionary" from "no words".
    it('hands a board that needs no word list undefined rather than an empty set', async () => {
      setupPack(pack)

      renderGated({ status: 'absent', words: null }, puzzleId)
      await screen.findByRole('region', { name: 'Board' })

      expect(lastProps().dictionary).toBeUndefined()
    })

    // THE ORDERING, and this is the test that catches the branch being written the other way round.
    // An unknown type has NO entry to ask about needsDictionary, so the unknown-type guard must stay
    // FIRST -- put the new branch above it and the frame dereferences entry.needsDictionary on an
    // entry that may be undefined, which is a throw during a render, and ErrorBoundary (_app.tsx)
    // would answer it by replacing the whole app with "Lull got stuck" -- so the cost is the entire
    // surface, not this one puzzle.
    //
    // The fixture is what makes this a real guard test rather than a shape: a pack holding a type
    // this build has never heard of, opened with NO dictionary, so BOTH branches are live and only
    // their order decides which one answers.
    it('answers an unknown type before it asks about the dictionary', async () => {
      const unknownId = '2026-08-18:crossword:5e4d3c2b'
      setupPack({
        ...phrazlePack,
        puzzles: [{ ...phrazlePuzzle, id: unknownId, type: 'crossword' as typeof phrazlePuzzle.type }],
      })

      renderGated({ status: 'absent', words: null }, unknownId)

      expect(await screen.findByRole('heading', { level: 1, name: UNKNOWN_TYPE_MESSAGE })).toBeInTheDocument()
    })
  })
})
