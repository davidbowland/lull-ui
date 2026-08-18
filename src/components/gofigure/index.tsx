import React, { useMemo, useState } from 'react'

import { evaluateLeftToRight } from './evaluate'
import { GoFigureData, Operator, PuzzleComponentProps } from '@types'

// Named, not symbolic. A screen reader reads "×" as "times" at best and as nothing at
// all at worst, and an unnamed control is an unusable one.
const OPERATOR_NAMES: Record<Operator, string> = {
  '*': 'Multiply',
  '+': 'Add',
  '-': 'Subtract',
  '/': 'Divide',
}

// What the eye sees. The tokens themselves always carry the pack's own characters, so
// the string compared against acceptedSolutions is the string the backend wrote.
const OPERATOR_SYMBOLS: Record<Operator, string> = {
  '*': '×',
  '+': '+',
  '-': '−',
  '/': '÷',
}

const isDigit = (token: string): boolean => /^\d$/.test(token)

const TILE =
  // aria-disabled variants, not disabled:/enabled: -- the tiles stay genuinely enabled so
  // that tapping one does not blur it, so those variants would never match and a spent
  // tile would look identical to an available one.
  'flex h-14 min-w-14 items-center justify-center rounded-xl border text-xl ' +
  'border-[var(--lull-border)] text-[var(--lull-ink)] cursor-pointer hover:bg-[var(--lull-accent)]/10 ' +
  'aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent'

// The solved banner is formatted for reading -- spaces, and × rather than *. The live
// region above it shows the raw token join instead, because that is the string the
// player is building and the string the pack lists. One role="status" cannot serve both.
const forReading = (tokens: string[]): string =>
  tokens.map((token) => (isDigit(token) ? token : OPERATOR_SYMBOLS[token as Operator])).join(' ')

// Which bank slot each spent digit came from. Duplicates are separate tiles: the bank
// 6,9,7,7 has two sevens, and spending one must leave the other tappable.
const consumedSlots = (bank: number[], tokens: string[]): boolean[] => {
  const consumed = bank.map(() => false)
  for (const token of tokens.filter(isDigit)) {
    const slot = bank.findIndex((digit, index) => !consumed[index] && digit === Number(token))
    consumed[slot] = true
  }
  return consumed
}

// Stored progress is not trusted. A pack can be pruned and refetched, and a regenerated
// puzzle keeps neither its bank nor its id, so an expression that the bank cannot pay
// for -- or that no sequence of taps could have produced -- is dropped rather than
// rendered as a board in a state its own buttons could not reach.
const fitsPuzzle = (data: GoFigureData, tokens: string[]): boolean => {
  const remaining = [...data.bank]
  return tokens.every((token, index) => {
    // Digits sit at even positions and operators at odd ones. Two digits in a row would
    // read as one two-digit number, which no accepted solution ever contains.
    if (isDigit(token) !== (index % 2 === 0)) return false
    if (!isDigit(token)) return data.operators.includes(token as Operator)
    const slot = remaining.indexOf(Number(token))
    if (slot < 0) return false
    remaining.splice(slot, 1)
    return true
  })
}

const restore = (data: GoFigureData, progress: string | null): string[] => {
  const tokens = progress?.match(/\d|[+\-*/]/g) ?? []
  return tokens.join('') === progress && fitsPuzzle(data, tokens) ? tokens : []
}

export const GoFigureBoard = ({ onProgress, onSolved, progress, puzzle }: PuzzleComponentProps<GoFigureData>) => {
  const { acceptedSolutions, bank, goal, operators } = puzzle.data

  // Restored once, at mount. The shell keys this component on the puzzle id, so a
  // different puzzle is a different component rather than a prop change.
  const [tokens, setTokens] = useState<string[]>(() => restore(puzzle.data, progress))

  // A set lookup, and nothing else. The component never evaluates arithmetic to decide
  // whether an answer is right: the backend enumerated every accepted expression and
  // shipped them as data. An expression that reaches the goal by a route the pack did
  // not list is not a solution here — see evaluate.ts, which exists only so the
  // wrong-answer message can name what the tiles made.
  const accepted = useMemo(() => new Set(acceptedSolutions), [acceptedSolutions])

  const expression = tokens.join('')
  const isSolved = accepted.has(expression)
  const consumed = consumedSlots(bank, tokens)
  const spent = tokens.filter(isDigit).length
  const lastToken = tokens.at(-1)
  const canTapDigit = lastToken === undefined || !isDigit(lastToken)
  const canTapOperator = lastToken !== undefined && isDigit(lastToken) && spent < bank.length

  const commit = (next: string[]): void => {
    setTokens(next)
    const joined = next.join('')
    onProgress(joined)
    if (accepted.has(joined)) onSolved()
  }

  const message = (): string => {
    if (isSolved) return `Solved. ${forReading(tokens)} = ${goal}`
    // Nothing to say while tiles are still in the bank: an unfinished expression is not
    // a wrong one.
    if (spent < bank.length) return ''

    const value = evaluateLeftToRight(
      tokens.filter(isDigit).map(Number),
      tokens.filter((token) => !isDigit(token)) as Operator[],
    )
    // Division has to come out whole at every step, so there is no number to name.
    if (value === null) return "That doesn't divide evenly. Take back a tile and try again."
    // The backend enumerates every expression reaching the goal, so this is unreachable
    // from a real pack. It is here because the alternative -- "That makes 154, not 154"
    // -- is what the ordinary branch would print if it ever did happen.
    if (value === goal) return "That isn't one of the sums for this puzzle. Take back a tile and try again."
    return `That makes ${value}, not ${goal}. Take back a tile and try again.`
  }

  return (
    <section aria-label="goFigure" className="flex flex-col gap-5">
      <h2 className="text-2xl text-[var(--lull-ink)]">Make {goal}</h2>

      <p
        aria-label="Your expression"
        aria-live="polite"
        className="min-h-10 rounded-xl border border-[var(--lull-border)] px-4 py-2 text-xl text-[var(--lull-ink)]"
        role="status"
      >
        {expression === '' ? 'Tap the numbers and signs to build a sum.' : expression}
      </p>

      {/* Always mounted, empty until there is something to say. A role="status" element
          inserted with its message already in it is routinely missed by NVDA and JAWS,
          which announce changes inside a region they are already watching. Solved and
          wrong are both carried in text — never by colour alone. */}
      <p className="min-h-6 text-[var(--lull-ink)] empty:min-h-0" role="status">
        {message()}
      </p>

      {/* aria-disabled, NOT disabled, on both rows. A browser blurs an element that
          becomes disabled while focused, and every tap disables the button just
          activated -- so `disabled` drops focus to <body> and the next Tab restarts at
          the top of the document. Playing one puzzle by keyboard meant fourteen
          traversals from the page top, and at the final tile every tile disables at
          once, so focus vanished exactly when the wrong-answer message appeared.
          aria-disabled keeps the tile focusable and announced; the guard in commit()
          is what actually refuses the tap. */}
      <div className="flex flex-wrap gap-2">
        {bank.map((digit, index) => {
          const isSpent = consumed[index] || !canTapDigit
          return (
            <button
              aria-disabled={isSpent}
              // Position included because a duplicated bank gives two tiles the same
              // name: "Use 7" twice tells a screen-reader user nothing about which one
              // they just spent.
              aria-label={`Use ${digit}, tile ${index + 1} of ${bank.length}`}
              className={TILE}
              key={`${digit}-${index}`}
              onClick={() => !isSpent && commit([...tokens, String(digit)])}
              type="button"
            >
              {digit}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {operators.map((operator) => (
          <button
            aria-disabled={!canTapOperator}
            aria-label={OPERATOR_NAMES[operator]}
            className={TILE}
            key={operator}
            onClick={() => canTapOperator && commit([...tokens, operator])}
            type="button"
          >
            {OPERATOR_SYMBOLS[operator]}
          </button>
        ))}
      </div>

      <div>
        <button
          aria-label="Take back the last tile"
          className="min-h-11 rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)] disabled:opacity-40 enabled:cursor-pointer"
          disabled={tokens.length === 0}
          onClick={() => commit(tokens.slice(0, -1))}
          type="button"
        >
          Take back
        </button>
      </div>
    </section>
  )
}
