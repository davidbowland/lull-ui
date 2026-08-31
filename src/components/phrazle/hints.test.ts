import { phrazleHints } from './hints'
import { decode, encode } from './progress'
import { phrazlePuzzle } from '@test/__mocks__'
import { PhrazleData, Puzzle } from '@types'

describe('the phrazle hint adapter', () => {
  // TOE HOLD, off the fixture rather than retyped, so this suite and the board's cannot drift on the
  // phrase every assertion in both files is built around.
  const PUZZLE = phrazlePuzzle as Puzzle<unknown>

  // WRITTEN OUT AND NOT COMPUTED, and that is what makes them assertions. Rung 1 draws three of the
  // ten strongest absent letters at random from a source seeded with the puzzle id, so a test that
  // re-ran the chooser to build its expectation would pass on any draw at all -- including one that
  // re-drew on every render, which is the exact failure the seed exists to prevent. These strings
  // are what the shipped seed produces for this id and this phrase.
  const ABSENT_RUNG = 'The phrase has no A, no G, and no S.'
  const PRESENT_RUNG = 'The phrase contains D, H, and L.'
  const WORD_RUNG = 'Word 2 uses these letters, alphabetized: D, H, L, and O.'

  // Every letter of TOE HOLD, spread over three legal guesses. Both letter pools are then empty --
  // the absent pool because these guesses rule out most of the strong letters, the present pool
  // because every letter of the phrase has been met -- which is the state a short ladder needs.
  const GUESSED_EVERYTHING = encode(['HOT HAND', 'OLD HOLE', 'TEA HOLD'])

  // The ladder as a fresh board sees it, and the ONE fixture whose whole point is that a rung is
  // rendered from a frozen record rather than recomputed. Buying is driven through `open` rather
  // than by writing a progress string by hand, so what these rows exercise is the string the adapter
  // actually stores.
  const buy = (steps: number): string => {
    let progress = ''
    for (let step = 0; step < steps; step += 1) {
      // Non-null because every row that calls this buys within the ladder it is standing on, and a
      // `??` here would let a decline pass silently as "no change" -- which is the one thing these
      // rows are trying to tell apart.
      progress = phrazleHints.open(PUZZLE, progress) as string
    }
    return progress
  }

  const texts = (progress: string): string[] => (phrazleHints.ladder(PUZZLE, progress) ?? []).map((hint) => hint.text)

  describe('ladder', () => {
    // THE WHOLE LADDER IN ONE ROW, and the order is the escalation: letters that prune the search,
    // then letters that aim it, then most of a word. The giveaway is last.
    it('folds a fresh board forward into three rungs', () => {
      expect(texts('')).toEqual([ABSENT_RUNG, PRESENT_RUNG, WORD_RUNG])
    })

    // ONE TO THREE, NEVER ALWAYS THREE. Every letter of TOE HOLD has been guessed, so the present
    // pool is empty and that rung has nothing left to say -- and the ladder SHORTENS rather than
    // ending, because the word rung is exactly what still helps a player who knows every letter and
    // not which word each one is in. An earlier version of the rule picked the kind at the spent
    // position and lost the word rung permanently here.
    it('draws a short ladder when a kind has nothing left to say', () => {
      const drawn = texts(GUESSED_EVERYTHING)

      expect(drawn).toHaveLength(2)
      expect(drawn[1]).toEqual(WORD_RUNG)
      expect(drawn).not.toContain(PRESENT_RUNG)
    })

    // THE HINT-FARM DEFENSE, and the row this design most needs. A rung is frozen into the stored
    // record when it is bought and rendered from that record forever after -- so a player cannot buy
    // rung 1, learn something, and watch rung 1 upgrade itself into a better hint. The fixture is
    // chosen so the two answers genuinely differ: on a board with a guess on it the fold picks a
    // different absent draw entirely, and the bought rung stays the one that was paid for.
    it('renders a bought rung from its frozen record however the board moves afterwards', () => {
      const bought = phrazleHints.merge(encode(['HOT HAND']), buy(1))

      expect(texts(bought)[0]).toEqual(ABSENT_RUNG)
      expect(texts(encode(['HOT HAND']))[0]).not.toEqual(ABSENT_RUNG)
    })

    // REPRODUCIBLE, because the source is seeded from the puzzle id. Without it the speculative tail
    // re-draws on every render and the rung a player SEES need not be the rung they BUY.
    it('draws the same speculative rung twice running', () => {
      expect(texts('')).toEqual(texts(''))
    })

    // A pack a player can genuinely be handed: `isValidPuzzle` leaves `data` opaque, so a puzzle
    // whose answer never arrived is a VALID pack with nothing to build a rung out of. Null is what
    // the frame reads as "no bar", which is the same answer a malformed pack ladder gets.
    it.each<[string, unknown]>([
      ['the answer never arrived', {}],
      ['the answer is not a string', { answer: 7 }],
      ['the answer has no words in it', { answer: '' }],
      ['there is no data at all', null],
    ])('has no ladder to give when %s', (_description, data) => {
      expect(phrazleHints.ladder({ ...PUZZLE, data } as Puzzle<unknown>, '')).toBeNull()
    })
  })

  describe('opened', () => {
    it('counts nothing on a board nobody has touched', () => {
      expect(phrazleHints.opened('')).toEqual(0)
    })

    // A LEGACY PAYLOAD READS AS NOTHING BOUGHT, which is what makes this deployable over boards that
    // are already on people's devices. Neither field is present and neither is a state to migrate.
    it('counts nothing on a board stored before the ladder existed', () => {
      expect(phrazleHints.opened('{"guesses":["HOT HAND"]}')).toEqual(0)
    })

    it('counts the steps the stored record says were bought', () => {
      expect(phrazleHints.opened(buy(2))).toEqual(2)
    })
  })

  describe('open', () => {
    // The purchase, at the level the string is stored: one rung in the record, the count beside it,
    // and the guesses untouched.
    it('freezes the rung it sold into the board’s own progress', () => {
      expect(decode(buy(1), phrazlePuzzle.data.answer)).toStrictEqual({
        guesses: [],
        hints: [{ kind: 'absent', letters: 'AGS' }],
        opened: 1,
      })
    })

    it('sells the rungs in the order the ladder draws them', () => {
      expect(texts(buy(3)).slice(0, phrazleHints.opened(buy(3)))).toEqual([ABSENT_RUNG, PRESENT_RUNG, WORD_RUNG])
    })

    // THE STEP PAST THE LAST RUNG IS THE ANSWER, and it is the reason `opened` is stored rather than
    // derived. HintBar reaches "Show answer" only when the count EXCEEDS the ladder's length, so a
    // count read off a three-rung list could never reach it -- the reveal would be unreachable on
    // this bench. The count moves and no fourth rung is invented.
    it('sells one step past the last rung, and appends no rung for it', () => {
      const revealed = decode(buy(4), phrazlePuzzle.data.answer)

      expect(revealed.opened).toEqual(4)
      expect(revealed.hints).toHaveLength(3)
    })

    it('declines once the answer is out', () => {
      expect(phrazleHints.open(PUZZLE, buy(4))).toBeNull()
    })

    // THE TAIL MOVES AND THE REVEAL MUST NOT BE MEASURED AGAINST IT. `fold` is speculative, so its
    // length tracks the board; the committed rung list does not. This board bought a SHORT ladder --
    // two rungs and the reveal -- and then lost its guesses, which `decode` really does truncate when
    // a refetched pack's answer no longer fits the shape they were made against. The pools refill,
    // the fold now finds a third rung, and an `open` measuring the reveal against that tail reads the
    // board as still owing one: it sells the answer a second time and writes an `opened` of
    // `hints.length + 2`, which `decode` refuses outright -- so the cost is the player's whole ladder
    // rather than one bad press.
    it('declines after the reveal even when the speculative tail has grown', () => {
      const short = [0, 1, 2].reduce(
        (progress: string) => phrazleHints.open(PUZZLE, progress) as string,
        GUESSED_EVERYTHING,
      )
      const regrown = JSON.stringify({ ...JSON.parse(short), guesses: [] })

      expect(phrazleHints.opened(regrown)).toEqual(3)
      expect(phrazleHints.open(PUZZLE, regrown)).toBeNull()
    })

    // A SHORT LADDER ENDS EARLIER, and the reveal still closes it. Two rungs, then the answer, then
    // nothing -- so a ladder that shortened because a pool ran dry does not take the reveal with it.
    it('reaches the answer on a short ladder too', () => {
      const spent = [0, 1, 2].reduce(
        (progress: string) => phrazleHints.open(PUZZLE, progress) as string,
        GUESSED_EVERYTHING,
      )

      expect(phrazleHints.opened(spent)).toEqual(3)
      expect(phrazleHints.open(PUZZLE, spent)).toBeNull()
    })

    // Null is a DECLINE and the count stays where it is, which is what HintBar documents for a
    // controlled owner that says no. A pack with no answer has no rung to sell and no bar drawn over
    // it either, so this guards a caller rather than a player.
    it('declines on a puzzle it could not build a ladder for', () => {
      expect(phrazleHints.open({ ...PUZZLE, data: {} } as Puzzle<unknown>, '')).toBeNull()
    })
  })

  // THE ONE-WRITER RULE. The board writes `{"guesses":[...]}` and knows nothing of the two hint
  // fields, so every board write is re-joined with the tail that is currently stored. Without this
  // the board's very next write erases a rung the player paid for -- silently, with no board at
  // fault for it, because a board that has never heard of hints is right to write only its own half.
  describe('merge', () => {
    it('keeps a bought rung when the board writes its own portion afterwards', () => {
      const merged = phrazleHints.merge(encode(['HOT HAND']), buy(1))

      expect(decode(merged, phrazlePuzzle.data.answer)).toStrictEqual({
        guesses: ['HOT HAND'],
        hints: [{ kind: 'absent', letters: 'AGS' }],
        opened: 1,
      })
    })

    // THE OTHER HALF, and the half a merge that simply refused board writes would fail: the board's
    // portion is the board's, and the adapter copies it rather than inventing it.
    it('keeps what the board wrote', () => {
      expect(
        decode(phrazleHints.merge(encode(['HOT HAND', 'OLD HOLE']), buy(2)), phrazlePuzzle.data.answer).guesses,
      ).toEqual(['HOT HAND', 'OLD HOLE'])
    })

    it('hands back the board’s own string when nothing is bought', () => {
      expect(phrazleHints.merge('{"guesses":["HOT HAND"]}', '')).toEqual('{"guesses":["HOT HAND"]}')
    })

    // PLAY AGAIN, and it is the one board write an adapter must not extend. Every board spells "there
    // is nothing on this board" as '', the shell reads that as no progress, and re-attaching a ladder
    // to it would hand a player back rungs they threw away on a board that no longer has them.
    it('answers a board that started over with nothing at all', () => {
      expect(phrazleHints.merge('', buy(3))).toEqual('')
    })
  })

  // TOTAL, in the sense the builders are total: no input throws. This adapter runs inside render --
  // the frame asks for the ladder and the count on every pass -- and a throw there lands in
  // ErrorBoundary, which answers by replacing the whole app with "Lull got stuck". A caller with a
  // try/catch is not the defense; a function with no throw in it is.
  describe('what it refuses to throw on', () => {
    beforeAll(() => {
      console.error = jest.fn()
    })

    it.each<[string, string]>([
      ['nothing at all', ''],
      ['a value that is not JSON', '{'],
      ['a JSON null', 'null'],
      ['an array', '[]'],
      ['a guess list that is a string', '{"guesses":"HOT HAND"}'],
      ['a count no ladder could justify', '{"guesses":[],"opened":9,"hints":[]}'],
      ['a very long run of letters', 'a'.repeat(2000)],
    ])('reads a stored board of %s without throwing', (_description, progress) => {
      expect(() => {
        phrazleHints.ladder(PUZZLE, progress)
        phrazleHints.open(PUZZLE, progress)
        phrazleHints.opened(progress)
        phrazleHints.merge(progress, progress)
      }).not.toThrow()
    })

    it.each<[string, unknown]>([
      ['no fields at all', {}],
      ['no data at all', null],
      ['an answer that is a number', { answer: 7 }],
      ['an answer of nothing but spaces', { answer: '   ' }],
      ['a perfectly good phrase', { answer: 'TOE HOLD' }],
    ])('builds a ladder over a pack carrying %s without throwing', (_description, data) => {
      const puzzle = { ...PUZZLE, data } as Puzzle<PhrazleData>

      expect(() => {
        phrazleHints.ladder(puzzle, '')
        phrazleHints.open(puzzle, '')
      }).not.toThrow()
    })
  })
})
