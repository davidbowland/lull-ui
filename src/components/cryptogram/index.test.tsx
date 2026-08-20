import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { CryptogramBoard } from './index'
import { cryptogramPuzzle, hiddenCategoryCryptogram } from '@test/__mocks__'
import { CryptogramData, Puzzle } from '@types'

describe('CryptogramBoard', () => {
  const onProgress = jest.fn()
  const onSolved = jest.fn()

  const renderBoard = (
    puzzle: Puzzle<CryptogramData> = cryptogramPuzzle,
    progress: string | null = null,
  ): ReturnType<typeof render> =>
    render(<CryptogramBoard onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />)

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

  // One word longer than a line holds at the 24px floor, which is the only case that breaks a word.
  const longWordPuzzle: Puzzle<CryptogramData> = {
    ...cryptogramPuzzle,
    data: { ...cryptogramPuzzle.data, answer: 'Pangram', ciphertext: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  }

  const square = (name: string): HTMLElement => screen.getByRole('button', { name })
  const key = (name: string): HTMLElement => screen.getByRole('button', { name })
  const status = (): HTMLElement => screen.getByRole('status')

  describe('the phrase', () => {
    it('gives every ciphertext letter its own square', () => {
      renderBoard()

      expect(screen.getAllByRole('button', { name: /^Cipher / })).toHaveLength(9)
    })

    // The ciphertext has to be ON SCREEN. Which squares repeat is the entire information content of
    // a cryptogram -- it is what the player counts, and it is the only thing to reason from before
    // the first letter goes down. A board that carried the cipher letter in aria-label alone would
    // be solvable by a screen-reader user and by nobody else, and every query in this file resolves
    // by accessible name, so nothing else here would notice.
    it('shows the cipher letter in the square', () => {
      renderBoard()

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveTextContent('V')
    })

    // Both at once, because the player is reading the pattern and their own guess together: take
    // the cipher letter away once a square is filled and the repeats stop being countable exactly
    // when the player is checking them.
    it('keeps showing the cipher letter after a letter is placed on it', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))

      expect(square('Cipher V, letter 1 of 9, holds A')).toHaveTextContent('AV')
    })

    it('names a square with its cipher letter, its position, and what it holds', () => {
      renderBoard()

      expect(square('Cipher V, letter 1 of 9, empty')).toBeInTheDocument()
    })

    // Words are groups so a screen reader can move by word, and the label carries the whole word --
    // including when it is broken across lines, so assistive tech never sees the break.
    it('groups the squares into words', () => {
      renderBoard()

      expect(screen.getByRole('group', { name: 'Word 1 of 3, V Z E' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Word 3 of 3, Z E V' })).toBeInTheDocument()
    })

    // One meta line, not a heading and a tally: the category is a fact about the phrase, the same
    // size as the count beside it, and a lone <h2> above a board that already sits under the page's
    // <h1> buys a heading level for a word.
    it('shows the category in the meta line', () => {
      renderBoard()

      expect(screen.getByText('Saying · 0 of 9 filled in')).toBeInTheDocument()
    })

    it('leaves the category out of the meta line when difficulty hides it', () => {
      renderBoard(hiddenCategoryCryptogram)

      expect(screen.getByText('0 of 9 filled in')).toBeInTheDocument()
    })

    // A word too long for one line breaks across lines behind a marker, and the group's label
    // carries the whole word -- so assistive tech never sees the break and every square is still
    // its own control.
    it('keeps a broken word whole for a screen reader', () => {
      renderBoard(longWordPuzzle)

      expect(
        screen.getByRole('group', { name: 'Word 1 of 1, A B C D E F G H I J K L M N O P Q R S T U V W X Y Z' }),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Cipher / })).toHaveLength(26)
    })

    // Squares, not cipher letters. "1 of 3 letters placed" counts the player's bookkeeping; this
    // counts what is on screen, which is what the player is looking at.
    it('counts the squares that show a letter', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))

      expect(screen.getByText('Saying · 3 of 9 filled in')).toBeInTheDocument()
    })
  })

  // The six rows of the spec's table, through the UI this time. Rows 3, 5 and 6 change something the
  // player is not looking at, so each names it: an unannounced state change is lost work.
  describe('assigning a letter', () => {
    it('row 1: asks for a square first when nothing is selected', async () => {
      renderBoard()

      await userEvent.click(key('A, not used yet'))

      expect(status()).toHaveTextContent('Tap a square first, then a letter.')
    })

    it('row 2: puts a free letter on an empty square and says how many moved', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))

      expect(status()).toHaveTextContent('Every V is A now — 3 squares.')
    })

    it('row 3: names the square it stole the letter from', async () => {
      renderBoard()

      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.click(key('A, not used yet'))
      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, on cipher Z'))

      expect(status()).toHaveTextContent('Every V is A now — 3 squares. Z is empty again.')
    })

    // The undo, and the reason there is no Take back button.
    it('row 4: clears the square when the same letter is tapped again', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))
      await userEvent.click(key('A, on cipher V'))

      expect(status()).toHaveTextContent('V is empty again.')
      expect(square('Cipher V, letter 1 of 9, empty')).toBeInTheDocument()
    })

    it('row 5: names the letter it released', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('E, not used yet'))
      await userEvent.click(key('A, not used yet'))

      expect(status()).toHaveTextContent('Every V is A now — 3 squares. E is free again.')
    })

    it('row 6: names both the square it emptied and the letter it released', async () => {
      renderBoard()

      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.click(key('A, not used yet'))
      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('E, not used yet'))
      await userEvent.click(key('A, on cipher Z'))

      expect(status()).toHaveTextContent('Every V is A now — 3 squares. Z is empty, E is free again.')
    })

    // Every occurrence changes at once -- that is the whole game. A board that changed only the
    // tapped square would be a word puzzle with extra steps.
    it('changes every square showing that cipher letter', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
    })

    it('hands the shell the mapping to persist', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))

      expect(onProgress).toHaveBeenCalledWith('VA')
    })

    // A full board that is not the answer is the one state the player cannot see: every square
    // shows a letter and nothing says which of them is wrong.
    it('says the board is full when every square has a letter and it is still wrong', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('T, not used yet'))
      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.click(key('A, not used yet'))
      await userEvent.click(square('Cipher E, letter 3 of 9, empty'))
      await userEvent.click(key('E, not used yet'))

      expect(status()).toHaveTextContent('Every square is full. Check the ones you’re least sure of.')
    })

    // The full-board sentence is APPENDED, not substituted, and this is the case that proves why.
    //
    // A steal un-fills the board -- it empties the square it took from -- but row 5 does not: the
    // player swaps one free letter for another on a square that already had one, and the board
    // stays full. Substituting the message would swallow "T is free again." on every such move,
    // which is exactly the lost work rows 3, 5 and 6 name their side effects to prevent.
    it('still names the letter it released when the board was already full', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('T, not used yet'))
      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.click(key('A, not used yet'))
      await userEvent.click(square('Cipher E, letter 3 of 9, empty'))
      await userEvent.click(key('E, not used yet'))
      // The board is full and wrong. Swap V's T for a letter nothing else holds: V still has a
      // letter, so the board is still full, and T has gone back to the pile.
      await userEvent.click(square('Cipher V, letter 1 of 9, holds T'))
      await userEvent.click(key('B, not used yet'))

      expect(status()).toHaveTextContent('Every V is B now — 3 squares. T is free again.')
      expect(status()).toHaveTextContent('Every square is full. Check the ones you’re least sure of.')
    })

    // "1 squares" is the kind of thing a screen reader says out loud, so the count is spelled.
    it('counts one square as a square', async () => {
      renderBoard(singleUsePuzzle)

      await userEvent.click(square('Cipher Q, letter 10 of 10, empty'))
      await userEvent.click(key('A, not used yet'))

      expect(status()).toHaveTextContent('Every Q is A now — 1 square.')
    })

    // The same fill, spelled right. A solved board is never told it is full and wrong -- the solve
    // announcement takes the row instead, and it is the more important of the two facts.
    it('does not call a solved board full', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))
      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.click(key('T, not used yet'))
      await userEvent.click(square('Cipher E, letter 3 of 9, empty'))
      await userEvent.click(key('E, not used yet'))

      expect(status()).toHaveTextContent('Solved. The answer is ATE ATE TEA.')
      expect(status()).not.toHaveTextContent('Every square is full.')
    })
  })

  describe('selecting', () => {
    it('says what the square is when it is picked', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))

      expect(status()).toHaveTextContent('Cipher V, letter 1 of 9, empty. Pick a letter.')
    })

    it('says what the square holds when it already has a letter', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))
      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.click(square('Cipher V, letter 1 of 9, holds A'))

      expect(status()).toHaveTextContent('Cipher V, letter 1 of 9, holds A. Pick a letter.')
    })

    it('deselects when the selected square is tapped again', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))

      expect(status()).toHaveTextContent('Nothing selected. Tap a square to pick one.')
    })

    // The selection is a CIPHER LETTER, so every square showing it is pressed at once -- which is
    // also the honest answer to "what will the next letter change".
    it('marks the selected squares pressed', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('aria-pressed', 'true')
      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('the keyboard', () => {
    it('moves along the phrase in reading order', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{ArrowRight}')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveFocus()
    })

    it('moves back along the phrase', async () => {
      renderBoard()

      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.keyboard('{ArrowLeft}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
    })

    it('moves to the first square of the next word', async () => {
      renderBoard()

      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.keyboard('{ArrowDown}')

      expect(square('Cipher V, letter 4 of 9, empty')).toHaveFocus()
    })

    it('moves to the first square of the previous word', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 4 of 9, empty'))
      await userEvent.keyboard('{ArrowUp}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
    })

    it('stops at the ends rather than wrapping', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{ArrowLeft}')

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
    })

    it('stops at the first word rather than wrapping', async () => {
      renderBoard()

      await userEvent.click(square('Cipher Z, letter 2 of 9, empty'))
      await userEvent.keyboard('{ArrowUp}')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveFocus()
    })

    it('stops at the last word rather than wrapping', async () => {
      renderBoard()

      await userEvent.click(square('Cipher E, letter 8 of 9, empty'))
      await userEvent.keyboard('{ArrowDown}')

      expect(square('Cipher E, letter 8 of 9, empty')).toHaveFocus()
    })

    // Arrows move the cursor; selecting is the button's own job. That separation is what makes
    // `cursor` and `selected` two states rather than one -- and Enter and Space run the identical
    // `select` a tap runs, so a keyboard player and a touch player get the same board.
    it('selects the square under the cursor on Enter', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{ArrowRight}{Enter}')

      expect(status()).toHaveTextContent('Cipher Z, letter 2 of 9, empty. Pick a letter.')
    })

    it('leaves the selection alone while the cursor moves', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{ArrowRight}a')

      // Still V, not Z: the cursor moved and the selection did not.
      expect(status()).toHaveTextContent('Every V is A now — 3 squares.')
    })

    // Identical rules to a tap, including the steal. A keyboard player must not get a different game.
    it('assigns a letter on a key press', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('a')

      expect(status()).toHaveTextContent('Every V is A now — 3 squares.')
    })

    // A browser shortcut is not a guess. Without this the phrase box swallows ⌘R, ⌃A and friends --
    // preventDefault runs either way -- and assigns the letter as well, so the player loses their
    // reload AND their square in one keystroke.
    it('leaves a browser shortcut alone', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{Meta>}r{/Meta}')
      await userEvent.keyboard('{Control>}a{/Control}')

      expect(square('Cipher V, letter 1 of 9, empty')).toBeInTheDocument()
      expect(status()).toHaveTextContent('Cipher V, letter 1 of 9, empty. Pick a letter.')
    })

    it('clears the selected cipher letter on Backspace', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('a{Backspace}')

      expect(status()).toHaveTextContent('V is empty again.')
    })

    // Backspace with an empty square selected has nothing to clear, and must not be a second way
    // to say something happened.
    it('says nothing on Backspace when the selected square is empty', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{Backspace}')

      expect(status()).toHaveTextContent('Cipher V, letter 1 of 9, empty. Pick a letter.')
    })

    // Backspace with no square selected is still an action the player took, and every other way of
    // acting without a square says so. Silence reads as a broken key.
    it('asks for a square first on Backspace when nothing is selected', async () => {
      renderBoard()

      // Tapping the same square twice deselects it, which leaves focus on the phrase and nothing
      // selected -- the state Backspace used to answer with nothing at all.
      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{Backspace}')

      expect(status()).toHaveTextContent('Tap a square first, then a letter.')
    })

    // Only one square is in the tab order, so Tab moves past the phrase rather than through
    // nine of it.
    it('keeps one square in the tab order', () => {
      renderBoard()

      const tabbable = screen
        .getAllByRole('button', { name: /^Cipher / })
        .filter((element) => element.getAttribute('tabindex') === '0')

      expect(tabbable).toHaveLength(1)
    })

    // The ROVING half, which the count above cannot see: a hardcoded `index === 0` would satisfy
    // it forever. Tab has to return a player to the square they left, not to the first one.
    it('moves the tab stop to the square the cursor is on', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('{ArrowRight}')

      expect(square('Cipher Z, letter 2 of 9, empty')).toHaveAttribute('tabindex', '0')
      expect(square('Cipher V, letter 1 of 9, empty')).toHaveAttribute('tabindex', '-1')
    })
  })

  // The keypad doubles as the cipher key table: a spent key says what it is on and stays fully
  // legible, because that annotation is read most exactly when the key is spent. Spent keys stay
  // tappable -- tapping one is how a player steals it.
  describe('the keypad', () => {
    it('offers all twenty-six letters', () => {
      renderBoard()

      expect(screen.getAllByRole('button', { name: /, (not used yet|on cipher [A-Z])$/ })).toHaveLength(26)
    })

    it('names the group so a screen reader knows it is also the key table', () => {
      renderBoard()

      expect(screen.getByRole('group', { name: 'Letters, and what each one is on' })).toBeInTheDocument()
    })

    it('says what a spent key is on', async () => {
      renderBoard()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.click(key('A, not used yet'))

      expect(key('A, on cipher V')).toBeInTheDocument()
    })
  })

  describe('the live region', () => {
    // A role="status" element inserted with its message already in it is routinely missed by NVDA
    // and JAWS, which announce changes inside a region they are already watching.
    it('is mounted and empty before anything happens', () => {
      renderBoard()

      expect(status()).toBeEmptyDOMElement()
    })

    // The instruction is a SIBLING of the region, not inside it -- text present at mount inside a
    // live region is announced by nothing and clutters it afterwards.
    it('shows the instruction until the first message of any kind arrives', async () => {
      renderBoard()

      expect(screen.getByText('Tap a square, then tap a letter.')).toBeInTheDocument()

      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))

      expect(screen.queryByText('Tap a square, then tap a letter.')).not.toBeInTheDocument()
    })
  })

  // The phrase box measures ITSELF. A size derived from the viewport is wrong inside two levels of
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

  // 'EEVAZT' is { E: E, V: A, Z: T } encoded -- sorted cipher-plain pairs. Under it VZE VZE ZEV
  // spells ATE ATE TEA, which is the fixture's answer.
  const SOLVED = 'EEVAZT'

  describe('restoring', () => {
    it('comes back with the letters the player left', () => {
      renderBoard(cryptogramPuzzle, 'VA')

      expect(screen.getAllByRole('button', { name: /^Cipher V, .*holds A$/ })).toHaveLength(3)
      expect(screen.getByText('Saying · 3 of 9 filled in')).toBeInTheDocument()
    })

    // Stored progress is untrusted: a pack can be pruned and refetched, and a regenerated puzzle
    // keeps neither its ciphertext nor its id. A board in a state its own buttons could not reach
    // is worse than an empty one.
    it('comes up empty on progress it cannot trust', () => {
      renderBoard(cryptogramPuzzle, 'VAQB')

      expect(screen.getByText('Saying · 0 of 9 filled in')).toBeInTheDocument()
    })

    it('comes up solved on a solved mapping', () => {
      renderBoard(cryptogramPuzzle, SOLVED)

      expect(screen.getByText('Saying · You solved this one')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
    })

    // The live region is EMPTY at mount. Restoring is not news, and a region that arrives with its
    // message already in it is announced by nothing anyway.
    it('says nothing when it restores a solved board', () => {
      renderBoard(cryptogramPuzzle, SOLVED)

      expect(status()).toBeEmptyDOMElement()
    })

    // markSolved already ran when the player won. Reporting it again at every mount would make the
    // callback mean "a board is on screen" rather than "someone just solved this".
    it('does not report a solve it merely restored', () => {
      renderBoard(cryptogramPuzzle, SOLVED)

      expect(onSolved).not.toHaveBeenCalled()
    })
  })

  describe('solving', () => {
    // Arrows move the cursor; Enter selects the square it lands on. Both are needed -- an arrow key
    // alone deliberately does not change the selection.
    const solve = async (): Promise<void> => {
      await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
      await userEvent.keyboard('a')
      await userEvent.keyboard('{ArrowRight}{Enter}t')
      await userEvent.keyboard('{ArrowRight}{Enter}e')
    }

    it('reports the solve to the shell', async () => {
      renderBoard()

      await solve()

      expect(onSolved).toHaveBeenCalledTimes(1)
    })

    it('says the answer once it is solved', async () => {
      renderBoard()

      await solve()

      expect(status()).toHaveTextContent('Solved. The answer is ATE ATE TEA.')
    })

    it('folds the solve into the meta line', async () => {
      renderBoard()

      await solve()

      expect(screen.getByText('Saying · You solved this one')).toBeInTheDocument()
    })

    // Solved is DERIVED from the mapping, so the board stays interactive and taking a letter back
    // off un-solves it. A latched solve would leave a board claiming to be finished while showing
    // something else.
    it('un-solves when a letter is taken back off', async () => {
      renderBoard()

      await solve()
      await userEvent.click(square('Cipher V, letter 1 of 9, holds A'))
      await userEvent.keyboard('{Backspace}')

      expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument()
    })

    it('reports the solve again when the board is re-solved', async () => {
      renderBoard()

      await solve()
      await userEvent.click(square('Cipher V, letter 1 of 9, holds A'))
      await userEvent.keyboard('{Backspace}a')

      expect(onSolved).toHaveBeenCalledTimes(2)
    })

    // The winning keystroke is typed on a square, and Play again appears in the status row rather
    // than replacing anything the player is standing on -- so focus is never dropped to <body>,
    // which would restart the next Tab at the top of the page.
    it('leaves focus where the winning keystroke was typed', async () => {
      renderBoard()

      await solve()

      expect(square('Cipher E, letter 3 of 9, holds E')).toHaveFocus()
    })
  })

  describe('play again', () => {
    it('empties the board and tells the shell', async () => {
      renderBoard(cryptogramPuzzle, SOLVED)

      await userEvent.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getByText('Saying · 0 of 9 filled in')).toBeInTheDocument()
      expect(onProgress).toHaveBeenCalledWith('')
    })

    // Emptying the status announces nothing, and this clears every letter on the board. A player
    // who is not looking at the squares gets told, and gets told what to do next.
    it('says the board was cleared and what to do next', async () => {
      renderBoard(cryptogramPuzzle, SOLVED)

      await userEvent.click(screen.getByRole('button', { name: 'Play again' }))

      expect(status()).toHaveTextContent('Board cleared. Tap a square, then tap a letter.')
    })

    // Play again unmounts the control the player just pressed, so focus has to be sent somewhere
    // deliberate or it lands on <body> and the next Tab restarts at the top of the page.
    it('moves focus to the first square', async () => {
      renderBoard(cryptogramPuzzle, SOLVED)

      await userEvent.click(screen.getByRole('button', { name: 'Play again' }))

      expect(square('Cipher V, letter 1 of 9, empty')).toHaveFocus()
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

  it('has no axe violations with letters placed', async () => {
    const { container } = renderBoard()

    await userEvent.click(square('Cipher V, letter 1 of 9, empty'))
    await userEvent.click(key('A, not used yet'))

    expect(await axe(container)).toHaveNoViolations()
  })
})
