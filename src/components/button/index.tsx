import React from 'react'

export interface ButtonProps {
  'aria-controls'?: string
  'aria-disabled'?: boolean
  'aria-expanded'?: boolean
  'aria-label'?: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
  // THE COMPOSER CONTRACT: this press does not take focus off whatever holds it. The writing bench
  // asks for it on Check so the software keyboard stays up over the answer field and the layout does
  // not jump at the moment the ribbon's message lands -- the same thing every messaging app teaches
  // by not collapsing the keyboard when you press Send. Every other caller omits it and nothing
  // changes.
  //
  // A BOOLEAN THE PRIMITIVE OWNS, and not a forwarded event handler. Forwarding shipped first and
  // was worse three ways: it let a caller run arbitrary code inside a press, it broke the event-free
  // shape `onClick?: () => void` sets for this component, and -- the one that actually bites -- it
  // let a caller wire one of the two events and not the other, which is exactly the engine gap this
  // exists to close.
  keepsFocusOnPress?: boolean
  onClick?: () => void
  size?: 'md' | 'sm'
  trailing?: React.ReactNode
  variant?: 'default' | 'floorPrimary' | 'primary' | 'quiet'
}

// min-h-11 is 44px, the smallest target a thumb can be asked to find (WCAG 2.5.5). The easing is
// named rather than linear or ease-in-out on purpose: a control that starts and stops at the same
// speed reads as a slide, and the press is supposed to read as weight settling.
const BASE =
  'inline-flex min-h-11 cursor-pointer items-center gap-[var(--lull-s2)] rounded-[var(--lull-pill)] ' +
  'font-semibold transition-transform duration-[380ms] ease-[cubic-bezier(0.22,0.68,0.12,1)] ' +
  // The spent state is drawn with a token color, never with opacity. CSS opacity
  // composites the element's whole rendering as one group -- border, background, AND
  // outline -- so `opacity-50` halved the focus ring of the one control this component
  // deliberately keeps in the tab order: 2.21:1 in light mode, against the 3:1 that 2.4.11
  // requires and which grants no inactive-component exemption to something still focusable
  // and still announced. Opacity cannot be scoped to exclude the outline, so the state has
  // to be expressed in color instead.
  'active:scale-[0.98] aria-disabled:cursor-default aria-disabled:text-[var(--lull-muted)]'

// The accent appears in exactly three places in the whole product -- the you-are-here pip on the
// breadcrumb, the selected cipher square, and a primary button -- so a surface that fills two
// controls has spent it twice and neither one is the offer any more.
//
// quiet carries no border, like the install card's dismissal, and for the same reason: a bordered
// second control reads as a second offer of equal weight beside the one the surface exists to
// present.
const VARIANT = {
  default:
    'border border-[var(--lull-rule)] bg-[var(--lull-raised)] text-[var(--lull-ink)] ' +
    'shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)]',
  // The primary offer ON THE FLOOR, which needs its own pair rather than reusing `primary`.
  //
  // --lull-accent is chosen to read on the light grounds and measures 1.919:1 against the floor,
  // so a `primary` button docked in the instrument was a shape whose edges a light-mode reader
  // could not see -- only the text inside it was legible. The floor is dark in BOTH themes,
  // which is the trap: in dark mode accent and floorAccent are the same value and the pair is
  // fine, so checking dark mode hides it completely. contrast.test.ts already asserted this pair
  // was unusable while a shipping component drew it; the test proved the ratio and nothing
  // checked that no component used it.
  //
  // floorAccent measures 7.074:1 on the light floor and 8.780:1 on the dark one, and the floor
  // reversed onto it is the same pair the other way round.
  floorPrimary: 'border border-[var(--lull-floor-accent)] bg-[var(--lull-floor-accent)] text-[var(--lull-floor)]',
  primary: 'border border-[var(--lull-accent)] bg-[var(--lull-accent)] text-[var(--lull-on-accent)]',
  quiet: 'text-[var(--lull-muted)] hover:text-[var(--lull-ink)]',
} as const

const SIZE = { md: 'px-[var(--lull-s4)] text-[15px]', sm: 'px-[var(--lull-s3)] text-[13.5px]' } as const

// A button inside the button. An arrow set naked beside the label reads as punctuation on the
// word; inside its own circle it reads as the place the press goes. The tint comes from
// currentColor so the nub follows whichever variant it lands in rather than needing one rule per
// variant -- and so it can never pick a color that fails against its own face.
const NUB = 'flex size-8 items-center justify-center rounded-[var(--lull-pill)] bg-current/10'

export const Button = ({
  'aria-controls': ariaControls,
  'aria-disabled': ariaDisabled,
  'aria-expanded': ariaExpanded,
  'aria-label': ariaLabel,
  children,
  className,
  disabled,
  keepsFocusOnPress,
  onClick,
  size = 'md',
  trailing,
  variant = 'default',
}: ButtonProps): React.ReactNode => {
  // A browser blurs an element that becomes `disabled` while it holds focus: focus falls to
  // <body> and the next Tab restarts at the top of the document, which once meant fourteen
  // traversals to get back to a puzzle. So a control that stays on screen goes aria-disabled --
  // still focusable, still announced -- and this guard is what actually refuses the press.
  const handleClick = (): void => {
    if (ariaDisabled === true) return
    onClick?.()
  }

  // Focus-on-press is the DEFAULT ACTION of the pointer sequence, so refusing that default is the
  // whole mechanism -- there is nothing to blur and nothing to restore, because focus never moves.
  //
  // BOTH EVENTS, and the pair is the point rather than belt and braces. Per Pointer Events,
  // canceling `pointerdown` suppresses the compatibility mouse events, and with them the focus,
  // while leaving `click` alone -- but that mapping has been implemented unevenly, and preventing
  // `mousedown` is the older pattern every composer on the web already rests on. Where the first is
  // honored the second never fires at all, so naming both costs nothing and covers the engine this
  // change cannot test: iOS Safari, which is the writing bench's release gate.
  //
  // Attached only when asked for, so a control that never wanted this carries no listeners.
  //
  // NOT routed through handleClick's aria-disabled guard. That guard refuses an ACTIVATION; this
  // refuses a focus change, and a spent control that quietly started stealing focus back would be a
  // worse answer than one that simply does not move it.
  const refusePress =
    keepsFocusOnPress === true ? (event: React.SyntheticEvent): void => event.preventDefault() : undefined

  return (
    <button
      aria-controls={ariaControls}
      aria-disabled={ariaDisabled}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      // The nub sits flush with the right inner edge, so the padding that would hold a word
      // shrinks to the ring of ground the circle needs.
      className={[BASE, VARIANT[variant], SIZE[size], trailing === undefined ? '' : 'pr-[6px]', className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      onClick={handleClick}
      onMouseDown={refusePress}
      onPointerDown={refusePress}
      type="button"
    >
      {children}
      {trailing === undefined ? null : (
        // Hidden from the accessible name: WCAG 2.5.3 wants the name to be the label a speaking
        // user would say, and nobody says "Install right arrow".
        <span aria-hidden className={NUB}>
          {trailing}
        </span>
      )}
    </button>
  )
}
