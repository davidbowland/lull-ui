import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { MissingVowelsBoard } from './index'
import { hiddenCategoryPuzzle, missingVowelsPuzzle } from '@test/__mocks__'
import { MissingVowelsData, Puzzle } from '@types'

describe('MissingVowelsBoard', () => {
  const SOLVED = 'The Empire Strikes Back'

  const onProgress = jest.fn()
  const onSolved = jest.fn()

  // Named and called explicitly rather than a beforeEach, and the user instance is built here so
  // that every test drives its interactions through exactly one. `delay: null` is the whole
  // reason: the v14 default puts a real setTimeout between every event in a sequence, and this
  // suite types whole phrases a character at a time.
  const setup = (
    puzzle: Puzzle<MissingVowelsData> = missingVowelsPuzzle,
    progress: string | null = null,
  ): { container: HTMLElement; user: ReturnType<typeof userEvent.setup> } => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(
      <MissingVowelsBoard onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />,
    )
    return { container, user }
  }

  const answerBox = (): HTMLElement => screen.getByLabelText('Your answer')

  describe('the board', () => {
    it('shows the category when the difficulty allows it', () => {
      setup()

      expect(screen.getByRole('heading', { name: 'Film' })).toBeInTheDocument()
    })

    // Hiding the category removes a free tier rather than weakening one. The <h2> is not rendered
    // at all: no placeholder, no empty element. PuzzleFrame still emits the <h1> above the board,
    // so the board is headingless but not unlabeled. Deliberate.
    it('renders no heading at all when the category is hidden', () => {
      setup(hiddenCategoryPuzzle)

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('shows the respaced consonants', () => {
      setup()

      expect(screen.getByText('THMP RSTR KSBCK')).toBeInTheDocument()
    })

    // Read as one string the consonants are noise, so the visible run is hidden and the plate's
    // accessible name spells them out group by group. Without this a screen-reader user gets a
    // word-shaped sound instead of the letters and gaps the puzzle is made of.
    it('spells the letters out for a screen reader, group by group', () => {
      setup()

      expect(screen.getByRole('img')).toHaveAccessibleName('The letters are T H M P, then R S T R, then K S B C K')
    })

    it('hides the visible run from a screen reader', () => {
      setup()

      expect(screen.getByText('THMP RSTR KSBCK')).toHaveAttribute('aria-hidden', 'true')
    })

    it('asks the player for the phrase', () => {
      setup()

      expect(screen.getByText('The vowels are gone and the spaces have moved. What is it?')).toBeInTheDocument()
    })

    // A phrase with its vowels removed is not a word, so every helper the platform offers would
    // fight the player: autocorrect rewrites the guess, autocomplete offers last week's answers,
    // and a capitalised first letter is one more thing to undo.
    it('leaves the player’s typing alone', () => {
      setup()

      expect(answerBox()).toHaveAttribute('autocorrect', 'off')
      expect(answerBox()).toHaveAttribute('spellcheck', 'false')
    })

    it('says nothing about correctness before the player checks', () => {
      setup()

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
  })

  // The two elements the shell orders into its bands. The component renders both and learns
  // nothing about either band; index.css does the placing, keyed off these classes.
  describe('the bench bands', () => {
    it('puts the phrase and the answer box in the board band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-board')).toContainElement(answerBox())
    })

    it('puts the one control in the instrument band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(
        screen.getByRole('button', { name: 'Check' }),
      )
    })

    it('puts the message in the instrument band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(screen.getByRole('status'))
    })
  })

  describe('answering', () => {
    it('reports progress as the player types', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'The')

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
      const { user } = setup()

      await user.type(answerBox(), value)

      expect(onSolved).toHaveBeenCalled()
    })

    // Typing the last letter of a phrase you have recognized should not then require finding a
    // control to confirm it.
    it('solves without needing the check button', async () => {
      const { user } = setup()

      await user.type(answerBox(), SOLVED)

      expect(screen.getByRole('status')).toHaveTextContent('Solved. The answer is The Empire Strikes Back.')
    })

    // The displayed consonants carry the article's letters, so accepting an answer without it
    // would contradict what the player was shown.
    it('does not accept the phrase with its leading article dropped', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'Empire Strikes Back')

      expect(onSolved).not.toHaveBeenCalled()
    })

    it('tells the player when a checked answer is wrong', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'The Empire Strikes First')
      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.getByRole('status')).toHaveTextContent(
        'Not it. Check the letters — where the spaces fall doesn’t count.',
      )
    })

    // On this bench the OS keyboard covers the floor, and Check with it. The keyboard's own action
    // key is then the only control the player can still reach.
    it('checks the answer when the player presses the keyboard’s action key', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'The Empire Strikes First{Enter}')

      expect(screen.getByRole('status')).toHaveTextContent('Not it.')
    })

    it('asks for an answer when the player checks an empty box', async () => {
      const { user } = setup()

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.getByRole('status')).toHaveTextContent('Type your answer first.')
    })

    // An empty guess normalizes to an empty string, and so would an answer of pure punctuation.
    // Without the guard those compare equal and a blank box would solve the puzzle.
    it('does not solve an empty box', () => {
      setup()

      expect(onSolved).not.toHaveBeenCalled()
    })

    // An unfinished guess is not a wrong one, so the floor stays quiet until the player asks.
    it('says nothing about a half-typed guess', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'The Emp')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('clears the wrong-answer message once the player edits the guess', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'Wrong')
      await user.click(screen.getByRole('button', { name: 'Check' }))
      await user.type(answerBox(), 'er')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
  })

  describe('restoring progress', () => {
    it('starts from the stored guess', () => {
      setup(missingVowelsPuzzle, 'The Empire')

      expect(answerBox()).toHaveValue('The Empire')
    })

    it('starts empty when there is no stored guess', () => {
      setup()

      expect(answerBox()).toHaveValue('')
    })

    // A pack can be pruned and refetched, so a stored guess may belong to a puzzle that is already
    // solved. The board must render that as solved rather than as an unchecked box.
    it('shows a stored correct guess as already solved', () => {
      setup(missingVowelsPuzzle, SOLVED)

      expect(screen.getByRole('status')).toHaveTextContent('Solved.')
    })
  })

  // A solved board is finished. The box that won it does not take another keystroke -- the way
  // back in is Play again, which empties it.
  describe('once solved', () => {
    it('offers Play again in place of Check', () => {
      setup(missingVowelsPuzzle, SOLVED)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument()
    })

    it('refuses another keystroke in the answer box', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.type(answerBox(), '!')

      expect(answerBox()).toHaveValue(SOLVED)
    })

    it('reports nothing when the answer box is typed into', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.type(answerBox(), '!')

      expect(onProgress).not.toHaveBeenCalled()
    })

    // readOnly, not disabled. A disabled input leaves the tab order and is skipped by a screen
    // reader's forms mode, which would put the answer the player just won with out of reach of the
    // people most likely to want to re-read it.
    it('leaves the winning answer readable and focusable', () => {
      setup(missingVowelsPuzzle, SOLVED)

      expect(answerBox()).toBeEnabled()
    })

    it('empties the answer box when the player plays again', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(answerBox()).toHaveValue('')
    })

    it('takes back the solved message when the player plays again', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('forgets the winning guess when the player plays again', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    it('takes a fresh guess once the player plays again', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))
      await user.type(answerBox(), 'Star')

      expect(answerBox()).toHaveValue('Star')
    })
  })

  describe('accessibility', () => {
    it('has no axe violations', async () => {
      const { container } = setup()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations once solved', async () => {
      const { container } = setup(missingVowelsPuzzle, SOLVED)

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations with the category hidden', async () => {
      const { container } = setup(hiddenCategoryPuzzle)

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations with a wrong answer on the floor', async () => {
      const { container, user } = setup()

      await user.type(answerBox(), 'Wrong{Enter}')

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
