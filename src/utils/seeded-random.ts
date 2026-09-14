/**
 * A deterministic number source from a string seed -- mulberry32 over a cheap string hash.
 *
 * IT EXISTS FOR REPRODUCIBILITY, NOT FOR STABILITY. A rung is frozen into the board's progress the
 * moment it is bought, so re-opening it never re-draws and does not depend on this. What the seed
 * buys is a speculative tail that does not move under the player -- the rung a bar SHOWS has to be
 * the rung it SELLS -- plus fixture sweeps whose failures are repeatable and a caller that behaves
 * the same on two machines. Callers seed it from the puzzle id.
 *
 * ONE COPY, AND IT USED TO BE THREE. Phrazle's rungs.ts held the original, cryptogram's held a
 * byte-identical copy, and themedanagrams' took a third when its chooser started drawing. The
 * argument for keeping them apart was written down and is worth stating before it is overturned: the
 * copies do not HAVE to agree, because nothing compares one board's sequence with another's, so a fix
 * to one is free to leave the others alone -- and sharing would mean either one board's directory
 * importing another's or the first board-to-shell-utils import in the app.
 *
 * WHAT CHANGED IS THE COUNT. Two copies of nine lines is a duplication; three is a pattern, and the
 * next board that draws makes it four. The freedom to fix one and not the others was never exercised
 * and is not worth having: all three were identical to the byte on the day this moved, and a
 * divergence between them would be a bug in whichever one lagged rather than a feature. What the
 * duplication actually bought was three places for a reader to discover the same algorithm and three
 * places where the next correction has to be remembered.
 *
 * THE IMPORT DIRECTION IS THE COST, AND IT IS SMALL. Nothing in src/components/<game>/ imported
 * @utils before this, so a board now reaches the shell's utilities for the first time. That is a
 * weaker line than the one it replaces: `src/utils/` is this app's own code with no cross-repo
 * contract on it, unlike `src/rules/`, which is vendored from lull-api and holds exactly three files
 * -- this could not live there, and nothing about it is a game rule in any case. It computes a number
 * and knows nothing about puzzles.
 *
 * NOT FOR ANYTHING THAT MUST BE UNGUESSABLE. It is a small, fast, fully reversible PRNG seeded from a
 * value that ships in the pack, so anyone can reproduce any sequence it will ever produce. That is
 * the point here and disqualifying anywhere else.
 */
export const seededRandom = (seed: string): (() => number) => {
  let state = 0x6d2b79f5
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 2654435761)
    state >>>= 0
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
