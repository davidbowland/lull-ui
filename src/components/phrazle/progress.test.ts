import { splitPhrase } from '@rules/is-valid-guess'
import { markGuess } from '@rules/mark-guess'

import { decode, encode } from './progress'
import { phrazlePuzzle } from '@test/__mocks__'

describe('phrazle progress', () => {
  // Read off the fixture rather than retyped, so this suite and the board's suite cannot drift on
  // the one string every assertion in both files is built around.
  const ANSWER = phrazlePuzzle.data.answer
  const EMPTY = { guesses: [] }
  // The codec's storage ceiling, retyped rather than imported: MAX_STORED is module-private, and a
  // test that imported it would assert `slice(-n)` against its own `n` and pass at any value.
  const MAX_STORED = 25

  beforeAll(() => {
    console.error = jest.fn()
  })

  describe('encode', () => {
    it('writes the guesses as JSON', () => {
      expect(encode(['HOT HAND'])).toEqual('{"guesses":["HOT HAND"]}')
    })

    // BOTH DIRECTIONS TRIM, so this never writes rows decode will discard on the next load. In one
    // direction only, the key grows without bound for a history whose front is thrown away at every
    // read -- bytes paid on every single guess to store rows nothing will ever restore.
    it('writes no more than it will read back', () => {
      const written = JSON.parse(encode(Array.from({ length: 40 }, () => 'HOT HAND'))) as { guesses: string[] }

      expect(written.guesses).toHaveLength(MAX_STORED)
    })

    // CANONICAL FORM ON THE WAY IN, through the SAME splitter the guess was validated with. Storing
    // raw keystrokes instead would make a resumed board depend on a normalization rule that is
    // allowed to change, which is the thing PhrazleProgress exists to prevent. The fixture carries a
    // leading space, a trailing space, a run of interior spaces and lowercase, because each one is a
    // separate plausible omission and any single-fault fixture would survive three of them.
    it('canonicalizes what it stores', () => {
      expect(encode(['  hot   hand '])).toEqual('{"guesses":["HOT HAND"]}')
    })

    it('keeps the guesses in the order they were made', () => {
      expect(encode(['HOT HAND', 'OLD HOLE'])).toEqual('{"guesses":["HOT HAND","OLD HOLE"]}')
    })
  })

  describe('decode', () => {
    it('reads one guess back', () => {
      expect(decode('{"guesses":["HOT HAND"]}', ANSWER)).toEqual({ guesses: ['HOT HAND'] })
    })

    // Canonicalized on the way OUT as well as on the way in, so a board restored from a key someone
    // hand-edited paints uppercase tiles and hands markGuess canonical words. The two directions
    // are separate assertions because encode is not the only writer a localStorage key can have.
    it('canonicalizes what it reads back', () => {
      expect(decode('{"guesses":["hot   hand"]}', ANSWER)).toEqual({ guesses: ['HOT HAND'] })
    })

    // ONE ROW PER GUARD. `null` and `''` are the shell's two ways of saying "nothing stored" and
    // reach the first clause; `'{'` is the only row that reaches the try/catch, because every other
    // string here parses; `'null'`, `'"HOT HAND"'` and `'[]'` parse to a non-object, a string and an
    // array and reach the shape clause; `'{"guesses":null}'` and `'{"guesses":"HOT HAND"}'` reach
    // the Array.isArray clause; and `'{"guesses":[1]}'` is the only row that reaches the
    // every-element-is-a-string clause, because an array of numbers is still an array.
    it.each<[string, string | null]>([
      ['nothing stored at all', null],
      ['the canonical empty', ''],
      ['a value that is not JSON', '{'],
      ['a JSON null', 'null'],
      ['a JSON string', '"HOT HAND"'],
      ['an array', '[]'],
      ['a null guess list', '{"guesses":null}'],
      ['a guess list that is a string', '{"guesses":"HOT HAND"}'],
      ['a guess list of numbers', '{"guesses":[1]}'],
    ])('refuses %s whole', (_description, stored) => {
      expect(decode(stored, ANSWER)).toEqual(EMPTY)
    })

    // TRUNCATES, NEVER FILTERS, and this pair is the only thing that can tell the two apart. A
    // filter would return ['HOT HAND', 'TOE HOLE'] from the first row and ['HOT HAND'] from the
    // second; truncation returns ['HOT HAND'] and [] -- which is the conservative, monotone answer,
    // because the COUNT of stored guesses is how many attempts have been spent and handing one back
    // would change what every later row means.
    it('truncates at the first guess that no longer fits and keeps what came before', () => {
      expect(decode('{"guesses":["HOT HAND","CAT","TOE HOLE"]}', ANSWER)).toEqual({ guesses: ['HOT HAND'] })
    })

    it('keeps nothing when the very first guess no longer fits', () => {
      expect(decode('{"guesses":["CAT","HOT HAND"]}', ANSWER)).toEqual(EMPTY)
    })

    // THE TWO SHAPE CLAUSES, ONE PER ROW, because a fixture that breaks both proves neither.
    // 'TOEH OLD' has the right WORD COUNT and the wrong per-word lengths -- [4, 3] against [3, 4] --
    // so only the length clause can be refusing it, and it is the exact input markGuess's second
    // conjunct throws on. 'TOE HOLD EXTRA' has three words, so only the count clause can.
    it.each<[string, string]>([
      ['the per-word lengths do not correspond', '{"guesses":["TOE HOLE","TOEH OLD"]}'],
      ['the word counts differ', '{"guesses":["TOE HOLE","TOE HOLD EXTRA"]}'],
    ])('stops where %s', (_description, stored) => {
      expect(decode(stored, ANSWER)).toEqual({ guesses: ['TOE HOLE'] })
    })

    // PROGRESS IS A TEXT BOX A PLAYER CAN TYPE INTO, and the ceiling that used to come off the pack
    // went away with the guess limit. Without one here, a hand-edited key is however many rows of
    // tiles the board builds during render. Fifty thousand rather than twenty-six, because the
    // realistic hostile write is not one over the line.
    it('refuses to restore more rows than it will draw', () => {
      const stored = JSON.stringify({ guesses: Array.from({ length: 50_000 }, () => 'HOT HAND') })

      expect(decode(stored, ANSWER).guesses).toHaveLength(MAX_STORED)
    })

    // THE OLDEST ROLL OFF, NOT THE NEWEST, and this is the only row that can tell those apart --
    // the row above counts and would pass on either. The guesses are numbered into the WORD SHAPE
    // the answer demands, so each one is both distinguishable and legal: 'HOT HAND' first, then 26
    // distinct 'xxx HAND' rows. Keeping the front would return 'HOT HAND' first and 'AAZ HAND' last.
    it('drops the oldest guesses and keeps the most recent', () => {
      const older = Array.from({ length: 26 }, (_unused, index) => `A${String.fromCharCode(65 + index)}Z HAND`)
      const stored = JSON.stringify({ guesses: ['HOT HAND', ...older] })

      const { guesses } = decode(stored, ANSWER)

      expect(guesses).toHaveLength(MAX_STORED)
      expect(guesses[0]).toEqual('ABZ HAND')
      expect(guesses[MAX_STORED - 1]).toEqual('AZZ HAND')
      expect(guesses).not.toContain('HOT HAND')
    })

    // THE ORDER OF THE TWO CUTS, which nothing else here can see. Step 4 truncates at the first
    // guess that no longer fits and step 5 takes the last 25 of what survived -- so a malformed
    // entry early in a long history discards everything after it, and the window slides over the
    // valid prefix rather than over the raw blob. Reversed, the window would slip past 'CAT'
    // entirely and hand markGuess a list containing something it throws on.
    it('takes its window from the guesses that survived the shape check, not from the raw list', () => {
      const after = Array.from({ length: 30 }, () => 'HOT HAND')
      const stored = JSON.stringify({ guesses: ['TOE HOLE', 'CAT', ...after] })

      expect(decode(stored, ANSWER)).toEqual({ guesses: ['TOE HOLE'] })
    })

    // §8.10's undrawable pack reaching the decoder. A board with no answer has nothing to mark
    // against, so it has no history either -- and the row below is the one that reaches the clause
    // saying so.
    it('keeps nothing when the answer did not arrive', () => {
      expect(decode('{"guesses":["HOT HAND"]}', '')).toEqual(EMPTY)
    })

    // THE ONLY FIXTURE THAT CAN REACH `words.length === 0`, and it exists because the row above
    // cannot: 'HOT HAND' against a missing answer is refused by the SHAPE comparison ('3,4' against
    // ''), so deleting the emptiness clause leaves that row passing. splitPhrase('') is [] on both
    // sides here, so both shapes are '' and the comparison MATCHES -- without the clause this
    // restores an empty guess onto a board that has no answer to mark it against.
    it('keeps nothing when neither the answer nor the stored guess has any words', () => {
      expect(decode('{"guesses":[""]}', '')).toEqual(EMPTY)
    })

    // THE GUARD'S WHOLE PURPOSE, STATED AS AN OBSERVABLE FACT. markGuess throws by contract on a
    // shape mismatch, progress comes out of localStorage where anything can be sitting, and the
    // board dereferences the result during render -- so an unguarded decode is a board that throws
    // at mount forever, with the bad write already persisted and nothing to self-heal it.
    //
    // Led with a positive assertion, because `not.toThrow` over an empty array passes on a decoder
    // that returned nothing at all, which is exactly what a broken decoder does.
    it('hands markGuess nothing it can throw on', () => {
      const answerWords = splitPhrase(ANSWER)

      const { guesses } = decode('{"guesses":["hot hand","CAT","TOE HOLD"]}', ANSWER)

      expect(guesses).toEqual(['HOT HAND'])
      expect(() => guesses.map((guess) => markGuess(splitPhrase(guess), answerWords))).not.toThrow()
    })
  })

  describe('the round trip', () => {
    it('is the identity for guesses the board can produce', () => {
      expect(decode(encode(['HOT HAND', 'OLD HOLE']), ANSWER)).toEqual({ guesses: ['HOT HAND', 'OLD HOLE'] })
    })

    // The board never calls encode with an empty list -- Play again writes onProgress('') directly,
    // because '' is what the shell reads as "no progress" -- but the grammar is total anyway, and a
    // decoder that needed a special case for its own writer's empty would be the wrong shape.
    it('is the identity for a board with no guesses on it', () => {
      expect(decode(encode([]), ANSWER)).toEqual(EMPTY)
    })
  })
})
