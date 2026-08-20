import Head from 'next/head'
import React from 'react'

const ServerError = (): React.ReactNode => (
  <>
    <Head>
      <title>Lull | Something went wrong</title>
      <meta content="Something went wrong at our end. Try again in a moment." name="description" />
    </Head>
    {/* max(1rem, inset) rather than px-4: viewport-fit=cover in _app.tsx lets the page reach under
        a notch in landscape. Floored at today's 16px, so nothing moves without a physical inset. */}
    <main className="mx-auto flex w-full max-w-[720px] flex-col items-start gap-4 py-10 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <h1 className="text-2xl text-[var(--lull-ink)]">Something went wrong at our end</h1>
      <p className="text-[var(--lull-ink-muted)]">Nothing you did caused this. Try again in a moment.</p>
      <a className="min-h-11 text-[var(--lull-accent)] underline" href="/">
        Back to today’s puzzles
      </a>
    </main>
  </>
)

export default ServerError
