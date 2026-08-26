// THE ONE PLACE THE PAD'S LETTER ORDER IS WRITTEN, and it is shared because the two benches that
// dock an A-Z pad -- the cipher bench and the guess bench -- are one instrument to a player's
// thumbs. They were two hand-rolled copies of `'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')` and a
// `grid-cols-7`, which is a duplicate that costs nothing right up to the moment the order changes
// and one of them is missed.
//
// WHY QWERTY. The guess bench is the argument: its keys carry a verdict -- struck for `not in the
// phrase`, filled for `in the phrase` -- and reading those verdicts off is the pad's actual job.
// That scan is a thing players learned somewhere else, on a keyboard, and every one of them learned
// it in this order. Alphabetical asks a solver to translate a decade of muscle memory on every
// glance, and gives nothing back: nobody has ever needed to know that P follows O.
//
// The cipher bench takes the same order for a weaker reason and a sufficient one. Its pad IS closer
// to an inventory -- each key states which cipher letter it is spoken for -- and an alphabet is a
// better thing to scan for a letter not yet used. But that question is already answered ON the key,
// by the `= Z` under it, in any order at all; what alphabetical bought was a lookup nobody performs
// often against a search everyone performs constantly. Two pads in one product that look identical
// and order differently is worse than either choice made twice.
//
// NOTHING HERE KNOWS WHAT A KEY DOES. This module is letters and geometry. The verdict tones, the
// `= Z` annotation, the strike, and which two utility keys stand in row three all belong to the
// bench that draws them, and that is why this is a layout module rather than a `<Keypad>`: the two
// pads share a shape and share almost nothing else.
export const ROWS: readonly (readonly string[])[] = ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), 'ZXCVBNM'.split('')]

// THE WIDTH EVERY ROW SPENDS, in key-widths. Row one is ten letters; row two is nine letters
// between two half-unit indents; row three is seven letters between two utility keys worth one and
// a half each. Ten in all three, so a key is the same size wherever it sits and the pad is a
// rectangle rather than three ragged strips.
//
// A NUMBER RATHER THAN A COLUMN COUNT, because the rows no longer divide the width the same way and
// a CSS grid cannot express a half-unit indent without inventing cells to fill it. The classes
// below distribute along a flex line instead, where a half and a one-and-a-half are just numbers.
export const UNITS = 10

// The pad. `bg-floor-rule` is the GRIDLINES: every key paints its own opaque floor and the 1px gaps
// let the ground through, so the pad reads as one ruled instrument instead of twenty-eight loose
// buttons. That is the alphabet pad's trick verbatim -- the only change is that the gaps now run
// between rows here and between keys in ROW, where they used to come from one grid's `gap-px`.
export const PAD = 'flex shrink-0 flex-col gap-px bg-[var(--lull-floor-rule)]'

// A row, and it carries the HEIGHT.
//
// 59px, and it is derived rather than picked: the instrument's budget is 179px -- the seam's 240
// less the ribbon's 52 and the safe strip's 9 -- and three rows plus two gridlines is
// (179 - 2) / 3 = 59. The alphabet pad spent the same 179 on four rows of 44. So the pad's top edge
// and bottom edge do not move by a pixel, no bench's geometry changes, and --lull-seam stays the
// constant every board is pinned to.
//
// THE KEYS GET TALLER, WHICH IS THE POINT OF SAYING SO. 59 is well past the 44x44 of WCAG 2.5.5
// (Target Size (Enhanced), AAA) that the four-row pad met on its height, so nothing is traded away
// vertically for what the width gives up below.
export const ROW = 'flex h-[59px] gap-px'

// One key. `basis-0 grow` is a tenth of the row, and `min-w-0` is what stops a long label -- Delete
// -- from setting a floor under the flex basis and pushing the letters out of true.
//
// THE WIDTH IS THE THING QWERTY COSTS. Ten columns at a 320 viewport is (320 - 9 gaps) / 10 =
// 31.1px against the alphabet pad's 44.86, which drops under 2.5.5's 44 and stays comfortably over
// the 24x24 of 2.5.8 Target Size (Minimum) -- the AA criterion this app is actually held to, and
// the same one cryptogram/layout.ts floors a square at. It is the width every word game on a phone
// has, for the reason at ROWS.
export const CELL = 'min-w-0 basis-0 grow'

// A utility key: one and a half cells, so `Guess` and `Delete` have the room a three-letter word
// does not need. 46.6px at 320, which is more than the 44.86 those two labels fit in before.
export const WIDE = 'min-w-0 basis-0 grow-[1.5]'

// The half-key indent at each end of row two, and it is an ELEMENT rather than padding on the row
// for one reason: the row's ground is the gridline color, so a padded row would draw two rule-
// colored blocks at its ends. A spacer paints floor and the gaps either side of it are gridlines
// like every other gap in the pad.
//
// aria-hidden and empty. It is scenery -- the reason a keyboard looks like a keyboard -- and a
// screen reader working the pad must not stop on it.
export const HALF = 'basis-0 grow-[0.5] bg-[var(--lull-floor)]'
