import Link from 'next/link'
import React from 'react'

export interface Crumb {
  href?: string
  label: string
}

export interface SpineProps {
  trail: Crumb[]
}

// One element, reused between every pair of crumbs. It is decoration around the ordered
// list that already carries the sequence, so it is hidden rather than voiced -- a reader
// hearing "Lull, chevron, Wed 20 Aug, chevron, Cryptogram" learns nothing the list
// structure did not already say.
const SEPARATOR = (
  <svg
    aria-hidden="true"
    className="shrink-0 text-[var(--lull-rule)]"
    fill="none"
    height="10"
    viewBox="0 0 6 10"
    width="6"
  >
    <path d="m1 1 4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
  </svg>
)

// A bottom border rather than an underline, because the underline sits on the text
// baseline and collides with descenders at this size. It is still a non-colour signal,
// which is what keeps the links distinguishable for anyone who cannot see the hue
// difference against the current crumb (WCAG 1.4.1).
//
// The tap target is the whole 44px height of the bar, not the 21px the text occupies. A crumb is
// short -- "Lull" is about 28px wide -- so without an explicit box this is a ~28x21 target on the
// only navigation the product has, in an app whose manifest is display: standalone and therefore
// has no browser back button to fall back on. min-h-11 plus the horizontal padding clears 44x44;
// the border sits on an inner span so the underline still hugs the word rather than the box.
const LINK =
  'flex min-h-11 shrink-0 items-center whitespace-nowrap px-[var(--lull-s1)] ' +
  'text-[var(--lull-muted)] hover:text-[var(--lull-ink)]'

const LINK_TEXT = 'border-b border-[var(--lull-rule)]'

/**
 * The breadcrumb every surface wears, in place of a Back button. A crumb with no `href`
 * is the page you are on; there is no separate flag, so the two can never disagree.
 */
export const Spine = ({ trail }: SpineProps): React.ReactNode => (
  // 44px rather than 40: the crumbs inside are the app's only navigation and have to be a legal
  // touch target, and a 44px control cannot live in a 40px bar.
  //
  // The bar itself is the full width of the surface and the crumbs take their inset from the
  // <ol>'s own gutter padding, because the strip is drawn in the darker GROUND while the surface
  // it sits on is the plate: a band whose whole job is to read as a rule across the top of the
  // screen cannot stop 16px short of each edge.
  <nav aria-label="Breadcrumb" className="h-11 shrink-0 border-b border-[var(--lull-hair)] bg-[var(--lull-ground)]">
    <ol className="flex h-full items-center gap-[var(--lull-s2)] overflow-x-auto pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)] text-sm">
      {trail.map((crumb, index) => (
        <li className="flex shrink-0 items-center gap-[var(--lull-s2)]" key={crumb.label}>
          {index > 0 && SEPARATOR}
          {crumb.href === undefined ? (
            <span
              aria-current="page"
              className="flex shrink-0 items-center gap-[var(--lull-s1)] font-semibold whitespace-nowrap text-[var(--lull-ink)]"
            >
              {/* The pip is scenery. `aria-current` and the heavier weight are what say "you
                  are here", so the accent colour is never the only thing carrying it. */}
              <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-[var(--lull-accent)]" />
              {crumb.label}
            </span>
          ) : (
            <Link className={LINK} href={crumb.href}>
              {/* The rule hugs the word, not the 44px box: an underline stretched across the
                  whole tap target would read as a divider rather than as a link. */}
              <span className={LINK_TEXT}>{crumb.label}</span>
            </Link>
          )}
        </li>
      ))}
    </ol>
  </nav>
)
