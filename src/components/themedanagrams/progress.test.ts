import { attachHints, decode, decodeHints, encode, Guesses, MAX_GUESS } from './progress'

describe('themed anagrams progress', () => {
  // Row 3 is deliberately empty and row 2 is deliberately a partial word: a fixture where all four
  // are full words cannot tell a join from a filter, and an empty part in the middle is the case
  // the grammar has to carry without an escape.
  const GUESSES: Guesses = ['KETTLE', 'SAUCE', '', 'SPAT']
  const ENCODED = 'KETTLE\nSAUCE\n\nSPAT'
  const EMPTY: Guesses = ['', '', '', '']

  // The drafts half of a stored string, so the rows below read as they always did while the function
  // around them now answers with a ladder too.
  const guessesOf = (progress: string | null): Guesses => decode(progress).guesses

  describe('decode', () => {
    // One row per refusal, so a fifth guard is a row rather than a test. Every one of them yields
    // four empty strings: a half-restored board is a state with no test and no way back out, which
    // is the refusal every decoder in this repo already makes.
    //
    // FIVE OF THESE SIX ROWS ISOLATE ONE GUARD EACH, and it is worth saying which, because a row
    // two guards can both catch proves neither of them.
    //
    // `null` is the only row that reaches the null check: delete it and `null.length` throws a
    // TypeError instead of returning a tuple. The three-part and five-part rows are short enough
    // that no length bound sees them, so only `parts.length !== 4` can be refusing them. The
    // over-long-part row is 71 characters -- well under the total bound -- so only the per-part
    // bound can be refusing it, and `''` is the row that proves the canonical empty takes the
    // refusal path rather than a special case (one part, not four).
    //
    // THE TOTAL-BOUND ROW ISOLATES NOTHING, and the plan's claim that it does is wrong. The bound is
    // 4 * MAX_GUESS + 3, which is exactly the longest string `encode` can produce, so any string
    // that exceeds it either splits into something other than four parts or contains a part longer
    // than MAX_GUESS -- there is no fourth arrangement. Delete `progress.length > 4 * MAX_GUESS + 3`
    // outright and this row stays green, caught one line later. The guard is unfalsifiable through
    // this function in the same way `splitAt`'s `start >= end` is, and it is kept for the same two
    // reasons: it states the intent where a reader is thinking about size, and it is asked BEFORE
    // the split, so a megabyte of valid-looking text is refused without first being cut into a
    // million pieces. That ordering is a performance property and no assertion can observe it.
    //
    // What DOES defend the bound is the boundary round trip at the bottom of this file, from the
    // accepting side: tighten the constant and a board the writer can legitimately produce stops
    // restoring. So the bound cannot drift downward unnoticed; it can only be deleted, and deleting
    // it costs a split rather than a behavior.
    it.each<[string, string | null]>([
      ['nothing stored at all', null],
      ['the canonical empty', ''],
      ['three parts', 'a\nb\nc'],
      ['five parts', 'a\nb\nc\nd\ne'],
      ['a part longer than one guess may be', `${'a'.repeat(MAX_GUESS + 1)}\nb\nc\nd`],
      ['a string longer than four guesses may be', `${'a'.repeat(4 * MAX_GUESS + 4)}\nb\nc\nd`],
    ])('refuses %s whole', (_description, stored) => {
      expect(guessesOf(stored)).toEqual(EMPTY)
    })

    it('reads four drafts back in wire order', () => {
      expect(guessesOf(ENCODED)).toEqual(GUESSES)
    })

    // A refusal hands back a FRESH tuple. Returning one shared constant would let a board that
    // restored an empty puzzle write through it into every later restore in the same session, and
    // the failure would surface as one puzzle's draft appearing in another's boxes.
    it('hands every caller its own tuple', () => {
      const first = guessesOf(null)

      first[0] = 'KETTLE'

      expect(guessesOf(null)).toEqual(EMPTY)
    })
  })

  describe('encode', () => {
    // The canonical empty, and it is what the shell reads as "no progress" -- wasSolvedBefore and
    // the shelf's started-state both key off ''. `encode` writes the DRAFTS and nothing else, so a
    // blank board with rungs spent is not '' -- it is `|2|I2,B3`, which `attachHints` composes and
    // which the rows at the bottom of this file assert.
    it('writes the canonical empty when nothing is typed', () => {
      expect(encode(EMPTY)).toBe('')
    })

    it('joins four drafts with newlines', () => {
      expect(encode(GUESSES)).toBe(ENCODED)
    })

    // The one character the grammar depends on cannot enter it, and it is stopped at the WRITE
    // site rather than the read site: a newline reaching storage is a string that decodes to four
    // empty boxes on the next load, which is the player's work silently gone. Both characters are
    // replaced, so a pasted CRLF becomes two spaces rather than one space and one part boundary.
    //
    // THE SECOND GUESS CARRIES BOTH CHARACTERS ON PURPOSE, and that is what makes this row defend
    // three separate mistakes rather than one. Drop the replace and 'a\nb' comes back whole; narrow
    // the class to /\n/ and the \r survives as 'c\r d'; drop the `g` flag and only the \r of the
    // CRLF is replaced, leaving 'c \nd' -- a string that is five parts and refuses itself on the
    // next load, which is the exact failure this guard exists to prevent.
    it('replaces a newline inside a guess before it is written', () => {
      expect(encode(['a\nb', 'c\r\nd', '', ''])).toBe('a b\nc  d\n\n')
    })

    // It does not trim. A trim would silently rewrite what the player typed on the round trip, and
    // the player's own box is the only thing that decides what their draft is. The leading and
    // trailing spaces are both here because `trimEnd()` and `trimStart()` are each one plausible
    // edit and either one alone would survive a fixture padded on one side.
    it('does not trim what the player typed', () => {
      expect(encode([' KETTLE ', '', '', ''])).toBe(' KETTLE \n\n\n')
    })

    // THE CAP IS THE WRITER'S TOO, and this is the row that says so. `maxLength` on the box is what
    // stops a player reaching it by typing, but a cap living only in markup does not survive a
    // programmatic value set or an IME commit -- and an over-long draft used to encode happily and
    // then decode to four empty strings, which is a lossy write wearing the face of a good one.
    it('cuts a draft no box could have produced down to what the reader will take back', () => {
      expect(encode(['K'.repeat(MAX_GUESS + 1), '', '', ''])).toBe(`${'K'.repeat(MAX_GUESS)}\n\n\n`)
    })
  })

  describe('the round trip', () => {
    it('is the identity for four ordinary guesses', () => {
      expect(guessesOf(encode(GUESSES))).toEqual(GUESSES)
    })

    // '' decodes to four empties by the SAME path a refusal takes -- one part, not four -- so the
    // canonical empty needs no special case. That the grammar needs no exception for its own empty
    // is the tell that it is the right shape.
    it('is the identity for an untouched board', () => {
      expect(guessesOf(encode(EMPTY))).toEqual(EMPTY)
    })

    // THE BOUNDARY, and it is the only test that can catch either length bound being tightened.
    // Four guesses at MAX_GUESS encode to exactly 4 * MAX_GUESS + 3 characters, so a total bound
    // written as `>=` rather than `>`, or as 4 * MAX_GUESS, refuses a board the writer could
    // legitimately produce -- and so does a per-part bound written as `>=`. Both mutations redden
    // this one row, which is the price of a fixture that sits on both boundaries at once; nothing
    // shorter can sit on either.
    it('is the identity at the longest board the grammar allows', () => {
      const longest: Guesses = [
        'a'.repeat(MAX_GUESS),
        'b'.repeat(MAX_GUESS),
        'c'.repeat(MAX_GUESS),
        'd'.repeat(MAX_GUESS),
      ]

      expect(guessesOf(encode(longest))).toEqual(longest)
    })
  })

  // The grammar is `<g0>\n<g1>\n<g2>\n<g3>|<opened>|<spent>`, with the two trailing fields omitted
  // entirely when nothing is bought. These rows are about the two fields the board never writes, and
  // the asymmetry they defend is stated at `hintTail` in the module: a malformed board is refused
  // whole because a half-restored board is unusable, while a malformed ladder costs the ladder and
  // nothing else, because the four words beside it are still this player's work.
  describe('the ladder field', () => {
    const INITIAL = { entryIndex: 2, kind: 'initial' } as const
    const BOOKENDS = { entryIndex: 3, kind: 'bookends' } as const
    const PREFIX = { entryIndex: 0, kind: 'prefix3' } as const

    describe('decode', () => {
      it('reads the rungs and the count a stored string carries', () => {
        expect(decode(`${ENCODED}|2|I2,B3`)).toStrictEqual({ guesses: GUESSES, hints: [INITIAL, BOOKENDS], opened: 2 })
      })

      // A LEGACY PAYLOAD READS AS NOTHING BOUGHT, which is what makes this deployable over boards
      // already on people's devices. There is no field, and no field is not a state to migrate.
      it('reads a board stored before the ladder existed as nothing bought', () => {
        expect(decode(ENCODED)).toStrictEqual({ guesses: GUESSES, hints: [], opened: 0 })
      })

      it('reads the canonical empty as an untouched board with no ladder', () => {
        expect(decode('')).toStrictEqual({ guesses: EMPTY, hints: [], opened: 0 })
      })

      // A BLANK BOARD WITH RUNGS SPENT, which is exactly the state the field exists to represent and
      // the one the module comment used to deny was possible. It is not '' and it must not be: the
      // player paid for those rungs and the sheet has to list them after a reload.
      it('reads a ladder bought before a single letter was typed', () => {
        expect(decode('|1|I2')).toStrictEqual({ guesses: EMPTY, hints: [INITIAL], opened: 1 })
      })

      it('reads all three kinds back', () => {
        expect(decode('|3|I2,B3,P0').hints).toEqual([INITIAL, BOOKENDS, PREFIX])
      })

      // ONE ROW PER FAULT, and every one of them KEEPS EVERY CHARACTER THE PLAYER TYPED. That is the
      // whole point of the ladder being validated as its own step: a hand-edited byte in a rung must
      // never cost somebody four words.
      //
      // THE BAD TAIL LANDS IN THE LAST DRAFT, and that is the behavior rather than a leak. Once the
      // two fields are refused there is no ladder there, so there is nothing to cut at -- and this
      // codec cannot tell a corrupted tail from a draft with two separators in it, because both are
      // hand-edited strings and neither is one `encode` can write. Between losing characters and
      // keeping characters the player may not have typed, it keeps them: the box shows the run, the
      // next keystroke rewrites it, and `encode` strips the separators on the way out. Cutting at
      // the first separator instead would silently delete text on the one input in this app a player
      // can put anything into.
      it.each<[string, string]>([
        ['a count that is not a number', '|x|I2'],
        ['a count with a sign on it', '|+1|I2'],
        ['a count below the rungs it stands beside', '|0|I2'],
        ['a count more than one past the last rung', '|3|I2'],
        // A REVEAL ON A LADDER OF ZERO, which `open` cannot produce from any board: the first press
        // either appends a rung or declines. Admitted, it put a free speculative rung on screen --
        // HintBar draws `slice(0, opened)` over a ladder whose tail the adapter folds from live
        // state.
        ['a step paid on no rungs at all', '|1|'],
        ['a rung of an unknown kind', '|1|Z2'],
        ['a rung naming a row this board would refuse to draw', '|1|I4'],
        ['a rung naming no row at all', '|1|I'],
        ['more rungs than the rule will ever sell', '|4|I0,B1,P2,I3'],
      ])('drops a ladder with %s and loses nothing that was typed', (_description, tail) => {
        expect(decode(`${ENCODED}${tail}`)).toStrictEqual({
          guesses: ['KETTLE', 'SAUCE', '', `SPAT${tail}`],
          hints: [],
          opened: 0,
        })
      })

      // THE MIRROR, and the row that fails if the ladder's validity is ever made to depend on the
      // drafts beside it. A board this codec cannot read is refused whole; the rungs the player paid
      // for are still theirs.
      it('drops drafts it cannot read and keeps the ladder', () => {
        expect(decode('a\nb\nc|1|I2')).toStrictEqual({ guesses: EMPTY, hints: [INITIAL], opened: 1 })
      })

      // The answer reveal: one step past the last rung, which is the count a derived one could never
      // express. See ThemedAnagramsHintTail.
      it('accepts a count one past the last rung, which is the answer reveal', () => {
        expect(decode(`${ENCODED}|2|I2`).opened).toEqual(2)
      })

      // A DRAFT CARRYING A STRAY `|` CANNOT SHIFT THE FIELD, which is why the cut is taken from the
      // right. `encode` strips the character, so this string is hand-edited -- and reading from the
      // left would have handed the ladder two fields sliced out of the middle of somebody's word.
      it('reads the ladder off the last two separators, not the first', () => {
        expect(decode('KET|TLE\nSAUCE\n\nSPAT|1|I2')).toStrictEqual({
          guesses: ['KET|TLE', 'SAUCE', '', 'SPAT'],
          hints: [INITIAL],
          opened: 1,
        })
      })

      // The same character with no ladder behind it. One separator is not two, so there is no tail to
      // read and the whole string is the board -- drafts and all.
      it('keeps a draft whose only stray separator has no ladder behind it', () => {
        expect(decode('KET|TLE\nSAUCE\n\nSPAT').guesses).toEqual(['KET|TLE', 'SAUCE', '', 'SPAT'])
      })

      // And the case that is only decidable by dropping the tail first: two stray separators and no
      // real ladder. The tail is refused on its own, so the board is the WHOLE string again rather
      // than the fragment in front of the first cut -- which is what "drops only it on a fault"
      // means when the fault is that there was never a field there.
      it('keeps a draft carrying two stray separators and no ladder', () => {
        expect(decode('K|ET|TLE\nSAUCE\n\nSPAT').guesses).toEqual(['K|ET|TLE', 'SAUCE', '', 'SPAT'])
      })

      // The one string where a separator is the FIRST character and there is no ladder. Without the
      // `second <= 0` guard, `lastIndexOf(FIELD, -1)` searches from index 0 rather than from nowhere
      // and answers 0 -- so both cuts would name the same character and a zero-width field would be
      // read out of it.
      it('keeps a draft that begins with a stray separator', () => {
        expect(decode('|KETTLE\nSAUCE\n\nSPAT').guesses).toEqual(['|KETTLE', 'SAUCE', '', 'SPAT'])
      })
    })

    describe('decodeHints', () => {
      it('reads the ladder off a stored string', () => {
        expect(decodeHints(`${ENCODED}|1|P0`)).toStrictEqual({ hints: [PREFIX], opened: 1 })
      })

      it('reads nothing from a board with no ladder on it', () => {
        expect(decodeHints(ENCODED)).toStrictEqual({ hints: [], opened: 0 })
      })

      it('reads nothing from no stored progress at all', () => {
        expect(decodeHints(null)).toStrictEqual({ hints: [], opened: 0 })
      })

      // A FUNCTION AND NOT A SHARED CONSTANT. The array inside is handed to the adapter, which
      // spreads it to build the next purchase; one shared empty would be an array every board in the
      // session wrote into.
      it('hands every caller its own empty ladder', () => {
        const first = decodeHints(null)

        first.hints.push(INITIAL)

        expect(decodeHints(null).hints).toEqual([])
      })
    })

    describe('attachHints', () => {
      it('writes the count and the rungs after the drafts', () => {
        expect(attachHints(ENCODED, { hints: [INITIAL, BOOKENDS], opened: 2 })).toBe(`${ENCODED}|2|I2,B3`)
      })

      // An empty tail hands `boardWrite` back byte for byte, which is what keeps an untouched board
      // writing the shortest payload it always did.
      it('hands the drafts back untouched when nothing is bought', () => {
        expect(attachHints(ENCODED, { hints: [], opened: 0 })).toBe(ENCODED)
      })

      // The reveal step: the count moves and no rung is appended, so the spent field is empty while
      // the count is not.
      it('writes a count with no rungs beside it once the answer is out', () => {
        expect(attachHints(ENCODED, { hints: [], opened: 1 })).toBe(`${ENCODED}|1|`)
      })

      it('is read back by decode as what it wrote', () => {
        const tail = { hints: [INITIAL, BOOKENDS, PREFIX], opened: 4 }

        expect(decode(attachHints(encode(GUESSES), tail))).toStrictEqual({ ...tail, guesses: GUESSES })
      })

      // The blank board with rungs spent, composed rather than asserted as a literal, so this row
      // fails if either half of the grammar moves.
      it('writes a ladder onto a board with nothing typed on it', () => {
        expect(attachHints(encode(EMPTY), { hints: [INITIAL], opened: 1 })).toBe('|1|I2')
      })
    })
  })
})
