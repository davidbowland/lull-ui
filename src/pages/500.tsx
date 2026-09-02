import Head from 'next/head'
import React from 'react'

import { Spine } from '@components/spine'

// The trail stops here, as it does on 404: a dead end is where knowing your position
// matters most, so it carries the same spine as every other surface rather than a bare
// link out.
const ServerError = (): React.ReactNode => (
  <>
    <Head>
      <title>Lull | Something went wrong</title>
      <meta content="Something went wrong at our end. Try again in a moment." name="description" />
      {/* See the note in `404.tsx`. */}
      <meta content="noindex, follow" name="robots" />
    </Head>
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col">
      <Spine trail={[{ href: '/', label: 'Lull' }, { label: 'Something went wrong' }]} />
      {/* Absolves the reader in the second line, because the first thing a player assumes
          about a broken page is that they broke it. */}
      <div className="flex flex-col items-start gap-[var(--lull-s4)] py-[var(--lull-s8)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
        <h1 className="lull-sign text-3xl text-[var(--lull-ink)]">Something went wrong at our end</h1>
        <p className="text-[var(--lull-muted)]">Nothing you did caused this. Try again in a moment.</p>
        <a
          className="inline-flex min-h-11 items-center rounded-[var(--lull-pill)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] px-[var(--lull-s4)] font-semibold text-[var(--lull-ink)]"
          href="/"
        >
          Back to today’s puzzles
        </a>
      </div>
    </main>
  </>
)

export default ServerError
