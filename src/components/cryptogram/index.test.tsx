import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { CryptogramBoard } from './index'
import { cryptogramPuzzle, hiddenCategoryCryptogram } from '@test/__mocks__'
import { CryptogramData, Puzzle } from '@types'

describe('CryptogramBoard', () => {
  const onProgress = jest.fn()
  const onSolved = jest.fn()

  // One session per test, never the default export's own. `userEvent.click(...)` off the default
  // export is the v13 API: under v14 it builds a throwaway session with the default 0ms advance
  // timer, which puts a real setTimeout between every event of every interaction. This file drives
  // ~100 of them, and that alone is what made this suite fail under parallel load and pass in
  // isolation.
  const renderBoard = (
    puzzle: Puzzle<CryptogramData> = cryptogramPuzzle,
    progress: string | null = null,
  ): ReturnType<typeof render> =>
    render(<CryptogramBoard onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />)

  const setup = (
    puzzle: Puzzle<CryptogramData> = cryptogramPuzzle,
    progress: string | null = null,
  ): ReturnType<typeof userEvent.setup> => {
    const user = userEvent.setup({ delay: null })
    renderBoard(puzzle, progress)
    return user
  }

  // The squares ARE the accessible representation of the phrase. There is no parallel sr-only run:
  // one would make a screen reader read the phrase twice, and marking the squares aria-hidden to
  // prevent that is an aria-hidden-focus violation the axe assertion below would catch.
  // One cipher letter used exactly once, so the singular of the assignment message has a board to
  // happen on. The fixture's own phrase repeats every letter three times, which is what makes it a
  // good fixture and a useless one for this.
  const singleUsePuzzle: Puzzle<CryptogramData> = {
    ...cryptogramPuzzle,
    data: { ...cryptogramPuzzle.data, answer: 'Ate ate teas', ciphertext: 'VZE VZE ZEVQ' },
  }

  // One word longer than a line holds at the 24px floor. Words never break, so the squares shrink
  // to fit the longest word instead -- and this is the only phrase where even the floor is not
  // enough and the row itself has to give.
  const longWordPuzzle: Puzzle<CryptogramData> = {
    ...cryptogramPuzzle,
    data: { ...cryptogramPuzzle.data, answer: 'Pangram', ciphertext: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  }

  // SEEK covers a doubled cipher letter (RR) with a square after it, which is the run the advance
  // steps over; THAT covers a split repeat (X...X), which it must NOT step over, since the two X
  // squares are not adjacent. Together they cross a word boundary at idx 3 -> 4. G=S R=E Q=K X=T
  // L=H B=A.
  //
  // Both words on one board rather than one each, so the advance is never blocked by a solve
  // part-way through a trace: on a phrase that IS only XLBX the third keystroke wins the game, and
  // every assertion about where the caret went next would be an assertion about a finished board.
  const runsPuzzle: Puzzle<CryptogramData> = {
    ...cryptogramPuzzle,
    data: { ...cryptogramPuzzle.data, answer: 'Seek that', ciphertext: 'GRRQ XLBX' },
  }

  // The two runs at the edges of the rule, neither of which any other fixture has. `MNPP PQVNPP` is
  // LESS STRESS under M=L N=E P=S Q=T V=R, so idx 0-9 are M,N,P,P,P,Q,V,N,P,P.
  //
  // The P run at idx 2-4 SPANS THE WORD GAP: `squares` is numbered continuously across words, so
  // adjacency is index adjacency and the caret leaps 20px of WORD_GAP in one move. The P run at idx
  // 8-9 REACHES THE END: nothing to the right of idx 8 differs, so `nextOf` finds no square and the
  // caret parks on idx 9, the last square of the run the keystroke just filled through to the end
  // of the phrase.
  const edgeRunsPuzzle: Puzzle<CryptogramData> = {
    ...cryptogramPuzzle,
    data: { ...cryptogramPuzzle.data, answer: 'Less stress', ciphertext: 'MNPP PQVNPP' },
  }

  const square = (name: string): HTMLElement => screen.getByRole('button', { name })
  // The square and the cipher letter captioned under it. The caption is a LABEL for the control,
  // not a second control, so it sits outside the button -- which means the cell, not the button, is
  // the box that holds both marks.
  const cell = (name: string): HTMLElement => square(name).parentElement as HTMLElement
  const key = (name: string): HTMLElement => screen.getByRole('button', { name })
  const pad = (): HTMLElement => screen.getByRole('group', { name: 'Letters, and what each one is on' })
  // The floor's ribbon. The board no longer carries a live region of its own -- FloorBar owns the
  // one on the bench, and the component hands it the message.
  const ribbon = (): HTMLElement => screen.getByRole('status')

  // 'EEVAZT' is { E: E, V: A, Z: T } encoded -- sorted cipher-plain pairs. Under it VZE VZE ZEV
  // spells ATE ATE TEA, which is the fixture's answer.
  const SOLVED = 'EEVAZT'
  // Every square full and the phrase wrong -- V is B where the answer wants A, so the board reads
  // BTE BTE TEB. The endgame state: no square is empty, so every advance the caret makes lands it
  // on a letter the player did not put it on, and every stray tap has something to lose.
  const FULL_AND_WRONG = 'EEVBZT'

  describe('the phrase', () => {
    it('gives every ciphertext letter its own square', () => {
      setup()

      expect(screen.getAllByRole('button', { name: /^Cipher / })).toHaveLength(9)
    })

    // The ciphertext has to be ON SCREEN. Which squares repeat is the entire information content of
    // a cryptogram -- it is what the player counts, and it is the only thing to reason from before
    // the first letter goes down. A board that carried the cipher letter in aria-label alone would
    // be solvable by a screen-reader user and by nobody else, and every query in this file resolves
    // by accessible name, so nothing else here would notice.
    it('captions every square with its cipher letter', () => {
      setup()

      expect(within(cell('Cipher V, letter 1 of 9, empty')).getByText('V')).toBeInTheDocument()
    })

    // Both at once, because the player is reading the pattern and their own guess together: take
    // the cipher letter away once a square is filled and the repeats stop being countable exactly
    // when the player is checking them. The guess goes IN the square and the cipher letter stays
    // under it, so the two never have to share the box.
    it('keeps showing the cipher letter after a letter is placed on it', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(square('Cipher V, letter 1 of 9, holds A')).toHaveTextContent('A')
      expect(within(cell('Cipher V, letter 1 of 9, holds A')).getByText('V')).toBeInTheDocument()
    })

    it('names a square with its cipher letter, its position, and what it holds', () => {
      setup()

      expect(square('Cipher V, letter 1 of 9, empty')).toBeInTheDocument()
    })

    // Words are groups so a screen reader can move by word, and the label carries the whole word --
    // including in the one case where the row itself has to wrap, so assistive tech never sees it.
    it('groups the squares into words', () => {
      setup()

      expect(screen.getByRole('group', { name: 'Word 1 of 3, V Z E' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Word 3 of 3, Z E V' })).toBeInTheDocument()
    })

    // The sign over the working surface, not a heading and a tally: the category is a fact about
    // the phrase, the same weight as the count opposite it, and a lone <h2> above a board that
    // already sits under the page's <h1> buys a heading level for a word.
    it('shows the category on the sign line', () => {
      setup()

      expect(screen.getByText('Saying')).toBeInTheDocument()
      expect(screen.getByText('0 of 9 squares filled')).toBeInTheDocument()
    })

    it('leaves the category out of the sign line when difficulty hides it', () => {
      setup(hiddenCategoryCryptogram)

      expect(screen.queryByText('Saying')).not.toBeInTheDocument()
      expect(screen.getByText('0 of 9 squares filled')).toBeInTheDocument()
    })

    // A word no line can hold keeps its group and every one of its squares. The group's label
    // carries the whole word, so a screen reader reads one word however the row had to fall.
    it('keeps a very long word whole for a screen reader', () => {
      setup(longWordPuzzle)

      expect(
        screen.getByRole('group', { name: 'Word 1 of 1, A B C D E F G H I J K L M N O P Q R S T U V W X Y Z' }),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Cipher / })).toHaveLength(26)
    })

    // Squares, not cipher letters. "1 of 3 letters placed" counts the player's bookkeeping; this
    // counts what is on screen, which is what the player is looking at.
    it('counts the squares that show a letter', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(screen.getByText('3 of 9 squares filled')).toBeInTheDocument()
    })
  })

  // The six rows of the spec's table, through the UI this time. Rows 3, 5 and 6 change something the
  // player is not looking at, so each names it: an unannounced state change is lost work.
  describe('assigning a letter', () => {
    it('row 1: asks for a square first when nothing is selected', async () => {
      const user = setup()

      await user.click(key('A, not used yet'))

      expect(ribbon()).toHaveTextContent('Tap a square first, then a letter.')
    })

    it('row 2: puts a free letter on an empty square and says how many moved', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(ribbon()).toHaveTextContent('Every V is A now — 3 squares.')
    })

    // Asserted whole, tail included, because this is the one press where the tail can be built from
    // the wrong mapping and still read as a sentence: the caret lands on a Z square that the very
    // assignment being announced has just emptied, so the `mapping` STATE would say "holds A" here
    // and only `result.mapping` says "empty". A substring assertion on the first half would hide
    // that entirely.
    it('row 3: names the square it stole the letter from, and where the caret went', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, on cipher Z'))

      expect(ribbon()).toHaveTextContent(
        'Every V is A now — 3 squares. Z is empty again. Now on Cipher Z, letter 2 of 9, empty.',
      )
    })

    // Row 4 is no longer reachable from the letter path at all: pressing the letter a square already
    // shows is the free keystroke, and it changes nothing. The row itself survives -- Backspace
    // still runs it, and Undo puts back whatever it took off.
    //
    // Asserted WHOLE, because this is the only test in the file that reaches the intercept with a
    // square to land on and focus staying on the pad -- the one press where the intercept builds a
    // tail at all. A substring stopping at the first sentence would leave that arm unchecked, and
    // it is the arm that tells a player whose focus is two bands away where the caret went.
    it('row 4: is free when the letter pressed is the one the square already holds', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      // Back to V: the key advanced the cursor off it.
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.click(key('A, on cipher V'))

      expect(ribbon()).toHaveTextContent('Cipher V is already A. Now on Cipher Z, letter 2 of 9, empty.')
      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
    })

    it('row 5: names the letter it released', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('E, not used yet'))
      // Row 5 is a square that already holds a letter being given a different one, so the cursor has
      // to come back to the square the first key advanced off.
      await user.click(square('Cipher V, letter 1 of 9, holds E'))
      await user.click(key('A, not used yet'))

      expect(ribbon()).toHaveTextContent('Every V is A now — 3 squares. E is free again.')
    })

    it('row 6: names both the square it emptied and the letter it released', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('E, not used yet'))
      await user.click(square('Cipher V, letter 1 of 9, holds E'))
      await user.click(key('A, on cipher Z'))

      expect(ribbon()).toHaveTextContent('Every V is A now — 3 squares. Z is empty, E is free again.')
    })

    // Every occurrence changes at once -- that is the whole game. A board that changed only the
    // tapped square would be a word puzzle with extra steps.
    it('changes every square showing that cipher letter', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
    })

    it('hands the shell the mapping to persist', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(onProgress).toHaveBeenCalledWith('VA')
    })

    // A full board that is not the answer is the one state the player cannot see: every square
    // shows a letter and nothing says which of them is wrong.
    //
    // Asserted as one string, because the notice is APPENDED and never substituted: the assignment
    // that filled the last square still has to say what it did. Substituting would drop the count
    // on the very move that finished the board.
    it('says the board is full when every square has a letter and it is still wrong', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('T, not used yet'))
      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher E, letter 3 of 9, empty'))
      await user.click(key('E, not used yet'))

      expect(ribbon()).toHaveTextContent(
        'Every E is E now — 3 squares. Every square is full. Check the ones you’re least sure of.',
      )
    })

    // Fullness is news exactly ONCE, and this is the move that proves why it has to be. The endgame
    // of a wrong board is a run of single-square corrections, every one of which leaves the board
    // still full -- so a notice keyed on "is full" rather than "just became full" fires forever,
    // and since it and the tail cannot both fit, it would cost the tail on every one of those
    // moves. Focus stays on the pad here, so the tail is the only thing that says the caret moved,
    // and on a full board the next tap overwrites whichever letter it silently moved onto.
    it('names where the caret went on a board that was already full', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('T, not used yet'))
      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher E, letter 3 of 9, empty'))
      await user.click(key('E, not used yet'))
      // The board is full and wrong. Swap V's T for a letter nothing else holds: V still has a
      // letter, so the board is still full, and T has gone back to the pile.
      await user.click(square('Cipher V, letter 1 of 9, holds T'))
      await user.click(key('B, not used yet'))

      expect(ribbon()).toHaveTextContent(
        'Every V is B now — 3 squares. T is free again. Now on Cipher Z, letter 2 of 9, holds A.',
      )
      expect(ribbon()).not.toHaveTextContent('Every square is full.')
    })

    // "1 squares" is the kind of thing a screen reader says out loud, so the count is spelled.
    it('counts one square as a square', async () => {
      const user = setup(singleUsePuzzle)

      await user.click(square('Cipher Q, letter 10 of 10, empty'))
      await user.click(key('A, not used yet'))

      expect(ribbon()).toHaveTextContent('Every Q is A now — 1 square.')
    })

    // The same fill, spelled right. A solved board is never told it is full and wrong -- the solve
    // announcement takes the ribbon instead, and it is the more important of the two facts.
    it('does not call a solved board full', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.click(key('T, not used yet'))
      await user.click(square('Cipher E, letter 3 of 9, empty'))
      await user.click(key('E, not used yet'))

      expect(ribbon()).toHaveTextContent('Solved. The answer is ATE ATE TEA.')
      expect(ribbon()).not.toHaveTextContent('Every square is full.')
    })
  })

  // One pointer, and it is a caret rather than a selection. Nothing un-places it: `null` means
  // nothing has been picked yet, which since the whole-board clear went is reachable at mount and
  // nowhere else -- and re-activating the square it stands on says the square's name again rather
  // than dropping the pointer or emptying anything.
  describe('the cursor', () => {
    it('says what the square is when it is picked', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))

      expect(ribbon()).toHaveTextContent('Cipher V, letter 1 of 9, empty. Pick a letter.')
    })

    // One sentence on both halves. A filled square used to be offered a second gesture -- "or tap
    // again to empty it" -- and that gesture is gone, so the offer would be an instruction to do
    // something the board no longer does. The `not` is the assertion that matters: substring
    // matching cannot see a clause that should not be there.
    it('says the same thing on a square that already has a letter', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      // Back onto V: the key advanced the caret off it.
      await user.click(square('Cipher V, letter 1 of 9, holds A'))

      expect(ribbon()).toHaveTextContent('Cipher V, letter 1 of 9, holds A. Pick a letter.')
      expect(ribbon()).not.toHaveTextContent('empty it')
    })

    // Tapping the caret does not un-place it -- no text field works that way -- so the only honest
    // answer to "I tapped the place I am already standing" is to say again where that is.
    it('re-announces an empty square at the cursor when it is tapped again', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(square('Cipher V, letter 1 of 9, empty'))

      expect(ribbon()).toHaveTextContent('Cipher V, letter 1 of 9, empty. Pick a letter.')
      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('aria-pressed', 'true')
    })

    // The filled half, and the rule that replaced two-tap clearing. Activating a square is how the
    // player says "work on this one", and the advance lands the caret on squares nobody chose -- so
    // a gesture that meant "work on this one" the first time and "empty three squares" the second
    // was a trap on exactly the board where the caret was not put there by hand. Nothing on a square
    // takes a letter off now; Backspace and Undo do.
    it('never empties a square, however many times it is activated', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      // Back onto V, then again: the tap that used to arm, and the tap that used to clear.
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.click(square('Cipher V, letter 1 of 9, holds A'))

      expect(ribbon()).toHaveTextContent('Cipher V, letter 1 of 9, holds A. Pick a letter.')
      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
    })

    // The endgame, which is the phase the advance exists for and the phase that made the old rule
    // untenable. Every square is full, so every advance lands the caret on a letter the player did
    // not put it on -- and a tap there is a select, now unconditionally rather than by a ref that
    // had to be disarmed in five places to say so.
    it('does not clear a square the caret advanced onto', async () => {
      const user = setup(cryptogramPuzzle, FULL_AND_WRONG)

      await user.click(square('Cipher V, letter 1 of 9, holds B'))
      // The letter V already holds, so nothing is assigned and the caret advances onto Z. Not
      // silently: this is a pad tap with a square to land on, which is the loudest form the free
      // keystroke takes -- the already-holds sentence plus the tail naming Z. The two taps below
      // are what this test is about, and they land on the square that message named.
      await user.click(key('B, on cipher V'))
      await user.click(square('Cipher Z, letter 2 of 9, holds T'))
      await user.click(square('Cipher Z, letter 2 of 9, holds T'))

      expect(ribbon()).toHaveTextContent('Cipher Z, letter 2 of 9, holds T. Pick a letter.')
      expect(screen.getAllByRole('button', { name: /^Cipher Z, .*holds T$/ })).toHaveLength(3)
    })

    // The cipher letter under the pointer is what presses, not the one square the pointer is on:
    // every square showing it changes together, so all of them are the honest answer to "what will
    // the next letter change". A single roving selection could not express that.
    it('marks every square showing the cipher letter pressed', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('aria-pressed', 'true')
      expect(square('Cipher V, letter 4 of 9, empty')).toHaveAttribute('aria-pressed', 'true')
      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveAttribute('aria-pressed', 'false')
    })

    // The run and the caret are two different facts, and only one of them is a position: the caret
    // is where the next letter lands, where the rest of the run is evidence of what a press will
    // change. aria-pressed cannot tell them apart -- it is the cipher letter, so every square of
    // the run says the same thing -- so the caret says its own.
    it('marks the caret apart from the rest of its run', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher V, letter 4 of 9, empty')).not.toHaveAttribute('aria-current')
      expect(square('Cipher Z, letter 2 of 9, empty')).not.toHaveAttribute('aria-current')
    })

    // Absent, never "false". There is no state called "the caret is not here" for a screen reader
    // to be told about eight times.
    it('marks no square before anything is picked', () => {
      setup()

      const marked = screen
        .getAllByRole('button', { name: /^Cipher / })
        .filter((element) => element.hasAttribute('aria-current'))

      expect(marked).toHaveLength(0)
    })

    // Same cipher letter, different square: the pointer is a position, so it goes where it was
    // tapped. Under two pointers this was the collision -- the square was already "selected", so
    // the tap fell into the deselect branch and answered "Nothing selected." on a board where
    // something plainly was.
    it('moves the cursor to another square showing the same cipher letter', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(square('Cipher V, letter 4 of 9, empty'))

      expect(ribbon()).toHaveTextContent('Cipher V, letter 4 of 9, empty. Pick a letter.')
    })

    // `cursor ?? 0` in the roving tabIndex, and it is load-bearing: with a literal null the board
    // would have no tabbable square at all and could not be reached by keyboard.
    it('leaves the first square tabbable before anything is chosen', () => {
      setup()

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('tabindex', '0')
    })
  })

  // Spelling a word costs one tap per DISTINCT letter. The cursor moves to the first square on the
  // right whose cipher letter is not the one just pressed on, because one keystroke fills every
  // square of that cipher and the player watching the board can see it happen -- so the square the
  // keystroke already answered is not a square to stop on.
  describe('the advance', () => {
    it('moves the cursor to the next square after a letter is placed', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('at')

      expect(ribbon()).toHaveTextContent('Every Z is T now')
    })

    // Spaces and punctuation are not squares -- `squaresOf` filters to /[A-Z]/ -- so "next square"
    // means the next LETTER in reading order and a word boundary is not a stop.
    it('advances across a word boundary', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher Q, letter 4 of 8, empty'))
      await user.keyboard('kt')

      expect(ribbon()).toHaveTextContent('Every X is T now')
    })

    // A run is INDEX adjacency, not on-screen adjacency: `squares` is numbered continuously across
    // words, so a cipher letter that ends one word and starts the next is one run and the caret
    // clears it in a single move -- over squares drawn 20px apart, which do not read as a run at
    // all. Defensible on the rule's own terms, since one keystroke filled both and neither is a
    // square to stop on, and asserted here because nothing else on the board says so.
    it('steps over a run that spans a word boundary', async () => {
      const user = setup(edgeRunsPuzzle)

      await user.click(square('Cipher P, letter 4 of 10, empty'))
      await user.keyboard('s')

      expect(square('Cipher Q, letter 6 of 10, empty')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher P, letter 5 of 10, holds S')).not.toHaveAttribute('aria-current')
    })

    // `nextOf` returns null for any run that reaches the end of the phrase, not only for the last
    // square: press on the first square of a trailing `P P` and nothing to the right differs. The
    // keystroke filled through to the end, so the caret parks on the end -- the last square of the
    // run it just completed, which is the natural resting place and the only one that is not the
    // middle of a run the player has finished with. Focus follows it like any other advance, which
    // is the half a left-behind caret could not have.
    it('parks on the last square when the run the keystroke filled reaches the end of the phrase', async () => {
      const user = setup(edgeRunsPuzzle)

      await user.click(square('Cipher P, letter 9 of 10, empty'))
      await user.keyboard('s')

      expect(square('Cipher P, letter 10 of 10, holds S')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher P, letter 10 of 10, holds S')).toHaveFocus()
      expect(square('Cipher P, letter 9 of 10, holds S')).not.toHaveAttribute('aria-current')
    })

    // The other half of the park, and the one that must NOT move: the caret is already on the last
    // square, so there is nowhere to park. setCursor with the same value is a React bail-out and
    // the [cursor] effect does not run, so a move announced here would be a move nothing carried
    // out -- and the focus flag armed for it would strand and eat the next real focus move.
    it('does not move when the caret is already on the last square', async () => {
      const user = setup(edgeRunsPuzzle)

      await user.click(square('Cipher P, letter 10 of 10, empty'))
      await user.keyboard('s')

      expect(square('Cipher P, letter 10 of 10, holds S')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher P, letter 9 of 10, holds S')).not.toHaveAttribute('aria-current')
    })

    // No wrap. A cursor that jumped back to square 1 would put the next keystroke on the far end of
    // the phrase from where the player is reading.
    it('does not move past the last square', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 8 of 8, empty'))
      await user.keyboard('tt')

      expect(ribbon()).toHaveTextContent('Cipher X is already T.')
      // The caret itself, not just what the ribbon said about it: the message would read the same
      // way if the pointer had wrapped to square 1 behind it.
      expect(square('Cipher X, letter 8 of 8, holds T')).toHaveAttribute('aria-current', 'true')
    })

    it('advances when the assignment steals a letter from another cipher', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('a')
      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.keyboard('at')

      expect(ribbon()).toHaveTextContent('Every E is T now')
    })

    // The rule itself, on the phrase it was decided by. Typing E on the first R fills BOTH R squares
    // at once, so the second one is a square the keystroke has already answered -- the caret steps
    // over it and lands on Q. Asserted on the caret's own mark rather than on the ribbon, because
    // the assignment message reads identically whichever square the caret stopped on.
    it('skips the rest of the run the keystroke just filled', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher R, letter 2 of 8, empty'))
      await user.keyboard('e')

      expect(square('Cipher Q, letter 4 of 8, empty')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher R, letter 2 of 8, holds E')).not.toHaveAttribute('aria-current')
      expect(square('Cipher R, letter 3 of 8, holds E')).not.toHaveAttribute('aria-current')
    })

    // The run, not every square of that cipher. `XLBX` repeats X at the far end of the word, and
    // the two are not adjacent -- so setting X fills both squares and the caret still stops on the
    // very next one. A rule that skipped every square of the cipher would land here too; a rule
    // that skipped to the next EMPTY square would fling the caret past L and B to the end of the
    // word, which is what the second assertion rules out.
    it('stops at the next square when the repeat is not adjacent', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('t')

      expect(square('Cipher L, letter 6 of 8, empty')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher X, letter 8 of 8, holds T')).not.toHaveAttribute('aria-current')
    })

    // The most common revision move in a cryptogram: deciding XLB is AND rather than THA. Skipping
    // to the next EMPTY square would fling the cursor past the whole word on the first keystroke,
    // which is why that rule was rejected.
    it('walks an already-filled word letter by letter when it is retyped', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('tha')
      // Back to the head of the word the typing run left. Nothing is emptied first: the point is
      // that a FILLED word is retyped square by square.
      await user.click(square('Cipher X, letter 5 of 8, holds T'))
      await user.keyboard('and')

      expect(ribbon()).toHaveTextContent('Every B is D now')
      // The word itself, which is the claim the name makes: three keystrokes, three squares, in
      // order. A ribbon that named the last assignment would read the same on a board where the
      // caret had skipped and the first two letters landed somewhere else entirely.
      expect(square('Cipher X, letter 5 of 8, holds A')).toBeInTheDocument()
      expect(square('Cipher L, letter 6 of 8, holds N')).toBeInTheDocument()
      expect(square('Cipher B, letter 7 of 8, holds D')).toBeInTheDocument()
    })
  })

  // A player types DISTINCT letters and watches the run fill. `SEEK` is three keystrokes on
  // `G R R Q`, not four -- setting R = E fills both R squares at once, and the caret lands on Q.
  // The intercept below is for the keystroke that arrives anyway: the player who spells the word
  // out loud, or who taps a spent pad key to check what it is on.
  describe('the free keystroke', () => {
    it('spells a word with a doubled letter in three keystrokes', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher G, letter 1 of 8, empty'))
      await user.keyboard('sek')

      expect(square('Cipher G, letter 1 of 8, holds S')).toBeInTheDocument()
      expect(square('Cipher Q, letter 4 of 8, holds K')).toBeInTheDocument()
      expect(square('Cipher R, letter 2 of 8, holds E')).toBeInTheDocument()
    })

    it('spells a word whose first and last letters repeat in three keystrokes', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('tha')

      expect(square('Cipher X, letter 8 of 8, holds T')).toBeInTheDocument()
      expect(square('Cipher B, letter 7 of 8, holds A')).toBeInTheDocument()
      // The caret ends on the last square, which is where the third keystroke put it -- there is no
      // fourth T to type, and nothing to type it on.
      expect(square('Cipher X, letter 8 of 8, holds T')).toHaveAttribute('aria-current', 'true')
    })

    // Says what happened rather than nothing. A keystroke that changes no square is not a broken
    // key, and under apply's row 4 the letter a square already shows is the one that would erase
    // it. The caret still moves on, so the press is free rather than refused.
    //
    // One sentence, and the `not` is the half that matters: this message used to end `Tap any R
    // square twice to empty it.`, and substring matching cannot see a clause that came back.
    it('assigns nothing when the square already shows the letter pressed', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher R, letter 2 of 8, empty'))
      await user.keyboard('e')
      // The advance stepped over the second R, so getting back to it takes a tap: this is the
      // player re-typing a letter their own last keystroke already put down.
      await user.click(square('Cipher R, letter 3 of 8, holds E'))
      await user.keyboard('e')

      expect(ribbon()).toHaveTextContent('Cipher R is already E.')
      expect(ribbon()).not.toHaveTextContent('empty it')
      expect(screen.getAllByRole('button', { name: /^Cipher R, .*holds E$/ })).toHaveLength(2)
      expect(square('Cipher Q, letter 4 of 8, empty')).toHaveAttribute('aria-current', 'true')
    })

    // SOLVED, not merely full: a wrong letter in the last empty square still advances. Moving the
    // pointer off the answer the player just spelled would be a loss.
    it('leaves the cursor where the solving keystroke was typed', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('ate')

      expect(ribbon()).toHaveTextContent('Solved. The answer is ATE ATE TEA.')
      expect(square('Cipher E, letter 3 of 9, holds E')).toHaveAttribute('tabindex', '0')
    })
  })

  describe('the keyboard', () => {
    it('moves along the phrase in reading order', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{ArrowRight}')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveFocus()
    })

    it('moves back along the phrase', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.keyboard('{ArrowLeft}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
    })

    it('moves to the first square of the next word', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.keyboard('{ArrowDown}')

      expect(square('Cipher V, letter 4 of 9, empty')).toHaveFocus()
    })

    it('moves to the first square of the previous word', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 4 of 9, empty'))
      await user.keyboard('{ArrowUp}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
    })

    // The four boundary arrows were the last inputs on this board that answered nothing at all. The
    // clamp puts the caret back where it already is, setCursor bails out on the unchanged value, and
    // the focus effect never runs -- so no focus moves, no square re-announces, and a key that means
    // something everywhere else reads as broken here. Each says what it found instead.
    it('stops at the first square rather than wrapping', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{ArrowLeft}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
      expect(ribbon()).toHaveTextContent('No square that way.')
    })

    it('stops at the last square rather than wrapping', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 9 of 9, empty'))
      await user.keyboard('{ArrowRight}')

      expect(square('Cipher V, letter 9 of 9, empty')).toHaveFocus()
      expect(ribbon()).toHaveTextContent('No square that way.')
    })

    // A word, not a square: up and down step by word, and the caret may be sitting mid-word with
    // five squares behind it, where "no square that way" would be flatly false.
    it('stops at the first word rather than wrapping', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.keyboard('{ArrowUp}')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveFocus()
      expect(ribbon()).toHaveTextContent('No word that way.')
    })

    it('stops at the last word rather than wrapping', async () => {
      const user = setup()

      await user.click(square('Cipher E, letter 8 of 9, empty'))
      await user.keyboard('{ArrowDown}')

      expect(square('Cipher E, letter 8 of 9, empty')).toHaveFocus()
      expect(ribbon()).toHaveTextContent('No word that way.')
    })

    // Enter fires the focused button natively, so it runs the same `select` a tap runs -- and on
    // the square the cursor is already on, `select` says the square's name again and stops there.
    // A reflex Enter after a typed letter would otherwise throw the player's position away every
    // time, which is the whole reason activating the caret may not deselect.
    it('re-announces the square at the cursor when Enter is pressed on it', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{Enter}')

      expect(ribbon()).toHaveTextContent('Cipher V, letter 1 of 9, empty. Pick a letter.')
    })

    // The reflex Enter. Focus follows the caret on the typed path, so at the end of a word the
    // focused square is one the advance chose and it holds the letter just spelled -- and Enter is
    // a key this board cannot take away, unlike Space. It runs `select`, which re-announces and
    // does nothing else, so the reflex costs the player a sentence rather than a word.
    it('leaves the word just typed alone when Enter is pressed on the square focus landed on', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('tha{Enter}')

      expect(square('Cipher X, letter 5 of 8, holds T')).toBeInTheDocument()
      expect(square('Cipher L, letter 6 of 8, holds H')).toBeInTheDocument()
      expect(square('Cipher B, letter 7 of 8, holds A')).toBeInTheDocument()
      expect(ribbon()).toHaveTextContent('Cipher X, letter 8 of 8, holds T. Pick a letter.')
    })

    // {ArrowRight}{Enter} is the keyboard's selection gesture -- the only one there is -- and it
    // has to be a way of PICKING a square rather than a way of emptying one, from a starting point
    // the player reached without touching the board. Run on a full, wrong board, where every square
    // the arrows can reach holds a letter there is something to lose.
    it('picks a square with the arrows and Enter without emptying its run', async () => {
      const user = setup(cryptogramPuzzle, FULL_AND_WRONG)

      // Tab rather than a click: a click would pick a square before the arrows ever ran.
      await user.tab()
      await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')

      expect(ribbon()).toHaveTextContent('Cipher Z, letter 2 of 9, holds T. Pick a letter.')
      expect(screen.getAllByRole('button', { name: /^Cipher Z, .*holds T$/ })).toHaveLength(3)
    })

    // One pointer, so the arrow moved the place the next letter lands. The old board kept these
    // apart on purpose and typed into the square first clicked; under a typing flow there is
    // exactly one place the player is typing, and a cursor that is not that place is incoherent.
    it('types into the square the arrows moved to, not the one first clicked', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{ArrowRight}a')

      expect(ribbon()).toHaveTextContent('Every Z is A now')
    })

    // Entering the board. Any arrow picks the first square rather than applying its delta: `null + 1`
    // is 1, which would land ArrowRight on the second square and skip the first entirely. Tab rather
    // than a click, because a click would pick a square and there would be no null left to test.
    it('picks the first square when an arrow is pressed with nothing chosen', async () => {
      const user = setup()

      await user.tab()
      await user.keyboard('{ArrowRight}a')

      expect(ribbon()).toHaveTextContent('Every V is A now')
    })

    // Identical rules to a tap, including the steal. A keyboard player must not get a different game.
    it('assigns a letter on a key press', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('a')

      expect(ribbon()).toHaveTextContent('Every V is A now — 3 squares.')
    })

    // A browser shortcut is not a guess. Without the early return the board swallows ⌘R, ⌃A and
    // friends -- preventDefault runs either way -- and assigns the letter as well, so the player
    // loses their reload AND their square in one keystroke.
    it('leaves a browser shortcut alone', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{Meta>}r{/Meta}')
      await user.keyboard('{Control>}a{/Control}')

      expect(square('Cipher V, letter 1 of 9, empty')).toBeInTheDocument()
      expect(ribbon()).toHaveTextContent('Cipher V, letter 1 of 9, empty. Pick a letter.')
    })

    // Space is the reflex between words, and the squares are the phrase -- there is no space
    // between them to move to. Left to the browser it would activate the focused square instead,
    // because the square is a button, so a player reaching for the next word would be read the name
    // of the square they are already standing on. The ribbon assertion is the whole test: the board
    // cannot change on this path any more, so the only observable difference between swallowing the
    // key and not is whether `select`'s sentence arrives.
    it('says nothing when space is pressed after a typed word', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('tha  ')

      expect(square('Cipher X, letter 5 of 8, holds T')).toBeInTheDocument()
      expect(square('Cipher L, letter 6 of 8, holds H')).toBeInTheDocument()
      expect(square('Cipher B, letter 7 of 8, holds A')).toBeInTheDocument()
      expect(square('Cipher X, letter 8 of 8, holds T')).toBeInTheDocument()
      expect(ribbon()).toHaveTextContent('Every B is A now — 1 square.')
      expect(ribbon()).not.toHaveTextContent('Pick a letter.')
    })

    // Branch 2 of the table: the correction case. You are standing on the letter you want gone, so
    // it comes off and the caret stays. With re-activation no longer destructive, the eraser and
    // Undo are the only ways a letter leaves the board at all.
    it('clears the square at the cursor on Backspace', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('a')
      // Back onto V: the letter advanced the caret off it.
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveTextContent('V is empty again — A is free.')
    })

    // Branch 3a, and the text-field convention: with nothing under the caret to take off, Backspace
    // steps back and takes off what is there. `a` advances, so the caret is on the empty square
    // AFTER V when this runs, and V is a run of one -- the step back and the head of the run are
    // the same square, which is the ordinary case.
    it('steps back and clears the previous square when the one at the cursor is empty', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('a{Backspace}')

      expect(ribbon()).toHaveTextContent('V is empty again — A is free.')
      // The caret went back with the letter it took off, which is the half of the branch the
      // message cannot say: an in-place clear on the wrong square reads identically.
      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('aria-current', 'true')
    })

    // The eraser acts on the CIPHER LETTER, not on the square, and this is the press where that
    // comes apart from the word in the player's head. `T-H-A` into `XLBX` is the spec's own
    // canonical input; it leaves the caret on idx 7, an X square holding the T of keystroke ONE.
    // Backspace there is branch 2, so it empties both X squares, at opposite ends of the word --
    // where a text field backspacing after "tha" takes the "a" off. The run-aware step back does
    // not touch this: idx 4 and idx 7 are not adjacent, so they are not a run, and branch 2 never
    // moves at all. Pinned as it ships so the asymmetry is deliberate rather than incidental. Which
    // of the two rules should give is a product question, recorded as open in the spec.
    it('empties the whole run on Backspace, however far back the letter was typed', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('tha{Backspace}')

      expect(ribbon()).toHaveTextContent('X is empty again — T is free.')
      expect(screen.getAllByRole('button', { name: /^Cipher X, .*empty$/ })).toHaveLength(2)
      // The letter the player would have expected to lose, still on the board.
      expect(square('Cipher B, letter 7 of 8, holds A')).toBeInTheDocument()
    })

    // Erasing mirrors typing. One Backspace empties a whole cipher run -- the eraser acts on the
    // cipher letter, not on the square -- so the caret steps back to the HEAD of the run it just
    // emptied rather than one square: anywhere inside that run is a square this very press already
    // cleared, and the next Backspace there could only answer that there is nothing to clear.
    // `sek` fills `GRRQ` and leaves the caret on idx 4; two presses take K off Q and E off both R
    // squares, and the caret lands on the FIRST R rather than the second.
    it('steps back to the head of the run it emptied', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher G, letter 1 of 8, empty'))
      await user.keyboard('sek{Backspace}{Backspace}')

      expect(square('Cipher R, letter 2 of 8, empty')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher R, letter 3 of 8, empty')).not.toHaveAttribute('aria-current')
    })

    // The keystroke this buys back, which is the whole reason for the rule. `SEEK` costs three
    // keystrokes to type because one fills the run; it now costs three presses to erase for the
    // same reason. Landing one square back instead spent a press on the second R -- a square the
    // press before it had already emptied -- so the word took four.
    it('erases a word in one press per cipher letter', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher G, letter 1 of 8, empty'))
      await user.keyboard('sek{Backspace}{Backspace}{Backspace}')

      expect(ribbon()).toHaveTextContent('G is empty again — S is free.')
      expect(screen.getAllByRole('button', { name: /^Cipher [GRQ], .*empty$/ })).toHaveLength(4)
    })

    // Branch 3b, which is the case that used to be silent, and which survives the run-aware step
    // back: it fires when the predecessor is empty for some reason OTHER than a run this key just
    // emptied -- here, a square picked in the middle of an unstarted phrase. Focus moves there and
    // the square says its own name, so the ribbon says the one thing focus cannot -- that nothing
    // came off. Naming the square here would be `select`'s sentence word for word, which cannot be
    // told apart from having simply picked a square.
    it('says nothing came off when it steps back onto another empty square', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveTextContent('Nothing to clear there.')
      expect(ribbon()).not.toHaveTextContent('Pick a letter.')
      // And no tail. Focus moved with the caret on this path, so the landed square announces its own
      // name -- the tail belongs to the pad, where it does not.
      expect(ribbon()).not.toHaveTextContent('Now on')
    })

    // Branch 4: an empty first square has nowhere to step back to. The silence this replaces was
    // the one input on the board that answered nothing at all, which reads as a broken key rather
    // than as a key with nothing to do.
    //
    // It names the square, not the board: this branch fires on the first square alone and the rest
    // of the phrase may be full, so a bare "Nothing to clear." would be false about the letters the
    // player can see.
    it('says there is nothing behind the first square on Backspace', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveTextContent('Nothing to clear — you’re on the first square.')
    })

    // Backspace is the board's own key handler, so focus follows the caret on this path -- which is
    // the other half of what makes branch 3b audible.
    it('moves focus with the cursor when Backspace steps back', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.keyboard('{Backspace}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
    })

    // Branch 1. Backspace with nothing picked is still an action the player took, and every other
    // way of acting without a square says so. Silence reads as a broken key.
    it('asks for a square first on Backspace when nothing has been picked', async () => {
      const user = setup()

      // Tab, not a click: nothing un-picks a square any more, so reaching the board by focus alone
      // is the only way to stand on it with the pointer still null. Square 0 is the tab stop from
      // mount, which is what makes that reachable at all.
      await user.tab()
      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveTextContent('Tap a square first, then a letter.')
    })

    // The same answer for a typed letter, and it is the pad's answer said on the board: a letter
    // acts on a square, and there is none. An arrow means "I am entering the board" and picks one;
    // a letter does not, because guessing which square the player meant is worse than asking.
    it('asks for a square first when a letter is typed with nothing picked', async () => {
      const user = setup()

      await user.tab()
      await user.keyboard('a')

      expect(ribbon()).toHaveTextContent('Tap a square first, then a letter.')
    })

    // Only one square is in the tab order, so Tab moves past the phrase rather than through
    // nine of it.
    it('keeps one square in the tab order', () => {
      setup()

      const tabbable = screen
        .getAllByRole('button', { name: /^Cipher / })
        .filter((element) => element.getAttribute('tabindex') === '0')

      expect(tabbable).toHaveLength(1)
    })

    // The ROVING half, which the count above cannot see: a hardcoded `index === 0` would satisfy
    // it forever. Tab has to return a player to the square they left, not to the first one.
    it('moves the tab stop to the square the cursor is on', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{ArrowRight}')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveAttribute('tabindex', '0')
      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('tabindex', '-1')
    })

    // Focus follows the cursor only once the player has MOVED it. Grabbing focus at mount scrolls a
    // deep-linked page past the heading to the board, which is the one thing a deep link exists to
    // show first.
    it('takes no focus at mount', () => {
      setup()

      expect(document.body).toHaveFocus()
    })
  })

  // The handler is on the WINDOW rather than on the board's own <section>, which is what makes this
  // bench playable from a hardware keyboard at all. Hung off the board, a keystroke only counted
  // while focus was inside the phrase -- and every pad key deliberately keeps focus when pressed,
  // so the first tap on a letter, Undo or Delete moved focus out of the board for good and typing
  // silently stopped working from then on.
  describe('typing from outside the board', () => {
    it('assigns a letter typed after a pad key took focus', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      // Focus is on the pad key, which is exactly where the pad is supposed to leave it.
      expect(key('A, on cipher V')).toHaveFocus()
      await user.keyboard('t')

      expect(ribbon()).toHaveTextContent('Every Z is T now')
    })

    it('erases on Backspace after a pad key took focus', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.click(key('Delete'))
      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveTextContent('you’re on the first square')
    })

    // Nothing has focus at mount -- the board never seizes it, so a deep link is not scrolled past
    // its own heading. An arrow is how the player asks for it, and the answer has to arrive even
    // though the keystroke landed on <body>.
    it('enters the board on an arrow typed with focus on the body', async () => {
      const user = setup()

      await user.keyboard('{ArrowRight}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
    })

    it('says which square is missing when a letter is typed with focus on the body', async () => {
      const user = setup()

      await user.keyboard('a')

      expect(ribbon()).toHaveTextContent('Tap a square first, then a letter.')
    })

    // Arrows are the one family of keys the board does NOT take from anywhere. They scroll whatever
    // is under them and drive whatever widget has focus, and this bench puts several such things on
    // screen at once -- the hint sheet is deliberately focusable so it can be scrolled, and the
    // board band and the bench column both scroll. Unscoped, the arrow was swallowed, the caret
    // moved on a board the player could not see, and `move` armed the focus effect, which then
    // pulled focus out of whatever they were using.
    it('leaves an arrow alone when it is pressed on something outside the bench', async () => {
      const user = setup()
      const outside = document.createElement('button')
      outside.textContent = 'Somewhere else'
      document.body.append(outside)
      outside.focus()

      await user.keyboard('{ArrowRight}')

      expect(outside).toHaveFocus()
      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('aria-pressed', 'false')
      outside.remove()
    })

    // A letter is not an arrow. There is no text field on this bench, so a letter typed at the page
    // means one thing and the board may take it from anywhere -- which is the whole reason this
    // listener moved to the window.
    it('still takes a letter typed on something outside the bench', async () => {
      const user = setup()
      const outside = document.createElement('button')
      document.body.append(outside)
      outside.focus()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      outside.focus()
      await user.keyboard('a')

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
      outside.remove()
    })

    // Space is swallowed on the board because the squares are the phrase and there is no space
    // between them to move to. It is NOT swallowed anywhere else, and the difference matters: every
    // key of the pad is a button, and Space is half of how a button is pressed from the keyboard.
    it('lets space press a pad key', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      key('Undo').focus()
      await user.keyboard(' ')

      expect(ribbon()).toHaveTextContent('Nothing to undo.')
    })
  })

  // The pad doubles as the cipher key table: a spent key says what it is on and stays fully
  // legible, because that annotation is read most exactly when the key is spent. Spent keys stay
  // tappable -- tapping one is how a player steals it.
  describe('the pad', () => {
    it('offers all twenty-six letters', () => {
      setup()

      expect(screen.getAllByRole('button', { name: /, (not used yet|on cipher [A-Z])$/ })).toHaveLength(26)
    })

    // 26 letters + Undo + Delete = 28 = a complete 7x4 rectangle, which is the whole reason those
    // two utilities live on the pad rather than beside it: a 26-key pad orphans a row at every
    // column count that fits a phone, and a pad that reflows is a pad the player has to find again.
    // Delete took Clear's place rather than joining it, so the rectangle is the same 28 it was.
    it('is exactly twenty-eight keys', () => {
      setup()

      expect(within(pad()).getAllByRole('button')).toHaveLength(28)
      expect(within(pad()).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(within(pad()).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    })

    it('names the group so a screen reader knows it is also the key table', () => {
      setup()

      expect(pad()).toBeInTheDocument()
    })

    // The mirror: the square carries the cipher letter under the player's guess, and the key
    // carries the cipher letter it is spoken for under the letter itself. There is no third object
    // -- no map strip, no meter, no legend -- so both directions of the mapping have to be
    // readable off the two things already on screen.
    it('says what a spent key is on', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(key('A, on cipher V')).toBeInTheDocument()
    })

    // "= V", not a bare "V". The annotation is a statement about the key it is under, and the lone
    // letter read as a second, smaller key sitting beneath the first.
    it('shows the cipher letter on the spent key', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(within(key('A, on cipher V')).getByText('= V')).toBeInTheDocument()
    })
  })

  // Focus splits by whether focus can afford to move, and the partition is NOT device: a
  // screen-reader user pressing Enter on a pad key is on the keyboard and still must keep focus on
  // that key or be stranded mid-run. The board's own key handler is the other side -- focus follows
  // the caret there, which is also why only the pad path needs a tail.
  describe('focus and the tail', () => {
    it('leaves focus on the pad key after a tap', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(key('A, on cipher V')).toHaveFocus()
    })

    // The pad path is the one where focus does NOT move, so nothing else announces where the caret
    // went. It keeps `letter i of n`, which on this path is the only thing telling a non-sighted
    // player where they are standing.
    it('names the square it landed on after a pad tap', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))

      expect(ribbon()).toHaveTextContent('Now on Cipher Z, letter 2 of 9, empty.')
    })

    // Enter on a pad key, which the pad gets rather than the board: the pad is a SIBLING of the
    // section carrying onKeyDown, so Enter fires the button's native click and never reaches the
    // board handler. Same path as a tap, so same focus and same tail.
    it('emits the tail when a pad key is activated with Enter', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      key('A, not used yet').focus()
      await user.keyboard('{Enter}')

      expect(key('A, on cipher V')).toHaveFocus()
      expect(ribbon()).toHaveTextContent('Now on Cipher Z, letter 2 of 9, empty.')
    })

    // A typed letter moves focus, and the square announces itself when it arrives. A tail there
    // would say the same fact twice.
    it('emits no tail when the letter was typed', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('a')

      expect(ribbon()).not.toHaveTextContent('Now on')
    })

    it('moves focus to the advanced-to square when the letter was typed', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('a')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveFocus()
    })

    // The full-board notice or the tail, never both: FloorBar is a fixed three lines, and
    // FULL_BOARD plus an assignment message already IS the worst case it was measured against.
    // Filled but WRONG -- B on cipher B spells SEEKTHBT -- because FULL_BOARD keys off filled and
    // the solve message off solved.
    it('drops the tail when the board fills', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher G, letter 1 of 8, empty'))
      // Seven of the eight squares in five keystrokes, straight through the word boundary: the
      // caret needs no help from a click until the last square, which is a pad tap on purpose.
      await user.keyboard('sekth')
      await user.click(key('B, not used yet'))

      expect(ribbon()).toHaveTextContent('Every square is full.')
      expect(ribbon()).not.toHaveTextContent('Now on')
    })

    // The press that used to be the quietest on the board: the run reaching idx 9 fills under the
    // caret, focus is two bands away on the pad, and nothing said where the caret was standing.
    // Worse, the silence was ambiguous -- "no tail" meant either "you are on the very last square"
    // or "you are somewhere inside a run that reaches it", and no player could tell which. Parking
    // on the last square makes it a move like any other, so it takes the same tail, built from the
    // same ladder rather than from a special case.
    //
    // The focus assertion is the second half: the park goes through the ordinary pad path, so the
    // skip-focus flag is armed and consumed, and focus stays on the key the player is mid-run on.
    it('names the last square when the run the keystroke filled reaches the end of the phrase', async () => {
      const user = setup(edgeRunsPuzzle)

      await user.click(square('Cipher P, letter 9 of 10, empty'))
      await user.click(key('S, not used yet'))

      expect(ribbon()).toHaveTextContent('Every P is S now — 5 squares. Now on Cipher P, letter 10 of 10, holds S.')
      expect(key('S, on cipher P')).toHaveFocus()
    })

    // Nothing landed, so there is nothing to name. The caret is on the last square, where the
    // advance is blocked -- and a tail that named the square the player never left would be false.
    it('omits the tail when the caret is already on the last square', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('tha')
      await user.click(key('T, on cipher X'))

      expect(ribbon()).toHaveTextContent('Cipher X is already T.')
      expect(ribbon()).not.toHaveTextContent('Now on')
    })

    // The gate is armed only for a move that will actually happen. The focus effect's dep array is
    // [cursor], so it does not run when the cursor does not change -- a flag armed on a no-op move
    // would strand and then eat the NEXT real focus move, killing arrow navigation silently. Focus
    // is put back on the board directly, because a click would move the cursor and consume the
    // stranded flag before the arrow could reveal it.
    it('still moves focus with the arrows after a pad press that did not advance', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher X, letter 5 of 8, empty'))
      await user.keyboard('tha')
      await user.click(key('T, on cipher X'))
      square('Cipher X, letter 8 of 8, holds T').focus()
      await user.keyboard('{ArrowLeft}')

      expect(square('Cipher B, letter 7 of 8, holds A')).toHaveFocus()
    })
  })

  // Undo is the word, never "Take back": it is what every other application on the device calls
  // this, and it is the word the player is already looking for.
  describe('undo', () => {
    it('empties the most recent assignment', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('Undo'))

      expect(square('Cipher V, letter 1 of 9, empty')).toBeInTheDocument()
      expect(ribbon()).toHaveTextContent('Move taken back. V is empty again.')
    })

    // The move Undo could not reach before, and the one that most needs reaching: emptying a run
    // takes three squares off the board at once. The old Undo remembered the cipher letter that had
    // been ASSIGNED and re-cleared it, so a clear left nothing behind -- the key answered "Nothing
    // to undo." about the move the player had just made, with the run already gone from storage.
    it('brings back a run emptied by Backspace', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      // Back onto V, where Backspace is branch 2: the letter comes off the whole run at once.
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.keyboard('{Backspace}')
      await user.click(key('Undo'))

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
      expect(ribbon()).toHaveTextContent('Move taken back. Every V is A again.')
      expect(onProgress).toHaveBeenLastCalledWith('VA')
    })

    // A restore can put the answer back, and the solve is the complete news there exactly as it is
    // when a keystroke spells it. The board un-solves and re-solves on the mapping alone, so the
    // shell hears about it either way -- this is about what the player hears.
    it('says the answer when the move it takes back had un-solved the board', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('ate')
      // The solve leaves the caret on the square the winning keystroke landed on, and focus with
      // it, so Backspace takes E off the board from where the player is already standing.
      await user.keyboard('{Backspace}')
      await user.click(key('Undo'))

      expect(ribbon()).toHaveTextContent('Solved. The answer is ATE ATE TEA.')
      expect(onSolved).toHaveBeenCalledTimes(2)
    })

    // The most recent one, not the selected one. A player who has moved on to another square still
    // gets the move they just made taken back, which is the only thing "undo" can mean.
    it('empties the most recent assignment rather than the selected square', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.click(key('T, not used yet'))
      await user.click(key('Undo'))

      expect(square('Cipher Z, letter 2 of 9, empty')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
    })

    it('tells the shell the board it left behind', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('Undo'))

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    // Emptying a square IS the undo, so there is nothing left behind to undo a second time. A key
    // that silently did nothing would read as broken, so it says so.
    it('says there is nothing to undo once the move is taken back', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('Undo'))
      await user.click(key('Undo'))

      expect(ribbon()).toHaveTextContent('Nothing to undo.')
    })

    // Undo is a pad key, so focus belongs on it. It touches the caret not at all -- nothing moves,
    // so the focus effect never runs -- and the key the player pressed keeps focus the way any
    // button press does.
    it('leaves focus on the Undo key', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('Undo'))

      expect(key('Undo')).toHaveFocus()
    })

    // The history is 50 deep, not one. A player who typed three letters and then thought better of
    // the whole word used to be able to take back exactly one of them, and the second press said
    // "Nothing to undo." about moves still plainly on the board.
    it('walks back more than one move', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('ate')
      await user.click(key('Undo'))
      await user.click(key('Undo'))
      await user.click(key('Undo'))

      expect(screen.getAllByRole('button', { name: /^Cipher [VZE], .*empty$/ })).toHaveLength(9)
      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    it('runs out only once every move this session is back off the board', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('ate')
      await user.click(key('Undo'))
      await user.click(key('Undo'))
      await user.click(key('Undo'))
      await user.click(key('Undo'))

      expect(ribbon()).toHaveTextContent('Nothing to undo.')
    })

    // The caret comes back with the board. Undoing a move and being left somewhere else is not
    // undoing the move: the point of walking back to a mistake is to be standing on it.
    it('puts the caret back where the move was made', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('at')
      await user.click(key('Undo'))

      expect(ribbon()).toHaveTextContent('Now on Cipher Z, letter 2 of 9, empty.')
    })

    it('says there is nothing to undo on an untouched board', async () => {
      const user = setup()

      await user.click(key('Undo'))

      expect(ribbon()).toHaveTextContent('Nothing to undo.')
    })

    // A restored board arrives as a mapping, not as a history. Offering to undo a move this session
    // never saw would be a guess at which letter went down last.
    it('has nothing to undo on a restored board', async () => {
      const user = setup(cryptogramPuzzle, 'VA')

      await user.click(key('Undo'))

      expect(ribbon()).toHaveTextContent('Nothing to undo.')
      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
    })
  })

  // The pad's other tool, and it is Backspace: the same `erase`, the same five branches, one rule --
  // remove the nearest letter at or before the caret. There is no separate in-place delete for it to
  // be told apart from, because the caret stands ON a square rather than between two of them. It
  // took the place of `Clear`, which emptied the whole board; the pad is still exactly 28 keys.
  describe('the Delete key', () => {
    // Branch 2 through the pad. Standing on the letter you want gone, so it comes off and nothing
    // moves -- which is also why there is no tail: a tail names a square the caret went to.
    it('empties the letter at the caret', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      // Back onto V: the key advanced the caret off it.
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.click(key('Delete'))

      expect(ribbon()).toHaveTextContent('V is empty again — A is free.')
      expect(ribbon()).not.toHaveTextContent('Now on')
    })

    // Branch 3a through the pad, and the whole reason this key exists: the caret is on an empty
    // square because the letter before it advanced there, and the letter the player wants back is
    // the one behind them.
    it('steps back and empties the letter behind the caret', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('Delete'))

      expect(ribbon()).toHaveTextContent('V is empty again — A is free. Now on Cipher V, letter 1 of 9, empty.')
      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('aria-current', 'true')
    })

    // The same run-aware step back the keyboard gets, because it is the same function. `sek` fills
    // `GRRQ` and leaves the caret on idx 4; two presses take K off Q and E off both R squares, and
    // the caret lands on the FIRST R rather than the second -- anywhere inside a run this press just
    // emptied is a square the next press could only decline about.
    it('steps back to the head of the run it emptied', async () => {
      const user = setup(runsPuzzle)

      await user.click(square('Cipher G, letter 1 of 8, empty'))
      await user.keyboard('sek')
      await user.click(key('Delete'))
      await user.click(key('Delete'))

      expect(square('Cipher R, letter 2 of 8, empty')).toHaveAttribute('aria-current', 'true')
      expect(square('Cipher R, letter 3 of 8, empty')).not.toHaveAttribute('aria-current')
    })

    // Branch 3b through the pad. Focus stays on the key, so nothing announces the landing -- and
    // this is the gap the tail exists to close. On the keyboard the same press gets the sentence
    // alone, because the square focus lands on says its own name.
    it('names the square it stepped back onto when nothing came off', async () => {
      const user = setup()

      await user.click(square('Cipher Z, letter 2 of 9, empty'))
      await user.click(key('Delete'))

      expect(ribbon()).toHaveTextContent('Nothing to clear there. Now on Cipher V, letter 1 of 9, empty.')
    })

    // Branch 4. Nothing moved, so nothing is named: a tail here would name the square the player
    // never left.
    it('says there is nothing behind the first square', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('Delete'))

      expect(ribbon()).toHaveTextContent('Nothing to clear — you’re on the first square.')
      expect(ribbon()).not.toHaveTextContent('Now on')
    })

    // Branch 1, reached from the pad rather than from the board. The key acts on a square and there
    // is none; it asks rather than guessing which square the player meant.
    it('asks for a square first when nothing has been picked', async () => {
      const user = setup()

      await user.click(key('Delete'))

      expect(ribbon()).toHaveTextContent('Tap a square first, then a letter.')
    })

    // The guard on what this key REPLACED. `Clear` emptied every square on the board from one tap;
    // Delete takes off one cipher letter and leaves the rest of the phrase exactly as it was, which
    // is the difference between a key a player can press by accident and one they cannot.
    it('leaves the rest of the board alone', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('T, not used yet'))
      await user.click(square('Cipher Z, letter 2 of 9, holds T'))
      await user.click(key('Delete'))

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
      expect(screen.getByText('3 of 9 squares filled')).toBeInTheDocument()
      expect(onProgress).toHaveBeenLastCalledWith('VA')
    })

    // It is a pad key, so focus belongs on it -- a player mid-word who lost focus to the board would
    // have to find the pad again for every letter after it.
    it('leaves focus on the key when the caret moves', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('Delete'))

      expect(key('Delete')).toHaveFocus()
    })

    // The stranding hazard, on the branch that does NOT move: the focus effect's dep array is
    // [cursor], so it never runs after an in-place clear -- and a skip-focus flag armed there would
    // survive to eat the next real focus move, killing arrow navigation silently. Focus is put back
    // on the board directly, because a click would move the cursor and consume the stranded flag
    // before the arrow could reveal it.
    it('still moves focus with the arrows after a press that did not move the caret', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.click(key('Delete'))
      square('Cipher V, letter 1 of 9, empty').focus()
      await user.keyboard('{ArrowRight}')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveFocus()
    })

    // It routes through `assign` like every other move, which is what makes it undoable. Reaching
    // `apply` directly would skip the snapshot and the letters would be gone for good.
    it('gives Undo the letters it took off', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.click(key('A, not used yet'))
      await user.click(key('Delete'))
      await user.click(key('Undo'))

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
      expect(onProgress).toHaveBeenLastCalledWith('VA')
    })
  })

  describe('the ribbon', () => {
    // A role="status" element inserted with its message already in it is routinely missed by NVDA
    // and JAWS, which announce changes inside a region they are already watching.
    it('is mounted and empty before anything happens', () => {
      setup()

      expect(ribbon()).toBeEmptyDOMElement()
    })

    // The instruction is a SIBLING of the region, and in another band entirely -- text present at
    // mount inside a live region is announced by nothing and clutters it afterwards. Because it is
    // outside the region it costs no announcement to leave standing, and it says a different thing
    // from the ribbon: the ribbon reports what just happened, the instruction states the one rule
    // of the bench, which is as true on the last move as on the first.
    it('keeps the instruction on the board after a message arrives', async () => {
      const user = setup()

      const instruction =
        'Tap a square, then tap letters. Every square holding that cipher letter fills at the same time, ' +
        'and you move on past them.'
      expect(screen.getByText(instruction)).toBeInTheDocument()

      await user.click(square('Cipher V, letter 1 of 9, empty'))

      expect(ribbon()).not.toBeEmptyDOMElement()
      expect(screen.getByText(instruction)).toBeInTheDocument()
    })

    // role="status" announces a CHANGE, not a write. Setting the same string twice is a state
    // bail-out, so the text in the DOM never changes and a screen reader says nothing the second
    // time -- and the keys pressed twice in a row are precisely the ones that answer without doing
    // anything, where silence is the broken-key reading this bench keeps removing. Backspace on an
    // empty first square is the worst of them: it moves no focus either, so the second press had no
    // channel at all. The text has to differ for the region to speak, which is what is asserted.
    it('answers a second time when the same key answers the same way again', async () => {
      const user = setup()

      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('{Backspace}')
      const first = ribbon().textContent
      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveTextContent('Nothing to clear — you’re on the first square.')
      expect(ribbon().textContent).not.toEqual(first)
    })
  })

  // The board measures ITSELF. A size derived from the viewport is wrong inside two levels of
  // horizontal padding, and this box sits inside exactly that.
  it('resizes the squares from the box it is actually in', () => {
    const observe = jest.fn()
    const disconnect = jest.fn()
    let notify: ((entries: { contentRect: { width: number } }[]) => void) | null = null
    class StubResizeObserver {
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
        notify = callback
      }
      disconnect = disconnect
      observe = observe
      unobserve = jest.fn()
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: StubResizeObserver,
      writable: true,
    })

    const { unmount } = renderBoard()
    act(() => notify?.([{ contentRect: { width: 264 } }]))
    // A zero-width measurement is what a hidden or not-yet-laid-out box reports, and it must not
    // collapse every square. Neither may an empty entry list.
    act(() => notify?.([{ contentRect: { width: 0 } }]))
    act(() => notify?.([]))

    expect(observe).toHaveBeenCalled()

    unmount()

    expect(disconnect).toHaveBeenCalled()
    Reflect.deleteProperty(globalThis, 'ResizeObserver')
  })

  describe('restoring', () => {
    it('comes back with the letters the player left', () => {
      setup(cryptogramPuzzle, 'VA')

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
      expect(screen.getByText('3 of 9 squares filled')).toBeInTheDocument()
    })

    // Stored progress is untrusted: a pack can be pruned and refetched, and a regenerated puzzle
    // keeps neither its ciphertext nor its id. A board in a state its own buttons could not reach
    // is worse than an empty one.
    it('comes up empty on progress it cannot trust', () => {
      setup(cryptogramPuzzle, 'VAQB')

      expect(screen.getByText('0 of 9 squares filled')).toBeInTheDocument()
    })

    it('comes up solved on a solved mapping', () => {
      setup(cryptogramPuzzle, SOLVED)

      expect(screen.getByText('You solved this one')).toBeInTheDocument()
    })

    // The ribbon is EMPTY at mount. Restoring is not news, and a region that arrives with its
    // message already in it is announced by nothing anyway.
    it('says nothing when it restores a solved board', () => {
      setup(cryptogramPuzzle, SOLVED)

      expect(ribbon()).toBeEmptyDOMElement()
    })

    // ...but the BAND is not the region, and it used to come back blank on the one screen where the
    // floor has something worth saying. This bench computes its ribbon from a transient set by a
    // move, and a restored solved board has no move left to make -- so 52px of reserved near-black
    // stood between the phrase and the pad for the whole visit, saying nothing.
    it('stands the answer in the floor when it restores a solved board', () => {
      setup(cryptogramPuzzle, SOLVED)

      expect(screen.getByText('Solved. The answer is ATE ATE TEA.')).toBeInTheDocument()
    })

    // An unsolved board at rest has nothing here the board is not already saying, and the blank
    // lasts exactly one keystroke.
    it('leaves the floor blank on a board still being solved', () => {
      setup(cryptogramPuzzle, 'VA')

      expect(screen.queryByText(/^Solved\./)).not.toBeInTheDocument()
    })

    // The standing line is not the region, so a re-solve is still an announcement rather than text
    // that was already sitting there.
    it('keeps the standing answer out of the live region', () => {
      setup(cryptogramPuzzle, SOLVED)

      expect(ribbon()).not.toHaveTextContent('Solved.')
    })

    // markSolved already ran when the player won. Reporting it again at every mount would make the
    // callback mean "a board is on screen" rather than "someone just solved this".
    it('does not report a solve it merely restored', () => {
      setup(cryptogramPuzzle, SOLVED)

      expect(onSolved).not.toHaveBeenCalled()
    })
  })

  describe('solving', () => {
    // The whole point of the bench, used as the helper: pick the first square, then type the answer.
    // It used to take an arrow and an Enter between every letter, which is the cost this change
    // exists to remove.
    const solve = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(square('Cipher V, letter 1 of 9, empty'))
      await user.keyboard('ate')
    }

    it('reports the solve to the shell', async () => {
      const user = setup()

      await solve(user)

      expect(onSolved).toHaveBeenCalledTimes(1)
    })

    it('says the answer once it is solved', async () => {
      const user = setup()

      await solve(user)

      expect(ribbon()).toHaveTextContent('Solved. The answer is ATE ATE TEA.')
    })

    it('folds the solve into the status line', async () => {
      const user = setup()

      await solve(user)

      expect(screen.getByText('You solved this one')).toBeInTheDocument()
    })

    // Solved is DERIVED from the mapping, so the board stays interactive and taking a letter back
    // off un-solves it. A latched solve would leave a board claiming to be finished while showing
    // something else.
    it('un-solves when a letter is taken back off', async () => {
      const user = setup()

      await solve(user)
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.keyboard('{Backspace}')

      expect(screen.getByText('6 of 9 squares filled')).toBeInTheDocument()
    })

    it('reports the solve again when the board is re-solved', async () => {
      const user = setup()

      await solve(user)
      await user.click(square('Cipher V, letter 1 of 9, holds A'))
      await user.keyboard('{Backspace}a')

      expect(onSolved).toHaveBeenCalledTimes(2)
    })

    // The winning keystroke is typed on a square, and nothing on the board is unmounted by winning
    // -- the pad is the same 28 keys it was -- so focus is never dropped to <body>, which would
    // restart the next Tab at the top of the page.
    it('leaves focus where the winning keystroke was typed', async () => {
      const user = setup()

      await solve(user)

      expect(square('Cipher E, letter 3 of 9, holds E')).toHaveFocus()
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderBoard()

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations when solved', async () => {
    const { container } = renderBoard(cryptogramPuzzle, SOLVED)

    expect(await axe(container)).toHaveNoViolations()
  })

  // The mid-run gate. A pad tap is the one press that leaves the board in every state at once: the
  // V run holds a letter, the caret has advanced off it onto a square the player never chose, that
  // square carries aria-current beside the aria-pressed its whole run shares, the roving tabIndex
  // has moved with it, and focus is parked on a pad key two bands away from all of it. Rendered
  // through `renderBoard` with a local session, because `setup` throws the container away.
  it('has no axe violations part-way through a run', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = renderBoard()

    await user.click(square('Cipher V, letter 1 of 9, empty'))
    await user.click(key('A, not used yet'))

    expect(await axe(container)).toHaveNoViolations()
  })
})
