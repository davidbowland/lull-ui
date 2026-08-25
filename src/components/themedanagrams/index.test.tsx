import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { ThemedAnagramsBoard } from './index'
import { blankAnswerThemedAnagrams, themedAnagramsPuzzle, unusableAnswerThemedAnagrams } from '@test/__mocks__'
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

  // The four row indexes, so a per-row table can be written without repeating the literal. A
  // separate table from SPELLED because most of these assertions do not need the scramble.
  const ROW_INDEXES: number[] = [0, 1, 2, 3]

  const SOLVED = 'Solved. You got all four.'
  // The four answers as one stored string, which is what a solved board comes back from storage as.
  const SOLVED_PROGRESS = 'KETTLE\nSAUCEPAN\nSKILLET\nSPATULA'

  const INSTRUCTION = 'The letters in each row spell one word, and all four fit the theme.'
  const TYPE_FIRST = 'Type an answer first.'
  const NOT_YET = 'Not yet. Each answer uses every letter in its row, once each.'
  // The board's own REPEAT_MARK, spelled the same way and for the same reason: written as the escape
  // rather than as the character, because a literal zero-width space in a test file is invisible and
  // an editor or a careless selection deletes it without leaving a diff a reader can see.
  const REPEAT_MARK = '\u200b'

  // The ribbon, and the one place on this bench anything is announced. A helper because the board
  // mounts no live region of its own -- this is FloorBar's, handed a string.
  const ribbon = (): HTMLElement => screen.getByRole('status')

  const boxNamed = (ordinal: number): HTMLElement => screen.getByRole('textbox', { name: `Answer ${ordinal} of 4` })

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

      expect(screen.getAllByRole('img').map((run) => run.textContent)).toEqual([
        'ELKTET',
        'UNASAPCE',
        'LKSETIL',
        'TPSLAAU',
      ])
    })

    // A scramble read aloud as one string is gibberish, exactly like Missing Vowels' consonant run.
    // The visible run is hidden from the accessibility tree and the element's NAME spells the
    // letters out, so a blind player gets the letters rather than word-shaped noise.
    it.each(SPELLED)('spells row %i out instead of reading it as a word', (index, spelled) => {
      setup()

      expect(screen.getAllByRole('img')[index]).toHaveAccessibleName(spelled)
    })

    // Led with a positive assertion that throws first: a bare absence check also passes on a board
    // that rendered nothing at all.
    it('hides the visible run from a reader', () => {
      setup()

      expect(screen.getByText('ELKTET')).toBeInTheDocument()
      expect(screen.getByText('ELKTET')).toHaveAttribute('aria-hidden', 'true')
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
      // Not a manager opt-out, but the same kind of promise and equally undefended without this
      // line: under an open keyboard on an engine that reads no interactive-widget key, the action
      // key is the only control the player can reach, and this is what makes it read "Go".
      expect(box).toHaveAttribute('enterkeyhint', 'go')
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
    // ONE press each, because the assertion is about what typing CANNOT achieve here.
    it.each<[string, unknown[]]>([
      ['three', themedAnagramsPuzzle.data.entries.slice(0, 3)],
      ['five', [...themedAnagramsPuzzle.data.entries, { answer: 'LADLE', scramble: 'ADLEL' }]],
    ])('refuses a pack of %s entries rather than drawing a board nobody can finish', async (_count, entries) => {
      const { user } = setup({
        ...themedAnagramsPuzzle,
        data: { ...themedAnagramsPuzzle.data, entries } as unknown as ThemedAnagramsData,
      })

      expect(screen.getByText('Kitchen tools')).toBeInTheDocument()
      expect(screen.queryAllByRole('textbox')).toHaveLength(0)

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull()
      expect(screen.queryByText(SOLVED)).toBeNull()
      expect(onSolved).not.toHaveBeenCalled()
    })

    // A ROWLESS PACK IS NOT A WIN, and the assertion that matters is the control rather than the
    // sentence. `right === entries.length` alone is `0 === 0` here, which used to stand `Solved. You
    // got all four.` over a board with no rows -- wrong, and only wrong. Once the floor's control
    // became a ternary the same expression offered `Play again`, and one press reaches the shell's
    // removeHints and deletes the rungs the player spent: the hints come off `puzzle.hints`, not off
    // `entries`, so a malformed `entries` beside an intact ladder is exactly the shape that loses
    // something real.
    //
    // NOT `onSolved`, which is never called here either way -- the mount-seeded ref sees no
    // transition, so asserting it would pin the ref rather than this guard.
    it('offers a rowless pack no win to play again from', () => {
      setup({
        ...themedAnagramsPuzzle,
        data: { ...themedAnagramsPuzzle.data, entries: [] } as unknown as ThemedAnagramsData,
      })

      expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull()
      expect(screen.queryByText(SOLVED)).toBeNull()
    })
  })

  describe('the floor', () => {
    // ONE control for the whole board. Four Checks would each answer a question the row already
    // answers by locking, and they would add four names to a tab order that already carries four
    // boxes. The count is asserted rather than the presence, because "there is a Check" is also
    // true of a board that drew four of them.
    it('puts one control in the instrument band', () => {
      const { container } = setup()

      expect(container.querySelector('.lull-instrument')).toContainElement(
        screen.getByRole('button', { name: 'Check' }),
      )
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })

    // TABBED INTO, never out of, which is the only walk that can fail for the reason this name
    // gives: a control dropped from the tab order is simply skipped, so a walk that merely passes
    // over it lands somewhere plausible either way. Arriving at Check is what a missing tab stop
    // cannot do.
    it('runs the tab order from the last box to the control', async () => {
      const { user } = setup()
      boxNamed(4).focus()

      await user.tab()

      expect(screen.getByRole('button', { name: 'Check' })).toHaveFocus()
    })

    // keepsFocusOnPress, and this is the assertion that defends it. The composer contract exists so
    // a press does not collapse the software keyboard over the field being typed in; that is this
    // bench's press exactly, even though the field is in the other band. Drop the prop and the
    // button takes focus, the keyboard drops, and the layout moves at the instant the verdict lands.
    it('leaves focus in the box the player was typing in', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KET')

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(boxNamed(1)).toHaveFocus()
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
    // At REST, not announced. The win reaches the region only when the player presses Check; a
    // reopened solved board has nothing to announce, because role="status" mounted with its text
    // already in it is a region NVDA and JAWS were never watching.
    it('shows the win at rest on a restored solved board', () => {
      setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      expect(screen.getAllByText('Right')).toHaveLength(4)
      expect(screen.getAllByText(SOLVED)).toHaveLength(1)
      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()
      expect(ribbon()).toBeEmptyDOMElement()
    })

    // The presence assertion first is what stops this being absence-only: without it the whole test
    // passes on a bench that never drew a standing line at all.
    it('gives the floor up to a verdict', async () => {
      const { user } = setup()
      expect(screen.getByText(INSTRUCTION)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(ribbon()).toHaveTextContent(TYPE_FIRST)
      expect(screen.queryByText(INSTRUCTION)).not.toBeInTheDocument()
    })
  })

  // THE THREE SENTENCES A PRESS CAN PRODUCE, one test each. Every one of them reads the ribbon with
  // toHaveTextContent rather than by value, because the transient's repeat mark rides on the end of
  // whichever message is said an odd number of times.
  describe('the three verdicts', () => {
    it('asks for an answer when nothing is typed', async () => {
      const { user } = setup()

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(ribbon()).toHaveTextContent(TYPE_FIRST)
    })

    // ONLY THE ROWS STILL IN PLAY, and this is the row that says so. Reddening mutation: a check
    // that looked at all four guesses would find KETTLE among them and answer `Not yet.` on a board
    // where the only thing typed is already right and there is nothing left to judge.
    it('asks for an answer when the only typing on the board is a row that is already right', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'KETTLE')

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(ribbon()).toHaveTextContent(TYPE_FIRST)
    })

    // normalizeAnswer decides what "typed something" means, exactly as it decides what "right"
    // means, so three spaces is an empty box rather than an attempt. Reddening mutation: a check
    // that asked `guess !== ''` says `Not yet.` here and passes judgment on whitespace.
    it('asks for an answer when the only typing is spaces', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), '   ')

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(ribbon()).toHaveTextContent(TYPE_FIRST)
    })

    // `Not yet.` rather than the sibling bench's `Not it.`: three rows can be right while one is
    // not, and "Not it" passes judgment on the whole board. The second half points at the real
    // trick -- every letter in the row is used, once each.
    //
    // THE WRONG WORD GOES IN ROW 1, whose answer is KETTLE, and that is not arbitrary. SAUCEPANS in
    // ROW 2 does not stay wrong: the board adjudicates every keystroke, so the row locks the
    // moment the eighth letter makes it SAUCEPAN, the box turns readOnly, the trailing S is
    // refused, and the board reaches Check holding a row that is RIGHT -- which answers `Type an
    // answer first.` This whole block would then pin the opposite of what its names say.
    it('says what the trick is when something typed is not right', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'SAUCEPANS')

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(ribbon()).toHaveTextContent(NOT_YET)
    })

    // THE THIRD VERDICT, and with the floor's control replaced by `Play again` on a solved board
    // this is the ONLY way to reach `check` there: a readOnly input still delivers keydown. That is
    // why it is written with Enter rather than with the button.
    // Without the solved arm the player who just won and pressed their keyboard's action key is
    // told `Type an answer first.` -- the one sentence that is never true on a board holding four
    // right answers.
    it('says the win when the player checks a board that is already solved', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      await user.type(boxNamed(1), '{Enter}')

      expect(ribbon()).toHaveTextContent(SOLVED)
    })
  })

  describe('the keyboard’s action key', () => {
    // Where the shell's keyboard mitigations do not land, the OS keyboard covers the floor and its
    // own action key is the only control the player can reach. Each box already says enterKeyHint
    // "go"; this is the half that makes the key do the job it is named for.
    // Row 1 again, and for the reason spelled out on `says what the trick is` above: the same string
    // in row 2 locks that row on its eighth letter and never reaches Enter as a wrong answer.
    it('checks the board when the player presses it', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'SAUCEPANS{Enter}')

      expect(ribbon()).toHaveTextContent(NOT_YET)
    })

    // AN IME OR AN ANDROID GLIDE-TYPING COMMIT delivers Enter at a word boundary, so a handler that
    // reads only `event.key` checks the board in the middle of a word the player is still writing.
    // fireEvent rather than the user instance, and it is the one interaction in this file that is
    // not driven through it: `isComposing` lives on the native event and user-event has no way to
    // set it, so the choice is this or no test at all. The value assertion leads, so the test fails
    // loudly on a board that never took the keystrokes rather than passing on an empty region.
    // Row 1 again, and here the choice does a second job: an unlocked row leaves the ribbon empty,
    // so `toBeEmptyDOMElement` reads the guard rather than a row's own sentence left standing in it.
    it('takes a composition commit without checking the board', async () => {
      const { user } = setup()
      await user.type(boxNamed(1), 'SAUCEPANS')

      fireEvent.keyDown(boxNamed(1), { isComposing: true, key: 'Enter' })

      expect(boxNamed(1)).toHaveValue('SAUCEPANS')
      expect(ribbon()).toBeEmptyDOMElement()
    })

    // A key that is not Enter says nothing at all -- otherwise every keystroke in a box would be a
    // press of Check.
    it('says nothing when the player presses any other key', async () => {
      const { user } = setup()

      await user.type(boxNamed(1), 'SAUCE{Escape}')

      expect(boxNamed(1)).toHaveValue('SAUCE')
      expect(ribbon()).toBeEmptyDOMElement()
    })
  })

  // THE REPEAT MARK, and the case it exists for is real: a player who presses Check twice out of
  // doubt. Saying an identical string twice is an Object.is bail-out -- the DOM text never changes,
  // and role="status" is keyed to a change rather than to a write -- so the second press would be
  // silent, which reads as a broken key.
  //
  // The mark rides the FIRST press here, not the second, and that is not a mistake: the nonce starts
  // at 0 and is incremented before it is used, so message one is odd and message two is even. What
  // the mechanism promises is that two consecutive texts DIFFER, and pinning both by value is what
  // says so. toHaveProperty rather than toHaveTextContent, because a substring match cannot see a
  // zero-width character on the end of the string it just matched.
  describe('a second press on an unchanged board', () => {
    it('says the same verdict in a way the region will announce', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Check' }))
      expect(ribbon()).toHaveProperty('textContent', `${TYPE_FIRST}${REPEAT_MARK}`)

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(ribbon()).toHaveProperty('textContent', TYPE_FIRST)
    })
  })

  describe('once solved', () => {
    // The slot does not move: one position, two names, so nothing on the bench reflows at the exact
    // moment the player is looking at it.
    it('offers Play again in place of Check', () => {
      setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument()
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
    // guard -- and no other test in this file can get there. Every win says four sentences, leaving
    // the nonce even, so the mark is '' anyway and the guard is never consulted. A restored solved
    // board plus one Check makes it odd.
    //
    // Without the guard the ribbon holds a lone zero-width space after the press: invisible, but not
    // empty -- and FloorBar draws `resting` only while the message is '', so the player lands on a
    // fresh board with no line telling them what the game is, and nothing on screen to explain why.
    it('puts the standing line back even when the repeat mark is due', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)
      // Enter rather than the control, because a solved board's control IS `Play again` -- there is
      // no Check to press. A won row is readOnly, and a readOnly input still receives keydown, which
      // is what makes this path reachable at all.
      await user.type(boxNamed(1), '{Enter}')
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
    // and the control it becomes is at the same position under a new name. React keeps a stable
    // element type at a stable position, so the node survives and focus stays on it. A control
    // rebuilt rather than renamed -- two sibling conditionals rather than one ternary -- would drop
    // focus to <body>, from which the next Tab restarts at the top of the page, and nothing else in
    // this file would notice: every other Play again test asserts what happened to the boxes, not to
    // the caret.
    it('keeps focus on the control through Play again', async () => {
      const { user } = setup(themedAnagramsPuzzle, SOLVED_PROGRESS)

      await user.click(screen.getByRole('button', { name: 'Play again' }))

      expect(screen.getByRole('button', { name: 'Check' })).toHaveFocus()
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
      ['fresh', null, 'Check'],
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
    ])('draws the sign row and no rows when %s', (_description, entries) => {
      setup(withEntries(entries))

      expect(screen.getByRole('region', { name: 'Themed Anagrams' })).toBeInTheDocument()
      expect(screen.getByText('Kitchen tools')).toBeInTheDocument()
      expect(screen.getByText('0 of 4 right')).toHaveProperty('textContent', '0 of 4 right')
      expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull()
      expect(screen.queryAllByRole('textbox')).toHaveLength(0)
      expect(screen.queryAllByRole('img')).toHaveLength(0)
    })

    // THE BOARD IS STILL OPERABLE, which is the difference between surviving a malformed pack and
    // going quiet on one. A player who presses Check on a board with no rows gets a sentence rather
    // than nothing, and it is the empty-board sentence: `pending` is four empty drafts, none of
    // which any row is adjudicating.
    it('still answers a press on a board with no rows', async () => {
      const { user } = setup(withEntries(undefined))

      await user.click(screen.getByRole('button', { name: 'Check' }))

      // Substring, the way the other three verdicts are asserted: the ribbon carries the repeat
      // mark on every other message and its parity is not what this row is about.
      expect(ribbon()).toHaveTextContent(TYPE_FIRST)
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
})
