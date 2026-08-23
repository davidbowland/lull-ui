import { getDefaultNormalizer, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { GoFigureBoard } from './index'
import { goFigurePuzzle, quickPuzzle } from '@test/__mocks__'
import { GoFigureData, GoFigureHintLadder, Puzzle } from '@types'

describe('GoFigureBoard', () => {
  const onProgress = jest.fn()
  const onSolved = jest.fn()

  const renderBoard = (
    puzzle: Puzzle<GoFigureData> = goFigurePuzzle,
    progress: string | null = null,
  ): ReturnType<typeof render> =>
    render(<GoFigureBoard onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />)

  // The bank is 6,9,7,7, so two tiles show 7. Their accessible names carry the tile
  // position ("Use 7, tile 3 of 4"), so queries match by prefix, and availability is
  // aria-disabled rather than disabled -- the tiles stay focusable so a tap does not
  // blur the button it just activated. Every helper here takes the first still-available
  // one rather than a fixed index.
  const tap = async (user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> => {
    const buttons = screen
      .getAllByRole('button', { name: new RegExp(`^${name}`) })
      .filter((button) => button.getAttribute('aria-disabled') !== 'true')
    await user.click(buttons[0])
  }

  const tapAll = async (user: ReturnType<typeof userEvent.setup>, names: string[]): Promise<void> => {
    for (const name of names) {
      await tap(user, name)
    }
  }

  // The ribbon carries a zero-width repeat mark on every other message, so that saying the same
  // sentence twice running is a change the DOM can see and a screen reader will read. It is
  // invisible and it is not whitespace, so the default normalizer leaves it in and an exact-string
  // query misses half the time -- which would make every message assertion here depend on how many
  // messages the test happened to send first. Stripping it in the normalizer keeps the queries
  // written in the words the player hears.
  const withoutMark = {
    normalizer: (value: string): string => getDefaultNormalizer()(value).replace(/\u200b/gu, ''),
  }

  const said = (text: string): HTMLElement => screen.getByText(text, withoutMark)

  const SOLUTION = ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Multiply', 'Use 7']
  const UNDO = 'Undo the last tile'
  const CLEAR = 'Clear every square'

  // The standing line the floor shows while the board has nothing to report. It names the
  // INTERACTION rather than the goal, which is the thing seven dashed boxes cannot say for
  // themselves.
  //
  // "Pick" rather than "Tap", and the verb is the whole of the change. This bench is playable by
  // keyboard -- the arrows move the caret, the digits and signs write -- and "Tap" named the one
  // modality a keyboard player cannot use, in the standing line that exists to teach the
  // interaction. "Pick" is mode-neutral, the same length, and the same shape.
  const INSTRUCTION = 'Pick a square, then a tile.'

  // What the keyboard says when the sheet is over the board. Named here for the same reason the
  // component names it once: it is asserted from several tests and a sentence written twice drifts.
  const HIDE_TO_TYPE = 'Hide the hints to type.'

  // The ribbon shows a MESSAGE or the resting line, never both -- FloorBar lays the resting line
  // over the live region and hides it whenever the bench has something to say. Every write
  // announces itself, so reading the resting total means first putting the board back into a state
  // with nothing to report. Moving the caret does exactly that and changes no square, so it is the
  // cheapest way for a test to ask "what does the floor stand at".
  const rest = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getAllByRole('button', { name: /^Square 1, number/ })[0])
  }

  // Both of the bench's live regions, in document order: the floor's ribbon and the hint sheet's.
  // Neither is named, so this is the only way to reach them -- and the pair is what the mounted-and
  // -empty rule is actually about, since NVDA and JAWS announce changes inside a region they are
  // already watching and miss one inserted with its text already in it.
  const regions = (): string[] => screen.getAllByRole('status').map((region) => region.textContent ?? '')

  // A board whose second sign came from the first rung of the ladder. Rung 0 of the fixture names
  // slot 1 -- NOT slot 0 -- because lull-api orders rungs by how much each reveals, so a difficulty-4
  // ladder runs 1, 0, 2. Slot 1 is square 4.
  const HINTED = '___+___|1|1'

  // Two tiles down and the first rung spent: square 1 holds bank tile 0 (a 6), square 3 holds tile 1
  // (a 9), and square 4 holds the "+" rung 0 revealed. `runningTotal` reads the UNBROKEN prefix, so
  // square 2 being empty stops the walk at 6 -- which is what makes this board the one where opening
  // the NEXT rung moves the number: rung 1 names slot 0, square 2, and the prefix then runs 6 + 9.
  const TOTAL_MOVER = '0_1+___|1|1'

  // Solved, with the first rung still spent. Cells are bank INDICES, so 6+9+7*7 is written 0+1+2*3,
  // and the `|1|1` tail says one rung opened and slot 1 locked -- which decode cross-checks against
  // the ladder, since slot 1 is the slot rung 0 names and square 4 does hold that rung's "+".
  //
  // It exists to tell Play again and Clear apart, which is the one distinction this component is
  // most likely to collapse. Both empty the squares; only Play again is allowed to take the rungs.
  const SOLVED_HINTED = '0+1+2*3|1|1'

  // A bank of 9,3,9,9 has three tiles that all write "9", so the expression alone cannot
  // say which one was tapped. Spending the tile the player did not touch is visible: the
  // tapped tile stays bright and a tile across the row goes dim.
  const repeatedBank: Puzzle<GoFigureData> = {
    ...goFigurePuzzle,
    data: { ...goFigurePuzzle.data, acceptedSolutions: ['9+3+9*9'], bank: [9, 3, 9, 9], goal: 189 },
  }

  // The pack lists six routes to 154. Cut to one, and the other five become expressions
  // that reach the goal by a route this puzzle does not accept.
  const oneRouteOnly: Puzzle<GoFigureData> = {
    ...goFigurePuzzle,
    data: { ...goFigurePuzzle.data, acceptedSolutions: ['6+9+7*7'] },
  }

  // The board and the instrument are SIBLINGS, not one nested in the other: the shell
  // wraps them in a `display: contents` box so each becomes a flex item of the screen
  // column, and it orders its own hint bar between them. A wrapper here would collapse
  // the two bands into one and take the seam with it.
  describe('the two bands', () => {
    it('renders the board and the instrument as siblings', () => {
      const { container } = renderBoard()

      expect(container.children).toHaveLength(2)
    })

    it('puts the tiles in a band of their own', () => {
      renderBoard()

      expect(screen.getByRole('region', { name: 'Tiles' })).toBeInTheDocument()
    })
  })

  describe('the goal plate', () => {
    it('names the number to make', () => {
      renderBoard()

      expect(screen.getByRole('heading', { name: 'Make 154' })).toBeInTheDocument()
    })

    it('names whichever number this puzzle asks for', () => {
      renderBoard(quickPuzzle)

      expect(screen.getByRole('heading', { name: 'Make 10' })).toBeInTheDocument()
    })
  })

  // The graft. Left to right is the one rule in Lull nobody can guess, and the paragraph
  // this replaced stated it without teaching it.
  describe('the worked example', () => {
    // The rule itself, stated once, above the three steps that show it. It replaces a caption
    // ("Signs run left to right") plus a line naming the sum ("Here is 2 + 3 × 4 on this board"),
    // which between them spent two lines saying what the worked sum says by being there.
    it('states the rule the steps work through', () => {
      renderBoard()

      expect(screen.getByText('Signs apply left to right, not by PEMDAS.')).toBeInTheDocument()
    })

    // Order, and it is the one thing on this bench that is not negotiable. The whole game is
    // comparing a number you are building against a number you were given, so a layout that puts
    // anything between them makes the player hold one of the two in their head -- which is the
    // arithmetic the tiles were meant to be doing. An earlier draft put the example second because
    // the design was drawn that way, and at a 372x608 window it pushed the expression clean off the
    // bottom of the board. The teaching goes last because it is the only thing here that can be
    // scrolled to without costing the player anything.
    it('sets the expression directly under the goal and the teaching after both', () => {
      renderBoard()

      const goal = screen.getByRole('heading', { name: 'Make 154' })
      // The group, not a live region. The region that used to wrap this row was named "Your
      // expression" and carried the running total; the total moved to the floor and the region went
      // with it, so the row's own group is what marks the expression's place in the column now.
      const squares = screen.getByRole('group', { name: 'Squares' })
      const teaching = screen.getByText('Signs apply left to right, not by PEMDAS.')

      expect(goal.compareDocumentPosition(squares) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(squares.compareDocumentPosition(teaching) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it.each([
      ['2 + 3 = 5', 'the first sign goes first'],
      ['5 × 4 = 20', 'the next sign acts on that answer'],
      ['20, not 14.', 'A calculator would multiply first. This board never does.'],
    ])('works %s out and says why', (sum: string, note: string) => {
      renderBoard()

      expect(screen.getByText(sum)).toBeInTheDocument()
      expect(screen.getByText(note)).toBeInTheDocument()
    })

    it('numbers the steps, because they only mean anything in order', () => {
      renderBoard()

      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    // Fixed numbers, never the player's own bank: the rule has to be shown worked
    // through, and 2, 3 and 4 give nothing about this puzzle away.
    it('works the same sum whatever the bank holds', () => {
      renderBoard(repeatedBank)

      expect(screen.getByText('2 + 3 = 5')).toBeInTheDocument()
    })
  })

  // THE FLOOR IS WHERE THE BOARD SPEAKS, and after this change it is the only place. The board's
  // own `role="status"` region -- named "Your expression", wrapping the squares and the total --
  // is gone: the squares announce themselves through the sentences a write sends to the ribbon,
  // and the total is a standing line laid over the ribbon rather than inside it.
  describe('the floor', () => {
    it('no longer owns a live region of its own', () => {
      renderBoard()

      expect(screen.queryByRole('status', { name: 'Your expression' })).not.toBeInTheDocument()
    })

    // Both regions mounted, both empty. A region inserted with its text already in it is routinely
    // missed, so this is the property the whole announcement design rests on -- and it is the one a
    // standing line moved INTO the ribbon would silently destroy.
    it('mounts both live regions empty', () => {
      renderBoard()

      expect(regions()).toEqual(['', ''])
    })

    // The gap this closes. The rail carried "Tap the numbers and signs to build a sum." and lost it
    // when it became seven squares -- and the new interaction is MODAL in a way the old one was
    // not, because there is now an insertion point and nothing on screen names it.
    it('stands an instruction in the floor while nothing is placed', () => {
      renderBoard()

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
    })

    it('gives the instruction up to the running total on the first write', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await rest(user)

      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()
      expect(screen.getByText('Running total: 6')).toBeInTheDocument()
    })

    // THE STANDING LINE IS LAID OVER THE RIBBON, NOT INSIDE IT, and that is the whole reason a
    // resting board is silent. A line moved into the live region would be a node inserted with its
    // content already in it on the first render and an unasked-for announcement on every return to
    // rest afterwards -- the board reading its own furniture out loud each time the player moved the
    // caret. Two facts, asserted together because it is the pairing that matters: the instruction is
    // on the screen AND both regions are still holding nothing.
    it('stands the instruction outside the live regions', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await rest(user)

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
      expect(regions()).toEqual(['', ''])
    })

    // A board restored with a rung spent and no tiles on it has nothing the player placed, so the
    // instruction is still the right standing line -- the total would be empty either way.
    it('stands the instruction on a board carrying only a hint', () => {
      renderBoard(goFigurePuzzle, HINTED)

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
    })

    it('lets a message displace the resting line', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')

      expect(screen.queryByText('Running total: 6')).not.toBeInTheDocument()
      expect(said('Square 1 is 6. Running total: 6. Now on square 2, a sign.')).toBeInTheDocument()
    })

    // THE INSTRUCTION HAS TO COME BACK CHEAPLY, and until this it did not come back at all on the
    // one board where it is still needed. `notice` is sticky -- it stands until the board next goes
    // quiet, and the board goes quiet only on a caret move or a rung -- so a first-time player who
    // pressed Undo on an empty board was left with "Nothing to undo." forever and could recover the
    // instruction only by performing the very action the instruction existed to teach.
    //
    // The fix is not a timer and could not be one: the ribbon shows a message OR the resting line,
    // FloorBar owns that choice, and this file may not reach into it. So a refusal on a board the
    // player has not written to carries the instruction with it, which puts the two facts on screen
    // together instead of trading one for the other.
    it('keeps the instruction under a refusal on an untouched board', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(said(`Nothing to undo. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    // And it stops the moment the player has written something, because from then on they have
    // demonstrated they know how -- and the refusal is the only thing worth reading.
    it('drops the instruction from a refusal once the board holds something', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.keyboard('6')

      expect(said('That square takes a sign.')).toBeInTheDocument()
    })

    // A rung is not something the player wrote, but it is something they PAID for, and a board
    // carrying one is no longer the untouched board the instruction is aimed at.
    it('drops the instruction from a refusal on a board carrying only a hint', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(said('Nothing to undo.')).toBeInTheDocument()
    })
  })

  describe('the empty board', () => {
    // The rail used to spell this out ("Tap the numbers and signs to build a sum.") because an
    // empty string says nothing about itself. Seven empty squares say it by standing there, and
    // each one says which kind it takes in its own name -- so the sentence went with the rail.
    it('shows seven empty squares before anything has been tapped', () => {
      renderBoard()

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })

    it('offers every bank digit as a button', () => {
      renderBoard()

      expect(screen.getAllByRole('button', { name: /^Use 7/ })).toHaveLength(2)
    })

    // Symbols alone are what a screen reader reads as "plus sign" at best and as nothing
    // at all at worst.
    it.each([['Add'], ['Subtract'], ['Multiply'], ['Divide']])(
      'names the %s sign rather than showing only its symbol',
      (name: string) => {
        renderBoard()

        expect(screen.getByRole('button', { name })).toBeInTheDocument()
      },
    )

    // The control SAYS it has nothing to take back rather than going quiet and refusing the press.
    // An aria-disabled Undo would be the tidier-looking version and it cannot work: Button's own
    // guard returns before onClick, so the sentence below would be unreachable code and a player who
    // pressed the control would get no account of why nothing happened.
    it('says so when there is nothing to undo', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: UNDO }))

      // The board is untouched, so the refusal carries the instruction rather than displacing it.
      // See "keeps the instruction under a refusal on an untouched board" above.
      expect(said(`Nothing to undo. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    it('writes nothing when there is nothing to undo', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(onProgress).not.toHaveBeenCalled()
    })

    it('says so when there is nothing to clear', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(said(`Nothing to clear. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    it('writes nothing when there is nothing to clear', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(onProgress).not.toHaveBeenCalled()
    })
  })

  // Clear is the only way out of a square a rung filled, so it is the one control on this tray that
  // never disappears -- it stands beside Undo while the board is unsolved and beside Play again once
  // it is. What it must NOT do is share a path with Play again: Clear keeps the rungs and Play again
  // takes them, and every test here that mentions the ladder is guarding that seam.
  describe('Clear', () => {
    it('empties every square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])
      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })

    it('returns every spent tile to the bank', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])
      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(screen.queryByText('Used')).not.toBeInTheDocument()
    })

    // The moves Undo would have stepped back through are gone with the board, so the history goes
    // with them. Leaving it standing would let one press of Undo re-empty a square the player had
    // already refilled.
    it('empties the undo history with the board', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: CLEAR }))
      await user.click(screen.getByRole('button', { name: UNDO }))

      // Clear put the board back to untouched, so the refusal carries the instruction again.
      expect(said(`Nothing to undo. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    it('puts the caret back on the first square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])
      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 1, number, empty')
    })

    // A cleared board is emphatically not an untouched one. The empty string means "no progress" to
    // the shelf and the frame, so a board the player cleared with a rung spent has to say so -- and
    // `_______|1|` is exactly that sentence: nothing in the squares, one rung still paid for.
    it('keeps the rungs the player paid for', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(onProgress).toHaveBeenLastCalledWith('_______|1|')
    })

    it('stands beside Play again once the board is solved', () => {
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: CLEAR })).toBeInTheDocument()
    })

    // THE PAIR THAT KEEPS THE TWO PATHS APART, run over one board so nothing but the control differs.
    // Clear keeps the count and empties the cells; Play again zeroes both. Routing either through the
    // other is silent -- the player finds their rungs gone and no error anywhere.
    it('keeps the ladder where Play again would take it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(onProgress).toHaveBeenLastCalledWith('_______|1|')
      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toBeInTheDocument()
    })

    // THE THIRD LEG. Clear and Play again are the two obvious ways back to an empty board and the
    // pair below keeps them apart; Undo is the third, and it has to answer the same question. A board
    // undone back to nothing but its rung is not an untouched board -- the empty string means "no
    // progress" to the shelf and the frame, so undoing the last tile the PLAYER placed must leave the
    // rung and its lock standing in the string.
    it('keeps the rung when Undo takes back the last tile the player placed', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(onProgress).toHaveBeenLastCalledWith('___+___|1|1')
    })

    it('takes the ladder where Clear would keep it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onProgress).toHaveBeenLastCalledWith('')
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })
  })

  // The total RESTS IN THE FLOOR now, beside the controls that turn it, rather than in a line under
  // the squares. FloorBar lays it over the ribbon's live region and outside it, so it shows only
  // while the bench has nothing to say -- which is why every test here puts the board back to rest
  // before reading it.
  describe('the running total', () => {
    it('shows the total of the tiles tapped so far', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])
      await rest(user)

      expect(screen.getByText('Running total: 15')).toBeInTheDocument()
    })

    // Left to right, on a board still short of finished -- a solved board hands the ribbon its
    // banner and the resting line never gets a turn, so the total cannot be read there at all.
    it('counts left to right rather than by PEMDAS', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      // 6+9=15, ×7=105. PEMDAS would make it 69.
      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Multiply', 'Use 7'])
      await rest(user)

      expect(screen.getByText('Running total: 105')).toBeInTheDocument()
    })

    it('holds the total while a sign waits for its digit', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])
      await rest(user)

      expect(screen.getByText('Running total: 6')).toBeInTheDocument()
    })

    it('has no total to show before the first tile', () => {
      renderBoard()

      expect(screen.queryByText(/Running total/)).not.toBeInTheDocument()
    })

    it('recounts the total after a tile is undone', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', UNDO, UNDO])
      await rest(user)

      expect(screen.getByText('Running total: 6')).toBeInTheDocument()
    })

    it('shows the total of restored progress', () => {
      renderBoard(goFigurePuzzle, '6+9')

      expect(screen.getByText('Running total: 15')).toBeInTheDocument()
    })

    // Division has to come out whole at every step, so there is no number to show -- and
    // saying so on the tap that broke it beats waiting for the last tile.
    it('says there is no total when a division does not come out even', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Divide', 'Use 9'])
      await rest(user)

      expect(screen.getByText("Running total: none. That division doesn't come out even.")).toBeInTheDocument()
    })

    // THE HALF THE RESTING LINE CANNOT COVER. The total used to sit INSIDE the board's live region,
    // so every tap announced it. Laid over the ribbon it is standing text: read in place, never
    // announced. A write is the one event that moves it, so the write's own sentence is where the
    // announcement has to go -- otherwise the number a screen-reader player is here to watch changes
    // in silence, and that is exactly the regression removing the board's region would have caused.
    it('announces the total the write moved it to', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(said('Square 3 is 9. Running total: 15. Now on square 4, a sign.')).toBeInTheDocument()
    })
  })

  describe('building an expression', () => {
    it('writes each tapped tile into the square the caret was on', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 2, sign, Add' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 3, number, 9' })).toBeInTheDocument()
    })

    it('consumes a tapped digit from the bank', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'true')
    })

    // Marked by form and not by color, and legible either way: the bank is what the
    // player is counting, so a spent tile has to stay readable while it says it is spent.
    it('marks a spent tile as used', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getAllByText('Used')).toHaveLength(1)
    })

    // Spent and unavailable are two different facts. Every digit goes unavailable while a
    // sign is owed, and calling those tiles used would be a lie one tap disproves.
    it('does not mark a tile the player has not spent', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')

      expect(screen.getAllByText('Used')).toHaveLength(1)
    })

    it('marks nothing on an untouched board', () => {
      renderBoard()

      expect(screen.queryByText('Used')).not.toBeInTheDocument()
    })

    // Duplicates are separate tiles. Spending one 7 must not spend the other.
    it('leaves the second copy of a duplicated digit available', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 7', 'Add'])

      expect(
        screen
          .getAllByRole('button', { name: /^Use 7/ })
          .filter((button) => button.getAttribute('aria-disabled') !== 'true'),
      ).toHaveLength(1)
    })

    it('spends the tile that was tapped, not the first one showing that digit', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(repeatedBank)

      await user.click(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' }))
      await tap(user, 'Add')

      expect(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'Use 9, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'false')
    })

    it('returns the tile that was tapped when it is undone', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(repeatedBank)

      await user.click(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' }))
      await tap(user, 'Add')
      await user.click(screen.getByRole('button', { name: 'Use 9, tile 1 of 4' }))
      await tap(user, UNDO)

      expect(screen.getByRole('button', { name: 'Use 9, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'false')
      expect(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('returns the tile to the bank on Undo', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await tap(user, UNDO)

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'false')
    })

    // Two digits in a row would read as one two-digit number, which no accepted solution
    // ever contains.
    it('refuses a second digit before a sign', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { name: /^Use 9/ })).toHaveAttribute('aria-disabled', 'true')
    })

    it('refuses a sign on an empty board', () => {
      renderBoard()

      expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('refuses two signs in a row', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-disabled', 'true')
    })

    // Bank INDICES in the cell run, not the digits they draw: square 1 holds tile 0 and square 3
    // holds tile 1. The `|0|` tail is the ladder -- no rung opened, nothing locked -- and it is what
    // separates a genuinely untouched board (the empty string) from one the player has cleared.
    it('reports the cell run as progress on every tap', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(onProgress).toHaveBeenNthCalledWith(3, '0+1____|0|')
    })

    it('reports the emptied square after an Undo', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', UNDO])

      expect(onProgress).toHaveBeenLastCalledWith('0______|0|')
    })
  })

  describe('solving', () => {
    it('announces the solution, formatted for reading', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, SOLUTION)

      expect(screen.getByText('Solved. 6 + 9 + 7 × 7 = 154')).toBeInTheDocument()
    })

    it('tells the shell the puzzle is solved', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, SOLUTION)

      expect(onSolved).toHaveBeenCalledTimes(1)
    })

    // THE LOAD-BEARING TEST. The component compares the joined string against
    // acceptedSolutions; it never evaluates arithmetic to decide correctness. 9+6+7*7
    // makes 154 by the same left-to-right rule, and this pack does not list it.
    it('does not solve on an expression the pack did not list, even when it reaches the goal', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(oneRouteOnly)

      await tapAll(user, ['Use 9', 'Add', 'Use 6', 'Add', 'Use 7', 'Multiply', 'Use 7'])

      expect(onSolved).not.toHaveBeenCalled()
      expect(screen.queryByText(/^Solved\./)).not.toBeInTheDocument()
    })

    it('says so plainly when an unlisted expression happens to reach the goal', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(oneRouteOnly)

      await tapAll(user, ['Use 9', 'Add', 'Use 6', 'Add', 'Use 7', 'Multiply', 'Use 7'])

      expect(
        screen.getByText("That isn't one of the sums for this puzzle. Undo the last tile and try again."),
      ).toBeInTheDocument()
    })
  })

  // A solved board is finished. Nothing on it edits the winning expression -- the way
  // back in is Play again, which empties the board rather than unpicking it one tile at
  // a time.
  describe('once solved', () => {
    const SOLVED = '6+9+7*7'

    const playAgain = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(screen.getByRole('button', { name: 'Play again' }))
    }

    it('offers Play again in place of Undo', () => {
      renderBoard(goFigurePuzzle, SOLVED)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: UNDO })).not.toBeInTheDocument()
    })

    it('refuses every tile in the bank', () => {
      renderBoard(goFigurePuzzle, SOLVED)

      const spent = screen
        .getAllByRole('button', { name: /^Use / })
        .filter((tile) => tile.getAttribute('aria-disabled') === 'true')

      expect(spent).toHaveLength(4)
    })

    it('refuses every sign', () => {
      renderBoard(goFigurePuzzle, SOLVED)

      expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('empties the board when the player plays again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })

    it('withdraws the solved message when the player plays again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(screen.queryByText(/^Solved\./)).not.toBeInTheDocument()
    })

    it('returns the whole bank when the player plays again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'false')
    })

    it('clears every used mark when the player plays again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(screen.queryByText('Used')).not.toBeInTheDocument()
    })

    it('forgets the winning expression when the player plays again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    // THE FROZEN KEYBOARD, and it is the reason `resetSignal` is wired at all.
    //
    // HintBar's open/shut state is local to it, and exactly one thing resets it: the `resetSignal`
    // effect. Play again zeroes the count and empties the board, and without the signal NOTHING
    // shuts the sheet -- so a player who left a rung open and then pressed Play again got a fresh,
    // empty, unsolved board with an open sheet over it rendering an empty list. `aria-expanded` was
    // still "true", so the board's own key handler returned before every key: arrows, digits, signs
    // and Backspace all silently declined on a live board. That is the exact inoperability the
    // keyboard handler exists to remove, reached from the other side.
    it('shuts the hint sheet when the player plays again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      await user.click(screen.getByRole('button', { name: 'Show 1 hint' }))
      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('takes the keys back on the board Play again hands over', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      await user.click(screen.getByRole('button', { name: 'Show 1 hint' }))
      await user.click(screen.getByRole('button', { name: 'Play again' }))
      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('6')

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    // Undo comes back with the board, and it comes back WORKING rather than merely present -- the
    // history is emptied by Play again, so a control that reappeared over a stale history would take
    // back a square the player had not filled this time round.
    it('offers a working Undo again once the emptied board has a tile on it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)
      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })
  })

  describe('a wrong answer', () => {
    // Says what the expression DID make, not "incorrect". The number is computed for
    // display; it takes no part in the decision above.
    it('names what the expression made', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])

      expect(screen.getByText('That makes 29, not 154. Undo the last tile and try again.')).toBeInTheDocument()
    })

    it('names what a subtraction made', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      // 6-9 = -3, then +7 = 4, then *7 = 28. The only test that exercises the minus
      // branch of evaluate.ts at all.
      await tapAll(user, ['Use 6', 'Subtract', 'Use 9', 'Add', 'Use 7', 'Multiply', 'Use 7'])

      expect(screen.getByText('That makes 28, not 154. Undo the last tile and try again.')).toBeInTheDocument()
    })

    // Division has to come out whole at every step, so there is no number to name.
    it('says so when a division does not come out whole', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Divide', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])

      expect(screen.getByText("That doesn't divide evenly. Undo the last tile and try again.")).toBeInTheDocument()
    })

    it('says nothing while tiles are still in the bank', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(screen.queryByText(/try again/)).not.toBeInTheDocument()
    })

    it('clears the message once a tile is undone', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])
      await tap(user, UNDO)

      expect(screen.queryByText(/try again/)).not.toBeInTheDocument()
    })
  })

  describe('stored progress', () => {
    // A legacy string, from the build before the board had squares. It is migrated rather than
    // dropped so a player mid-puzzle when the new build lands keeps what they had.
    it('restores an expression left half-finished', () => {
      renderBoard(goFigurePuzzle, '6+9')

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 2, sign, Add' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 3, number, 9' })).toBeInTheDocument()
    })

    // The cell grammar, which is what the board writes now. The rungs and locks ride in the same
    // string as the squares, so a returning player's ladder cannot get out of step with their board.
    it('restores a board written in the cell grammar', () => {
      renderBoard(goFigurePuzzle, '0+1____|0|')

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 3, number, 9' })).toBeInTheDocument()
    })

    // Cleared with rungs spent. The squares are empty and the count is not, which is emphatically
    // not the same as an untouched board -- the player paid for those rungs.
    it('restores a cleared board without restoring anything into it', () => {
      renderBoard(goFigurePuzzle, '_______|2|')

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })

    it('restores which tiles were already spent', () => {
      renderBoard(goFigurePuzzle, '6+9')

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'true')
    })

    // A solved puzzle reopens showing its solution. Replay is emptying the board: solved
    // is one bit the shell already holds, so nothing is lost by letting the board move.
    it('reopens a solved puzzle in its solved state', () => {
      renderBoard(goFigurePuzzle, '6+9+7*7')

      expect(screen.getByText('Solved. 6 + 9 + 7 × 7 = 154')).toBeInTheDocument()
    })

    it('does not re-report a puzzle the shell already recorded as solved', () => {
      renderBoard(goFigurePuzzle, '6+9+7*7')

      expect(onSolved).not.toHaveBeenCalled()
    })

    // Progress outlives nothing here -- the pack it belongs to could have been pruned
    // and refetched, and a regenerated puzzle keeps neither bank nor id. An expression
    // the bank cannot pay for is dropped rather than rendered as a board in a state its
    // own buttons could not have produced.
    it('ignores progress the bank cannot pay for', () => {
      renderBoard(goFigurePuzzle, '8+3')

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })

    it('ignores progress that spends a duplicate more often than the bank holds it', () => {
      renderBoard(goFigurePuzzle, '7+7+7')

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })

    // Two digits in a row read as one two-digit number, which no accepted solution ever
    // contains and no sequence of taps on this board could have produced.
    it('ignores progress with two digits in a row', () => {
      renderBoard(goFigurePuzzle, '67')

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })

    it('ignores progress using a sign this puzzle does not offer', () => {
      const noDivision: Puzzle<GoFigureData> = {
        ...goFigurePuzzle,
        data: { ...goFigurePuzzle.data, operators: ['+', '-', '*'] },
      }
      renderBoard(noDivision, '6/9')

      expect(screen.getAllByRole('button', { name: /^Square \d, (number|sign), empty$/ })).toHaveLength(7)
    })
  })

  // The seven squares. The rail was a string that grew and shrank with the taps; these do not,
  // which is what lets a hint drop a sign into square 6 while squares 2 and 4 are still empty.
  describe('the squares', () => {
    it('offers seven squares', () => {
      renderBoard()

      expect(screen.getAllByRole('button', { name: /^Square/ })).toHaveLength(7)
    })

    it('names what a square holds', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    it('says so when a square is empty', () => {
      renderBoard()

      expect(screen.getByRole('button', { name: 'Square 2, sign, empty' })).toBeInTheDocument()
    })

    // Named, never symbolic: a screen reader reads "×" as "times" at best and as nothing at worst,
    // and the square is the one place the pack's own ASCII would otherwise leak into speech.
    it('names the sign a square holds rather than showing only its symbol', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Multiply'])

      expect(screen.getByRole('button', { name: 'Square 2, sign, Multiply' })).toBeInTheDocument()
    })

    it('marks the square the caret is on', () => {
      renderBoard()

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 1, number, empty')
    })

    it('moves the caret to a tapped square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 3, number, empty' }))
      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { name: 'Square 3, number, 6' })).toBeInTheDocument()
    })

    it('moves the caret on after a write', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 2, sign, empty')
    })

    // The caret looks for the next EMPTY square and wraps past the end, so a board filled out of
    // order does not strand the player at square 7 with square 1 still blank.
    it('wraps the caret past the last square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 7, number, empty' }))
      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 1, number, empty')
    })

    it('writes over a square that already holds something', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await tap(user, 'Use 9')

      expect(screen.getByRole('button', { name: 'Square 1, number, 9' })).toBeInTheDocument()
    })

    // UNDO PUTS BACK, it does not clear. On the old rail a tile could only be appended, so popping
    // the stack and emptying the square were the same operation; squares can be written over, and
    // then they are not. A cleared square here is a state the player never saw and cannot explain.
    it('gives a square back the value a write took over', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await tap(user, 'Use 9')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    // The bank half of the same fix. Undoing an overwrite has to re-spend the tile it puts back and
    // free the one it takes away -- and it has to name the right TILE, not the right digit, which is
    // why the history stores a bank index.
    it('re-spends the tile it puts back after undoing an overwrite', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await tap(user, 'Use 9')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getByRole('button', { name: 'Use 6, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'Use 9, tile 2 of 4' })).toHaveAttribute('aria-disabled', 'false')
    })

    it('gives a square back the sign a write took over', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])
      await user.click(screen.getByRole('button', { name: 'Square 2, sign, Add' }))
      await tap(user, 'Multiply')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getByRole('button', { name: 'Square 2, sign, Add' })).toBeInTheDocument()
    })

    // A duplicated bank is where clearing and restoring part company most visibly: both 7s write the
    // same character, so an Undo that rebuilt the square from the digit could hand back either tile.
    it('gives back the exact tile a write took over when the bank repeats a digit', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Use 7, tile 4 of 4' }))
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 7' }))
      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getByRole('button', { name: 'Use 7, tile 4 of 4' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'Use 7, tile 3 of 4' })).toHaveAttribute('aria-disabled', 'false')
    })

    it('returns the tile a write took over to the bank', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await tap(user, 'Use 9')
      // Back onto a number square, because the caret's KIND is what decides whether the bank is
      // tappable at all -- and after a write it has moved on to a sign square.
      await user.click(screen.getByRole('button', { name: 'Square 3, number, empty' }))

      expect(screen.getByRole('button', { name: 'Use 6, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'false')
    })

    it('refuses the signs while the caret is on a number square', () => {
      renderBoard()

      expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('refuses the numbers while the caret is on a sign square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { name: 'Use 9, tile 2 of 4' })).toHaveAttribute('aria-disabled', 'true')
    })

    // A bank of 6,9,7,7 has two tiles that write "7", so the square has to remember the tile the
    // player touched rather than the character it drew. Deriving it by first unspent match dimmed
    // tile 3 when tile 4 was tapped: the tile under the finger stayed bright and one across the row
    // went dark. This is that bug's test, and it is why progress stores bank indices.
    it('spends the tile that was tapped when the bank repeats a digit', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Use 7, tile 4 of 4' }))
      await tap(user, 'Add')

      expect(screen.getByRole('button', { name: 'Use 7, tile 4 of 4' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'Use 7, tile 3 of 4' })).toHaveAttribute('aria-disabled', 'false')
    })
  })

  // The ladder, driven from the board rather than from storage. goFigure's rungs DO something to the
  // squares, so the opened count rides in the progress string beside the locks it produced -- which
  // is why the control is handed `control={{ onOpen, opened }}` and reads nothing of its own.
  describe('the hint control', () => {
    const HINT_1 = 'Open hint 1 of 3'

    const openRung = async (user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> => {
      await user.click(screen.getByRole('button', { name }))
    }

    // THE RUNG-VERSUS-SLOT TEST, and the only one in this file that can tell the two apart on a
    // single press. lull-api orders rungs by how much each reveals, so this fixture's difficulty-4
    // ladder runs slots 1, 0, 2 -- rung 0 names slot 1, which is SQUARE 4.
    //
    // An implementation that treated the rung index as the slot index puts this "+" in square 2 and
    // still passes every other test here: the ladder covers all three slots, so after three presses
    // the board looks identical either way, and the fixture's operators (+, +, ×) happen to make two
    // of the three placements agree. Only the first press, checked against the square it must NOT
    // land in, discriminates.
    // A rung writes at its OWN slot, which is almost never the square the player is standing on, so
    // the caret has no business moving. It used to: the advance was computed from `cursor` as though
    // the rung had been a write at the caret, which walked the player off square 1 and onto square 2
    // -- a sign square -- so every number tile went unavailable and their next tap did nothing. In
    // silence, because the total had not moved either.
    it('leaves the caret where the player put it when a rung fills some other square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 1, number, empty')
    })

    // And the tray has to agree with it, which is the half a caret assertion alone would miss: the
    // failure the player actually met was a dead tile, not a moved ring.
    it('keeps the number tiles live when a rung fills some other square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Use 6, tile 1 of 4' }))

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    it("places the rung's sign in the square that rung names, not the square its position suggests", async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 2, sign, empty' })).toBeInTheDocument()
    })

    it('locks the square it filled', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)

      expect(screen.getAllByRole('button', { name: /from a hint$/ })).toHaveLength(1)
    })

    // Three rungs, three slots. It pins the COUNT and nothing more, which is worth stating because
    // the comment here used to claim it also pinned the fixture's permutation: it cannot. The ladder
    // covers all three slots and its operators are +, + and ×, so a board built by rung index and a
    // board built by slot index are the same board once every rung is open. The two discriminators
    // in this file are the single-press test above and the progress string further down.
    it('locks three squares once every rung is open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)
      await openRung(user, 'Open hint 2 of 3')
      await openRung(user, 'Open hint 3 of 3')

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 2, sign, Add, from a hint' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 6, sign, Multiply, from a hint' })).toBeInTheDocument()
    })

    // THE ANSWER, offered once every rung is spent, and text-only: it goes in the sheet and never
    // onto the squares. Filling the board would be this component deciding a puzzle was over, and
    // this component decides nothing -- a set lookup against the shipped expressions is the only
    // thing that ends a goFigure.
    describe('the answer', () => {
      const spendTheLadder = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
        await openRung(user, HINT_1)
        await openRung(user, 'Open hint 2 of 3')
        await openRung(user, 'Open hint 3 of 3')
      }

      it('offers the answer once every rung is spent', async () => {
        const user = userEvent.setup({ delay: null })
        renderBoard()

        await spendTheLadder(user)

        expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument()
      })

      // Drawn for READING, with spaces and ×, like the solved banner and unlike the squares. The
      // squares carry the pack's own characters because that is the string the player is building
      // and the string acceptedSolutions is matched on; a sentence is not that string.
      it('draws the answer for reading rather than in the pack characters', async () => {
        const user = userEvent.setup({ delay: null })
        renderBoard()
        await spendTheLadder(user)

        await user.click(screen.getByRole('button', { name: 'Show answer' }))

        expect(screen.getByText('One winning answer is 6 + 7 + 9 × 7.')).toBeInTheDocument()
      })

      // HEDGED, and the hedge is true rather than modest. The ladder pins an operator TUPLE -- this
      // fixture's six accepted solutions all share "++*" -- so naming one of them "the answer" would
      // assert a uniqueness the pack does not have.
      it('agrees with the signs the ladder locked onto the board', async () => {
        const user = userEvent.setup({ delay: null })
        renderBoard()
        await spendTheLadder(user)

        await user.click(screen.getByRole('button', { name: 'Show answer' }))

        expect(screen.getByRole('button', { name: 'Square 2, sign, Add, from a hint' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Square 6, sign, Multiply, from a hint' })).toBeInTheDocument()
      })

      // TEXT ONLY. The squares the player has not filled stay empty, because revealing an answer is
      // not solving a puzzle -- the board never reports a solve it did not evaluate.
      it('puts nothing on the squares and reports no solve', async () => {
        const user = userEvent.setup({ delay: null })
        renderBoard()
        await spendTheLadder(user)

        await user.click(screen.getByRole('button', { name: 'Show answer' }))

        expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toBeInTheDocument()
        expect(onSolved).not.toHaveBeenCalled()
      })

      // ONE PAST THE LADDER, in the progress string the rungs already ride in. That is what makes the
      // reveal survive a reload without a second store to keep in step with this one -- and what makes
      // Play again take it back, since Play again writes ''.
      it('stores the reveal beside the rungs it was paid for', async () => {
        const user = userEvent.setup({ delay: null })
        renderBoard()
        await spendTheLadder(user)

        await user.click(screen.getByRole('button', { name: 'Show answer' }))

        expect(onProgress).toHaveBeenLastCalledWith('_+_+_*_|4|012')
      })

      it('offers the answer back to a player who reloads on it', async () => {
        const user = userEvent.setup({ delay: null })
        renderBoard(goFigurePuzzle, '_+_+_*_|4|012')

        await user.click(screen.getByRole('button', { name: 'Show answer' }))

        expect(screen.getByText('One winning answer is 6 + 7 + 9 × 7.')).toBeInTheDocument()
      })

      // The pack whose accepted set spans two tuples -- 1*2*3*4 and 1+2+3*4 both reach 24 -- is the
      // case this whole derivation exists for. The revealed answer must carry the tuple the LADDER
      // named, or it contradicts the signs sitting locked on the board.
      it('reveals the tuple the ladder named rather than the first solution shipped', async () => {
        const user = userEvent.setup({ delay: null })
        const twoTuples: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: {
            ...goFigurePuzzle.data,
            acceptedSolutions: ['6*7*9*7', '6+7+9*7'],
          },
        }
        renderBoard(twoTuples)

        await spendTheLadder(user)
        await user.click(screen.getByRole('button', { name: 'Show answer' }))

        expect(screen.getByText('One winning answer is 6 + 7 + 9 × 7.')).toBeInTheDocument()
      })

      // No answer to give, so the ladder ends where it always did. A control that renamed itself and
      // then showed nothing is worse than one that never made the offer.
      it('makes no offer when no shipped solution carries the ladder tuple', async () => {
        const user = userEvent.setup({ delay: null })
        const mismatched: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: { ...goFigurePuzzle.data, acceptedSolutions: ['6-7-9/7'] },
        }
        renderBoard(mismatched)

        await spendTheLadder(user)

        expect(screen.getByRole('button', { name: 'Hide hints' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument()
      })

      // Play again empties the board and zeroes the count, so the answer goes with the rungs. The
      // board holds no separate reveal flag to forget -- the count IS the reveal.
      it('takes the answer back when the player starts over', async () => {
        const user = userEvent.setup({ delay: null })
        // Tiles 0, 2, 1, 3 of the bank 6,9,7,7 spell 6+7+9*7, which is 154 left to right and one of
        // the six the fixture accepts -- so this board is solved, and Play again is the control on it.
        renderBoard(goFigurePuzzle, '0+2+1*3|4|012')
        await user.click(screen.getByRole('button', { name: 'Show answer' }))

        await user.click(screen.getByRole('button', { name: 'Play again' }))

        expect(screen.queryByText('One winning answer is 6 + 7 + 9 × 7.')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
      })
    })

    // A rung overwrites whatever was in its slot. It can afford to: every rung names an operator
    // drawn from a canonical accepted tuple, so a locked sign is always part of some winning answer
    // and nobody is stranded by the permanence.
    it('overwrites a sign the player put there', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 4, sign, empty' }))
      await tap(user, 'Subtract')
      await openRung(user, HINT_1)

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
    })

    it('refuses a sign in the square it filled, and says why', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)
      await user.click(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' }))

      expect(screen.getByRole('button', { name: 'Subtract' })).toHaveAttribute('aria-disabled', 'true')
      expect(said('That sign came from a hint.')).toBeInTheDocument()
    })

    // The sheet's live region reads the rung out and the square carries the lock in its own name, so
    // a floor message would be the third telling of one event. This asserts the specific sentence a
    // careless implementation would reach for -- the locked-square copy, which belongs to the tap
    // that is refused and not to the press that placed the sign.
    it('says nothing in the floor when a rung lands', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)

      expect(screen.queryByText('That sign came from a hint.', withoutMark)).not.toBeInTheDocument()
    })

    // A RUNG THAT MOVES THE TOTAL MOVES IT OUT LOUD, and this is the one thing openHint does say.
    //
    // The "third telling" argument above covers the LOCK -- the sheet reads the rung out and the
    // square carries the lock in its own name -- and it does not reach the total. Nothing says that.
    // The rung's prose names the sign and never the number; the resting line is deliberately outside
    // the live region; and every other path that moves the total (`place`, `undo`, `backspace`)
    // announces it. So a rung that completes the prefix moved the one figure a screen-reader player
    // is here to watch, in silence.
    it('announces the total a rung moved', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, TOTAL_MOVER)

      // The first press only reopens the sheet on the rung already paid for -- see controlLabel --
      // so it is the second that spends rung 2, which names slot 0 and closes the gap at square 2.
      await openRung(user, 'Show 1 hint')
      await openRung(user, 'Open hint 2 of 3')

      expect(said('Running total: 15.')).toBeInTheDocument()
    })

    // And it stays silent otherwise, which is what keeps the sentence worth hearing. Rung 1 lands a
    // sign in square 4 of an empty board, where the prefix is still empty and no total exists to
    // move -- so the floor is left standing at its instruction rather than handed a sentence.
    it('says nothing when the rung cannot have moved the total', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
    })

    it('reports the locked slot as progress', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)

      expect(onProgress).toHaveBeenLastCalledWith('___+___|1|1')
    })

    // UNDO NEVER UNLOCKS. Undo history is component state that cannot survive a reload, so an Undo
    // that unlocked would make a hint irreversible after a refresh -- asymmetrically, by accident
    // rather than by design. The press finds an empty history, because a rung never enters it.
    it('does not let Undo take a rung back', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
      expect(said('Nothing to undo.')).toBeInTheDocument()
    })

    // Clear IS the way out, and it takes the lock without taking the knowledge: the control goes on
    // to offer rung 2, not rung 1. The sheet is open here because the live flow opens it on every
    // press, which is what makes the label the ladder's rather than the sheet's.
    it('lets Clear unlock the square while the rung stays open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)
      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(screen.getByRole('button', { name: 'Square 4, sign, empty' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
    })

    it('lets the player fill a square Clear unlocked', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)
      await user.click(screen.getByRole('button', { name: CLEAR }))
      await user.click(screen.getByRole('button', { name: 'Square 4, sign, empty' }))
      await tap(user, 'Subtract')

      expect(screen.getByRole('button', { name: 'Square 4, sign, Subtract' })).toBeInTheDocument()
    })

    // A remount is a reload, and the ladder has to come back with the board because the two ride in
    // one string. The control reads SHOW rather than OPEN here, and that is the sheet talking rather
    // than the ladder: the sheet comes back shut, so the press offers the rungs already paid for
    // before it offers the next one. A returning player is never charged a hint to re-read one.
    it('restores the locks and the ladder together', () => {
      const { unmount } = renderBoard(goFigurePuzzle, HINTED)
      unmount()
      renderBoard(goFigurePuzzle, HINTED)

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toBeInTheDocument()
    })

    it('shows the rung text once the sheet is open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)

      expect(screen.getByText('The 2nd operator from the left is "+".')).toBeInTheDocument()
    })

    // The sheet is drawn OVER the board, so a player who cannot see it has only two things telling
    // them where they are: the sheet's own name, and the control saying it is the thing that opened
    // it. Both, or the board acquires an unnamed slab of text in the middle of it and a button whose
    // press appears to do nothing. The shut half is pinned by "reports the sheet shut before it is
    // opened" over in the tray tests; this is the other half of that pair.
    it('names the sheet it draws over the board, and says the control opened it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await openRung(user, HINT_1)

      expect(screen.getByRole('region', { name: 'Open hints' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toHaveAttribute('aria-expanded', 'true')
    })

    // A pack cached before rungs became { text, metadata } -- they were bare strings on the wire,
    // and `isValidPuzzle` leaves `data` opaque, so such a pack is VALID and arrives intact. The cast
    // is the point of the fixture: the declared type promises metadata and the stored pack is what
    // breaks the promise.
    //
    // Array.isArray waves it through, so without a check of its own the control would count three
    // rungs, offer "Open hint 1 of 3", and destructure undefined on the first press -- taking the
    // page down from inside a click handler, with the storage self-heal never firing because the
    // pack really is valid.
    describe('a pack whose rungs cannot place anything', () => {
      const legacyLadder: Puzzle<GoFigureData> = {
        ...goFigurePuzzle,
        data: {
          ...goFigurePuzzle.data,
          hints: ['A hint.', 'Another hint.', 'A third hint.'] as unknown as GoFigureHintLadder,
        },
      }

      it('offers no hint control at all', () => {
        renderBoard(legacyLadder)

        expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
      })

      it('leaves the board playable by hand', async () => {
        const user = userEvent.setup({ delay: null })
        renderBoard(legacyLadder)

        await tapAll(user, ['Use 6', 'Add', 'Use 9'])

        expect(screen.getByRole('button', { name: 'Square 3, number, 9' })).toBeInTheDocument()
      })

      // A PACK WITH NO `hints` FIELD AT ALL, which is the shape this guard exists for. `isValidPuzzle`
      // deliberately leaves `data` opaque, so a pack cached before the hints deploy is a VALID pack
      // that arrives with `hints` undefined -- and `hints.every(...)` on it throws in render, with no
      // error boundary between here and the root. `decode` guards the identical case and degrades to
      // an empty board; this one has to degrade the same way rather than take the page down.
      it('renders a playable board for a pack with no ladder at all', async () => {
        const user = userEvent.setup({ delay: null })
        const noLadder: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: { ...goFigurePuzzle.data, hints: undefined as unknown as GoFigureHintLadder },
        }
        renderBoard(noLadder)

        await tap(user, 'Use 6')

        expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
      })

      // `[].every()` is `true`, so an empty ladder passed the old guard and put a lone "Hide hints"
      // control on the tray that opened an empty sheet.
      it('offers no hint control for an empty ladder', () => {
        const emptyLadder: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: { ...goFigurePuzzle.data, hints: [] as unknown as GoFigureHintLadder },
        }
        renderBoard(emptyLadder)

        expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
      })

      // `typeof null === 'object'`, so a null metadata satisfied the old check and the first press
      // destructured it -- word for word the failure the guard's own comment claims to prevent.
      it('offers no hint control for a rung whose metadata is null', () => {
        const nullMetadata: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: {
            ...goFigurePuzzle.data,
            hints: [{ metadata: null, text: 'A hint.' }] as unknown as GoFigureHintLadder,
          },
        }
        renderBoard(nullMetadata)

        expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
      })

      // Structural is not enough on its own: `applyHint` reads `slot` and `operator`, and a metadata
      // holding neither charges the player a rung and places nothing.
      it('offers no hint control for a rung whose metadata names no slot', () => {
        const emptyMetadata: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: {
            ...goFigurePuzzle.data,
            hints: [{ metadata: {}, text: 'A hint.' }] as unknown as GoFigureHintLadder,
          },
        }
        renderBoard(emptyMetadata)

        expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
      })

      it('offers no hint control for a rung naming a slot this board has no square for', () => {
        const wildSlot: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: {
            ...goFigurePuzzle.data,
            hints: [{ metadata: { operator: '+', slot: 9 }, text: 'A hint.' }] as unknown as GoFigureHintLadder,
          },
        }
        renderBoard(wildSlot)

        expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
      })

      it('offers no hint control for a rung naming a sign this puzzle does not offer', () => {
        const wildOperator: Puzzle<GoFigureData> = {
          ...goFigurePuzzle,
          data: {
            ...goFigurePuzzle.data,
            hints: [{ metadata: { operator: '/', slot: 0 }, text: 'A hint.' }] as unknown as GoFigureHintLadder,
            operators: ['+', '-', '*'],
          },
        }
        renderBoard(wildOperator)

        expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument()
      })
    })
  })

  // WHAT A WRITE SAYS OUT LOUD, and the board has to say it because nothing else does. The square's
  // value lives in an aria-hidden span and its meaning in an aria-label, and neither reaches a live
  // region -- hidden content is excluded, and an attribute change on a node already in the tree is
  // not a content change a screen reader announces. Focus does not cover it either: the press keeps
  // focus on the tile, deliberately, so the square never speaks its own name.
  describe('announcing a write', () => {
    it('names the square a number landed in and where the caret went', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')

      expect(said('Square 1 is 6. Running total: 6. Now on square 2, a sign.')).toBeInTheDocument()
    })

    // The half that would otherwise be silent. Placing an operator does not move the running total
    // -- a trailing sign is dropped by design -- so without this sentence every second press of a
    // playthrough announces nothing at all.
    //
    // AND IT DOES NOT CARRY THE TOTAL, for the same reason it needs a sentence at all: the total did
    // not move. A clause repeating a number the press could not have changed was about 40% of a long
    // `role="status"` on roughly half of every playthrough, carrying nothing new -- which is how a
    // live region teaches a player to stop listening to it.
    it('names the sign a square took, spoken rather than symbolic', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Multiply'])

      expect(said('Square 2 is Multiply. Now on square 3, a number.')).toBeInTheDocument()
    })

    // The other half of the same rule, and the one that proves the gate is on the NUMBER rather than
    // on the kind of square: undoing an operator leaves the total exactly where it was, so the
    // sentence drops it there too.
    it('leaves the total out of an Undo that cannot have moved it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(said('Square 2 is empty. Now on square 2, a sign.')).toBeInTheDocument()
    })

    // A sign in square 4 with square 1 empty leaves the prefix empty, so there is no total to name
    // and the sentence simply does not carry one.
    it('names the square the caret skipped to past a locked one', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 3, number, empty' }))
      await tap(user, 'Use 6')

      expect(said('Square 3 is 6. Now on square 5, a number.')).toBeInTheDocument()
    })

    // UNDO AND CLEAR USED TO SUCCEED IN SILENCE, announcing only their refusals. Both change the
    // board and both keep focus on the control that was pressed -- deliberately -- so no square ever
    // speaks the change, and the resting total is standing text that is never announced. Without a
    // sentence here a screen-reader player pressed Undo and got nothing back at all, which is
    // indistinguishable from a control that did not work.
    it('says what Undo emptied', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(said('Square 1 is empty. Now on square 1, a number.')).toBeInTheDocument()
    })

    // Undo PUTS BACK rather than clearing, so on an overwrite the sentence has to name what came
    // back and not what went away.
    it('says what Undo put back after an overwrite', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await tap(user, 'Use 9')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(said('Square 1 is 6. Running total: 6. Now on square 1, a number.')).toBeInTheDocument()
    })

    it('says so when Clear empties the board', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])
      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(said('Every square is empty. Now on square 1, a number.')).toBeInTheDocument()
    })

    // Clear takes the locks and keeps the rungs, and nothing on screen said so before or after the
    // press. The sentence is the only place a player learns that the thing they paid for survived an
    // irreversible-looking press -- so it is said only when there is something to reassure them
    // about, rather than on every Clear of a board that never had a hint.
    it('says the hints survived a Clear that took a lock away', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: CLEAR }))

      expect(
        said('Every square is empty. Your hints are still in the sheet. Now on square 1, a number.'),
      ).toBeInTheDocument()
    })

    // Play again is the one that DOES take the ladder, so it says the opposite of what Clear says.
    //
    // "LOCKED AGAIN", NOT "SHUT". The sentence used to read "Every square is empty and the hints are
    // shut", which was false twice over: the sheet was still open at that moment (nothing shut it),
    // and shutting is not what happened to the ladder anyway. Play again RESETS it -- the rungs the
    // player paid for have to be paid for again -- and that is the fact the press owes them.
    it('says so when Play again starts the board over', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(said('Every square is empty. Your hints are locked again. Now on square 1, a number.')).toBeInTheDocument()
    })

    // GATED, exactly as Clear's reassurance is. A player who solved without ever opening a rung has
    // not met the ladder, and naming it here would introduce a thing they have to go and find out
    // about at the one moment they are being told the board is clean.
    it('names no hints when Play again starts over a board that never spent one', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, '6+9+7*7')

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(said('Every square is empty. Now on square 1, a number.')).toBeInTheDocument()
    })

    // The write that FILLS the board says nothing, because the outcome is the news. `message` reads
    // the notice first, so a placement sentence here would mask the solved banner and the
    // wrong-answer arithmetic -- the two lines the whole floor exists for.
    it('gives the last square to the solved banner rather than to a placement', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, SOLUTION)

      expect(screen.getByText('Solved. 6 + 9 + 7 × 7 = 154')).toBeInTheDocument()
      expect(screen.queryByText(/^Square 7 is/)).not.toBeInTheDocument()
    })

    // THE BAR STAYS UP AFTER A WIN ON PURPOSE -- the ladder is worth reading once you have built the
    // answer -- so pressing it there has to be safe. It was not: `applyHint` ran against the winning
    // board, and on a pack whose accepted solutions span two operator tuples the rung overwrites a
    // slot the player filled differently. The expression stops matching, the banner goes, Play again
    // reverts to Undo, and the slot is locked, so Undo cannot take it back by design. A control
    // labeled "hint" deleted a finished puzzle with no warning.
    it('reveals a rung on a solved board without touching the squares', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      // The sheet is shut at mount, so the first press only reopens the rung already paid for.
      await user.click(screen.getByRole('button', { name: 'Show 1 hint' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))

      expect(screen.getByText('Solved. 6 + 9 + 7 × 7 = 154')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
    })

    it('still spends the rung it revealed on a solved board', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED_HINTED)

      await user.click(screen.getByRole('button', { name: 'Show 1 hint' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))

      expect(screen.getByRole('button', { name: 'Open hint 3 of 3' })).toBeInTheDocument()
    })

    // A rung can be the press that wins, and the floor has to yield to the banner for it exactly as
    // it does for a tile. The board is one sign short of 154 and the third rung supplies it.
    it('gives the winning square to the solved banner when a rung is what finished it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, '0+1+2_3|2|01')

      await user.click(screen.getByRole('button', { name: 'Show 2 hints' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))

      expect(screen.getByText('Solved. 6 + 9 + 7 × 7 = 154')).toBeInTheDocument()
      expect(screen.queryByText(/Running total/)).not.toBeInTheDocument()
    })

    // Nothing on a solved board can clear a notice -- the cells and both tile rows are gated on
    // !isSolved, the key handler returns, and Undo has become Play again -- so a notice written here
    // would stand in front of the banner permanently rather than briefly.
    it('does not let a rung bury the banner it just earned', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, '0+1+2_3|2|01')

      await user.click(screen.getByRole('button', { name: 'Show 2 hints' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 3 of 3' }))
      // The sheet's OWN dismissal, not the bar's control. Spending the last rung used to turn that
      // control into "Hide hints"; it now offers the answer instead, and this test is about the
      // banner surviving a dismissal rather than about which button performs one. The sheet has
      // carried its own Hide since a touch player could otherwise only leave by spending rungs.
      await user.click(screen.getByRole('button', { name: 'Hide' }))

      expect(screen.getByText('Solved. 6 + 9 + 7 × 7 = 154')).toBeInTheDocument()
    })

    it('gives the last square to the wrong-answer line rather than to a placement', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])

      expect(screen.getByText('That makes 29, not 154. Undo the last tile and try again.')).toBeInTheDocument()
    })

    // THE REPEAT. A ribbon handed the same sentence twice running renders an identical text node,
    // React touches nothing, and the second press is silent -- so the board carries a counter and a
    // zero-width mark to make the change visible to the DOM. Two locked squares is the cheapest way
    // to send one sentence twice in a row, and it only became reachable when two rungs could open.
    //
    // The assertion is on the RAW text, deliberately: the helper that strips the mark everywhere
    // else would hide the very thing under test.
    it('says a repeated sentence in a way the DOM can see', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 2 of 3' }))
      await user.click(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' }))
      const first = said('That sign came from a hint.').textContent
      await user.click(screen.getByRole('button', { name: 'Square 2, sign, Add, from a hint' }))

      expect(said('That sign came from a hint.').textContent).not.toEqual(first)
    })
  })

  // Reached through restored progress as well as through the control above, and the board has to
  // render and refuse a locked square either way.
  describe('a square a hint filled', () => {
    it('says where the sign came from', () => {
      renderBoard(goFigurePuzzle, HINTED)

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
    })

    // FORM AND TEXT, NEVER COLOR ALONE (WCAG 1.4.1) -- so the lock is drawn as a mark AND said in
    // the square's name. Which is exactly why the mark has to be hidden: the name already carries
    // "from a hint", and a mark left in the tree would have a reader say the square is hinted twice
    // in one breath. The test above pins the half a reader hears; this pins the half it must not.
    it('keeps the mark it paints out of the square it names', () => {
      renderBoard(goFigurePuzzle, HINTED)

      expect(screen.getByText('Hint')).toHaveAttribute('aria-hidden', 'true')
    })

    // The caret lands on a locked square like any other, and it is still the ONLY square carrying
    // the caret when it gets there -- `getByRole` throws on a second match, so the singular query is
    // the assertion. A locked square is not disabled, so this is a real destination rather than one
    // the row skips: tapping it is how a player finds out why the square will not take a sign.
    it('takes the caret, and leaves the row with one caret still', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' }))

      expect(screen.getByRole('button', { current: true })).toHaveAttribute(
        'aria-label',
        'Square 4, sign, Add, from a hint',
      )
    })

    it('says so when the player taps it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' }))

      expect(said('That sign came from a hint.')).toBeInTheDocument()
    })

    // Both rows, not one. Gated on kind alone, parking the caret on a locked square leaves the sign
    // tiles announcing themselves as available while every tap is refused -- a control lying about
    // its own state.
    it('refuses both tile rows while the caret sits on it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' }))

      expect(screen.getByRole('button', { name: 'Subtract' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'Use 6, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('is skipped when the caret moves on', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 3, number, empty' }))
      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 5, number, empty')
    })

    // UNDO SKIPS A LOCKED SQUARE, it does not spend a press on one. A rung overwrites whatever the
    // player had put in its slot, which leaves a history entry pointing at a square `write` and
    // `clearCell` both now refuse -- so an Undo that popped it blindly returned the board unchanged,
    // parked the caret ON the locked square (which then gated both tile rows), said nothing at all,
    // and consumed the entry, so the player's real last move cost a second press to reach.
    it('steps over a history entry a rung has since locked', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 4, sign, empty' }))
      await tap(user, 'Subtract')
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
    })

    it('says there is nothing to undo when every move left is under a lock', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 4, sign, empty' }))
      await tap(user, 'Subtract')
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(said('Nothing to undo.')).toBeInTheDocument()
    })
  })

  // WCAG 2.1.1. The roving tabIndex gives the row exactly one tab stop, which is what keeps the
  // board band from standing between the goal and the tray -- and until this handler existed it also
  // meant six of the seven squares were pointer-operable and keyboard-inoperable, with no way for a
  // keyboard player to reach square 3 and correct it.
  //
  // The guards are copied from cryptogram's handler because they are the reason it works, and one of
  // them is sharpened here: on that bench the hint sheet sits beside the instrument, and on this one
  // it sits INSIDE it -- so "on the bench" is not a tight enough scope and the handler declines every
  // key while the sheet is open.
  describe('the keyboard', () => {
    const noDivision: Puzzle<GoFigureData> = {
      ...goFigurePuzzle,
      data: { ...goFigurePuzzle.data, operators: ['+', '-', '*'] },
    }

    it('moves the caret right', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 2, sign, empty')
    })

    it('moves the caret left', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 3, number, empty' }))
      await user.keyboard('{ArrowLeft}')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 2, sign, empty')
    })

    it('carries focus with the caret', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { name: 'Square 2, sign, empty' })).toHaveFocus()
    })

    // The row does not wrap under the arrows, unlike the caret's own advance after a write: an arrow
    // is a request for the neighbor, and a neighbor that turns out to be the far end of the row is
    // a surprise rather than a convenience.
    it('says there is no square past the left edge', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('{ArrowLeft}')

      expect(said(`No square that way. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    it('says there is no square past the right edge', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 7, number, empty' }))
      await user.keyboard('{ArrowRight}')

      expect(said(`No square that way. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    // Locked squares are skipped forever, exactly as the caret's advance after a write skips them.
    // Square 4 is the slot rung 0 of this fixture names.
    it('steps past a square a hint filled', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 3, number, empty' }))
      await user.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 5, number, empty')
    })

    // BOTH DIRECTIONS, because `step` walks a loop and a loop has two ends. Rightward alone leaves
    // the negative delta untested: an implementation that added the delta once and then scanned
    // forward, or that clamped at 0 before the lock check, passes the test above and strands a
    // keyboard player who tries to walk back past a rung.
    it('steps back past a square a hint filled', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 5, number, empty' }))
      await user.keyboard('{ArrowLeft}')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 3, number, empty')
    })

    // THE SWALLOWED ARROW. `skipFocus` is armed by every write and cleared only by a caret move, and
    // a write whose advance lands nowhere -- the write that FILLS the board -- leaves the flag
    // standing. The arrow after it is the first press that would move the caret, so an arrow routed
    // around `moveCursor` finds the flag still set and spends it: the caret moves and focus does not
    // follow, stranding a keyboard player on the tile they last pressed.
    it('follows the caret with focus on the arrow after a board-filling write', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      // Filled but not solved, so the squares stay live: a solved board refuses every key.
      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])
      await user.keyboard('{ArrowLeft}')

      expect(screen.getByRole('button', { name: 'Square 6, sign, Add' })).toHaveFocus()
    })

    // A KEYSTROKE IS NOT A TRAY PRESS, and the difference is which element keeps focus. A tray press
    // deliberately holds focus on the tile so a keyboard player does not tab back down through the
    // whole tray for each of seven squares. A keystroke has focus on the board already, so focus
    // follows the caret -- and the landing square then speaks its own name, which is why the ribbon
    // sentence for a typed write drops the "Now on square N" tail a tapped one carries.
    it('carries focus onto the square the caret advanced to', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('6')

      expect(screen.getByRole('button', { name: 'Square 2, sign, empty' })).toHaveFocus()
      expect(said('Square 1 is 6. Running total: 6.')).toBeInTheDocument()
    })

    it('writes a digit the bank holds', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('6')

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    // The tile, not the digit. A bank of 6,9,7,7 has two tiles that write "7", so typing 7 twice has
    // to spend both rather than refusing the second.
    it('spends a second tile showing the same digit', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('7+7')

      expect(screen.getByRole('button', { name: 'Use 7, tile 3 of 4' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'Use 7, tile 4 of 4' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('refuses a digit the bank does not hold', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('8')

      expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toBeInTheDocument()
      expect(said(`No 8 in your tiles. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    it('refuses a digit whose every tile is already spent', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('6+9+6')

      expect(said('No 6 in your tiles.')).toBeInTheDocument()
    })

    it('refuses a digit on a sign square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 2, sign, empty' }))
      await user.keyboard('6')

      expect(screen.getByRole('button', { name: 'Square 2, sign, empty' })).toBeInTheDocument()
      expect(said(`That square takes a sign. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    it('writes a sign on a sign square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 2, sign, empty' }))
      await user.keyboard('*')

      expect(screen.getByRole('button', { name: 'Square 2, sign, Multiply' })).toBeInTheDocument()
    })

    it('refuses a sign on a number square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('+')

      expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toBeInTheDocument()
      expect(said(`That square takes a number. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    // WHICH SIGNS EXIST IS THE PACK'S CALL, not this file's. A key for a sign the tray does not draw
    // has to be refused, or the keyboard would reach a board state no tap could produce and `decode`
    // would drop the whole thing on the next load.
    it('refuses a sign this puzzle does not offer', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(noDivision)

      await user.click(screen.getByRole('button', { name: 'Square 2, sign, empty' }))
      await user.keyboard('/')

      expect(screen.getByRole('button', { name: 'Square 2, sign, empty' })).toBeInTheDocument()
      expect(said(`This puzzle has no Divide sign. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    it('refuses a sign a hint put there', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' }))
      await user.keyboard('*')

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
      expect(said('That sign came from a hint.')).toBeInTheDocument()
    })

    it('clears the square under the caret with Backspace', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await user.keyboard('{Backspace}')

      expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toBeInTheDocument()
    })

    it('returns the tile Backspace took off to the bank', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await user.keyboard('{Backspace}')

      expect(screen.getByRole('button', { name: 'Use 6, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'false')
    })

    // Backspace is a player move like any other, so Undo has to be able to take it back -- otherwise
    // the one edit that only the keyboard can make is the one edit with no way back.
    it('lets Undo take back a Backspace', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await user.keyboard('{Backspace}')
      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    it('says the locked sentence for Backspace on a square a hint filled', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, HINTED)

      await user.click(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' }))
      await user.keyboard('{Backspace}')

      expect(screen.getByRole('button', { name: 'Square 4, sign, Add, from a hint' })).toBeInTheDocument()
      expect(said('That sign came from a hint.')).toBeInTheDocument()
    })

    it('says so when Backspace has nothing to take off', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('{Backspace}')

      expect(said(`That square is already empty. ${INSTRUCTION}`)).toBeInTheDocument()
    })

    // THE SHEET IS INSIDE THIS BENCH'S OWN INSTRUMENT, which is what makes cryptogram's "on the
    // bench" scope too loose to copy across. The sheet is `tabIndex={0}` precisely so a keyboard
    // player can scroll it, and an unscoped handler eats every arrow that would do the scrolling.
    it('declines an arrow while the hint sheet is open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      // The rung fills square 4 and leaves the caret alone, so square 1 is where a declined arrow
      // leaves it and square 2 is where an arrow this handler swallowed would have put it. That
      // premise is load-bearing for this test and it changed: the caret used to be walked on to
      // square 2 by the rung itself, which was the bug the two tests in the hint block now pin.
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 1, number, empty')
    })

    // The guard's own lookup, pinned at the join rather than through its effect. `sheetIsOpen` reads
    // the control's `aria-controls` and then asks the document for that id, so the whole guard rests
    // on an IDREF that HintBar owns and this file only follows.
    //
    // That reference is the one thing here no role query can defend. `aria-controls` contributes
    // nothing to an accessible name, so if the id stopped resolving every test above would keep
    // passing: the control still renders, the sheet still renders, the caret still moves. What would
    // change is that `sheetIsOpen` would read a broken bar as a shut one -- deliberately, so the
    // board stays playable -- and the guard would simply never fire again, handing the sheet's own
    // scroll arrows to the board for the rest of the session.
    it('finds the sheet at the other end of the control it follows', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))

      const control = screen.getByRole('button', { name: 'Open hint 2 of 3' })
      const id = control.getAttribute('aria-controls')

      expect(id).not.toBeNull()
      expect(document.getElementById(id ?? '')).toBeInTheDocument()
    })

    // AND IT SAYS NOTHING, which is the whole difference between an arrow and a writing key here.
    // The arrow was declined so the SHEET could have it -- that is what the guard is for -- so a
    // sentence about hiding the hints would be advice against the thing the player is doing.
    it('says nothing when it declines an arrow to the hint sheet', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.keyboard('{ArrowRight}')

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
      expect(screen.queryByText(HIDE_TO_TYPE, withoutMark)).not.toBeInTheDocument()
    })

    it('declines a digit while the hint sheet is open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.keyboard('6')

      expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toBeInTheDocument()
    })

    // THE ONLY SILENT REFUSAL ON THIS BENCH, until now. Every other decline speaks -- a digit the
    // bank cannot pay for, a sign the pack does not offer, a square a rung owns, an edge with no
    // square past it -- and a keyboard player who opened a rung and then typed got nothing back at
    // all, which is what a broken board feels like from the inside.
    it('says why a digit is declined while the hint sheet is open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.keyboard('6')

      expect(said(HIDE_TO_TYPE)).toBeInTheDocument()
    })

    it('says why a sign is declined while the hint sheet is open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 2, sign, empty' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.keyboard('*')

      expect(said(HIDE_TO_TYPE)).toBeInTheDocument()
    })

    it('says why Backspace is declined while the hint sheet is open', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, 6' }))
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.keyboard('{Backspace}')

      expect(said(HIDE_TO_TYPE)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    it('takes the keys back once the sheet is shut again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      // The sheet's own Hide control, not the bar's: with a rung open and the sheet showing, the bar
      // is already offering the NEXT rung rather than a way to shut what is open.
      await user.click(screen.getByRole('button', { name: 'Hide' }))
      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('6')

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    // ESCAPE IS THE EXIT A KEYBOARD PLAYER ACTUALLY USES, and it was the one exit no test covered:
    // the Hide control is a pointer target, and a player already typing has no reason to go looking
    // for it. It also exercises the half of `sheetIsOpen` that a pointer dismissal does not -- the
    // board never hears about Escape, HintBar handles it on its own frame, and the only way the
    // keys can come back is the board reading the sheet's real state off the DOM afterwards.
    it('takes the keys back once Escape shuts the sheet', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('6')

      expect(screen.getByRole('button', { name: 'Square 1, number, 6' })).toBeInTheDocument()
    })

    // A modified keypress belongs to the browser. Without this, every ⌘R and ⌃A is both swallowed
    // and read as a move -- the player loses the reload they asked for and a square they did not.
    it('declines a modified keypress', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('{Control>}6{/Control}')

      expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toBeInTheDocument()
    })

    // A solved board is finished, and the squares carry `aria-disabled` to say so. The keyboard has
    // to refuse what the pointer refuses, or a control would be lying about its own state.
    it('declines every key on a solved board', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, '6+9+7*7')

      await user.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { current: true })).toHaveAttribute('aria-label', 'Square 1, number, 6')
    })
  })

  describe('accessibility', () => {
    // ONE tab stop for the whole row of squares, not seven. A roving tabIndex is what keeps the
    // board band from standing between the goal and the tray; the arrow keys move between squares.
    it('spends a single Tab on the whole row of squares', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.tab()

      expect(screen.getByRole('button', { name: 'Square 1, number, empty' })).toHaveFocus()
    })

    it('reaches the first bank tile with the keyboard alone', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.tab()
      await user.tab()

      expect(screen.getAllByRole('button', { name: /^Use 6/ })[0]).toHaveFocus()
    })

    // Focus is never seized at mount. A board restored from a deep link would otherwise scroll the
    // page past its own heading before the player had asked for anything.
    it('leaves focus alone on a restored board', () => {
      renderBoard(goFigurePuzzle, '6+9')

      expect(document.body).toHaveFocus()
    })

    // Two bugs in one test. Tiles used to be `disabled`, and a browser blurs an element that
    // becomes disabled while focused -- so every tap dropped focus to <body> and the next Tab
    // restarted at the top of the document. An earlier version of the playthrough test below called
    // .focus() before each Enter, which is why it never noticed.
    //
    // The second is the caret. Every write advances it, and focus follows the caret, so without the
    // tray standing the focus effect down for that one move the press that spends a tile throws
    // focus up into the board band -- and the player tabs back down through the whole tray for each
    // of the seven squares, which is the traversal cost the first bug was fixed to avoid.
    it('keeps focus on a tile after activating it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.tab()
      await user.tab()
      const first = screen.getAllByRole('button', { name: /^Use 6/ })[0]
      expect(first).toHaveFocus()

      await user.keyboard('{Enter}')

      expect(first).toHaveAttribute('aria-disabled', 'true')
      expect(first).toHaveFocus()
    })

    // The control row has the same caret bug the tray does, and it is the one the skipFocus ref
    // exists for. Undo moves the caret back to the square it emptied, focus follows the caret, so
    // without the tray standing that effect down for one move the press lands the player on Square 1
    // -- off the control they were about to press again. The board is deliberately left with the
    // caret somewhere other than square 1 before the press, or the cursor would not move at all and
    // the test would pass against a component with no guard in it.
    it('keeps focus on Undo after it empties a square', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      const undo = screen.getByRole('button', { name: UNDO })
      undo.focus()
      await user.keyboard('{Enter}')

      expect(undo).toHaveFocus()
    })

    it('keeps focus on Clear after it empties the board', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      const clear = screen.getByRole('button', { name: CLEAR })
      clear.focus()
      await user.keyboard('{Enter}')

      expect(clear).toHaveFocus()
    })

    // The hint control has it worse than the other two: the press opens a sheet, so focus leaving
    // for a board square would strand the player outside the thing they just opened -- and the
    // control is what `aria-expanded` is on. The caret has been moved off square 1 first for the
    // same reason as above.
    it('keeps focus on the hint control after a rung lands', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tap(user, 'Use 6')
      const hint = screen.getByRole('button', { name: 'Open hint 1 of 3' })
      hint.focus()
      await user.keyboard('{Enter}')

      expect(hint).toHaveFocus()
    })

    it('plays through with the keyboard alone', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      // Tabs until the wanted control has focus, then activates it. No programmatic
      // .focus() anywhere: if a tap destroyed focus, the search would restart from the
      // document top and this would run out of tabs rather than quietly passing.
      const tabToAndPress = async (name: RegExp | string): Promise<void> => {
        const matches = (): boolean => {
          const active = document.activeElement
          const label = active?.getAttribute('aria-label') ?? ''
          const available = active?.getAttribute('aria-disabled') !== 'true'
          return available && (typeof name === 'string' ? label === name : name.test(label))
        }
        for (let step = 0; step < 40 && !matches(); step += 1) {
          await user.tab()
        }
        expect(matches()).toBe(true)
        await user.keyboard('{Enter}')
      }

      for (const name of [/^Use 6/, 'Add', /^Use 9/, 'Add', /^Use 7/, 'Multiply', /^Use 7/]) {
        await tabToAndPress(name)
      }

      expect(onSolved).toHaveBeenCalled()
    })

    // THE TAB STOP MOVES WITH THE CARET, which is the half of the roving tabIndex the two tests at
    // the top of this block cannot see: they both start from square 1, where a broken implementation
    // that pinned `tabIndex={0}` to the first square would agree with a working one.
    //
    // Tabbed rather than read off the attribute, and in both directions, because "one tab stop, and
    // it is this square" is a fact about the tab order rather than about a number in the DOM. Out of
    // the row to the bank and straight back: a row that kept square 1 tabbable would send the return
    // press there instead, and a row that had gone back to seven stops would not reach the bank on
    // one press at all.
    it("moves the row's one tab stop to the square the caret moved to", async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: 'Square 1, number, empty' }))
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
      await user.tab()
      await user.tab({ shift: true })

      expect(screen.getByRole('button', { name: 'Square 4, sign, empty' })).toHaveFocus()
    })

    // Every tile spent on a board that does not win. The tiles go unavailable and they stay NAMED
    // BUTTONS while they do it -- aria-disabled rather than disabled, for the reason the tray gives:
    // a browser blurs an element that becomes disabled while focused, so a row that really disabled
    // itself would drop focus to <body> on the tap that filled the last square.
    it('keeps every spent tile a named button on a full board', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])

      const tiles = screen.getAllByRole('button', { name: /^Use / })
      expect(tiles).toHaveLength(4)
      expect(tiles.filter((tile) => tile.getAttribute('aria-disabled') === 'true')).toHaveLength(4)
    })
  })
})
