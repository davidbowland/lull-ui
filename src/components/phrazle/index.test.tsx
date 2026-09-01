import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { PhrazleBoard } from './index'
import { DEFAULT_WIDTH, tileSize } from './layout'
import { HintBar } from '@components/hint-bar'
import { phrazleDictionary, phrazlePuzzle, phrazleStalePackLadder } from '@test/__mocks__'
import { PhrazleData, Puzzle } from '@types'

// tileSize IS A COLLABORATOR, and spying on it is the only way to see what the board's
// ResizeObserver callback measured. Everything that callback produces reaches the screen as a pixel
// width on a tile, and CLAUDE.md forbids style assertions -- so a suite that could not watch the
// call could not tell the two boxes apart at all: swapping the section for the plate leaves every
// other test in this file green. The implementation stays the real one, so nothing else here
// changes behavior.
jest.mock('./layout', () => ({
  ...jest.requireActual('./layout'),
  tileSize: jest.fn(jest.requireActual('./layout').tileSize),
}))

describe('PhrazleBoard', () => {
  const mockTileSize = tileSize as jest.Mock
  // Every user-facing string this suite asserts, quoted from the spec verbatim and declared once.
  // The curly apostrophes are the codebase's, not a typo: `isn’t` and `didn’t` and `you’re`.
  const INSTRUCTION = 'Each word must be a real word of that length. Press Guess to mark it.'
  const ROW_FULL = 'Every tile is full. Press Guess.'
  const FILL_FIRST = 'Fill every tile first.'
  // HELD rather than HOLE, and the swap is the fixture's doing rather than the copy's. HOLE is IN
  // phrazleDictionary -- `OLD HOLE` and `HOT HOLE` are both guesses this file plays or restores --
  // so a board asked to refuse it would have to refuse a word the list has. HELD is the same
  // near-miss on HOLD, one letter away, and is the word the list does not have.
  const NOT_IN_LIST = 'HELD isn’t in the word list. Change it and press Guess.'
  const SOLVED = 'Solved. The answer is TOE HOLD.'
  // The board's own REPEAT_MARK, written as the escape rather than as the character, because a
  // literal zero-width space in a test file is invisible and an editor deletes it without leaving a
  // diff a reader can see.
  //
  // IT ALTERNATES, and every assertion below is written against the arithmetic rather than around
  // it. `say` increments the nonce before the mark is drawn from it and the board appends the mark
  // on an ODD nonce, so a test's FIRST message carries one and its SECOND carries none -- the same
  // arithmetic themedanagrams asserts. Filling the row is itself a message (`Every tile is full.`), so every
  // press of Guess that follows a full row is a second message and its text stands alone. Pinning
  // both by value is what says the two consecutive messages DIFFER, which is the whole mechanism.
  const REPEAT_MARK = '\u200b'

  // markGuess on TOE HOLD / HOT HAND, worked through by hand and written here so a reader can check
  // the assertions below without running the rule: the phrase's ONE H is spent by HAND's green, so
  // HOT's H has nothing left to draw from and is GRAY on a phrase that contains an H. That is the
  // fixture the whole `no more of this letter` copy rule exists for.
  //
  // NO COUNT BETWEEN THE GUESS AND THE MARKING. This read `HOT HAND. 5 guesses left. H no copy
  // left, ...` while there was a limit to count down from. Nothing is running out now, so the head
  // is the guess and the rest is the marking.
  const COMMITTED =
    'HOT HAND. H no more of this letter, O in place, T elsewhere in this word. ' +
    'H in place, A no more of this letter, N no more of this letter, D in place.'

  // OLD HOLE is the ONE valid guess against TOE HOLD that produces all four states at once --
  // yellow O, gray L, purple D, then green H, green O, green L, purple E -- so the four segment
  // counts can be asserted on one committed row rather than on four boards.
  const FOUR_STATES = '{"guesses":["OLD HOLE"]}'

  // Five wrong guesses and six wrong guesses, every one of them shaped [3, 4] so the restore guard
  // lets them through, and not one of them TOE HOLD so none marks all green. These are the only
  // fixtures in the file that cannot be typed in a reasonable number of clicks -- six guesses is 48
  // interactions -- so a deep board is reached by RESTORING rather than by playing.
  //
  // SIX WRONG GUESSES IS NO LONGER AN ENDING, and that is the whole change these fixtures record.
  // `ALL_SPENT` used to be a lost board and is now just a board six guesses in with a seventh row
  // waiting. What finishes a board is winning on it, which is what `WON_ON_SIX` is for: the same six
  // attempts with TOE HOLD in the last slot, so every assertion that needed a finished board six
  // rows deep still has one.
  const FIVE_SPENT = '{"guesses":["HOT HAND","OLD HOLE","TEA HOLE","TOE HAND","HOT HOLE"]}'
  const ALL_SPENT = '{"guesses":["HOT HAND","OLD HOLE","TEA HOLE","TOE HAND","HOT HOLE","TEA HAND"]}'
  const WON_ON_SIX = '{"guesses":["HOT HAND","OLD HOLE","TEA HOLE","TOE HAND","HOT HOLE","TOE HOLD"]}'
  const FINISHED = 'This board is finished. Press Again to start over.'
  const INCOMPLETE = 'This puzzle didn’t arrive complete. Reload while you’re online.'

  const onProgress = jest.fn()
  const onReset = jest.fn()
  const onSolved = jest.fn()

  // JSDOM IMPLEMENTS NO SCROLLING AT ALL, so Element.prototype.scrollIntoView does not exist and the
  // board's mount effect would throw on every render in this file. Installed as a shared default in
  // beforeAll rather than inside renderBoard, because the text-field test below mounts the board
  // directly and would otherwise be the one render with no stub in place.
  //
  // THE DELETE IS NOT OPTIONAL. `clearMocks` clears this mock's calls between tests and knows
  // nothing about an assignment to a prototype, so leaving it installed poisons every suite that
  // runs after this one in the same worker.
  const scrollIntoView = jest.fn()

  // JSDOM IMPLEMENTS NO ResizeObserver EITHER, so the board's measuring effect returns at its own
  // `typeof ResizeObserver === 'undefined'` guard and the callback inside it had never run under
  // this suite -- the whole of it, including which box each dimension is read off and the guard
  // against a box that reports zero.
  //
  // Recorded rather than mocked: each instance keeps the callback it was built with and the
  // elements it was told to watch, and a test drives the callback by hand. THE DELETE IS NOT
  // OPTIONAL, for the same reason scrollIntoView's is not -- `clearMocks` knows nothing about an
  // assignment to a global.
  interface Recorded {
    callback: () => void
    disconnects: number
    observed: Element[]
  }
  const observers: Recorded[] = []
  // The board mounts exactly one, so the last one built belongs to the render under test.
  const lastObserver = (): Recorded => observers[observers.length - 1]

  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        private readonly record: Recorded

        constructor(callback: () => void) {
          this.record = { callback, disconnects: 0, observed: [] }
          observers.push(this.record)
        }

        disconnect(): void {
          this.record.disconnects += 1
        }

        observe(element: Element): void {
          this.record.observed.push(element)
        }

        unobserve(): void {
          return undefined
        }
      },
      writable: true,
    })
  })

  afterAll(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  })

  // ONE FUNCTION AND NO WRAPPER, which is the sixth prop's most visible dividend: a test writes
  // `dictionary={phrazleDictionary}` in the same call that writes `puzzle={phrazlePuzzle}`. No
  // provider, no context, no network stub, no timers. The "no dictionary" case passes `undefined` as
  // the third argument rather than mounting a different tree, so the degenerate path and the happy
  // path are the same render with one value changed.
  //
  // `delay: null` and one instance per test, never a call off the default export: the v14 default
  // puts a real setTimeout between every event in a sequence, and one click is seven events.
  //
  // THE NO-DICTIONARY CASE IS `null`, NOT `undefined`, and that is a correctness fix rather than a
  // taste one: a default parameter fires on `undefined`, so `renderBoard(puzzle, null, undefined)`
  // hands the board the real word list and asserts nothing at all. `null` is the one value the
  // default cannot swallow, and it is turned back into the absent prop at the call below.
  const renderBoard = (
    puzzle: Puzzle<PhrazleData> = phrazlePuzzle,
    progress: string | null = null,
    dictionary: ReadonlySet<string> | null = phrazleDictionary,
  ): { container: HTMLElement; unmount: () => void; user: ReturnType<typeof userEvent.setup> } => {
    const user = userEvent.setup({ delay: null })
    const { container, unmount } = render(
      <PhrazleBoard
        dictionary={dictionary ?? undefined}
        onProgress={onProgress}
        onReset={onReset}
        onSolved={onSolved}
        progress={progress}
        puzzle={puzzle}
      />,
    )
    return { container, unmount, user }
  }

  // The ribbon is FloorBar's, handed a string; the board mounts no live region of its own.
  const ribbon = (): HTMLElement => screen.getByRole('status')
  const grid = (): HTMLElement => screen.getByRole('group', { name: 'Guesses' })
  const rows = (): HTMLElement[] => within(grid()).getAllByRole('group')
  // The composing row is matched by PREFIX, never by an exact name. On a fresh board its name is
  // `Your guess, ` with the empty word slices collapsing to whitespace, and accessible-name
  // computation trims that -- so an exact matcher would be asserting a trimming rule rather than the
  // board.
  const composing = (): HTMLElement => screen.getByRole('group', { name: /^Your guess/ })
  const keyNamed = (pattern: RegExp): HTMLElement => screen.getByRole('button', { name: pattern })
  const type = async (user: ReturnType<typeof userEvent.setup>, letters: string): Promise<void> => {
    for (const letter of letters) {
      await user.click(keyNamed(new RegExp(`^${letter},`)))
    }
  }

  describe('a fresh board', () => {
    // A named landmark asserted through the accessibility tree rather than by class: `region` is
    // what a <section> resolves to once it has an accessible name, so this is simultaneously the
    // structural assertion and the proof the name reached it. getByText could defend neither.
    it('renders the two bands the frame orders into place', () => {
      const { container } = renderBoard()

      expect(screen.getByRole('region', { name: 'Phrazle' })).toBeInTheDocument()
      // Structural DOM, not a style assertion: index.css orders the two marked elements into their
      // bands, and a board that rendered one of them would take the seam with it.
      expect(container.querySelector('.lull-board')).toBeInTheDocument()
      expect(container.querySelector('.lull-instrument')).toBeInTheDocument()
    })

    // ONE ROW, NOT SIX. The board draws the guesses made plus the one being composed, so a fresh
    // board is a single row and the grid grows from there. It used to draw `maxGuesses` rows at
    // mount, five of them empty and waiting.
    it('opens with one row and nothing waiting below it', () => {
      renderBoard()

      expect(rows()).toHaveLength(1)
    })

    // The composing arm asserted at its bottom end. `guesses.length + 1` on a fresh board is 1, and
    // the number a player checks constantly lives here rather than in the ribbon.
    //
    // `Guess 1`, with no `of`: there is no total to be one of.
    it('counts the guess the player is about to make', () => {
      renderBoard()

      expect(screen.getByText('Guess 1')).toBeInTheDocument()
    })

    // Seven, and now seven is ALL of them rather than one row's worth. The five rows of hidden tiles
    // this used to be written against are gone -- a row the player has not reached is a row that has
    // not been drawn -- so the promise it defends has changed from "the future rows are hidden" to
    // "there are no future rows". Asserted from BOTH directions, because a board that rendered no
    // grid at all would satisfy the first line alone.
    it('opens seven empty tiles on the composing row and none anywhere else', () => {
      renderBoard()

      expect(screen.getAllByRole('img', { name: 'Empty' })).toHaveLength(7)
      expect(within(rows()[0]).getAllByRole('img', { name: 'Empty' })).toHaveLength(7)
    })

    // The two things nobody can guess about this bench: that every word must be a real word of
    // exactly that length, and that a letter can be marked for ANOTHER word. The instruction states
    // the first and the key states the second, which is why both are permanent -- and both are
    // SIBLINGS of the live region, never inside it, so standing text costs no announcement.
    it('states the two rules nobody can guess', () => {
      renderBoard()

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
      expect(screen.getByText('In place')).toBeInTheDocument()
      expect(screen.getByText('Elsewhere in this word')).toBeInTheDocument()
      expect(screen.getByText('In another word')).toBeInTheDocument()
      expect(screen.getByText('No bar, no more of this letter')).toBeInTheDocument()
    })

    // THE KEY IS THE MARK RATHER THAN A DESCRIPTION OF IT, asserted the same way a tile's mark is:
    // by counting [data-seg] siblings inside the one legend item. Nothing pinned this from either
    // direction -- deleting `<Bar state={state} width={18} />` from the legend left the whole suite
    // green, so the four rows could degrade to four labels and a blank gap in total silence, which
    // is exactly what they did while the segments were painted in a color invisible on the plate.
    //
    // Scoped to the item, never to the document: the grid draws the same marks, deliberately.
    //
    // REDDENS ON: dropping the <Bar> from the legend (every row reads 0); giving the legend a
    // description of the mark instead of the mark.
    it.each<[string, number]>([
      ['In place', 1],
      ['Elsewhere in this word', 2],
      ['In another word', 3],
      ['No bar, no more of this letter', 0],
    ])('draws the key for %s with the same bar the tiles use', (label, segments) => {
      renderBoard()

      expect(screen.getByText(label).querySelectorAll('[data-seg]')).toHaveLength(segments)
    })

    // 26 + Guess + Delete, which is 28 -- the cipher bench's arithmetic verbatim, on the cipher
    // bench's pad, so the two instruments cannot drift. The tools stand at the ends of the bottom
    // row; keypad/index.test.tsx holds that placement and the tab order.
    it('docks twenty-eight keys', () => {
      renderBoard()

      const pad = screen.getByRole('group', { name: 'Letters, Delete and Guess' })

      expect(within(pad).getAllByRole('button')).toHaveLength(28)
      expect(within(pad).getByRole('button', { name: 'Guess' })).toBeInTheDocument()
      expect(within(pad).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    // DELETE GOES LEFT, ON BOTH PADS, and this is one of the two halves of that promise -- the
    // cipher bench's suite holds the other. Delete is the only tool both benches have, so it is the
    // one that has to sit in a fixed corner: a player who learns the eraser on one bench has to find
    // it in the same place on the other.
    //
    // ASSERTED AS DOM POSITION, never off the group's name. `Letters, Delete and Guess` is a string
    // that would go on reading correctly with the two keys drawn the other way round, which is the
    // exact failure this is here to catch. Keypad draws the tools at index 19 and 27 -- ten keys,
    // then nine, then the left tool -- and its own suite pins that arithmetic.
    //
    // REDDENS ON: swapping the two entries in the `utility` tuple back.
    it('puts Delete at the left end of the bottom row and Guess at the right', () => {
      renderBoard()

      const keys = within(screen.getByRole('group', { name: 'Letters, Delete and Guess' })).getAllByRole('button')

      expect(keys[19]).toHaveAccessibleName('Delete')
      expect(keys[27]).toHaveAccessibleName('Guess')
    })

    // Mounted and EMPTY at the same time, which is the whole trick: NVDA and JAWS announce changes
    // inside a region they are already watching, so a role="status" element inserted with its
    // message already in it is routinely missed.
    it('mounts the live region with nothing in it', () => {
      renderBoard()

      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  describe('typing', () => {
    // THE MIRROR, and the only per-keystroke feedback a screen reader gets. Nothing is drawn under
    // the letter -- there is no per-key annotation to draw, unlike the cipher bench's `= V` -- so the
    // pad must not gain a second row of type at 320 and the position lives entirely in the name.
    it('names the tile each letter key will fill', async () => {
      const { user } = renderBoard()
      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, fills word 1 letter 1')

      await type(user, 'TOE')

      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, fills word 2 letter 1')
    })

    it('says the row is full on the key as well as in the ribbon', async () => {
      const { user } = renderBoard()

      await type(user, 'TOEHOLD')

      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, every tile is full')
      // The first message of the test, so the nonce is odd and the mark is due.
      expect(ribbon()).toHaveProperty('textContent', `${ROW_FULL}${REPEAT_MARK}`)
    })

    // §8.2: the ribbon is NOT written while the row fills. Per-letter feedback comes from the
    // control the player is standing on, so the live region stays free for the marking -- a region
    // that fired seven times a guess would bury the one message that matters.
    it('says nothing at all until the row is full', async () => {
      const { user } = renderBoard()

      await type(user, 'TOEHOL')

      expect(composing()).toHaveAccessibleName('Your guess, TOE HOL')
      expect(ribbon()).toBeEmptyDOMElement()
    })

    // ONE FUNCTION, TWO INPUTS. Delete and Backspace are the same handler, so the pad and the
    // hardware keyboard cannot answer the same board differently. Written as two tests rather than
    // one it.each row, because the only thing a table could vary here is which call to make -- and a
    // ternary in a test body to choose between them is a branch this repo's test rules exist to keep
    // out.
    it('takes the last letter back with the Delete key', async () => {
      const { user } = renderBoard()
      await type(user, 'TOEH')

      await user.click(keyNamed(/^Delete$/))

      expect(composing()).toHaveAccessibleName('Your guess, TOE')
      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, fills word 2 letter 1')
    })

    it('takes the last letter back with the hardware Backspace', async () => {
      const { user } = renderBoard()
      await type(user, 'TOEH')

      await user.keyboard('{Backspace}')

      expect(composing()).toHaveAccessibleName('Your guess, TOE')
      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, fills word 2 letter 1')
    })

    // THE FULL-ROW GUARD, WHICH NO FIXTURE REACHED: every other test in this file types exactly
    // `total` characters and stops, so `if (typed.length >= total) return` could be replaced with
    // `if (false) return` and all 114 tests stayed green. Without it the eighth press grows `typed`
    // past the row INVISIBLY -- the grid still draws seven tiles, so nothing on screen moves -- and
    // Delete then appears to do nothing for as many presses as were overtyped.
    //
    // The assertion is on the last VISIBLE letter, which is the only place the defect surfaces.
    //
    // REDDENS ON: dropping the guard from `press`, after which the D is still on the board.
    it('ignores a letter typed past the end of a full row', async () => {
      const { user } = renderBoard()
      await type(user, 'TOEHOLD')

      await type(user, 'S')
      await user.click(keyNamed(/^Delete$/))

      expect(composing()).toHaveAccessibleName('Your guess, TOE HOL')
    })

    // `hush()` IN `press`, which nothing reached either: the only test that pressed a letter with a
    // sentence already standing in the ribbon was one where the sentence was `Every tile is full.`, and that
    // press returns at the guard above before it can hush anything. So a player who pressed Guess on
    // a short row and then went on typing kept `Fill every tile first.` in the live region over a row
    // that was no longer short.
    //
    // REDDENS ON: dropping `hush()` from `press` -- the ribbon still reads `Fill every tile first.`
    it('clears a standing refusal as soon as the player types again', async () => {
      const { user } = renderBoard()
      await type(user, 'TOE')
      await user.click(keyNamed(/^Guess$/))

      expect(ribbon()).toHaveProperty('textContent', `${FILL_FIRST}${REPEAT_MARK}`)

      await type(user, 'H')

      expect(ribbon()).toBeEmptyDOMElement()
    })

    // Emptying a full row says nothing, because the pad key names go back to naming a position --
    // the same information without an announcement.
    it('says nothing when a full row is emptied', async () => {
      const { user } = renderBoard()
      await type(user, 'TOEHOLD')

      await user.click(keyNamed(/^Delete$/))

      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, fills word 2 letter 4')
      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  describe('a guess that is refused', () => {
    // NO ATTEMPT SPENT, asserted at the STORE rather than on screen. `onProgress` not being called
    // is the contract; the sign row not moving is the visible half of it, and both are asserted
    // because a board that spent an attempt and drew the old number would pass either one alone.
    it('refuses a row that is not full', async () => {
      const { user } = renderBoard()
      await type(user, 'TOE')

      await user.click(keyNamed(/^Guess$/))

      // Three letters say nothing, so this is the test's first message and the mark is due.
      expect(ribbon()).toHaveProperty('textContent', `${FILL_FIRST}${REPEAT_MARK}`)
      expect(screen.getByText('Guess 1')).toBeInTheDocument()
      expect(onProgress).not.toHaveBeenCalled()
    })

    // The FIRST offending word is named, never all of them: a player is going to fix one word and
    // press again, and a list in a live region is a list read aloud for nothing.
    it('names the first word the list does not have', async () => {
      const { user } = renderBoard()

      await type(user, 'TOEHELD')
      await user.click(keyNamed(/^Guess$/))

      // `Every tile is full.` was message one, so this is message two and stands alone.
      expect(ribbon()).toHaveProperty('textContent', NOT_IN_LIST)
      expect(screen.getByText('Guess 1')).toBeInTheDocument()
      expect(onProgress).not.toHaveBeenCalled()
    })

    // THE `dictionary ?? EMPTY` FLOOR, asserted rather than asserted-about, and under the sixth-prop
    // design this is the ONLY way to reach that state deliberately: a board mounted from PuzzleFrame
    // cannot, because the frame will not mount it without one. everyWordInDictionary is documented
    // and tested to reject every word against an empty set, so a board handed nothing refuses every
    // guess rather than throwing or silently accepting garbage.
    //
    // BOTH WORDS OFFEND HERE and only the first is named, which is where `never all of them` is
    // pinned: TOE is said and HOLD is not.
    it('refuses every guess when it was handed no dictionary', async () => {
      const { user } = renderBoard(phrazlePuzzle, null, null)

      await type(user, 'TOEHOLD')
      await user.click(keyNamed(/^Guess$/))

      expect(ribbon()).toHaveProperty('textContent', 'TOE isn’t in the word list. Change it and press Guess.')
      expect(onProgress).not.toHaveBeenCalled()
    })
  })

  // ONE GUESS TOLD APART FROM THE NEXT, which a 6px gap spent in both places a row can break could
  // not do. A guess wider than the plate wraps between its words, and that wrap used the same
  // constant as the gap between guesses -- so at a 390 viewport a three-word phrase of sixteen
  // letters drew two attempts as four evenly spaced lines with nothing saying which pair was which.
  //
  // ASSERTED BY COUNTING ELEMENTS, because CLAUDE.md forbids style assertions and jsdom lays nothing
  // out: the hairline is a real `[data-guess-rule]` sibling for the same reason the tiles' segments
  // are `[data-seg]` siblings. A `border-t` would be a promise nothing in this repo can read.
  describe('the boundary between one guess and the next', () => {
    const hairlines = (container: HTMLElement): NodeListOf<Element> => container.querySelectorAll('[data-guess-rule]')

    // Nothing above the first row to divide it from, so a fresh board draws no line at all -- a
    // single rule floating above one empty row is a boundary between a guess and nothing.
    it('draws no line on a board with a single row', () => {
      const { container } = renderBoard()

      expect(rows()).toHaveLength(1)
      expect(hairlines(container)).toHaveLength(0)
    })

    // BETWEEN EVERY ADJACENT PAIR, and the composing row counts as one of the pair: the row being
    // typed is an attempt like any other and has to be told apart from the marked one above it.
    // Five restored guesses plus the composing row is six rows and therefore five lines.
    it('draws one line between each row and the row above it', () => {
      const { container } = renderBoard(phrazlePuzzle, FIVE_SPENT)

      expect(rows()).toHaveLength(6)
      expect(hairlines(container)).toHaveLength(5)
    })

    // GROWS WITH THE GRID. A committed guess adds a row and therefore a line, which is the arithmetic
    // that would silently stop holding if the rules were rendered from a fixed list rather than from
    // the row count.
    it('gains a line with every guess committed', async () => {
      const { container, user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(rows()).toHaveLength(2)
      expect(hairlines(container)).toHaveLength(1)
    })

    // A FINISHED BOARD DRAWS NO COMPOSING ROW, so the line that would have separated it goes too --
    // otherwise a solved board ends in a rule with nothing under it.
    it('draws no line below the last row of a finished board', () => {
      const { container } = renderBoard(phrazlePuzzle, WON_ON_SIX)

      expect(rows()).toHaveLength(6)
      expect(hairlines(container)).toHaveLength(5)
    })

    // aria-hidden and OUTSIDE the row groups, both of which matter. Inside a group the hairline would
    // sit within `Guess 1, HOT HAND` and take the wrap gap instead of the guess gap; audible, it
    // would put a meaningless stop between every pair of rows for a screen-reader user who already
    // hears each row named.
    it('keeps the lines out of the accessibility tree and out of the rows', () => {
      const { container } = renderBoard(phrazlePuzzle, FIVE_SPENT)

      for (const line of hairlines(container)) {
        expect(line).toHaveAttribute('aria-hidden', 'true')
        expect(line.closest('[role="group"]')).toBe(grid())
      }
    })
  })

  // WHAT A KEY KNOWS, and the whole feature is one question: is this letter worth pressing again.
  // Three states, not the tiles' four -- a key is not inside a word, so `elsewhere in this word` and
  // `in place` are claims it cannot make.
  describe('the state a letter key carries', () => {
    const struck = (container: HTMLElement): NodeListOf<Element> => container.querySelectorAll('[data-struck]')

    // HOT HAND against TOE HOLD marks H gray then green, O green, T yellow, A gray, N gray, D green.
    // So the guess splits the alphabet three ways in one move: five letters the phrase has, two it
    // does not, and nineteen nobody has asked about.
    const afterHotHand = async (): Promise<{ container: HTMLElement; user: ReturnType<typeof userEvent.setup> }> => {
      const { container, user } = renderBoard()
      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))
      return { container, user }
    }

    // An untried key contributes NO verdict rather than a third phrase saying so. Naming the absence
    // would put a sentence on 26 keys at mount, every one of it saying nothing happened yet.
    it('says nothing about a letter nobody has guessed', () => {
      renderBoard()

      expect(keyNamed(/^B,/)).toHaveAccessibleName('B, fills word 1 letter 1')
    })

    it('marks a letter the phrase has', async () => {
      await afterHotHand()

      expect(keyNamed(/^O,/)).toHaveAccessibleName('O, in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, in the phrase, fills word 1 letter 1')
    })

    it('marks a letter the phrase does not have', async () => {
      await afterHotHand()

      expect(keyNamed(/^A,/)).toHaveAccessibleName('A, not in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^N,/)).toHaveAccessibleName('N, not in the phrase, fills word 1 letter 1')
    })

    // THE ONE CASE THAT DECIDES THE PRECEDENCE, and it is on the very first guess. HOT HAND spells H
    // twice: the phrase's single H is taken by HAND's green, so HOT's H is GRAY on the board that
    // proves the letter is in the phrase. Written with the branches the other way round, the key
    // would report a live letter as ruled out.
    //
    // REDDENS ON: swapping the two arms of keyStatuses, or dropping the `undefined` guard on the
    // gray one.
    it('keeps a letter marked present when a later copy of it comes back gray', async () => {
      await afterHotHand()

      expect(keyNamed(/^H,/)).toHaveAccessibleName('H, in the phrase, fills word 1 letter 1')
    })

    // THE SAME PRECEDENCE READ THE OTHER WAY, and the guesses arrive in the other order. L is gray in
    // OLD and green in HOLE within one marking, so a walk that stopped at the first verdict it found
    // for a letter would report it ruled out.
    it('keeps a letter marked present when an earlier copy of it came back gray', () => {
      renderBoard(phrazlePuzzle, FOUR_STATES)

      expect(keyNamed(/^L,/)).toHaveAccessibleName('L, in the phrase, fills word 1 letter 1')
    })

    // COLOR IS NOT A CHANNEL ON ITS OWN, and this is the assertion that says so. The strike is a real
    // element for the same reason the tiles' segments are: a `line-through` lives in a stylesheet,
    // where style assertions are forbidden and jsdom lays nothing out, so the whole non-color channel
    // would be a promise nothing here can read.
    //
    // TWO, and exactly two -- one per ruled-out letter. Drawn on `present` keys as well, the mark
    // would say the opposite of the name beside it.
    it('strikes the ruled-out keys and only those', async () => {
      const { container } = await afterHotHand()

      expect(struck(container)).toHaveLength(2)
    })

    it('draws no strike before any guess has been marked', () => {
      const { container } = renderBoard()

      expect(struck(container)).toHaveLength(0)
    })

    // The mark is redundant with the name, so a screen reader must not meet it as a third thing on a
    // key it has already heard the verdict for.
    it('keeps the strike out of the accessibility tree', async () => {
      const { container } = await afterHotHand()

      for (const mark of struck(container)) {
        expect(mark).toHaveAttribute('aria-hidden', 'true')
      }
    })

    // NOTHING IS EVER DISABLED, which is the requirement this feature was asked for under. A player
    // spelling a real word that happens to contain a dead letter is doing something ordinary, and the
    // dictionary is what refuses a guess -- never the pad.
    //
    // REDDENS ON: a `disabled` or `aria-disabled` reaching the ruled-out key.
    it('leaves a ruled-out key pressable', async () => {
      const { user } = await afterHotHand()

      await user.click(keyNamed(/^A,/))

      expect(composing()).toHaveAccessibleName('Your guess, A')
      // BOTH ATTRIBUTES, because they fail differently and only one of them is what `toBeEnabled`
      // reads. `disabled` takes the key out of the tab order outright; `aria-disabled` leaves it
      // reachable and tells a screen reader it does nothing, which is the more tempting edit of the
      // two and the harder one to notice, since the key would go on working for everyone else.
      expect(keyNamed(/^A,/)).toBeEnabled()
      expect(keyNamed(/^A,/)).not.toHaveAttribute('aria-disabled')
    })

    // THE PAD IS 28 TAB STOPS WHATEVER THE BOARD KNOWS. A verdict is a paint and a name, never a
    // change to what is reachable -- so a player working the pad from a keyboard finds the same keys
    // in the same order on guess one and on guess twelve.
    //
    // REDDENS ON: a ruled-out key rendered as anything but a focusable <button>.
    it('keeps every key in the tab order once the verdicts are in', async () => {
      await afterHotHand()

      expect(
        within(screen.getByRole('group', { name: 'Letters, Delete and Guess' })).getAllByRole('button'),
      ).toHaveLength(28)
    })

    // The verdicts are folded out of the markings on screen, so clearing the board clears them with
    // it. A key still struck over an empty grid is a board remembering a game it has thrown away.
    it('forgets every verdict when the board is played again', async () => {
      const { container, user } = renderBoard(phrazlePuzzle, WON_ON_SIX)

      await user.click(keyNamed(/^Play again$/))

      expect(struck(container)).toHaveLength(0)
      expect(keyNamed(/^A,/)).toHaveAccessibleName('A, fills word 1 letter 1')
    })

    // The two utility keys are not letters and can never be ruled out, so they take no verdict at
    // all -- and the name a group promises has to keep matching the buttons in it.
    it('gives the utility keys no verdict', async () => {
      await afterHotHand()

      expect(keyNamed(/^Guess$/)).toHaveAccessibleName('Guess')
      expect(keyNamed(/^Delete$/)).toHaveAccessibleName('Delete')
    })
  })

  // A BOUGHT RUNG IS A VERDICT LIKE ANY OTHER, and this block is the whole of what changed when this
  // bench stopped being the one where a hint moves nothing. Every rung this game sells is a statement
  // about the alphabet -- which letters are wasted, which are in play -- so every rung lands on the
  // alphabet, in the same three tones a guess uses and with no fourth tone to learn.
  //
  // THE FIXTURES ARE STORED RECORDS, in `attachHints`'s own key order (guesses, opened, hints), and
  // every one of them is a string the app can actually write. The board reads them off the LIVE
  // progress prop, which is what the two `rerender` tests below exist to hold.
  describe('the state a bought hint puts on a letter key', () => {
    const struck = (container: HTMLElement): NodeListOf<Element> => container.querySelectorAll('[data-struck]')

    // TOE HOLD has no B, no G and no P, so this is a rung the rule can genuinely draw -- and none of
    // the three appears in any guess this file plays, so a mark on them can only have come from here.
    const ABSENT_RUNG = '{"guesses":[],"opened":1,"hints":[{"kind":"absent","letters":"BGP"}]}'
    // D, E and L are all in TOE HOLD. `letters` is canonical (sorted) because that is the one
    // spelling `canonical` writes, and a fixture in any other order would be a record the app cannot
    // produce.
    const PRESENT_RUNG = '{"guesses":[],"opened":1,"hints":[{"kind":"present","letters":"DEL"}]}'
    // Word 2 of TOE HOLD is HOLD, so this rung's four letters are H, O, L and D.
    const WORD_RUNG = '{"guesses":[],"opened":1,"hints":[{"kind":"word","index":1}]}'
    // A LADDER NOBODY PAID FOR. `opened` below the rung count is the shape a leak of the adapter's
    // speculative tail would have, and `hintTail` refuses the whole record -- so the pad must show
    // nothing at all.
    const UNBOUGHT_RUNG = '{"guesses":[],"opened":0,"hints":[{"kind":"absent","letters":"BGP"}]}'
    // One guess and one rung on the same board: HOT HAND rules out A and N, the rung rules out B, G
    // and P, and the two sources have to add up rather than replace each other.
    const RUNG_AND_GUESS = '{"guesses":["HOT HAND"],"opened":1,"hints":[{"kind":"absent","letters":"BGP"}]}'

    // The whole of the reported bug: the bar said "The phrase has no B, no G, and no P." and the pad
    // went on offering all three as though nobody had asked.
    it('rules out the keys an absent rung names', () => {
      renderBoard(phrazlePuzzle, ABSENT_RUNG)

      expect(keyNamed(/^B,/)).toHaveAccessibleName('B, not in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^G,/)).toHaveAccessibleName('G, not in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^P,/)).toHaveAccessibleName('P, not in the phrase, fills word 1 letter 1')
    })

    // COLOR IS NOT A CHANNEL ON ITS OWN here either, so the strike has to arrive with the name. Three,
    // and exactly three, on a board where no guess has been marked at all -- which is what says the
    // mark came from the rung rather than from a tile.
    it('strikes the keys an absent rung names and only those', () => {
      const { container } = renderBoard(phrazlePuzzle, ABSENT_RUNG)

      expect(struck(container)).toHaveLength(3)
    })

    it('marks the keys a present rung names', () => {
      renderBoard(phrazlePuzzle, PRESENT_RUNG)

      expect(keyNamed(/^D,/)).toHaveAccessibleName('D, in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^E,/)).toHaveAccessibleName('E, in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^L,/)).toHaveAccessibleName('L, in the phrase, fills word 1 letter 1')
    })

    // A present rung is the opposite verdict, so it must not bring the mark that says the opposite.
    it('draws no strike for a present rung', () => {
      const { container } = renderBoard(phrazlePuzzle, PRESENT_RUNG)

      expect(struck(container)).toHaveLength(0)
    })

    // `in the phrase` AND NOT `in place`, which is the one thing a key may never say. The rung names
    // a word and alphabetizes its letters precisely so no position can be read off it, and the pad
    // has no position to offer either -- so what the four letters get is membership and nothing more.
    it('marks the keys a word rung names without claiming a position', () => {
      renderBoard(phrazlePuzzle, WORD_RUNG)

      expect(keyNamed(/^H,/)).toHaveAccessibleName('H, in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^O,/)).toHaveAccessibleName('O, in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^L,/)).toHaveAccessibleName('L, in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^D,/)).toHaveAccessibleName('D, in the phrase, fills word 1 letter 1')
    })

    // A word rung says nothing about the letters it left out, and T is in word 1.
    it('leaves the letters a word rung did not name untouched', () => {
      renderBoard(phrazlePuzzle, WORD_RUNG)

      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, fills word 1 letter 1')
    })

    // THE HINT-FARM HOLE, closed at the pad. The adapter folds a speculative tail forward from live
    // state on every render and HintBar never draws it; a pad that read the fold instead of the
    // bought rungs would hand a player three letters for free, permanently, without a press.
    //
    // REDDENS ON: the board reading the adapter's ladder rather than the stored `hints`.
    it('marks nothing for a rung the player has not bought', () => {
      const { container } = renderBoard(phrazlePuzzle, UNBOUGHT_RUNG)

      expect(keyNamed(/^B,/)).toHaveAccessibleName('B, fills word 1 letter 1')
      expect(struck(container)).toHaveLength(0)
    })

    // TWO SOURCES, ONE PAD. A and N come off the marked tiles, B, G and P off the rung, and five
    // strikes is the union rather than either side winning.
    it('adds a rung to the verdicts the guesses already reached', () => {
      const { container } = renderBoard(phrazlePuzzle, RUNG_AND_GUESS)

      expect(keyNamed(/^A,/)).toHaveAccessibleName('A, not in the phrase, fills word 1 letter 1')
      expect(keyNamed(/^G,/)).toHaveAccessibleName('G, not in the phrase, fills word 1 letter 1')
      expect(struck(container)).toHaveLength(5)
    })

    // NOTHING IS EVER DISABLED, and a rung must not become the one thing that disables a key. A
    // player spelling a real word that happens to contain a letter a hint ruled out is doing
    // something ordinary.
    it('leaves a key a rung ruled out pressable', async () => {
      const { user } = renderBoard(phrazlePuzzle, ABSENT_RUNG)

      await user.click(keyNamed(/^B,/))

      expect(composing()).toHaveAccessibleName('Your guess, B')
      expect(keyNamed(/^B,/)).toBeEnabled()
      expect(keyNamed(/^B,/)).not.toHaveAttribute('aria-disabled')
    })

    // The mark is redundant with the name on this path too, and it is the SAME element -- so what
    // this defends is that the rung route reaches `Strike` rather than growing a second mark of its
    // own somewhere along the way.
    it('keeps a rung-drawn strike out of the accessibility tree', () => {
      const { container } = renderBoard(phrazlePuzzle, ABSENT_RUNG)

      for (const mark of struck(container)) {
        expect(mark).toHaveAttribute('aria-hidden', 'true')
      }
    })

    // THE BAR ALREADY SAID THE SENTENCE. HintBar announces "The phrase has no B, no G, and no P." when
    // the rung is bought, so a board that also announced the marks would read one purchase twice, in
    // two voices, out of two live regions on one screen. The pad's own key names carry the whole of
    // what this board owes a screen reader here.
    //
    // REDDENS ON: any message this board says about a rung.
    it('announces nothing of its own about a rung', () => {
      renderBoard(phrazlePuzzle, ABSENT_RUNG)

      expect(ribbon()).toHaveProperty('textContent', '')
    })

    // THE READ IS OFF THE LIVE PROP AND THE GUESSES ARE NOT, which is the split cryptogram and Themed
    // Anagrams already make and the reason a purchase lands without a remount. A rung bought
    // mid-composition has to reach the pad on the very next render AND leave the half-typed row
    // exactly where it was -- a board that re-read its own portion here would throw away three
    // letters the player is looking at.
    //
    // REDDENS ON: the hint tail read in a mount-time initializer beside the guesses.
    it('marks the pad when a rung lands on a board already being typed into', async () => {
      const user = userEvent.setup({ delay: null })
      const board = (progress: string | null): React.ReactNode => (
        <PhrazleBoard
          dictionary={phrazleDictionary}
          onProgress={onProgress}
          onReset={onReset}
          onSolved={onSolved}
          progress={progress}
          puzzle={phrazlePuzzle}
        />
      )
      const { rerender } = render(board(null))
      await type(user, 'TOE')

      rerender(board(ABSENT_RUNG))

      expect(keyNamed(/^G,/)).toHaveAccessibleName('G, not in the phrase, fills word 2 letter 1')
      expect(composing()).toHaveAccessibleName('Your guess, TOE')
    })

    // The other end of the same wire. Play again is the shell's to answer -- the board raises
    // `onReset` and PuzzleFrame stores '' over the whole record -- so what arrives here is a progress
    // prop with no ladder in it, and the marks have to go with it. A key still struck over a board
    // with no rungs is a pad remembering a hint nobody owns.
    it('forgets a rung when the shell clears the record', () => {
      const board = (progress: string | null): React.ReactNode => (
        <PhrazleBoard
          dictionary={phrazleDictionary}
          onProgress={onProgress}
          onReset={onReset}
          onSolved={onSolved}
          progress={progress}
          puzzle={phrazlePuzzle}
        />
      )
      const { container, rerender } = render(board(ABSENT_RUNG))

      rerender(board(''))

      expect(keyNamed(/^G,/)).toHaveAccessibleName('G, fills word 1 letter 1')
      expect(struck(container)).toHaveLength(0)
    })
  })

  describe('a guess that is marked', () => {
    // THE WHOLE SENTENCE STILL REACHES THE LIVE REGION, which is why this is asserted as an exact
    // textContent and not as a substring: splitting the string into a visible head and a hidden tail
    // must not drop a word or run two sentences together, and textContent concatenates adjacent nodes
    // with nothing between them, so the space before `H no more of this letter` is exactly the kind
    // of thing this catches.
    it('announces the marked row entire', async () => {
      const { user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(ribbon()).toHaveProperty('textContent', COMMITTED)
    })

    // AND ONLY THE HEAD IS DRAWN. The tail is a per-letter transcript of a grid the sighted player is
    // looking at, and the ribbon is two lines tall -- so the clamp spent both of them on the
    // transcript and trailed off in an ellipsis partway through the second word. The reader it was
    // written for could not finish it; the reader who needs it hears it either way.
    //
    // Asserted through the accessibility tree rather than by class: `getByText` matches the element
    // whose own text is exactly the head, which exists only once the string has actually been split.
    // Before the split no node in the ribbon had this text.
    //
    // REDDENS ON: passing the tail back into `message`, or dropping the detail prop.
    it('draws the guess and hides the per-letter marking', async () => {
      const { user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(within(ribbon()).getByText('HOT HAND.')).toBeInTheDocument()
      expect(within(ribbon()).queryByText(COMMITTED)).toBeNull()
    })

    // THE DETAIL DOES NOT CARRY. A plain sentence after a marking must announce that sentence alone,
    // never that sentence with the previous guess's transcript still hanging off it -- which is what
    // a `detail` defaulted to the previous value would do.
    //
    // REDDENS ON: `say` carrying `previous.detail` instead of defaulting to ''.
    it('drops the marking when the next message is a plain sentence', async () => {
      const { user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))
      await user.click(keyNamed(/^Guess$/))

      // The test's THIRD message -- `Every tile is full.`, then the marking, then this -- so the
      // nonce is odd and the mark is due. Nothing follows it, which is the assertion: no space, no
      // transcript, nothing carried over from the guess before.
      expect(ribbon()).toHaveProperty('textContent', `${FILL_FIRST}${REPEAT_MARK}`)
    })

    // MARKS ARE DERIVED, NEVER STORED. The stored blob is raw guesses and nothing else, so a future
    // marking fix REPAIRS every saved board instead of contradicting it -- which is what makes the
    // vendored-rules exposure survivable at all.
    it('stores the guess and no marks', async () => {
      const { user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(onProgress).toHaveBeenCalledWith('{"guesses":["HOT HAND"]}')
    })

    it('moves the count on and empties the composing row', async () => {
      const { user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(screen.getByText('Guess 2')).toBeInTheDocument()
      expect(composing()).toHaveAccessibleName('Your guess,')
      // The verdict is now the middle term of every letter key's name. T was yellow in HOT, so the
      // key carries `in the phrase` from here on and the caret note still follows it.
      expect(keyNamed(/^T,/)).toHaveAccessibleName('T, in the phrase, fills word 1 letter 1')
    })

    it('turns the committed row into read-only marked history', async () => {
      const { user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(screen.getByRole('group', { name: 'Guess 1, HOT HAND' })).toBeInTheDocument()
    })

    // EVERY TILE SAYS ITS STATE IN WORDS, and this is the channel that owes nothing to sight at all.
    // `no more of this letter`, never `not in the phrase`: the H below IS in the phrase, and a membership
    // claim there is a lie the player can disprove by looking.
    it.each<[string, string]>([
      ['a green tile', 'O, in place'],
      ['a yellow tile', 'T, elsewhere in this word'],
      ['a gray tile', 'A, no more of this letter'],
    ])('names %s in words', async (_description, name) => {
      const { user } = renderBoard()

      await type(user, 'HOTHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(screen.getByRole('img', { name })).toBeInTheDocument()
    })

    it('names a purple tile for the word it belongs to', () => {
      renderBoard(phrazlePuzzle, FOUR_STATES)

      expect(screen.getByRole('img', { name: 'D, in another word' })).toBeInTheDocument()
    })

    // THE NON-COLOR CHANNEL, counted in the DOM. Segments count DISTANCE FROM HOME: one unbroken
    // bar, the letter is home; two, it belongs in this word somewhere else; three, it belongs in
    // another word; none, no unspent copy is left anywhere. The zero is the row that matters most --
    // it is the state whose only other signal is a fill a deuteranope reads as one of two similar
    // darks.
    //
    // SCOPED WITH `within(tile)`, ALWAYS. The legend draws the same [data-seg] marks the tiles draw,
    // deliberately, so an unscoped querySelectorAll counts six more than the grid holds.
    it.each<[string, string, number]>([
      ['a green tile is one unbroken bar', 'H, in place', 1],
      ['a yellow tile is a bar split in two', 'O, elsewhere in this word', 2],
      ['a purple tile is a bar split in three', 'D, in another word', 3],
      ['a gray tile has no bar at all', 'L, no more of this letter', 0],
    ])('%s', (_description, name, segments) => {
      renderBoard(phrazlePuzzle, FOUR_STATES)

      const tile = screen.getByRole('img', { name })

      expect(tile.querySelectorAll('[data-seg]')).toHaveLength(segments)
      // THE WRAPPER IS aria-hidden, ASSERTED AS THE ATTRIBUTE. This used to read
      // `expect(tile).toHaveAccessibleName(name)` on a tile fetched BY that exact name, so it
      // re-asserted the selection criterion and could not fail in principle -- and it could not have
      // caught the thing it was written about either, because `aria-label` wins the name computation
      // outright over any child text. Deleting `aria-hidden` from Bar left all 114 tests green.
      //
      // The bar is the last child on every marked tile, after the letter. What the attribute buys is
      // that a screen reader working the row hears the state once, in words, rather than also
      // meeting the marks as nodes of their own.
      //
      // REDDENS ON: dropping `aria-hidden="true"` from Bar.
      expect(tile.children[1]).toHaveAttribute('aria-hidden', 'true')
    })

    // THE RIBBON COUNTS NOTHING NOW, and this is where a count would come back. It used to read
    // `HOT HOLE. 1 guess left.` on a board four guesses deep -- the singular arm of a plural rule,
    // guarding against `1 guesses left`. There is no number to be singular about: nothing is running
    // out. The head is the guess and the tail is the marking, and the sign row keeps the one count
    // that still means something.
    //
    // REDDENS ON: putting any remaining-count clause back into the ribbon.
    it('says what the guess was marked and never what is left', async () => {
      const spent = JSON.stringify({ guesses: ['HOT HAND', 'OLD HOLE', 'TEA HOLE', 'TOE HAND'] })
      const { user } = renderBoard(phrazlePuzzle, spent)

      await type(user, 'HOTHOLE')
      await user.click(keyNamed(/^Guess$/))

      // NOT `stringContaining('left.')`, which the marking tail matches on its own -- `no more of this letter`
      // is one of the four state phrases and ends a word group with a full stop. The two forms the
      // deleted clause could take are what this excludes.
      expect(ribbon()).toHaveProperty('textContent', expect.stringContaining('HOT HOLE. H no more of this letter,'))
      expect(ribbon()).toHaveProperty('textContent', expect.not.stringContaining('guess left'))
      expect(ribbon()).toHaveProperty('textContent', expect.not.stringContaining('guesses left'))
    })
  })

  describe('the hardware keyboard', () => {
    // ENTER COMMITS FROM <body>: the laptop player who arrives and types, with focus wherever the
    // page left it. ONE user.keyboard call and NO click first, because a click would move focus onto
    // a pad key and change what {Enter} means -- which is the negative case pinned by `types another
    // letter when Enter is pressed on a focused pad key` below.
    it('fills and commits a row from the body', async () => {
      const { user } = renderBoard()

      await user.keyboard('TOEHOLD{Enter}')

      expect(onProgress).toHaveBeenCalledWith('{"guesses":["TOE HOLD"]}')
    })

    it('takes a lowercase keystroke as the letter it is', async () => {
      const { user } = renderBoard()

      await user.keyboard('toe')

      expect(composing()).toHaveAccessibleName('Your guess, TOE')
    })

    // THE BOARD BAND IS A FOCUS DESTINATION NOW, and that is a new place keystrokes can arrive from.
    // It is `tabIndex={0}` so a keyboard player can scroll a growing grid, and a <section> acts on
    // nothing -- so rule 3 correctly declines to treat it like a button and Enter falls through to
    // `commit`. This is the same shape as the hint sheet, which holds focus for the same reason and
    // is answered by the OPEN check rather than by the tag test.
    //
    // The whole phrase is typed and committed from that focus, because the failure this guards
    // against is asymmetric: a tag test widened to swallow SECTION would leave letters working and
    // silently eat only the Enter.
    //
    // REDDENS ON: adding SECTION to rule 3's tag test, after which the guess is never committed.
    it('fills and commits a row with the board band focused', async () => {
      const { user } = renderBoard()

      await user.tab()

      expect(screen.getByRole('region', { name: 'Phrazle' })).toHaveFocus()

      await user.keyboard('TOEHOLD{Enter}')

      expect(onProgress).toHaveBeenCalledWith('{"guesses":["TOE HOLD"]}')
    })
  })

  describe('a solve', () => {
    it('says so in the same words the other two phrase benches use', async () => {
      const { user } = renderBoard()

      await type(user, 'TOEHOLD')
      await user.click(keyNamed(/^Guess$/))

      // `Every tile is full.` was message one, so the win is message two and its text stands alone.
      expect(ribbon()).toHaveProperty('textContent', SOLVED)
      expect(onSolved).toHaveBeenCalledTimes(1)
    })

    // The count FREEZES at the attempt that won rather than advancing to a row that will never be
    // composed. `Guess 1` here is what was spent, still true, and the number a player would
    // tell a friend.
    it('stops the count at the attempt that won', async () => {
      const { user } = renderBoard()

      await type(user, 'TOEHOLD')
      await user.click(keyNamed(/^Guess$/))

      expect(screen.getByText('Guess 1')).toBeInTheDocument()
    })

    // A RESTORED win reports nothing: `reported` is a ref initialized to the MOUNT-TIME solved
    // value, so a board coming back from storage does not re-report a solve the shell already
    // recorded. `resting` carries the sentence instead, outside the live region, so it is read in
    // place rather than announced.
    it('says so on a restored board without announcing it or reporting it again', () => {
      renderBoard(phrazlePuzzle, '{"guesses":["TOE HOLD"]}')

      expect(screen.getByText(SOLVED)).toBeInTheDocument()
      expect(ribbon()).toBeEmptyDOMElement()
      expect(onSolved).not.toHaveBeenCalled()
    })
  })

  // THE GUARD TESTED BY RESTORING, not by mounting a default board. markGuess THROWS by contract on
  // a shape mismatch and the board dereferences its result during render, so this is the case that
  // would otherwise latch: the bad write is already on disk, so the board would throw at mount for
  // the life of the install with nothing to self-heal it.
  describe('a stored board that no longer fits', () => {
    it('drops a guess of the wrong shape rather than throwing', () => {
      renderBoard(phrazlePuzzle, '{"guesses":["CAT"]}')

      // ONE row, which is the fresh board: nothing survived the shape check, so there is no history
      // and the composing row is the whole grid.
      expect(rows()).toHaveLength(1)
      expect(screen.getByText('Guess 1')).toBeInTheDocument()
      expect(screen.getAllByRole('img', { name: 'Empty' })).toHaveLength(7)
    })

    // Truncation, not filtering, seen at the board: the good guess before the bad one survives and
    // everything after it is gone, so the count of attempts spent can only ever shrink.
    it('keeps the guesses made before the one that no longer fits', () => {
      renderBoard(phrazlePuzzle, '{"guesses":["HOT HAND","CAT","OLD HOLE"]}')

      expect(screen.getByRole('group', { name: 'Guess 1, HOT HAND' })).toBeInTheDocument()
      expect(screen.getByText('Guess 2')).toBeInTheDocument()
    })
  })

  describe('the composing row is kept in view', () => {
    // `nearest` rather than `center`, so on a viewport where everything fits it does nothing at all.
    // This is the guess bench's version of goFigure's non-negotiable: the two things a player is
    // comparing are the row they are typing and the row they just had marked, and they are adjacent,
    // so keeping the bottom of the grid in view keeps both.
    //
    // Once at mount and once per commit, keyed to guesses.length -- NOT to every keystroke, which
    // would fight a player who has scrolled up to re-read row 1.
    //
    // REDDENS ON: dropping the effect (0 calls at the first assertion); keying it to `[typed]` (8
    // calls at the second); `center` instead of `nearest` (the last-called-with).
    it('scrolls at mount and after a commit, and not on a keystroke', async () => {
      const { user } = renderBoard()

      expect(scrollIntoView).toHaveBeenCalledTimes(1)

      await type(user, 'HOTHAND')

      expect(scrollIntoView).toHaveBeenCalledTimes(1)

      await user.click(keyNamed(/^Guess$/))

      expect(scrollIntoView).toHaveBeenCalledTimes(2)
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    })

    // THE OTHER ARM OF `composingRef.current?.`, and it is the arm a reader assumes cannot happen. A
    // finished board draws no composing row at all, so the ref holds null and the effect that runs
    // at mount has nothing to point at. Without the optional chain this render throws.
    //
    // REDDENS ON: `ref={composingRef}` on every row unconditionally -- the last row rendered wins
    // and the finished board scrolls to row 6.
    //
    // A WON board rather than a lost one, because winning is the only way a board finishes now. The
    // arm being exercised is the same: `rows` is `guesses.length` once `over`, so no composing row
    // is drawn and the ref holds null.
    it('scrolls nothing at all on a board with no composing row', () => {
      renderBoard(phrazlePuzzle, WON_ON_SIX)

      expect(screen.getByText(SOLVED)).toBeInTheDocument()
      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })

  // THE BOARD THAT CANNOT BE LOST, which is where the loss state used to be asserted. Every row in
  // this block was written the other way round: `says what happened and says the answer`, `stops the
  // count at the last attempt spent`, `says it without announcing it on a restored board`. The
  // ending they described does not exist, so what defends its absence is the same three moments
  // asserted to CONTINUE.
  describe('a board that runs long', () => {
    // THE GUESS THAT USED TO END IT. Six attempts deep with none of them right, and the board answers
    // with the ordinary marking sentence and grows another row.
    //
    // REDDENS ON: any `next.length >= rows` branch coming back into commit, which would say
    // `Out of guesses.` here instead.
    it('marks the guess that used to be the last one and carries on', async () => {
      const { user } = renderBoard(phrazlePuzzle, FIVE_SPENT)

      await type(user, 'TEAHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(ribbon()).toHaveProperty('textContent', expect.stringContaining('TEA HAND. T in place,'))
      expect(ribbon()).toHaveProperty('textContent', expect.not.stringContaining('Out of guesses'))
      expect(onSolved).not.toHaveBeenCalled()
    })

    // THE COUNT KEEPS COUNTING, past the six that used to be the wall. `spent` is `rows`, which is
    // the guesses made plus the composing row, so a board six deep is on `Guess 7` -- a number the
    // old sign row could not render at all.
    //
    // REDDENS ON: any clamp on `spent` or on `rows`.
    it('counts past the guess that used to be the last one', async () => {
      const { user } = renderBoard(phrazlePuzzle, FIVE_SPENT)

      await type(user, 'TEAHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(screen.getByText('Guess 7')).toBeInTheDocument()
      expect(rows()).toHaveLength(7)
    })

    // THE GRID GREW BY EXACTLY ONE, which is the request stated as an assertion: a row is added when
    // one is needed, not a batch and not a fixed set drawn in advance. Asserted across a commit
    // rather than at one moment, because a board that drew `guesses.length + 2` would satisfy any
    // single count.
    it('adds exactly one row per guess', async () => {
      const { user } = renderBoard(phrazlePuzzle, FIVE_SPENT)

      expect(rows()).toHaveLength(6)

      await type(user, 'TEAHAND')
      await user.click(keyNamed(/^Guess$/))

      expect(rows()).toHaveLength(7)
    })

    // A RESTORED long board is still being played: no standing sentence, an empty ribbon, and a
    // composing row waiting. The old version of this row asserted `Out of guesses.` in standing text
    // on this exact fixture.
    //
    // REDDENS ON: any third arm returning to `restingLine()`.
    it('says nothing at rest on a restored board that has not been won', () => {
      renderBoard(phrazlePuzzle, ALL_SPENT)

      expect(screen.getByText('Guess 7')).toBeInTheDocument()
      expect(ribbon()).toBeEmptyDOMElement()
      expect(screen.getByRole('group', { name: 'Your guess,' })).toBeInTheDocument()
      expect(screen.queryByText(/Out of guesses/)).toBeNull()
    })

    // FAR PAST ANYTHING THE OLD BOARD COULD DRAW, and the row that shows "forever" is not a figure of
    // speech. MAX_ROWS was 12; the storage window is 25, which is what a restore can carry, so this
    // is the deepest board reachable from a stored blob -- 25 spent rows and a 26th to type into.
    it('draws a board deeper than any limit it ever had', () => {
      const deep = JSON.stringify({ guesses: Array.from({ length: 25 }, () => 'HOT HAND') })
      renderBoard(phrazlePuzzle, deep)

      expect(rows()).toHaveLength(26)
      expect(screen.getByText('Guess 26')).toBeInTheDocument()
    })
  })

  // FINISHED MEANS WON, and that is now the whole of it. Every fixture in this block used to be a
  // board with six attempts spent and none of them right; a board like that is still in play, so
  // each one is the same six attempts with the last one correct. What is under test is unchanged --
  // the `over` guards on press, erase and commit, and the key swapped in place -- because those
  // guards ask `over` and never ask how the board got there.
  describe('a finished board', () => {
    // TABBED INTO, NEVER PAST. A control removed from the tab order is simply skipped, so a walk
    // that passes over it reaches the next element either way and proves nothing at all. The pad
    // keys here are deliberately still in the tab order -- §8.8 is the whole reason they stay -- so
    // this focuses one, activates it, and asserts what it answered.
    //
    // {Enter} on a focused button is the button's OWN activation (rule 3 declines it), which is
    // exactly the path a keyboard player takes.
    //
    // REDDENS ON: dropping the `over` guard from `press`, which types a Q into a row that does not
    // exist -- the composing-row query stops being null and the ribbon says nothing at all.
    // TWO TABS, NOT ONE. The board band is `tabIndex={0}` so a keyboard player can scroll a grid
    // that now grows without bound, so it is the first stop and the pad's first key is the second.
    it('refuses a letter typed into it and says which key does something', async () => {
      const { user } = renderBoard(phrazlePuzzle, WON_ON_SIX)

      await user.tab()
      await user.tab()

      // Q, because the pad is a KEYBOARD and Q is where a keyboard starts. This assertion is
      // therefore also the tab order's only pin: DOM order is what a Tab walk follows, so a pad
      // whose rows were built in some order other than the one on screen would land somewhere else
      // here and nothing about the letters would look wrong.
      //
      // IT USED TO BE A, and A was chosen because it is ruled out on this fixture -- a ruled-out key
      // is still a control, still focusable, and still refuses for the board's reason rather than
      // for its own. Q is untried, so that half moved rather than vanished: `keeps every key in the
      // tab order once the verdicts are in` counts the pad after six guesses, and the pair of
      // assertions above it hold A enabled and free of `aria-disabled`.
      expect(screen.getByRole('button', { name: 'Q, this board is finished' })).toHaveFocus()

      await user.keyboard('{Enter}')

      // The test's first message, so the nonce is odd and the mark is due.
      expect(rows()).toHaveLength(6)
      expect(ribbon()).toHaveProperty('textContent', `${FINISHED}${REPEAT_MARK}`)
      expect(onProgress).not.toHaveBeenCalled()
      expect(screen.queryByRole('group', { name: /^Your guess/ })).toBeNull()
    })

    // BOTH INPUTS, because `erase` is one function reached two ways and a test that pressed only one
    // of them would leave the other free to answer the same board differently. The second press is
    // also what pins the repeat mark doing its job: two identical sentences in a row differ by one
    // zero-width character, which is the only reason a live region announces the second.
    //
    // REDDENS ON: dropping the `over` guard from `erase`, after which both presses hush the ribbon
    // instead of answering.
    it('refuses the Delete key and the hardware Backspace too', async () => {
      const { user } = renderBoard(phrazlePuzzle, WON_ON_SIX)

      await user.click(keyNamed(/^Delete$/))

      expect(ribbon()).toHaveProperty('textContent', `${FINISHED}${REPEAT_MARK}`)

      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveProperty('textContent', FINISHED)
      expect(screen.getByRole('group', { name: 'Guess 6, TOE HOLD' })).toBeInTheDocument()
    })

    // THE ONE WAY LEFT TO REACH `commit` ON A FINISHED BOARD. The pad's key routes to `again` once
    // the board is over, so its `over` arm is reachable only from the hardware Enter -- which is
    // pressed from <body> here, with no click before it, because a click would put focus on a
    // button and rule 3 would decline the press natively.
    //
    // REDDENS ON: dropping `commit`'s `over` guard, after which the press falls through to the
    // length check and the board says `Fill every tile first.` about a row it is not drawing.
    it('refuses a hardware Enter and says which key does something', async () => {
      const { user } = renderBoard(phrazlePuzzle, WON_ON_SIX)

      await user.keyboard('{Enter}')

      // The test's first message, so the nonce is odd and the mark is due.
      expect(ribbon()).toHaveProperty('textContent', `${FINISHED}${REPEAT_MARK}`)
      expect(onProgress).not.toHaveBeenCalled()
    })

    // THE GROUP NAME FOLLOWS THE KEY. One key is swapped in place when the board is over, so a group
    // still promising a `Guess` button tells a screen-reader user navigating by group that it holds
    // a control it does not -- and `docks twenty-eight keys` above runs only on a fresh board, where
    // the promise is true.
    //
    // REDDENS ON: pinning the group's aria-label back to `Letters, Delete and Guess`.
    it('names the pad for the keys it holds once the board is over', () => {
      renderBoard(phrazlePuzzle, WON_ON_SIX)

      const pad = screen.getByRole('group', { name: 'Letters, Delete and Play again' })

      expect(within(pad).getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Letters, Delete and Guess' })).toBeNull()
    })

    // WCAG 2.5.3 asserted as a PAIR ON ONE ELEMENT, the way HintBar's control-label tests do it, so
    // the name and the visible text can never be read off two different buttons. `Play again` does
    // not fit a 46.6px key; the visible label is `Again` and the accessible name contains it.
    //
    // NOT asserted as a String.includes: `Again` is not a literal substring of `Play again`, because
    // the A is capital on the key and lowercase in the name. 2.5.3's requirement is on the text and
    // its own note allows a difference in case; what it forbids is a name that omits the word.
    //
    // REDDENS ON: naming the key `Start over`, which drops the visible word from the name.
    it('offers the way back on one key with two labels', () => {
      renderBoard(phrazlePuzzle, WON_ON_SIX)

      const again = screen.getByRole('button', { name: 'Play again' })

      expect(again).toHaveProperty('textContent', 'Again')
      expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull()
    })

    // ONE KEY SWAPPED IN PLACE, so the same DOM element stays focused: 28 keys vanishing under a
    // keyboard player's focus drops focus to <body> and restarts the next Tab at the top of the
    // page, which is the failure puzzle-frame and HintBar both document at length.
    //
    // REDDENS ON: giving the key a `key={over ? 'again' : 'guess'}`, which makes React unmount one
    // button and mount another and drops focus to <body>.
    it('keeps focus on the key that was swapped', async () => {
      const { user } = renderBoard(phrazlePuzzle, WON_ON_SIX)
      const again = screen.getByRole('button', { name: 'Play again' })
      again.focus()

      await user.click(again)

      expect(screen.getByRole('button', { name: 'Guess' })).toHaveFocus()
    })

    // THE WIN IS PLAYED, NOT RESTORED, and that is the whole reason this row is shaped the way it
    // is. Both Again tests used to start from a restored finished board, where `message.text` is
    // already '' because the sentence comes from `restingLine()` rather than from a `say` -- so
    // `hush()` in `again` could be deleted with the whole suite green. The live path is the one a
    // player takes: win on the sixth guess with the ribbon holding `Solved. The answer is TOE HOLD.`,
    // press Again, and without the hush that sentence stands in the live region over an empty board.
    //
    // IT USED TO PLAY A LOSS HERE, for exactly the same reason -- a sentence that arrived through
    // `say` rather than through `restingLine`. The loss is gone and the win is the other such
    // sentence, so the mechanism under test is untouched.
    //
    // REDDENS ON: dropping `hush()` from `again` (the ribbon still reads the win); dropping
    // `onReset?.()` (the call count); dropping `setGuesses([])` (the count and the tiles).
    it('empties the board and resets the ladder when Again is pressed', async () => {
      const { user } = renderBoard(phrazlePuzzle, FIVE_SPENT)
      await type(user, 'TOEHOLD')
      await user.click(keyNamed(/^Guess$/))

      expect(ribbon()).toHaveProperty('textContent', SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      // onReset is a LIFECYCLE SIGNAL, not game state: an empty progress string cannot carry "the
      // player started this puzzle over", and three other boards write '' for reasons that are not a
      // reset. It takes no argument and names no destination, so deleting lull:hints:<puzzleId>
      // stays entirely the shell's business.
      expect(onProgress).toHaveBeenCalledWith('')
      expect(onReset).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Guess 1')).toBeInTheDocument()
      expect(screen.getAllByRole('img', { name: 'Empty' })).toHaveLength(7)
      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  describe('a pack that did not arrive whole', () => {
    // ONE WAY TO BE UNDRAWABLE, WHERE THERE WERE TWO. The other was `maxGuesses` -- 0, or 4,000, or
    // 2.5 -- failing an integer-range test with a perfectly good answer. The field is gone from the
    // wire, so the answer is the whole of what can be missing, and `drawable` is one clause rather
    // than a count collapsed together with a flag.
    //
    // Only reachable from a corrupt pack, because isValidPuzzle deliberately leaves `data` opaque.
    // Nothing is invented and no rule is authored to paper over missing data.
    const broken = (data: Partial<PhrazleData>): Puzzle<PhrazleData> => ({
      ...phrazlePuzzle,
      data: { ...phrazlePuzzle.data, ...data },
    })

    // THE SECOND ROW IS THE TYPE GUARD, and it was pinned by nothing: `splitPhrase(typeof answer ===
    // 'string' ? answer : '')` could be written `splitPhrase(answer as string)` with the whole suite
    // green, because no fixture shipped an `answer` that was not text. A pack is JSON off the
    // network, `isValidPuzzle` deliberately leaves `data` opaque, and splitPhrase calls `.split` on
    // whatever it is handed -- so a number there throws DURING RENDER, which is the one failure that
    // latches: the pack is already on the device, nothing validates it on the way back in, and the
    // board throws at mount for the life of the install.
    //
    // REDDENS ON: `splitPhrase(answer as string)`, which throws `answer.split is not a function`.
    // Also on `const rows = guesses.length + (over ? 0 : 1)` without the `drawable` arm, which draws
    // a lone composing row of no tiles for a pack with no answer to mark it against.
    it.each<[string, Partial<PhrazleData>]>([
      ['no answer', { answer: '' }],
      ['an answer that is not text at all', { answer: 42 as unknown as string }],
    ])('draws no rows and refuses to crash on a pack with %s', (_description, data) => {
      const { container } = renderBoard(broken(data))

      // POSITIVE FIRST. `no rows` also describes a board that threw during render and left the
      // container empty, which is exactly the failure this branch exists to prevent.
      expect(screen.getByText(INCOMPLETE)).toBeInTheDocument()
      expect(container.querySelector('.lull-instrument')).toBeInTheDocument()
      expect(within(grid()).queryAllByRole('group')).toHaveLength(0)
      expect(screen.queryByText(/^Guess \d+/)).toBeNull()
    })

    // The pad is DRAWN, and every key answers with the resting line -- the cipher bench's posture
    // exactly, where a letterless ciphertext yields no squares and every handler becomes a no-op
    // with no crash. A key that answers nothing reads as a broken key.
    //
    // Named by its letter alone rather than by a fourth state sentence: `the row is full` is true of
    // a board with no row and says the wrong thing, and §7.4 has exactly three forms.
    //
    // REDDENS ON: dropping `noteForKey`'s `!drawable` arm, which names the key `T, the row is full`
    // on a board with no row.
    it('draws the pad and answers every key with the standing line', async () => {
      const { user } = renderBoard(broken({ answer: '' }))

      await user.click(screen.getByRole('button', { name: 'T' }))

      expect(ribbon()).toHaveProperty('textContent', `${INCOMPLETE}${REPEAT_MARK}`)
      expect(onProgress).not.toHaveBeenCalled()
    })

    // THE OTHER TWO WAYS TO REACH `erase`, and the row above reaches neither: it presses a LETTER,
    // which is `press`. Both inputs are here for the reason the finished board's pair is -- one
    // function reached two ways, and a test that pressed one would leave the other free to answer
    // the same board differently -- and the second press is also what pins the repeat mark, since
    // two identical sentences in a row differ by one zero-width character.
    //
    // REDDENS ON: dropping `erase`'s `!drawable` guard, after which Delete and Backspace answer
    // NOTHING on a board with no row to erase -- the ribbon stays empty -- which is exactly the "a
    // key that answers nothing reads as a broken key" failure the row above exists to prevent.
    it('answers Delete and the hardware Backspace with the standing line', async () => {
      const { user } = renderBoard(broken({ answer: '' }))

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      expect(ribbon()).toHaveProperty('textContent', `${INCOMPLETE}${REPEAT_MARK}`)

      await user.keyboard('{Backspace}')

      expect(ribbon()).toHaveProperty('textContent', INCOMPLETE)
      expect(onProgress).not.toHaveBeenCalled()
    })

    // AN UNDRAWABLE BOARD SAYS THE PACK IS INCOMPLETE, NEVER THAT IT IS FINISHED. The two used to be
    // easy to confuse in code, because `guesses.length >= rows` is trivially true at 0 >= 0 and that
    // clause was half of `over`. The loss is gone, so `over` is `drawable && solved` and the
    // confusion is now structurally impossible rather than merely guarded against.
    //
    // SWAPPING THE TWO GUARDS DOES NOT REDDEN THIS, and that is worth stating rather than claiming
    // the opposite: `over` carries `drawable` itself, so it is already false on every board this
    // test can build and the order of the two clauses cannot be observed from outside. The board is
    // belt AND braces here, and this row defends the braces.
    //
    // REDDENS ON: dropping `commit`'s `!drawable` guard (verified). Also on the two-edit mutation
    // the swap was supposed to model -- take `drawable &&` out of `over` AND put the `over` guard
    // first -- which is the shape a later simplification of `over` would leave the clause order
    // load-bearing in (verified).
    it('says the pack is incomplete rather than that the board is finished', async () => {
      const { user } = renderBoard(broken({ answer: '' }))

      await user.click(screen.getByRole('button', { name: 'Guess' }))

      expect(ribbon()).toHaveProperty('textContent', `${INCOMPLETE}${REPEAT_MARK}`)
    })
  })

  describe('the accessibility contract', () => {
    // Every row of §9.1's table gets a query rather than a summary sentence, because CLAUDE.md's
    // gate is per property. Each of these is a role query, which reads the accessibility tree -- so
    // each is simultaneously the behavioral assertion and the accessibility assertion, and none of
    // them is jest-axe, which is not a dependency of this repo and must not become one.
    //
    // THE `not yet made` ROW IS GONE FROM THIS LIST, and its absence is the assertion rather than an
    // omission: a fresh grid has no unreached rows to name, because a row is drawn when it is
    // needed. `Guess 4, not yet made` was here when the grid opened at six. The spent-row name is
    // asserted on a restored board instead, since a fresh one has no spent rows either.
    //
    // REDDENS ON: dropping any one of the aria-labels; drawing rows the player has not reached.
    it('names every row of a fresh grid', () => {
      renderBoard()

      expect(screen.getByRole('group', { name: 'Guesses' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: /^Your guess/ })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Letters, Delete and Guess' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /not yet made/ })).toBeNull()
    })

    // THE SPENT ROWS AND THE COMPOSING ROW, NAMED TOGETHER on the one board that has both. A screen
    // reader working a grown grid meets `Guess 1, HOT HAND`, `Guess 2, OLD HOLE` and then the row it
    // can type into -- three groups, three distinct names, and no fourth waiting below.
    it('names every row of a grown grid', () => {
      renderBoard(phrazlePuzzle, '{"guesses":["HOT HAND","OLD HOLE"]}')

      expect(screen.getByRole('group', { name: 'Guess 1, HOT HAND' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Guess 2, OLD HOLE' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Your guess,' })).toBeInTheDocument()
      expect(rows()).toHaveLength(3)
    })

    // aria-current="true" ON THE COMPOSING ROW AND NOWHERE ELSE, never "false". There is no
    // this-is-not-the-current-row state worth saying on every row above, and a grid full of "false"s
    // is the failure this rule exists to prevent -- so it is asserted as a COUNT over the attribute
    // rather than as a value on one element, which is the only shape that can catch it.
    //
    // ON A RESTORED BOARD rather than a fresh one, and that matters more than it used to: a fresh
    // grid is now a single row, where "exactly one carries the attribute" is true of a board that
    // put it on every row. Five spent rows plus the composing one is the fixture that can tell those
    // apart, and it is also the case a screen reader actually meets.
    //
    // REDDENS ON: `aria-current={isComposing ? 'true' : 'false'}`, which reads six.
    it('marks exactly one row as the current one', () => {
      renderBoard(phrazlePuzzle, FIVE_SPENT)

      const marked = screen.getAllByRole('group').filter((group) => group.hasAttribute('aria-current'))

      expect(rows()).toHaveLength(6)
      expect(marked).toHaveLength(1)
      expect(marked[0]).toHaveAccessibleName(/^Your guess/)
    })

    // AND THE ATTRIBUTE MOVES WITH THE ROW, which is the half a single render cannot see. The
    // composing row is the last one on a grid that grew by one, so a board that pinned aria-current
    // to a fixed index would leave the marker behind on a spent row -- the roving-tabIndex failure
    // CLAUDE.md names, in another attribute.
    //
    // REDDENS ON: `aria-current={index === 0 ? 'true' : undefined}`.
    it('moves the current-row marker onto each new row as the grid grows', async () => {
      const { user } = renderBoard(phrazlePuzzle, FIVE_SPENT)

      await type(user, 'TEAHAND')
      await user.click(keyNamed(/^Guess$/))

      const marked = screen.getAllByRole('group').filter((group) => group.hasAttribute('aria-current'))

      expect(marked).toHaveLength(1)
      expect(marked[0]).toBe(rows()[6])
    })

    // A composing tile is named by its letter and an empty one is named `Empty` -- one stop each for
    // a screen reader working the row, and never a button: 126 buttons is 126 tab stops for elements
    // nothing can do anything with.
    //
    // REDDENS ON: `tileName` returning `shown` for an unmarked tile, which leaves the six untyped
    // tiles with no accessible name at all. The pair is the assertion -- one name that is the letter
    // and six that are `Empty`, off one row -- because either half alone survives that edit.
    it('names a composing tile by the letter in it', async () => {
      const { user } = renderBoard()

      await type(user, 'T')

      expect(screen.getByRole('img', { name: 'T' })).toBeInTheDocument()
      expect(screen.getAllByRole('img', { name: 'Empty' })).toHaveLength(6)
    })

    // THE SCROLLABLE REGION IS REACHABLE FROM THE KEYBOARD, which is WCAG 2.1.1 on the one band that
    // scrolls. NOTHING INSIDE IT IS FOCUSABLE, by design: a tile is role="img" with no handler,
    // because 126 buttons is 126 tab stops for elements nothing can do anything with, and the pad is
    // in the floor rather than in this band. A scrollable box with no focusable content and no
    // tabIndex of its own cannot be scrolled without a mouse or a touch screen.
    //
    // IT MATTERS NOW IN A WAY IT DID NOT BEFORE. The band could always overflow in principle -- row
    // 77's three-by-seven phrase at 320 floors its tiles and spills -- but that was one dense phrase
    // at one width. A board with no guess limit scrolls in every long game, and the thing a keyboard
    // player could not otherwise do is scroll BACK to re-read guess 1 while typing guess 12.
    //
    // ASSERTED AS THE TAB LANDING, not as the attribute: `toHaveAttribute('tabindex', '0')` passes on
    // an element that is `display: none` or `disabled`, and what is owed is that a Tab arrives here.
    // The name comes with it, so the landmark announces itself rather than reading as an unlabeled
    // box.
    //
    // REDDENS ON: dropping tabIndex={0} from the section, after which the first Tab goes to the pad.
    it('takes a Tab onto the band that scrolls', async () => {
      const { user } = renderBoard(phrazlePuzzle, FIVE_SPENT)

      await user.tab()

      expect(screen.getByRole('region', { name: 'Phrazle' })).toHaveFocus()
    })

    // NON-ATOMIC. role="status" carries an implicit aria-atomic="true" in ARIA 1.2, under which every
    // new message re-reads the entire region -- and these messages change while a player is
    // mid-solve. FloorBar owns the attribute; this asserts the board did not wrap it in something
    // that changes it.
    //
    // REDDENS ON: a board that renders its own role="status" beside FloorBar's, which makes the
    // query ambiguous and throws before it can read the attribute.
    it('leaves the ribbon non-atomic and empty at mount', () => {
      renderBoard()

      expect(ribbon()).toHaveAttribute('aria-atomic', 'false')
      expect(ribbon()).toBeEmptyDOMElement()
    })

    // THIS BOARD BUILDS NO id AND NO IDREF, and that is a decision rather than an accident. The
    // legend is standing text read in place and nothing points at it, because the mark's meaning
    // travels in each tile's own accessible name -- so an aria-describedby from the grid to the
    // legend would be a second, weaker copy of information that is already per-tile.
    //
    // It is asserted because aria-controls contributes nothing to an accessible name and can rot in
    // TOTAL SILENCE while every role query in this file keeps passing. There is nothing here to
    // resolve at both ends, so the assertion is that there is nothing here.
    //
    // REDDENS ON: giving the grid an id and an aria-describedby pointing at the legend -- which is
    // also the change this test exists to argue against, because a description target whose text is
    // an aria-label computes to the empty string under this repo's dom-accessibility-api.
    it('builds no id and no IDREF', () => {
      const { container } = renderBoard()

      expect(container.querySelector('.lull-board')).toBeInTheDocument()
      expect(container.querySelectorAll('[id]')).toHaveLength(0)
      expect(container.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls], [for]')).toHaveLength(
        0,
      )
    })

    // The dense case at the board level. The assertable half of "no horizontal scroll at any width"
    // is tileSize flooring at MIN_TILE and lives in layout.test.ts; what is assertable HERE is that
    // the row is three separate word groups rather than one run of 21 tiles -- words never break,
    // because word shape is a solving cue and a broken word reads as two words, so the row wraps
    // BETWEEN words and the grid gets taller and scrolls.
    //
    // Whether the browser then draws it inside the box is layout, jsdom has none, and a style
    // assertion is forbidden here -- so that half is named as unassertable in the inventory rather
    // than covered by a test that could not fail.
    //
    // REDDENS ON: joining the row's word slices back into one group before the map, which draws the
    // first word's three tiles and loses eighteen.
    it('keeps the widest phrase in three unbreakable word groups', () => {
      renderBoard({ ...phrazlePuzzle, data: { ...phrazlePuzzle.data, answer: 'PROBLEM CONTROL PICTURE' } })

      expect(screen.getAllByRole('img', { name: 'Empty' })).toHaveLength(21)
      expect(composing().children).toHaveLength(3)
    })
  })

  describe('the keystrokes this board declines', () => {
    // PINNED, BECAUSE IT IS SURPRISING, and this test exists to stop a future reader "fixing" rule 3
    // to make the hardware Enter work from the pad -- which would break the hint sheet's `Hide` in a
    // way nothing else catches. Every pad key deliberately keeps focus on press, so the moment a
    // player taps a letter the event target is a <button>, rule 3 declines, and the browser
    // re-activates the focused key natively. Pressing Enter after tapping E types a second E.
    //
    // It is also the assertion that the two rules were reconciled rather than one of them forgotten.
    //
    // REDDENS ON: narrowing rule 3's tag test to `A` alone, after which the Enter commits a
    // one-letter row and the ribbon says `Fill every tile first.`
    it('types another letter when Enter is pressed on a focused pad key', async () => {
      const { user } = renderBoard()
      await user.click(keyNamed(/^E,/))

      expect(composing()).toHaveAccessibleName('Your guess, E')

      await user.keyboard('{Enter}')

      expect(composing()).toHaveAccessibleName('Your guess, EE')
      expect(onProgress).not.toHaveBeenCalled()
    })

    // ENTER ON A LINK IS THE LINK'S, and this is the arm of rule 3 nothing exercised: narrowing
    // `/^(A|BUTTON)$/` to `/^(BUTTON)$/` left all 114 tests green, because only pad keys were ever
    // focused when Enter was pressed. The shell's spine draws its breadcrumbs as <a> and they are in
    // the tab order on this bench, so without the arm a keyboard player pressing Enter on the `Lull`
    // crumb has the navigation swallowed by preventDefault AND spends one of six permanent attempts
    // -- and this bench has no Undo by design.
    //
    // The link is rendered as a SIBLING rather than through renderBoard, for the same reason the
    // text-field row below is: the board draws no link and the whole point is one it does not own.
    //
    // REDDENS ON: narrowing rule 3's tag test to BUTTON alone -- onProgress is then called with
    // {"guesses":["TOE HOLD"]}.
    it('leaves Enter to a focused link and spends no guess', async () => {
      const user = userEvent.setup({ delay: null })
      render(
        <>
          <a href="/">Lull</a>
          <PhrazleBoard
            dictionary={phrazleDictionary}
            onProgress={onProgress}
            onReset={onReset}
            onSolved={onSolved}
            progress={null}
            puzzle={phrazlePuzzle}
          />
        </>,
      )
      await type(user, 'TOEHOLD')

      screen.getByRole('link', { name: 'Lull' }).focus()
      await user.keyboard('{Enter}')

      expect(composing()).toHaveAccessibleName('Your guess, TOE HOLD')
      expect(onProgress).not.toHaveBeenCalled()
    })

    // A modified keypress belongs to the browser. Without this, Cmd-R and every other shortcut is
    // both swallowed by preventDefault and read as a letter -- the player loses the reload they asked
    // for and gains a tile they did not.
    //
    // ALL THREE MODIFIERS, because only Control was exercised and Cmd-R is the case the guard's own
    // comment argues from: dropping `event.metaKey` from the condition left every test in this file
    // green while breaking reload, select-all and every other shortcut on a Mac.
    //
    // REDDENS ON: dropping the matching half of the modifier guard, which types an A.
    it.each<[string, string]>([
      ['Alt', '{Alt>}a{/Alt}'],
      ['Control', '{Control>}a{/Control}'],
      ['Meta', '{Meta>}a{/Meta}'],
    ])('leaves a %s-modified keypress to the browser', async (_description, keystrokes) => {
      const { user } = renderBoard()

      await user.keyboard(keystrokes)

      // ONE row on a fresh board, which is what a grid that grows on demand opens with. The `6` here
      // was the old fixed grid and said nothing about the modifier guard either way -- what carries
      // the assertion is the empty composing row below it.
      expect(rows()).toHaveLength(1)
      expect(composing()).toHaveAccessibleName('Your guess,')
    })

    // THE OTHER HALF OF THE SAME GUARD, and the half no fixture could reach: an <input> is caught by
    // the tag test, so `target.isContentEditable` was doing nothing any test could see. jsdom does
    // not implement contentEditable at all -- the property is absent rather than false -- so it is
    // defined on the element here, which is the only way to put a browser's answer in front of the
    // guard. The board reads the property and nothing else, so that is exactly the input under test.
    //
    // REDDENS ON: dropping `target.isContentEditable` from the guard, after which the T is
    // preventDefault-ed away from the editor and typed into the grid instead.
    it('leaves a keystroke typed into a rich text editor alone', async () => {
      const user = userEvent.setup({ delay: null })
      render(
        <>
          <div aria-label="Somewhere else" role="textbox" tabIndex={0} />
          <PhrazleBoard
            dictionary={phrazleDictionary}
            onProgress={onProgress}
            onReset={onReset}
            onSolved={onSolved}
            progress={null}
            puzzle={phrazlePuzzle}
          />
        </>,
      )
      const editor = screen.getByRole('textbox', { name: 'Somewhere else' })
      Object.defineProperty(editor, 'isContentEditable', { configurable: true, value: true })

      editor.focus()
      await user.keyboard('T')

      expect(editor).toHaveFocus()
      expect(composing()).toHaveAccessibleName('Your guess,')
    })

    // Somewhere the player is composing text owns its own keystrokes. There is no such field on this
    // bench, so the guard protects a future one -- but the listener is on the WINDOW, and a listener
    // with that reach has to be tested on what it declines rather than only on what it takes. The
    // input is rendered as a sibling rather than through renderBoard, because renderBoard renders the
    // board alone and the whole point is a field the board does not own.
    //
    // REDDENS ON: dropping the INPUT|SELECT|TEXTAREA guard, after which the T is preventDefault-ed
    // out of the field and typed into the grid instead.
    it('leaves a keystroke typed into a text field alone', async () => {
      const user = userEvent.setup({ delay: null })
      render(
        <>
          <input aria-label="Somewhere else" />
          <PhrazleBoard
            dictionary={phrazleDictionary}
            onProgress={onProgress}
            onReset={onReset}
            onSolved={onSolved}
            progress={null}
            puzzle={phrazlePuzzle}
          />
        </>,
      )

      await user.click(screen.getByRole('textbox', { name: 'Somewhere else' }))
      await user.keyboard('T')

      expect(screen.getByRole('textbox', { name: 'Somewhere else' })).toHaveValue('T')
      expect(composing()).toHaveAccessibleName('Your guess,')
    })
  })

  // THE SHEET IS THE SHELL'S AND IT LIES OVER THIS BOARD. PuzzleFrame draws HintBar between the two
  // elements this component returns -- this bench is `guess`, and the frame gives every bench but
  // `tile` the docked bar -- and the sheet is drawn over the grid. A keyboard player who opens a
  // hint to check a row and Tabs once is standing on a `<section aria-label="Open hints">` carrying
  // tabIndex={0}, which is there precisely so the sheet can be scrolled, and every keystroke made
  // there still reached the board: Enter spent one of six attempts on a row the player could not
  // see, and THIS BENCH HAS NO UNDO BY DESIGN.
  describe('the hint sheet lying over the board', () => {
    const HIDE_TO_TYPE = 'Hide the hints to type.'

    // A REAL HintBar as a SIBLING, never a stub sheet. What the board's guard follows is an IDREF
    // HintBar owns -- the control's `aria-controls` and the `hidden` attribute on the element it
    // names -- so a stub would assert this suite's own idea of that markup rather than the sheet the
    // shell actually ships.
    //
    // A puzzle id per test, because HintBar persists its opened count at lull:hints:<puzzleId> and a
    // shared id would carry one test's spent ladder into the next.
    //
    // THE LADDER'S CONTENT IS NOT WHAT THESE ROWS ARE ABOUT, and it is worth saying so now that the
    // one they are handed is named for a wire shape this bench no longer receives. What they need is
    // three rungs and a real sheet: three so the control reads "Open hint 1 of 3", and a real sheet
    // so pressing it draws the `<section aria-label="Open hints">` the board's keydown guard follows
    // by IDREF. `phrazleStalePackLadder` supplies both, and it is the honest choice rather than an
    // arbitrary one -- an UNCONTROLLED HintBar is exactly the bar a pack ladder drives, so the pair
    // on screen here is the pair a player saw before this app's adapter shipped. The shell hands the
    // real bench a ladder the adapter computed instead; that seam is asserted in the frame's suite,
    // and none of it changes what a keystroke on the sheet must do.
    // SCOPED TO THE BOARD'S OWN INSTRUMENT, because HintBar mounts a role="status" of its own -- the
    // one that announces "Hints reset." -- and an unscoped query is ambiguous the moment a real bar
    // is on the screen beside the board. Two live regions on one screen is what the shell ships.
    const boardRibbon = (container: HTMLElement): HTMLElement =>
      within(container.querySelector('.lull-instrument') as HTMLElement).getByRole('status')

    const renderWithHints = (
      puzzleId: string,
    ): { container: HTMLElement; user: ReturnType<typeof userEvent.setup> } => {
      const user = userEvent.setup({ delay: null })
      const { container } = render(
        <>
          <PhrazleBoard
            dictionary={phrazleDictionary}
            onProgress={onProgress}
            onReset={onReset}
            onSolved={onSolved}
            progress={null}
            puzzle={phrazlePuzzle}
          />
          <HintBar hints={phrazleStalePackLadder} puzzleId={puzzleId} />
        </>,
      )
      return { container, user }
    }

    // THE PAD IS NOT REFUSED WHILE THE SHEET IS UP, which the rows below rely on to fill a row and
    // which is the tile bench's posture too: the sheet is drawn over the BOARD and the instrument is
    // a band below it, so a key the player can see and touch goes on working. What the guard is
    // about is the keyboard, which writes into a row the sheet is covering.
    const openTheSheet = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(screen.getByRole('button', { name: 'Open hint 1 of 3' }))
    }

    // THE PROVED SCENARIO, and the most expensive one: the row is full, the sheet is up, focus is on
    // the sheet because that is where a Tab from the control lands, and Enter committed the guess.
    //
    // REDDENS ON: dropping the sheet guard from onKeyDown -- onProgress is then called with
    // {"guesses":["TOE HOLD"]} and one of six attempts is gone with no way back.
    it('refuses an Enter pressed on the sheet and spends no guess', async () => {
      const { container, user } = renderWithHints('2026-08-18:phrazle:sheet-enter')
      await openTheSheet(user)
      await type(user, 'TOEHOLD')

      screen.getByRole('region', { name: 'Open hints' }).focus()
      await user.keyboard('{Enter}')

      // `Every tile is full.` was message one, so this is message two and its text stands alone.
      expect(boardRibbon(container)).toHaveProperty('textContent', HIDE_TO_TYPE)
      expect(onProgress).not.toHaveBeenCalled()
      expect(composing()).toHaveAccessibleName('Your guess, TOE HOLD')
    })

    // The same sheet, the other two writing keys. A letter typed with the sheet up filled a row
    // nobody could see, and Backspace emptied one.
    //
    // REDDENS ON: dropping the sheet guard -- the letter row reads `Your guess, T` and the backspace
    // row reads `Your guess, TO`, both with an empty ribbon.
    it('refuses a letter typed while the sheet is open', async () => {
      const { container, user } = renderWithHints('2026-08-18:phrazle:sheet-letter')
      await openTheSheet(user)

      await user.keyboard('T')

      expect(composing()).toHaveAccessibleName('Your guess,')
      // The test's first message, so the nonce is odd and the mark is due.
      expect(boardRibbon(container)).toHaveProperty('textContent', `${HIDE_TO_TYPE}${REPEAT_MARK}`)
    })

    it('refuses a Backspace pressed while the sheet is open', async () => {
      const { container, user } = renderWithHints('2026-08-18:phrazle:sheet-backspace')
      await type(user, 'TOE')
      await openTheSheet(user)

      await user.keyboard('{Backspace}')

      expect(composing()).toHaveAccessibleName('Your guess, TOE')
      expect(boardRibbon(container)).toHaveProperty('textContent', `${HIDE_TO_TYPE}${REPEAT_MARK}`)
    })

    // THE POSITIVE HALF, and it is the one that matters most: the guard reads the sheet's `hidden`
    // attribute, so a bar that is merely PRESENT must change nothing at all. Without this row a
    // guard that answered "open" whenever a hint control existed would freeze the keyboard on every
    // bench the shell gives a hint bar -- which is every bench but one.
    //
    // REDDENS ON: `sheetIsOpen` returning true for a sheet it found regardless of `hidden`.
    it('leaves the keyboard alone while the sheet is shut', async () => {
      const { user } = renderWithHints('2026-08-18:phrazle:sheet-shut')

      await user.keyboard('TOEHOLD{Enter}')

      expect(onProgress).toHaveBeenCalledWith('{"guesses":["TOE HOLD"]}')
    })

    // THE IDREF, RESOLVED AT BOTH ENDS, which CLAUDE.md requires wherever one exists. `aria-controls`
    // contributes nothing to an accessible name, so it can rot in TOTAL SILENCE: every row above
    // would keep passing while the guard read a broken bar as a shut one -- deliberately, so the
    // board stays playable -- and simply never fired again, handing the keyboard back to a covered
    // grid for the rest of the session.
    //
    // REDDENS ON: pointing the control's aria-controls at an id nothing carries.
    it('finds the sheet at the other end of the control the board follows', async () => {
      const { user } = renderWithHints('2026-08-18:phrazle:sheet-idref')
      await openTheSheet(user)

      const control = screen.getByRole('button', { name: 'Open hint 2 of 3' })
      const id = control.getAttribute('aria-controls')

      expect(id).not.toBeNull()
      expect(document.getElementById(id ?? '')).toBeInTheDocument()
    })
  })

  // THE MEASURING EFFECT, DRIVEN BY HAND. jsdom implements no ResizeObserver, so the board's effect
  // returned at its own `typeof ResizeObserver === 'undefined'` guard and this callback had never
  // run under test at all. `tileSize` is proven as a pure function in layout.test.ts and that is a
  // different claim: nothing proved it was CALLED with the right box.
  //
  // ONE BOX NOW, WHERE THERE WERE TWO. This block used to pin which dimension came off which
  // element -- the section for height, the plate for width -- and the height is gone: a grid that
  // grows a row per guess cannot be sized to fit a band, so it scrolls and tiles hold their size.
  // What is left to defend is that the width still comes off the PLATE, which is the half that was
  // always the subtle one.
  describe('measuring the room the grid has', () => {
    // Given DIFFERENT widths on purpose, so reading the wrong element produces a wrong answer rather
    // than a zero -- a zero is caught by the board's own guard and would redden these rows for the
    // wrong reason.
    const box = (element: Element | null, width: number, height: number): void => {
      Object.defineProperty(element, 'clientHeight', { configurable: true, value: height })
      Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
    }
    // The plate is the section's only div: the sign row above it is a <p>.
    const plateOf = (board: HTMLElement): Element | null => board.querySelector('div')

    // THE WIDTH COMES OFF THE PLATE, NOT THE SECTION, and that is the whole of what this row now
    // says. The plate is the box the tiles are actually laid out inside; the section would overstate
    // the room by a gutter a side. Everything downstream of this reaches the screen as a px width on
    // a tile, and style assertions are forbidden, so the call is the only place it is visible.
    //
    // NO HEIGHT AND NO ROW COUNT IN THE CALL, which is the arity change stated as an assertion:
    // `toHaveBeenLastCalledWith` matches the full argument list, so a board that went back to
    // passing four arguments fails here rather than silently sizing tiles against a band again.
    //
    // REDDENS ON: reading the width off the section, which calls tileSize with 390.
    it('reads the width off the plate rather than off the board band', () => {
      renderBoard()
      const board = screen.getByRole('region', { name: 'Phrazle' })
      box(board, 390, 500)
      box(plateOf(board), 300, 800)

      act(() => {
        lastObserver().callback()
      })

      expect(mockTileSize).toHaveBeenLastCalledWith(300, [3, 4])
    })

    // A hidden or not-yet-laid-out box reports zero, and honoring that writes a zero straight onto
    // every tile as a px width. The board keeps the measurement it already had, which at mount is
    // layout.ts's guess at a 390 viewport.
    //
    // ONE ROW WHERE THERE WERE TWO: the height row is gone with the height. It is not replaced by a
    // second width row, because there is only one box left to report zero.
    //
    // REDDENS ON: dropping `measured > 0`, after which the call is 0.
    it('ignores a width that has not been laid out yet', () => {
      renderBoard()
      const board = screen.getByRole('region', { name: 'Phrazle' })
      box(board, 390, 500)
      box(plateOf(board), 0, 800)

      act(() => {
        lastObserver().callback()
      })

      expect(mockTileSize).toHaveBeenLastCalledWith(DEFAULT_WIDTH, [3, 4])
    })

    // ONE BOX IS WATCHED, and the section is NOT among them -- asserted rather than left implied,
    // because an observer left watching the section is the cheap way this change half-happens: the
    // callback would fire on every band resize and recompute a width that did not move. And the
    // observer is let go when the board is, since one left watching a detached tree is a leak
    // nothing else here can see.
    //
    // REDDENS ON: observing the section as well (two boxes); dropping the effect's cleanup (no
    // disconnect).
    it('watches the plate alone and lets go of it when the board goes away', () => {
      const { unmount } = renderBoard()
      const board = screen.getByRole('region', { name: 'Phrazle' })

      expect(lastObserver().observed).toHaveLength(1)
      expect(lastObserver().observed).toContain(plateOf(board))
      expect(lastObserver().observed).not.toContain(board)

      unmount()

      expect(lastObserver().disconnects).toEqual(1)
    })
  })
})
