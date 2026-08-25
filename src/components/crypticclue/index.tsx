import { normalizeAnswer } from '@rules/normalize-answer'
import React, { useId, useState } from 'react'

import { splitAt } from './spans'
import { Button } from '@components/button'
import { Plate, Shell } from '@components/enclosure'
import { FloorBar } from '@components/floor-bar'
import { CrypticClueData, PuzzleComponentProps } from '@types'

// The one rule this component applies, and it is vendored rather than authored: the backend decides
// what counts as the answer, and normalizeAnswer exists only because the comparison runs over free
// text the player invents at play time, which no generator can enumerate in advance.
//
// `typeof answer` IS CHECKED FIRST, and it is not defensive noise -- it is the one guard whose
// absence LATCHES. isValidPuzzle leaves `data` opaque, so a pack whose `answer` is missing, null or
// a number renders a clue plate that looks perfectly fine, because the empty-guess operand
// short-circuits while the box is still empty. The first keystroke then persists progress and only
// afterwards calls normalizeAnswer(answer), which throws -- so the write lands and the render does
// not. On every later load the stored character is restored at mount and the throw happens before
// the player can touch anything, the root error boundary swaps in "Lull got stuck", and nothing
// self-heals it: the pack is valid, so readPack keeps it, and no code validates a progress string.
// That puzzle is unopenable until storage is cleared by hand.
const isCorrect = (guess: string, answer: string): boolean =>
  typeof answer === 'string' && normalizeAnswer(guess) !== '' && normalizeAnswer(guess) === normalizeAnswer(answer)

// The wordplay half of the reveal, in words. `device` is typed as a string rather than as
// CrypticDevice on purpose: a pack is JSON off the network and lull-api can ship a third device
// before this build knows about it, so the parameter says what actually arrives. A lookup table
// returning undefined would render `“instant angora” .` -- a sentence with a hole in it -- and the
// fallback says something true about every possible device instead.
//
// It names the answer rather than saying "the answer", because the concrete noun is right there and
// a pronoun would send the reader looking for its antecedent.
//
// IT AUTHORS NO GAME RULE. It picks one of three sentences off a literal the pack shipped; it works
// nothing out about the clue. Saying WHERE the answer sits inside the fodder would be the rule, and
// that belongs to the verifier -- see the spec's §6.2.
const wordplayLine = (device: string, fodder: string, answer: string): string => {
  if (device === 'hidden') return `“${fodder}” hides ${answer}.`
  if (device === 'anagram') return `“${fodder}” is an anagram of ${answer}.`
  return `“${fodder}” is the wordplay.`
}

// The hero, and it is a SENTENCE rather than a glyph run. Sign cut, one weight, sized off the
// viewport -- the writing bench's idiom -- with three deliberate departures from the phrase board
// one file over, all three of which are easy to undo by copying:
//
// NO tracking, and therefore NO `pl-[0.32em]`. Missing Vowels' left padding is a correction for
// letter-spacing applied after the final glyph, which pushes a centered run off-center. With no
// tracking there is nothing to correct, and copying the padding would indent every clue by a third
// of an em for no reason. THIS IS THE SINGLE MOST COPY-PASTEABLE BUG ON THIS BENCH.
//
// LEFT-ALIGNED, not centered. Missing Vowels centers because its content is a symmetric run with no
// reading direction beyond letter by letter. A clue is prose: ragged-right is the readable default,
// and centered text past two lines makes the eye re-find the left edge on every line. Line count is
// data-dependent and unknowable at build time -- the wire caps a clue at 120 characters, which is
// five wrapped lines at a 320 viewport -- so the layout has to be right at five lines, not at one.
//
// SMALLER, and 1.5 rather than 1.4. Missing Vowels sets 28-44px for about 15 displayed characters.
// 120 characters at that size is not a plate, it is a page.
const CLUE =
  'lull-sign text-[clamp(1.125rem,5.2vw,1.75rem)] leading-[1.5] break-words text-pretty text-[var(--lull-ink)]'

// bg-transparent and an explicit ink are NOT decoration. The UA stylesheet paints <mark> black on
// yellow, which is an unregistered color pair on a plate that contrast.test.ts has never measured,
// and it would be the loudest thing in the product. STATED HERE RATHER THAN TESTED: the only
// assertion available would be a class check, which CLAUDE.md forbids as a proxy for appearance, so
// the suite pins the element and its text and this comment carries the rest.
//
// The accent is otherwise unspent on this bench -- both controls are Button variant="default" and
// there is no selected square -- so the underline is the only accent on the surface, and it exists
// only after the win, when there is nothing left to offer. --lull-accent on --lull-plate is
// 6.422:1 light and 7.852:1 dark, already held by src/config/contrast.test.ts.
const MARK =
  'bg-transparent text-[var(--lull-ink)] underline decoration-[var(--lull-accent)] ' +
  'decoration-[3px] underline-offset-[6px]'

// 12.5px is the size every quiet annotation on this design is set at.
const REVEAL_HEADING = 'text-[12.5px] font-semibold tracking-[0.11em] uppercase text-[var(--lull-muted)]'
const REVEAL_LINE = 'text-[14px] leading-[1.45] text-[var(--lull-ink)]'

// --lull-rule, never --lull-hair: this border is the whole of what tells a player where the box they
// type into begins, and hair is decoration that must never identify a control. `min-w-0 flex-1`
// rather than `w-full`, and min-w-0 is the load-bearing half: a flex item's default
// `min-width: auto` refuses to shrink below its own content, so without it a long guess pushes
// Check off the end of the row instead of scrolling inside the box.
const FIELD =
  'min-h-11 min-w-0 flex-1 rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] ' +
  'px-[var(--lull-s3)] py-[var(--lull-s2)] text-lg text-[var(--lull-ink)]'

// 128px is sized for "Play again", which is what the slot has to hold rather than "Check": the two
// share one position and a slot sized to the shorter would resize the field at the exact instant the
// player wins. THE MEASUREMENT IS IN missingvowels/index.tsx and is not repeated here -- one number
// derived in two places disagrees the first time either is re-measured. This is a cross-reference,
// which fails loudly because a reader follows it, rather than a copy, which fails silently.
const CONTROL_SLOT = 'min-w-[128px] shrink-0 justify-center'

// THE STANDING LINE, and it is the one rule of this game nobody can guess -- the exact analogue of
// the tile bench's left-to-right rule and the cipher bench's one-substitution rule. "Wordplay" is
// jargon and it is kept deliberately: it is the domain's own word, rung 1 of every ladder of this
// type already uses it, and the reveal uses it again, so a player meets one term three times rather
// than three paraphrases of one term.
//
// Passed as FloorBar's `resting`, so it is displaced by a message and returns on the next keystroke,
// because `change` clears `checked`. That is what lets the field's visible label go sr-only: the
// player is never composing without an instruction on screen (WCAG 3.3.2). It is a SIBLING of the
// live region, never a child -- a role="status" element mounted with text already in it is a region
// NVDA and JAWS were never watching.
const INSTRUCTION = 'Every cryptic clue says the answer twice — once as a definition, once as wordplay.'

export const CrypticClueBoard = ({
  onProgress,
  onReset,
  onSolved,
  progress,
  puzzle,
}: PuzzleComponentProps<CrypticClueData>) => {
  const { answer, clue, definitionSpan, device, enumeration, fodderSpan } = puzzle.data

  // Restored once, at mount. The shell keys this component on the puzzle id, so a different puzzle
  // is a different component rather than a prop change. Stored progress is free text the player
  // typed, so there is nothing to validate it against -- any string is a state its own input could
  // have reached.
  const [guess, setGuess] = useState<string>(() => progress ?? '')
  const [checked, setChecked] = useState<boolean>(false)

  const solved = isCorrect(guess, answer)

  const change = (next: string): void => {
    setGuess(next)
    setChecked(false)
    onProgress(next)
    // Reported the moment it is right, without waiting for the button. Typing the last letter of a
    // word you have just seen should not then require finding a control.
    if (isCorrect(next, answer)) onSolved()
  }

  const check = (): void => setChecked(true)

  // Empties the box, which un-solves it: `solved` is derived, so clearing the guess is the whole
  // reset as far as the BOARD is concerned. The shell is told the board is empty so a puzzle left
  // this way reopens empty.
  //
  // The second call is the half the board cannot do itself. A fresh puzzle is a fresh hint ladder,
  // and the ladder lives at `lull:hints:<puzzleId>` -- storage, which a board gets none of. So this
  // says "the player started over" and the shell decides what that means; naming the key or the
  // component that answers for it would be the board reaching past the one thing it may say.
  //
  // It cannot be folded into the empty string above, tempting as that is. `change('')` is also what
  // happens when a player selects their whole answer and deletes it, and charging them their spent
  // rungs for a backspace would be the bug this separation avoids.
  //
  // Optional-called: `onReset` is optional on the props, and a board that assumed the shell always
  // supplies it would crash on exactly the press this exists for.
  const playAgain = (): void => {
    change('')
    onReset?.()
  }

  const message = (): string => {
    if (solved) return `Solved. The answer is ${answer}.`
    // An unfinished guess is not a wrong one, so nothing is said until the player asks.
    if (!checked) return ''
    // Byte-identical to the sibling bench's, and that is deliberate rather than lazy: this is a fact
    // about a text field, not about a game, and two benches phrasing "you pressed check on an empty
    // box" two ways would be two products.
    if (normalizeAnswer(guess) === '') return 'Type your answer first.'
    // Says what to DO, not what is true. It deliberately does not name the length -- `(5)` is on
    // screen beside the clue at all times, and a message that restates a fact already on screen
    // spends the ribbon to say nothing new. It also declines to say where the definition sits: that
    // is a real rule of cryptic crosswords and it would be this app authoring a game rule, because
    // the wire guarantees `definitionSpan` exists and guarantees nothing about where it falls.
    return 'Not it. Read the clue twice — once for the definition, once for the wordplay.'
  }

  // Both spans, resolved once. null is "these numbers do not index this clue", and each half of the
  // reveal degrades on its own: the mark and the definition line ride definitionSpan, the wordplay
  // line rides fodderSpan, and with neither usable there is NO reveal at all rather than an empty
  // named landmark.
  const definition = splitAt(clue, definitionSpan)
  const fodder = splitAt(clue, fodderSpan)

  // BUILT here, and the region below points at it. Both ends are asserted -- see the suite and
  // CLAUDE.md. useId is unique per component instance, so it cannot collide with the field's id or
  // with a second board's.
  const revealId = useId()

  return (
    <>
      {/* Exactly two siblings, and the frame's wrapper is `display: contents`, so this element and
          the floor below become flex items of the screen column and index.css orders them into
          their bands. Nothing but the band class and its own column layout goes on it: the SHELL
          owns this box's flex, min-height and vertical overflow.

          NO SIGN ROW. `category` is absent by design for this type -- the definition half of the
          clue is the category, and shipping one alongside would say which words are the definition
          for free -- so there is nothing true to put in the band, and a 34px strip of ground with
          nothing in it reads as chrome that failed to load. There is no `category !== undefined`
          branch here either: copying the sibling bench's would be a dead arm no fixture can
          exercise and no reader can explain. */}
      <div className="lull-board flex flex-col overflow-x-hidden">
        <div className="flex flex-1 flex-col gap-[var(--lull-s5)] bg-[var(--lull-plate)] pt-[var(--lull-s5)] pr-[var(--lull-gutter-right)] pb-[var(--lull-s4)] pl-[var(--lull-gutter-left)]">
          {/* The bezel goes here and nowhere else on this board. The clue IS the puzzle, so it is
              the thing that carries the weight, and a second bezel further down would turn the
              technique into texture. */}
          <Shell>
            <Plate className="px-[var(--lull-s4)] py-[var(--lull-s5)]">
              {/* An ordinary paragraph. No role="img", no aria-label, no aria-hidden on the visible
                  text: `Dance hidden in instant angora` is a grammatical English sentence whose
                  surface reading is the entire joke, so read aloud it is exactly what a sighted
                  player sees. role="img" would take the text out of the reading order AS TEXT,
                  which takes away the review cursor -- and re-reading a clue word by word, then
                  character by character, is how a hidden-word clue actually gets solved. */}
              <p className={CLUE}>
                {/* The clue is rendered VERBATIM either way; the only thing a span can change is
                    where the element boundaries fall, which is what splitAt's invariant guarantees.
                    Only ONE span is ever spliced in, so there is no overlap to resolve: the
                    convention is one mark, and the fodder is carried in quotes by the prose below. */}
                {solved && definition !== null ? (
                  <>
                    {definition.before}
                    <mark className={MARK}>{definition.marked}</mark>
                    {definition.after}
                  </>
                ) : (
                  clue
                )}
                {/* TWO RENDERINGS OF ONE FACT, and neither is optional. `(5)` is the convention
                    every printed cryptic uses and the only thing a sighted solver needs. Spoken, it
                    is the bare word "five" at the end of a sentence about angora -- a number with
                    no unit attached -- so the listener gets the sentence instead.

                    Guarded on a non-empty array because both halves come off the network: an empty
                    field paints a bare "()" beside the clue and an sr-only " letters." with a
                    leading space, and an absent one throws on `.join`. The join handles a
                    multi-part enumeration without a branch; it is always length 1 today.

                    AND ON THE CONTENTS, not only the shape. `join` stringifies whatever it holds, so
                    `[{}]` is not a crash -- it paints `([object Object])` on the plate and reads
                    `[object Object] letters.` to a listener. That is the confidently-wrong class this
                    board takes seriously everywhere else: nothing on screen says the number is
                    wrong, and a solver counting letters against it is being lied to. The wire says
                    `number[]`; `every(Number.isInteger)` is what makes the render agree. */}
                {Array.isArray(enumeration) && enumeration.length > 0 && enumeration.every(Number.isInteger) && (
                  <>
                    {' '}
                    <span aria-hidden="true">({enumeration.join(',')})</span>
                    <span className="sr-only">{enumeration.join(', ')} letters.</span>
                  </>
                )}
              </p>
            </Plate>
          </Shell>

          {/* A VISUAL MARK ALONE WOULD BE MEANING CONVEYED BY PRESENTATION. An underline is not
              color, so WCAG 1.4.1 is not strictly breached, but the substance of the rule is: a
              screen reader gives no signal for <mark> in most configurations, and the underline is
              invisible to anyone reading with a custom stylesheet. These two lines are what carry
              the meaning; the mark above is a convenience for people who can see it.

              The <section> carries NO class of its own, and that is not an omission -- the column
              that holds it owns the gap between the plate and the reveal, so a class here would be
              a second place to set the same space.

              NOTHING IS ANNOUNCED AND NOTHING TAKES FOCUS, deliberately. The ribbon already says
              `Solved. The answer is TANGO.`, and the win happens on a keystroke IN the answer
              field, so moving focus here would drop the software keyboard, move the layout, and
              take the caret out of the box the player just won in. Appending to the ribbon instead
              would blow its two-line clamp and lose the tail. The reveal holds no focusable
              element, so the tab order stays field then control in both states.

              RENDERED OFF `solved`, which is DERIVED from the guess -- never off a latched win
              event. That is what makes a restored winning answer arrive with the reveal already on
              screen, and what lets Play again take the reveal, the mark and the solved message on
              one press with no teardown. */}
          {solved && (definition !== null || fodder !== null) && (
            <section aria-labelledby={revealId}>
              <h2 className={REVEAL_HEADING} id={revealId}>
                How the clue worked
              </h2>
              {definition !== null && <p className={REVEAL_LINE}>{`“${definition.marked}” is the definition.`}</p>}
              {fodder !== null && <p className={REVEAL_LINE}>{wordplayLine(device, fodder.marked, answer)}</p>}
            </section>
          )}
        </div>
      </div>

      {/* The band class rides a wrapper rather than FloorBar itself because FloorBar takes no
          `className` -- `children`, `message`, `resting` and `variant` are the whole of its props,
          and this component may not edit it.

          `compact`, because this bench's instrument is one row: the box you type in and the control
          that checks it. The floor is exactly as tall as the ribbon plus that row -- 119px, derived
          in the spec's §11 rather than imported from anywhere. */}
      <div className="lull-instrument">
        <FloorBar message={message()} resting={INSTRUCTION} variant="compact">
          <div className="flex shrink-0 items-center gap-[var(--lull-s3)] pt-[var(--lull-s3)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
            {/* The label is a SIBLING, not a wrapper. An sr-only element hides its subtree, so a
                wrapping label would take the field with it; `htmlFor` is the whole of the
                association.

                The component BUILDS this id out of the puzzle id, so both ends of the reference are
                asserted -- see the suite. The id is unique per puzzle and the shell mounts one
                board, so it cannot collide; it would collide the day two boards render at once. */}
            <label className="sr-only" htmlFor={`answer-${puzzle.id}`}>
              Your answer
            </label>
            <input
              // A cryptic answer IS a word, so spellcheck would work here -- and it stays off for
              // two better reasons: a red squiggle under a legitimate but wrong guess is noise this
              // board did not author, and iOS autocorrect rewriting a rare noun into a common one
              // silently changes a guess the player already typed. autoCapitalize stays off too:
              // cryptic answers are conventionally written in caps, normalizeAnswer folds case
              // anyway, and forced caps on iOS makes editing a mid-word typo worse for zero gain.
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className={FIELD}
              // Chrome ignores autocomplete="off" for a field its heuristics have claimed, and a
              // lone text input beside a submit-shaped button at the bottom of the viewport is the
              // credential shape. These three are the opt-outs the managers themselves honor, and
              // an injected overlay would land on a field that is 148px wide at a 320 viewport.
              data-1p-ignore
              data-form-type="other"
              data-lpignore="true"
              // Where the shell's keyboard mitigations do not land, the OS keyboard covers the floor
              // and its own action key is then the only control the player can reach. So it has to
              // do what the button does, and it is named for the job so the key reads "Go".
              enterKeyHint="go"
              id={`answer-${puzzle.id}`}
              onChange={(event) => change(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && check()}
              // readOnly, NOT disabled. A solved board takes no more keystrokes, but a disabled
              // input is dropped from the tab order and skipped by a screen reader's forms mode --
              // so the answer the player just won with would become unreachable and unreadable.
              // readOnly stays focusable, stays announced, and keeps the floor's own focus ring.
              readOnly={solved}
              spellCheck={false}
              type="text"
              value={guess}
            />
            {/* Two buttons rather than one that changes its mind, because they do not do the same
                thing to the board. The FIELD is not swapped with them: it holds the winning answer
                and it is the focused element at the moment of the win, so rebuilding this row would
                drop focus to <body>. React keeps a stable element type at a stable position, so the
                node, the caret and the selection all survive.

                Play again takes no `keepsFocusOnPress`. The composer contract exists to hold a
                keyboard open over a field being typed in; a solved board is readOnly and has
                nothing left to type. */}
            {solved ? (
              <Button className={CONTROL_SLOT} onClick={playAgain}>
                Play again
              </Button>
            ) : (
              <Button className={CONTROL_SLOT} keepsFocusOnPress onClick={check}>
                Check
              </Button>
            )}
          </div>
        </FloorBar>
      </div>
    </>
  )
}
