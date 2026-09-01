import {
  apply,
  attachHints,
  cipherLetters,
  decode,
  decodeHints,
  encode,
  isSolved,
  Mapping,
  withRevealed,
} from './mapping'

// V, Z and Q are the letters the spec's own status-message examples use, so the six rows below read
// against the table in the design doc without translation. Under { Q: 'E', V: 'A', Z: 'T' } this
// deciphers to ATE ATE TEA, which is the ANSWER the isSolved block checks against.
//
// NO CIPHER LETTER STANDS FOR ITSELF, and this fixture used to break that. It ran cipher E against
// plain E, which lull-api's `encipher` cannot produce -- the substitution it draws is a DERANGEMENT
// -- so every rung over that square rendered "Every E is an E.", a sentence no real puzzle can
// utter, and three suites pinned it as the expected output.
const CIPHERTEXT = 'VZQ VZQ ZQV'

describe('encode', () => {
  // Sorted by cipher letter and flattened, so the same mapping always encodes to the same string --
  // progress is written on every tap and a key order that followed insertion would churn storage.
  //
  // Built key by key rather than as a literal, and in the order a PLAYER would have tapped them.
  // An alphabetically-ordered literal encodes to the same string with or without the sort, so it
  // cannot witness the sort at all -- and a real board's mapping is always in tap order, because
  // `apply` appends each new cipher letter to the end of a spread copy.
  it('writes sorted cipher-plain pairs whatever order they were assigned in', () => {
    const asTapped: Mapping = {}
    asTapped.Z = 'T'
    asTapped.E = 'A'
    asTapped.V = 'I'

    expect(encode(asTapped)).toEqual('EAVIZT')
  })

  it('writes nothing for an empty mapping', () => {
    expect(encode({})).toEqual('')
  })
})

// The mapping half of a stored string, so the rows below read as they always did while the
// function around them now answers with a ladder too.
const mappingOf = (progress: string | null): Mapping => decode(progress, CIPHERTEXT).mapping

describe('decode', () => {
  it('reads back what encode wrote', () => {
    const mapping: Mapping = { Q: 'A', V: 'I', Z: 'T' }

    expect(mappingOf(encode(mapping))).toEqual(mapping)
  })

  it('reads nothing from no stored progress', () => {
    expect(mappingOf(null)).toEqual({})
  })

  it('reads nothing from an empty string', () => {
    expect(mappingOf('')).toEqual({})
  })

  // A pack can be pruned and refetched, and a regenerated puzzle keeps neither its ciphertext nor
  // its id -- so stored progress is untrusted input, exactly as goFigure treats its expression.
  //
  // Every case below puts a VALID pair first, and that is the whole point of them. Each fault
  // rejects the WHOLE string, so the good pair in front of it has to be discarded too -- and a
  // single-pair input like 'V1' cannot tell rejecting the string apart from skipping the bad pair,
  // which is the same empty answer either way.
  it('rejects an odd-length string, dropping the pair it did read', () => {
    expect(mappingOf('VAZ')).toEqual({})
  })

  it('rejects the whole string for a character outside A-Z', () => {
    expect(mappingOf('VA1B')).toEqual({})
  })

  it('rejects the whole string for a lowercase pair', () => {
    expect(mappingOf('VAvb')).toEqual({})
  })

  // A cipher letter that is not in this ciphertext names a square that does not exist. It is the
  // signature of progress restored against a different puzzle.
  // Twenty-six pairs is every letter of the alphabet assigned, so anything longer is not a board
  // this component wrote. `lull:progress:` is a string a player can hand-edit, and walking a
  // megabyte of it to return at most twenty-six entries is work nobody asked for.
  it('rejects a string longer than the alphabet without walking it', () => {
    expect(mappingOf('VA'.repeat(27))).toEqual({})
  })

  it('accepts a string exactly as long as the alphabet allows', () => {
    expect(mappingOf('VA'.padEnd(52, 'ZT'))).toEqual({ V: 'A', Z: 'T' })
  })

  it('rejects the whole string for a cipher letter the ciphertext does not contain', () => {
    expect(mappingOf('VAXB')).toEqual({})
  })

  // A plain letter is on exactly one cipher letter or on none, always -- so a duplicate cannot be
  // rendered. Dropping the later pair keeps the earlier one rather than discarding the whole
  // restore, which would cost a player a board they legitimately built.
  it('keeps the first pair and drops a repeated plain letter', () => {
    expect(mappingOf('VAZA')).toEqual({ V: 'A' })
  })

  it('keeps the first pair and drops a repeated cipher letter', () => {
    expect(mappingOf('VAVB')).toEqual({ V: 'A' })
  })

  // The board has no reason to know the cipher is a derangement -- that is the generator's business.
  // A player may assign C to C, and a restore that silently dropped it would lose their work.
  it('keeps a self-pair', () => {
    expect(mappingOf('VV')).toEqual({ V: 'V' })
  })
})

describe('apply', () => {
  // The six rows of the spec's table, exhaustively. C is the selected cipher letter, X the tapped
  // plain letter, Y whatever C already holds, B whatever cipher letter already holds X.
  //
  // Row 1 -- nothing selected -- is the board's business, not this function's: apply is never
  // reached without a selection.

  it('row 2: puts a free letter on an empty cipher letter', () => {
    expect(apply({}, 'V', 'I')).toEqual({
      cleared: false,
      mapping: { V: 'I' },
      refused: null,
      released: null,
      stolenFrom: null,
    })
  })

  // The assignment MOVES rather than the affordance disappearing, so the player is never blocked and
  // never has to clear something before trying something else. A contradiction is unrepresentable.
  it('row 3: steals a letter held by another cipher letter', () => {
    expect(apply({ Z: 'I' }, 'V', 'I')).toEqual({
      cleared: false,
      mapping: { V: 'I' },
      refused: null,
      released: null,
      stolenFrom: 'Z',
    })
  })

  // The undo. Tapping the same key again clears it, whether the player never moved or moved to
  // another square showing the same cipher letter. This is why there is no Take back button.
  it('row 4: clears the cipher letter when it already holds the tapped letter', () => {
    expect(apply({ V: 'I' }, 'V', 'I')).toEqual({
      cleared: true,
      mapping: {},
      refused: null,
      released: null,
      stolenFrom: null,
    })
  })

  it('row 5: releases the letter the cipher letter was holding', () => {
    expect(apply({ V: 'E' }, 'V', 'I')).toEqual({
      cleared: false,
      mapping: { V: 'I' },
      refused: null,
      released: 'E',
      stolenFrom: null,
    })
  })

  it('row 6: releases one letter and steals another', () => {
    expect(apply({ V: 'E', Z: 'I' }, 'V', 'I')).toEqual({
      cleared: false,
      mapping: { V: 'I' },
      refused: null,
      released: 'E',
      stolenFrom: 'Z',
    })
  })

  // Rows 7 and 8, the two refusals a lock adds. ONE RULE, not two: a fact the board hands the player
  // must not be something the next tap takes away, and a tap can take a letter away from two
  // directions -- over the top of it, or out from under it.
  //
  // The mapping comes back BY IDENTITY on both, which is what lets the board tell "nothing happened"
  // from "something happened that produced an equal object".
  it('row 7: refuses to reassign a locked cipher letter', () => {
    const before: Mapping = { V: 'A' }

    expect(apply(before, 'V', 'I', new Set(['V']))).toStrictEqual({
      cleared: false,
      mapping: before,
      refused: 'V',
      released: null,
      stolenFrom: null,
    })
  })

  // The eraser reaches `apply` with the letter the square already holds, which is row 4's toggle. A
  // lock that only guarded overwrites would leave Backspace and the pad's Delete key as a way to
  // empty a square the player paid to have filled -- so the refusal is asked BEFORE the toggle.
  it('row 7: refuses the row-4 toggle that would empty a locked cipher letter', () => {
    expect(apply({ V: 'A' }, 'V', 'A', new Set(['V'])).refused).toEqual('V')
  })

  it('row 8: refuses to steal a plain letter off a locked cipher letter', () => {
    const before: Mapping = { V: 'A' }

    expect(apply(before, 'Z', 'A', new Set(['V']))).toStrictEqual({
      cleared: false,
      mapping: before,
      refused: 'V',
      released: null,
      stolenFrom: null,
    })
  })

  // THE HALF A LOCK DOES NOT TAKE AWAY, and the row that reddens if the refusal is ever written as
  // "no steal while anything is locked". A wrong guess sitting on the letter is still released,
  // which is the whole of how a player corrects a board around a revealed square.
  it('still steals from an unlocked square while another square is locked', () => {
    expect(apply({ Q: 'T', V: 'A' }, 'Z', 'T', new Set(['V']))).toStrictEqual({
      cleared: false,
      mapping: { V: 'A', Z: 'T' },
      refused: null,
      released: null,
      stolenFrom: 'Q',
    })
  })

  it('leaves every other assignment alone', () => {
    expect(apply({ Q: 'T', V: 'A' }, 'V', 'I').mapping).toEqual({ Q: 'T', V: 'I' })
  })

  // The board renders from the returned mapping, so a mutated input would be a state change React
  // cannot see.
  it('does not mutate the mapping it is given', () => {
    const before: Mapping = { V: 'E' }

    apply(before, 'V', 'I')

    expect(before).toEqual({ V: 'E' })
  })
})

describe('isSolved', () => {
  const ANSWER = 'Ate ate tea'

  it('is not solved while a cipher letter is unassigned', () => {
    expect(isSolved(CIPHERTEXT, { V: 'A', Z: 'T' }, ANSWER)).toBe(false)
  })

  // A complete mapping that spells AETAETETA rather than ATEATETEA -- every square is full and the
  // phrase is still wrong, which is the state the board's "check the ones you're least sure of"
  // message exists for.
  it('is not solved when a full mapping spells something else', () => {
    expect(isSolved(CIPHERTEXT, { Q: 'T', V: 'A', Z: 'E' }, ANSWER)).toBe(false)
  })

  it('is solved when the full mapping spells the answer', () => {
    expect(isSolved(CIPHERTEXT, { Q: 'E', V: 'A', Z: 'T' }, ANSWER)).toBe(true)
  })

  // Solved is DERIVED from the mapping rather than latched, so the board stays interactive and
  // changing a letter un-solves it.
  it('stops being solved when a letter is taken back off', () => {
    expect(isSolved(CIPHERTEXT, { Q: 'E', V: 'A' }, ANSWER)).toBe(false)
  })

  it('is not solved on an empty mapping', () => {
    expect(isSolved(CIPHERTEXT, {}, ANSWER)).toBe(false)
  })

  // The unassigned-letter guard, isolated. Joining an undefined renders it as nothing at all, so
  // without the guard a two-square phrase with one letter placed spells 'X' -- which matches a
  // one-letter answer exactly, and the board would declare a half-empty phrase solved.
  it('is not solved when the unplaced squares would simply vanish', () => {
    expect(isSolved('VZ', { V: 'X' }, 'X')).toBe(false)
  })

  // A ciphertext with nothing to solve is not solved by an empty mapping. Reachable only from a
  // corrupt pack, and the alternative is a board that opens already won.
  it('is not solved on a ciphertext with no letters in it', () => {
    expect(isSolved('   ', {}, '')).toBe(false)
  })
})

describe('cipherLetters', () => {
  it('lists the distinct letters of the ciphertext in alphabetical order', () => {
    expect(cipherLetters(CIPHERTEXT)).toEqual(['Q', 'V', 'Z'])
  })

  it('ignores the spaces', () => {
    expect(cipherLetters('A A')).toEqual(['A'])
  })

  // lull-api enciphers with an uppercase-keyed derangement, so a ciphertext arrives uppercase --
  // but that is a fact about another repo, held by nothing on this side of the wire. Pinned here
  // so the board can look a square's cipher letter up in the mapping without checking the case of
  // a string it did not write.
  it('reads a lowercase ciphertext as the same letters', () => {
    expect(cipherLetters('vzq')).toEqual(['Q', 'V', 'Z'])
  })
})

// The grammar is `<pairs>|<opened>|<spent>`, and these rows are about the two fields the board never
// writes. The asymmetry they defend is stated at `hintTail` in the module: the pairs are refused
// WHOLE on a single bad character, because every fault there means the string belongs to a different
// puzzle, while a malformed ladder costs the ladder and nothing else -- the board beside it is still
// this player's work and still perfectly readable.
describe('the ladder field', () => {
  const LETTER_RUNG = { cipher: 'Q', kind: 'letter' } as const
  const WORD_RUNG = { index: 0, kind: 'word' } as const

  describe('decode', () => {
    it('reads the rungs and the count a stored string carries', () => {
      expect(decode('VAZT|2|LQ,W0', CIPHERTEXT)).toStrictEqual({
        hints: [LETTER_RUNG, WORD_RUNG],
        mapping: { V: 'A', Z: 'T' },
        opened: 2,
      })
    })

    // A LEGACY PAYLOAD READS AS NOTHING BOUGHT, which is what makes this deployable over boards
    // already on people's devices. There is no field, and no field is not a state to migrate.
    it('reads a board stored before the ladder existed as nothing bought', () => {
      expect(decode('VAZT', CIPHERTEXT)).toStrictEqual({ hints: [], mapping: { V: 'A', Z: 'T' }, opened: 0 })
    })

    it('reads the canonical empty as an untouched board with no ladder', () => {
      expect(decode('', CIPHERTEXT)).toStrictEqual({ hints: [], mapping: {}, opened: 0 })
    })

    // A rung bought before a single square was touched. The pairs field is legitimately empty and
    // the ladder is not, which is the one shape that proves the two fields are read independently.
    it('reads a ladder bought on a board with nothing on it', () => {
      expect(decode('|1|LQ', CIPHERTEXT)).toStrictEqual({ hints: [LETTER_RUNG], mapping: {}, opened: 1 })
    })

    // ONE ROW PER FAULT, and every one of them KEEPS THE BOARD. That is the whole point of the
    // second field being validated as its own step: a hand-edited byte in the ladder must never cost
    // a player the squares they filled in.
    it.each<[string, string]>([
      ['one field instead of two', 'VAZT|1'],
      ['three fields instead of two', 'VAZT|1|LQ|X'],
      ['a count that is not a number', 'VAZT|x|LQ'],
      ['a count with a sign on it', 'VAZT|+1|LQ'],
      ['a count below the rungs it stands beside', 'VAZT|0|LQ'],
      ['a count more than one past the last rung', 'VAZT|3|LQ'],
      // A REVEAL ON A LADDER OF ZERO, which `open` cannot produce from any board: the first press
      // either appends a rung or declines. Admitted, it put a free speculative rung on screen --
      // HintBar draws `slice(0, opened)` over a ladder whose tail the adapter folds from live state.
      ['a step paid on no rungs at all', 'VAZT|1|'],
      ['a rung of an unknown kind', 'VAZT|1|XE'],
      ['a letter rung naming no letter', 'VAZT|1|L'],
      ['a word rung naming no index', 'VAZT|1|W'],
      ['a word index longer than any legal phrase', 'VAZT|1|W100'],
      ['more rungs than the rule will ever sell', 'VAZT|4|LQ,LV,LZ,W0'],
    ])('drops a ladder with %s and keeps the board', (_description, progress) => {
      expect(decode(progress, CIPHERTEXT)).toStrictEqual({ hints: [], mapping: { V: 'A', Z: 'T' }, opened: 0 })
    })

    // THE MIRROR, and it is the row that fails if someone ever makes the ladder's validity depend on
    // the pairs beside it. A board that belongs to another puzzle is refused whole; the rungs the
    // player paid for are still theirs.
    it('drops a board that names a square this ciphertext has not got and keeps the ladder', () => {
      expect(decode('XB|1|LQ', CIPHERTEXT)).toStrictEqual({ hints: [LETTER_RUNG], mapping: {}, opened: 1 })
    })

    // The answer reveal: one step past the last rung, which is the count a derived one could never
    // express. See CryptogramHintTail.
    it('accepts a count one past the last rung, which is the answer reveal', () => {
      expect(decode('|2|LQ', CIPHERTEXT).opened).toEqual(2)
    })
  })

  describe('decodeHints', () => {
    it('reads the ladder without being told the ciphertext', () => {
      expect(decodeHints('VAZT|1|W0')).toStrictEqual({ hints: [WORD_RUNG], opened: 1 })
    })

    it('reads nothing from a board with no ladder on it', () => {
      expect(decodeHints('VAZT')).toStrictEqual({ hints: [], opened: 0 })
    })

    it('reads nothing from no stored progress at all', () => {
      expect(decodeHints(null)).toStrictEqual({ hints: [], opened: 0 })
    })

    // A FUNCTION AND NOT A SHARED CONSTANT. The array inside is handed to the adapter, which spreads
    // it to build the next purchase; one shared empty would be an array every board in the session
    // wrote into.
    it('hands every caller its own empty ladder', () => {
      const first = decodeHints(null)

      first.hints.push(LETTER_RUNG)

      expect(decodeHints(null).hints).toEqual([])
    })
  })

  describe('attachHints', () => {
    it('writes the count and the rungs after the board’s own portion', () => {
      expect(attachHints('VAZT', { hints: [LETTER_RUNG, WORD_RUNG], opened: 2 })).toEqual('VAZT|2|LQ,W0')
    })

    // An empty tail hands `boardWrite` back byte for byte, which is what keeps an untouched board
    // writing the shortest payload it always did -- and what makes a board stored before this change
    // read back and get re-written unchanged.
    it('hands the board’s own string back when nothing is bought', () => {
      expect(attachHints('VAZT', { hints: [], opened: 0 })).toEqual('VAZT')
    })

    // The reveal step: the count moves and no rung is appended, so the spent field is empty while
    // the count is not.
    it('writes a count with no rungs beside it once the answer is out', () => {
      expect(attachHints('VAZT', { hints: [], opened: 1 })).toEqual('VAZT|1|')
    })

    it('is read back by decode as what it wrote', () => {
      const tail = { hints: [LETTER_RUNG, WORD_RUNG], opened: 3 }

      expect(decode(attachHints(encode({ V: 'A' }), tail), CIPHERTEXT)).toStrictEqual({ ...tail, mapping: { V: 'A' } })
    })
  })
})

// The overlay the board draws and the adapter stores through -- ONE function, so the squares painted
// and the pairs written are the same arrangement rather than two that have to agree.
describe('withRevealed', () => {
  it('puts the revealed letters onto a board that has nothing on it', () => {
    expect(withRevealed({}, { V: 'A' })).toEqual({ V: 'A' })
  })

  it('leaves the player’s own guesses where they are', () => {
    expect(withRevealed({ Z: 'T' }, { V: 'A' })).toEqual({ V: 'A', Z: 'T' })
  })

  // It STEALS, exactly as `apply` does and for the same reason: a plain letter stands on one cipher
  // letter or on none. A wrong guess of A on Z has to be released, or the board would draw two
  // squares claiming the same letter -- the contradiction state the assignment table exists to make
  // unrepresentable.
  it('releases a wrong guess sitting on a letter a rung revealed', () => {
    expect(withRevealed({ Z: 'A' }, { V: 'A' })).toEqual({ V: 'A' })
  })

  it('overwrites a wrong guess on the very square a rung revealed', () => {
    expect(withRevealed({ V: 'I' }, { V: 'A' })).toEqual({ V: 'A' })
  })

  // NOT A FOLD OF `apply`, and this is the row that says why. `apply` is a toggle: row 4 clears a
  // square that already holds the tapped letter, so folding a rung over a board that had already
  // guessed that square right would empty the square the rung was bought to fill.
  it('leaves a square the player had already guessed correctly filled', () => {
    expect(withRevealed({ V: 'A' }, { V: 'A' })).toEqual({ V: 'A' })
  })

  // Idempotent, which the board depends on: a render after a render, and an Undo restoring a
  // snapshot taken after the purchase, both come out where they went in.
  it('changes nothing the second time it is applied', () => {
    const once = withRevealed({ Q: 'X', Z: 'A' }, { V: 'A' })

    expect(withRevealed(once, { V: 'A' })).toEqual(once)
  })

  it('does not mutate the board it is given', () => {
    const before: Mapping = { Z: 'A' }

    withRevealed(before, { V: 'A' })

    expect(before).toEqual({ Z: 'A' })
  })
})
