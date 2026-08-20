import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { MissingVowelsBoard } from './index'
import { hiddenCategoryPuzzle, missingVowelsPuzzle } from '@test/__mocks__'
import { MissingVowelsData, Puzzle } from '@types'

describe('MissingVowelsBoard', () => {
  const onProgress = jest.fn()
  const onSolved = jest.fn()

  const renderBoard = (
    puzzle: Puzzle<MissingVowelsData> = missingVowelsPuzzle,
    progress: string | null = null,
  ): ReturnType<typeof render> =>
    render(<MissingVowelsBoard onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />)

  const typeAnswer = async (value: string): Promise<void> => {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Your answer'), value)
  }

  describe('the board', () => {
    it('shows the category when the difficulty allows it', () => {
      renderBoard()

      expect(screen.getByRole('heading', { name: 'Film' })).toBeInTheDocument()
    })

    // Hiding the category removes a free tier rather than weakening one. The <h2> is not rendered
    // at all: no placeholder, no empty element. The section keeps its aria-label and PuzzleFrame
    // still emits the <h1> above it, so the board is headingless but not unlabeled. Deliberate.
    it('renders no heading at all when the category is hidden', () => {
      renderBoard(hiddenCategoryPuzzle)

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('shows the respaced consonants', () => {
      renderBoard()

      expect(screen.getByText('THMP RSTR KSBCK')).toBeInTheDocument()
    })

    // Read as one string the consonants are noise, so the accessible name spells them out and
    // names the groups. Without this a screen-reader user gets a word-shaped sound instead of the
    // letters and gaps the puzzle is made of.
    it('spells the letters out for a screen reader, group by group', () => {
      renderBoard()

      expect(screen.getByRole('img')).toHaveAccessibleName('The letters are T H M P, then R S T R, then K S B C K')
    })

    it('says nothing about correctness before the player checks', () => {
      renderBoard()

      expect(screen.getByRole('status')).toHaveTextContent('')
    })
  })

  describe('answering', () => {
    it('reports progress as the player types', async () => {
      renderBoard()

      await typeAnswer('The')

      expect(onProgress).toHaveBeenLastCalledWith('The')
    })

    // The whole point of normalizeAnswer: the displayed spacing lies, so the player must not also
    // have to reproduce the real word boundaries.
    it.each([
      ['the exact phrase', 'The Empire Strikes Back'],
      ['different case', 'the empire strikes back'],
      ['no spaces at all', 'TheEmpireStrikesBack'],
      ['extra punctuation', 'The Empire Strikes Back!'],
    ])('accepts %s', async (_description, value) => {
      renderBoard()

      await typeAnswer(value)

      expect(onSolved).toHaveBeenCalled()
    })

    // Typing the last letter of a phrase you have recognized should not then require finding a
    // control to confirm it.
    it('solves without needing the check button', async () => {
      renderBoard()

      await typeAnswer('The Empire Strikes Back')

      expect(screen.getByRole('status')).toHaveTextContent('Solved. The answer is The Empire Strikes Back.')
    })

    // The displayed consonants carry the article's letters, so accepting an answer without it
    // would contradict what the player was shown.
    it('does not accept the phrase with its leading article dropped', async () => {
      renderBoard()

      await typeAnswer('Empire Strikes Back')

      expect(onSolved).not.toHaveBeenCalled()
    })

    it('tells the player when a checked answer is wrong', async () => {
      renderBoard()

      await typeAnswer('The Empire Strikes First')
      await userEvent.setup().click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.getByRole('status')).toHaveTextContent('Not it.')
    })

    it('asks for an answer when the player checks an empty box', async () => {
      renderBoard()

      await userEvent.setup().click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.getByRole('status')).toHaveTextContent('Type your answer first.')
    })

    // An empty guess normalizes to an empty string, and so would an answer of pure punctuation.
    // Without the guard those compare equal and a blank box would solve the puzzle.
    it('does not solve an empty box', () => {
      renderBoard()

      expect(onSolved).not.toHaveBeenCalled()
    })

    it('clears the wrong-answer message once the player edits the guess', async () => {
      renderBoard()

      await typeAnswer('Wrong')
      await userEvent.setup().click(screen.getByRole('button', { name: 'Check' }))
      await typeAnswer('er')

      expect(screen.getByRole('status')).toHaveTextContent('')
    })
  })

  describe('restoring progress', () => {
    it('starts from the stored guess', () => {
      renderBoard(missingVowelsPuzzle, 'The Empire')

      expect(screen.getByLabelText('Your answer')).toHaveValue('The Empire')
    })

    it('starts empty when there is no stored guess', () => {
      renderBoard()

      expect(screen.getByLabelText('Your answer')).toHaveValue('')
    })

    // A pack can be pruned and refetched, so a stored guess may belong to a puzzle that is already
    // solved. The board must render that as solved rather than as an unchecked box.
    it('shows a stored correct guess as already solved', () => {
      renderBoard(missingVowelsPuzzle, 'The Empire Strikes Back')

      expect(screen.getByRole('status')).toHaveTextContent('Solved.')
    })
  })

  // A solved board is finished. The box that won it does not take another keystroke --
  // the way back in is Play again, which empties it.
  describe('once solved', () => {
    const SOLVED = 'The Empire Strikes Back'

    const playAgain = async (): Promise<void> => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Play again' }))
    }

    it('offers Play again in place of Check', () => {
      renderBoard(missingVowelsPuzzle, SOLVED)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument()
    })

    it('refuses another keystroke in the answer box', async () => {
      renderBoard(missingVowelsPuzzle, SOLVED)

      await typeAnswer('!')

      expect(screen.getByLabelText('Your answer')).toHaveValue(SOLVED)
    })

    it('reports nothing when the answer box is typed into', async () => {
      renderBoard(missingVowelsPuzzle, SOLVED)

      await typeAnswer('!')

      expect(onProgress).not.toHaveBeenCalled()
    })

    it('empties the answer box when the player plays again', async () => {
      renderBoard(missingVowelsPuzzle, SOLVED)

      await playAgain()

      expect(screen.getByLabelText('Your answer')).toHaveValue('')
    })

    it('takes back the solved message when the player plays again', async () => {
      renderBoard(missingVowelsPuzzle, SOLVED)

      await playAgain()

      expect(screen.getByRole('status')).toHaveTextContent('')
    })

    it('forgets the winning guess when the player plays again', async () => {
      renderBoard(missingVowelsPuzzle, SOLVED)

      await playAgain()

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    it('takes a fresh guess once the player plays again', async () => {
      renderBoard(missingVowelsPuzzle, SOLVED)

      await playAgain()
      await typeAnswer('Star')

      expect(screen.getByLabelText('Your answer')).toHaveValue('Star')
    })
  })

  describe('accessibility', () => {
    it('has no axe violations', async () => {
      const { container } = renderBoard()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations once solved', async () => {
      const { container } = renderBoard(missingVowelsPuzzle, 'The Empire Strikes Back')

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations with the category hidden', async () => {
      const { container } = renderBoard(hiddenCategoryPuzzle)

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
