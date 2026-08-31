import { cryptogramHints, revealedLetters } from './hints'
import { decode, encode } from './mapping'
import { cryptogramPuzzle } from '@test/__mocks__'
import { Puzzle } from '@types'

describe('the cryptogram hint adapter', () => {
  // VZE VZE ZEV under { E: E, V: A, Z: T } spells ATE ATE TEA, off the fixture rather than retyped
  // so this suite and the board's cannot drift on the phrase both are built around.
  const PUZZLE = cryptogramPuzzle as Puzzle<unknown>
  const CIPHERTEXT = cryptogramPuzzle.data.ciphertext
  const DATA = { answer: cryptogramPuzzle.data.answer, ciphertext: CIPHERTEXT }

  // WRITTEN OUT AND NOT COMPUTED, which is what makes them assertions rather than a second copy of
  // the rule. Every cipher letter of this fixture appears three times, so the low percentile lands on
  // the alphabetically first candidate and the walk-up finds nothing higher and takes the last -- and
  // the row that would catch a percentile silently becoming an index is the row that spells the
  // answers out.
  const LOW_RUNG = 'Every E is an E.'
  const HIGH_RUNG = 'Every Z is a T.'
  const WORD_RUNG = 'One of the words is ATE.'

  // Every cipher letter mapped correctly, which is the state that used to empty the fold and take the
  // hint bar with it.
  const SOLVED_BOARD = encode({ E: 'E', V: 'A', Z: 'T' })

  // Buying driven through `open` rather than by writing a progress string by hand, so what these
  // rows exercise is the string the adapter actually stores.
  const buy = (steps: number, from = ''): string => {
    let progress = from
    for (let step = 0; step < steps; step += 1) {
      // Non-null because every row that calls this buys within the ladder it is standing on, and a
      // `??` here would let a decline pass silently as "no change" -- the one thing these rows are
      // trying to tell apart.
      progress = cryptogramHints.open(PUZZLE, progress) as string
    }
    return progress
  }

  const texts = (progress: string): string[] =>
    (cryptogramHints.ladder(PUZZLE, progress) ?? []).map((hint) => hint.text)

  describe('ladder', () => {
    // THE WHOLE LADDER IN ONE ROW, and the order is the escalation: a letter low in this puzzle's own
    // frequency order, a letter high in it, then a whole word. The giveaway is last.
    it('folds a fresh board forward into three rungs', () => {
      expect(texts('')).toEqual([LOW_RUNG, HIGH_RUNG, WORD_RUNG])
    })

    // THE HINT-FARM DEFENSE, and the row this design most needs. A rung is frozen into the stored
    // record when it is bought and rendered from that record forever after, so a player cannot buy
    // rung 1, learn something, and watch rung 1 upgrade itself into a better hint. The fixture is
    // chosen so the two answers genuinely differ: with E correctly mapped, a fresh fold picks Z as
    // its low rung, and the bought rung stays the one that was paid for.
    it('renders a bought rung from its frozen record however the board moves afterwards', () => {
      const bought = cryptogramHints.merge(encode({ E: 'E' }), buy(1))

      expect(texts(bought)[0]).toEqual(LOW_RUNG)
      expect(texts(encode({ E: 'E' }))[0]).not.toEqual(LOW_RUNG)
    })

    // Nothing here draws, so the tail is stable for a given board with no seed to carry -- every
    // choice the rule makes is a total order over the ciphertext's own letter counts.
    it('draws the same speculative rung twice running', () => {
      expect(texts('')).toEqual(texts(''))
    })

    // A SOLVED BOARD KEEPS ITS BAND. Every cipher letter is mapped correctly, so the fold has no
    // candidate and no word left to name -- and an empty ladder is null, which unmounts a 60px band
    // on the winning keystroke and re-lays the grid out underneath it. Worse here than anywhere else:
    // an unlocked square can still be cleared, so the band flickered as a player toggled the last
    // letter. So the ladder a solved board shows is the one a fresh board would have shown, and
    // nothing of it is displayed unless the player buys it.
    it('keeps a ladder to draw on a board that is already solved', () => {
      expect(texts(SOLVED_BOARD)).toEqual([LOW_RUNG, HIGH_RUNG, WORD_RUNG])
    })

    // THE TAIL IS NEVER SHOWN, and this is the row that makes that sentence true rather than nearly
    // true. `opened` is one PAST the bought rungs once the reveal is taken, HintBar draws
    // `slice(0, opened)`, and the tail regrows the moment a player un-maps a letter they had right --
    // so the ladder had to stop growing at the rungs that were paid for. Built by solving the board
    // with one rung bought, taking the reveal on that one-rung ladder, and then clearing a square.
    it('stops growing its tail once the reveal is bought', () => {
      const revealed = cryptogramHints.open(PUZZLE, cryptogramHints.merge(SOLVED_BOARD, buy(1))) as string
      const cleared = cryptogramHints.merge(encode({ E: 'E' }), revealed)

      expect(cryptogramHints.opened(cleared)).toEqual(2)
      expect(texts(cleared)).toEqual([LOW_RUNG])
    })

    // A pack a player can genuinely be handed: `isValidPuzzle` leaves `data` opaque, so a puzzle
    // whose ciphertext never arrived is a VALID pack with nothing to build a rung out of. Null is
    // what the frame reads as "no bar", the same answer a malformed pack ladder gets.
    it.each<[string, unknown]>([
      ['the ciphertext never arrived', { answer: 'Ate ate tea' }],
      ['the ciphertext is not a string', { answer: 'Ate ate tea', ciphertext: 7 }],
      ['the ciphertext has no letters in it', { answer: 'Ate ate tea', ciphertext: '   ' }],
      ['there is no data at all', null],
    ])('has no ladder to give when %s', (_description, data) => {
      expect(cryptogramHints.ladder({ ...PUZZLE, data } as Puzzle<unknown>, '')).toBeNull()
    })
  })

  describe('opened', () => {
    it('counts nothing on a board nobody has touched', () => {
      expect(cryptogramHints.opened('')).toEqual(0)
    })

    // A LEGACY PAYLOAD READS AS NOTHING BOUGHT, which is what makes this deployable over boards that
    // are already on people's devices. There is no field, and no field is not a state to migrate.
    it('counts nothing on a board stored before the ladder existed', () => {
      expect(cryptogramHints.opened('VAZT')).toEqual(0)
    })

    it('counts the steps the stored record says were bought', () => {
      expect(cryptogramHints.opened(buy(2))).toEqual(2)
    })
  })

  describe('open', () => {
    // The purchase, at the level the string is stored: the rung frozen into the record, the count
    // beside it, and -- this bench's whole difference from Phrazle's -- the revealed letter written
    // into the board.
    it('freezes the rung it sold and writes its letter onto the board', () => {
      expect(decode(buy(1), CIPHERTEXT)).toStrictEqual({
        hints: [{ cipher: 'E', kind: 'letter' }],
        mapping: { E: 'E' },
        opened: 1,
      })
    })

    it('sells the rungs in the order the ladder draws them', () => {
      expect(texts(buy(3))).toEqual([LOW_RUNG, HIGH_RUNG, WORD_RUNG])
    })

    // The word rung locks every distinct cipher letter in the word it names, so one purchase writes
    // three squares. That is the escalation made concrete -- a rare letter opens few squares, a
    // common one opens many, a word opens a word.
    it('writes every letter of the word rung onto the board', () => {
      expect(decode(buy(3), CIPHERTEXT).mapping).toEqual({ E: 'E', V: 'A', Z: 'T' })
    })

    // IT STEALS, and only from an unlocked square. A player who guessed A onto Z buys the rung that
    // reveals V is the A: the wrong guess is released rather than left to contradict the square the
    // rung just filled, which would be two squares claiming one letter.
    it('releases a wrong guess sitting on a letter the rung reveals', () => {
      const bought = cryptogramHints.open(PUZZLE, `${encode({ Z: 'A' })}|2|LE,LZ`) as string

      expect(decode(bought, CIPHERTEXT).mapping).toEqual({ E: 'E', V: 'A', Z: 'T' })
    })

    // THE STEP PAST THE LAST RUNG IS THE ANSWER, and it is the reason `opened` is stored rather than
    // derived. HintBar reaches "Show answer" only when the count EXCEEDS the ladder's length, so a
    // count read off a three-rung list could never reach it. The count moves, no fourth rung is
    // invented, and no square is touched.
    it('sells one step past the last rung, and appends no rung for it', () => {
      const revealed = decode(buy(4), CIPHERTEXT)

      expect(revealed.opened).toEqual(4)
      expect(revealed.hints).toHaveLength(3)
      expect(revealed.mapping).toEqual(decode(buy(3), CIPHERTEXT).mapping)
    })

    it('declines once the answer is out', () => {
      expect(cryptogramHints.open(PUZZLE, buy(4))).toBeNull()
    })

    // Null is a DECLINE and the count stays where it is, which is what HintBar documents for a
    // controlled owner that says no. A pack with no ciphertext has no rung to sell and no bar drawn
    // over it either, so this guards a caller rather than a player.
    it('declines on a puzzle it could not build a ladder for', () => {
      expect(cryptogramHints.open({ ...PUZZLE, data: {} } as Puzzle<unknown>, '')).toBeNull()
    })
  })

  // THE ONE-WRITER RULE, and the regression test for the bug it exists to make unrepresentable. The
  // board writes `<pairs>` and knows nothing of the two hint fields, so every board write is re-joined
  // with the tail that is currently stored. Without this the board's very next tap erases a rung the
  // player paid for -- silently, with no board at fault, because a board that has never heard of
  // hints is right to write only its own half.
  describe('merge', () => {
    it('keeps a bought rung when the board writes its own portion afterwards', () => {
      const merged = cryptogramHints.merge(encode({ E: 'E', V: 'I' }), buy(1))

      expect(decode(merged, CIPHERTEXT)).toStrictEqual({
        hints: [{ cipher: 'E', kind: 'letter' }],
        mapping: { E: 'E', V: 'I' },
        opened: 1,
      })
    })

    // THE OTHER HALF, and the half a merge that simply refused board writes would fail: the board's
    // portion is the board's, and the adapter copies it rather than inventing it.
    it('keeps what the board wrote', () => {
      expect(decode(cryptogramHints.merge(encode({ V: 'I' }), buy(2)), CIPHERTEXT).mapping).toEqual({ V: 'I' })
    })

    it('hands back the board’s own string when nothing is bought', () => {
      expect(cryptogramHints.merge('VAZT', '')).toEqual('VAZT')
    })

    // '' IS EXTENDED LIKE ANY OTHER BOARD WRITE. This bench has no Play again and raises `onReset`
    // nowhere, so the only writer of '' is `encode({})` when the last square comes off -- which is a
    // player clearing their board, not throwing away a purchase. It is all but unreachable with a
    // rung bought, because a rung locks the squares it fills and a locked square cannot be cleared;
    // the exception is a rung naming a cipher letter the answer never covered, which locks a square
    // carrying nothing. Answering '' with '' would have thrown the ladder away there, and it would
    // have made the sentence all three adapters share untrue on the one bench that reaches it daily.
    it('extends a board write of nothing at all', () => {
      expect(cryptogramHints.opened(cryptogramHints.merge('', buy(3)))).toEqual(3)
      expect(decode(cryptogramHints.merge('', buy(3)), CIPHERTEXT).mapping).toEqual({})
    })
  })

  describe('revealedLetters', () => {
    it('gives back nothing on a board with no rungs bought', () => {
      expect(revealedLetters(DATA, [])).toEqual({})
    })

    it('gives back the true letter a letter rung handed over', () => {
      expect(revealedLetters(DATA, [{ cipher: 'Z', kind: 'letter' }])).toEqual({ Z: 'T' })
    })

    it('gives back every distinct letter of the word a word rung named', () => {
      expect(revealedLetters(DATA, [{ index: 0, kind: 'word' }])).toEqual({ E: 'E', V: 'A', Z: 'T' })
    })

    // A pack whose answer is shorter than its ciphertext leaves some cipher letters with no true
    // letter at all -- `trueMapping` aligns the two letter streams and stops at the shorter. Those
    // squares carry nothing, which is the honest rendering of a rung that revealed a letter the pack
    // never shipped, and the board still LOCKS them so it does not claim they can be filled in.
    it('gives back nothing for a cipher letter the answer never reached', () => {
      expect(revealedLetters({ answer: 'A', ciphertext: 'VZE' }, [{ index: 0, kind: 'word' }])).toEqual({ V: 'A' })
    })
  })

  // TOTAL, in the sense the builders are total: no input throws. This adapter runs inside render --
  // the frame asks for the ladder and the count on every pass -- and a throw there lands in
  // ErrorBoundary, which answers by replacing the whole app with "Lull got stuck". A caller with a
  // try/catch is not the defense; a function with no throw in it is.
  describe('what it refuses to throw on', () => {
    it.each<[string, string]>([
      ['nothing at all', ''],
      ['a bare board with no ladder', 'VAZT'],
      ['a separator and nothing after it', 'VAZT|'],
      ['a count no ladder could justify', 'VAZT|9|LE'],
      ['a rung of an unknown kind', 'VAZT|1|??'],
      ['a word rung naming a word this phrase has not got', 'VAZT|1|W9'],
      ['a very long run of letters', 'A'.repeat(2000)],
      ['a very long run of separators', '|'.repeat(2000)],
    ])('reads a stored board of %s without throwing', (_description, progress) => {
      expect(() => {
        cryptogramHints.ladder(PUZZLE, progress)
        cryptogramHints.open(PUZZLE, progress)
        cryptogramHints.opened(progress)
        cryptogramHints.merge(progress, progress)
      }).not.toThrow()
    })

    it.each<[string, unknown]>([
      ['no fields at all', {}],
      ['no data at all', null],
      ['a ciphertext that is a number', { answer: 'Ate ate tea', ciphertext: 7 }],
      ['an answer shorter than its ciphertext', { answer: 'A', ciphertext: 'VZE VZE ZEV' }],
      ['a perfectly good phrase', { answer: 'Ate ate tea', ciphertext: 'VZE VZE ZEV' }],
    ])('builds a ladder over a pack carrying %s without throwing', (_description, data) => {
      const puzzle = { ...PUZZLE, data } as Puzzle<unknown>

      expect(() => {
        cryptogramHints.ladder(puzzle, '')
        cryptogramHints.open(puzzle, '')
      }).not.toThrow()
    })
  })
})
