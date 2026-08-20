import { apply, cipherLetters, decode, encode, isSolved, Mapping } from './mapping'

// V, Z and E are the letters the spec's own status-message examples use, so the six rows below read
// against the table in the design doc without translation. Under { E: 'E', V: 'A', Z: 'T' } this
// deciphers to ATE ATE TEA, which is the ANSWER the isSolved block checks against.
const CIPHERTEXT = 'VZE VZE ZEV'

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

describe('decode', () => {
  it('reads back what encode wrote', () => {
    const mapping: Mapping = { E: 'A', V: 'I', Z: 'T' }

    expect(decode(encode(mapping), CIPHERTEXT)).toEqual(mapping)
  })

  it('reads nothing from no stored progress', () => {
    expect(decode(null, CIPHERTEXT)).toEqual({})
  })

  it('reads nothing from an empty string', () => {
    expect(decode('', CIPHERTEXT)).toEqual({})
  })

  // A pack can be pruned and refetched, and a regenerated puzzle keeps neither its ciphertext nor
  // its id -- so stored progress is untrusted input, exactly as goFigure treats its expression.
  //
  // Every case below puts a VALID pair first, and that is the whole point of them. Each fault
  // rejects the WHOLE string, so the good pair in front of it has to be discarded too -- and a
  // single-pair input like 'V1' cannot tell rejecting the string apart from skipping the bad pair,
  // which is the same empty answer either way.
  it('rejects an odd-length string, dropping the pair it did read', () => {
    expect(decode('VAZ', CIPHERTEXT)).toEqual({})
  })

  it('rejects the whole string for a character outside A-Z', () => {
    expect(decode('VA1B', CIPHERTEXT)).toEqual({})
  })

  it('rejects the whole string for a lowercase pair', () => {
    expect(decode('VAvb', CIPHERTEXT)).toEqual({})
  })

  // A cipher letter that is not in this ciphertext names a square that does not exist. It is the
  // signature of progress restored against a different puzzle.
  // Twenty-six pairs is every letter of the alphabet assigned, so anything longer is not a board
  // this component wrote. `lull:progress:` is a string a player can hand-edit, and walking a
  // megabyte of it to return at most twenty-six entries is work nobody asked for.
  it('rejects a string longer than the alphabet without walking it', () => {
    expect(decode('VA'.repeat(27), CIPHERTEXT)).toEqual({})
  })

  it('accepts a string exactly as long as the alphabet allows', () => {
    expect(decode('VA'.padEnd(52, 'ZT'), CIPHERTEXT)).toEqual({ V: 'A', Z: 'T' })
  })

  it('rejects the whole string for a cipher letter the ciphertext does not contain', () => {
    expect(decode('VAQB', CIPHERTEXT)).toEqual({})
  })

  // A plain letter is on exactly one cipher letter or on none, always -- so a duplicate cannot be
  // rendered. Dropping the later pair keeps the earlier one rather than discarding the whole
  // restore, which would cost a player a board they legitimately built.
  it('keeps the first pair and drops a repeated plain letter', () => {
    expect(decode('VAZA', CIPHERTEXT)).toEqual({ V: 'A' })
  })

  it('keeps the first pair and drops a repeated cipher letter', () => {
    expect(decode('VAVB', CIPHERTEXT)).toEqual({ V: 'A' })
  })

  // The board has no reason to know the cipher is a derangement -- that is the generator's business.
  // A player may assign C to C, and a restore that silently dropped it would lose their work.
  it('keeps a self-pair', () => {
    expect(decode('VV', CIPHERTEXT)).toEqual({ V: 'V' })
  })
})

describe('apply', () => {
  // The six rows of the spec's table, exhaustively. C is the selected cipher letter, X the tapped
  // plain letter, Y whatever C already holds, B whatever cipher letter already holds X.
  //
  // Row 1 -- nothing selected -- is the board's business, not this function's: apply is never
  // reached without a selection.

  it('row 2: puts a free letter on an empty cipher letter', () => {
    expect(apply({}, 'V', 'I')).toEqual({ cleared: false, mapping: { V: 'I' }, released: null, stolenFrom: null })
  })

  // The assignment MOVES rather than the affordance disappearing, so the player is never blocked and
  // never has to clear something before trying something else. A contradiction is unrepresentable.
  it('row 3: steals a letter held by another cipher letter', () => {
    expect(apply({ Z: 'I' }, 'V', 'I')).toEqual({
      cleared: false,
      mapping: { V: 'I' },
      released: null,
      stolenFrom: 'Z',
    })
  })

  // The undo. Tapping the same key again clears it, whether the player never moved or moved to
  // another square showing the same cipher letter. This is why there is no Take back button.
  it('row 4: clears the cipher letter when it already holds the tapped letter', () => {
    expect(apply({ V: 'I' }, 'V', 'I')).toEqual({ cleared: true, mapping: {}, released: null, stolenFrom: null })
  })

  it('row 5: releases the letter the cipher letter was holding', () => {
    expect(apply({ V: 'E' }, 'V', 'I')).toEqual({
      cleared: false,
      mapping: { V: 'I' },
      released: 'E',
      stolenFrom: null,
    })
  })

  it('row 6: releases one letter and steals another', () => {
    expect(apply({ V: 'E', Z: 'I' }, 'V', 'I')).toEqual({
      cleared: false,
      mapping: { V: 'I' },
      released: 'E',
      stolenFrom: 'Z',
    })
  })

  it('leaves every other assignment alone', () => {
    expect(apply({ E: 'T', V: 'A' }, 'V', 'I').mapping).toEqual({ E: 'T', V: 'I' })
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
    expect(isSolved(CIPHERTEXT, { E: 'T', V: 'A', Z: 'E' }, ANSWER)).toBe(false)
  })

  it('is solved when the full mapping spells the answer', () => {
    expect(isSolved(CIPHERTEXT, { E: 'E', V: 'A', Z: 'T' }, ANSWER)).toBe(true)
  })

  // Solved is DERIVED from the mapping rather than latched, so the board stays interactive and
  // changing a letter un-solves it.
  it('stops being solved when a letter is taken back off', () => {
    expect(isSolved(CIPHERTEXT, { E: 'E', V: 'A' }, ANSWER)).toBe(false)
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
    expect(cipherLetters(CIPHERTEXT)).toEqual(['E', 'V', 'Z'])
  })

  it('ignores the spaces', () => {
    expect(cipherLetters('A A')).toEqual(['A'])
  })

  // lull-api enciphers with an uppercase-keyed derangement, so a ciphertext arrives uppercase --
  // but that is a fact about another repo, held by nothing on this side of the wire. Pinned here
  // so the board can look a square's cipher letter up in the mapping without checking the case of
  // a string it did not write.
  it('reads a lowercase ciphertext as the same letters', () => {
    expect(cipherLetters('vze')).toEqual(['E', 'V', 'Z'])
  })
})
