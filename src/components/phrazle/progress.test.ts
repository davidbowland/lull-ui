import type { PhrazleSpentRung } from '@rules/hint-phrazle'
import { splitPhrase } from '@rules/is-valid-guess'
import { markGuess } from '@rules/mark-guess'

import { attachHints, decode, decodeHints, encode } from './progress'
import { phrazlePuzzle } from '@test/__mocks__'

describe('phrazle progress', () => {
  // Read off the fixture rather than retyped, so this suite and the board's suite cannot drift on
  // the one string every assertion in both files is built around.
  const ANSWER = phrazlePuzzle.data.answer
  const EMPTY = { guesses: [] }
  // The codec's storage ceiling, retyped rather than imported: MAX_STORED is module-private, and a
  // test that imported it would assert `slice(-n)` against its own `n` and pass at any value.
  const MAX_STORED = 25

  // One rung of each kind, written out as the RULE writes them rather than built by calling it. A
  // codec test that got its fixtures from the chooser would pass on a codec that accepted whatever
  // the chooser happened to emit today, which is the opposite of what an untrusted-input guard is
  // for.
  //
  // The word index is 1, which is the last word of TOE HOLD. Index 2 is the first one past the end,
  // and it is the fixture the answer-relative bound is tested with below.
  const ABSENT: PhrazleSpentRung = { kind: 'absent', letters: 'AGS' }
  const PRESENT: PhrazleSpentRung = { kind: 'present', letters: 'DHL' }
  const WORD: PhrazleSpentRung = { index: 1, kind: 'word' }
  const LADDER = [ABSENT, PRESENT, WORD]

  // The shortest string that carries a ladder, built here so every row below says only what it is
  // varying. `hints` and `opened` are written in the grammar's own key order.
  const stored = (guesses: string[], opened: unknown, hints: unknown): string =>
    JSON.stringify({ guesses, opened, hints })

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

  // THE LADDER IS VALIDATED AS ITS OWN STEP AND DROPPED ON ITS OWN, which is the whole shape of this
  // describe: every row below either keeps the guesses while losing the ladder or the reverse, and
  // none of them loses both. The two are separable -- a rung is a sentence the shell prints and a
  // guess is a row the player typed -- so a malformed rung must never cost a player rows they typed.
  describe('the ladder a stored string carries', () => {
    // `toStrictEqual` and not `toEqual` in every row of this describe, because the claim is about
    // whether a KEY IS THERE. `toEqual` treats an absent field and a field holding undefined as the
    // same thing, which is exactly the distinction "omit both fields when nothing is bought" is
    // about, so it would pass on a codec that wrote `{"guesses":[],"opened":undefined}`.
    it('reads the rungs and the count back', () => {
      expect(decode(stored(['HOT HAND'], 3, LADDER), ANSWER)).toStrictEqual({
        guesses: ['HOT HAND'],
        hints: LADDER,
        opened: 3,
      })
    })

    // A LEGACY PAYLOAD IS EVERY BOARD WRITTEN BEFORE THIS EXISTED, and it needs no migration because
    // "neither field" is not a state to migrate FROM -- it is what nothing bought looks like. This
    // is also the round trip an untouched board takes forever: encode writes this, decode reads it,
    // and merge hands it straight back.
    it('reads a payload with neither field as nothing bought', () => {
      expect(decode('{"guesses":["HOT HAND"]}', ANSWER)).toStrictEqual({ guesses: ['HOT HAND'] })
    })

    // THE COUNT MAY RUN ONE PAST THE RUNGS, and that one is the ANSWER. It is the whole reason the
    // count is stored rather than derived from the list beside it: HintBar reaches "Show answer"
    // only when `opened` exceeds the ladder's length, and a number read off a three-rung array
    // cannot say four.
    it('reads back the count that means the answer was revealed', () => {
      expect(decode(stored([], 4, LADDER), ANSWER)).toStrictEqual({ guesses: [], hints: LADDER, opened: 4 })
    })

    // ONE ROW PER REFUSAL, and each fixture breaks exactly one rule so that deleting the clause it
    // is aimed at fails this row and only this row.
    //
    // The two `opened` bounds are the pair worth reading together: below the rung count is a record
    // claiming rungs nobody paid for, and more than one past it is a reveal on a ladder that never
    // reached its end. Neither is a string this app can write.
    it.each<[string, string]>([
      ['the rungs are not an array', stored([], 1, 'AGS')],
      ['a rung is not an object', stored([], 1, ['AGS'])],
      ['a rung is null', stored([], 1, [null])],
      ['a rung names a kind the rule has no name for', stored([], 1, [{ kind: 'colour', letters: 'AGS' }])],
      ['a letter rung carries no letters at all', stored([], 1, [{ kind: 'absent', letters: '' }])],
      ['a letter rung carries something that is not a letter', stored([], 1, [{ kind: 'present', letters: 'D-H' }])],
      ['a letter rung carries lowercase, which no rule writes', stored([], 1, [{ kind: 'absent', letters: 'ags' }])],
      ['a letter rung carries a number', stored([], 1, [{ kind: 'absent', letters: 7 }])],
      ['a word rung names no word', stored([], 1, [{ kind: 'word' }])],
      ['a word rung names a fractional word', stored([], 1, [{ index: 1.5, kind: 'word' }])],
      ['a word rung names a word before the first', stored([], 1, [{ index: -1, kind: 'word' }])],
      ['a word rung names a word this phrase does not have', stored([], 1, [{ index: 2, kind: 'word' }])],
      ['there are more rungs than the ladder can hold', stored([], 4, [ABSENT, PRESENT, WORD, ABSENT])],
      ['the count is below the rungs it is beside', stored([], 1, LADDER)],
      ['the count is more than one past them', stored([], 5, LADDER)],
      // A REVEAL ON A LADDER OF ZERO, which `open` cannot produce from any board: the first press
      // either appends a rung or declines. Admitted, it put a free speculative rung on screen --
      // HintBar draws `slice(0, opened)` over a ladder whose tail the adapter folds from live state.
      ['a step is paid on no rungs at all', stored([], 1, [])],
      ['the count is not a whole number', stored([], 1.5, [ABSENT])],
      ['the count is a string the encoder cannot write', stored([], '1', [ABSENT])],
      ['there are rungs and no count', JSON.stringify({ guesses: ['HOT HAND'], hints: LADDER })],
      ['there is a count and no rungs', JSON.stringify({ guesses: ['HOT HAND'], opened: 1 })],
    ])('drops the ladder and keeps the guesses when %s', (_description, progress) => {
      const decoded = decode(progress, ANSWER)

      expect(decoded.hints).toBeUndefined()
      expect(decoded.opened).toBeUndefined()
    })

    // THE OTHER DIRECTION, and it is the sentence this whole split exists for: a guess the answer no
    // longer fits truncates the history and costs the player nothing they PAID for. 'CAT' stops the
    // walk, 'TOE HOLE' before it survives, and all three rungs are still there.
    it('keeps the ladder when a stored guess no longer fits the answer', () => {
      expect(decode(stored(['TOE HOLE', 'CAT', 'HOT HAND'], 3, LADDER), ANSWER)).toStrictEqual({
        guesses: ['TOE HOLE'],
        hints: LADDER,
        opened: 3,
      })
    })

    it('keeps the ladder when the guess list is malformed outright', () => {
      expect(decode(JSON.stringify({ guesses: null, hints: LADDER, opened: 3 }), ANSWER)).toStrictEqual({
        guesses: [],
        hints: LADDER,
        opened: 3,
      })
    })
  })

  // THE READ THAT HAS NO ANSWER TO CHECK AGAINST, because `merge` is handed two strings and no
  // puzzle. That is deliberate -- its job is to say which field belongs to whom, not to read either
  // side's meaning -- so this is the half of the codec that can run behind it.
  describe('decodeHints', () => {
    it('reads the ladder without being told the answer', () => {
      expect(decodeHints(stored(['HOT HAND'], 2, [ABSENT, PRESENT]))).toStrictEqual({
        hints: [ABSENT, PRESENT],
        opened: 2,
      })
    })

    it.each<[string, string | null]>([
      ['nothing stored at all', null],
      ['the canonical empty', ''],
      ['a value that is not JSON', '{'],
      ['a JSON string', '"HOT HAND"'],
      ['a payload with neither field', '{"guesses":["HOT HAND"]}'],
      ['a ladder longer than three', stored([], 4, [ABSENT, PRESENT, WORD, ABSENT])],
      ['a count below the rungs beside it', stored([], 0, [ABSENT])],
    ])('answers nothing bought for %s', (_description, progress) => {
      expect(decodeHints(progress)).toStrictEqual({ hints: [], opened: 0 })
    })

    // THE ONE INPUT THE TWO READERS DISAGREE ON, asserted rather than left to be discovered. This one
    // has no phrase to measure a word index against, so it keeps a rung `decode` refuses. Nothing in
    // this app writes that string; what the row defends is that the divergence is the documented one
    // and not a second, wider one.
    it('keeps a word rung whose index only the answer could refuse', () => {
      const past: PhrazleSpentRung = { index: 2, kind: 'word' }

      expect(decodeHints(stored([], 1, [past]))).toStrictEqual({ hints: [past], opened: 1 })
      expect(decode(stored([], 1, [past]), ANSWER).hints).toBeUndefined()
    })
  })

  // THE CODEC HALF OF THE ONE-WRITER RULE. The board wrote its own portion and knows nothing of the
  // two hint fields; this is what puts them back, and it is the only writer of them.
  describe('attachHints', () => {
    const TAIL = { hints: [ABSENT], opened: 1 }

    it('re-attaches the ladder to what the board wrote', () => {
      expect(attachHints(encode(['HOT HAND']), TAIL)).toEqual(stored(['HOT HAND'], 1, [ABSENT]))
    })

    // BYTE FOR BYTE, which is what keeps an untouched board writing the shortest payload it always
    // did -- and is why a board stored before any of this existed is read back and rewritten
    // unchanged. `toEqual` on strings is exact, so this is the assertion it looks like.
    it('hands back the board’s own string when nothing is bought', () => {
      expect(attachHints('{"guesses":["HOT HAND"]}', { hints: [], opened: 0 })).toEqual('{"guesses":["HOT HAND"]}')
    })

    it('leaves the canonical empty empty when nothing is bought', () => {
      expect(attachHints('', { hints: [], opened: 0 })).toEqual('')
    })

    // A RUNG BOUGHT BEFORE THE PLAYER HAS TYPED ANYTHING, which is why this does NOT special-case an
    // empty board write. That decision -- '' means the player started over -- belongs to the adapter
    // that owns the type's ladder, not to a string joiner that cannot tell a reset from a fresh
    // board.
    it('attaches a ladder to a board nobody has typed on', () => {
      expect(attachHints('', TAIL)).toEqual(stored([], 1, [ABSENT]))
    })

    it.each<[string, string]>([
      ['a value that is not JSON', '{'],
      ['a guess list that is not a list', '{"guesses":"HOT HAND"}'],
      ['a guess list of numbers', '{"guesses":[1]}'],
    ])('writes an empty board when the board write is %s', (_description, boardWrite) => {
      expect(attachHints(boardWrite, TAIL)).toEqual(stored([], 1, [ABSENT]))
    })
  })

  describe('the round trip', () => {
    it('is the identity for guesses the board can produce', () => {
      expect(decode(encode(['HOT HAND', 'OLD HOLE']), ANSWER)).toEqual({ guesses: ['HOT HAND', 'OLD HOLE'] })
    })

    // THE WHOLE GRAMMAR, both halves, through both writers. encode writes the board's portion,
    // attachHints puts the ladder back, and decode reads a record that is exactly what went in.
    it('is the identity for a board with a ladder on it', () => {
      const written = attachHints(encode(['HOT HAND', 'OLD HOLE']), { hints: LADDER, opened: 4 })

      expect(decode(written, ANSWER)).toStrictEqual({ guesses: ['HOT HAND', 'OLD HOLE'], hints: LADDER, opened: 4 })
    })

    // The board never calls encode with an empty list -- Play again writes onProgress('') directly,
    // because '' is what the shell reads as "no progress" -- but the grammar is total anyway, and a
    // decoder that needed a special case for its own writer's empty would be the wrong shape.
    it('is the identity for a board with no guesses on it', () => {
      expect(decode(encode([]), ANSWER)).toEqual(EMPTY)
    })
  })
})
