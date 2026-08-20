/** Cipher letter to plain letter. The direction the player thinks in: "this square is an I". */
export type Mapping = Record<string, string>

/** What one assignment changed, so the board can name every state change it made off-screen. */
export interface Assignment {
  // The selected cipher letter is now empty -- row 4, the undo.
  cleared: boolean
  mapping: Mapping
  // The plain letter the selected cipher letter was holding, now free again -- rows 5 and 6.
  released: string | null
  // The cipher letter that was holding the tapped plain letter, now empty -- rows 3 and 6.
  stolenFrom: string | null
}

const PAIR_LENGTH = 2
const ALPHABET_LENGTH = 26
const LETTER = /^[A-Z]$/

const lettersOf = (text: string): string[] => text.toUpperCase().match(/[A-Z]/g) ?? []

/** The distinct cipher letters the phrase actually uses, alphabetical. */
export const cipherLetters = (ciphertext: string): string[] => [...new Set(lettersOf(ciphertext))].sort()

/**
 * The mapping as sorted `cipherplain` pairs -- BFDMGKHSJNKTMRPOQAUWVIXEZL.
 *
 * Sorted rather than insertion-ordered so the same board always writes the same string: progress is
 * written on every tap, and a key order that followed the player's route would churn storage for
 * nothing and make two identical boards compare unequal.
 */
export const encode = (mapping: Mapping): string =>
  Object.keys(mapping)
    .sort()
    .map((cipher) => `${cipher}${mapping[cipher]}`)
    .join('')

/**
 * Stored progress back into a mapping, or an empty one.
 *
 * Untrusted input, exactly as goFigure treats its stored expression: a pack can be pruned and
 * refetched, and a regenerated puzzle keeps neither its ciphertext nor its id. Three faults reject
 * the WHOLE string, because each means this progress belongs to a different puzzle: an odd length,
 * a character outside A-Z, and a cipher letter the ciphertext does not contain.
 *
 * A duplicate is different. It is representable in the string but not on the board, so the first
 * pair wins and later ones are dropped rather than costing the player a board they did build.
 *
 * A self-pair is KEPT. The board has no reason to know the cipher is a derangement -- that is the
 * generator's business -- and a player may legitimately decide a square is the letter it shows.
 */
export const decode = (progress: string | null, ciphertext: string): Mapping => {
  // Twenty-six pairs is every letter of the alphabet assigned, so anything longer cannot be a board
  // this component could have written. Rejected up front rather than walked: progress is a string a
  // player can hand-edit in devtools, and without a bound a megabyte of valid-looking pairs is a
  // half-million iterations to produce at most twenty-six entries.
  if (progress === null || progress.length > ALPHABET_LENGTH * PAIR_LENGTH) return {}
  if (progress.length % PAIR_LENGTH !== 0) return {}

  const available = new Set(lettersOf(ciphertext))
  const mapping: Mapping = {}
  const taken = new Set<string>()

  for (let index = 0; index < progress.length; index += PAIR_LENGTH) {
    const cipher = progress[index]
    const plain = progress[index + 1]
    if (!LETTER.test(cipher) || !LETTER.test(plain)) return {}
    if (!available.has(cipher)) return {}
    if (cipher in mapping || taken.has(plain)) continue
    mapping[cipher] = plain
    taken.add(plain)
  }
  return mapping
}

/**
 * Assign `plain` to `cipher`. A toggle that steals.
 *
 * The complete contract is the six-row table in the design doc, and every row falls out of these
 * three branches. Duplicates are unrepresentable by construction: the assignment MOVES rather than
 * the affordance disappearing, so there is no contradiction state, no warning glyph, and nothing to
 * flag -- and the player is never blocked and never has to clear something before trying something
 * else.
 */
export const apply = (mapping: Mapping, cipher: string, plain: string): Assignment => {
  const held = mapping[cipher] ?? null
  const owner = Object.keys(mapping).find((letter) => mapping[letter] === plain) ?? null
  const next = { ...mapping }

  // Row 4: the same key tapped again. This is the undo, and it is why there is no Take back button.
  if (owner === cipher) {
    delete next[cipher]
    return { cleared: true, mapping: next, released: null, stolenFrom: null }
  }

  // Rows 3 and 6: take it off whoever had it.
  if (owner !== null) delete next[owner]
  next[cipher] = plain

  // `released` is rows 5 and 6 -- the letter this square was holding is free again.
  return { cleared: false, mapping: next, released: held, stolenFrom: owner }
}

/**
 * Whether the mapping spells the answer.
 *
 * DERIVED, never latched: the board stays interactive after a solve and taking a letter back off
 * un-solves it. Compared on letters only, so the answer's original casing and spacing do not have to
 * survive the round trip.
 */
export const isSolved = (ciphertext: string, mapping: Mapping, answer: string): boolean => {
  const letters = lettersOf(ciphertext)
  if (letters.length === 0) return false
  if (letters.some((letter) => mapping[letter] === undefined)) return false
  return letters.map((letter) => mapping[letter]).join('') === lettersOf(answer).join('')
}
