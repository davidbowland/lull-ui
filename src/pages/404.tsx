import Head from 'next/head'
import React from 'react'

import { Spine } from '@components/spine'

// Also what CloudFront serves for a 403: S3 answers a missing key with AccessDenied
// when it is fronted by an origin access identity, and the reader's question is the
// same either way.
//
// The trail stops at Lull, and that is the whole navigation on this page. A dead end is
// where knowing your position matters most, so it carries the same spine as every other
// surface rather than a bare link out -- and the crumb has no href because this page IS
// where you are, however little you meant to be here.
const NotFound = (): React.ReactNode => (
  <>
    <Head>
      <title>Lull | Not found</title>
      <meta content="That page doesn’t exist. Head back to today’s puzzles." name="description" />
      {/*
        An error message is not a search result. `next-sitemap.config.js` already excludes this
        route on the assumption this tag is here -- but a sitemap only withdraws an invitation,
        and the tag is what actually keeps the page out of an index. `follow`, not `nofollow`:
        the way out of here is worth crawling.
      */}
      <meta content="noindex, follow" name="robots" />
    </Head>
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col">
      <Spine trail={[{ href: '/', label: 'Lull' }, { label: 'Not found' }]} />
      {/* Concierge: the fact, then the next step, then stop. Both sentences are true and
          the reader cannot tell which applies, so the page does not guess. */}
      <div className="flex flex-col items-start gap-[var(--lull-s4)] py-[var(--lull-s8)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
        <h1 className="lull-sign text-3xl text-[var(--lull-ink)]">That page doesn’t exist</h1>
        <p className="text-[var(--lull-muted)]">The link may be wrong, or the page may have moved.</p>
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

export default NotFound
