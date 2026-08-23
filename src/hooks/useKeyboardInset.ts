import { useEffect } from 'react'

// THE ONLY CUSTOM PROPERTY IN THIS APP WRITTEN FROM JS, and worth saying out loud because every
// other token is declared in index.css and never moves. This one is the height of a software
// keyboard, which nothing but the device knows.
//
// Exported so a test can hold the two things a typo here would break in silence: the property is
// named `--lull-kb`, and the value carries a unit. Misname it and index.css goes on reading the
// `0px` declared in :root, so the bench never moves; drop the unit and `calc(100dvh - 300)` is
// invalid at computed-value time, max-height falls to its initial `none`, and the ceiling is gone
// rather than merely stuck. Either way the keyboard covers the field with every other test in the
// suite still green, because they all assert against an injected writer instead.
export const setInset = (px: number): void => document.documentElement.style.setProperty('--lull-kb', `${px}px`)

/**
 * How much of the window a software keyboard is covering, published as `--lull-kb`.
 *
 * It exists because neither engine shrinks the LAYOUT viewport for a keyboard on its own. Chrome
 * Android is told to by `interactive-widget=resizes-content` in the viewport meta; iOS Safari
 * implements no such key at all, so on that platform this is the only thing standing between the
 * writing bench's answer field and a keyboard drawn over the top of it.
 *
 * `write` is injected so the tests assert a call rather than read a style, and it defaults to a
 * module-level constant so the effect's dependency array is stable.
 */
export const useKeyboardInset = (write: (px: number) => void = setInset): void => {
  useEffect(() => {
    const viewport = window.visualViewport
    // Absent in jsdom and on old engines. Not a static-export guard -- an effect never runs
    // during prerender -- so the reason is the environment rather than the render.
    if (!viewport) return

    // The last value published, so a measurement that has not moved is not written again. The
    // `scroll` event on the visual viewport fires per frame while a page is panning, and every
    // write here sets an inline custom property on <html> that index.css reads in a `max-height`
    // -- so an unguarded write is a document-wide style invalidation per frame. The rounding below
    // is what makes this bite: without it a fractional device pixel ratio makes almost every frame
    // a "new" value. Together they are the coalescing this hook needs, and they cost no timer --
    // which matters, because a real `setTimeout` in the fix would break the determinism rule the
    // fix is meant to respect.
    let published: number | null = null

    const update = (): void => {
      // A PINCH-ZOOM IS NOT A KEYBOARD. Zooming shrinks the visual viewport while the layout
      // viewport stands still, so the subtraction below reads it as several hundred pixels of
      // covered screen and takes the bench apart for a gesture the player made in order to read
      // something.
      //
      // IT LEAVES THE LAST VALUE STANDING rather than writing 0, and the difference is a live
      // failure rather than a nicety: a player who pinches to re-read the clue WHILE the keyboard
      // is up would otherwise have the bench grow back to full height behind it, putting the
      // keyboard back over the field they are typing in -- the exact thing this hook exists to
      // prevent, triggered by the gesture the comment above says is harmless.
      //
      // Zooming out is not guarded and needs no guard: the visual viewport is then larger than the
      // layout viewport, the subtraction goes negative, and the clamp below catches it.
      if (viewport.scale > 1) return

      // `offsetTop` is what stops this OVER-reporting. Where the browser has panned the visual
      // viewport down inside the layout viewport, the space below it is smaller than
      // `innerHeight - height` by exactly that offset.
      //
      // `Math.max(0, ...)` is the other direction: a retracting URL bar can leave the visual
      // viewport taller than the layout viewport, and a negative inset would GROW the bench.
      //
      // Rounded because the two sides are different kinds of number: `innerHeight` is an integer
      // and the viewport's own measurements are doubles, so at a fractional device pixel ratio the
      // at-rest answer is 0.3999999999999773 rather than 0 -- written to the DOM, in full, on
      // every event.
      const covered = Math.round(Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop)))
      if (covered === published) return
      published = covered
      write(covered)
    }
    update()

    // Both events, because iOS Safari reports a keyboard through `scroll` on the visual viewport
    // and not through `resize`.
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      // PUT IT BACK, rather than merely unsubscribing. A stale inset outliving the surface that
      // measured it is the exact failure that put this hook in _app rather than in the frame.
      //
      // In production this runs approximately never -- _app mounts the hook once for the life of
      // the document -- so it is here for React's development double-invoke and for whoever moves
      // the call site later, not for a case the app reaches today.
      write(0)
    }
  }, [write])
}
