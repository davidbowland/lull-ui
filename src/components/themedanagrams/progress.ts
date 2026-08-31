import type { ThemedAnagramsSpentRung } from '@rules/hint-themed-anagrams'

// The four drafts on the board, in wire order. A tuple rather than string[] because the board has
// exactly four rows and a length this type does not pin is a length every read site has to check.
export type Guesses = [string, string, string, string]

/**
 * The ladder half of the stored record: which rungs were bought, and how many steps were paid for.
 *
 * `opened` IS STORED AND NOT DERIVED FROM `hints`, which is goFigure's grammar and for goFigure's
 * reason -- see `BoardState` in gofigure/board.ts. HintBar reaches "Show answer" only when `opened`
 * exceeds the ladder's length, so a bar has to be able to sell one step PAST the last rung, and a
 * count read off a three-rung list can never express four. Derived, the answer reveal is unreachable
 * on this bench.
 *
 * So the invariant this codec enforces is the loose one the design actually has: `opened` is the
 * number of rungs bought, or one more than that once the answer has been revealed.
 */
export interface ThemedAnagramsHintTail {
  hints: ThemedAnagramsSpentRung[]
  opened: number
}

/** What a stored string carries: the four drafts, and the ladder the player bought. */
export interface ThemedAnagramsBoardProgress extends ThemedAnagramsHintTail {
  guesses: Guesses
}

// The longest draft this grammar will carry back out of storage. An answer is 5-9 letters by the
// wire contract, so 64 is not a limit a player can reach by typing an answer -- it is the point at
// which a stored string stopped being something a text box produced.
//
// THE WRITER IS HELD TO IT HERE, not only on the box. The board's `maxLength` is the same number and
// is the reason a player never meets this, but a cap that lives only in the markup is a cap that a
// paste through a programmatic value set, or an IME commit, walks straight past -- and then `encode`
// produces a string `decode` refuses whole, which is four drafts silently gone on the next load.
// That is the same consequence the newline strip below exists to prevent, so it is prevented in the
// same place and by the same argument.
export const MAX_GUESS = 64

// A FUNCTION, not a shared constant. Every refusal hands its caller a tuple nobody else holds a
// reference to; one shared array would let a board write through it into the next restore.
//
// goFigure solves the same problem the other way, with a FROZEN shared `EMPTY_BOARD`
// (`gofigure/board.ts`), and the difference is worth a sentence rather than a silent divergence.
// Freezing works there because every path out of that function returns the frozen value or a fresh
// one built from it. Here the success path returns a mutable tuple, so a frozen empty would make
// "can the caller write to what it got back?" depend on which branch ran -- and that is a worse
// thing to reason about than one allocation per refusal.
const empty = (): Guesses => ['', '', '', '']

// Same rule, same reason, and it matters more here: the array inside is handed to the adapter, which
// spreads it to build the next purchase. A shared `[]` would be one array every board in the session
// extends.
const noHints = (): ThemedAnagramsHintTail => ({ hints: [], opened: 0 })

// The grammar is `<g0>\n<g1>\n<g2>\n<g3>|<opened>|<spent>`, with the two trailing fields OMITTED
// ENTIRELY when nothing is bought -- so an untouched board writes and reads back exactly the string
// it did before this existed, and every board already stored on a device is a legacy payload that
// needs no migration.
const FIELD = '|'
const RUNG_SEPARATOR = ','

// One rung, compactly: a kind letter and the entry it is aimed at. Two characters against the ~40 a
// JSON record of the same fact costs, on a string that is re-written on every keystroke.
//
// The index is a single digit 0-3 because this board is exactly four rows and refuses to draw any
// other length -- see `rows` in index.tsx. Refusing a wider index here is not pedantry: a rung naming
// entry 8 renders as "The 8th answer starts with ?." on a board with four rows in it, which is a
// sentence the shell would print verbatim.
const RUNG = /^[BIP][0-3]$/
const KINDS: Record<string, ThemedAnagramsSpentRung['kind']> = { B: 'bookends', I: 'initial', P: 'prefix3' }
const MARKS: Record<ThemedAnagramsSpentRung['kind'], string> = { bookends: 'B', initial: 'I', prefix3: 'P' }

// The rule's own ceiling, restated rather than imported: `RUNG_COUNT` is module-private in
// hint-themed-anagrams.ts, and a test that imported the bound it checks against would assert the cap
// against itself and pass at any value.
const MAX_SPENT = 3

/**
 * The four drafts as one opaque string the shell persists verbatim, or '' for an untouched board.
 *
 * NEWLINE-JOINED, EXACTLY FOUR PARTS: `<g0>\n<g1>\n<g2>\n<g3>`. JSON was rejected -- it needs a
 * try/catch, it needs a shape check that also refuses objects so a `__proto__` member cannot enter
 * through one, and it stores quoting and escaping for a payload that is four short words. A
 * `|`-joined string with an escape scheme was rejected for being more code than the thing it
 * encodes. Nothing else in this repo stores JSON in a progress key.
 *
 * THE TWO CHARACTERS THE GRAMMAR DEPENDS ON ARE REMOVED AT THE WRITE SITE, which is the only place
 * either can be removed without lying to somebody: a newline that reaches storage produces a string
 * with five parts and `decode` refuses it whole, and a `|` that reaches storage lands in a field
 * separator's position and would shift the ladder under the drafts -- and in both cases the player's
 * four drafts are silently gone on the next load, which is the one outcome this repair exists to
 * prevent. \r goes with \n: a paste from a Windows clipboard carries CRLF, and replacing only \n
 * would leave a bare \r in the middle of a guess.
 *
 * IT DOES NOT TRIM. A trim would rewrite what the player typed on the round trip, and their own box
 * is the only thing that decides what their draft is.
 *
 * '' IS CANONICAL for a board that is blank AND owes nothing to the ladder, because '' is what the
 * shell reads as "no progress" -- `wasSolvedBefore` and the shelf's started-state both key off it.
 *
 * THIS BOARD OWNS ITS OWN RUNG COUNT, exactly as goFigure owns its `_______|2|`, and the comment
 * that used to stand here said the opposite of all of it. The count is no longer in the shell's
 * `lull:hints:<puzzleId>`: it is in this string, beside the rungs it belongs with, because split
 * across two stores with different prune rules the count and the rungs can disagree and a board
 * showing pinned letters while offering "Open hint 1 of 3" is a state no test would think to write.
 *
 * So a blank board with rungs spent is EXACTLY the state the field exists to represent, and it is
 * `|2|I2,B3` -- emphatically not ''. `encode` cannot write that shape and does not try to: it writes
 * the drafts and nothing else, and `attachHints` puts the tail back through the adapter's `merge`,
 * so the hint fields have exactly one writer. A board that wrote them would be the second, and the
 * second writer is what destroys a rung the player paid for.
 */
export const encode = (guesses: Guesses): string => {
  // Both write-site repairs in one pass. THE ORDER DOES NOT MATTER and it is worth saying so,
  // because it looks like it should: `[\r\n|]` to a single space is length-preserving, so slicing
  // first would cut at exactly the same index. A test asserting the order was written, could not
  // fail, and was deleted rather than kept as decoration.
  //
  // THE ROUND TRIP IS TOTAL after the slice: for every `Guesses` value, `decode(encode(g))` returns
  // four strings `encode` would produce again unchanged. Without it the round trip held for every
  // input except an over-long draft, which encoded happily and then decoded to four empty strings --
  // a lossy write wearing the face of a successful one.
  const cleaned = guesses.map((guess) => guess.replace(/[\r\n|]/g, ' ').slice(0, MAX_GUESS))

  return cleaned.every((guess) => guess === '') ? '' : cleaned.join('\n')
}

// The four drafts, refused WHOLE and never in part.
//
// REFUSED WHOLE because a half-restored board -- two drafts back and two gone -- is a state with no
// test and no way back out, which is the refusal `gofigure/board.ts` states in the same words.
// Progress comes out of localStorage, which is a text box a player can type into, so every string
// here is untrusted input rather than something this app wrote.
//
// THE CHEAP CHECK COMES FIRST, and the order is the only thing it buys: the length bound is asked
// BEFORE the split, so a megabyte of valid-looking text is rejected without first being cut into a
// million pieces. `split` above reaches the same string with two `lastIndexOf` calls and allocates
// nothing, so the bound still stands in front of the only cut this codec makes.
//
// 4 * MAX_GUESS + 3 is exactly the longest BOARD PORTION `encode` can produce -- four maximal
// guesses and the three separators between them. It is measured against the board portion rather
// than the whole string now that a ladder can follow it, which is what keeps the paragraph below
// true: a bound that included the tail would refuse strings the two checks below would accept.
//
// THAT BOUND REFUSES NOTHING THE TWO CHECKS BELOW WOULD LET THROUGH, and saying so is more useful
// than implying otherwise. Because it is exactly the longest encodable board, any longer one must
// either split into some number of parts other than four or hold a part longer than MAX_GUESS; there
// is no third arrangement. So no test can redden its deletion, only its tightening, and the boundary
// round trip in the suite does that. It stays because it states the size intent where a reader is
// thinking about size, and because the split it skips is the expensive one.
//
// '' TAKES THE SAME PATH A REFUSAL TAKES -- it splits into one part, not four -- so the canonical
// empty needs no special case. That the grammar needs no exception for its own empty is the tell
// that it is the right shape.
//
// IT VALIDATES A SHAPE AND NEVER A WORD. Any string a text box can hold is a legitimate draft; there
// is nothing here that decides whether a guess is right, which stays with `isRight` in answers.ts.
const guessesOf = (board: string): Guesses => {
  if (board.length > 4 * MAX_GUESS + 3) return empty()

  const parts = board.split('\n')
  if (parts.length !== 4 || parts.some((part) => part.length > MAX_GUESS)) return empty()

  return [parts[0], parts[1], parts[2], parts[3]]
}

/**
 * The ladder, validated as its OWN step and dropped ON ITS OWN.
 *
 * THE ASYMMETRY WITH THE DRAFTS ABOVE IS THE POINT. A malformed board is refused whole because a
 * half-restored board is unusable; a malformed ladder costs the ladder and nothing else, because the
 * drafts beside it are still this player's work and still perfectly readable. A hand-edited byte in
 * a rung must never take away four words somebody typed.
 *
 * NO FIELDS AT ALL IS NOT A FAULT -- every board written before this grammar existed has none, which
 * is what makes this deployable with no migration.
 */
const hintTail = (rawOpened: string, rawSpent: string): ThemedAnagramsHintTail => {
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
  if (opened < tokens.length || opened > tokens.length + 1) return noHints()

  return { hints: tokens.map((token) => ({ entryIndex: Number(token[1]), kind: KINDS[token[0]] })), opened }
}

/**
 * A stored string cut into the board's portion and the ladder's.
 *
 * IT CUTS AT THE LAST TWO SEPARATORS, NOT THE FIRST, AND A DRAFT IS WHY. `encode` strips `|` at the
 * write site, so a string this app produced carries exactly two of them -- but a hand-edited key can
 * carry a draft with one in it, and cutting at the first would hand the ladder two fields sliced out
 * of the middle of somebody's word. Reading from the right is what makes a stray `|` unable to shift
 * the field: the two the ladder occupies are always the last two.
 *
 * A FAULT IN THE TAIL LEAVES THE WHOLE STRING AS THE BOARD, which is the other half of the same
 * decision. `A|B\nC\nD\nE` has one separator and no ladder, so the drafts keep it and decode to four
 * parts with a `|` in the first; `A|B|C\nD\nE\nF` has two, and the tail is refused on its own, so the
 * board is the whole string again rather than the single letter in front of the first separator.
 *
 * `second <= 0` IS LOAD-BEARING and is not a redundant guard on the -1 below it. `lastIndexOf(x, -1)`
 * searches from index 0 rather than from nowhere, so on a string whose only separator is its first
 * character it answers 0 -- and `first` and `second` would then name the same character, cutting a
 * zero-width field out of it.
 */
const split = (progress: string): { board: string; tail: ThemedAnagramsHintTail } => {
  const second = progress.lastIndexOf(FIELD)
  const first = second <= 0 ? -1 : progress.lastIndexOf(FIELD, second - 1)
  if (first < 0) return { board: progress, tail: noHints() }

  const tail = hintTail(progress.slice(first + 1, second), progress.slice(second + 1))
  return tail.opened === 0 ? { board: progress, tail } : { board: progress.slice(0, first), tail }
}

/**
 * The four drafts a stored string carries and the ladder the player bought.
 *
 * THE GRAMMAR IS `<g0>\n<g1>\n<g2>\n<g3>|<opened>|<spent>`, with the two trailing fields omitted
 * entirely when nothing is bought -- so every board stored before this change reads back exactly as
 * it always did, and a blank board with rungs spent is `|2|I2,B3` rather than ''.
 *
 * TWO STEPS THAT CANNOT COST EACH OTHER ANYTHING. `guessesOf` answers for the drafts and `hintTail`
 * for the ladder, and neither refusal reaches the other: a malformed rung leaves the four words the
 * player typed exactly where they were, and a board this codec cannot read leaves the rungs they
 * paid for exactly where they were. See `hintTail` for why the two postures differ.
 *
 * REFUSED WHOLE, NEVER IN PART -- see `guessesOf`, which is the whole of what that means here.
 */
export const decode = (progress: string | null): ThemedAnagramsBoardProgress => {
  if (progress === null) return { ...noHints(), guesses: empty() }

  const { board, tail } = split(progress)
  return { ...tail, guesses: guessesOf(board) }
}

/**
 * The ladder half of a stored string, read on its own.
 *
 * IT IS READ THIS WAY BECAUSE `merge` HAS NO OTHER WAY TO ASK. `HintAdapter.merge(boardWrite,
 * current)` is handed two strings and no puzzle -- deliberately, since its whole job is to say which
 * field belongs to whom and it has no business reading either side's meaning. The BOARD reads it too,
 * on every render, so a bought rung pins its letters without a remount.
 */
export const decodeHints = (progress: string | null): ThemedAnagramsHintTail =>
  progress === null ? noHints() : split(progress).tail

/**
 * A board write with the stored ladder re-attached: the codec half of the one-writer rule.
 *
 * The board wrote its four drafts through `encode` and knows nothing of the two hint fields. This
 * puts the tail back, and it is the ONLY writer of those fields -- see HintAdapter in the registry
 * for why a second one is unrepresentable rather than merely discouraged.
 *
 * AN EMPTY TAIL RETURNS `boardWrite` UNTOUCHED, byte for byte, which is what keeps an untouched board
 * writing the shortest payload it always did and what makes every board stored before this change a
 * legacy payload that needs no migration.
 *
 * It does NOT special-case an empty `boardWrite`. A board write of '' is Play again and must stay '',
 * but that is a decision about what a board MEANT, which belongs to the adapter that owns this type's
 * ladder rather than to a string joiner -- and `open` legitimately attaches a tail to '' when a
 * player buys a rung before typing anything.
 */
export const attachHints = (boardWrite: string, tail: ThemedAnagramsHintTail): string => {
  if (tail.opened === 0) return boardWrite

  const spent = tail.hints.map((rung) => `${MARKS[rung.kind]}${rung.entryIndex}`).join(RUNG_SEPARATOR)
  return `${boardWrite}${FIELD}${tail.opened}${FIELD}${spent}`
}
