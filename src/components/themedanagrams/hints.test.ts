import { themedAnagramsHints } from './hints'
import { decode, encode, Guesses } from './progress'
import { themedAnagramsPuzzle } from '@test/__mocks__'
import { Puzzle } from '@types'

describe('the themed anagrams hint adapter', () => {
  // KETTLE, SAUCEPAN, SKILLET, SPATULA -- off the fixture rather than retyped, so this suite and the
  // board's cannot drift on the four words both are built around. Lengths run 6, 8, 7, 7, which is
  // deliberately not sorted: the ranking is longest-first with ties by index, and a fixture already
  // in that order could not tell a rank from a passthrough.
  const PUZZLE = themedAnagramsPuzzle as Puzzle<unknown>

  // WRITTEN OUT AND NOT COMPUTED, which is what makes them assertions rather than a second copy of
  // the rule. The three rungs escalate over three DIFFERENT rows -- the longest unsolved entry, then
  // one the ladder has not used, then a third -- and the ordinals are 1-based over 0-based indices,
  // which is the pairing a computed expectation would silently agree with however it was wrong.
  const INITIAL_RUNG = 'The 2nd answer starts with S.'
  const BOOKENDS_RUNG = 'The 3rd answer starts with S and ends with T.'
  const PREFIX_RUNG = 'The 4th answer starts with SPA.'

  // Every row right, which is the state that used to empty the fold and take the hint bar with it.
  const SOLVED_BOARD = 'KETTLE\nSAUCEPAN\nSKILLET\nSPATULA'

  const draft = (...guesses: string[]): string =>
    encode([guesses[0] ?? '', guesses[1] ?? '', guesses[2] ?? '', guesses[3] ?? ''] as Guesses)

  // Buying driven through `open` rather than by writing a progress string by hand, so what these
  // rows exercise is the string the adapter actually stores.
  const buy = (steps: number, from = ''): string => {
    let progress = from
    for (let step = 0; step < steps; step += 1) {
      // Non-null because every row that calls this buys within the ladder it is standing on, and a
      // `??` here would let a decline pass silently as "no change" -- the one thing these rows are
      // trying to tell apart.
      progress = themedAnagramsHints.open(PUZZLE, progress) as string
    }
    return progress
  }

  const texts = (progress: string): string[] =>
    (themedAnagramsHints.ladder(PUZZLE, progress) ?? []).map((hint) => hint.text)

  describe('ladder', () => {
    // THE WHOLE LADDER IN ONE ROW, and the order is the escalation: one letter, then two, then three
    // -- over three different rows, so three of the four light up rather than one being said three
    // ways. The giveaway is last.
    it('folds a fresh board forward into three rungs', () => {
      expect(texts('')).toEqual([INITIAL_RUNG, BOOKENDS_RUNG, PREFIX_RUNG])
    })

    // THE WHOLE POINT OF COMPUTING THE LADDER AT PLAY TIME. The old ladder ranked its three targets
    // by answer length once, at generate time, so a player who had already solved the longest entry
    // still got a rung spent on it. SAUCEPAN is the longest and is now on the board, so rung 1 moves
    // to the longest entry the player still owes.
    it('does not aim a rung at a row the player has already got', () => {
      expect(texts(draft('', 'SAUCEPAN'))[0]).toEqual('The 3rd answer starts with S.')
    })

    // THE HINT-FARM DEFENSE, and the row this design most needs. A rung is frozen into the stored
    // record when it is bought and rendered from that record forever after, so a player cannot buy
    // rung 1, learn something, and watch rung 1 upgrade itself into a better hint. The fixture is
    // chosen so the two answers genuinely differ: solving SAUCEPAN moves a fresh fold's rung 1 to
    // another row, and the bought rung stays the one that was paid for.
    it('renders a bought rung from its frozen record however the board moves afterwards', () => {
      const bought = themedAnagramsHints.merge(draft('', 'SAUCEPAN'), buy(1))

      expect(texts(bought)[0]).toEqual(INITIAL_RUNG)
      expect(texts(draft('', 'SAUCEPAN'))[0]).not.toEqual(INITIAL_RUNG)
    })

    // Nothing here draws, so the tail is stable for a given board with no seed to carry -- every
    // choice the rule makes is a total order over answer length and index.
    it('draws the same speculative rung twice running', () => {
      expect(texts('')).toEqual(texts(''))
    })

    // A WON BOARD KEEPS ITS BAND. Every row is right, so the fold has nothing left to choose -- and
    // an empty ladder is null, which unmounts a 60px band on the winning keystroke and re-lays the
    // board out underneath it. So the ladder a won board shows is the one a fresh board would have
    // shown. Nothing is displayed unless the player buys it, and the answer they would be buying it
    // about is already in the box beside it.
    it('keeps a ladder to draw once all four are solved', () => {
      expect(texts(SOLVED_BOARD)).toEqual([INITIAL_RUNG, BOOKENDS_RUNG, PREFIX_RUNG])
    })

    // THE TAIL IS NEVER SHOWN, and this is the row that makes that sentence true rather than nearly
    // true. `opened` is one PAST the bought rungs once the reveal is taken, HintBar draws
    // `slice(0, opened)`, and the tail regrows the moment a won row is cleared -- so the ladder had
    // to stop growing at the rungs that were paid for. Built by winning every row with one rung
    // bought, taking the reveal on that one-rung ladder, and then emptying the board again.
    it('stops growing its tail once the reveal is bought', () => {
      const revealed = themedAnagramsHints.open(PUZZLE, themedAnagramsHints.merge(SOLVED_BOARD, buy(1))) as string
      const cleared = themedAnagramsHints.merge('', revealed)

      expect(themedAnagramsHints.opened(cleared)).toEqual(2)
      expect(texts(cleared)).toEqual([INITIAL_RUNG])
    })

    // A pack a player can genuinely be handed: `isValidPuzzle` leaves `data` opaque, so a puzzle
    // whose entries never arrived -- or arrived at the wrong length, which this board refuses to
    // draw -- is a VALID pack with nothing to build a rung out of.
    it.each<[string, unknown]>([
      ['the entries never arrived', { theme: 'Kitchen tools' }],
      ['the entries are not a list', { entries: 'KETTLE' }],
      ['there are three of them', { entries: themedAnagramsPuzzle.data.entries.slice(0, 3) }],
      ['there is no data at all', null],
    ])('has no ladder to give when %s', (_description, data) => {
      expect(themedAnagramsHints.ladder({ ...PUZZLE, data } as Puzzle<unknown>, '')).toBeNull()
    })
  })

  describe('opened', () => {
    it('counts nothing on a board nobody has touched', () => {
      expect(themedAnagramsHints.opened('')).toEqual(0)
    })

    // A LEGACY PAYLOAD READS AS NOTHING BOUGHT, which is what makes this deployable over boards that
    // are already on people's devices. There is no field, and no field is not a state to migrate.
    it('counts nothing on a board stored before the ladder existed', () => {
      expect(themedAnagramsHints.opened(draft('KETTLE'))).toEqual(0)
    })

    it('counts the steps the stored record says were bought', () => {
      expect(themedAnagramsHints.opened(buy(2))).toEqual(2)
    })
  })

  describe('open', () => {
    // The purchase, at the level the string is stored: the rung frozen into the record, the count
    // beside it, and the four drafts untouched. A BLANK BOARD WITH A RUNG SPENT is `|1|I1`, which is
    // exactly the state the field exists to represent and emphatically not ''.
    it('freezes the rung it sold into the board’s own progress', () => {
      expect(buy(1)).toEqual('|1|I1')
      expect(decode(buy(1))).toStrictEqual({
        guesses: ['', '', '', ''],
        hints: [{ entryIndex: 1, kind: 'initial' }],
        opened: 1,
      })
    })

    it('sells the rungs in the order the ladder draws them', () => {
      expect(texts(buy(3))).toEqual([INITIAL_RUNG, BOOKENDS_RUNG, PREFIX_RUNG])
    })

    // THE INPUT BOX IS UNTOUCHED, which is this bench's whole difference from cryptogram's. A rung
    // here changes the DISPLAY -- letters pinned into their true positions in the scramble -- and
    // never what the player typed, so a purchase leaves all four drafts exactly as they were.
    it('writes no draft of its own', () => {
      expect(decode(buy(3, draft('KET'))).guesses).toEqual(['KET', '', '', ''])
    })

    // THE STEP PAST THE LAST RUNG IS THE ANSWER, and it is the reason `opened` is stored rather than
    // derived. HintBar reaches "Show answer" only when the count EXCEEDS the ladder's length, so a
    // count read off a three-rung list could never reach it. The count moves and no fourth rung is
    // invented.
    it('sells one step past the last rung, and appends no rung for it', () => {
      const revealed = decode(buy(4))

      expect(revealed.opened).toEqual(4)
      expect(revealed.hints).toHaveLength(3)
    })

    it('declines once the answer is out', () => {
      expect(themedAnagramsHints.open(PUZZLE, buy(4))).toBeNull()
    })

    // Null is a DECLINE and the count stays where it is, which is what HintBar documents for a
    // controlled owner that says no. A pack this board would refuse to draw has no rung to sell and
    // no bar drawn over it either, so this guards a caller rather than a player.
    it('declines on a puzzle it could not build a ladder for', () => {
      expect(themedAnagramsHints.open({ ...PUZZLE, data: {} } as Puzzle<unknown>, '')).toBeNull()
    })
  })

  // THE ONE-WRITER RULE, and the regression test for the bug it exists to make unrepresentable. The
  // board writes four newline-joined drafts and knows nothing of the two hint fields, so every board
  // write is re-joined with the tail that is currently stored. Without this the board's very next
  // keystroke erases a rung the player paid for -- silently, with no board at fault, because a board
  // that has never heard of hints is right to write only its own half.
  describe('merge', () => {
    it('keeps a bought rung when the board writes its own portion afterwards', () => {
      const merged = themedAnagramsHints.merge(draft('KET'), buy(1))

      expect(decode(merged)).toStrictEqual({
        guesses: ['KET', '', '', ''],
        hints: [{ entryIndex: 1, kind: 'initial' }],
        opened: 1,
      })
    })

    // THE OTHER HALF, and the half a merge that simply refused board writes would fail: the drafts
    // are the board's, and the adapter copies them rather than inventing them.
    it('keeps what the board wrote', () => {
      expect(decode(themedAnagramsHints.merge(draft('KETTLE', 'SAU'), buy(2))).guesses).toEqual([
        'KETTLE',
        'SAU',
        '',
        '',
      ])
    })

    it('hands back the board’s own string when nothing is bought', () => {
      expect(themedAnagramsHints.merge(draft('KETTLE'), '')).toEqual(draft('KETTLE'))
    })

    // '' HAS TWO PRODUCERS ON THIS BENCH, and the row that used to stand here asserted the loss as
    // though it had one. `playAgain` writes it, and so does `change` -- `encode` returns '' whenever
    // all four drafts are empty and `change` calls `encode` on every keystroke. So this write cannot
    // be read as "start over" without charging a player their rungs for a backspace, which is the
    // trap CLAUDE.md documents. The tail survives, and PuzzleFrame's `onReset` is what tells the two
    // apart -- asserted at the frame, where the signal is, rather than here, where it is not.
    it('keeps a bought rung when the board writes its own empty portion', () => {
      const merged = themedAnagramsHints.merge('', buy(2))

      expect(decode(merged)).toStrictEqual({
        guesses: ['', '', '', ''],
        hints: [
          { entryIndex: 1, kind: 'initial' },
          { entryIndex: 2, kind: 'bookends' },
        ],
        opened: 2,
      })
    })

    // THE PATH THAT REACHES IT, driven through the board's own codec rather than by handing `merge`
    // a bare ''. Type a draft, buy two rungs, backspace to empty: the rungs, the count and the pinned
    // letters are all still there.
    it('survives a draft typed, hinted and then backspaced away', () => {
      const typed = themedAnagramsHints.merge(draft('KET'), buy(2))
      const emptied = themedAnagramsHints.merge(draft(''), typed)

      expect(themedAnagramsHints.opened(emptied)).toEqual(2)
      expect(texts(emptied)).toEqual([INITIAL_RUNG, BOOKENDS_RUNG, PREFIX_RUNG])
    })
  })

  // TOTAL, in the sense the builders are total: no input throws. This adapter runs inside render --
  // the frame asks for the ladder and the count on every pass -- and a throw there lands in
  // ErrorBoundary, which answers by replacing the whole app with "Lull got stuck". A caller with a
  // try/catch is not the defense; a function with no throw in it is.
  describe('what it refuses to throw on', () => {
    it.each<[string, string]>([
      ['nothing at all', ''],
      ['a bare board with no ladder', 'a\nb\nc\nd'],
      ['a separator and nothing after it', 'a\nb\nc\nd|'],
      ['a count no ladder could justify', 'a\nb\nc\nd|9|I1'],
      ['a rung of an unknown kind', 'a\nb\nc\nd|1|??'],
      ['a very long run of letters', 'a'.repeat(2000)],
      ['a very long run of separators', '|'.repeat(2000)],
    ])('reads a stored board of %s without throwing', (_description, progress) => {
      expect(() => {
        themedAnagramsHints.ladder(PUZZLE, progress)
        themedAnagramsHints.open(PUZZLE, progress)
        themedAnagramsHints.opened(progress)
        themedAnagramsHints.merge(progress, progress)
      }).not.toThrow()
    })

    it.each<[string, unknown]>([
      ['no fields at all', {}],
      ['no data at all', null],
      ['an entry that is null', { entries: [null, null, null, null] }],
      ['an entry whose answer is a number', { entries: [{ answer: 7 }, { answer: 7 }, { answer: 7 }, { answer: 7 }] }],
      ['four blank answers', { entries: [{ answer: '' }, { answer: '' }, { answer: '' }, { answer: '' }] }],
      ['a perfectly good puzzle', themedAnagramsPuzzle.data],
    ])('builds a ladder over a pack carrying %s without throwing', (_description, data) => {
      const puzzle = { ...PUZZLE, data } as Puzzle<unknown>

      expect(() => {
        themedAnagramsHints.ladder(puzzle, '')
        themedAnagramsHints.open(puzzle, '')
      }).not.toThrow()
    })
  })
})
