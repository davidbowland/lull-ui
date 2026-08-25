// The four drafts on the board, in wire order. A tuple rather than string[] because the board has
// exactly four rows and a length this type does not pin is a length every read site has to check.
export type Guesses = [string, string, string, string]

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

/**
 * The four drafts as one opaque string the shell persists verbatim, or '' for an untouched board.
 *
 * NEWLINE-JOINED, EXACTLY FOUR PARTS: `<g0>\n<g1>\n<g2>\n<g3>`. JSON was rejected -- it needs a
 * try/catch, it needs a shape check that also refuses objects so a `__proto__` member cannot enter
 * through one, and it stores quoting and escaping for a payload that is four short words. A
 * `|`-joined string with an escape scheme was rejected for being more code than the thing it
 * encodes. Nothing else in this repo stores JSON in a progress key.
 *
 * THE ONE CHARACTER THE GRAMMAR DEPENDS ON IS REMOVED AT THE WRITE SITE, which is the only place it
 * can be removed without lying to somebody. A newline that reaches storage produces a string with
 * five parts, `decode` refuses it whole, and the player's four drafts are silently gone on the next
 * load. \r goes with it: a paste from a Windows clipboard carries CRLF, and replacing only \n would
 * leave a bare \r in the middle of a guess.
 *
 * IT DOES NOT TRIM. A trim would rewrite what the player typed on the round trip, and their own box
 * is the only thing that decides what their draft is.
 *
 * '' IS CANONICAL for an untouched board, because that is what the shell reads as "no progress" --
 * `wasSolvedBefore` and the shelf's started-state both key off it. This board owes the hint ladder
 * nothing when it is blank, unlike goFigure, whose `_______|2|` exists because that board owns its
 * own rung count; ours is owned by the shell's docked bar, in storage the board cannot see.
 */
export const encode = (guesses: Guesses): string => {
  // Both write-site repairs in one pass. THE ORDER DOES NOT MATTER and it is worth saying so,
  // because it looks like it should: `[\r\n]` to a single space is length-preserving, so slicing
  // first would cut at exactly the same index. A test asserting the order was written, could not
  // fail, and was deleted rather than kept as decoration.
  //
  // THE ROUND TRIP IS TOTAL after the slice: for every `Guesses` value, `decode(encode(g))` returns
  // four strings `encode` would produce again unchanged. Without it the round trip held for every
  // input except an over-long draft, which encoded happily and then decoded to four empty strings --
  // a lossy write wearing the face of a successful one.
  const cleaned = guesses.map((guess) => guess.replace(/[\r\n]/g, ' ').slice(0, MAX_GUESS))

  return cleaned.every((guess) => guess === '') ? '' : cleaned.join('\n')
}

/**
 * The four drafts a stored string carries, or four empty strings if it carries anything else.
 *
 * REFUSED WHOLE, NEVER IN PART. A half-restored board -- two drafts back and two gone -- is a state
 * with no test and no way back out, which is the refusal `gofigure/board.ts` states in the same
 * words. Progress comes out of localStorage, which is a text box a player can type into, so every
 * string here is untrusted input rather than something this app wrote.
 *
 * THE CHEAP CHECK COMES FIRST, and the order is the only thing it buys: the length bound is asked
 * BEFORE the split, so a megabyte of valid-looking text is rejected without first being cut into a
 * million pieces. 4 * MAX_GUESS + 3 is exactly the longest string `encode` can produce -- four
 * maximal guesses and the three separators between them.
 *
 * THAT BOUND REFUSES NOTHING THE TWO CHECKS BELOW WOULD LET THROUGH, and saying so is more useful
 * than implying otherwise. Because it is exactly the longest encodable string, any longer string
 * must either split into some number of parts other than four or hold a part longer than MAX_GUESS;
 * there is no third arrangement. So no test can redden its deletion, only its tightening, and the
 * boundary round trip in the suite does that. It stays because it states the size intent where a
 * reader is thinking about size, and because the split it skips is the expensive one.
 *
 * '' TAKES THE SAME PATH A REFUSAL TAKES -- it splits into one part, not four -- so the canonical
 * empty needs no special case. That the grammar needs no exception for its own empty is the tell
 * that it is the right shape.
 *
 * IT VALIDATES A SHAPE AND NEVER A WORD. Any string a text box can hold is a legitimate draft;
 * there is nothing here that decides whether a guess is right, which stays entirely with
 * `normalizeAnswer` on the board.
 */
export const decode = (progress: string | null): Guesses => {
  if (progress === null || progress.length > 4 * MAX_GUESS + 3) return empty()

  const parts = progress.split('\n')
  if (parts.length !== 4 || parts.some((part) => part.length > MAX_GUESS)) return empty()

  return [parts[0], parts[1], parts[2], parts[3]]
}
