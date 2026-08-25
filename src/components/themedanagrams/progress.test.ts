import { decode, encode, Guesses, MAX_GUESS } from './progress'

describe('themed anagrams progress', () => {
  // Row 3 is deliberately empty and row 2 is deliberately a partial word: a fixture where all four
  // are full words cannot tell a join from a filter, and an empty part in the middle is the case
  // the grammar has to carry without an escape.
  const GUESSES: Guesses = ['KETTLE', 'SAUCE', '', 'SPAT']
  const ENCODED = 'KETTLE\nSAUCE\n\nSPAT'
  const EMPTY: Guesses = ['', '', '', '']

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
      expect(decode(stored)).toEqual(EMPTY)
    })

    it('reads four drafts back in wire order', () => {
      expect(decode(ENCODED)).toEqual(GUESSES)
    })

    // A refusal hands back a FRESH tuple. Returning one shared constant would let a board that
    // restored an empty puzzle write through it into every later restore in the same session, and
    // the failure would surface as one puzzle's draft appearing in another's boxes.
    it('hands every caller its own tuple', () => {
      const first = decode(null)

      first[0] = 'KETTLE'

      expect(decode(null)).toEqual(EMPTY)
    })
  })

  describe('encode', () => {
    // The canonical empty, and it is what the shell reads as "no progress" -- wasSolvedBefore and
    // the shelf's started-state both key off ''. This board owes the ladder nothing when it is
    // blank: the rung count lives in storage the board cannot see.
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
      expect(decode(encode(GUESSES))).toEqual(GUESSES)
    })

    // '' decodes to four empties by the SAME path a refusal takes -- one part, not four -- so the
    // canonical empty needs no special case. That the grammar needs no exception for its own empty
    // is the tell that it is the right shape.
    it('is the identity for an untouched board', () => {
      expect(decode(encode(EMPTY))).toEqual(EMPTY)
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

      expect(decode(encode(longest))).toEqual(longest)
    })
  })
})
