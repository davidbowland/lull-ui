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
// them nothing. Several comments in this codebase cite "there is no error boundary above
// it" as a reason to be careful; this is that boundary.
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
      // Horizontal padding is max(1.5rem, inset) rather than the p-6 shorthand: this boundary wraps
      // every page in _app.tsx, and _app.tsx ships viewport-fit=cover. Floored at today's 24px.
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 py-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
        <h1 className="text-2xl text-[var(--lull-ink)]">Lull got stuck</h1>
        <p className="text-[var(--lull-ink-muted)]">
          Something went wrong drawing this page. Your solved puzzles are safe on this device.
        </p>
        <button
          className="min-h-11 cursor-pointer rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)]"
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload Lull
        </button>
      </main>
    )
  }
}
