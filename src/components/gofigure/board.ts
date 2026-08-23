import { evaluateLeftToRight } from './evaluate'
import { GoFigureData, GoFigureHint, GoFigureHintLadder, Operator, OperatorSlot } from '@types'

// N O N O N O N. Seven cells, and a CONSTANT rather than a length computed from the bank: lull-api
// fixes the bank at four permanently, so a board that derived this would be arithmetic standing in
// for a fact. The old rail grew and shrank with the taps; these cells do not, which is what lets a
// hint drop an operator into slot 2 while slots 0 and 1 are still empty.
export const CELL_COUNT = 7
const DIGIT_COUNT = 4
const OPERATOR_COUNT = 3
const EMPTY = '_'
const FIELD = '|'

export interface BoardState {
  // Bank INDICES, not digits. A bank of 9,3,9,9 has three tiles that all write "9", so a digit
  // character cannot say which tile was spent -- and deriving it by finding the first unspent match
  // is exactly what dimmed tile 1 when tile 4 was tapped, the bug the comment at index.tsx:161
  // records. Storing the character in progress would rebuild that bug on every reload, because the
  // reload would have to guess again. Storing the index also makes validation strictly stronger: a
  // uniqueness check over four indices replaces a multiset check over repeated digits.
  digits: (number | null)[]
  // The operator slots currently held by a hint. Always a SUBSET of the slots named by the rungs
  // below `opened`, never a superset -- and never derivable from `opened`, because Clear empties
  // this while leaving the count alone. A cleared board with two rungs spent legitimately has an
  // open ladder and no locks, and that state has to be representable.
  locked: OperatorSlot[]
  // How many rungs the player has paid for. It lives here, in the progress string the board already
  // owns, rather than in `lull:hints:<puzzleId>` with the phrase benches. Split across two stores
  // with different prune rules and different self-healing, the count and the locks can disagree,
  // and a board showing locked cells while offering "Open hint 1 of 3" is a state no test would
  // think to write. Co-locating makes it unrepresentable.
  opened: number
  operators: (Operator | null)[]
}

// FROZEN, arrays and all, and that is load-bearing rather than tidy. Every rejection path in
// `decode` returns this object by identity, and `write`, `clearCell` and `applyHint` spread their
// input -- so the array a mutator did not touch is still this module's own array, handed onward into
// React state that will hold it for the life of the page. One stray push corrupts every board in the
// session. Under strict-mode ESM the freeze turns that into a throw at the line that did it.
export const EMPTY_BOARD: BoardState = Object.freeze({
  digits: Object.freeze(Array(DIGIT_COUNT).fill(null)) as (number | null)[],
  locked: Object.freeze([] as OperatorSlot[]) as OperatorSlot[],
  opened: 0,
  operators: Object.freeze(Array(OPERATOR_COUNT).fill(null)) as (Operator | null)[],
})

// Even indices are digit cells, odd index i is operator slot (i - 1) / 2. Two helpers rather than
// one `kindOf`, because every call site wants a boolean or a slot and never a discriminant.
export const isDigitCell = (index: number): boolean => index % 2 === 0
export const slotOf = (index: number): OperatorSlot => ((index - 1) / 2) as OperatorSlot

const isBlank = (state: BoardState): boolean =>
  state.digits.every((digit) => digit === null) && state.operators.every((operator) => operator === null)

// The grammar is `<cells>|<opened>|<locked>`.
//
// '' means "no progress" to the shell -- puzzle-frame reads it that way and so does the shelf -- so
// the canonical empty is reserved for a board that is blank AND owes nothing to the ladder. A board
// cleared with two rungs spent is `_______|2|`, which is emphatically not the same thing: the
// player paid for those rungs and the sheet must still list them after a reload.
export const encode = (state: BoardState): string => {
  if (isBlank(state) && state.opened === 0) return ''

  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => {
    const value = isDigitCell(index) ? state.digits[index / 2] : state.operators[slotOf(index)]
    return value === null ? EMPTY : String(value)
  }).join('')

  // Ascending, so the string has one spelling per state and decode can insist on it. A default sort
  // is lexicographic, which for the single characters 0, 1 and 2 is the numeric order anyway.
  const locked = [...state.locked].sort().join('')
  return `${cells}${FIELD}${state.opened}${FIELD}${locked}`
}

// One character, 0 to 9. That single-digit bound is an assumption about the pack, not a fact this
// module can check: a bank tile of 10 or more would be classified as an operator by every caller of
// this, and the board would refuse to restore it. lull-api draws the bank from 1-9, and `runningTotal`
// and `expressionOf` both already read the expression as a bare token join, which a two-digit tile
// would make ambiguous anyway -- so the bound belongs to the game, not to this line.
const isDigit = (token: string): boolean => /^\d$/.test(token)

// The legacy grammar: a bare token join, digits at even positions and operators at odd ones, which
// is what this board wrote before it had cells. Migrated rather than dropped so that boards in
// flight at deploy survive -- a player mid-puzzle when the new build lands keeps their expression.
//
// Tile identity is rebound here by first-unspent match, and this is the one place that assignment is
// correct. The old string carried digits and not tiles, so which of three identical 9s was spent is
// not something it ever held, and no tile is under a finger for the choice to contradict. That is
// the same argument the old `restore` made, and it does not survive the move into the cell grammar:
// once the string can say which tile, guessing is a bug.
const migrate = (progress: string, data: GoFigureData): BoardState => {
  // The join check is what refuses anything the token pattern skipped -- spaces, letters, a minus
  // sign the pack does not offer. A match that drops characters would otherwise read "6 + 9" as a
  // clean three-token board.
  const tokens = progress.match(/\d|[+\-*/]/g) ?? []
  if (tokens.join('') !== progress || tokens.length > CELL_COUNT) return EMPTY_BOARD

  const taken = data.bank.map(() => false)
  const digits: (number | null)[] = Array(DIGIT_COUNT).fill(null)
  const operators: (Operator | null)[] = Array(OPERATOR_COUNT).fill(null)

  const ok = tokens.every((token, index) => {
    // Digits sit at even positions and operators at odd ones. Two digits in a row would read as one
    // two-digit number, which no accepted solution ever contains, so a left-packed "66" is refused
    // rather than rebuilt as a board its own buttons could not reach.
    if (isDigit(token) !== isDigitCell(index)) return false
    if (!isDigit(token)) {
      if (!data.operators.includes(token as Operator)) return false
      operators[slotOf(index)] = token as Operator
      return true
    }
    const tile = data.bank.findIndex((digit, at) => !taken[at] && digit === Number(token))
    if (tile < 0) return false
    taken[tile] = true
    digits[index / 2] = tile
    return true
  })

  // A migrated board has spent no rungs, so `opened` is 0 and `locked` is empty -- which means it
  // passes the ladder cross-check in `decode` trivially and does not need to be run back through it.
  return ok ? { digits, locked: [], opened: 0, operators } : EMPTY_BOARD
}

// Untrusted input, every time. A pack can be pruned and refetched, a regenerated puzzle keeps
// neither its bank nor its id, and localStorage is a text box the player can type into. Anything
// that does not describe a board the board's own buttons could have reached is dropped whole rather
// than partially honored: a half-restored board is a state with no test and no way back out.
export const decode = (progress: string | null, data: GoFigureData): BoardState => {
  // The PACK is untrusted too, and this is the guard the rest of the function was written without.
  // `isValidPuzzle` in the storage service deliberately leaves `data` opaque -- it checks what the
  // shell dereferences, not what a puzzle type means -- so a pack cached before the hints deploy is
  // a VALID pack that happens to arrive with `data.hints` undefined. A throw here would land in
  // render with no error boundary above it, the root would unmount to a white page, and the storage
  // self-heal would never fire, because the pack really is valid. It would stay broken until the
  // player cleared site data. Structural, in the register `hintsOf` already uses: shape in, or
  // nothing out.
  if (!Array.isArray(data.bank) || !Array.isArray(data.operators)) return EMPTY_BOARD
  if (progress === null || progress === '') return EMPTY_BOARD
  if (!progress.includes(FIELD)) return migrate(progress, data)

  // The ladder is checked HERE rather than with the bank above, and the placement is the whole point.
  // A legacy string only ever exists on a board played against the PRE-HINTS build, whose pack is the
  // pre-hints pack -- so `data.hints` is undefined on exactly the packs that produce one. Guarding it
  // before the migrate dispatch made the migration unreachable for its own audience, and the spec's
  // promise that boards in flight survive the deploy was quietly false: the player opened a puzzle
  // they were halfway through and found it empty.
  //
  // Nothing defensive is lost by tolerating it. `migrate` hardcodes `opened: 0` and an empty
  // `locked`, so it never reads a rung, and the two sites below that DO read one both behave
  // correctly against an empty ladder: `opened > 0` is refused because nothing can justify it, and
  // the lock cross-check finds no rung and rejects. So a stale pack restores exactly the boards it
  // can produce -- `opened: 0`, no locks -- which is all of them, since `hasLadder` already refuses
  // to draw the hint control on a pack with no ladder.
  //
  // Bailing outright here was still wrong even after it moved below the migrate dispatch, and the
  // failure it left was worse than the one it fixed. A stale-pack board came back through `migrate`
  // on the first load, the player's next tap wrote the new grammar, and the load AFTER that hit this
  // line and returned empty. The migration rescued the board and then destroyed it, one write later,
  // with every subsequent write re-arming it.
  const ladder: unknown[] = Array.isArray(data.hints) ? data.hints : []

  const fields = progress.split(FIELD)
  if (fields.length !== 3) return EMPTY_BOARD

  const [cells, rawOpened, rawLocked] = fields
  // Spread once and measure THAT. `String.length` counts UTF-16 units while the spread iterates code
  // points, so checking `cells.length` and then walking `[...cells]` lets the two lines disagree
  // about what a cell is -- an astral character is one cell to the loop and two to the check.
  const run = [...cells]
  if (run.length !== CELL_COUNT) return EMPTY_BOARD

  // A single digit, tested as text before it is a number. `Number` would take '', ' 1', '+1', '1e0'
  // and '0x2' as well, so a string that never round-tripped out of `encode` could restore a count
  // the encoder cannot spell. The bound is the LADDER's length and not OPERATOR_COUNT: they are both
  // three today, and they mean different things.
  if (!isDigit(rawOpened)) return EMPTY_BOARD
  const opened = Number(rawOpened)
  // `ladder.length + 1`, and the extra one is the ANSWER rather than a fourth rung. Once every rung
  // is spent the bar offers "Show answer", and that press advances this same count one further -- so
  // the reveal rides in the field the rungs already ride in, and Play again clears both by writing
  // ''. No `hints[]` index is ever taken from it: `openHint` in index.tsx branches before it reads a
  // rung, and the lock cross-check below only ever asks whether a rung index is BELOW it.
  //
  // Rejecting it would not merely refuse the value -- `decode` drops the whole string, so a player
  // who revealed the answer would come back to an empty board with all three paid-for rungs gone.
  if (opened > ladder.length + 1) return EMPTY_BOARD

  const digits: (number | null)[] = Array(DIGIT_COUNT).fill(null)
  const operators: (Operator | null)[] = Array(OPERATOR_COUNT).fill(null)
  const spent = new Set<number>()

  const cellsOk = run.every((token, index) => {
    if (token === EMPTY) return true
    if (isDigitCell(index)) {
      // Text test BEFORE the number. `Number` maps every whitespace character to 0 -- a space, a
      // tab, a non-breaking space -- and `Number.isInteger(0)` then holds, so ' ______|0|' would
      // decode identically to '0______|0|'. No forged state comes of it, because the aliased index
      // is a real one, but it gives a single board more than one spelling and this decoder's whole
      // claim is that there is exactly one.
      if (!isDigit(token)) return false
      const tile = Number(token)
      if (tile >= data.bank.length || spent.has(tile)) return false
      spent.add(tile)
      digits[index / 2] = tile
      return true
    }
    if (!data.operators.includes(token as Operator)) return false
    operators[slotOf(index)] = token as Operator
    return true
  })
  if (!cellsOk) return EMPTY_BOARD

  // Same whitespace coercion, same fix: '\t' would otherwise read as slot 0.
  const rawSlots = [...rawLocked]
  if (!rawSlots.every(isDigit)) return EMPTY_BOARD

  const locked = rawSlots.map(Number) as OperatorSlot[]
  const lockedOk =
    // Ascending and distinct, which is the one spelling `encode` writes. Accepting "10" as well
    // would give the same board two strings and quietly widen what this function has to mean.
    locked.every((slot, at) => at === 0 || locked[at - 1] < slot) &&
    locked.every((slot) => {
      // Indexed by RUNG, never by slot. lull-api orders rungs by how much each reveals, so a
      // difficulty-4 ladder runs slots 1, 0, 2 -- `data.hints[slot]` would be a different rung
      // entirely, and would pass most of the tests in this file while getting this one backwards.
      //
      // The rung naming this slot must have been REACHED, and the cell must hold exactly what that
      // rung revealed. Together those are what stop a hand-edited string from claiming a rung it
      // never spent, or locking an operator the ladder never gave.
      //
      // `findIndex` takes the FIRST rung naming the slot, which assumes lull-api's order table is a
      // permutation of 0 1 2 -- one rung per slot. That holds today and §1 of the spec relies on it.
      // If two rungs ever named one slot, the later one would be unreachable here and a legitimate
      // board locked by it would silently decode to empty, which is a data change this file cannot
      // detect and would not report.
      //
      // The rung itself is read DEFENSIVELY, and the array guard above is not enough to make that
      // unnecessary. A pack cached before the ladder shipped carries three bare strings, which is an
      // array and passes `Array.isArray` intact -- and `'…'.metadata` is undefined, so reading
      // `.slot` off it throws. This runs inside the board's `useState` initializer, so that throw
      // lands in render with no error boundary above it and the root unmounts to a white page, for a
      // player whose only fault was having played yesterday. Rejecting to an empty board is the same
      // answer every other malformed shape gets here.
      const rung = ladder.findIndex((hint) => (hint as GoFigureHint)?.metadata?.slot === slot)
      return rung >= 0 && rung < opened && operators[slot] === (ladder[rung] as GoFigureHint)?.metadata?.operator
    })
  if (!lockedOk) return EMPTY_BOARD

  return { digits, locked, opened, operators }
}

export const isLocked = (state: BoardState, index: number): boolean =>
  !isDigitCell(index) && state.locked.includes(slotOf(index))

// A locked cell refuses both of these, and the refusal lives HERE rather than in the tray that draws
// the cells. A tray gating on the cursor still leaves the keyboard path open, and one Backspace on a
// hinted cell produced a board that `encode` wrote happily and `decode` then rejected whole -- so the
// player lost every cell and all three paid-for rungs, silently, on the next load. Only Clear takes a
// lock back, and returning the same object makes "nothing happened" the caller's cheapest check.
//
// `applyHint` does not route through `write`; it sets `operators` itself, which is what lets a rung
// overwrite its own slot. Keep it that way.
export const write = (state: BoardState, index: number, value: number | Operator): BoardState => {
  if (isLocked(state, index)) return state
  return isDigitCell(index)
    ? { ...state, digits: state.digits.map((tile, at) => (at === index / 2 ? (value as number) : tile)) }
    : {
        ...state,
        operators: state.operators.map((operator, at) => (at === slotOf(index) ? (value as Operator) : operator)),
      }
}

export const clearCell = (state: BoardState, index: number): BoardState => {
  if (isLocked(state, index)) return state
  return isDigitCell(index)
    ? { ...state, digits: state.digits.map((tile, at) => (at === index / 2 ? null : tile)) }
    : { ...state, operators: state.operators.map((operator, at) => (at === slotOf(index) ? null : operator)) }
}

// Clear, and NOT Play again. The cells go and the locks go; `opened` STAYS, so the rungs the player
// paid for are still listed in the sheet and the knowledge they bought is not taken back. Play again
// zeroes both, and it is not in this module at all -- it writes '' from the board component. Routing
// the two through one function is the likeliest bug in this file, and it is silent: a player who
// pressed Clear would find their hints gone and no error anywhere.
export const clearAll = (state: BoardState): BoardState => ({
  digits: Array(DIGIT_COUNT).fill(null),
  locked: [],
  opened: state.opened,
  operators: Array(OPERATOR_COUNT).fill(null),
})

// A rung OVERWRITES whatever the player had put in its slot, and only Clear takes it back. Undo
// never unlocks: undo history is component state that cannot survive a reload, so if Undo were the
// only way out, a hint placement would become irreversible after a refresh -- asymmetrically, by
// accident rather than by design. Clear is a control, so it works identically on a fresh mount.
//
// Nobody is stranded by the permanence. Every rung names an operator drawn from a canonical accepted
// tuple, so a locked operator is always part of some winning answer.
export const applyHint = (state: BoardState, hint: GoFigureHint, nextOpened: number): BoardState => {
  const { operator, slot } = hint.metadata
  return {
    ...state,
    locked: [...new Set([...state.locked, slot])].sort(),
    opened: nextOpened,
    operators: state.operators.map((held, at) => (at === slot ? operator : held)),
  }
}

// An accepted solution whose operators are the ones the ladder names, or null.
//
// THE LADDER PINS A TUPLE AND NEVER AN EXPRESSION, which is the whole reason this function exists
// and the reason it does not take a "the" in its name. lull-api's `pickCanonical` chooses one
// operator arrangement -- most-shared, ties by smallest raw ASCII -- and all three rungs describe
// that one arrangement, a slot each. It picks the most-shared tuple ON PURPOSE, because that leaves
// the player the largest set of working digit arrangements after rung 3, so several accepted
// solutions sharing it is the design rather than an ambiguity to resolve.
//
// So there is no single solution the hints "mean", and nothing here invents one. The tuple is read
// back off the rungs -- which ARE `pickCanonical`'s output, delivered on the wire -- so this cannot
// drift from upstream the way a reimplementation of that choice would. Any solution carrying the
// tuple is consistent with every rung the player paid for, and that buys the property that matters:
// a revealed answer can never contradict the operators the ladder has already LOCKED onto the board.
//
// The first match rather than a chosen one, and it is deterministic because lull-api sorts
// acceptedSolutions before storing them (enumerate.ts). An answer that varied between two loads of
// one puzzle would read as the answer having changed.
//
// Every rejection is a shape the pack can genuinely arrive in. `isValidPuzzle` leaves `data` opaque,
// so a pack cached before the ladder shipped carries three bare strings and `undefined` where the
// solutions should be -- and this runs during render, where a throw takes the page down with no
// error boundary above it. Null means the bench offers no answer, which is the same degradation
// `hasLadder` already makes for a ladder that cannot place anything.
export const matchingSolution = (hints: GoFigureHintLadder, acceptedSolutions: string[]): string | null => {
  if (!Array.isArray(acceptedSolutions) || !Array.isArray(hints)) return null

  // Indexed by SLOT, filled from the rungs, which is the one direction that is safe: rung order is
  // lull-api's reveal order and runs 1, 0, 2 on this fixture, so `hints[slot]` would read a different
  // rung and build a tuple no accepted solution carries.
  const tuple: (Operator | null)[] = Array(OPERATOR_COUNT).fill(null)
  for (const hint of hints) {
    const slot = (hint as GoFigureHint)?.metadata?.slot
    const operator = (hint as GoFigureHint)?.metadata?.operator
    if (!Number.isInteger(slot) || slot < 0 || slot >= OPERATOR_COUNT) return null
    tuple[slot] = operator
  }
  // A ladder that names one slot twice leaves another unnamed, and an unnamed slot cannot be matched
  // on. There is no partial answer to give.
  if (tuple.some((operator) => operator === null)) return null

  const wanted = tuple.join('')
  return acceptedSolutions.find((expression) => expression.replace(/\d/g, '') === wanted) ?? null
}

// What a cell SHOWS, which for a digit cell is not what it holds: the cell holds a bank index and
// the bank turns it back into a character. That indirection is the whole point of storing indices,
// so it lives in one function rather than at every read site.
export const valueAt = (state: BoardState, index: number, bank: number[]): string | null => {
  if (!isDigitCell(index)) return state.operators[slotOf(index)]
  const tile = state.digits[index / 2]
  return tile === null ? null : String(bank[tile])
}

// Where the caret goes after a write: the next cell that is empty AND unlocked, wrapping past the
// end. Locked cells are skipped forever, which is what makes a hint feel like it took the decision
// away rather than like it left one more thing to tap past. null means the board is full and there
// is nowhere left to put the caret -- the caller decides whether that means leaving it where it is.
export const nextCursor = (state: BoardState, from: number): number | null => {
  const candidates = Array.from({ length: CELL_COUNT }, (_unused, step) => (from + 1 + step) % CELL_COUNT)
  const landed = candidates.find(
    (index) =>
      !isLocked(state, index) &&
      (isDigitCell(index) ? state.digits[index / 2] === null : state.operators[slotOf(index)] === null),
  )
  return landed ?? null
}

export const isComplete = (state: BoardState): boolean =>
  state.digits.every((tile) => tile !== null) && state.operators.every((operator) => operator !== null)

// The string the pack is written in, and the CONTRACT of this module: it is what progress used to
// store and what `acceptedSolutions` is matched on. Gaps close rather than being spelled, so a board
// with holes never reads as a shorter finished sum -- the caller checks `isComplete` first, and this
// function is not the place to decide that.
export const expressionOf = (state: BoardState, bank: number[]): string =>
  Array.from({ length: CELL_COUNT }, (_unused, index) => valueAt(state, index, bank) ?? '').join('')

// DISPLAY ONLY, like evaluate.ts itself. Nothing here decides whether an answer is right; that is a
// set lookup against the accepted expressions the backend shipped. The total is on screen from the
// first tap because left-to-right is the one rule in this game a player cannot guess: seeing 6+9+7
// stand at 22 and then jump to 154 on x7 teaches it in one tap, where a number shown only at the
// end teaches it after the puzzle is already lost.
//
// The prefix ends at the first EMPTY cell and not at the last filled one. That distinction is the
// whole of this function: a hint dropped into slot 2 with nothing before it leaves an empty prefix
// and reports nothing, rather than reporting a sum over cells the player has not connected yet.
//
// A trailing operator has no digit to act on, so it is dropped -- 6+ stands at 6 and moves when the
// next tile lands.
export const runningTotal = (state: BoardState, bank: number[]): string => {
  const prefix: string[] = []
  Array.from({ length: CELL_COUNT }).every((_unused, index) => {
    const value = valueAt(state, index, bank)
    if (value === null) return false
    prefix.push(value)
    return true
  })

  const operands = prefix.filter(isDigit).map(Number)
  if (operands.length === 0) return ''

  const operators = prefix.filter((token) => !isDigit(token)).slice(0, operands.length - 1) as Operator[]
  const value = evaluateLeftToRight(operands, operators)
  return value === null ? "Running total: none. That division doesn't come out even." : `Running total: ${value}`
}
