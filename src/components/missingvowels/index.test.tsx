import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { MissingVowelsBoard } from './index'
import { hiddenCategoryPuzzle, missingVowelsPuzzle } from '@test/__mocks__'
import { MissingVowelsData, Puzzle } from '@types'

describe('MissingVowelsBoard', () => {
  const SOLVED = 'The Empire Strikes Back'
  const INSTRUCTION = 'The vowels are gone and the spaces have moved. What is it?'

  const onProgress = jest.fn()
  const onReset = jest.fn()
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
      <MissingVowelsBoard
        onProgress={onProgress}
        onReset={onReset}
        onSolved={onSolved}
        progress={progress}
        puzzle={puzzle}
      />,
    )
    return { container, user }
  }

  // The same board with the callback left off, because `onReset` is optional and every board that
  // predates it still compiles and still renders. Play again has to work here too -- an optional
  // prop called without a guard is a crash on the one press this whole task is about.
  const setupWithoutReset = (progress: string): ReturnType<typeof userEvent.setup> => {
    const user = userEvent.setup({ delay: null })
    render(
      <MissingVowelsBoard
        onProgress={onProgress}
        onSolved={onSolved}
        progress={progress}
        puzzle={missingVowelsPuzzle}
      />,
    )
    return user
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
    // and a capitalized first letter is one more thing to undo.
    //
    // The three data-* attributes are about a different helper. A lone text input at the bottom of
    // the viewport beside a submit-shaped button is the shape Chrome and every password manager
    // classify as a credential form -- and Chrome routinely ignores autocomplete="off" for a field
    // it has claimed heuristically. An injected manager overlay would land on top of a field that
    // is 148px wide at the narrowest supported viewport.
    it('leaves the player’s typing alone', () => {
      setup()

      expect(answerBox()).toHaveAttribute('autocorrect', 'off')
      expect(answerBox()).toHaveAttribute('spellcheck', 'false')
      expect(answerBox()).toHaveAttribute('autocomplete', 'off')
      expect(answerBox()).toHaveAttribute('data-1p-ignore')
      expect(answerBox()).toHaveAttribute('data-lpignore', 'true')
      expect(answerBox()).toHaveAttribute('data-form-type', 'other')
    })

    it('says nothing about correctness before the player checks', () => {
      setup()

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
  })

  // The two elements the shell orders into its bands. The component renders both and learns
  // nothing about either band; index.css does the placing, keyed off these classes.
  describe('the bench bands', () => {
    // Inverted from "puts the phrase and the answer box in the board band", deliberately rather
    // than deleted. The board band is the one that scrolls, so a field that drifts back into it
    // is the original defect returning, and this pair is the only thing that would notice.
    it('puts the answer box in the instrument band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(answerBox())
      expect(container.querySelector('.lull-board')).not.toContainElement(answerBox())
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

  describe('the answer box in the floor', () => {
    // The label is sr-only now, so nothing on screen says "Your answer" -- and the accessible name
    // is therefore the only thing left carrying it. A role query is what defends that, because it
    // reads the accessibility tree rather than the markup.
    it('keeps its name once the label stops being visible', () => {
      setup()

      expect(screen.getByRole('textbox')).toHaveAccessibleName('Your answer')
    })

    // The component BUILDS this IDREF out of the puzzle id, and an aria/for reference that breaks
    // is the one accessibility fact a role query cannot always catch -- so both ends are resolved
    // explicitly. See CLAUDE.md.
    it('points its label at the box it names', () => {
      const { container } = setup()
      const target = container.querySelector('label[for]')?.getAttribute('for')

      // Resolved against a ROLE query rather than against `answerBox()`, which finds the field by
      // following this very attribute -- that version asserted the reference agreed with itself.
      expect(document.getElementById(String(target))).toBe(screen.getByRole('textbox'))
    })

    it('stands the instruction in the floor rather than the board', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(screen.getByText(INSTRUCTION))
      expect(container.querySelector('.lull-board')).not.toContainElement(screen.getByText(INSTRUCTION))
    })

    // The standing line has to be a SIBLING of the live region, never a child. A role="status"
    // element that mounts with text already in it is a region NVDA and JAWS were never watching,
    // so putting the instruction inside would cost this bench every announcement it makes.
    it('keeps the standing line out of the live region', () => {
      setup()

      expect(screen.getByRole('status')).not.toContainElement(screen.getByText(INSTRUCTION))
    })

    it('says the instruction once, not once per band', () => {
      setup()

      expect(screen.getAllByText(INSTRUCTION)).toHaveLength(1)
    })

    // The presence assertion first is what stops this being an absence-only test: without it the
    // whole thing passes on a bench that never draws a standing line at all.
    it('gives the floor up to a message', async () => {
      const { user } = setup()
      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.getByRole('status')).toHaveTextContent('Type your answer first.')
      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()
    })

    // And takes it straight back. The visible instruction is displaced rather than spent: the next
    // keystroke clears `checked`, the message empties, and the standing line returns -- which is
    // what keeps a field with no visible label from ever being a field with no instruction either.
    it('takes the instruction back on the next keystroke', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Check' }))
      // The middle assertion is the whole test. Without it this passes on a bench where the
      // instruction never left -- which is exactly what it looked like before the standing line
      // existed, so it would have proved the change was unnecessary rather than that it works.
      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()

      await user.type(answerBox(), 'T')

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
    })

    // A lone text input and a submit-shaped button inside a <form> is the login shape, and it adds
    // an implicit submit and a navigation this bench has no use for.
    it('is not a form', () => {
      setup()

      expect(answerBox().closest('form')).toBeNull()
    })

    it('puts the box before the control in the tab order', async () => {
      const { user } = setup()
      answerBox().focus()

      await user.tab()

      expect(screen.getByRole('button', { name: 'Check' })).toHaveFocus()
    })

    // The player arrives to read a phrase. A field that grabbed focus would raise the software
    // keyboard over the one thing on the board before they had looked at it.
    it('does not grab focus when the board opens', () => {
      setup()

      expect(answerBox()).not.toHaveFocus()
    })

    // The composer contract: pressing Check must not take focus off the field, so the keyboard
    // stays up, nothing moves, and the message lands on a still screen.
    it('leaves focus in the box when the player checks', async () => {
      const { user } = setup()
      await user.type(answerBox(), 'wrong')

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(answerBox()).toHaveFocus()
    })

    // The winning keystroke is typed IN the field, so the field is the focused element at the
    // instant Check becomes Play again. Rebuilding the row would destroy it and drop focus to
    // <body>, from which the next Tab restarts at the top of the page.
    it('keeps the same box, and the focus in it, through the win', async () => {
      const { user } = setup()
      const before = answerBox()

      await user.type(before, SOLVED)

      expect(answerBox()).toBe(before)
      expect(answerBox()).toHaveValue(SOLVED)
      expect(answerBox()).toHaveFocus()
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
    //
    // It cannot see the guard, though: this fixture answers a real phrase, so '' and it compare
    // unequal either way. What it catches is a board that reported the win from a mount effect. The
    // degenerate rows below are the ones that exercise the comparison itself.
    it('does not solve an empty box', () => {
      setup()

      expect(onSolved).not.toHaveBeenCalled()
    })

    // THE ONE THAT LATCHES, and these have to TYPE to fail -- at mount the board is fine either way,
    // because the empty-guess operand short-circuits before the answer is read. On the first
    // keystroke `onProgress` persists and only then does `normalizeAnswer(answer)` throw, so the
    // write lands and the render does not. Every later load restores that character at mount and
    // throws before the player can act; the pack is valid so `readPack` keeps it, and nothing
    // validates a progress string, so the puzzle stays unopenable until site data is cleared.
    it.each<[string, unknown]>([
      ['left out of the pack', undefined],
      ['null', null],
      ['a number', 5],
    ])('takes a guess against an answer that arrived %s', async (_description, answer) => {
      const { user } = setup({
        ...missingVowelsPuzzle,
        data: { ...missingVowelsPuzzle.data, answer: answer as string },
      })

      await user.type(screen.getByRole('textbox'), 'T')

      expect(screen.getByRole('textbox')).toHaveValue('T')
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

    // Play again is a fresh puzzle, not merely an empty box, and the hint ladder is part of what
    // "fresh" means. The board cannot clear it itself -- `lull:hints:<puzzleId>` is storage, and a
    // board gets none -- so it says the puzzle was started over and the shell does the rest.
    it('asks the shell to start the puzzle over when the player plays again', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onReset).toHaveBeenCalled()
    })

    // Emptying the box and starting over are one press, and the shell needs both facts: the empty
    // string is what a reopened puzzle restores from, and the reset is what puts the ladder back.
    it('empties the board as well as starting it over', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    // Nothing about a reset is announced. Checking, typing and winning are the only things that say
    // anything, and a board that reported its own housekeeping would be telling the shell twice.
    it('says nothing about starting over while the player is still guessing', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'Wrong')

      expect(onReset).not.toHaveBeenCalled()
    })

    it('still empties the box when no reset callback is supplied', async () => {
      const user = setupWithoutReset(SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(answerBox()).toHaveValue('')
    })

    it('takes a fresh guess once the player plays again', async () => {
      const { user } = setup(missingVowelsPuzzle, SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))
      await user.type(answerBox(), 'Star')

      expect(answerBox()).toHaveValue('Star')
    })
  })
})
