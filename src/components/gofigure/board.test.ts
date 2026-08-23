import {
  applyHint,
  BoardState,
  CELL_COUNT,
  clearAll,
  clearCell,
  decode,
  EMPTY_BOARD,
  encode,
  expressionOf,
  isComplete,
  isDigitCell,
  isLocked,
  matchingSolution,
  nextCursor,
  runningTotal,
  slotOf,
  valueAt,
  write,
} from './board'
import { goFigureData, goFigureHints } from '@test/__mocks__'
import { GoFigureData, GoFigureHintLadder, Operator, OperatorSlot } from '@types'

// The bank is 6, 9, 7, 7 and this is 6 + 9 + 7 * 7, which is 154 left to right and one of the six
// expressions the fixture pack accepts.
const SOLUTION: [number, number | Operator][] = [
  [0, 0],
  [1, '+'],
  [2, 1],
  [3, '+'],
  [4, 2],
  [5, '*'],
  [6, 3],
]

const place = (state: BoardState, cells: [number, number | Operator][]): BoardState =>
  cells.reduce((board, [index, value]) => write(board, index, value), state)

describe('the cell geometry', () => {
  test('is seven cells', () => {
    expect(CELL_COUNT).toBe(7)
  })

  test('puts digits at even indices and signs at odd ones', () => {
    expect(Array.from({ length: CELL_COUNT }, (_unused, index) => isDigitCell(index))).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ])
  })

  test('maps odd indices onto operator slots', () => {
    expect([slotOf(1), slotOf(3), slotOf(5)]).toEqual([0, 1, 2])
  })
})

describe('encode', () => {
  test('an untouched board is the empty string', () => {
    expect(encode(EMPTY_BOARD)).toBe('')
  })

  test('a cleared board with rungs spent keeps the count', () => {
    expect(encode({ ...EMPTY_BOARD, opened: 2 })).toBe('_______|2|')
  })

  test('digit cells store the bank index, not the digit', () => {
    // Bank is [6, 9, 7, 7]; index 3 is the SECOND 7.
    const state = write(EMPTY_BOARD, 0, 3)
    expect(encode(state)).toBe('3______|0|')
  })

  test('locked slots are listed ascending', () => {
    const state: BoardState = { ...EMPTY_BOARD, locked: [2, 0] as OperatorSlot[], opened: 3 }
    expect(encode(state)).toBe('_______|3|02')
  })
})

// Decoding is a validation and not a parse. A pack can be pruned and refetched, a regenerated puzzle
// keeps neither its bank nor its id, and a player can hand-edit localStorage -- so every rejection
// branch gets its own test rather than a table, because `if` is banned in tests and a table would
// hide which arm actually ran.
describe('decode', () => {
  test('the empty string is a blank board', () => {
    expect(decode('', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('null is a blank board', () => {
    expect(decode(null, goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('a well-formed board round-trips', () => {
    const state: BoardState = {
      ...EMPTY_BOARD,
      digits: [0, null, null, null],
      opened: 1,
      operators: [null, '+', null],
    }
    expect(decode(encode(state), goFigureData)).toEqual(state)
  })

  test('rejects a wrong field count', () => {
    expect(decode('_______|1', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a cells run that is not seven long', () => {
    expect(decode('______|0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a bank index the bank does not have', () => {
    expect(decode('4______|0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects the same bank tile spent twice', () => {
    expect(decode('0_0____|0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects an operator the pack does not offer', () => {
    expect(decode('_^_____|0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a digit sitting in an operator cell', () => {
    expect(decode('_0_____|0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects an operator sitting in a digit cell', () => {
    expect(decode('+______|0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  // One past the ladder is the ANSWER, not a fourth rung. Rejecting it would empty the board and
  // take back every paid-for rung the moment a player who revealed the answer came back.
  test('restores the revealed count of one past the ladder', () => {
    expect(decode('_______|4|', goFigureData)).toEqual({ ...EMPTY_BOARD, opened: 4 })
  })

  test('rejects an opened count past the revealed answer', () => {
    expect(decode('_______|5|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects an opened count that is not a single digit', () => {
    expect(decode('_______|1e0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects an opened count that is missing', () => {
    expect(decode('_______||', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a negative opened count', () => {
    expect(decode('_______|-1|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a locked slot the ladder has not reached', () => {
    // Rung 0 of the fixture names slot 1, so slot 2 cannot be locked at opened: 1.
    expect(decode('_____*_|1|2', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a locked slot whose cell holds the wrong operator', () => {
    // Rung 0 names slot 1 as "+", so a "-" there is a lock the ladder never granted.
    expect(decode('___-___|1|1', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a locked slot whose cell is empty', () => {
    expect(decode('_______|1|1', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a locked slot listed twice', () => {
    expect(decode('___+___|1|11', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a locked run that is not ascending', () => {
    expect(decode('_+_+___|2|10', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a locked slot that is not a slot at all', () => {
    expect(decode('_______|3|x', goFigureData)).toEqual(EMPTY_BOARD)
  })

  // The two that matter most, and the two the rest of this describe would pass without. The fixture
  // ladder runs slots 1, 0, 2 -- lull-api orders rungs by how much each reveals, not left to right.
  // An implementation that reads hints[slot] instead of finding the rung that names the slot gets
  // both of these backwards, and passes everything else in this file.
  test('accepts the slot named by the first rung, which is not slot 0', () => {
    expect(decode('___+___|1|1', goFigureData)).toEqual({
      ...EMPTY_BOARD,
      locked: [1],
      opened: 1,
      operators: [null, '+', null],
    })
  })

  test('rejects slot 0 at one rung open, because the second rung is the one that names it', () => {
    expect(decode('_+_____|1|0', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('accepts slot 0 at two rungs open', () => {
    expect(decode('_+_+___|2|01', goFigureData)).toEqual({
      ...EMPTY_BOARD,
      locked: [0, 1],
      opened: 2,
      operators: ['+', '+', null],
    })
  })

  test('accepts a hinted slot that Clear emptied', () => {
    expect(decode('_______|2|', goFigureData)).toEqual({ ...EMPTY_BOARD, opened: 2 })
  })

  test('accepts any operator in a hinted slot that Clear emptied, without re-locking it', () => {
    expect(decode('___/___|2|', goFigureData)).toEqual({
      ...EMPTY_BOARD,
      opened: 2,
      operators: [null, '/', null],
    })
  })

  test('migrates a legacy expression', () => {
    expect(decode('6+9', goFigureData)).toEqual({
      ...EMPTY_BOARD,
      digits: [0, 1, null, null],
      operators: ['+', null, null],
    })
  })

  test('migrates a legacy expression by first unspent match, so a repeated digit takes the low tile', () => {
    // Bank is 6, 9, 7, 7. The string never held which 7 was spent, and no tile is under a finger
    // here for the choice to contradict.
    expect(decode('7+7', goFigureData)).toEqual({
      ...EMPTY_BOARD,
      digits: [2, 3, null, null],
      operators: ['+', null, null],
    })
  })

  test('rejects a legacy expression the bank cannot pay for', () => {
    expect(decode('8+8', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a legacy expression that does not alternate', () => {
    expect(decode('66', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a legacy expression carrying a sign the grammar has no token for', () => {
    expect(decode('6^9', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a legacy expression carrying an operator this pack does not offer', () => {
    // The fixture pack offers all four signs, so a pack that offers fewer is what it takes to reach
    // this arm -- and lull-api does ship those: a puzzle whose accepted tuple is all additions.
    expect(decode('6-9', { ...goFigureData, operators: ['+'] })).toEqual(EMPTY_BOARD)
  })

  test('rejects a legacy expression with characters the grammar has no token for', () => {
    expect(decode('6 + 9', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a legacy expression with no tokens in it at all', () => {
    expect(decode('nope', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects a legacy expression longer than the board', () => {
    expect(decode('6+9+7*7+6', goFigureData)).toEqual(EMPTY_BOARD)
  })

  // The PACK is untrusted too, and for a reason that is live rather than theoretical. `isValidPuzzle`
  // leaves `data` opaque on purpose -- it checks what the shell dereferences, not what a puzzle type
  // means -- so a pack cached before the hints deploy is still a valid pack and still arrives, with
  // `data.hints` undefined. A throw here lands in render with no error boundary above it, the root
  // unmounts to a white page, and the self-heal never fires because the pack really is valid. It
  // would stay that way until the player cleared site data.
  test('survives a pack cached before the ladder shipped', () => {
    const stale = { ...goFigureData, hints: undefined } as unknown as GoFigureData
    expect(decode('_______|0|', stale)).toEqual(EMPTY_BOARD)
  })

  test('survives a pack with no bank', () => {
    const stale = { ...goFigureData, bank: undefined } as unknown as GoFigureData
    expect(decode('0______|0|', stale)).toEqual(EMPTY_BOARD)
  })

  test('survives a pack with no operator list', () => {
    const stale = { ...goFigureData, operators: undefined } as unknown as GoFigureData
    expect(decode('_+_____|0|', stale)).toEqual(EMPTY_BOARD)
  })

  // A NON-BLANK board, which is the whole point: `_______|0|` decodes to EMPTY_BOARD whether the
  // ladder is tolerated or bailed on, so an assertion built on it cannot tell "did not throw" from
  // "did not lose anything". This is the board a stale-pack player actually holds one tap after the
  // migration rescued them -- their next write emits the field grammar, and bailing here meant the
  // reload after that came back empty.
  test('restores a field-grammar board on a pack cached before the ladder shipped', () => {
    const stale = { ...goFigureData, hints: undefined } as unknown as GoFigureData

    expect(decode('0+1+___|0|', stale)).toEqual({
      ...EMPTY_BOARD,
      digits: [0, 1, null, null],
      operators: ['+', '+', null],
    })
  })

  // The other half of tolerating it: a stale pack can only ever produce `opened: 0`, because no hint
  // control is drawn on one. A string claiming otherwise is still refused.
  test('refuses a claimed rung on a pack with no ladder', () => {
    const stale = { ...goFigureData, hints: undefined } as unknown as GoFigureData
    expect(decode('___+___|1|1', stale)).toEqual(EMPTY_BOARD)
  })

  test('survives a pack with no bank, on the legacy path', () => {
    const stale = { ...goFigureData, bank: undefined } as unknown as GoFigureData
    expect(decode('6+9', stale)).toEqual(EMPTY_BOARD)
  })

  // The case the whole migration exists for, and the one the test above was mislabelled as covering.
  // A legacy string is only ever written by the PRE-HINTS build, whose pack has no ladder -- so this
  // pairing, and not `bank: undefined`, is what a returning player actually arrives with. Packs are
  // never refetched once complete (`lull.ts:20`), so the stale pack does not heal on its own.
  test('migrates a legacy board whose pack predates the ladder', () => {
    const stale = { ...goFigureData, hints: undefined } as unknown as GoFigureData

    expect(decode('6+9', stale)).toEqual({
      ...EMPTY_BOARD,
      digits: [0, 1, null, null],
      operators: ['+', null, null],
    })
  })

  // The array guard at the top of decode does NOT cover this one, which is why it gets its own test.
  // Three bare strings ARE an array, so the shape walks straight past `Array.isArray` and only fails
  // when the lock check reads `.metadata` off a string. The progress string has to name a lock for
  // that check to run at all -- a board with `|0|` never reaches it -- so this is the pack a player
  // who spent a rung yesterday comes back to today.
  test('survives a ladder of bare strings once progress claims a lock', () => {
    const legacy = { ...goFigureData, hints: ['one', 'two', 'three'] } as unknown as GoFigureData
    expect(decode('___+___|1|1', legacy)).toEqual(EMPTY_BOARD)
  })

  test('survives a ladder whose rungs carry no metadata once progress claims a lock', () => {
    const bare = { ...goFigureData, hints: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] } as unknown as GoFigureData
    expect(decode('___+___|1|1', bare)).toEqual(EMPTY_BOARD)
  })

  // `Number` maps every whitespace character to 0, so without a text test first a space in a digit
  // cell reads as bank tile 0 and a tab in the locked run reads as slot 0. Neither forges a state the
  // cross-check would let through, but both give one board two spellings, and this decoder's whole
  // claim is that there is exactly one.
  test('rejects whitespace standing in for a bank index', () => {
    expect(decode(' ______|0|', goFigureData)).toEqual(EMPTY_BOARD)
  })

  test('rejects whitespace standing in for a locked slot', () => {
    expect(decode('_+_+___|2|\t', goFigureData)).toEqual(EMPTY_BOARD)
  })

  // The fixture ladder cannot tell a correct cross-check from a hybrid one that finds the rung by
  // slot for reachability and then reads the OPERATOR out of `hints[slot]`: its rungs 0 and 1 both
  // carry "+", and rung 2 is a fixed point. A local ladder with three distinct operators is what
  // separates them. Slot 0 is named by rung 1, which reveals "*", while `hints[0]` reveals "+".
  test('reads the operator off the rung that names the slot, not off hints[slot]', () => {
    const ladder = [
      { metadata: { operator: '+', slot: 1 }, text: 'The 2nd operator from the left is "+".' },
      { metadata: { operator: '*', slot: 0 }, text: 'The 1st operator from the left is "×".' },
      { metadata: { operator: '/', slot: 2 }, text: 'The 3rd operator from the left is "÷".' },
    ] as GoFigureHintLadder
    expect(decode('_*_____|2|0', { ...goFigureData, hints: ladder })).toEqual({
      ...EMPTY_BOARD,
      locked: [0],
      opened: 2,
      operators: ['*', null, null],
    })
  })

  test('rejects the operator hints[slot] would have named there', () => {
    const ladder = [
      { metadata: { operator: '+', slot: 1 }, text: 'The 2nd operator from the left is "+".' },
      { metadata: { operator: '*', slot: 0 }, text: 'The 1st operator from the left is "×".' },
      { metadata: { operator: '/', slot: 2 }, text: 'The 3rd operator from the left is "÷".' },
    ] as GoFigureHintLadder
    expect(decode('_+_____|2|0', { ...goFigureData, hints: ladder })).toEqual(EMPTY_BOARD)
  })
})

// The singleton is frozen, arrays and all. Every rejection path in `decode` returns it by identity,
// and `write`, `clearCell` and `applyHint` spread their input -- so the array they did not touch is
// still the module's own. One stray mutation would corrupt every board for the life of the page.
describe('EMPTY_BOARD', () => {
  test('is frozen', () => {
    expect(Object.isFrozen(EMPTY_BOARD)).toBe(true)
  })

  test('refuses a write to its digits', () => {
    expect(() => {
      ;(EMPTY_BOARD.digits as (number | null)[])[0] = 1
    }).toThrow(TypeError)
  })

  test('refuses a write to its operators', () => {
    expect(() => {
      ;(EMPTY_BOARD.operators as (Operator | null)[])[0] = '+'
    }).toThrow(TypeError)
  })

  test('refuses a write to its locked run', () => {
    expect(() => {
      ;(EMPTY_BOARD.locked as OperatorSlot[]).push(0)
    }).toThrow(TypeError)
  })
})

describe('valueAt', () => {
  test('reads a digit cell through the bank, not out of the cell', () => {
    // The cell holds tile 3. The bank is 6, 9, 7, 7, so tile 3 shows a 7.
    expect(valueAt(write(EMPTY_BOARD, 0, 3), 0, goFigureData.bank)).toBe('7')
  })

  test('reads an operator cell as itself', () => {
    expect(valueAt(write(EMPTY_BOARD, 1, '*'), 1, goFigureData.bank)).toBe('*')
  })

  test('is null for an empty digit cell', () => {
    expect(valueAt(EMPTY_BOARD, 2, goFigureData.bank)).toBeNull()
  })

  test('is null for an empty operator cell', () => {
    expect(valueAt(EMPTY_BOARD, 3, goFigureData.bank)).toBeNull()
  })
})

describe('write', () => {
  test('overwrites the tile already in a digit cell', () => {
    expect(write(write(EMPTY_BOARD, 0, 1), 0, 2).digits).toEqual([2, null, null, null])
  })

  test('overwrites the sign already in an operator cell', () => {
    expect(write(write(EMPTY_BOARD, 5, '+'), 5, '/').operators).toEqual([null, null, '/'])
  })

  test('leaves the board it was given alone', () => {
    const state = place(EMPTY_BOARD, SOLUTION)
    write(state, 3, '/')
    expect(state.operators).toEqual(['+', '+', '*'])
  })

  // Refused in the MODEL and not merely in the tray. A tray that gates on the cursor still leaves
  // the keyboard path, and one Backspace on a hinted cell used to write a board that `decode` then
  // rejected whole -- costing the player every cell and all three paid-for rungs, silently, on the
  // next load. Only Clear takes a lock back.
  test('refuses to overwrite a cell a hint placed', () => {
    const hinted = applyHint(EMPTY_BOARD, goFigureHints[0], 1)
    expect(write(hinted, 3, '/')).toBe(hinted)
  })

  test('still fills the unlocked cells of a hinted board', () => {
    const hinted = applyHint(EMPTY_BOARD, goFigureHints[0], 1)
    expect(write(hinted, 1, '/').operators).toEqual(['/', '+', null])
  })
})

describe('clearCell', () => {
  test('empties a digit cell and leaves the rest', () => {
    expect(clearCell(place(EMPTY_BOARD, SOLUTION), 2).digits).toEqual([0, null, 2, 3])
  })

  test('empties an operator cell and leaves the rest', () => {
    expect(clearCell(place(EMPTY_BOARD, SOLUTION), 3).operators).toEqual(['+', null, '*'])
  })

  test('refuses to empty a cell a hint placed', () => {
    const hinted = applyHint(EMPTY_BOARD, goFigureHints[0], 1)
    expect(clearCell(hinted, 3)).toBe(hinted)
  })

  test('leaves a hinted board encoding as something decode will take back', () => {
    const hinted = applyHint(EMPTY_BOARD, goFigureHints[0], 1)
    expect(decode(encode(clearCell(hinted, 3)), goFigureData)).toEqual(hinted)
  })
})

// Clear, and the reason this module has a test group of its own. Play again zeroes the opened count
// as well and is NOT in this file -- it writes '' from the board component -- so anything here that
// touched `opened` would silently take back rungs the player paid for.
describe('clearAll', () => {
  test('empties every cell', () => {
    expect(clearAll(place(EMPTY_BOARD, SOLUTION))).toEqual(EMPTY_BOARD)
  })

  test('keeps the opened count, so the sheet still lists the rungs that were paid for', () => {
    expect(clearAll(applyHint(EMPTY_BOARD, goFigureHints[0], 1)).opened).toBe(1)
  })

  test('empties the locks, which is the only way out of a hinted cell', () => {
    expect(clearAll(applyHint(EMPTY_BOARD, goFigureHints[0], 1)).locked).toEqual([])
  })

  test('empties the operator a hint placed, not only the cells the player filled', () => {
    const state = applyHint(place(EMPTY_BOARD, SOLUTION), goFigureHints[0], 1)
    expect(clearAll(state).operators).toEqual([null, null, null])
  })

  test('encodes as a cleared board with its rungs still spent', () => {
    const state = applyHint(applyHint(EMPTY_BOARD, goFigureHints[0], 1), goFigureHints[1], 2)
    expect(encode(clearAll(state))).toBe('_______|2|')
  })
})

describe('applyHint', () => {
  test('places the rung operator in the slot the rung names', () => {
    // Rung 0 of the fixture names slot 1, which is cell 3 -- not slot 0.
    expect(applyHint(EMPTY_BOARD, goFigureHints[0], 1).operators).toEqual([null, '+', null])
  })

  test('locks that slot', () => {
    expect(applyHint(EMPTY_BOARD, goFigureHints[0], 1).locked).toEqual([1])
  })

  test('records the count it was handed', () => {
    expect(applyHint(EMPTY_BOARD, goFigureHints[0], 1).opened).toBe(1)
  })

  test('overwrites whatever the player had put in that slot', () => {
    expect(applyHint(place(EMPTY_BOARD, [[3, '/']]), goFigureHints[0], 1).operators).toEqual([null, '+', null])
  })

  test('leaves the digits alone', () => {
    expect(applyHint(place(EMPTY_BOARD, SOLUTION), goFigureHints[0], 1).digits).toEqual([0, 1, 2, 3])
  })

  test('three rungs lock the three slots the ladder names, in ascending order', () => {
    const state = goFigureHints.reduce((board, hint, rung) => applyHint(board, hint, rung + 1), EMPTY_BOARD)
    expect(state).toEqual({ ...EMPTY_BOARD, locked: [0, 1, 2], opened: 3, operators: ['+', '+', '*'] })
  })

  test('re-applying a rung does not list its slot twice', () => {
    expect(applyHint(applyHint(EMPTY_BOARD, goFigureHints[0], 1), goFigureHints[0], 1).locked).toEqual([1])
  })
})

describe('isLocked', () => {
  test('is true for the cell a rung placed', () => {
    expect(isLocked(applyHint(EMPTY_BOARD, goFigureHints[0], 1), 3)).toBe(true)
  })

  test('is false for an operator cell no rung has reached', () => {
    expect(isLocked(applyHint(EMPTY_BOARD, goFigureHints[0], 1), 5)).toBe(false)
  })

  test('is false for every digit cell, whatever is locked', () => {
    const state = goFigureHints.reduce((board, hint, rung) => applyHint(board, hint, rung + 1), EMPTY_BOARD)
    expect([0, 2, 4, 6].map((index) => isLocked(state, index))).toEqual([false, false, false, false])
  })
})

describe('nextCursor', () => {
  test('advances to the next empty unlocked cell', () => {
    expect(nextCursor(write(EMPTY_BOARD, 0, 0), 0)).toBe(1)
  })

  test('skips a locked cell forever', () => {
    // Rung 0 names slot 1, which is cell 3.
    expect(nextCursor(applyHint(EMPTY_BOARD, goFigureHints[0], 1), 2)).toBe(4)
  })

  test('skips a cell that is already filled', () => {
    expect(nextCursor(place(EMPTY_BOARD, [[1, '+']]), 0)).toBe(2)
  })

  test('wraps past the end', () => {
    expect(nextCursor(write(EMPTY_BOARD, 6, 3), 6)).toBe(0)
  })

  test('is null when nothing is left to fill', () => {
    expect(nextCursor(place(EMPTY_BOARD, SOLUTION), 0)).toBeNull()
  })
})

describe('isComplete', () => {
  test('is false on an empty board', () => {
    expect(isComplete(EMPTY_BOARD)).toBe(false)
  })

  test('is false with one digit cell still empty', () => {
    expect(isComplete(place(EMPTY_BOARD, SOLUTION.slice(0, 6)))).toBe(false)
  })

  test('is false with one operator cell still empty', () => {
    expect(
      isComplete(
        place(
          EMPTY_BOARD,
          SOLUTION.filter(([index]) => index !== 5),
        ),
      ),
    ).toBe(false)
  })

  test('is true once all seven cells hold something', () => {
    expect(isComplete(place(EMPTY_BOARD, SOLUTION))).toBe(true)
  })
})

describe('expressionOf', () => {
  test('is empty on an empty board', () => {
    expect(expressionOf(EMPTY_BOARD, goFigureData.bank)).toBe('')
  })

  test('writes the pack characters, so it can be matched against the accepted set', () => {
    expect(goFigureData.acceptedSolutions).toContain(expressionOf(place(EMPTY_BOARD, SOLUTION), goFigureData.bank))
  })

  test('closes the gaps, so a board with holes cannot read as a shorter finished sum', () => {
    const state = place(EMPTY_BOARD, [
      [0, 0],
      [5, '*'],
    ])
    expect(expressionOf(state, goFigureData.bank)).toBe('6*')
  })
})

describe('runningTotal', () => {
  test('says nothing on an empty board', () => {
    expect(runningTotal(EMPTY_BOARD, goFigureData.bank)).toBe('')
  })

  test('says nothing when the first cell is empty, even with a hint placed', () => {
    // Rung 2 names slot 2, the rightmost sign. The prefix ends at the first EMPTY cell, so a sign
    // sitting past a gap contributes nothing and the floor stays quiet.
    expect(runningTotal(applyHint(EMPTY_BOARD, goFigureHints[2], 3), goFigureData.bank)).toBe('')
  })

  test('drops a trailing operator', () => {
    const state = place(EMPTY_BOARD, [
      [0, 0],
      [1, '+'],
    ])
    expect(runningTotal(state, goFigureData.bank)).toBe('Running total: 6')
  })

  test('stops at the first gap rather than at the last filled cell', () => {
    const state = place(EMPTY_BOARD, [
      [0, 0],
      [1, '+'],
      [2, 1],
      [5, '*'],
      [6, 3],
    ])
    expect(runningTotal(state, goFigureData.bank)).toBe('Running total: 15')
  })

  test('runs strictly left to right', () => {
    // 6 + 9 + 7 * 7 is 154 left to right, and 6 + 9 + 49 = 64 under PEMDAS.
    expect(runningTotal(place(EMPTY_BOARD, SOLUTION), goFigureData.bank)).toBe('Running total: 154')
  })

  test('names a division that does not come out even', () => {
    const state = place(EMPTY_BOARD, [
      [0, 0],
      [1, '/'],
      [2, 1],
    ])
    expect(runningTotal(state, goFigureData.bank)).toBe("Running total: none. That division doesn't come out even.")
  })
})

// The ladder pins an OPERATOR TUPLE, never an expression. lull-api's `pickCanonical` chooses one
// arrangement -- most-shared, ties by smallest raw ASCII -- and all three rungs describe it, one slot
// each. Many accepted solutions share that arrangement, and that is deliberate: the most-shared tuple
// leaves the player the largest set of working digit arrangements after rung 3.
//
// So "which solution do the hints mean" has no single answer, and this function does not try to
// invent one. It reads the tuple back off the rungs -- which ARE `pickCanonical`'s output, so nothing
// here can drift from it -- and returns a solution that matches. Any of them is consistent with every
// rung the player paid for, which is the property that matters: a revealed answer can never
// contradict the operators the ladder has already locked onto the board.
describe('matchingSolution', () => {
  test('returns a solution built from the tuple the rungs name', () => {
    expect(matchingSolution(goFigureHints, goFigureData.acceptedSolutions)).toBe('6+7+9*7')
  })

  // Deterministic, because lull-api sorts acceptedSolutions before storing them. A reveal that
  // varied between two loads of the same puzzle would look like the answer had changed.
  test('takes the same one every time', () => {
    const twice = [
      matchingSolution(goFigureHints, goFigureData.acceptedSolutions),
      matchingSolution(goFigureHints, goFigureData.acceptedSolutions),
    ]

    expect(twice[0]).toBe(twice[1])
  })

  // The property the whole derivation exists for. A pack whose accepted set spans two tuples -- the
  // case `openHint` already documents, where 1*2*3*4 and 1+2+3*4 both reach 24 -- must reveal the one
  // the ladder locked, or the answer on screen contradicts the signs on the board.
  test('skips a solution whose operators the ladder did not name', () => {
    const hints: GoFigureHintLadder = [
      { metadata: { operator: '*', slot: 1 }, text: 'rung 1' },
      { metadata: { operator: '+', slot: 0 }, text: 'rung 2' },
      { metadata: { operator: '*', slot: 2 }, text: 'rung 3' },
    ]

    expect(matchingSolution(hints, ['1*2*3*4', '1+2*3*4', '1+2+3*4'])).toBe('1+2*3*4')
  })

  // Untrusted pack, same register as decode. A ladder that leaves a slot unnamed cannot pin a tuple,
  // so there is nothing to match on and no answer to give.
  test('declines a ladder that does not name every slot', () => {
    const hints = [
      { metadata: { operator: '+', slot: 0 }, text: 'rung 1' },
      { metadata: { operator: '+', slot: 0 }, text: 'rung 2' },
      { metadata: { operator: '*', slot: 2 }, text: 'rung 3' },
    ] as GoFigureHintLadder

    expect(matchingSolution(hints, goFigureData.acceptedSolutions)).toBeNull()
  })

  test('declines when no accepted solution carries the tuple', () => {
    expect(matchingSolution(goFigureHints, ['6-7-9/7'])).toBeNull()
  })

  test('declines when the pack shipped no solutions at all', () => {
    expect(matchingSolution(goFigureHints, [])).toBeNull()
  })

  // A pack cached before a deploy is a VALID pack with the wrong shape inside it -- the same argument
  // decode makes at the top of this file. Nothing here may throw during render.
  test('declines a pack whose solutions are not an array', () => {
    expect(matchingSolution(goFigureHints, undefined as unknown as string[])).toBeNull()
  })

  test('declines a ladder whose rungs carry no metadata', () => {
    expect(
      matchingSolution(['a', 'b', 'c'] as unknown as GoFigureHintLadder, goFigureData.acceptedSolutions),
    ).toBeNull()
  })
})
