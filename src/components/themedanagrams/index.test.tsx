import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { ThemedAnagramsBoard } from './index'
import {
  blankAnswerThemedAnagrams,
  legacyScrambleThemedAnagrams,
  themedAnagramsPuzzle,
  unusableAnswerThemedAnagrams,
} from '@test/__mocks__'
import { Puzzle, ThemedAnagramsData } from '@types'

describe('ThemedAnagramsBoard', () => {
  // The four scrambles as a screen reader gets them: the visible run is aria-hidden noise, and the
  // spelled-out string is what the role="img" element is NAMED. Lengths 6, 8, 7, 7 -- deliberately
  // not sorted, so a board that tidied the entries short-to-long is visible in this table.
  const SPELLED: [number, string][] = [
    [0, 'The letters are E L K T E T'],
    [1, 'The letters are U N A S A P C E'],
    [2, 'The letters are L K S E T I L'],
    [3, 'The letters are T P S L A A U'],
  ]

  // ONE TABLE FOR BOTH READINGS, and on an unhinted board they are the same string. The row's image
  // is NAMED with it and the box is DESCRIBED with it -- two different computations that agree here
  // because nothing is pinned. The per-letter names a reader meets on a row a rung has touched are
  // written out where they belong, in "a letter a hint revealed"; a second table of them up here
  // would say they are the shape of every board, and they are what a bought rung pays for.

  // The four row indexes, so a per-row table can be written without repeating the literal. A
  // separate table from SPELLED because most of these assertions do not need the scramble.
  const ROW_INDEXES: number[] = [0, 1, 2, 3]

  const SOLVED = 'Solved. You got all four.'
  // The four answers as one stored string, which is what a solved board comes back from storage as.
  const SOLVED_PROGRESS = 'KETTLE\nSAUCEPAN\nSKILLET\nSPATULA'

  const INSTRUCTION = 'The letters in each row spell one word, and all four fit the theme.'
  // The board's own REPEAT_MARK, spelled the same way and for the same reason: written as the escape
  // rather than as the character, because a literal zero-width space in a test file is invisible and
  // an editor or a careless selection deletes it without leaving a diff a reader can see.
  const REPEAT_MARK = '\u200b'

  // The ribbon, and the one place on this bench anything is announced. A helper because the board
  // mounts no live region of its own -- this is FloorBar's, handed a string.
  const ribbon = (): HTMLElement => screen.getByRole('status')

  const boxNamed = (ordinal: number): HTMLElement => screen.getByRole('textbox', { name: `Answer ${ordinal} of 4` })

  // The letters one row is showing, read off the ACCESSIBILITY TREE rather than off the markup: each
  // letter is its own role="img" now, so this walks the row's tiles and joins their names. A pinned
  // one names itself "S, revealed", which is why `tiles` below exists beside this -- the two answer
  // different questions and neither can stand in for the other.
  const runOf = (row: HTMLElement): string =>
    within(row)
      .getAllByRole('img')
      .map((tile) => tile.textContent)
      .join('')

  // The four visible runs, in row order. The scramble a row shows is no longer a fixed read off the
  // pack -- the shuffle control can redraw it, and a spent rung can pin letters into place -- so the
  // four of them are read together often enough to be worth a name.
  const runs = (): string[] => screen.getAllByRole('listitem').map(runOf)

  // One row's tiles by NAME, which is where the "revealed" fact lives. A plain letter names itself;
  // a pinned one names itself and says so.
  const tiles = (index: number): (string | null)[] =>
    within(screen.getAllByRole('listitem')[index])
      .getAllByRole('img')
      .map((tile) => tile.getAttribute('aria-label'))

  // The pack's own four, which is what a board draws until somebody presses shuffle and what it
  // draws again on the next visit.
  const PACK_RUNS = ['ELKTET', 'UNASAPCE', 'LKSETIL', 'TPSLAAU']

  const onProgress = jest.fn()
  const onReset = jest.fn()
  const onSolved = jest.fn()

  // Named and called explicitly rather than a beforeEach, and the user instance is built here so
  // that every test drives its interactions through exactly one. `delay: null` is the whole
  // reason: the v14 default puts a real setTimeout between every event in a sequence, which is
  // slack that gets starved under parallel workers.
  const setup = (
    puzzle: Puzzle<ThemedAnagramsData> = themedAnagramsPuzzle,
    progress: string | null = null,
  ): { container: HTMLElement; user: ReturnType<typeof userEvent.setup> } => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(
      <ThemedAnagramsBoard
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
      <ThemedAnagramsBoard
        onProgress={onProgress}
        onSolved={onSolved}
        progress={progress}
        puzzle={themedAnagramsPuzzle}
      />,
    )
    return user
  }

  describe('the board', () => {
    // A named landmark, because this band is one of three on the bench and a reader moving by
    // landmark needs to know which one they have arrived in. The name is the type, not the theme:
    // the theme is content and it changes every day.
    it('is a landmark a reader can find by name', () => {
      setup()

      expect(screen.getByRole('region', { name: 'Themed Anagrams' })).toBeInTheDocument()
    })

    // The theme is ALWAYS shown, at every difficulty. There is no `category` field on this type and
    // no visibility rule -- hiding it would convert a one-answer puzzle into a several-answer one.
    // The uppercase a player sees is the sign row's own styling; the pack ships `Kitchen tools`.
    it('shows the theme all four rows are about', () => {
      setup()

      expect(screen.getByText('Kitchen tools')).toBeInTheDocument()
    })

    // Pinned by VALUE rather than with toHaveTextContent, which is a whitespace-normalized
    // SUBSTRING match and would go on passing if a second sentence were appended to the tally.
    it('counts nothing right on a board nobody has touched', () => {
      setup()

      expect(screen.getByText('0 of 4 right')).toHaveProperty('textContent', '0 of 4 right')
    })
  })

  describe('the four rows', () => {
    // A list, so a reader is told there are four of these and which one they are in before they
    // meet the first one.
    it('tells a reader there are four of them', () => {
      setup()

      expect(screen.getAllByRole('listitem')).toHaveLength(4)
      expect(screen.getByRole('list')).toBeInTheDocument()
    })

    // WIRE ORDER, and the visible half of it. The hint ladder's ordinals index this array, so a
    // board that sorted the entries by length -- 6, 8, 7, 7 looks like an oversight and a tidy board
    // would run short to long -- would make every rung point at the wrong row.
    it('draws the scrambles in the order the pack sent them', () => {
      setup()

      expect(runs()).toEqual(['ELKTET', 'UNASAPCE', 'LKSETIL', 'TPSLAAU'])
    })

    // A scramble read aloud as one string is gibberish, exactly like Missing Vowels' consonant run,
    // so the run is a role="img" whose NAME spells the letters out. ONE image per row while nothing
    // is pinned, and that count is the assertion rather than the markup being described.
    //
    // ONE IMAGE PER LETTER IS WHAT A RUNG BUYS, AND ONLY THEN. Splitting unconditionally put up to
    // nine image nodes per row into a reader's browse order -- thirty-six on an untouched board,
    // where four used to be -- to carry a "revealed" distinction that does not exist until a rung has
    // been bought. This row is the one that fails if the split creeps back onto every board; the
    // split itself is asserted in "a letter a hint revealed".
    it.each(SPELLED)('spells row %i out as one image', (index, spelled) => {
      setup()

      expect(tiles(index)).toEqual([spelled])
    })

    // The box's DESCRIPTION is where the run is still spelled out in one breath, so a reader who
    // tabs straight into the box is not made to browse the tiles to learn what is on the plate.
    it('spells the whole run out for a reader who goes straight to the box', () => {
      setup()

      expect(boxNamed(1)).toHaveAccessibleDescription('The letters are E L K T E T')
    })
  })

  describe('the four boxes', () => {
    // The label is sr-only, so nothing on screen says "Answer 2 of 4" -- the accessible name is the
    // only thing carrying it, and a role query is what defends that, because it reads the
    // accessibility tree rather than the markup. The ordinal is in the NAME rather than in a list
    // marker: two numbering systems on one line is the confusion hint-bar's LIST comment warns of.
    it.each(ROW_INDEXES)('names row %i for the row it sits in', (index) => {
      setup()

      expect(screen.getByRole('textbox', { name: `Answer ${index + 1} of 4` })).toBeInTheDocument()
    })

    // The description is a COMPUTED one, off a dedicated sr-only span's TEXT. Pointed at the
    // role="img" paragraph above instead -- the markup that looks obviously right, since its
    // aria-label already says these words -- this computes to "" under this repo's
    // dom-accessibility-api: the description is resolved from the target's text content and the
    // visible run inside that paragraph is aria-hidden. The id would still resolve and every role
    // query would still pass, which is the silent rot CLAUDE.md's IDREF rule names.
    it.each(SPELLED)('describes row %i by the letters it is about', (index, spelled) => {
      setup()
      const target = screen.getAllByRole('textbox')[index].getAttribute('aria-describedby')

      expect(screen.getAllByRole('textbox')[index]).toHaveAccessibleDescription(spelled)
      // AND THE TARGET IS HIDDEN FROM BROWSE MODE, which sixteen lines beside the markup argue for
      // and nothing was asserting. A description target is traversed whether or not it is hidden, so
      // the description above survives either way -- what aria-hidden removes is the second reading:
      // sr-only text is still in the reading order, so without it a reader meets this sentence from
      // the role="img" run, again from this span, and a third time on focus. Both sibling benches
      // pin the same property, and CLAUDE.md names aria-hidden as one an audit must.
      expect(document.getElementById(target ?? '')).toHaveAttribute('aria-hidden', 'true')
    })

    // BOTH ENDS of the aria-describedby, resolved by hand. This is the one IDREF a role query can
    // never defend: it contributes nothing to a name, so a rotted reference leaves every other
    // assertion in this file passing. The description assertion above is the other half -- neither
    // catches this on its own.
    it.each(ROW_INDEXES)('resolves the description reference on row %i', (index) => {
      setup()
      const target = screen.getAllByRole('textbox')[index].getAttribute('aria-describedby')

      expect(document.getElementById(target ?? '')).toBeInTheDocument()
    })

    // The component BUILDS this IDREF too, out of one useId and the row index, so both ends are
    // resolved explicitly. This one is self-defending -- break it and the name query above fails --
    // and it is asserted anyway, because "self-defending" is a property of today's markup.
    it.each(ROW_INDEXES)('points row %i’s label at the box it names', (index) => {
      const { container } = setup()
      const target = container.querySelectorAll('label[for]')[index].getAttribute('for')

      expect(document.getElementById(target ?? '')).toBe(screen.getAllByRole('textbox')[index])
    })

    // Eight generated ids on one board is the largest number in the product, and duplicate ids are
    // the one accessibility defect with no behavioral equivalent to assert. useId is unique per
    // component instance by React's own guarantee, so four rows cannot collide and neither can two
    // boards.
    //
    // It does NOT catch an id derived from the entry text, and the earlier claim that it did was
    // measured and found false: this fixture's four scrambles are all different, so a
    // `letters-${scramble}` scheme still yields eight unique ids and the assertion stays green.
    // Catching that would need a fixture with two identical scrambles, which is more machinery than
    // the risk is worth. What this pins is the count and the uniqueness, and that is all.
    it('builds eight ids and no two of them are the same', () => {
      const { container } = setup()
      const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)

      expect(ids).toHaveLength(8)
      expect(new Set(ids).size).toBe(8)
    })

    it('runs the tab order down the rows in wire order', async () => {
      const { user } = setup()
      const boxes = screen.getAllByRole('textbox')
      boxes[0].focus()

      await user.tab()
      expect(boxes[1]).toHaveFocus()
      await user.tab()
      expect(boxes[2]).toHaveFocus()
      await user.tab()
      expect(boxes[3]).toHaveFocus()
    })

    // A keyboard raised at mount covers a board the player has not read yet -- and this board is
    // four rows of letters they have to see before they can type anything.
    it('does not grab focus when the board opens', () => {
      setup()

      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(document.body).toHaveFocus()
    })

    // Two stacked inputs are the credential shape more strongly than one, and four are the
    // strongest form of it in the product. These are the opt-outs the password managers themselves
    // honor, and they go on every box rather than the first: an overlay on box 2 is the same defect
    // as an overlay on box 1.
    it.each(ROW_INDEXES)('keeps a password manager off box %i', (index) => {
      setup()
      const box = screen.getAllByRole('textbox')[index]

      expect(box).toHaveAttribute('autocapitalize', 'none')
      expect(box).toHaveAttribute('autocorrect', 'off')
      expect(box).toHaveAttribute('spellcheck', 'false')
      expect(box).toHaveAttribute('autocomplete', 'off')
      expect(box).toHaveAttribute('data-1p-ignore')
      expect(box).toHaveAttribute('data-lpignore', 'true')
      expect(box).toHaveAttribute('data-form-type', 'other')
      // Not a manager opt-out, but the same kind of promise, and it is asserted as an ABSENCE for
      // once. The box used to carry `enterKeyHint="go"` so that the OS keyboard's action key read
      // "Go" and ran Check. Check is gone -- a row locks itself on the keystroke that makes it
      // right -- so a key labeled "Go" would now go nowhere, which is worse than the plain Return
      // the browser gives an input that is in no form.
      expect(box).not.toHaveAttribute('enterkeyhint')
      expect(box).not.toHaveAttribute('name')
    })

    // A run of text inputs above a submit-shaped button inside a <form> is the login shape, and it
    // adds an implicit submit and a navigation this bench has no use for.
    it('is not a form', () => {
      setup()

      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(screen.getAllByRole('textbox').every((box) => box.closest('form') === null)).toBe(true)
    })

    // The writer cannot produce a string the reader refuses. decode gives up on any part longer
    // than MAX_GUESS, so a box with no cap would let a paste write a draft that comes back as four
    // empty boxes on the next load -- the player's work silently gone.
    it.each(ROW_INDEXES)('caps box %i at the longest draft storage will carry', (index) => {
      setup()

      expect(screen.getAllByRole('textbox')[index]).toHaveAttribute('maxlength', '64')
    })
  })

  describe('progress', () => {
    it('reports every keystroke to the shell, encoded', async () => {
      const { user } = setup()

      await user.type(screen.getByRole('textbox', { name: 'Answer 1 of 4' }), 'KET')

      expect(onProgress).toHaveBeenCalledTimes(3)
      expect(onProgress).toHaveBeenLastCalledWith('KET\n\n\n')
    })

    // Four drafts in one string, positional. Row 2's draft has to land in part 2 whether or not
    // rows 1 and 3 hold anything, which is the property a joined-and-filtered encoding loses.
    it('keeps each draft in its own row’s place', async () => {
      const { user } = setup()

      await user.type(screen.getByRole('textbox', { name: 'Answer 2 of 4' }), 'SAUCE')

      expect(onProgress).toHaveBeenLastCalledWith('\nSAUCE\n\n')
    })

    // THE OTHER THREE ROW_INDEXES SURVIVE A KEYSTROKE, and nothing above this could tell. Every other test
    // in this block types into ONE box on an all-empty board, so the neighbors are '' before the
    // keystroke and '' after it -- a `change` that wrote `at === index ? next : ''` and destroyed the
    // player's other three drafts is indistinguishable from one that preserved them. Measured when
    // this test was written: that mutant passed all 44 tests the file then held.
    //
    // It is the likeliest real regression here, because per-row locking and Play again are both
    // commits that rewrite this exact map. Starting from a restored board is also the only place the
    // suite types into a board that was not empty at mount.
    it('leaves the other three drafts alone when one row is typed into', async () => {
      const { user } = setup(themedAnagramsPuzzle, 'KETTLE\n\n\nSPAT')

      await user.type(screen.getByRole('textbox', { name: 'Answer 2 of 4' }), 'S')

      expect(onProgress).toHaveBeenLastCalledWith('KETTLE\nS\n\nSPAT')
    })

    // '' is what the shell reads as "no progress", and it is the ONLY thing emptying a box says.
    // It is not a signal that the player started over -- `starting over is a press, never a
    // keystroke` below pins that separation.
    it('writes the canonical empty when the last box is emptied', async () => {
      const { user } = setup()
      const box = screen.getByRole('textbox', { name: 'Answer 1 of 4' })
      await user.type(box, 'KET')

      await user.clear(box)

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    // Restored ONCE, at mount: the shell keys this component on the puzzle id, so a different
    // puzzle is a different component rather than a prop change.
    it('puts four stored drafts back in wire order', () => {
      setup(themedAnagramsPuzzle, 'KETTLE\nSAUCE\n\nSPAT')

      expect(screen.getAllByRole('textbox').map((box) => (box as HTMLInputElement).value)).toEqual([
        'KETTLE',
        'SAUCE',
        '',
        'SPAT',
      ])
    })

    // Refused WHOLE, through the board rather than only in progress.test.ts, because a half-
    // restored board is the state this refusal exists to prevent and the board is where it would
    // be seen.
    it('opens empty when the stored string is not four drafts', () => {
      setup(themedAnagramsPuzzle, 'KETTLE\nSAUCE\nSPAT')

      expect(screen.getAllByRole('textbox').map((box) => (box as HTMLInputElement).value)).toEqual(['', '', '', ''])
    })
  })

  describe('a row that goes right', () => {
    it('locks the row on the keystroke that makes it right', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'KETTLE')

      // readOnly, NOT disabled. A disabled input leaves the tab order and a screen reader's forms
      // mode, so the word the player just won with would become unreachable and unreadable.
      expect(boxNamed(1)).toHaveAttribute('readonly')
      expect(boxNamed(1)).not.toBeDisabled()
    })

    // TABBED INTO, never out of, and that is the whole test. The obvious shape -- lock row 1, focus
    // it, tab -- cannot fail for the reason this name gives: a box that is `disabled` or carries
    // `tabIndex={-1}` is simply SKIPPED, so the walk arrives at row 2 either way and the assertion
    // passes on exactly the markup it exists to refuse. Both mutations were measured against it and
    // both stayed green. Arriving at the won row is the only walk a row missing from the tab order
    // can fail, so the row that locks is row 2 and the walk starts above it.
    it('keeps the won row in the tab order', async () => {
      const { user } = setup()
      await user.type(boxNamed(2), 'SAUCEPAN')
      boxNamed(1).focus()

      await user.tab()

      expect(boxNamed(2)).toHaveFocus()
    })

    // In WORDS, in the row, never by color alone. The chip is what says a row is finished at a
    // glance, and it sits after the box rather than opposite the scramble: it only exists once the
    // row is right, and "Right" immediately after the answer reads as a verdict on the answer.
    it('says the row is right, in its own row', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'KETTLE')

      expect(screen.getAllByRole('listitem')[0]).toContainElement(screen.getByText('Right'))
      // IN THE ACCESSIBILITY TREE, not merely in the DOM. `getByText` reads markup, so wrapping the
      // word in aria-hidden leaves every query in this file green while a screen reader loses the
      // verdict entirely -- the only signal left would be the box turning readonly. Spec §6 lists
      // this as an accessibility promise, and a text query cannot defend one.
      expect(screen.getByText('Right').closest('[aria-hidden="true"]')).toBeNull()
    })

    // Decoration beside a word, never the carrier. Nothing on this board is told by color or by a
    // glyph alone.
    it('leaves the check glyph out of the reading', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'KETTLE')

      expect(screen.getByText('✓')).toHaveAttribute('aria-hidden', 'true')
    })

    // Pinned by VALUE. toHaveTextContent is a whitespace-normalized SUBSTRING match, and the tally
    // is a place where "1 of 4 right" appearing inside a longer string would be a different fact.
    it('moves the tally', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'KETTLE')

      expect(screen.getByText('1 of 4 right')).toHaveProperty('textContent', '1 of 4 right')
      // OUTSIDE the region, which the value assertion above cannot see. A tally moved into the
      // ribbon would still read `1 of 4 right` and would then be announced on every row -- the
      // count re-read aloud four times a board, on top of the sentence that already says it.
      expect(screen.getByRole('status')).not.toContainElement(screen.getByText('1 of 4 right'))
    })

    // Announced ONCE, in the one region on the bench. toHaveTextContent rather than a value match,
    // because the transient's repeat mark rides on the end of every message it says.
    it('announces the row in the ribbon', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'KETTLE')

      expect(ribbon()).toHaveTextContent('KETTLE is right — 3 to go.')
    })

    // The win happens on a keystroke IN the box. Moving focus would drop the software keyboard and
    // take the caret out of the box the player just won in.
    it('leaves focus where the player was typing', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'KETTLE')

      expect(boxNamed(1)).toHaveFocus()
    })

    // The board mounts NO live region of its own. Four rows reporting into four regions would
    // announce over each other; at most one row can change per event, so one region is enough.
    it('adds no live region of its own', () => {
      setup()

      expect(screen.getAllByRole('status')).toHaveLength(1)
    })

    it('leaves the region empty at mount', () => {
      setup()

      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  describe('a row that is not right', () => {
    // Led with a positive assertion, because every check below would also pass on a board that
    // rendered nothing at all.
    it('locks nothing and says nothing', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'SAUCEPANS')

      expect(boxNamed(1)).toHaveValue('SAUCEPANS')
      expect(boxNamed(1)).not.toHaveAttribute('readonly')
      expect(screen.queryByText('Right')).toBeNull()
      expect(screen.getByText('0 of 4 right')).toHaveProperty('textContent', '0 of 4 right')
      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  describe('wire order', () => {
    // THE LADDER'S OWN ORDINAL, walked end to end. The fixture's third rung is `The 2nd answer is
    // SAUCEPAN.` with metadata.entryIndex === 1. Typing SAUCEPAN into the SECOND box locks that
    // row, which proves the 1-based sentence and the 0-based metadata name the same row on screen
    // -- and the board reads no metadata at all to make it true.
    it('puts the 2nd answer in the second box', async () => {
      const { user } = setup()

      await user.type(boxNamed(2), 'SAUCEPAN')

      expect(screen.getAllByRole('listitem')[1]).toContainElement(screen.getByText('Right'))
      expect(screen.getAllByText('Right')).toHaveLength(1)
    })

    // A length sort -- 6, 8, 7, 7 looks like an oversight and a tidy board would run short to long
    // -- would put SAUCEPAN in the fourth box and make every rung in the ladder point at the wrong
    // row. Read off the accessibility tree, in DOM order, which is what makes this the wire-order
    // test rather than a textContent walk.
    it('describes the boxes in the order the pack sent them', () => {
      setup()

      // Four boxes, said plainly. Mapping them to an attribute and measuring the LIST proved only
      // that four elements exist, whether or not any of them carried the attribute -- a line that
      // read like an IDREF check and was not one. The two description assertions below are what
      // defends the reference; stripping aria-describedby reddens nine tests.
      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(screen.getAllByRole('textbox')[1]).toHaveAccessibleDescription('The letters are U N A S A P C E')
      expect(screen.getAllByRole('textbox')[3]).toHaveAccessibleDescription('The letters are T P S L A A U')
    })
  })

  describe('the win', () => {
    // The solve REPLACES the row's sentence rather than following it: the solve is the complete
    // news, and it makes `SPATULA is right — 0 to go.` false the instant it is said.
    it('says the win instead of the fourth row', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KETTLE')
      await user.type(boxNamed(2), 'SAUCEPAN')
      await user.type(boxNamed(3), 'SKILLET')

      await user.type(boxNamed(4), 'SPATULA')

      expect(ribbon()).toHaveTextContent(SOLVED)
      expect(ribbon()).not.toHaveTextContent('to go')
    })

    it('reports the solve once, on the fourth row', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KETTLE')
      await user.type(boxNamed(2), 'SAUCEPAN')
      await user.type(boxNamed(3), 'SKILLET')

      await user.type(boxNamed(4), 'SPATULA')

      expect(onSolved).toHaveBeenCalledTimes(1)
    })

    it('reports nothing while three rows are right', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KETTLE')
      await user.type(boxNamed(2), 'SAUCEPAN')

      await user.type(boxNamed(3), 'SKILLET')

      expect(screen.getByText('3 of 4 right')).toHaveProperty('textContent', '3 of 4 right')
      expect(onSolved).not.toHaveBeenCalled()
    })

    // The ref is seeded with the MOUNT-TIME value, which is what makes this structural rather than
    // argued: the shell marked this puzzle solved when the player actually won it, and reporting it
    // again on every reopen would be the board claiming a win that already happened.
    it('does not report a solve that happened before this mount', () => {
      setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      expect(screen.getByText('4 of 4 right')).toHaveProperty('textContent', '4 of 4 right')
      expect(onSolved).not.toHaveBeenCalled()
    })

    // A restored solved board says nothing INTO the region either. The sentence goes in
    // `resting`, which FloorBar renders as a sibling of the region; a role="status" mounted with
    // text already in it is a region NVDA and JAWS were never watching.
    it('announces nothing into the region on a restored solved board', () => {
      setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  // THE TWO FIXTURES THAT EXERCISE THE GUARDS. Both TYPE rather than only mount: the second guard's
  // failure mode is a throw on the first keystroke, after onProgress has already written -- so a
  // test that only mounts reports green on a board that is one keystroke from being permanently
  // unopenable.
  describe('a pack whose answer is unusable', () => {
    // Without the empty-guess clause, normalizeAnswer('') === normalizeAnswer('') holds for an empty
    // box: a chip paints at mount and the tally counts a row nobody has touched. Silent, and it
    // credits the player with a word they have not written.
    //
    // NOT `onSolved`, and the earlier version of this comment claimed it. Measured: with all four
    // answers blanked AND the clause deleted, the board does paint four chips and `4 of 4 right` --
    // and onSolved is still never called, because the mount-seeded `reported` ref swallows it. The
    // ref is what keeps a false win away from the shell; THIS clause is what keeps the board from
    // painting one. Asserting onSolved here would have been a passenger defended by the other
    // mechanism, which is the shape this branch has removed four times already.
    it('locks nothing when an answer is blank', () => {
      setup(blankAnswerThemedAnagrams)

      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(screen.queryByText('Right')).toBeNull()
      expect(screen.getByText('0 of 4 right')).toHaveProperty('textContent', '0 of 4 right')
    })

    it('takes a keystroke against a blank answer without locking the row', async () => {
      const { user } = setup(blankAnswerThemedAnagrams)

      await user.type(boxNamed(1), 'KETTLE')

      expect(onProgress).toHaveBeenLastCalledWith('KETTLE\n\n\n')
      expect(screen.queryByText('Right')).toBeNull()
    })

    // THE LATCHING ONE. Without `typeof answer === 'string'` the keystroke below writes progress
    // and then throws inside normalizeAnswer, so the write lands and the render does not -- and
    // every later load restores that character at mount and throws before the player can touch
    // anything. Nothing self-heals it: the pack is valid, so readPack keeps it, and no code
    // validates a progress string.
    it('takes a keystroke against an absent answer without throwing', async () => {
      const { user } = setup(unusableAnswerThemedAnagrams)

      await user.type(boxNamed(1), 'K')

      expect(onProgress).toHaveBeenLastCalledWith('K\n\n\n')
      expect(boxNamed(1)).toHaveValue('K')
      expect(screen.queryByText('Right')).toBeNull()
    })

    // MORE ENTRIES THAN DRAFTS, which is the other side of the same predicate and the one the typeof
    // clause does not cover: `entries` is off the wire and `decode` returns a fixed four-tuple, so
    // the fifth row's GUESS is undefined while its answer is perfectly good. Before the `?? ''` this
    // threw inside normalizeAnswer during render at mount and ErrorBoundary took the whole app --
    // and it was a regression, since the board rendered five boxes and survived one commit earlier.
    // NOT FOUR ENTRIES IS NOT A BOARD, and three is the shape that made this a blocking defect
    // rather than a cosmetic one. Three VALID entries passed an every-is-an-entry check, so the
    // board drew three rows, and filling them read `3 of 4 right` while the floor announced
    // `Solved. You got all four.` -- and because the player transitions INTO solved in-session, the
    // mount-seeded ref does not swallow it, so onSolved fired and the shell wrote the win to
    // `lull:meta`, where solved ids are never pruned. A false win, kept forever, on a puzzle nobody
    // finished. Five goes the same way for the mirror reason: the drafts only carry four, so a fifth
    // row is drawn, typeable, and cannot be won.
    //
    // The double cast is the honest way to write both. `entries` is a four-TUPLE, so neither length
    // is a value the type admits -- and a pack is JSON off the network, where the type system
    // describes what lull-api promises rather than what arrives.
    //
    // THE BOARD IS THE WHOLE ASSERTION now that there is no verdict control to press. This used to
    // click Check first, on the reasoning that a press is what a player would do; the press proved
    // nothing the mount does not -- a refused pack draws no box, offers no win, and reports none.
    it.each<[string, unknown[]]>([
      ['three', themedAnagramsPuzzle.data.entries.slice(0, 3)],
      ['five', [...themedAnagramsPuzzle.data.entries, { answer: 'LADLE', scramble: 'ADLEL' }]],
    ])('refuses a pack of %s entries rather than drawing a board nobody can finish', (_count, entries) => {
      setup({
        ...themedAnagramsPuzzle,
        data: { ...themedAnagramsPuzzle.data, entries } as unknown as ThemedAnagramsData,
      })

      expect(screen.getByText('Kitchen tools')).toBeInTheDocument()
      expect(screen.queryAllByRole('textbox')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull()
      expect(screen.queryByText(SOLVED)).toBeNull()
      expect(onSolved).not.toHaveBeenCalled()
    })

    // A ROWLESS PACK IS NOT A WIN, and the assertion that matters is the control rather than the
    // sentence. `right === entries.length` alone is `0 === 0` here, which used to stand `Solved. You
    // got all four.` over a board with no rows -- wrong, and only wrong. Once the floor's control
    // became conditional the same expression offered `Play again`, and one press reaches the shell's
    // removeHints and deletes the rungs the player spent: the hints come off `puzzle.hints`, not off
    // `entries`, so a malformed `entries` beside an intact ladder is exactly the shape that loses
    // something real.
    //
    // NO CONTROL AT ALL is the whole floor here, and that is asserted as a count rather than as one
    // absence. The shuffle asks `canReshuffle`, which no row can answer, and `Play again` asks
    // `solved`, which the `rows.length > 0` guard is what keeps false. A press that could reach the
    // shell is exactly what this pack must not be able to make.
    it('offers a rowless pack no win to play again from', () => {
      setup({
        ...themedAnagramsPuzzle,
        data: { ...themedAnagramsPuzzle.data, entries: [] } as unknown as ThemedAnagramsData,
      })

      expect(screen.queryAllByRole('button')).toHaveLength(0)
      expect(screen.queryByText(SOLVED)).toBeNull()
    })
  })

  describe('the floor', () => {
    // ONE CONTROL ON AN UNSOLVED BOARD, and it is the shuffle. There is no verdict control: a
    // `Check` used to stand here and it adjudicated nothing, because a row locks itself on the
    // keystroke that makes it right and `change` says the sentence. The COUNT is what says so --
    // "there is a shuffle" is equally true of a floor that also drew a button asking to be pressed.
    it('puts the controls in the instrument band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(
        screen.getByRole('button', { name: 'Shuffle letters' }),
      )
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })

    // TABBED INTO, never out of, which is the only walk that can fail for the reason this name
    // gives: a control dropped from the tab order is simply skipped, so a walk that merely passes
    // over it lands somewhere plausible either way. Arriving at the control is what a missing tab
    // stop cannot do.
    //
    // THE SECOND TAB IS THE HALF THAT MATTERS NOW. It used to land on Check; there is nothing left
    // in the band, so it leaves the board entirely -- which is the assertion that a control quietly
    // added back beside the shuffle would redden.
    it('runs the tab order from the last box to the one control', async () => {
      const { user } = setup()
      boxNamed(4).focus()

      await user.tab()
      expect(screen.getByRole('button', { name: 'Shuffle letters' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Shuffle letters' })).not.toHaveFocus()
    })
  })

  // THE ONE PRESS ON THIS BENCH THAT TOUCHES NEITHER THE DRAFTS NOR STORAGE. It steps each row one
  // along the list of arrangements the pack shipped, and says so.
  describe('the shuffle', () => {
    // The pack's arrangements by position, which is what a press walks. Written out rather than read
    // off the fixture, so a fixture edited in the wrong direction reddens here instead of quietly
    // agreeing with itself.
    const SECOND_RUNS = ['ELETKT', 'NSAPUACE', 'TILKELS', 'AAUPLTS']
    const THIRD_RUNS = ['TLTEEK', 'PACNSAEU', 'KTESLLI', 'PALSTUA']
    const FOURTH_RUNS = ['LTETEK', 'NSCEAUPA', 'LLKSETI', 'TUPSLAA']
    const SHUFFLED = 'Letters shuffled.'

    // A pack whose four rows shipped DIFFERENT list lengths, which the contract says is normal: two
    // entries in the same puzzle can hold four and one. Row 1 has somewhere to go and rows 2 to 4 do
    // not.
    const mixedLengths: Puzzle<ThemedAnagramsData> = {
      ...themedAnagramsPuzzle,
      data: {
        ...themedAnagramsPuzzle.data,
        entries: [
          { answer: 'KETTLE', scrambles: ['ELKTET', 'ELETKT'] },
          { answer: 'SAUCEPAN', scrambles: ['UNASAPCE'] },
          { answer: 'SKILLET', scrambles: ['LKSETIL'] },
          { answer: 'SPATULA', scrambles: ['TPSLAAU'] },
        ],
      },
    }

    const press = async (user: ReturnType<typeof userEvent.setup>): Promise<void> =>
      user.click(screen.getByRole('button', { name: 'Shuffle letters' }))

    // AN ICON WITH A NAME. Nothing on screen says "Shuffle letters" -- the glyph is a path -- so the
    // accessible name is the only thing carrying what this control does, and a role query is what
    // defends it, because it reads the accessibility tree rather than the markup.
    it('is named for what it does', () => {
      setup()

      expect(screen.getByRole('button', { name: 'Shuffle letters' })).toBeInTheDocument()
    })

    // `scrambles[0]` IS THE BOARD AS IT FIRST APPEARS, which is the half of the contract that holds
    // before anybody presses anything.
    it('opens on the arrangement the pack put first', () => {
      setup()

      expect(runs()).toEqual(PACK_RUNS)
    })

    // ONE STEP ALONG THE PACK'S OWN LIST, and the whole list is walked rather than just the first
    // step: a control that stepped once and stuck, or that jumped two, passes a single-press test.
    // WRAPPING TO THE FIRST after the last is the other half -- the contract says cycle back rather
    // than invent a fifth, and a board that ran off the end would read `undefined` into spellOut.
    it('walks the list in wire order and wraps to the first', async () => {
      const { user } = setup()

      await press(user)
      expect(runs()).toEqual(SECOND_RUNS)
      await press(user)
      expect(runs()).toEqual(THIRD_RUNS)
      await press(user)
      expect(runs()).toEqual(FOURTH_RUNS)
      await press(user)
      expect(runs()).toEqual(PACK_RUNS)
    })

    // THE LETTERS ARE THE PUZZLE, and this is the promise that survives a re-drawn fixture: whatever
    // arrangement comes up holds exactly the letters the answer does. A row whose letters changed is
    // a row whose answer no longer comes out of it, unsolvable with nothing on screen to say why.
    it.each(ROW_INDEXES)('keeps every letter row %i started with', async (index) => {
      const { user } = setup()

      await press(user)

      expect([...runs()[index]].sort()).toEqual([...PACK_RUNS[index]].sort())
    })

    // BOTH HALVES OF THE ROW MOVE TOGETHER. The visible run is aria-hidden noise and the spelled-out
    // name is what a screen reader gets, so a press that redrew only the plate would leave a blind
    // player reading letters that are no longer on the board -- and every role query in this file
    // would go on passing.
    it('spells the new arrangement out for a reader', async () => {
      const { user } = setup()

      await press(user)

      expect(tiles(0)).toEqual(['The letters are E L E T K T'])
      expect(screen.getAllByRole('textbox')[0]).toHaveAccessibleDescription('The letters are E L E T K T')
    })

    // SAID, because nothing else this press changes is announced. The four runs live inside
    // role="img" elements whose names are recomputed silently, so without the ribbon this is a button
    // that does nothing whatsoever for the one reader who cannot check the plate.
    it('says the press landed', async () => {
      const { user } = setup()

      await press(user)

      expect(ribbon()).toHaveTextContent(SHUFFLED)
    })

    // THE WHOLE OF "the new order is not saved". There is nothing to write -- the drafts are
    // untouched -- and a call here would hand the shell a value identical to the one it holds and
    // mark the puzzle started on a board nobody has typed in.
    it('writes no progress', async () => {
      const { user } = setup()

      await press(user)

      expect(onProgress).not.toHaveBeenCalled()
    })

    // AND THE DRAFTS SURVIVE IT. Which arrangement a row is showing is a view; what the player typed
    // is their work, and a press that reset a box would throw away an answer they were halfway
    // through.
    it('leaves the drafts the player has typed', async () => {
      const { user } = setup()
      await user.type(boxNamed(2), 'SAUCE')

      await press(user)

      expect(boxNamed(2)).toHaveValue('SAUCE')
    })

    // NOT PERSISTED, asserted through a second mount rather than through the absence of a call. The
    // board is unmounted and opened again the way a player leaving the page and coming back opens
    // it, and `scrambles[0]` is what it draws -- the board as the pack presents it.
    it('draws the pack’s first arrangement again on the next visit', async () => {
      const { user } = setup()
      await press(user)
      expect(runs()).toEqual(SECOND_RUNS)

      cleanup()
      setup()

      expect(runs()).toEqual(PACK_RUNS)
    })

    // A ROW THE PLAYER HAS ALREADY WON KEEPS ITS LETTERS. Its box is readOnly and the chip beside it
    // says so; moving the plate under a finished row reads for a moment as though it came undone.
    // Row 1 is the one held still and the other three are asserted to have stepped, so this cannot
    // pass on a control that stopped moving anything at all.
    it('leaves a row that is already right alone', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KETTLE')

      await press(user)

      expect(runs()[0]).toBe('ELKTET')
      expect(runs().slice(1)).toEqual(SECOND_RUNS.slice(1))
    })

    // keepsFocusOnPress, and this is the assertion that defends it. This is the press most likely to
    // happen mid-word: a player stuck on a row reaches for it while typing, and a press that took
    // focus would collapse the software keyboard and move the four rows they are reading.
    it('leaves focus in the box the player was typing in', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KET')

      await press(user)

      expect(boxNamed(1)).toHaveFocus()
    })

    // GONE ONCE THE BOARD IS SOLVED. Every row is right and a right row keeps its letters, so the
    // press would be a no-op wearing a sentence. The Play again assertion is what stops this passing
    // on a board that failed to render its floor at all.
    it('is gone from a solved board', () => {
      setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Shuffle letters' })).toBeNull()
    })

    // AND IT COMES BACK when the win is undone, which is the other arm of the same expression. Play
    // again empties the four boxes, so there are rows in play again and somewhere for them to go.
    it('comes back when the player starts over', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getByRole('button', { name: 'Shuffle letters' })).toBeInTheDocument()
    })

    // ONE IS A NORMAL LENGTH, not a degenerate pack -- KETTLE at band 4 has exactly one arrangement
    // hard enough to show, out of 180. The contract says the control hides itself there, because a
    // button that visibly does nothing reads as a bug in the app. This is also the shape the deployed
    // API answers with today, so the rows assertion is what says the board still draws.
    //
    // THE FLOOR IS THEN EMPTY, which is a real state of this bench rather than a broken one: an
    // unsolved board whose pack shipped one arrangement a row offers no control at all, and it owes
    // none -- the player types, the rows lock themselves, and the standing line says what the game
    // is the whole time.
    it('is gone when no row has anywhere to go', () => {
      setup(legacyScrambleThemedAnagrams)

      expect(runs()).toEqual(PACK_RUNS)
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    // THE LENGTH VARIES PER ENTRY, so the question is asked per row rather than of the pack. One row
    // with somewhere to go is enough to offer the control, and the press moves that row and leaves
    // the three with nowhere to go exactly where they are -- rather than wrapping them back to
    // themselves noisily or running off the end of their lists.
    it('is offered while any one row still has somewhere to go', async () => {
      const { user } = setup(mixedLengths)

      await press(user)

      expect(runs()).toEqual(['ELETKT', 'UNASAPCE', 'LKSETIL', 'TPSLAAU'])
    })

    // AND IT GOES when that one row is won, which is the case a board-wide `solved` check misses:
    // three rows are still unsolved and the control is still right to disappear, because the only row
    // that could move is finished.
    it('is gone once the only row with somewhere to go is right', async () => {
      const { user } = setup(mixedLengths)

      await user.type(boxNamed(1), 'KETTLE')

      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(screen.queryByRole('button', { name: 'Shuffle letters' })).toBeNull()
    })
  })

  describe('the standing line', () => {
    // The rule of the game goes where this bench teaches -- above the control, not 200px away in
    // another band. The theme on the sign row says what the four rows are about; it does not say
    // that all four answers fit it, which is the thing that makes the puzzle work.
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

      expect(ribbon()).not.toContainElement(screen.getByText(INSTRUCTION))
    })

    it('is said once, not once per band', () => {
      setup()

      expect(screen.getAllByText(INSTRUCTION)).toHaveLength(1)
    })

    // THE OTHER ARM OF `resting`, and it landed with the line rather than with the task that reads
    // it. Nothing here was asserting what a solved board stands: the arm EXECUTES on a restored
    // solved board, so coverage read 100% branches, while no assertion ever looked at what it
    // produced -- `const resting = INSTRUCTION` passed all 82 tests the file then held.
    //
    // It belongs in this commit and not the next one, because a test written later against a line
    // written here is green the moment it is pasted, and the task that pastes it learns nothing
    // about its own change. That is how a passing test stops meaning anything.
    //
    // At REST, not announced. The win reaches the region only on the keystroke that wins in this
    // session; a reopened solved board has nothing to announce, because role="status" mounted with
    // its text already in it is a region NVDA and JAWS were never watching.
    it('shows the win at rest on a restored solved board', () => {
      setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      expect(screen.getAllByText('Right')).toHaveLength(4)
      expect(screen.getAllByText(SOLVED)).toHaveLength(1)
      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()
      expect(ribbon()).toBeEmptyDOMElement()
    })

    // The presence assertion first is what stops this being absence-only: without it the whole test
    // passes on a bench that never drew a standing line at all.
    //
    // THE SENTENCE THAT DISPLACES IT IS A ROW'S OWN, because that is the only kind left. It used to
    // be a press of Check answering `Type an answer first.`; the rows adjudicate themselves, so what
    // takes the floor is the report of a row going right.
    it('gives the floor up to a message', async () => {
      const { user } = setup()
      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()

      await user.type(boxNamed(1), 'KETTLE')

      expect(ribbon()).toHaveTextContent('KETTLE is right — 3 to go.')
      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()
    })
  })

  // THERE IS NO VERDICT CONTROL AND NO VERDICT KEY, and this block is what says so. A `Check` button
  // stood in the floor and the boxes ran it from the OS keyboard's action key; it adjudicated
  // nothing -- a row locks itself on the keystroke that makes it right and `change` says the
  // sentence -- so every press it could take was a press on a board that had already answered, and
  // the two sentences it owned (`Type an answer first.` and `Not yet. Each answer uses every letter
  // in its row, once each.`) went with it.
  //
  // NAMED FOR THE KEY RATHER THAN FOR THE BUTTON, because the key is the half that can come back by
  // accident: a submit-shaped handler is one line, and an input in no form takes Enter silently
  // today. The value assertion leads, so this fails loudly on a board that never took the keystrokes
  // rather than passing on an empty region.
  describe('the keyboard’s action key', () => {
    it('says nothing and changes nothing when the player presses it', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'SAUCEPANS{Enter}')

      expect(boxNamed(1)).toHaveValue('SAUCEPANS')
      expect(ribbon()).toBeEmptyDOMElement()
      expect(screen.queryByRole('button', { name: 'Check' })).toBeNull()
    })

    // The mirror of it, and the row that would redden if a handler came back reading any key at all.
    it('says nothing when the player presses any other key', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'SAUCE{Escape}')

      expect(boxNamed(1)).toHaveValue('SAUCE')
      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  // THE REPEAT MARK, and the case it exists for is real: a player who presses Shuffle letters twice.
  // Saying an identical string twice is an Object.is bail-out -- the DOM text never changes, and
  // role="status" is keyed to a change rather than to a write -- so the second press would be
  // silent, which reads as a broken key. It used to be a second press of Check, which is gone;
  // `Letters shuffled.` is now the only sentence on this bench that can follow itself, since a row's
  // report names the row and the win is said once.
  //
  // The mark rides the FIRST press here, not the second, and that is not a mistake: the nonce starts
  // at 0 and is incremented before it is used, so message one is odd and message two is even. What
  // the mechanism promises is that two consecutive texts DIFFER, and pinning both by value is what
  // says so. toHaveProperty rather than toHaveTextContent, because a substring match cannot see a
  // zero-width character on the end of the string it just matched.
  describe('a second press on an unchanged board', () => {
    const SHUFFLED = 'Letters shuffled.'

    it('says the same sentence in a way the region will announce', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Shuffle letters' }))
      expect(ribbon()).toHaveProperty('textContent', `${SHUFFLED}${REPEAT_MARK}`)

      await user.click(screen.getByRole('button', { name: 'Shuffle letters' }))

      expect(ribbon()).toHaveProperty('textContent', SHUFFLED)
    })
  })

  describe('once solved', () => {
    // THE ONLY CONTROL THE FLOOR EVER DRAWS BESIDE THE SHUFFLE, and the win is the only state that
    // draws it. It used to share its position with `Check`, which is why the count is asserted: on a
    // solved board the shuffle is gone too, so `Play again` stands alone and a button quietly added
    // back beside it reddens here.
    it('offers Play again and nothing else', () => {
      setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })

    // NO SECOND `shows the win as a standing line` TEST HERE. `the standing line` above already owns
    // that assertion -- it landed with the line it reads, in the commit that wrote it -- and a copy
    // of it filed under this heading would be green the moment it was pasted, which is how a passing
    // test stops meaning anything. What this block adds is what one PRESS does, which nothing else
    // in this file could see.
    it('empties the four boxes when the player plays again', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)
      expect(screen.getAllByRole('textbox').map((box) => (box as HTMLInputElement).value)).toEqual([
        'KETTLE',
        'SAUCEPAN',
        'SKILLET',
        'SPATULA',
      ])

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getAllByRole('textbox').map((box) => (box as HTMLInputElement).value)).toEqual(['', '', '', ''])
    })

    // Everything on this board is DERIVED from the guesses, so four empty strings take the chips,
    // the tally and the locks with them and there is nothing to tear down. The lead assertion is
    // what tells a broken board from one that never drew a chip.
    it('takes back the chips and the tally when the player plays again', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)
      expect(screen.getAllByText('Right')).toHaveLength(4)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.queryByText('Right')).toBeNull()
      expect(screen.getByText('0 of 4 right')).toHaveProperty('textContent', '0 of 4 right')
    })

    // THE BOARD IS PLAYABLE AGAIN, which is a different fact from the boxes being empty: a box is
    // readOnly while its row is right, so a board that emptied the four values without un-locking
    // the four rows looks reset and takes no keystrokes. The mutation it reddens on its own is a
    // lock read off anything LATCHED rather than off `rights` -- `readOnly={rights[index] ||
    // reported.current}` empties every box here and refuses every letter typed into one.
    it('takes a fresh answer once the player plays again', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      await user.click(screen.getByRole('button', { name: 'Play again' }))
      await user.type(boxNamed(1), 'KETT')

      expect(boxNamed(1)).toHaveValue('KETT')
    })

    // The shell persists what it is handed and reads '' as "no progress", so a press that emptied
    // only the boxes would put the four winning words back on the next load.
    it('reports the empty board to the shell', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onProgress).toHaveBeenLastCalledWith('')
    })

    // Play again is a fresh puzzle, not merely four empty boxes, and the hint ladder is part of what
    // "fresh" means. The board cannot clear it itself -- `lull:hints:<puzzleId>` is storage, and a
    // board gets none -- so it names the event and the shell decides what that means.
    it('asks the shell to start the puzzle over', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(onReset).toHaveBeenCalledTimes(1)
    })

    it('still empties the board when no reset callback is supplied', async () => {
      const user = setupWithoutReset(SOLVED_PROGRESS)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getAllByRole('textbox').map((box) => (box as HTMLInputElement).value)).toEqual(['', '', '', ''])
    })

    // THE TEST THAT REDDENS ON THE MISSING TRANSIENT CLEAR, and it has to win IN THIS SESSION to do
    // it: a restored solved board mounts with an empty transient, so pressing Play again there puts
    // the standing line back whether or not `playAgain` clears anything. Won here, `message` holds
    // `Solved. You got all four.`, and FloorBar draws `resting` only while `message === ''` -- so a
    // playAgain without the clear leaves an empty board still being told it is solved, and the line
    // that says what the game is never returns.
    it('puts the standing line back after a win in this session', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KETTLE')
      await user.type(boxNamed(2), 'SAUCEPAN')
      await user.type(boxNamed(3), 'SKILLET')
      await user.type(boxNamed(4), 'SPATULA')
      expect(ribbon()).toHaveTextContent(SOLVED)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(ribbon()).toBeEmptyDOMElement()
      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
    })

    // THE SAME PRESS FROM AN ODD NONCE, which is the only path that reaches `announced`'s empty
    // guard. A win says four sentences on its own, which leaves the nonce even and the mark '' --
    // so the guard is never consulted on a board that was only played. THE SHUFFLE IS WHAT MAKES IT
    // ODD: one press before the four answers is a fifth sentence, and this is the only way left to
    // reach the state at all. It used to be a restored solved board plus one press of Check, and
    // there is no Check to press.
    //
    // Without the guard the ribbon holds a lone zero-width space after the press: invisible, but not
    // empty -- and FloorBar draws `resting` only while the message is '', so the player lands on a
    // fresh board with no line telling them what the game is, and nothing on screen to explain why.
    it('puts the standing line back even when the repeat mark is due', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Shuffle letters' }))
      await user.type(boxNamed(1), 'KETTLE')
      await user.type(boxNamed(2), 'SAUCEPAN')
      await user.type(boxNamed(3), 'SKILLET')
      await user.type(boxNamed(4), 'SPATULA')
      expect(ribbon()).toHaveProperty('textContent', `${SOLVED}${REPEAT_MARK}`)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(ribbon()).toBeEmptyDOMElement()
      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
    })

    // The ref is reseeded by the effect on the un-solved render that Play again produces, so the
    // next win is reported. A board that latched the win would go quiet here and the player who
    // played again would finish a puzzle the shell never records.
    //
    // ONE call, not two, and the number is the point: the restored win was never reported, because
    // the `reported` ref is seeded with the mount-time value. So this single call is the one this
    // solve produced, which is a stronger statement than a count that could have come from either.
    it('reports the win the player earns after playing again', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)
      await user.click(screen.getByRole('button', { name: 'Play again' }))

      await user.type(boxNamed(1), 'KETTLE')
      await user.type(boxNamed(2), 'SAUCEPAN')
      await user.type(boxNamed(3), 'SKILLET')
      await user.type(boxNamed(4), 'SPATULA')

      expect(onSolved).toHaveBeenCalledTimes(1)
    })

    // Play again is pressed WITH FOCUS ON IT -- a click focuses a button that does not refuse it --
    // and the press is what takes the control off the screen. It used to be renamed rather than
    // removed: `Check` stood in the same position, React kept the node, and focus simply stayed
    // where it was. With nothing to inherit it, focus would fall to <body>, from which the next Tab
    // restarts at the top of the page -- so the board hands it to the first box instead, which is
    // where a player who just asked to start over is going anyway.
    //
    // NOTHING ELSE IN THIS FILE WOULD NOTICE: every other Play again test asserts what happened to
    // the boxes, not to the caret.
    it('moves focus to the first box on Play again', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(boxNamed(1)).toHaveFocus()
    })
  })

  // ON AN UNSOLVED BOARD, which is why these are not filed under the win: a solved board's boxes are
  // readOnly, so "the player empties a box" is a state it cannot enter at all.
  describe('starting over is a press, never a keystroke', () => {
    // The direction that is actually load-bearing. A board that called onReset from `change` would
    // charge the player their spent rungs for a backspace.
    it('says nothing about starting over while the player is still typing', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'KETT')

      expect(onReset).not.toHaveBeenCalled()
    })

    // And the state that reaches the canonical empty by hand rather than by pressing anything: the
    // player deletes everything they were composing. This is the one the test above cannot see,
    // because a board that fired the reset when the encoded string is '' only fails once every box
    // is empty. The onProgress assertion leads so the test fails loudly on a board that never took
    // the keystrokes.
    it('says nothing about starting over when the player empties every box', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KET')
      await user.type(boxNamed(2), 'SAU')
      await user.type(boxNamed(3), 'SKI')
      await user.type(boxNamed(4), 'SPA')

      await user.clear(boxNamed(1))
      await user.clear(boxNamed(2))
      await user.clear(boxNamed(3))
      await user.clear(boxNamed(4))

      expect(onProgress).toHaveBeenLastCalledWith('')
      expect(onReset).not.toHaveBeenCalled()
    })
  })

  // aria-controls contributes nothing to an accessible name, so it can rot in total silence: every
  // role query in this file keeps passing while the relationship it asserts is gone. That makes it
  // the one IDREF a role query cannot defend, and the answer for a board that builds none is to say
  // so. The only aria-controls in this app is the hint sheet's, asserted at both ends in its own
  // suite and followed by hand by gofigure to decide whether to freeze its keyboard, so a second one
  // appearing here would be read by code that is not looking for it. `Button` accepts the prop,
  // which is exactly how one arrives by accident.
  //
  // BOTH STATES, because the control is different markup in each, and each row names its control so
  // it proves it reached the state it is named for rather than passing on a board that rendered
  // nothing.
  describe('the IDREFs this board does not build', () => {
    it.each<[string, string | null, string]>([
      ['fresh', null, 'Shuffle letters'],
      ['solved', SOLVED_PROGRESS, 'Play again'],
    ])('builds no aria-controls on a %s board', (_description, progress, control) => {
      const { container } = setup(themedAnagramsPuzzle, progress)

      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(screen.getByRole('button', { name: control })).toBeInTheDocument()
      expect(container.querySelector('[aria-controls]')).toBeNull()
    })
  })

  // A PACK OFF THE NETWORK THAT isValidPuzzle LEFT OPAQUE, and every row here is a shape it can
  // actually deliver. `getByRole('region')` still resolving is the whole assertion: a value this
  // board dereferences without a guard throws DURING RENDER, and a throw during render is not a
  // blank row -- ErrorBoundary catches it and swaps the entire app for "Lull got stuck".
  describe('a pack this board cannot draw', () => {
    // The cast is what a pack can actually deliver, said out loud. `data` is JSON, and the type this
    // file imports is a promise about the generator rather than about the wire.
    const withEntries = (entries: unknown): Puzzle<ThemedAnagramsData> =>
      ({ ...themedAnagramsPuzzle, data: { ...themedAnagramsPuzzle.data, entries } }) as Puzzle<ThemedAnagramsData>

    // REFUSED WHOLE, never in part -- the refusal `decode` makes one file over. The last three rows
    // are the ones that make "whole" mean something: one bad member takes the other three with it,
    // because a board showing two of four rows is a puzzle the player cannot finish while looking
    // like one they can.
    //
    // THE CONTROL IS PART OF EVERY ROW, and it is a second guard rather than a flourish. Drop
    // `rows.length > 0` from `solved` and every row here reads `0 === 0`: the floor offers
    // `Play again`, whose press reaches the shell's removeHints and deletes the rungs the player
    // spent. `offers a rowless pack no win to play again from` already defends that expression on a
    // pack whose `entries` is genuinely `[]`; these rows extend it to the five inputs that used to
    // crash before they could reach it.
    //
    // THE PLAN'S SEPARATE `onSolved` ROW IS NOT WRITTEN, and the reason is that it cannot fail for
    // the name it would carry. `reported` is seeded at mount with the mount-time value of `solved`,
    // so a board that is solved on its first render reports no transition and never calls onSolved
    // -- measured. `expect(onSolved).not.toHaveBeenCalled()` on a rowless pack is green with the
    // guard, green without it, and pins the ref rather than the guard.
    it.each<[string, unknown]>([
      ['entries is missing', undefined],
      ['entries is a string', 'KETTLE'],
      ['entries is an empty array', []],
      // EVERY BAD-MEMBER ROW CARRIES FOUR MEMBERS, and that is not tidiness. `rows` reads
      // `entries.length === 4` BEFORE `entries.every(isEntry)`, so a two-member array is refused by
      // the length clause and `isEntry` is never called at all. Written short, these four rows left
      // both of isEntry's clauses -- and the whole `every` call -- deletable with the entire suite
      // green, which is what the blind final review measured. The guard is real: a four-member array
      // with a null member reaches `null.scramble`, a throw during render, which ErrorBoundary turns
      // into "Lull got stuck" for the whole app on a pack the shell's validator accepts and keeps.
      //
      // Padded, the null row kills the `entry !== null` mutant and the undefined row kills the
      // `typeof entry === 'object'` one. Short, neither could.
      [
        'an entry is a string',
        [{ answer: 'KETTLE', scramble: 'ELKTET' }, 'UNASAPCE', { answer: 'SKILLET', scramble: 'LKSETIL' }, { answer: 'SPATULA', scramble: 'TPSLAAU' }], // prettier-ignore
      ],
      [
        'an entry is null',
        [{ answer: 'KETTLE', scramble: 'ELKTET' }, null, { answer: 'SKILLET', scramble: 'LKSETIL' }, { answer: 'SPATULA', scramble: 'TPSLAAU' }], // prettier-ignore
      ],
      [
        'an entry is undefined',
        [{ answer: 'KETTLE', scramble: 'ELKTET' }, undefined, { answer: 'SKILLET', scramble: 'LKSETIL' }, { answer: 'SPATULA', scramble: 'TPSLAAU' }], // prettier-ignore
      ],
      [
        'an entry scramble is not a string',
        [{ answer: 'KETTLE', scramble: 42 }, { answer: 'SAUCEPAN', scramble: 'UNASAPCE' }, { answer: 'SKILLET', scramble: 'LKSETIL' }, { answer: 'SPATULA', scramble: 'TPSLAAU' }], // prettier-ignore
      ],
      // AN EMPTY LIST IS A MALFORMED ENTRY AND NOT A LEGACY ONE. The contract says there is never a
      // zero -- an entry that drew nothing costs the whole puzzle rather than shipping empty -- so
      // this must not fall through to a `scramble` that is not there either.
      [
        'an entry ships an empty list of scrambles',
        [{ answer: 'KETTLE', scrambles: [] }, { answer: 'SAUCEPAN', scrambles: ['UNASAPCE'] }, { answer: 'SKILLET', scrambles: ['LKSETIL'] }, { answer: 'SPATULA', scrambles: ['TPSLAAU'] }], // prettier-ignore
      ],
      // EVERY MEMBER IS CHECKED, not just the first, and this is the row that says so. Checked only
      // at [0] this pack draws four perfectly good rows and throws inside spellOut on the FIRST
      // PRESS of the shuffle -- minutes after the mount that should have refused it, and as a render
      // throw that ErrorBoundary turns into "Lull got stuck" for the whole app.
      [
        'a later member of a scrambles list is not a string',
        [{ answer: 'KETTLE', scrambles: ['ELKTET', 42] }, { answer: 'SAUCEPAN', scrambles: ['UNASAPCE'] }, { answer: 'SKILLET', scrambles: ['LKSETIL'] }, { answer: 'SPATULA', scrambles: ['TPSLAAU'] }], // prettier-ignore
      ],
    ])('draws the sign row and no rows when %s', (_description, entries) => {
      setup(withEntries(entries))

      expect(screen.getByRole('region', { name: 'Themed Anagrams' })).toBeInTheDocument()
      expect(screen.getByText('Kitchen tools')).toBeInTheDocument()
      expect(screen.getByText('0 of 4 right')).toHaveProperty('textContent', '0 of 4 right')
      expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull()
      // AND NO SHUFFLE, which is the `rows.length > 0` half of its guard. `!solved` alone leaves a
      // live control on a board with no rows to shuffle -- a press that says `Letters shuffled.`
      // over a plate with no letters on it.
      expect(screen.queryByRole('button', { name: 'Shuffle letters' })).toBeNull()
      expect(screen.queryAllByRole('textbox')).toHaveLength(0)
      expect(screen.queryAllByRole('img')).toHaveLength(0)
    })

    // THE BOARD SURVIVES THE PACK, and what that means changed with the floor. There used to be a
    // control here to press -- `Check`, which answered `Type an answer first.` over a board with no
    // rows -- and the promise was that the bench still spoke. There is nothing to press now, so the
    // promise is the narrower and more honest one: the sign row, the standing line and the region
    // are all drawn, and nothing on the bench can be operated into a state it has no rows for.
    it('draws a speaking bench on a board with no rows', () => {
      setup(withEntries(undefined))

      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()
      expect(ribbon()).toBeEmptyDOMElement()
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })
  })

  // The theme is the other unguarded read, and it is a different failure: an object rendered as a
  // React child throws `Objects are not valid as a React child` during render. One expression is the
  // whole guard, and these two tests are what make it a promise rather than a hedge in a table. The
  // other arm of the same ternary is `shows the theme all four rows are about`, above.
  describe('a theme that is not a string', () => {
    const objectTheme = {
      ...themedAnagramsPuzzle,
      data: { ...themedAnagramsPuzzle.data, theme: { name: 'Kitchen tools' } as unknown as string },
    }

    it('draws the whole board without the theme', () => {
      setup(objectTheme)

      expect(screen.getByRole('region', { name: 'Themed Anagrams' })).toBeInTheDocument()
      expect(screen.getAllByRole('textbox')).toHaveLength(4)
      expect(screen.getByText('0 of 4 right')).toHaveProperty('textContent', '0 of 4 right')
      expect(screen.queryByText('Kitchen tools')).toBeNull()
    })

    // AND IT TAKES A KEYSTROKE. A guard tested only at mount is tested in the one state where the
    // board is barely doing anything; here the rows are intact and only the theme is malformed, so
    // the board is fully playable and this test plays it -- through progress, adjudication and the
    // chip, on a pack whose theme is unusable.
    it('takes an answer on a board whose theme is unusable', async () => {
      const { user } = setup(objectTheme)

      await user.type(boxNamed(1), 'KETTLE')

      expect(onProgress).toHaveBeenLastCalledWith('KETTLE\n\n\n')
      expect(screen.getAllByRole('listitem')[0]).toContainElement(screen.getByText('Right'))
    })
  })

  // The band the shell orders the scrambles into. The component renders the class and learns
  // nothing about the band; index.css does the placing.
  describe('the bench bands', () => {
    it('puts the rows in the board band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-board')).toContainElement(screen.getByRole('list'))
    })
  })

  // WHAT THE LADDER HAS PINNED, read off the LIVE progress prop rather than off the state this board
  // read at mount. The board never learns that hints exist and has no name for the thing that put
  // these letters in place -- it finds a spent list in its own progress string and draws the run
  // around it.
  describe('a letter a hint revealed', () => {
    // THE SPEC'S WORKED EXAMPLE, kept at its own four letters rather than translated onto the
    // fixture's six. `SHOW` under `OSWH` is short enough that a reader can check the pool arithmetic
    // by eye, which is the whole reason the design document chose it -- and this board draws whatever
    // the pack sends, so the 5-to-9 wire contract is lull-api's gate and not a shape this file has to
    // honor. The second arrangement is what the shuffle control cycles to.
    const showPuzzle: Puzzle<ThemedAnagramsData> = {
      ...themedAnagramsPuzzle,
      data: {
        ...themedAnagramsPuzzle.data,
        entries: [
          { answer: 'SHOW', scrambles: ['OSWH', 'WOHS'] },
          { answer: 'KETTLE', scrambles: ['ELKTET'] },
          { answer: 'SKILLET', scrambles: ['LKSETIL'] },
          { answer: 'SPATULA', scrambles: ['TPSLAAU'] },
        ],
      },
    }

    // `I0` is the initial rung aimed at row 0, `B0` its bookends; the grammar is
    // `<g0>\n<g1>\n<g2>\n<g3>|<opened>|<spent>` with the drafts omitted because nothing is typed.
    // Written out rather than bought through the adapter, because these rows are about what the
    // BOARD does with a stored string and an adapter in the arrangement would be a second thing that
    // could be wrong.
    const INITIAL = '|1|I0'
    const BOOKENDS = '|1|B0'

    // pinned {0}; the pool is O S W H less one S, which is O W H, filling positions 1, 2 and 3 in
    // the scramble's own order.
    it('stands the first letter in its true place and fills the rest from the scramble', () => {
      setup(showPuzzle, INITIAL)

      expect(runs()[0]).toEqual('SOWH')
    })

    // pinned {0, 3}; the pool is O S W H less one S and one W, which is O H.
    it('stands both bookends in their true places', () => {
      setup(showPuzzle, BOOKENDS)

      expect(runs()[0]).toEqual('SOHW')
    })

    // THE LETTERS ARE THE SAME LETTERS. Pinning rearranges the run and may never add, drop or change
    // one -- a row whose multiset moved would be a row the answer no longer fits, which is the one
    // way this display could make a puzzle unsolvable.
    it('keeps every letter the pack scrambled', () => {
      setup(showPuzzle, BOOKENDS)

      expect([...runs()[0]].sort()).toEqual([...'OSWH'].sort())
    })

    // A RUNG MAY NEVER SPELL THE ANSWER ONTO THE BOARD, which is `MIN_FREE_POSITIONS` in the rule
    // stated where a player would actually see it breached. The bookends rung is the worst case on a
    // four-letter answer -- half its positions pinned -- and two positions still differ.
    it('leaves at least two positions still to work out', () => {
      setup(showPuzzle, BOOKENDS)
      const drawn = runs()[0]

      expect([...drawn].filter((letter, at) => letter !== 'SHOW'[at])).toHaveLength(2)
    })

    // THE ACCESSIBILITY TREE CARRIES THE PINNING, and it has to be per LETTER: a row named in one
    // breath could only say "S is revealed", which on a run with two of that letter leaves a reader
    // counting. Neither half of the treatment is a color -- see PINNED, which is weight and a rule.
    it('names a pinned tile as revealed and leaves the rest alone', () => {
      setup(showPuzzle, INITIAL)

      expect(tiles(0)).toEqual(['S, revealed', 'O', 'W', 'H'])
    })

    it('is findable by that name in the accessibility tree', () => {
      setup(showPuzzle, INITIAL)

      expect(screen.getByRole('img', { name: 'S, revealed' })).toBeInTheDocument()
    })

    // The box's description is what a reader who tabs straight in hears, and without this clause they
    // would be told the letters and not which of them are true -- which is the entire thing the rung
    // bought.
    it('names the revealed letters in the box’s description too', () => {
      setup(showPuzzle, BOOKENDS)

      expect(boxNamed(1)).toHaveAccessibleDescription('The letters are S O H W. S, W are revealed and in place.')
    })

    // AN UNHINTED ROW IS UNTOUCHED, byte for byte what the pack scrambled. A rung buys one row and
    // must not churn the other three.
    it('draws every other row exactly as the pack sent it', () => {
      setup(showPuzzle, INITIAL)

      expect(runs().slice(1)).toEqual(['ELKTET', 'LKSETIL', 'TPSLAAU'])
    })

    // AND IT IS UNTOUCHED IN THE ACCESSIBILITY TREE TOO, which is the half a visible-run assertion
    // cannot see. The split into one image per letter is bought by the rung and paid for by the
    // reader -- up to nine nodes in the browse order where there was one -- so it lands on the row
    // the rung is about and on no other. Row 0 is split here and row 1 is one image, on the same
    // board, in the same render.
    it('splits only the row a rung pinned into one image per letter', () => {
      setup(showPuzzle, INITIAL)

      expect(tiles(0)).toEqual(['S, revealed', 'O', 'W', 'H'])
      expect(tiles(1)).toEqual(['The letters are E L K T E T'])
    })

    // RESHUFFLE CYCLES THE REMAINDER AND LEAVES THE PINNING ALONE. The cursor moves, the pool is
    // rebuilt from the new arrangement, and the revealed letter is still standing in its true place
    // -- which is the property that would have been lost had the pinning been folded into `cursors`
    // instead of computed at draw time.
    it('keeps a pinned letter in place across a shuffle', async () => {
      const { user } = setup(showPuzzle, INITIAL)

      await user.click(screen.getByRole('button', { name: 'Shuffle letters' }))

      expect(runs()[0]).toEqual('SWOH')
      expect(tiles(0)[0]).toEqual('S, revealed')
    })

    // A LEGACY PAYLOAD PINS NOTHING. Every board stored before this grammar existed is four drafts
    // and no field, and it comes back drawing exactly what the pack scrambled -- no migration, no
    // version byte, no transitional shape.
    it('pins nothing on a board stored before the ladder existed', () => {
      setup(showPuzzle, 'S\n\n\n')

      expect(runs()[0]).toEqual('OSWH')
      expect(boxNamed(1)).toHaveValue('S')
    })

    // A MALFORMED LADDER COSTS THE LADDER AND NOTHING ELSE. The drafts beside it are still this
    // player's work, so the four boxes come back and only the pinning is gone.
    it('keeps the drafts when the ladder field is malformed', () => {
      setup(showPuzzle, 'S\n\n\n|9|I0')

      expect(runs()[0]).toEqual('OSWH')
      expect(boxNamed(1)).toHaveValue('S')
    })

    // THE BOARD IS NEVER THE SECOND WRITER. Its `encode` writes the four drafts and nothing else, and
    // the tail is re-attached by the shell through the adapter's `merge` -- so this is the assertion
    // that the board cannot clobber a rung the player paid for on its very next keystroke.
    it('writes only its own portion when the player types beside it', async () => {
      const { user } = setup(showPuzzle, INITIAL)

      await user.type(boxNamed(1), 'S')

      expect(onProgress).toHaveBeenLastCalledWith('S\n\n\n')
    })

    // THE PURCHASE APPEARS AT ONCE, WITH NO REMOUNT, and that is what reading the live prop buys.
    // `rerender` keeps the same component instance -- the drafts and the shuffle position both
    // survive it -- which is exactly what the shell does when it commits a rung: it writes the string
    // and re-renders the board it already had. A board that read its pinning off mount-time state
    // would sell the rung, charge for it, and show nothing until a reload.
    it('shows a rung bought under it without being mounted again', async () => {
      const user = userEvent.setup({ delay: null })
      const { rerender } = render(
        <ThemedAnagramsBoard
          onProgress={onProgress}
          onReset={onReset}
          onSolved={onSolved}
          progress={null}
          puzzle={showPuzzle}
        />,
      )

      await user.type(boxNamed(1), 'SH')
      // The second render is the SAME tree with a new `progress`, which is a prop change and not a
      // remount: React reconciles the board in place and every piece of its state survives.
      rerender(
        <ThemedAnagramsBoard
          onProgress={onProgress}
          onReset={onReset}
          onSolved={onSolved}
          progress={`SH\n\n\n${INITIAL}`}
          puzzle={showPuzzle}
        />,
      )

      expect(runs()[0]).toEqual('SOWH')
      expect(boxNamed(1)).toHaveValue('SH')
    })

    // THE INPUT BOX IS UNTOUCHED -- no prefill, no locking. What a rung buys here is knowing WHICH
    // letter is true, and typing it into the box for the player would be buying the answer instead.
    it('leaves the box empty and editable', () => {
      setup(showPuzzle, BOOKENDS)

      expect(boxNamed(1)).toHaveValue('')
      expect(boxNamed(1)).not.toHaveAttribute('readonly')
    })

    // The rows the fixture actually ships, with all three kinds spent at once, so the pool
    // arithmetic is exercised on a run with repeated letters and on a three-letter prefix rather
    // than only on the four-letter worked example.
    it('pins all three kinds across three rows of the shipped fixture', () => {
      setup(themedAnagramsPuzzle, '|3|I1,B2,P3')

      expect(runs()).toEqual(['ELKTET', 'SUNAAPCE', 'SLKEILT', 'SPATLAU'])
    })

    // A row whose answer never arrived still RENDERS -- `isEntry` deliberately does not check it, so
    // that the guards which stop a blank answer winning the game have something to be tested against
    // -- and `pinnedDisplay` would spread that answer and throw during render. The row draws its
    // scramble untouched instead.
    it('draws a row whose answer never arrived rather than throwing', () => {
      setup(unusableAnswerThemedAnagrams, '|1|I0')

      expect(runs()[0]).toEqual('ELKTET')
    })

    // The same guard from the other side: a blank answer IS a string and sails past a typeof check,
    // and `pinnedDisplay` returns a run of the ANSWER'S length -- so without the length comparison
    // this row would draw no letters at all.
    it('draws a row whose answer is blank rather than emptying it', () => {
      setup(blankAnswerThemedAnagrams, '|1|I0')

      expect(runs()[0]).toEqual('ELKTET')
    })
  })
})
