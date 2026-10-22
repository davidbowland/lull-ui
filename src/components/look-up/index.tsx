import React from 'react'

import { ExternalMark } from '@components/button/external-mark'
import { LINK, LINK_TEXT } from '@components/spine'

export interface LookUpProps {
  answer: string
  // Words the pack shipped beside the answer -- Themed Anagrams' theme, a phrase's category --
  // added to the search so "python" under "Jungle animals" finds the snake. Search text only: the
  // link's name stays "Look up {answer} on DuckDuckGo".
  context?: string
}

// The answer comes out of a pack, and a cached pack is only as trustworthy as the localStorage it
// sits in. encodeURIComponent throws URIError on a lone surrogate, and a throw during render takes
// the whole board down, so the string is made well-formed first. String.prototype.toWellFormed
// does exactly this, but it is ES2024 and the TS lib here is ES2023, so the regex says it instead:
// a high surrogate with no low one after it, or a low surrogate with no high one before it,
// becomes U+FFFD.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

// With context, the answer goes in double quotes so DuckDuckGo matches it as an exact phrase and the
// context words only add weight to the search. A category the model wrote oddly ("Tableware Symbol"
// on SILVER SPOON) then cannot pull the results away from the phrase. A blank context is treated as
// none, so a pack that shipped "" searches exactly as it did before context existed. The typeof is
// for the same untrusted cache the surrogate check is for: a category stored as a number would
// otherwise throw on `.trim()` during render.
const queryOf = (answer: string, context?: string): string => {
  const extra = typeof context === 'string' ? context.trim() : ''
  return extra === '' ? answer : `"${answer}" ${extra}`
}

const lookUpUrl = (answer: string, context?: string): string =>
  'https://www.duckduckgo.com/?q=' + encodeURIComponent(queryOf(answer, context).replace(LONE_SURROGATE, '\uFFFD'))

// Spine's link look, at Button's SIZE.sm type size. The 13.5px is restated rather than imported:
// SIZE is an object of two variants, and exporting it for one string is more coupling than a
// literal with this comment beside it.
const CLASS = `${LINK} gap-[var(--lull-s1)] text-[13.5px]`

// THE SETTLE, shared by the two boards that turn their puzzle text into the answer before this link
// appears beside it -- Missing Vowels' plate and a right Themed Anagrams row. 380ms on --lull-float
// is Button's own press (spelled out, because Tailwind's arbitrary ease takes a literal), so a
// settle adds no motion the app did not already have, and motion-reduce makes it instant. Each
// board adds its own `starting:opacity-0` where the element it fades is freshly mounted.
export const SETTLE =
  'transition-opacity duration-[380ms] ease-[cubic-bezier(0.22,0.68,0.12,1)] motion-reduce:transition-none'

/**
 * A plain link that searches DuckDuckGo for a solved answer, in a new tab. It is an anchor rather
 * than a Button because Button renders only `<button>`, and this must be a real link: nothing is
 * requested until the tap, and the browser owns what happens after it.
 *
 * Cryptogram passes no context. Its answer is already a whole sentence, often ending in
 * " - Author", and quoting that string would make the author's name part of the exact match.
 */
export const LookUp = ({ answer, context }: LookUpProps): React.ReactNode => (
  <a className={CLASS} href={lookUpUrl(answer, context)} rel="noopener noreferrer" target="_blank">
    <span className={LINK_TEXT}>Look up</span>
    {/* The mark says "leaves the app" to the eye. The sr-only tail says what and where in words,
        so the accessible name is "Look up {answer} on DuckDuckGo" -- visible label first (WCAG
        2.5.3), and unique per answer when a board shows four of them (2.4.4). */}
    <ExternalMark />
    <span className="sr-only"> {answer} on DuckDuckGo</span>
  </a>
)
