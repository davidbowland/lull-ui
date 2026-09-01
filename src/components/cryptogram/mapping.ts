import type { CryptogramSpentRung } from '@rules/hint-cryptogram'

/** Cipher letter to plain letter. The direction the player thinks in: "this square is an I". */
export type Mapping = Record<string, string>

/** What one assignment changed, so the board can name every state change it made off-screen. */
export interface Assignment {
  // The selected cipher letter is now empty -- row 4, the undo.
  cleared: boolean
  mapping: Mapping
  // The locked cipher letter that turned this assignment away -- rows 7 and 8, and null on every
  // other row. `mapping` comes back UNTOUCHED when it is set, so a caller that only wants to know
  // whether anything happened can compare identities; this field exists because the caller also has
  // to say WHICH square refused, and the two refusals are about different squares.
  refused: string | null
  // The plain letter the selected cipher letter was holding, now free again -- rows 5 and 6.
  released: string | null
  // The cipher letter that was holding the tapped plain letter, now empty -- rows 3 and 6.
  stolenFrom: string | null
}

/**
 * The ladder half of the stored record: which rungs were bought, and how many steps were paid for.
 *
 * `opened` IS STORED AND NOT DERIVED FROM `hints`, and the reason is not that the two could drift.
 * HintBar reaches "Show answer" only when `opened` exceeds the ladder's length -- see `controlLabel`
 * -- so a bar has to be able to sell one step PAST the last rung, and a count read off a three-rung
 * list can never express four. Derived, the answer reveal is unreachable on this bench. So the
 * invariant this codec enforces is the loose one the design actually has: `opened` is the number of
 * rungs bought, or one more than that once the answer has been revealed.
 *
 * An earlier draft argued cryptogram could take `opened` as `spent.length` because this board has no
 * Clear. That is true and irrelevant: Clear is goFigure's reason for a separate field and the answer
 * reveal is everyone's.
 */
export interface CryptogramHintTail {
  hints: CryptogramSpentRung[]
  opened: number
}

/** What a stored Cryptogram string decodes to: the board the player built, and the ladder they bought. */
export interface CryptogramBoardProgress extends CryptogramHintTail {
  mapping: Mapping
}

const PAIR_LENGTH = 2
const ALPHABET_LENGTH = 26
const LETTER = /^[A-Z]$/

// The grammar is `<pairs>|<opened>|<spent>`, and the bare `<pairs>` form is still a board this
// decoder reads -- see `decode`. `|` can never appear inside the pairs field, which is A-Z by
// construction, so the first occurrence is always the first separator and the split needs no
// escaping scheme.
const FIELD = '|'
const RUNG_SEPARATOR = ','

// One rung, compactly: `L` and a cipher letter, or `W` and a word index. Two characters for a letter
// rung and two or three for a word one, against the ~40 a JSON record of the same fact costs -- and
// this string is re-written on every tap, beside a mapping that is itself at most 52 characters.
//
// THIS IS THE SHAPE CHECK AND NOT THE BOUND. It says a rung is spelled the way this codec spells
// one; `withinPuzzle` below says the rung is about THIS puzzle. The two are separate because only
// the second needs a ciphertext, and `decodeHints` has none -- the same split phrazle's progress.ts
// makes between `isSpentRung` and `withinAnswer`.
//
// The index is bounded at two digits here because lull-api caps a cryptogram phrase at 80
// characters, so the most words a legal puzzle can hold is 40. That is a fact about the OTHER repo,
// which is why this bound is generous rather than exact -- the exact one is `withinPuzzle`.
const RUNG = /^(?:L[A-Z]|W\d{1,2})$/
// The rule's own ceiling, restated rather than imported: `RUNG_COUNT` is module-private in
// hint-cryptogram.ts, and a test that imported the bound it checks against would assert the cap
// against itself and pass at any value.
const MAX_SPENT = 3

// A FUNCTION, not a shared constant. Every refusal hands its caller an object nobody else holds a
// reference to; one shared value would let a board that restored an empty ladder write through it
// into every later restore in the same session. The array inside is the one that matters -- the
// adapter spreads it to build the next purchase.
const noHints = (): CryptogramHintTail => ({ hints: [], opened: 0 })

const lettersOf = (text: string): string[] => text.toUpperCase().match(/[A-Z]/g) ?? []

/** The distinct cipher letters the phrase actually uses, alphabetical. */
export const cipherLetters = (ciphertext: string): string[] => [...new Set(lettersOf(ciphertext))].sort()

/** The ciphertext's words. Index i here is index i of the answer's words, as the rule reads them. */
const cipherWords = (ciphertext: string): string[] =>
  ciphertext
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((word) => word.length > 0)

/**
 * The mapping as sorted `cipherplain` pairs -- BFDMGKHSJNKTMRPOQAUWVIXEZL.
 *
 * Sorted rather than insertion-ordered so the same board always writes the same string: progress is
 * written on every tap, and a key order that followed the player's route would churn storage for
 * nothing and make two identical boards compare unequal.
 *
 * IT WRITES THE PAIRS AND NOTHING ELSE, and its signature does not change now that the string can
 * carry a ladder. The board is its only caller and the board never writes the hint fields; the tail
 * is re-attached by `attachHints` below, through the adapter's `merge`, so those fields have exactly
 * one writer. A board that wrote them would be the second, and the second writer is what destroys a
 * rung the player paid for -- see HintAdapter in the registry.
 */
export const encode = (mapping: Mapping): string =>
  Object.keys(mapping)
    .sort()
    .map((cipher) => `${cipher}${mapping[cipher]}`)
    .join('')

/**
 * The pairs field back into a mapping, or an empty one.
 *
 * Untrusted input, exactly as goFigure treats its stored expression: a pack can be pruned and
 * refetched, and a regenerated puzzle keeps neither its ciphertext nor its id. Three faults reject
 * the WHOLE field, because each means this progress belongs to a different puzzle: an odd length,
 * a character outside A-Z, and a cipher letter the ciphertext does not contain.
 *
 * A duplicate is different. It is representable in the string but not on the board, so the first
 * pair wins and later ones are dropped rather than costing the player a board they did build.
 *
 * A self-pair is KEPT. The board has no reason to know the cipher is a derangement -- that is the
 * generator's business -- and a player may legitimately decide a square is the letter it shows.
 */
const pairsOf = (pairs: string, ciphertext: string): Mapping => {
  // Twenty-six pairs is every letter of the alphabet assigned, so anything longer cannot be a board
  // this component could have written. Rejected up front rather than walked: progress is a string a
  // player can hand-edit in devtools, and without a bound a megabyte of valid-looking pairs is a
  // half-million iterations to produce at most twenty-six entries.
  if (pairs.length > ALPHABET_LENGTH * PAIR_LENGTH) return {}
  if (pairs.length % PAIR_LENGTH !== 0) return {}

  const available = new Set(lettersOf(ciphertext))
  const mapping: Mapping = {}
  const taken = new Set<string>()

  for (let index = 0; index < pairs.length; index += PAIR_LENGTH) {
    const cipher = pairs[index]
    const plain = pairs[index + 1]
    if (!LETTER.test(cipher) || !LETTER.test(plain)) return {}
    if (!available.has(cipher)) return {}
    if (cipher in mapping || taken.has(plain)) continue
    mapping[cipher] = plain
    taken.add(plain)
  }
  return mapping
}

// One rung of the rule's own union, rebuilt from two or three characters. The pattern above is the
// whole of the validation, so this never has to ask again.
const rungOf = (token: string): CryptogramSpentRung =>
  token[0] === 'L' ? { cipher: token[1], kind: 'letter' } : { index: Number(token.slice(1)), kind: 'word' }

/**
 * The ladder, validated as its OWN step and dropped ON ITS OWN.
 *
 * THIS IS THE OPPOSITE POSTURE TO THE PAIRS ABOVE, and the difference is the whole reason the two
 * are separate functions. `pairsOf` refuses the WHOLE field on a single bad character, because every
 * fault it can see means the string belongs to a different puzzle and honoring part of it would put
 * squares on the board that the ciphertext does not have. A malformed rung says nothing of the kind:
 * the pairs beside it are still this board, still this player's work, and still perfectly readable.
 * So a fault here costs the ladder and nothing else -- a fact the board hands the player must not be
 * something a hand-edited byte three fields along takes away.
 *
 * NO FIELDS AT ALL IS NOT A FAULT. Every board written before this grammar existed is a bare pairs
 * string, which is the first clause: nothing bought, nothing dropped, nothing logged, no migration.
 *
 * BOTH FIELDS OR NEITHER after that, because `attachHints` writes both or neither. One without the
 * other is not a shape this app can produce, so it is a fault like any other.
 */
const hintTail = (rest: string[]): CryptogramHintTail => {
  if (rest.length === 0) return noHints()
  if (rest.length !== 2) return noHints()

  const [rawOpened, rawSpent] = rest
  // Text tested BEFORE the number, which is goFigure's rule for the same field. `Number` takes '',
  // ' 1', '+1', '1e0' and '0x2', so without this a single board would have several spellings and
  // this decoder's whole claim is that it has one.
  if (!/^\d+$/.test(rawOpened)) return noHints()
  const opened = Number(rawOpened)

  const tokens = rawSpent === '' ? [] : rawSpent.split(RUNG_SEPARATOR)
  if (tokens.length > MAX_SPENT || !tokens.every((token) => RUNG.test(token))) return noHints()

  // `opened` is the rung count, or one past it once the answer has been revealed. Below the count is
  // a record claiming rungs nobody paid for; further above it is a reveal on a ladder that never
  // reached its end.
  //
  // AND THE REVEAL NEEDS A LADDER TO BE PAST. A flat `tokens.length + 1` admitted `|1|` -- one step
  // paid on a ladder of zero -- which `open` cannot produce from any board: the first press either
  // appends a rung or declines. The bar then drew a free speculative rung, because HintBar shows
  // `slice(0, opened)` over a ladder whose tail this adapter folds forward from live state. The
  // ceiling is therefore the rung count, plus one only when there is a rung to be past.
  if (opened < tokens.length || opened > tokens.length + (tokens.length > 0 ? 1 : 0)) return noHints()

  return { hints: tokens.map(rungOf), opened }
}

/**
 * The two checks that need the PUZZLE rather than the grammar, and the only ones this codec makes
 * with a ciphertext in hand.
 *
 * A word rung naming word 9 of a five-word phrase renders as "One of the words is ?." and a letter
 * rung naming a cipher letter this ciphertext does not use renders as "Every Q is a ?." --
 * `cryptogramHintFor` reads both through `?? '?'` and composes the sentence anyway, and the shell
 * prints what it is handed verbatim. So the rung is refused here rather than printed. This is the
 * ladder half of the rule `pairsOf` already applies to the board half of the same string, and it is
 * the bound Themed Anagrams spells `[0-3]` in its pattern and Phrazle spells `withinAnswer`.
 *
 * THE WHOLE TAIL, NOT THE OFFENDING RUNG, for the reason `hintTail` gives above: three records whose
 * ORDER is the ladder and whose COUNT is the price the player paid cannot have one taken out of the
 * middle and still mean anything.
 */
const withinPuzzle = (tail: CryptogramHintTail, ciphertext: string): CryptogramHintTail => {
  const available = new Set(lettersOf(ciphertext))
  const words = cipherWords(ciphertext)

  return tail.hints.every((rung) => (rung.kind === 'letter' ? available.has(rung.cipher) : rung.index < words.length))
    ? tail
    : noHints()
}

/**
 * A stored string back into the board and the ladder it carries.
 *
 * THE GRAMMAR IS `<pairs>|<opened>|<spent>`, and the BARE `<pairs>` form is still read. Every board
 * stored before this change is that form, so a returning player's squares survive the deploy without
 * a migration, a version byte or a transitional shape -- they simply have no ladder, which is the
 * truth about them.
 *
 * '' STAYS CANONICAL for an untouched board, because that is what the shell reads as "no progress"
 * -- `wasSolvedBefore` and the shelf's started-state both key off it. It takes the same path a bare
 * pairs string takes: no separator, no fields, an empty mapping and an empty ladder.
 *
 * THE FIRST `|` IS ALWAYS THE FIRST SEPARATOR. The pairs field is A-Z by construction, so unlike the
 * themed anagrams grammar -- whose board portion is free text a player types -- there is no draft
 * here that could carry the delimiter and shift the fields under it.
 */
export const decode = (progress: string | null, ciphertext: string): CryptogramBoardProgress => {
  if (progress === null) return { ...noHints(), mapping: {} }

  const cut = progress.indexOf(FIELD)
  const pairs = cut === -1 ? progress : progress.slice(0, cut)
  const rest = cut === -1 ? [] : progress.slice(cut + 1).split(FIELD)

  return { ...withinPuzzle(hintTail(rest), ciphertext), mapping: pairsOf(pairs, ciphertext) }
}

/**
 * The ladder half of a stored string, read WITHOUT the ciphertext.
 *
 * IT TAKES NO CIPHERTEXT BECAUSE `merge` HAS NONE. `HintAdapter.merge(boardWrite, current)` is handed
 * two strings and no puzzle -- deliberately, since its whole job is to say which field belongs to
 * whom and it has no business reading either side's meaning. The BOARD reads it too, on every render,
 * for the same reason from the other end: the lock set is a fact about the ladder alone, and asking
 * for it through `decode` would re-walk 52 characters of pairs to answer a question about the tail.
 *
 * SO THIS AND `decode` DISAGREE ON EXACTLY ONE CLASS OF INPUT, and it is named rather than left to be
 * found: a stored rung naming a word this phrase does not have or a cipher letter this ciphertext
 * does not use. `decode` drops the tail and this keeps it, which is phrazle's arrangement and
 * phrazle's trade. Nothing in this app writes such a string; every path that RENDERS a rung goes
 * through `decode`, so no `?` sentence can reach a player; a letter rung the ciphertext does not hold
 * locks a square that does not exist and draws nothing; and the next purchase overwrites the record.
 * The alternative is an `opened` and a `merge` that take a puzzle they have no other use for.
 */
export const decodeHints = (progress: string | null): CryptogramHintTail => {
  if (progress === null) return noHints()
  const cut = progress.indexOf(FIELD)
  return cut === -1 ? noHints() : hintTail(progress.slice(cut + 1).split(FIELD))
}

/**
 * A board write with the stored ladder re-attached: the codec half of the one-writer rule.
 *
 * The board wrote its own portion through `encode` and knows nothing of the two hint fields. This
 * puts the tail back, and it is the ONLY writer of those fields -- see HintAdapter in the registry
 * for why a second one is unrepresentable rather than merely discouraged.
 *
 * AN EMPTY TAIL RETURNS `boardWrite` UNTOUCHED, byte for byte, which is what keeps an untouched board
 * writing the shortest payload it always did and what makes every board stored before this change a
 * legacy payload that needs no migration.
 *
 * IT DOES NOT SPECIAL-CASE AN EMPTY `boardWrite`, and nothing above it does either any more. '' is
 * what `encode({})` writes when the last square comes off, which is a player clearing their board and
 * not a reset -- this bench has no Play again at all. A board write is a board write. `open` also
 * attaches a tail to '' legitimately, when a player buys a rung before touching a square.
 */
export const attachHints = (boardWrite: string, tail: CryptogramHintTail): string => {
  if (tail.opened === 0) return boardWrite

  const spent = tail.hints
    .map((rung) => (rung.kind === 'letter' ? `L${rung.cipher}` : `W${rung.index}`))
    .join(RUNG_SEPARATOR)
  return `${boardWrite}${FIELD}${tail.opened}${FIELD}${spent}`
}

/**
 * The player's board with the letters a rung handed over standing on it: what the bench DRAWS.
 *
 * ONE IMPLEMENTATION, THREE CALLERS, and that is the whole reason it is here rather than inline in
 * any of them. `hints.ts` runs it to compose the string it stores at the moment of purchase, and the
 * board runs it on every render against the live progress prop -- so what is drawn and what is
 * stored are the same arrangement of letters by construction rather than by two functions agreeing.
 * The third is the board's UNDO, which re-overlays the same rungs onto the snapshot it restores;
 * that caller is only correct because of the idempotence noted at the bottom of this comment.
 *
 * IT STEALS, exactly as `apply` does, and for the same reason: a plain letter stands on one cipher
 * letter or on none. A player holding a wrong guess of A on Z when a rung reveals that V is the A
 * would otherwise see two squares claiming the same letter, which is the contradiction state this
 * board's whole assignment table exists to make unrepresentable.
 *
 * IT IS NOT A FOLD OF `apply`. `apply` is a TOGGLE -- row 4 clears a square that already holds the
 * tapped letter -- so folding a rung over a board that had already guessed that square correctly
 * would empty the very square the rung was bought to fill.
 *
 * IDEMPOTENT, which the board depends on: re-applying a revealed pair to a mapping that already
 * carries it changes nothing, so a render after a render, and an Undo restoring a snapshot taken
 * after the purchase, both come out where they went in.
 */
export const withRevealed = (mapping: Mapping, revealed: Mapping): Mapping => {
  const taken = new Set(Object.values(revealed))
  const kept = Object.keys(mapping).filter((cipher) => revealed[cipher] === undefined && !taken.has(mapping[cipher]))

  return { ...Object.fromEntries(kept.map((cipher) => [cipher, mapping[cipher]])), ...revealed }
}

// Shared by every caller that has no ladder to speak of, and safe to share because nothing here ever
// writes to it -- `apply` only ever asks.
const NOTHING_LOCKED: ReadonlySet<string> = new Set<string>()

/**
 * Assign `plain` to `cipher`. A toggle that steals, and that a lock can turn away.
 *
 * The complete contract is the six-row table in the design doc plus the two rows below it, and every
 * row falls out of these five branches. Duplicates are unrepresentable by construction: the
 * assignment MOVES rather than the affordance disappearing, so there is no contradiction state, no
 * warning glyph, and nothing to flag -- and the player is never blocked and never has to clear
 * something before trying something else.
 *
 * ROWS 7 AND 8 ARE THE TWO REFUSALS A LOCK ADDS, and they come from ONE rule rather than two: a fact
 * the board HANDS the player must not be something the next tap takes away. A rung writes the true
 * letter into the grid and charges for it, so a square that can be retyped over -- or quietly emptied
 * from the other side of the phrase, by a tap that wanted its letter somewhere else -- is a purchase
 * the board can spend on the player's behalf, silently, with nothing on screen to say it happened.
 *
 *   7. The selected cipher letter is locked. Every assignment to it is refused, INCLUDING the row-4
 *      toggle -- the eraser reaches `apply` with the letter the square already holds, so a lock that
 *      only guarded overwrites would leave Backspace and the pad's Delete key as a way to empty it.
 *   8. The tapped plain letter is standing on a locked cipher letter. It cannot be stolen away from
 *      there, so the tap does nothing rather than emptying a revealed square somewhere else.
 *
 * STEALING FROM AN UNLOCKED SQUARE STILL WORKS, and rows 3 and 6 are untouched: a wrong guess holding
 * the letter is released exactly as before. Only a locked owner refuses.
 *
 * Row 8 is unreachable from a rung's OWN write -- `withRevealed` composes the revealed letters
 * directly and never routes through here, and the true mapping is injective, so no two locked squares
 * can want one letter -- but it is reachable from every ordinary tap, which is the case it is for.
 *
 * `locked` DEFAULTS TO EMPTY so every caller that predates the ladder compiles and behaves unchanged;
 * the board passes the live set on every call.
 */
export const apply = (
  mapping: Mapping,
  cipher: string,
  plain: string,
  locked: ReadonlySet<string> = NOTHING_LOCKED,
): Assignment => {
  const held = mapping[cipher] ?? null
  const owner = Object.keys(mapping).find((letter) => mapping[letter] === plain) ?? null

  // Rows 7 and 8. The mapping comes back BY IDENTITY rather than as a copy, so "nothing happened" is
  // the caller's cheapest check -- goFigure's `write` answers a locked cell the same way.
  if (locked.has(cipher)) return { cleared: false, mapping, refused: cipher, released: null, stolenFrom: null }
  if (owner !== null && locked.has(owner)) {
    return { cleared: false, mapping, refused: owner, released: null, stolenFrom: null }
  }

  const next = { ...mapping }

  // Row 4: the same key tapped again. This is the undo, and it is why there is no Take back button.
  if (owner === cipher) {
    delete next[cipher]
    return { cleared: true, mapping: next, refused: null, released: null, stolenFrom: null }
  }

  // Rows 3 and 6: take it off whoever had it.
  if (owner !== null) delete next[owner]
  next[cipher] = plain

  // `released` is rows 5 and 6 -- the letter this square was holding is free again.
  return { cleared: false, mapping: next, refused: null, released: held, stolenFrom: owner }
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
