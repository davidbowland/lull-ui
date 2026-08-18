import Head from 'next/head'
import React from 'react'

// Also what CloudFront serves for a 403: S3 answers a missing key with AccessDenied
// when it is fronted by an origin access identity, and the reader's question is the
// same either way.
const NotFound = (): React.ReactNode => (
  <>
    <Head>
      <title>Lull | Not found</title>
      <meta content="That page doesn’t exist. Head back to today’s puzzles." name="description" />
    </Head>
    <main className="mx-auto flex w-full max-w-[720px] flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl text-[var(--lull-ink)]">That page doesn’t exist</h1>
      <p className="text-[var(--lull-ink-muted)]">The link may be wrong, or the page may have moved.</p>
      <a className="min-h-11 text-[var(--lull-accent)] underline" href="/">
        Back to today’s puzzles
      </a>
    </main>
  </>
)

export default NotFound
