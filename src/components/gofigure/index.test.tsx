import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { GoFigureBoard } from './index'
import { goFigurePuzzle, quickPuzzle } from '@test/__mocks__'
import { GoFigureData, Puzzle } from '@types'

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

  const SOLUTION = ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Multiply', 'Use 7']
  const UNDO = 'Undo the last tile'

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
      const rail = screen.getByRole('status', { name: 'Your expression' })
      const teaching = screen.getByText('Signs apply left to right, not by PEMDAS.')

      expect(goal.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(rail.compareDocumentPosition(teaching) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  describe('the empty board', () => {
    it('says what to do before anything has been tapped', () => {
      renderBoard()

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
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

    it('has nothing to undo', () => {
      renderBoard()

      expect(screen.getByRole('button', { name: UNDO })).toHaveAttribute('aria-disabled', 'true')
    })

    it('refuses the press when there is nothing to undo', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.click(screen.getByRole('button', { name: UNDO }))

      expect(onProgress).not.toHaveBeenCalled()
    })
  })

  describe('the running total', () => {
    it('shows the total of the tiles tapped so far', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(screen.getByText('Running total: 15')).toBeInTheDocument()
    })

    it('counts left to right rather than by PEMDAS', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      // 6+9=15, +7=22, *7=154. PEMDAS would make it 64.
      await tapAll(user, SOLUTION)

      expect(screen.getByText('Running total: 154')).toBeInTheDocument()
    })

    it('holds the total while a sign waits for its digit', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

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

      expect(screen.getByText("Running total: none. That division doesn't come out even.")).toBeInTheDocument()
    })
  })

  describe('building an expression', () => {
    it('shows the tapped tokens joined, exactly as the pack writes them', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(screen.getByRole('status', { name: 'Your expression' })).toHaveTextContent('6+9')
    })

    it('consumes a tapped digit from the bank', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'true')
    })

    // Marked by form and not by colour, and legible either way: the bank is what the
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

    it('reports the expression as progress on every tap', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(onProgress).toHaveBeenNthCalledWith(3, '6+9')
    })

    it('reports the shortened expression after an Undo', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', UNDO])

      expect(onProgress).toHaveBeenLastCalledWith('6')
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

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
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

    it('offers Undo again once the emptied board has a tile on it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)
      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { name: UNDO })).toHaveAttribute('aria-disabled', 'false')
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
    it('restores an expression left half-finished', () => {
      renderBoard(goFigurePuzzle, '6+9')

      expect(screen.getByRole('status', { name: 'Your expression' })).toHaveTextContent('6+9')
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

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
    })

    it('ignores progress that spends a duplicate more often than the bank holds it', () => {
      renderBoard(goFigurePuzzle, '7+7+7')

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
    })

    // Two digits in a row read as one two-digit number, which no accepted solution ever
    // contains and no sequence of taps on this board could have produced.
    it('ignores progress with two digits in a row', () => {
      renderBoard(goFigurePuzzle, '67')

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
    })

    it('ignores progress using a sign this puzzle does not offer', () => {
      const noDivision: Puzzle<GoFigureData> = {
        ...goFigurePuzzle,
        data: { ...goFigurePuzzle.data, operators: ['+', '-', '*'] },
      }
      renderBoard(noDivision, '6/9')

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('reaches the first bank tile with the keyboard alone', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.tab()

      expect(screen.getAllByRole('button', { name: /^Use 6/ })[0]).toHaveFocus()
    })

    // The regression test for the focus bug. Tiles used to be `disabled`, and a browser
    // blurs an element that becomes disabled while focused -- so every tap dropped focus
    // to <body> and the next Tab restarted at the top of the document. An earlier version
    // of the playthrough test below called .focus() before each Enter, which is why it
    // never noticed.
    it('keeps focus on a tile after activating it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard()

      await user.tab()
      const first = screen.getAllByRole('button', { name: /^Use 6/ })[0]
      expect(first).toHaveFocus()

      await user.keyboard('{Enter}')

      expect(first).toHaveAttribute('aria-disabled', 'true')
      expect(first).toHaveFocus()
    })

    // Undo is the same bug in the control row: the press that empties the board is the
    // press that would disable the pressed control, so a real `disabled` would drop focus
    // to <body> on the last undo of every keyboard session.
    it('keeps focus on Undo after the board empties', async () => {
      const user = userEvent.setup({ delay: null })
      renderBoard(goFigurePuzzle, '6')

      const undo = screen.getByRole('button', { name: UNDO })
      undo.focus()
      await user.keyboard('{Enter}')

      expect(undo).toHaveAttribute('aria-disabled', 'true')
      expect(undo).toHaveFocus()
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

    it('has no accessibility violations', async () => {
      const { container } = renderBoard()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations part-way through', async () => {
      const { container } = renderBoard(goFigurePuzzle, '6+9')

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations once solved', async () => {
      const { container } = renderBoard(goFigurePuzzle, '6+9+7*7')

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
