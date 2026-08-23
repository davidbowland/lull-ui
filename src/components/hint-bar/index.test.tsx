import { render, screen } from '@testing-library/react'
import userEvent, { UserEvent } from '@testing-library/user-event'
import React from 'react'

import { HintBar } from './index'
import { readHints, writeHints } from '@services/storage'
import { goFigureHints } from '@test/__mocks__'
import { HintLadder } from '@types'

jest.mock('@services/storage')

describe('HintBar', () => {
  // Rungs carry no `metadata` here on purpose. A phrase ladder never has one -- only goFigure's
  // rungs name an operator and a slot -- so this fixture is what the shared bar is actually handed
  // for three of the four games, and a bar that reached for metadata would fail against it.
  const hints: HintLadder = [
    { text: 'It is about persistence.' },
    { text: 'Robert Frost wrote a version of it.' },
    { text: "The last word is a preposition doing a verb's job." },
  ]
  const texts = hints.map((hint) => hint.text)
  const puzzleId = '2026-08-20:cryptogram:4b2c8a1d'

  const noop = (): void => undefined

  beforeAll(() => {
    jest.mocked(readHints).mockReturnValue(0)
  })

  const renderBar = (variant?: 'bare' | 'docked' | 'inline'): ReturnType<typeof render> =>
    render(<HintBar hints={hints} puzzleId={puzzleId} variant={variant} />)

  // Takes the test's ONE `userEvent` instance rather than building its own, and the difference is a
  // determinism rule rather than a style one. A bare `userEvent.setup()` carries the default
  // `delay: 0`, which puts a real `setTimeout` between every event in a sequence -- and a click is
  // seven or eight events. Those timers measure fine on an idle machine and get starved under
  // parallel workers, at which point the result of a test depends on how busy the box is. This
  // helper used to build a throwaway instance per press, so a three-press test opened three of them.
  const press = async (user: UserEvent, name: string): Promise<void> => {
    await user.click(screen.getByRole('button', { name }))
  }

  // Counted off the accessibility tree rather than the DOM: a rung inside the shut sheet is still
  // parsed and still findable by text, and what the sheet has to change is whether a reader can
  // reach it.
  const openRungs = (): string[] => screen.queryAllByRole('listitem').map((rung) => String(rung.textContent))

  const sheet = (): HTMLElement | null => screen.queryByRole('region', { name: 'Open hints' })

  // Finds the control by the name a SCREEN READER hears and returns the text a sighted player SEES,
  // so one call carries both halves of the split and the WCAG 2.5.3 relationship between them is
  // asserted rather than assumed. Two separate queries -- one by name, one by text -- could both
  // pass against two different buttons.
  const painted = (name: string): string => String(screen.getByRole('button', { name }).textContent)

  // The visible text and the accessible name come apart, and the reason is arithmetic on the
  // goFigure bench rather than anything about hints. Three controls share that 44px row -- Undo,
  // Clear and this one -- and at the 320px viewport `gofigure/index.tsx` establishes as supported
  // there are 288px to put them in. Undo (~72) plus Clear (~68) plus "Open hint 1 of 3" (~148) plus
  // two 12px gaps is ~312. The row is `flex-wrap`, so it does not truncate, it WRAPS -- and a wrap
  // adds 44 + 12 = 56px to a tray budgeted at 179px inside a 240px `--lull-seam`, which is the one
  // invariant every bench in this app keeps.
  //
  // Undo and Clear have no spare name to give: their visible text is already `Undo` and `Clear`, and
  // the long strings are their `aria-label`s, which cost no width. This control does, because WCAG
  // 2.5.3 requires the accessible name to CONTAIN the visible label and "Hint 1 of 3" is a substring
  // of "Open hint 1 of 3" once case is set aside, which 2.5.3 does. So the verb moves into the name
  // and the count stays on the screen.
  //
  // THESE ARE THE ONLY CHECK ON THAT, and there is no automated rule standing behind them: 2.5.3 is
  // a relationship between two strings a machine cannot tell apart from two unrelated strings, so
  // the pairing has to be asserted by hand, in the words the player sees and the words the reader
  // hears. So a new state added to `controlLabel` needs a new pair here, or its two halves can drift
  // apart with the whole suite green.
  //
  // The accessible name never moves, in any state or any variant, which is why the four other suites
  // that render this bar keep passing untouched -- every one of them finds the control by name.
  describe('the control label', () => {
    it('paints the count and says the verb', () => {
      renderBar()

      expect(painted('Open hint 1 of 3')).toBe('Hint 1 of 3')
    })

    // The reopen offer is split the same way rather than left whole, and the uniformity is the
    // point: a control whose visible text kept the verb in one state and dropped it in the next
    // would change register between two presses of the same button.
    it('paints the reopen offer without its verb as well', () => {
      jest.mocked(readHints).mockReturnValueOnce(2)

      renderBar()

      expect(painted('Show 2 hints')).toBe('2 hints')
    })

    it('agrees with itself in the singular', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')

      await press(user, 'Hide')

      expect(painted('Show 1 hint')).toBe('1 hint')
    })

    // The one state whose two halves are the same string, and it is the split applied rather than
    // the split skipped. There is no noun that says what this press does -- "Hints" would be a
    // heading, not a control, it would collide with the band's own visible "Hints" label on the
    // docked variant, and it breaks 2.5.3's containment on case. "Hide" alone would put a second
    // button reading exactly "Hide" beside the sheet's own, one inch away, doing the same thing.
    // It is also ten characters against "Hint 1 of 3"'s eleven, so it never binds the row.
    it('paints the hide state whole, because it has nothing to drop', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()

      await press(user, 'Show 3 hints')

      expect(painted('Hide hints')).toBe('Hide hints')
    })

    // Split in every variant, not only in the one that has to be. `controlLabel` takes no variant,
    // so there is one code path and one set of words -- and on the phrase benches the shorter text
    // is better copy rather than merely narrower, since the band beside it is already headed
    // "Hints" and the old label said the word twice within an inch.
    it('paints the same short text on the docked and inline benches', () => {
      renderBar('inline')

      expect(painted('Open hint 1 of 3')).toBe('Hint 1 of 3')
    })

    it('paints the same short text on the bare bench', () => {
      renderBar('bare')

      expect(painted('Open hint 1 of 3')).toBe('Hint 1 of 3')
    })
  })

  describe('the ladder', () => {
    it('offers the first rung and shows none of them', () => {
      renderBar()

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
      expect(openRungs()).toHaveLength(0)
    })

    it('opens the rung it named', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()

      await press(user, 'Open hint 1 of 3')

      expect(openRungs()).toEqual([texts[0]])
      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
    })

    it('persists the count it just opened', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()

      await press(user, 'Open hint 1 of 3')

      expect(writeHints).toHaveBeenCalledWith(puzzleId, 1)
    })

    // Read once, at mount. The frame keys this component on the puzzle id, so re-reading on every
    // render would hand it back its own writes.
    it('reads the stored count once and never again', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()

      await press(user, 'Open hint 1 of 3')

      expect(readHints).toHaveBeenCalledTimes(1)
    })

    // Storage holds the COUNT and nothing else, so the sheet has no memory to come back from. A
    // player who read a hint yesterday did not ask for it over the board again today -- the board
    // is what they came back for, and the rungs are one press away.
    it('comes back shut for a returning player', () => {
      jest.mocked(readHints).mockReturnValueOnce(2)

      renderBar()

      expect(sheet()).not.toBeInTheDocument()
      expect(openRungs()).toHaveLength(0)
    })

    // Shut is not unopened, and this is the whole reason the control reads the sheet before it
    // reads the ladder. With the bar coming back shut, a control that only ever opened the NEXT
    // rung would charge a returning player a hint to re-read the two they had already paid for.
    it('offers a returning player the rungs they own rather than the next one', () => {
      jest.mocked(readHints).mockReturnValueOnce(2)

      renderBar()

      expect(screen.getByRole('button', { name: 'Show 2 hints' })).toBeInTheDocument()
    })

    it('hands those rungs back without spending another', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(2)
      renderBar()

      await press(user, 'Show 2 hints')

      expect(openRungs()).toEqual([texts[0], texts[1]])
      expect(writeHints).not.toHaveBeenCalled()
    })

    // With the sheet open there is nothing left for the control to reveal but the ladder, so it
    // goes back to being the ladder.
    it('offers the next rung once the sheet is open', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(2)
      renderBar()

      await press(user, 'Show 2 hints')

      expect(screen.getByRole('button', { name: 'Open hint 3 of 3' })).toBeInTheDocument()
    })

    it('counts one reopened rung in the singular', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')

      await press(user, 'Hide')

      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toBeInTheDocument()
    })

    it('sets the bar inline when asked to', () => {
      renderBar('inline')

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // The case `hintsOf` newly admits, and the one goFigure hands the bar in controlled mode: a
    // ladder whose rungs carry `metadata`. The bar must not notice. It is asserted VERBATIM and in
    // arrival order rather than by any property of the metadata, because that is the whole contract
    // -- lull-api decides what a rung gives away and in what order the ladder reveals it, and this
    // component decides only when. The fixture's rung order is 1, 0, 2, so a bar that quietly sorted
    // by slot would come out left to right here and fail.
    it('renders a ladder whose rungs carry metadata exactly as it arrived', async () => {
      const user = userEvent.setup({ delay: null })
      render(<HintBar hints={goFigureHints} puzzleId={puzzleId} />)

      await press(user, 'Open hint 1 of 3')
      await press(user, 'Open hint 2 of 3')
      await press(user, 'Open hint 3 of 3')

      expect(openRungs()).toEqual([
        'The 2nd operator from the left is "+".',
        'The 1st operator from the left is "+".',
        'The 3rd operator from the left is "×".',
      ])
    })
  })

  // The end of the ladder, and the state that used to be a dead end. A player who spent all three
  // rungs and still could not see it had nowhere left to go; now the control offers the answer.
  //
  // The string is rendered VERBATIM and composed by the CALLER, exactly as `hint.text` is. This bar
  // knows what a phrase answer and a goFigure expression have in common -- nothing but being a
  // sentence somebody else wrote -- so it renders one and derives neither.
  describe('the answer', () => {
    const solution = 'The answer is NOTHING GOLD CAN STAY.'

    const renderWithAnswer = (opened: number): ReturnType<typeof render> => {
      jest.mocked(readHints).mockReturnValueOnce(opened)
      return render(<HintBar hints={hints} puzzleId={puzzleId} solution={solution} />)
    }

    const answerOnScreen = (): boolean => screen.queryByText(solution) !== null

    it('offers the answer once every rung is spent', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)

      await press(user, 'Show 3 hints')

      expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument()
    })

    // The rungs are the price. A bar that put the answer on screen beside rung 1 would make the
    // other two rungs pointless and the ladder a formality.
    it('offers no answer while a rung is still unspent', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(2)

      await press(user, 'Show 2 hints')

      expect(screen.getByRole('button', { name: 'Open hint 3 of 3' })).toBeInTheDocument()
      expect(answerOnScreen()).toBe(false)
    })

    it('keeps the answer out of the sheet until it is asked for', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)

      await press(user, 'Show 3 hints')

      expect(answerOnScreen()).toBe(false)
    })

    it('shows the answer it was given, verbatim', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      expect(screen.getByText(solution)).toBeInTheDocument()
    })

    // The rungs stay. A player who paid for three hints and then asked for the answer did not ask
    // to have the hints taken away, and the sheet is where they live.
    it('leaves the rungs listed beside it', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      expect(openRungs()).toEqual(texts)
    })

    // ONE PAST THE LADDER, which is the whole grammar of the reveal: `lull:hints:<puzzleId>` already
    // holds a count, and the answer is the count that no rung index is ever taken from.
    it('persists the reveal one past the ladder', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      expect(writeHints).toHaveBeenCalledWith(puzzleId, 4)
    })

    // Nothing left to reveal, so the control goes back to being the sheet's toggle -- the same thing
    // it did at the end of the ladder before there was an answer to offer.
    it('goes back to hiding once the answer is out', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      expect(screen.getByRole('button', { name: 'Hide hints' })).toBeInTheDocument()
    })

    // The returning player, whose stored count is the revealed one. The sheet comes back shut like
    // every other state, and what the control offers back is the ANSWER rather than the rungs: it is
    // what they last asked for and what they came back to read.
    it('offers the answer back to a returning player', () => {
      renderWithAnswer(4)

      expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument()
      expect(answerOnScreen()).toBe(false)
    })

    it('hands a returning player the answer and the rungs without charging again', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(4)

      await press(user, 'Show answer')

      expect(screen.getByText(solution)).toBeInTheDocument()
      expect(openRungs()).toEqual(texts)
      expect(writeHints).not.toHaveBeenCalled()
    })

    // The regression guard for every bench that has no answer to give. A bar handed no `solution`
    // must end its ladder exactly where it always did, or the last press becomes a button that
    // renames itself and shows nothing.
    it('still hides rather than offering an answer it was never given', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()

      await press(user, 'Show 3 hints')

      expect(screen.getByRole('button', { name: 'Hide hints' })).toBeInTheDocument()
    })

    // Starting over takes the answer back with the rungs. The bar holds no separate reveal state to
    // forget -- the count IS the reveal -- so this is the same reset the ladder already had, and the
    // test is here to say that on purpose rather than by accident.
    it('takes the answer back when the puzzle is started over', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      const { rerender } = render(<HintBar hints={hints} puzzleId={puzzleId} resetSignal={0} solution={solution} />)
      await press(user, 'Show 3 hints')
      await press(user, 'Show answer')

      rerender(<HintBar hints={hints} puzzleId={puzzleId} resetSignal={1} solution={solution} />)

      expect(answerOnScreen()).toBe(false)
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // The answer arrives in a region a reader is ALREADY watching, which is the only way NVDA and
    // JAWS announce it at all -- the same argument the rung list and the sheet header both turn on.
    it('announces the answer on the press that reveals it', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      expect(screen.getByRole('status')).toHaveTextContent(solution)
    })

    it('mounts the live region empty for a returning player who owns the answer', () => {
      renderWithAnswer(4)

      expect(screen.getByRole('status').textContent).toBe('')
    })

    // WCAG 2.4.3. The reveal press hides nothing, so focus has nowhere it needs to be rescued to --
    // and that is exactly why it is worth pinning: a future implementation that closed and reopened
    // the sheet to make the answer land in the live region would drop focus to <body>, from which
    // the next Tab restarts at the top of the page. The bug would be invisible in Chrome, which
    // focuses a button when a pointer press lands on it.
    it('leaves focus on the control that revealed the answer', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      expect(screen.getByRole('button', { name: 'Hide hints' })).toHaveFocus()
    })

    // The IDREF, resolved rather than merely present, in the state this task added. `aria-controls`
    // contributes nothing to an accessible name, so it is the one relationship in this repo that can
    // rot in total silence -- every role query keeps passing while the reference points at nothing.
    // The existing assertion covers the "Hide hints" end of the ladder; this state is new markup
    // reached by a new branch, and the sheet it names is the one now holding the answer.
    it('still names the sheet it controls once the answer is in it', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      const control = screen.getByRole('button', { name: 'Hide hints' })
      expect(control).toHaveAttribute('aria-expanded', 'true')
      const controls = control.getAttribute('aria-controls')
      expect(document.getElementById(controls ?? '')).toContainElement(screen.getByText(solution))
    })

    // The offer itself carries the relationship too, which is the state a keyboard player meets
    // BEFORE they press: the control says the sheet is open and says which sheet.
    it('names the sheet it controls while it is still offering the answer', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)

      await press(user, 'Show 3 hints')

      const control = screen.getByRole('button', { name: 'Show answer' })
      expect(control).toHaveAttribute('aria-expanded', 'true')
      const controls = control.getAttribute('aria-controls')
      expect(document.getElementById(controls ?? '')).toBeInTheDocument()
    })

    // The WCAG 2.5.3 pair for the new state, which `describe('the control label')` requires of every
    // state this bar can be in. Both halves are the same string here, like "Hide hints": there is no
    // noun form that says what the press does, and at eleven characters it is exactly as wide as
    // "Hint 1 of 3", so it never binds the goFigure row.
    it('paints the offer whole, in both the states that make it', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithAnswer(3)

      await press(user, 'Show 3 hints')
      expect(painted('Show answer')).toBe('Show answer')

      await press(user, 'Show answer')
      await press(user, 'Hide')
      expect(painted('Show answer')).toBe('Show answer')
    })
  })

  // The bar is handed its count instead of reading one, which is what lets the goFigure bench render
  // it inside the board's own subtree without that subtree touching storage. The shell keeps owning
  // persistence; the bench only owns the number.
  describe('controlled mode', () => {
    it('reports the reveal as one past the ladder and writes nothing', async () => {
      const user = userEvent.setup({ delay: null })
      const onOpen = jest.fn()
      render(
        <HintBar
          control={{ onOpen, opened: 3 }}
          hints={hints}
          puzzleId={puzzleId}
          solution="One winning answer is 6 + 9 + 7 × 7."
        />,
      )
      await press(user, 'Show 3 hints')

      await press(user, 'Show answer')

      expect(onOpen).toHaveBeenCalledWith(4)
      expect(writeHints).not.toHaveBeenCalled()
    })

    // Storage is not merely ignored, it is NOT REACHED. That is the whole reason the mode exists:
    // the goFigure bench renders this bar inside the board's own subtree, and `CLAUDE.md` names a
    // puzzle component's distance from storage as what makes the display-only rule structural
    // rather than aspirational. An assertion on the count alone would still pass a bar that read
    // storage and threw the answer away, so the spy is the test.
    //
    // `Show 2 hints` rather than `Open hint 3 of 3`: the sheet is shut at mount in both modes, and a
    // shut sheet with rungs already paid for offers them back before it offers the next one.
    it('reads its count from the prop, not from storage', () => {
      render(<HintBar control={{ onOpen: noop, opened: 2 }} hints={hints} puzzleId={puzzleId} />)

      expect(readHints).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Show 2 hints' })).toBeInTheDocument()
    })

    it('reports the next count and writes nothing', async () => {
      const user = userEvent.setup({ delay: null })
      const onOpen = jest.fn()
      render(<HintBar control={{ onOpen, opened: 1 }} hints={hints} puzzleId={puzzleId} />)
      await press(user, 'Show 1 hint')

      await press(user, 'Open hint 2 of 3')

      expect(onOpen).toHaveBeenCalledWith(2)
      expect(writeHints).not.toHaveBeenCalled()
    })

    // The bar reports and does not remember. A controlled owner that ignores the report -- `noop`
    // here -- must leave the count exactly where it was, because the prop is the only thing that
    // moves it. A bar that also advanced its own copy would drift out of step with the board that
    // owns the number, and the drift would only show up after the owner declined a rung.
    it('advances nothing on its own when the owner ignores the report', async () => {
      const user = userEvent.setup({ delay: null })
      render(<HintBar control={{ onOpen: noop, opened: 0 }} hints={hints} puzzleId={puzzleId} />)

      await press(user, 'Open hint 1 of 3')

      expect(openRungs()).toHaveLength(0)
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // The declined press is the one that used to end in a trap, and this is the assertion the test
    // above was missing. The sheet opens on any press -- it is a view concern and the owner is never
    // told about it -- so declining leaves a sheet drawn over the board with an empty list in it. Its
    // header used to be gated on there being a rung, so that sheet carried no Hide button, and
    // pressing the control again re-entered the same branch: Escape was the only way out, and a
    // touch device does not have one. goFigure is the owner with every reason to decline -- a solved
    // board, a slot already locked -- so this is reachable rather than theoretical.
    it('leaves a way out of the sheet when the owner ignores the report', async () => {
      const user = userEvent.setup({ delay: null })
      render(<HintBar control={{ onOpen: noop, opened: 0 }} hints={hints} puzzleId={puzzleId} />)

      await press(user, 'Open hint 1 of 3')

      expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument()
    })

    // The guard against putting `opened` into state, and the only test that can tell the two
    // implementations apart. The uncontrolled count lives in a LAZY `useState(() => readHints(...))`
    // whose initializer runs exactly once, so a prop threaded through it takes its mount value and
    // then never moves again however loudly the owner reports. The count has to be computed on every
    // render instead.
    //
    // The sheet is opened first so the assertion reads the LADDER rather than the reopen offer, and
    // so the rungs are on screen to be counted: the round trip this stands in for is a goFigure hint
    // placing an operator, the board raising its count, and the new rung having to appear in a sheet
    // that is already open.
    it('re-renders when the controlled count changes', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = render(<HintBar control={{ onOpen: noop, opened: 0 }} hints={hints} puzzleId={puzzleId} />)
      await press(user, 'Open hint 1 of 3')

      rerender(<HintBar control={{ onOpen: noop, opened: 2 }} hints={hints} puzzleId={puzzleId} />)

      expect(screen.getByRole('button', { name: 'Open hint 3 of 3' })).toBeInTheDocument()
      expect(openRungs()).toEqual([texts[0], texts[1]])
    })

    // The sheet is a VIEW concern in both modes -- the owner is told the count and nothing else, so
    // it cannot be handed a shut sheet it did not ask about. What it can never be is an open sheet
    // with no way out, which is why the Hide button is asserted here alongside the sheet rather than
    // left to the test above: "the sheet is open" and "the sheet can be closed" are one condition in
    // the markup now and they are asserted together here.
    it('opens the sheet on a press without being told to', async () => {
      const user = userEvent.setup({ delay: null })
      render(<HintBar control={{ onOpen: noop, opened: 0 }} hints={hints} puzzleId={puzzleId} />)

      await press(user, 'Open hint 1 of 3')

      expect(sheet()).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument()
    })

    it('still reads and writes storage when it is left uncontrolled', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()

      await press(user, 'Open hint 1 of 3')

      expect(writeHints).toHaveBeenCalledWith(puzzleId, 1)
    })
  })

  // Only the control and the sheet it opens. `inline` was built for the tile bench and does not fit
  // this one: its `py-2` makes 60px out of a 44px row, and its `px-4` re-applies a gutter the tray
  // already carries.
  describe('the bare variant', () => {
    // The labeled <section> goes WITH the label, not after it. Dropping the visible "Hints" text
    // alone would leave `aria-labelledby` pointing at an id no longer in the document, and the
    // section that carried it would then be an UNNAMED region nested inside the tray's own region.
    //
    // Which is why the check is `queryAllByRole('region')` and not the named query alone: a region
    // whose name resolved to nothing is exactly what the half-done removal produces, and a query for
    // the name "Hints" cannot see it. Asking for regions of ANY name is what catches the dangling
    // reference through the only thing it changes that a test can observe -- an extra landmark.
    it('renders no region of its own', () => {
      renderBar('bare')

      expect(screen.queryAllByRole('region')).toHaveLength(0)
      expect(screen.queryByText('Hints')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // Nothing load-bearing is lost with the label and the rungs. The rungs were already aria-hidden
    // scenery, and the WCAG 1.4.1 argument rests on the control counting rungs out in words, which
    // `bare` keeps unchanged.
    it('keeps the control counting the ladder out in words', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar('bare')

      await press(user, 'Open hint 1 of 3')

      expect(openRungs()).toEqual([texts[0]])
      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
    })

    it('still names the sheet it opens', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar('bare')

      await press(user, 'Open hint 1 of 3')

      expect(sheet()).toBeInTheDocument()
    })
  })

  describe('the spent ladder', () => {
    // Once there is nothing left to reveal the control becomes the sheet's toggle. It used to say
    // "All hints open" and refuse the press, which is a true statement of the state and a useless
    // control: the sheet covers the whole board on a phone, and Escape was its only other exit.
    it('turns into the sheet toggle and opens no new rung', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()
      await press(user, 'Show 3 hints')

      await press(user, 'Hide hints')

      expect(screen.getByRole('button', { name: 'Show 3 hints' })).toBeInTheDocument()
      expect(writeHints).not.toHaveBeenCalled()
    })

    it('can be reopened by pointer after it is hidden', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()
      await press(user, 'Show 3 hints')
      await press(user, 'Hide hints')

      await press(user, 'Show 3 hints')

      expect(screen.getByText('It is about persistence.')).toBeVisible()
    })

    // The relationship the old flowed drawer carried and the first version of this bar dropped.
    it('names the sheet it controls and reports whether it is open', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()

      await press(user, 'Show 3 hints')

      expect(screen.getByRole('button', { name: 'Hide hints' })).toHaveAttribute('aria-expanded', 'true')

      // RESOLVED, not merely present, and that distinction is the whole reason this line is here.
      // `aria-controls` contributes nothing to an accessible name, so it is the one IDREF in this
      // repo that can rot in total silence: every role query keeps passing, the sheet keeps
      // rendering, and only a screen-reader user relating the two ever notices. `aria-labelledby`
      // and `htmlFor` cannot rot this way -- break either and the element loses its name, so a
      // `getByRole(..., { name })` somewhere fails.
      //
      // It also stopped being decoration. goFigure follows this attribute to find the sheet and
      // decide whether to freeze its keyboard, and a dangling id there reads as "sheet shut" -- the
      // board stays playable, so it fails safe, but the guard never fires again and arrows are stolen
      // from a sheet the player is trying to scroll.
      const control = screen.getByRole('button', { name: 'Hide hints' })
      expect(document.getElementById(control.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
    })

    it('reports the sheet shut before it is opened', () => {
      jest.mocked(readHints).mockReturnValueOnce(3)

      renderBar()

      expect(screen.getByRole('button', { name: 'Show 3 hints' })).toHaveAttribute('aria-expanded', 'false')
    })

    // Escape is the only way to reach a shut sheet with every rung open, and "All hints open" there
    // would be a dead end -- the control refuses the press, so nothing would bring them back.
    it('offers the open rungs back once the sheet is shut', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()
      await press(user, 'Show 3 hints')
      await user.keyboard('{Escape}')

      await press(user, 'Show 3 hints')

      expect(openRungs()).toEqual(texts)
    })
  })

  describe('the sheet', () => {
    it('opens when a rung opens', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()

      await press(user, 'Open hint 1 of 3')

      expect(sheet()).toBeInTheDocument()
    })

    it('closes on Escape and hands focus back to the control that opened it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')
      await user.click(screen.getByRole('region', { name: 'Open hints' }))

      await user.keyboard('{Escape}')

      expect(sheet()).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toHaveFocus()
    })

    it('stays open under any other key', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')

      await user.keyboard('{ArrowDown}')

      expect(sheet()).toBeInTheDocument()
    })

    // The gap this closed. The bar's own control is the LADDER, so while a rung is still unspent it
    // reads "Open hint 2 of 3" and opening is the only thing it can do -- which left a player who
    // simply wanted the phrase back with two exits: Escape, which a touch device does not have, or
    // spending every remaining hint to turn the control into "Hide hints". Wanting to see the board
    // again cost a hint.
    it('can be hidden while rungs are still unspent', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')

      await press(user, 'Hide')

      expect(sheet()).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toBeInTheDocument()
    })

    it('hands focus back to the bar when it is hidden', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')

      await press(user, 'Hide')

      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toHaveFocus()
    })

    // Hiding is not spending. The rung stays open, so the next press of the bar's control offers
    // the rung AFTER it rather than re-charging for the one already read.
    it('opens no rung and spends nothing when it is hidden', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')

      await press(user, 'Hide')

      expect(writeHints).toHaveBeenCalledTimes(1)
    })

    it('offers no way to hide a sheet with nothing in it', () => {
      renderBar()

      expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument()
    })

    // THE SHEET ITSELF IS A TAB STOP, and it has to be: it scrolls, every rung inside it is plain
    // text, and a scrollable box with no focusable descendant cannot be scrolled from the keyboard
    // at all. Nothing automated finds this in jsdom -- nothing is laid out, so the box never reports
    // itself as scrollable and the rule that would fire never sees anything to fire on. Tabbing to
    // it is the only check there is.
    //
    // Backwards from the control, because the sheet is drawn BEFORE the control in the document and
    // the press that opened it left focus on the control. Two steps: the sheet's own Hide button
    // first, then the sheet.
    it('is reachable from the keyboard, so a player can scroll it', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await press(user, 'Open hint 1 of 3')

      await user.tab({ shift: true })
      await user.tab({ shift: true })

      expect(sheet()).toHaveFocus()
    })

    it('is reachable from the keyboard on the bare bench too', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar('bare')
      await press(user, 'Open hint 1 of 3')

      await user.tab({ shift: true })
      await user.tab({ shift: true })

      expect(sheet()).toHaveFocus()
    })

    it('ignores Escape while it is already shut', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()
      await user.tab()

      await user.keyboard('{Escape}')

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })
  })

  // The shell raises a count when the player starts the puzzle over. It is a prop and an effect
  // rather than a changed `key` on this component, and every test here is about something the
  // remount destroyed: the focused control, the live region, and the second reset.
  describe('starting the puzzle over', () => {
    const renderResettable = (signal: number): ReturnType<typeof render> =>
      render(<HintBar hints={hints} puzzleId={puzzleId} resetSignal={signal} />)

    const rerenderWith = (rerender: (ui: React.ReactElement) => void, signal: number): void => {
      rerender(<HintBar hints={hints} puzzleId={puzzleId} resetSignal={signal} />)
    }

    it('puts the ladder back to its first rung', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderResettable(0)
      await press(user, 'Open hint 1 of 3')

      rerenderWith(rerender, 1)

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    it('takes the opened rungs back off the board', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderResettable(0)
      await press(user, 'Open hint 1 of 3')

      rerenderWith(rerender, 1)

      expect(sheet()).not.toBeInTheDocument()
      expect(openRungs()).toHaveLength(0)
    })

    // A reset used to be silent. The focused button is renamed from "Open hint 2 of 3" back to
    // "Open hint 1 of 3" and screen readers do not re-read a focused element when its label changes,
    // the rung markers are aria-hidden, and the sheet just disappears -- so a player who pressed
    // Play again heard the board's news and nothing at all about the ladder.
    it('says the ladder went back', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderResettable(0)
      await press(user, 'Open hint 1 of 3')

      rerenderWith(rerender, 1)

      expect(screen.getByRole('status')).toHaveTextContent('Hints reset.')
    })

    // The same sentence twice is not a change, so re-rendering the same text node would announce
    // nothing on the second reset. The node is keyed on the signal, which makes React remove it and
    // insert a fresh one -- and an inserted node is what aria-atomic="false" reads out. Asserted on
    // node identity because that IS the mechanism; the text is identical either way.
    it('says it again on the second reset', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderResettable(0)
      await press(user, 'Open hint 1 of 3')
      rerenderWith(rerender, 1)
      const first = screen.getByText('Hints reset.')

      rerenderWith(rerender, 2)

      expect(screen.getByText('Hints reset.')).not.toBe(first)
    })

    // Read once and then taken down. Left standing it would sit in the live region beside the rung
    // the player has just opened, and a reader working through the region would meet a sentence
    // about a reset two presses old.
    it('stops saying it once the player opens a rung again', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderResettable(0)
      await press(user, 'Open hint 1 of 3')
      rerenderWith(rerender, 1)

      await press(user, 'Open hint 1 of 3')

      expect(screen.queryByText('Hints reset.')).not.toBeInTheDocument()
    })

    // The bug that ended the remount. A changed key destroys the subtree unconditionally and React
    // has no focus handling to go with it, so the control the player was standing on stopped
    // existing and focus fell to <body> -- from which the next Tab restarts at the top of the page.
    // Focus is put on the control directly rather than by clicking it, because Safari on macOS and
    // iOS and Firefox on macOS do not focus a <button> on click and jsdom emulates Chrome, which
    // does: a click-driven test can only reproduce the browsers where the bug was invisible.
    it('keeps focus on the control it was on', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderResettable(0)
      const control = screen.getByRole('button', { name: 'Open hint 1 of 3' })
      control.focus()
      await user.keyboard('{Enter}')

      rerenderWith(rerender, 1)

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
    })

    // The other half of the same rule, and the reason the effect asks before it moves focus. Hide
    // lives INSIDE the sheet the reset is about to close, so focus standing there has to be rescued
    // -- the same move `close` makes, for the same reason, in the same order.
    it('rescues focus out of the sheet it closes', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderResettable(0)
      await press(user, 'Open hint 1 of 3')
      screen.getByRole('button', { name: 'Hide' }).focus()

      rerenderWith(rerender, 1)

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
    })

    // A rescue, not a grab. The press that causes a reset is on the BOARD's Play again, and in
    // Chrome that button holds focus by the time the signal arrives -- so a bar that called `close`
    // unconditionally would pull focus out of the board and into the hint bar for a press that had
    // nothing to do with hints. The outside button here stands in for it.
    it('leaves focus alone when it is somewhere else entirely', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = render(
        <>
          <button type="button">Play again</button>
          <HintBar hints={hints} puzzleId={puzzleId} resetSignal={0} />
        </>,
      )
      await press(user, 'Open hint 1 of 3')
      const elsewhere = screen.getByRole('button', { name: 'Play again' })
      elsewhere.focus()

      rerender(
        <>
          <button type="button">Play again</button>
          <HintBar hints={hints} puzzleId={puzzleId} resetSignal={1} />
        </>,
      )

      expect(document.activeElement).toBe(elsewhere)
    })

    // The default, and what keeps every other caller unaffected. A bar with no shell behind it --
    // the controlled `bare` bar on the goFigure bench, whose owner moves `control.opened` itself --
    // never enters the effect at all, so nothing it holds is disturbed and nothing is announced.
    it('does nothing at all without a signal', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = renderBar()
      await press(user, 'Open hint 1 of 3')

      rerender(<HintBar hints={hints} puzzleId={puzzleId} />)

      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
      expect(screen.queryByText('Hints reset.')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    // role="status" carries an implicit aria-atomic="true" in ARIA 1.2, under which opening rung 3
    // re-reads rungs 1 and 2 with it. The explicit "false" is what makes one rung one announcement.
    it('announces the new rung rather than the whole ladder', async () => {
      const user = userEvent.setup({ delay: null })
      renderBar()

      await press(user, 'Open hint 1 of 3')

      const region = screen.getByRole('status')
      expect(region).toHaveAttribute('aria-atomic', 'false')
      expect(region).toHaveTextContent(texts[0])
    })

    // A live region inserted with content already in it is routinely missed by NVDA and JAWS, which
    // announce changes inside a region they are already watching.
    it('mounts the live region empty', () => {
      renderBar()

      expect(screen.getByRole('status').textContent).toBe('')
    })

    // The same property, checked on the two callers the docked bar's own arrangement says nothing
    // about. `bare` drops the band's label and its rung markers, and a controlled bar reads its
    // count off a prop instead of off storage -- either could have put something inside the region
    // on the first render without the test above noticing. All three hold for the same structural
    // reason rather than by luck: the region holds the reset line, which needs a signal, the sheet's
    // header, which needs an open sheet, and the rung list, which now needs an open sheet too --
    // and all three arrive at nothing on a first render, in every variant and both modes.
    it('mounts the live region empty on the bare variant too', () => {
      renderBar('bare')

      expect(screen.getByRole('status').textContent).toBe('')
    })

    it('mounts the live region empty when the count comes from an owner', () => {
      render(<HintBar control={{ onOpen: noop, opened: 0 }} hints={hints} puzzleId={puzzleId} />)

      expect(screen.getByRole('status').textContent).toBe('')
    })

    // The RETURNING player, and the case the three tests above could not reach. `hidden` does not
    // empty a subtree: it takes the sheet out of the accessibility tree while leaving every node
    // inside it in the document. So a stored count of 2 used to mount two <li> already inside the
    // role="status" region -- exactly the arrangement NVDA and JAWS are documented to miss -- and it
    // swallowed the FIRST announcement of the session for the players most likely to open a rung,
    // the ones who already know where the ladder is.
    //
    // Gating the list on the sheet being open changes what the sheet HOLDS rather than what it says.
    // The rungs were already invisible and already out of the accessibility tree, so nothing a
    // player can see or hear changes except the one announcement that now lands.
    //
    // Asserted on the region's text rather than on the list, because the missed announcement is the
    // bug and an empty region is the property that prevents it. `openRungs()` was already 0 here --
    // see "comes back shut for a returning player" -- which is precisely why that test could not
    // catch this: role queries skip the hidden subtree, and the live region does not.
    it('mounts the live region empty for a returning player who owns rungs', () => {
      jest.mocked(readHints).mockReturnValueOnce(2)

      renderBar()

      expect(screen.getByRole('status').textContent).toBe('')
    })

    it('names the bar', () => {
      renderBar()

      expect(screen.getByRole('region', { name: 'Hints' })).toBeInTheDocument()
    })
  })
})
