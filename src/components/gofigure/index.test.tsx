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

  // The bank is 6,9,7,7, so "Use 7" names two buttons. Every helper here takes the
  // first still-enabled one rather than a fixed index.
  const tap = async (user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> => {
    const buttons = screen.getAllByRole('button', { name }).filter((button) => !button.hasAttribute('disabled'))
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

      expect(screen.getAllByRole('button', { name: 'Use 7' })).toHaveLength(2)
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

      expect(screen.getByRole('button', { name: 'Use 6' })).toBeDisabled()
    })

    // Duplicates are separate tiles. Spending one 7 must not spend the other.
    it('leaves the second copy of a duplicated digit available', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 7', 'Add'])

      expect(
        screen.getAllByRole('button', { name: 'Use 7' }).filter((button) => !button.hasAttribute('disabled')),
      ).toHaveLength(1)
    })

    it('returns the tile to the bank on backspace', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tap(user, 'Use 6')
      await tap(user, 'Take back the last tile')

      expect(screen.getByRole('button', { name: 'Use 6' })).toBeEnabled()
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

      expect(screen.getByRole('button', { name: 'Use 9' })).toBeDisabled()
    })

    it('refuses an operator on an empty board', () => {
      renderBoard()

      expect(screen.getByRole('button', { name: 'Multiply' })).toBeDisabled()
    })

    it('refuses two operators in a row', async () => {
      const user = userEvent.setup()
      renderBoard()

      await tapAll(user, ['Use 6', 'Add'])

      expect(screen.getByRole('button', { name: 'Multiply' })).toBeDisabled()
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

      expect(screen.getByRole('button', { name: 'Use 6' })).toBeDisabled()
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

    it('lets a solved puzzle be replayed by taking a tile back', async () => {
      const user = userEvent.setup()
      renderBoard(goFigurePuzzle, '6+9+7*7')

      await tap(user, 'Take back the last tile')

      expect(screen.queryByText(/^Solved\./)).not.toBeInTheDocument()
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

      expect(screen.getAllByRole('button', { name: 'Use 6' })[0]).toHaveFocus()
    })

    it('plays through with the keyboard alone', async () => {
      const user = userEvent.setup()
      renderBoard()

      for (const name of SOLUTION) {
        screen
          .getAllByRole('button', { name })
          .filter((button) => !button.hasAttribute('disabled'))[0]
          .focus()
        await user.keyboard('{Enter}')
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
