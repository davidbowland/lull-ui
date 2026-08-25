import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { CrypticClueBoard } from './index'
import {
  anagramCrypticClue,
  brokenFodderCrypticClue,
  brokenSpanCrypticClue,
  brokenSpansCrypticClue,
  crypticCluePuzzle,
  noEnumerationCrypticClue,
} from '@test/__mocks__'
import { CrypticClueData, CrypticDevice, Puzzle } from '@types'

describe('CrypticClueBoard', () => {
  const CLUE = 'Dance hidden in instant angora'
  const INSTRUCTION = 'Every cryptic clue says the answer twice — once as a definition, once as wordplay.'

  const onProgress = jest.fn()
  const onReset = jest.fn()
  const onSolved = jest.fn()

  // Named and called explicitly rather than a beforeEach, and the user instance is built here so
  // that every test drives its interactions through exactly one. `delay: null` is the whole
  // reason: the v14 default puts a real setTimeout between every event in a sequence, which is
  // slack that gets starved under parallel workers.
  const setup = (
    puzzle: Puzzle<CrypticClueData> = crypticCluePuzzle,
    progress: string | null = null,
  ): { container: HTMLElement; user: ReturnType<typeof userEvent.setup> } => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(
      <CrypticClueBoard
        onProgress={onProgress}
        onReset={onReset}
        onSolved={onSolved}
        progress={progress}
        puzzle={puzzle}
      />,
    )
    return { container, user }
  }

  // The same board with the callback left off, because `onReset` is optional on the props and every
  // board that predates it still compiles and still renders. Play again has to work here too -- an
  // optional prop called without a guard is a crash on the one press it exists for.
  const setupWithoutReset = (progress: string): ReturnType<typeof userEvent.setup> => {
    const user = userEvent.setup({ delay: null })
    render(
      <CrypticClueBoard onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={crypticCluePuzzle} />,
    )
    return user
  }

  // The clue's paragraph, found by POSITION rather than by its text. The <mark> spliced into it on
  // the win breaks the string across three text nodes, so a text query would stop finding it at
  // exactly the moment this helper matters most. It is the first <p> in the board band -- the
  // plate -- and the reveal's two lines come after it in document order. A structural DOM
  // assertion, not a style one: it says where an element sits, never how it looks.
  const cluePlate = (container: HTMLElement): Element | null => container.querySelector('.lull-board p')

  // A ROLE query, never getByLabelText. The label test below resolves the htmlFor by hand and
  // compares it against this element, and a helper that found the field by following that very
  // attribute would be asserting the reference agrees with itself. This is the one line of
  // missingvowels/index.test.tsx deliberately not copied.
  const answerBox = (): HTMLElement => screen.getByRole('textbox')

  describe('the clue', () => {
    // `toHaveTextContent` is a SUBSTRING match on whitespace-NORMALIZED text, so it would go on
    // passing if someone added a `clue.trim()` or collapsed runs of spaces -- and byte-exactness is
    // the premise `spans.ts` and the reveal's <mark> both stand on, since the pack's offsets index
    // this string. So the whole paragraph is pinned by value instead, which also nails the single
    // space before the parenthetical and the run-on of the sr-only twin.
    it('renders the clue exactly as the pack wrote it', () => {
      const { container } = setup()

      expect(cluePlate(container)).toHaveProperty('textContent', `${CLUE} (5)5 letters.`)
    })

    // A cryptic clue is a grammatical English sentence whose surface reading IS the joke, so there
    // is no second encoding to translate and role="img" would be a translation layer over a string
    // that needs none. Missing Vowels does the opposite because ITS run is word-shaped noise.
    // Without this assertion a later consistency pass copies that treatment across and nothing
    // fails -- and the cost would be the review cursor, which is how a cryptic actually gets solved.
    it('does not treat a sentence as a picture', () => {
      const { container } = setup()

      // Led with the clue, because a bare `queryByRole` absence passes on a board that rendered
      // nothing at all -- the same guard the it.each block below states in its own comment.
      expect(cluePlate(container)).toHaveTextContent(CLUE)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('shows the enumeration the way a printed cryptic does', () => {
      setup()

      expect(screen.getByText('(5)')).toHaveAttribute('aria-hidden', 'true')
    })

    // Spoken, "(5)" is the bare word "five" at the end of a sentence about angora -- a number with
    // no unit attached. The sr-only sibling is not a duplicate, it is the translation of a
    // typographic convention into words.
    it('says how many letters, in words, for a listener', () => {
      setup()

      // Present is not the property this test is named for. Put aria-hidden on that span and the
      // listener loses the enumeration entirely while a presence check stays green -- so the
      // attribute is asserted here exactly as its visible twin's is asserted above.
      expect(screen.getByText('5 letters.')).not.toHaveAttribute('aria-hidden')
    })

    // The one arm a well-formed pack never takes, and it is shipped code, so it gets a state and a
    // test. `enumeration: []` is an exported fixture; the absent case is built here rather than
    // exported, because a pack is JSON off the network and `undefined.join` is a crash rather than
    // a bare "()". Both rows still assert the clue, so neither can pass on a board that rendered
    // nothing at all.
    // The generic on `it.each` is load-bearing: without it the rows infer as
    // `(string | Puzzle<CrypticClueData>)[]` and the puzzle argument arrives too wide to pass to
    // `setup`. Every mixed-type table in this file is annotated the same way.
    it.each<[string, Puzzle<CrypticClueData>]>([
      ['an empty enumeration', noEnumerationCrypticClue],
      [
        'no enumeration at all',
        {
          ...crypticCluePuzzle,
          data: { ...crypticCluePuzzle.data, enumeration: undefined as unknown as number[] },
        },
      ],
    ])('draws no parenthetical for %s', (_description, puzzle) => {
      const { container } = setup(puzzle)

      expect(cluePlate(container)).toHaveTextContent(CLUE)
      expect(screen.queryByText('()')).toBeNull()
      expect(screen.queryByText('letters.', { exact: false })).toBeNull()
    })

    // THE CONTENTS, not the shape. `join` stringifies anything, so these are not crashes -- they
    // paint `([object Object])` and `(null)` on the plate and read the same to a listener, with
    // nothing on screen admitting the number is wrong. A solver counting letters against it is being
    // misled, which is the same failure class as a bad span, so it gets the same treatment: draw
    // nothing rather than draw a lie. The clue assertion is what stops these passing on an empty
    // board.
    it.each<[string, unknown]>([
      ['an object', [{}]],
      ['a null', [null]],
      ['a string', ['5']],
      ['a fraction', [5.5]],
    ])('draws no parenthetical when the enumeration holds %s', (_description, enumeration) => {
      const { container } = setup({
        ...crypticCluePuzzle,
        data: { ...crypticCluePuzzle.data, enumeration: enumeration as number[] },
      })

      expect(cluePlate(container)).toHaveProperty('textContent', CLUE)
      expect(screen.queryByText('letters.', { exact: false })).toBeNull()
    })

    // No sign row: `category` is absent by design for this type, because the definition half of the
    // clue IS the category and shipping one would say which words are the definition for free. So
    // there is nothing true to put in a band, and an empty band reads as chrome that failed to
    // load. The reveal's <h2> is the other thing this pins, and it has not been won yet.
    it('draws no heading before the win', () => {
      const { container } = setup()

      // Led with the clue for the same reason the picture test is: an absence assertion alone
      // cannot tell "no heading" from "no board".
      expect(cluePlate(container)).toHaveTextContent(CLUE)
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  // The two elements the shell orders into its bands. The component renders both and learns nothing
  // about either band; index.css does the placing, keyed off these classes.
  describe('the bench bands', () => {
    it('puts the clue in the board band and not in the instrument', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-board')).toContainElement(cluePlate(container) as HTMLElement)
      expect(container.querySelector('.lull-instrument')).not.toContainElement(cluePlate(container) as HTMLElement)
    })
  })

  describe('the answer box in the floor', () => {
    // The label is sr-only, so nothing on screen says "Your answer" -- the accessible name is the
    // only thing carrying it, and a role query is what defends that, because it reads the
    // accessibility tree rather than the markup.
    it('keeps its name without a visible label', () => {
      setup()

      expect(answerBox()).toHaveAccessibleName('Your answer')
    })

    // The component BUILDS this IDREF out of the puzzle id, and an IDREF that breaks is the one
    // accessibility fact a role query cannot always catch -- so both ends are resolved explicitly.
    // See CLAUDE.md.
    it('points its label at the box it names', () => {
      const { container } = setup()
      const target = container.querySelector('label[for]')?.getAttribute('for')

      expect(document.getElementById(String(target))).toBe(answerBox())
    })

    it('leaves the player’s typing alone', () => {
      setup()

      expect(answerBox()).toHaveAttribute('autocapitalize', 'none')
      expect(answerBox()).toHaveAttribute('autocorrect', 'off')
      expect(answerBox()).toHaveAttribute('spellcheck', 'false')
      expect(answerBox()).toHaveAttribute('autocomplete', 'off')
      expect(answerBox()).toHaveAttribute('data-1p-ignore')
      expect(answerBox()).toHaveAttribute('data-lpignore', 'true')
      expect(answerBox()).toHaveAttribute('data-form-type', 'other')
    })

    // A lone text input and a submit-shaped button inside a <form> is the login shape, and it adds
    // an implicit submit and a navigation this bench has no use for.
    it('is not a form', () => {
      setup()

      expect(answerBox().closest('form')).toBeNull()
    })

    it('puts the answer box and the control in the instrument band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(answerBox())
      expect(container.querySelector('.lull-board')).not.toContainElement(answerBox())
      expect(container.querySelector('.lull-instrument')).toContainElement(
        screen.getByRole('button', { name: 'Check' }),
      )
      expect(container.querySelector('.lull-instrument')).toContainElement(screen.getByRole('status'))
      // MOUNTED AND EMPTY, said in one assertion rather than left to fall out of the standing-line
      // tests. NVDA and JAWS announce changes inside a region they are already watching, so a
      // role="status" inserted with its text already in it is routinely missed -- and the first
      // message on this bench is the one that matters most.
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('puts the box before the control in the tab order', async () => {
      const { user } = setup()
      answerBox().focus()

      await user.tab()

      expect(screen.getByRole('button', { name: 'Check' })).toHaveFocus()
    })

    // The player arrives to read a clue. A field that grabbed focus would raise the software
    // keyboard over the one thing on the board before they had read it.
    it('does not grab focus when the board opens', () => {
      setup()

      expect(answerBox()).not.toHaveFocus()
    })

    // The composer contract: pressing Check must not take focus off the field, so the keyboard
    // stays up, nothing moves, and the message lands on a still screen.
    it('leaves focus in the box when the player checks', async () => {
      const { user } = setup()
      await user.type(answerBox(), 'waltz')

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(answerBox()).toHaveFocus()
    })
  })

  describe('the standing line', () => {
    it('stands in the floor rather than the board', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(screen.getByText(INSTRUCTION))
      expect(container.querySelector('.lull-board')).not.toContainElement(screen.getByText(INSTRUCTION))
    })

    // A SIBLING of the live region, never a child. A role="status" element that mounts with text
    // already in it is a region NVDA and JAWS were never watching, so putting the standing line
    // inside would cost this bench every announcement it makes.
    it('stays out of the live region', () => {
      setup()

      expect(screen.getByRole('status')).not.toContainElement(screen.getByText(INSTRUCTION))
    })

    it('is said once, not once per band', () => {
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

    // And takes it straight back, which is what lets the visible label go sr-only: the player is
    // never composing without an instruction on screen (WCAG 3.3.2). The middle assertion is the
    // whole test -- without it this passes on a bench where the line never left.
    it('comes back on the next keystroke', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Check' }))
      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()

      await user.type(answerBox(), 'T')

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
    })
  })

  describe('answering', () => {
    it('reports progress as the player types', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'TAN')

      expect(onProgress).toHaveBeenLastCalledWith('TAN')
    })

    // The whole of the adjudication, and it is normalizeAnswer's rather than this board's: case,
    // surrounding space and punctuation are all discarded. A cryptic answer is conventionally
    // written in caps and the field does not force them, so the fold has to be real.
    it.each([
      ['the answer in caps', 'TANGO'],
      ['the answer in lower case', 'tango'],
      ['the answer with space around it', ' Tango '],
      ['the answer with punctuation in it', 'tan-go'],
    ])('accepts %s', async (_description, value) => {
      const { user } = setup()

      await user.type(answerBox(), value)

      expect(onSolved).toHaveBeenCalled()
    })

    // Typing the last letter of a word you have just seen should not then require finding a control.
    it('solves without needing the check button', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'TANGO')

      expect(screen.getByRole('status')).toHaveTextContent('Solved. The answer is TANGO.')
    })

    it('does not solve an empty box', () => {
      setup()

      expect(onSolved).not.toHaveBeenCalled()
    })

    // THE ROW THAT ACTUALLY DEFENDS THE GUARD, and it needs a degenerate answer to do it. The test
    // above cannot: the only fixture answers TANGO, so '' and 'TANGO' compare unequal with or
    // without `normalizeAnswer(guess) !== ''` and the row is green either way. It still catches a
    // board that fired onSolved from a mount effect, which is why it stays.
    //
    // normalizeAnswer strips everything outside [A-Z0-9], so an em dash normalizes to ''. Drop the
    // guard and an untouched board is solved at mount: the ribbon reads `Solved. The answer is —.`
    // over an empty box. The ribbon assertion is the load-bearing half -- `solved` is derived, so a
    // board can be solved without onSolved having been called yet.
    it('does not solve against an answer that normalizes to nothing', () => {
      setup({ ...crypticCluePuzzle, data: { ...crypticCluePuzzle.data, answer: '—' } })

      expect(onSolved).not.toHaveBeenCalled()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    // THE ONE THAT LATCHES. Without the `typeof answer` operand these rows render a clue plate that
    // looks fine -- the empty-guess check short-circuits while the box is empty -- and then the
    // first keystroke writes progress BEFORE normalizeAnswer(answer) throws. The write lands, the
    // render does not, and every later load restores that character at mount and throws before the
    // player can touch anything. The pack is valid so readPack keeps it, and nothing validates a
    // progress string, so the puzzle stays unopenable.
    //
    // Typing is what makes these rows able to fail: at mount the board is fine either way.
    it.each<[string, unknown]>([
      ['left out of the pack', undefined],
      ['null', null],
      ['a number', 5],
    ])('takes a guess against an answer that arrived %s', async (_description, answer) => {
      const { user } = setup({ ...crypticCluePuzzle, data: { ...crypticCluePuzzle.data, answer: answer as string } })

      await user.type(answerBox(), 'T')

      expect(answerBox()).toHaveValue('T')
      expect(onSolved).not.toHaveBeenCalled()
    })

    it('does not solve a wrong guess', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'WALTZ')

      expect(onSolved).not.toHaveBeenCalled()
    })

    it('asks for an answer when the player checks an empty box', async () => {
      const { user } = setup()

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.getByRole('status')).toHaveTextContent('Type your answer first.')
    })

    // Says what to DO about the trick rather than restating the standing line, and deliberately
    // does not name the length: the enumeration is on screen beside the clue at all times, so a
    // message restating it would spend the ribbon to say nothing new.
    it('tells the player what to do when a checked answer is wrong', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'WALTZ')
      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.getByRole('status')).toHaveTextContent(
        'Not it. Read the clue twice — once for the definition, once for the wordplay.',
      )
    })

    // Where the shell's keyboard mitigations do not land, the OS keyboard covers the floor and its
    // own action key is the only control the player can reach.
    it('checks the answer when the player presses the keyboard’s action key', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'WALTZ{Enter}')

      expect(screen.getByRole('status')).toHaveTextContent('Not it.')
    })

    // An unfinished guess is not a wrong one, so the floor stays quiet until the player asks.
    it('says nothing about a half-typed guess', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'TAN')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('clears the wrong-answer message once the player edits the guess', async () => {
      const { user } = setup()
      await user.type(answerBox(), 'WALTZ')
      await user.click(screen.getByRole('button', { name: 'Check' }))

      await user.type(answerBox(), 'E')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
  })

  describe('restoring progress', () => {
    it('starts from the stored guess', () => {
      setup(crypticCluePuzzle, 'TAN')

      expect(answerBox()).toHaveValue('TAN')
    })

    it('starts empty when there is no stored guess', () => {
      setup()

      expect(answerBox()).toHaveValue('')
    })

    // State 12. A pack can be pruned and refetched, so a stored guess may be half-typed -- and a
    // half-typed guess is not a wrong one, so nothing may arrive in the live region as though it
    // were. The control assertion is what says the board is genuinely unsolved rather than merely
    // quiet.
    it('says nothing about a restored half-typed guess', () => {
      setup(crypticCluePuzzle, 'TAN')

      expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    // State 11, and the assertion a board that derived `solved` from the winning EVENT rather than
    // from the guess fails while passing everything else in this file.
    it('shows a stored correct guess as already solved', () => {
      setup(crypticCluePuzzle, 'TANGO')

      expect(screen.getByRole('status')).toHaveTextContent('Solved. The answer is TANGO.')
      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      // Solved is DERIVED, so reopening a won puzzle must not report the win a second time. A
      // `useEffect(() => { if (solved) onSolved() }, [])` would fire on every reopened board and
      // nothing else in this file would see it -- markSolved is idempotent, so the cost is a
      // redundant write rather than a wrong state, which is exactly why it needs saying here.
      expect(onSolved).not.toHaveBeenCalled()
    })
  })

  // A solved board is finished. The box that won it takes no further keystroke -- the way back in is
  // Play again, which empties it.
  describe('once solved', () => {
    it('offers Play again in place of Check', () => {
      setup(crypticCluePuzzle, 'TANGO')

      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument()
    })

    it('refuses another keystroke in the answer box', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.type(answerBox(), '!')

      expect(answerBox()).toHaveValue('TANGO')
    })

    it('reports nothing when the answer box is typed into', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.type(answerBox(), '!')

      expect(onProgress).not.toHaveBeenCalled()
    })

    // readOnly, NOT disabled. A disabled input leaves the tab order and is skipped by a screen
    // reader's forms mode, so the answer the player just won with would become unreachable to the
    // people most likely to want to re-read it. Both halves of that are asserted: `toBeEnabled` is
    // the attribute, and the focus call is the consequence -- jsdom refuses focus to a disabled
    // element, so the second line fails on the same one-word mistake the first one catches.
    it('leaves the winning answer readable and focusable', () => {
      setup(crypticCluePuzzle, 'TANGO')

      answerBox().focus()

      expect(answerBox()).toBeEnabled()
      expect(answerBox()).toHaveFocus()
    })

    // The winning keystroke is typed IN the field, so the field is the focused element at the
    // instant Check becomes Play again. Rebuilding the row would destroy it and drop focus to
    // <body>, from which the next Tab restarts at the top of the page.
    it('keeps the same box, and the focus in it, through the win', async () => {
      const { user } = setup()
      const before = answerBox()

      await user.type(before, 'TANGO')

      expect(answerBox()).toBe(before)
      expect(answerBox()).toHaveValue('TANGO')
      expect(answerBox()).toHaveFocus()
    })

    it('empties the answer box when the player plays again', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(answerBox()).toHaveValue('')
    })

    it('takes back the solved message when the player plays again', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    // Play again is a fresh puzzle, not merely an empty box, and the hint ladder is part of what
    // "fresh" means. The board cannot clear it itself -- `lull:hints:<puzzleId>` is storage, and a
    // board gets none -- so it names the event and the shell decides what that means.
    it('asks the shell to start the puzzle over when the player plays again', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onReset).toHaveBeenCalled()
    })

    // Both facts, on one press: the empty string is what a reopened puzzle restores from, and the
    // reset is what puts the ladder back. It cannot be folded into the empty string alone --
    // change('') is also what happens when a player selects their whole answer and deletes it, and
    // charging them their spent rungs for a backspace would be the bug this separation avoids.
    it('empties the board as well as starting it over', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    it('still empties the box when no reset callback is supplied', async () => {
      const user = setupWithoutReset('TANGO')

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(answerBox()).toHaveValue('')
    })

    it('takes a fresh guess once the player plays again', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.click(screen.getByRole('button', { name: 'Play again' }))
      await user.type(answerBox(), 'WALT')

      expect(answerBox()).toHaveValue('WALT')
    })
  })

  // ON AN UNSOLVED BOARD, and that is why these are not filed under `once solved` above. Neither
  // test ever wins, and both would be unreachable there: a solved board is readOnly, so "the player
  // deletes the guess" is a state it cannot enter. Filed under the win, the second name reads as a
  // case `readOnly` already forbids.
  describe('starting over is a press, never a keystroke', () => {
    // The direction that is actually load-bearing: emptying the field is not starting over. A board
    // that called onReset from `change` would charge the player their spent rungs for a backspace.
    it('says nothing about starting over while the player is still guessing', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'WALTZ')

      expect(onReset).not.toHaveBeenCalled()
    })

    // And the same in the state that reaches change('') by hand rather than by pressing anything:
    // the player deletes the guess they were composing. WALTZ above never reaches an empty string at
    // all, so it cannot see a board that fires the reset from `change` when `next` is ''. Every
    // keystroke here is a real one, and the last backspace is where such a board fails.
    it('says nothing about starting over when the player deletes the guess', async () => {
      const { user } = setup()
      await user.type(answerBox(), 'TAN')

      await user.type(answerBox(), '{Backspace}{Backspace}{Backspace}')

      expect(answerBox()).toHaveValue('')
      expect(onReset).not.toHaveBeenCalled()
    })
  })

  // The payoff of the type, and the only reader `definitionSpan`, `fodderSpan` and `device` have.
  // Two halves that cover each other's failure: a <mark> spliced into the clue for people who can
  // see it, and prose beneath the plate that carries the meaning for everyone else.
  describe('the reveal', () => {
    const REGION = 'How the clue worked'
    const DEFINITION_LINE = '“Dance” is the definition.'
    const HIDDEN_LINE = '“instant angora” hides TANGO.'

    // <mark> is the correct element -- "text marked or highlighted for reference purposes, due to
    // its relevance in another context" is a description of a solver's pencil underline. What is
    // asserted is that the element exists and what it contains, which is observable DOM, and never
    // a class or a computed style. The MARK constant's bg-transparent is stated in a comment beside
    // the code rather than tested, because the only available assertion would be a style one.
    it('marks nothing before the win', () => {
      const { container } = setup()

      // Led with the clue, because two absence assertions alone cannot tell "not solved yet" from
      // "board rendered nothing at all".
      expect(cluePlate(container)).toHaveTextContent(CLUE)
      expect(container.querySelector('mark')).toBeNull()
      expect(screen.queryByRole('region')).not.toBeInTheDocument()
    })

    // TWO ROWS, because one span is not enough to prove the mark comes from the pack. Every fixture
    // with a usable definition span uses [0, 5), so a board that hardcoded `Dance` -- still gated on
    // the span slicing -- passes the whole suite. The second row moves the span to the fodder's
    // offsets and asserts the mark follows it, which no constant can satisfy.
    it.each<[string, Puzzle<CrypticClueData>, string]>([
      ['the span the pack sent', crypticCluePuzzle, 'Dance'],
      [
        'a span somewhere else in the clue',
        {
          ...crypticCluePuzzle,
          data: { ...crypticCluePuzzle.data, definitionSpan: { end: 30, start: 16 } },
        },
        'instant angora',
      ],
    ])('underlines %s once the board is solved', async (_description, puzzle, marked) => {
      const { container, user } = setup(puzzle)

      await user.type(answerBox(), 'TANGO')

      expect(container.querySelector('mark')).toHaveTextContent(marked)
      expect(screen.getByText(`“${marked}” is the definition.`)).toBeInTheDocument()
    })

    // The splice changes the paragraph's CHILDREN and must not change its text. Pinned by value for
    // the same reason the fresh-board version of this assertion is: `toHaveTextContent` normalizes
    // whitespace, so a splice that dropped the space before `hidden` or doubled the one after
    // `Dance` would go on passing, and byte-exactness is the premise the pack's offsets stand on.
    it('leaves the clue’s text exactly as it was', async () => {
      const { container, user } = setup()

      await user.type(answerBox(), 'TANGO')

      // The splice has to have HAPPENED for this to mean anything: textContent reads identically
      // with and without the <mark>, so without this line the test is green on a board that never
      // spliced at all.
      expect(container.querySelector('mark')).not.toBeNull()
      expect(cluePlate(container)).toHaveProperty('textContent', `${CLUE} (5)5 letters.`)
    })

    // A role query, so this IS the accessible-name assertion for the aria-labelledby. <section>
    // with a name is a `region` landmark, which is the point: the reveal appears at the moment of
    // the win inside a band that scrolls independently of the floor, so on a short viewport it can
    // land below the fold. A landmark plus a heading means two ways to reach it by keyboard and
    // screen-reader navigation with nothing moving on screen.
    it('names the reveal as a landmark', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'TANGO')

      expect(screen.getByRole('region', { name: REGION })).toBeInTheDocument()
    })

    // The heading id is BUILT here with useId, and the region points at it. Both ends are asserted
    // -- see CLAUDE.md. Unlike aria-controls, aria-labelledby contributes to the accessible name, so
    // a broken IDREF also fails the role query above; the explicit resolution is asserted anyway,
    // because "both ends" is the rule and a second failure mode is not a reason to trust the first.
    it('points the region at the heading that names it', async () => {
      const { user } = setup()
      await user.type(answerBox(), 'TANGO')
      const target = screen.getByRole('region').getAttribute('aria-labelledby')

      expect(document.getElementById(target ?? '')).toBe(screen.getByRole('heading', { level: 2, name: REGION }))
    })

    it('names the definition in words', async () => {
      const { user } = setup()

      await user.type(answerBox(), 'TANGO')

      expect(screen.getByText(DEFINITION_LINE)).toBeInTheDocument()
    })

    // Nothing is announced and nothing takes focus, deliberately. The win happens on a keystroke IN
    // the answer field, so moving focus here would drop the software keyboard, move the layout, and
    // take the caret out of the box the player just won in. The ribbon already says the sentence
    // that matters, and the reveal holds no focusable element, so the tab order is unchanged.
    it('takes neither the focus nor the announcement', async () => {
      const { container, user } = setup()

      await user.type(answerBox(), 'TANGO')

      expect(answerBox()).toHaveFocus()
      expect(screen.getByRole('status')).not.toContainElement(screen.getByRole('region', { name: REGION }))
      expect(screen.getByRole('status')).toHaveTextContent('Solved. The answer is TANGO.')
      // NOT INSIDE the live region is the weaker half of "nothing is announced", and on its own it
      // is nearly a tautology -- the band split already puts these in different subtrees. A live
      // region of its OWN is the way this actually breaks: `aria-live="polite"` on the section
      // announces the whole reveal at the win, in competition with the ribbon, and every other
      // assertion in this file goes on passing. The accessibility sweep is the likeliest source of
      // exactly that edit, which is why the attribute is named here rather than left implied.
      expect(screen.getByRole('region', { name: REGION })).not.toHaveAttribute('aria-live')
      // The reveal holds no focusable element, so the tab order out of the box is unchanged by it.
      // Asserted after the win, because the only other tab-order test in this file runs before one.
      answerBox().focus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus()
      // And it stays in the band it belongs to. Moving the section into the floor would pass every
      // assertion above except this one.
      expect(container.querySelector('.lull-board')).toContainElement(screen.getByRole('region', { name: REGION }))
      expect(container.querySelector('.lull-instrument')).not.toContainElement(
        screen.getByRole('region', { name: REGION }),
      )
    })

    // Three devices, and the third is the one that matters: `device` is a two-member union arriving
    // as JSON off the network, and lull-api can ship a third before this build knows about it. A
    // lookup returning undefined would render `“instant angora” .` -- a sentence with a hole in it.
    // The unknown row is cast here rather than exported, because a pack is JSON and this shape is
    // not one the type system admits.
    it.each<[string, Puzzle<CrypticClueData>, string]>([
      ['a hidden word', crypticCluePuzzle, HIDDEN_LINE],
      ['an anagram', anagramCrypticClue, '“instant angora” is an anagram of TANGO.'],
      [
        'a device this build has never heard of',
        {
          ...crypticCluePuzzle,
          data: { ...crypticCluePuzzle.data, device: 'reversal' as unknown as CrypticDevice },
        },
        '“instant angora” is the wordplay.',
      ],
    ])('explains %s', async (_description, puzzle, line) => {
      const { user } = setup(puzzle)

      await user.type(answerBox(), 'TANGO')

      expect(screen.getByText(line)).toBeInTheDocument()
    })

    // State 8. A span whose end is past the clue underlines nothing, and the line it belongs to
    // goes with it -- but the other half of the reveal is still true and still worth saying.
    it('drops the mark and the definition line when the definition span does not slice', async () => {
      const { container, user } = setup(brokenSpanCrypticClue)

      await user.type(answerBox(), 'TANGO')

      expect(container.querySelector('mark')).toBeNull()
      expect(screen.getByRole('region', { name: REGION })).toBeInTheDocument()
      expect(screen.getByText(HIDDEN_LINE)).toBeInTheDocument()
      expect(screen.queryByText(DEFINITION_LINE)).toBeNull()
    })

    // State 9, the mirror case.
    it('keeps the mark and drops the wordplay line when the fodder span does not slice', async () => {
      const { container, user } = setup(brokenFodderCrypticClue)

      await user.type(answerBox(), 'TANGO')

      expect(container.querySelector('mark')).toHaveTextContent('Dance')
      expect(screen.getByRole('region', { name: REGION })).toBeInTheDocument()
      expect(screen.getByText(DEFINITION_LINE)).toBeInTheDocument()
      expect(screen.queryByText(HIDDEN_LINE)).toBeNull()
    })

    // State 10, and it is not "an empty section". A landmark named `How the clue worked` containing
    // nothing is worse than silence, and the player still gets the ribbon's sentence -- which is
    // what the last assertion is for: without it this passes on a board that never solves at all.
    it('draws no reveal when neither span slices', async () => {
      const { container, user } = setup(brokenSpansCrypticClue)

      await user.type(answerBox(), 'TANGO')

      expect(screen.queryByRole('region')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
      expect(container.querySelector('mark')).toBeNull()
      expect(screen.getByRole('status')).toHaveTextContent('Solved. The answer is TANGO.')
    })

    // State 11, at mount and with no keystroke. The reveal is rendered off `solved`, which is
    // DERIVED from the guess, exactly as the solved message and Play again already are -- so a
    // stored winning answer draws the mark and the landmark with nothing having happened.
    it('is already there when a stored winning answer restores the board', () => {
      const { container } = setup(crypticCluePuzzle, 'TANGO')

      expect(container.querySelector('mark')).toHaveTextContent('Dance')
      expect(screen.getByRole('region', { name: REGION })).toBeInTheDocument()
      expect(screen.getByText(DEFINITION_LINE)).toBeInTheDocument()
      expect(screen.getByText(HIDDEN_LINE)).toBeInTheDocument()
    })

    // It disappears the way it appeared. `solved` is derived from the guess, so Play again's empty
    // string takes the reveal, the mark and the solved message on one press with no teardown. A
    // reveal held in its own useState would survive the reset and sit under an empty board.
    //
    // The two assertions BEFORE the press are what stop this being an absence-only pair: without
    // them a board that gated the reveal on a latched win EVENT -- and therefore revealed nothing at
    // all on a restored board -- would pass this test while shipping state 11 broken.
    it('leaves on the same press that empties the box', async () => {
      const { container, user } = setup(crypticCluePuzzle, 'TANGO')
      expect(container.querySelector('mark')).not.toBeNull()
      expect(screen.getByRole('region', { name: REGION })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(container.querySelector('mark')).toBeNull()
      expect(screen.queryByRole('region')).not.toBeInTheDocument()
    })
  })

  // THE NAMED-PROPERTY SWEEP. Every row of the spec's state table promises something to a keyboard
  // or to a screen reader, and the rest of this file was walked row by row against that list. These
  // are the four promises no other test happened to pin. There is no rule engine here and there
  // must never be one: jest-axe is not a dependency of this repo, it passes markup that is valid and
  // useless -- a correctly formed button labeled "Button", a live region that announces at the wrong
  // moment -- and under jsdom it never sees layout, so it returns nothing either way on the two
  // facts this design actually risks.
  //
  // TWO PROMISES ARE DELIBERATELY NOT ASSERTED HERE, and they are named rather than skipped. The
  // focus ring is the global `:focus-visible` declaration, which is a computed style
  // (surface-inventory row 49 is the standing precedent for recording that fact instead of testing
  // it), and the dense case -- a 120-character clue at 320x568 -- is layout, which jsdom does not
  // perform at all. Both live in the inventory.
  describe('the accessibility contract', () => {
    // (a) The reveal appears at the moment of the win, INSIDE a band that scrolls independently, and
    // it must not join the tab order. If it ever holds a focusable element, the order stops being
    // field then control and a keyboard player lands somewhere new on a press they did not make.
    // The tab hop is asserted in `takes neither the focus nor the announcement` too; what is new
    // here is the subtree query, which fails on a focusable element the tab hop would step over --
    // a `tabIndex={-1}` heading, say, which is programmatically focusable, is a scroll target, and
    // never appears in a Tab sequence at all.
    it('adds nothing focusable to the tab order when the reveal appears', async () => {
      const { user } = setup()
      await user.type(answerBox(), 'TANGO')
      const reveal = screen.getByRole('region', { name: 'How the clue worked' })

      answerBox().focus()
      await user.tab()

      expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus()
      expect(reveal.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull()
    })

    // (b) Play again is pressed WITH FOCUS ON IT -- a click focuses the button -- and the control it
    // becomes is at the same position under a new name. Focus must stay there. A control rebuilt
    // rather than renamed would drop focus to <body>, from which the next Tab restarts at the top of
    // the page, and nothing else in this file would notice: every other Play again test asserts what
    // happened to the box, not to the caret.
    it('keeps focus on the control through Play again', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getByRole('button', { name: 'Check' })).toHaveFocus()
    })

    // (c) Heading navigation is one of the two ways the reveal is reachable, so a heading left
    // behind after a reset is a landmark label pointing at a board that no longer has a reveal. The
    // board is HEADINGLESS when it is not solved -- PuzzleFrame still emits the <h1> above it, so it
    // is headingless rather than unlabeled.
    //
    // The assertion before the press is what stops this being absence-only: without it the test is
    // green on a board whose reveal never drew a heading in the first place.
    it('leaves no heading behind after the board is reset', async () => {
      const { user } = setup(crypticCluePuzzle, 'TANGO')
      expect(screen.getByRole('heading', { level: 2, name: 'How the clue worked' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    // (d) aria-controls contributes nothing to an accessible name, so it can rot in total silence:
    // every role query in this file keeps passing while the relationship it asserts is gone. That
    // makes it the one IDREF a role query cannot defend, and the answer for a board that needs none
    // is to say so. This board builds no disclosure relationship -- the only aria-controls in the
    // app is the hint sheet's, asserted at both ends in its own suite, and gofigure follows it by
    // hand to decide whether to freeze its keyboard, so a second one appearing on this bench would
    // be read by code that is not looking for it. Button accepts the prop (button/index.tsx:123),
    // which is exactly how one arrives here by accident.
    //
    // BOTH STATES, because the reveal is markup that only exists in one of them, and each row names
    // its control so the row proves it reached the state it is named for rather than passing on a
    // board that rendered nothing.
    it.each<[string, string | null, string]>([
      ['fresh', null, 'Check'],
      ['solved', 'TANGO', 'Play again'],
    ])('builds no aria-controls on a %s board', (_description, progress, control) => {
      const { container } = setup(crypticCluePuzzle, progress)

      expect(cluePlate(container)).toHaveTextContent(CLUE)
      expect(screen.getByRole('button', { name: control })).toBeInTheDocument()
      expect(container.querySelector('[aria-controls]')).toBeNull()
    })
  })
})
