import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

// The last resort. Storage and the registry both validate what they hand on, so nothing
// *known* reaches render broken -- but a render-time throw with nothing above it unmounts
// the React root and leaves a blank white page, which tells a player nothing and offers
// them nothing. Comments in this codebase used to cite "there is no error boundary above it" as
// the reason to be careful, which stopped being true when this shipped; they now name what a
// render throw actually costs, which is THIS -- the whole app, every surface, replaced by one
// sentence. A cheaper failure, and still the most expensive one the app has.
//
// WHAT IT DOES NOT CATCH is the half worth knowing, because two boards guard against it: React
// routes only RENDER-phase throws to a boundary. A throw inside an event handler escapes to
// window.onerror, leaves the DOM exactly as it was, and shows the player nothing at all -- so a
// wedged board with no message is not a lesser failure than this screen, it is a worse one.
//
// Deliberately a class. React has no hook equivalent -- getDerivedStateFromError and
// componentDidCatch exist only on classes.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('render failed', { error, info })
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Reload rather than a router push: the component tree that just threw is the one a
    // client-side navigation would keep. Copy says what to do, not what went wrong --
    // "an unexpected error occurred" gives a player nothing to act on.
    return (
      // No Spine here, and that is deliberate. This boundary catches a render that already
      // threw, so anything it draws has to be the least it can get away with -- a
      // breadcrumb is a component, and a component is another chance to throw inside the
      // handler for a throw. The other dead ends carry the trail; this one carries a
      // reload and nothing else.
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-[var(--lull-s4)] py-[var(--lull-s6)] pl-[var(--lull-gutter-left)] pr-[var(--lull-gutter-right)]">
        <h1 className="lull-sign text-3xl text-[var(--lull-ink)]">Lull got stuck</h1>
        <p className="text-[var(--lull-muted)]">
          Something went wrong drawing this page. Your solved puzzles are safe on this device.
        </p>
        {/* Two exits, because reloading is not one on its own. This boundary catches a render
            that threw, and a throw driven by the state of the device -- a malformed stored value,
            a pack this build cannot parse -- is deterministic: reloading re-runs the same render
            and lands right back here. The manifest is display: standalone, so there is no browser
            back button and no address bar to type an escape into either. The link home is the exit
            that changes what gets rendered; 404 and 500 both carry one and this surface had none.

            A plain anchor rather than a router push: the tree that just threw is the one a
            client-side navigation would keep. */}
        <div className="flex flex-wrap items-center gap-[var(--lull-s3)]">
          <a
            className="inline-flex min-h-11 items-center rounded-[var(--lull-pill)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] px-[var(--lull-s4)] font-semibold text-[var(--lull-ink)]"
            href="/"
          >
            Back to today’s puzzles
          </a>
          <button
            className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--lull-pill)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] px-[var(--lull-s4)] font-semibold text-[var(--lull-ink)]"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload Lull
          </button>
        </div>
      </main>
    )
  }
}
