import { hintDataOf } from './hints'
import { encode } from './mapping'
import { trueMapping } from './rungs'
import { Puzzle, PuzzleProgress } from '@types'

/**
 * The board portion that shows this cryptogram finished: every cipher letter mapped to the plain
 * letter it stands for.
 *
 * COMPOSED FROM TWO EXISTING EXPORTS AND NOTHING NEW. `trueMapping` already derives the whole
 * substitution by walking the ciphertext and the answer in step -- it is what every letter rung is
 * chosen against -- and `encode` is the board's own codec. This file is a join, not a rule: it
 * decides nothing about the game and reads no player state at all.
 *
 * IT IS THE SHELL'S QUESTION, THE SAME STANDING `hints` AND `needsDictionary` HAVE. The board is not
 * told the answer exists, is handed no new prop, and keeps its six. What it gets is a progress string
 * through the door it already restores from -- see PuzzleFrame's reveal, which writes this and then
 * rebuilds the board so it reads it.
 *
 * NULL ON A PACK THAT CANNOT SUPPLY ONE, and `hintDataOf` is what makes that total: a field that did
 * not arrive yields '', `trueMapping` has no letters to align, and the mapping comes back empty.
 * Empty is not a finished board -- it is the string every codec here spells "nothing" with, and
 * writing it would mark a puzzle solved while clearing the player's squares. The same undrawable pack
 * produces no ladder either, so the bar it would be revealed from is not on screen in the first
 * place; this guard is for a caller rather than for a player.
 */
export const cryptogramSolve = (puzzle: Puzzle<unknown>): PuzzleProgress | null => {
  const mapping = trueMapping(hintDataOf(puzzle))
  return Object.keys(mapping).length === 0 ? null : encode(mapping)
}
