import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { GoFigureBoard } from './index'
import { goFigurePuzzle } from '@test/__mocks__'
import { GoFigureData, Puzzle } from '@types'

describe('GoFigureBoard', () => {
  const onProgress = jest.fn()
  const onSolved = jest.fn()

  const renderBoard = (
    puzzle: Puzzle<GoFigureData> = goFigurePuzzle,
    progress: string | null = null,
  ): ReturnType<typeof render> =>
    render(<GoFigureBoard onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />)

  // The bank is 6,9,7,7, so two tiles show 7. Their accessible names now carry the tile
  // position ("Use 7, tile 3 of 4"), so queries match by prefix, and availability is
  // aria-disabled rather than disabled -- the tiles stay focusable so a tap does not
  // blur the button it just activated. Every helper here takes the
  // first still-enabled one rather than a fixed index.
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

  describe('the goal and the empty board', () => {
    it('names the number to make', () => {
      renderBoard()

      expect(screen.getByRole('heading', { name: 'Make 154' })).toBeInTheDocument()
    })

    it('says what to do before anything has been tapped', () => {
      renderBoard()

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
    })

    it('offers every bank digit as a button', () => {
      renderBoard()

      expect(screen.getAllByRole('button', { name: /^Use 7/ })).toHaveLength(2)
    })

    // Symbols, not names, is what a screen reader reads as "plus sign" at best and
    // nothing at all at worst.
    it.each([
      ['Add', '+'],
      ['Subtract', '-'],
      ['Multiply', '*'],
      ['Divide', '/'],
    ])('names the %s operator rather than showing only its symbol', (name: string, _symbol: string) => {
      renderBoard()

      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    })
  })

  describe('the running total', () => {
    // The whole point of showing it: a player who expects PEMDAS sees the total move the
    // way the game actually counts, on the tap that would have surprised them.
    it('explains that the signs run left to right', () => {
      renderBoard()

      expect(
        screen.getByText('Signs apply left to right, not by PEMDAS. So 2 + 3 × 4 makes 20, not 14.'),
      ).toBeInTheDocument()
    })

    it('shows the total of the tiles tapped so far', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(screen.getByText('Running total: 15')).toBeInTheDocument()
    })

    it('counts left to right rather than by PEMDAS', async () => {
      const user = userEvent.setup()
      renderBoard()

      // 6+9=15, +7=22, *7=154. PEMDAS would make it 64.
      await tapAll(user, SOLUTION)

      expect(screen.getByText('Running total: 154')).toBeInTheDocument()
    })

    it('holds the total while an operator waits for its digit', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getByText('Running total: 6')).toBeInTheDocument()
    })

    it('has no total to show before the first tile', () => {
      renderBoard()

      expect(screen.queryByText(/Running total/)).not.toBeInTheDocument()
    })

    it('recounts the total after a tile is taken back', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Take back the last tile', 'Take back the last tile'])

      expect(screen.getByText('Running total: 6')).toBeInTheDocument()
    })

    it('shows the total of restored progress', () => {
      renderBoard(goFigurePuzzle, '6+9')

      expect(screen.getByText('Running total: 15')).toBeInTheDocument()
    })

    // Division has to come out whole at every step, so there is no number to show -- and
    // saying so on the tap that broke it beats waiting for the last tile.
    it('says there is no total when a division does not come out even', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Divide', 'Use 9'])

      expect(screen.getByText("Running total: none. That division doesn't come out even.")).toBeInTheDocument()
    })
  })

  describe('building an expression', () => {
    it('shows the tapped tokens joined, exactly as the pack writes them', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(screen.getByRole('status', { name: 'Your expression' })).toHaveTextContent('6+9')
    })

    it('consumes a tapped digit from the bank', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'true')
    })

    // Duplicates are separate tiles. Spending one 7 must not spend the other.
    it('leaves the second copy of a duplicated digit available', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 7', 'Add'])

      expect(
        screen
          .getAllByRole('button', { name: /^Use 7/ })
          .filter((button) => button.getAttribute('aria-disabled') !== 'true'),
      ).toHaveLength(1)
    })

    // A bank of 9,3,9,9 has three tiles that all write "9", so the expression alone cannot
    // say which one was tapped. Spending the tile the player did not touch is visible: the
    // tapped tile stays bright and a tile across the row goes dim.
    const repeatedBank: Puzzle<GoFigureData> = {
      ...goFigurePuzzle,
      data: { ...goFigurePuzzle.data, acceptedSolutions: ['9+3+9*9'], bank: [9, 3, 9, 9], goal: 189 },
    }

    it('spends the tile that was tapped, not the first one showing that digit', async () => {
      const user = userEvent.setup()
      renderBoard(repeatedBank)

      await user.click(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' }))
      await tap(user, 'Add')

      expect(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'Use 9, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'false')
    })

    it('returns the tile that was tapped when it is taken back', async () => {
      const user = userEvent.setup()
      renderBoard(repeatedBank)

      await user.click(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' }))
      await tap(user, 'Add')
      await user.click(screen.getByRole('button', { name: 'Use 9, tile 1 of 4' }))
      await tap(user, 'Take back the last tile')

      expect(screen.getByRole('button', { name: 'Use 9, tile 1 of 4' })).toHaveAttribute('aria-disabled', 'false')
      expect(screen.getByRole('button', { name: 'Use 9, tile 4 of 4' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('returns the tile to the bank on backspace', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tap(user, 'Use 6')
      await tap(user, 'Take back the last tile')

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'false')
    })

    it('has nothing to take back on an empty board', () => {
      renderBoard()

      expect(screen.getByRole('button', { name: 'Take back the last tile' })).toBeDisabled()
    })

    // Two digits in a row would read as one two-digit number, which no accepted solution
    // ever contains.
    it('refuses a second digit before an operator', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { name: /^Use 9/ })).toHaveAttribute('aria-disabled', 'true')
    })

    it('refuses an operator on an empty board', () => {
      renderBoard()

      expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('refuses two operators in a row', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('reports the expression as progress on every tap', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(onProgress).toHaveBeenNthCalledWith(3, '6+9')
    })

    it('reports the shortened expression after a backspace', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Take back the last tile'])

      expect(onProgress).toHaveBeenLastCalledWith('6')
    })
  })

  describe('solving', () => {
    it('announces the solution, formatted for reading', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, SOLUTION)

      expect(screen.getByText('Solved. 6 + 9 + 7 × 7 = 154')).toBeInTheDocument()
    })

    it('tells the shell the puzzle is solved', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, SOLUTION)

      expect(onSolved).toHaveBeenCalledTimes(1)
    })

    // THE LOAD-BEARING TEST. The component compares the joined string against
    // acceptedSolutions; it never evaluates arithmetic to decide correctness. 9+6+7*7
    // makes 154 by the same left-to-right rule, and this pack does not list it.
    it('does not solve on an expression the pack did not list, even when it reaches the goal', async () => {
      const user = userEvent.setup()
      const oneRouteOnly: Puzzle<GoFigureData> = {
        ...goFigurePuzzle,
        data: { ...goFigurePuzzle.data, acceptedSolutions: ['6+9+7*7'] },
      }
      renderBoard(oneRouteOnly)

      await tapAll(user, ['Use 9', 'Add', 'Use 6', 'Add', 'Use 7', 'Multiply', 'Use 7'])

      expect(onSolved).not.toHaveBeenCalled()
      expect(screen.queryByText(/^Solved\./)).not.toBeInTheDocument()
    })

    it('says so plainly when an unlisted expression happens to reach the goal', async () => {
      const user = userEvent.setup()
      const oneRouteOnly: Puzzle<GoFigureData> = {
        ...goFigurePuzzle,
        data: { ...goFigurePuzzle.data, acceptedSolutions: ['6+9+7*7'] },
      }
      renderBoard(oneRouteOnly)

      await tapAll(user, ['Use 9', 'Add', 'Use 6', 'Add', 'Use 7', 'Multiply', 'Use 7'])

      expect(
        screen.getByText("That isn't one of the sums for this puzzle. Take back a tile and try again."),
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

    it('offers Play again in place of Take back', () => {
      renderBoard(goFigurePuzzle, SOLVED)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Take back the last tile' })).not.toBeInTheDocument()
    })

    it('refuses every tile in the bank', () => {
      renderBoard(goFigurePuzzle, SOLVED)

      const spent = screen
        .getAllByRole('button', { name: /^Use / })
        .filter((tile) => tile.getAttribute('aria-disabled') === 'true')

      expect(spent).toHaveLength(4)
    })

    it('refuses every operator', () => {
      renderBoard(goFigurePuzzle, SOLVED)

      expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('empties the board when the player plays again', async () => {
      const user = userEvent.setup()
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(screen.getByText('Tap the numbers and signs to build a sum.')).toBeInTheDocument()
    })

    it('takes back the solved message when the player plays again', async () => {
      const user = userEvent.setup()
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(screen.queryByText(/^Solved\./)).not.toBeInTheDocument()
    })

    it('returns the whole bank when the player plays again', async () => {
      const user = userEvent.setup()
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(screen.getByRole('button', { name: /^Use 6/ })).toHaveAttribute('aria-disabled', 'false')
    })

    it('forgets the winning expression when the player plays again', async () => {
      const user = userEvent.setup()
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    it('offers Take back again once the emptied board has a tile on it', async () => {
      const user = userEvent.setup()
      renderBoard(goFigurePuzzle, SOLVED)

      await playAgain(user)
      await tap(user, 'Use 6')

      expect(screen.getByRole('button', { name: 'Take back the last tile' })).toBeEnabled()
    })
  })

  describe('a wrong answer', () => {
    // Says what the expression DID make, not "incorrect". The number is computed for
    // display; it takes no part in the decision above.
    it('names what the expression made', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])

      expect(screen.getByText('That makes 29, not 154. Take back a tile and try again.')).toBeInTheDocument()
    })

    // Division has to come out whole at every step, so there is no number to name.
    it('names what a subtraction made', async () => {
      const user = userEvent.setup()
      renderBoard()

      // 6-9 = -3, then +7 = 4, then *7 = 28. The only test that exercises the minus
      // branch of evaluate.ts at all.
      await tapAll(user, ['Use 6', 'Subtract', 'Use 9', 'Add', 'Use 7', 'Multiply', 'Use 7'])

      expect(screen.getByText('That makes 28, not 154. Take back a tile and try again.')).toBeInTheDocument()
    })

    it('says so when a division does not come out whole', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Divide', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])

      expect(screen.getByText("That doesn't divide evenly. Take back a tile and try again.")).toBeInTheDocument()
    })

    it('says nothing while tiles are still in the bank', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9'])

      expect(screen.queryByText(/Take back a tile/)).not.toBeInTheDocument()
    })

    it('clears the message once a tile is taken back', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add', 'Use 9', 'Add', 'Use 7', 'Add', 'Use 7'])
      await tap(user, 'Take back the last tile')

      expect(screen.queryByText(/Take back a tile/)).not.toBeInTheDocument()
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

    // A solved puzzle reopens showing its solution. Replay is taking tiles back: solved
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

    it('ignores progress using an operator this puzzle does not offer', () => {
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
      const user = userEvent.setup()
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
      const user = userEvent.setup()
      renderBoard()

      await user.tab()
      const first = screen.getAllByRole('button', { name: /^Use 6/ })[0]
      expect(first).toHaveFocus()

      await user.keyboard('{Enter}')

      expect(first).toHaveAttribute('aria-disabled', 'true')
      expect(first).toHaveFocus()
    })

    it('plays through with the keyboard alone', async () => {
      const user = userEvent.setup()
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

    it('has no accessibility violations once solved', async () => {
      const { container } = renderBoard(goFigurePuzzle, '6+9+7*7')

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
