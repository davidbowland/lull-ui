import Head from 'next/head'
import React from 'react'

const ServerError = (): React.ReactNode => (
  <>
    <Head>
      <title>Lull | Something went wrong</title>
      <meta content="Something went wrong at our end. Try again in a moment." name="description" />
    </Head>
    <main className="mx-auto flex w-full max-w-[720px] flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl text-[var(--lull-ink)]">Something went wrong at our end</h1>
      <p className="text-[var(--lull-ink-muted)]">Nothing you did caused this. Try again in a moment.</p>
      <a className="min-h-11 text-[var(--lull-accent)] underline" href="/">
        Back to today’s puzzles
      </a>
    </main>
  </>
)

export default ServerError
