import type { GetStaticPaths, GetStaticProps } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import { PuzzleFrame } from '@components/puzzle-frame'
import { puzzleIdFromPath } from '@utils/puzzle-path'

const PuzzlePage = (): React.ReactNode => {
  const router = useRouter()
  const [puzzleId, setPuzzleId] = useState<string | undefined>(undefined)

  // Read out of the address bar, not out of router.query. Every one of these pages is
  // the same exported document -- scripts/generate-dynamic-pages.js strips the
  // placeholder param out of __NEXT_DATA__ precisely so the router cannot answer with
  // it -- so the URL is the only place the id exists.
  useEffect(() => {
    // An id carries colons and is written into the URL one segment per colon. Rejoined
    // whole and passed along whole: past the date prefix it is opaque. The single encoded
    // segment older shared links carry rejoins to the same string -- see puzzle-path.ts.
    const id = puzzleIdFromPath(window.location.pathname)
    if (id !== null) {
      setPuzzleId(id)
    }
  }, [router.asPath])

  return (
    <>
      <Head>
        <title>Lull</title>
        <meta content="A puzzle to pass the time" name="description" />
        {/* Dated puzzle pages are unbounded in number and dead within the week.
            Deliberately NOT disallowed in robots.txt: link preview crawlers honor it,
            and blocking /p/ would break the unfurl on every shared puzzle. */}
        <meta content="noindex, follow" name="robots" />
        <meta content="Lull" property="og:title" />
        <meta content="A puzzle to pass the time" property="og:description" />
        <meta content="https://lull.dbowland.com/og-image.png" property="og:image" />
        <meta content="website" property="og:type" />
        <meta content="https://lull.dbowland.com/" property="og:url" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content="Lull" name="twitter:title" />
        <meta content="A puzzle to pass the time" name="twitter:description" />
        <meta content="https://lull.dbowland.com/og-image.png" name="twitter:image" />
      </Head>
      {/* gap-6 and py-10 live in PuzzleFrame's own <Flowed> wrapper rather than here, so a docked
          type can decline them: a keypad pinned to the bottom of the viewport needs the page to be
          a full-height column with no vertical padding above it to spend. The page cannot make that
          call itself -- the id is in the URL and the pack is on the device, so only the frame knows
          what type this is. */}
      {/* The gutter is NOT here, and it is not on the bench column inside either. Every band of a
          bench is full width and pays for its own text inset out of --lull-gutter-*, because the
          breadcrumb, the sign row and the hint bar are strips of ground whose rules have to reach
          both edges, and the board's own plate is the working surface rather than a card laid on
          one. A column that padded them would stop every one of those rules 16px short. So this
          element carries only the measure. See index.css, where the alternative -- padding the
          column and canceling it with a negative margin -- is recorded along with why it cannot
          work inside a scroll container.

          The full-height floor is `.lull-page` in index.css rather than `min-h-dvh` here: it
          subtracts --lull-kb so the column ends where an open software keyboard begins, which is
          a term a utility cannot carry. */}
      <main className="lull-page mx-auto flex w-full max-w-[720px] flex-col">
        <PuzzleFrame puzzleId={puzzleId} />
      </main>
    </>
  )
}

// One of the five pieces that make /p/<id> work under a static export, and they only
// work together: this placeholder, scripts/generate-dynamic-pages.js which renames what
// it produces, scripts/generate-sw-manifest.js which fails the build if that rename did
// not happen, UiUrlRewriteFunction in template.yaml, and shellFor() in public/sw.js.
// Change one and you must change all five.
//
// A CATCH-ALL route, because an id is spelled one segment per colon and [puzzleId] matches
// exactly one segment. Nothing in the export needs the extra segments -- the edge rewrites
// every /p/ path onto this one document and the page reads the address bar -- but `next
// dev` routes for real, so a single-segment route would 404 the whole new URL shape in
// development. The placeholder is an ARRAY for the same reason: that is the shape a
// catch-all param takes, and getStaticPaths rejects a bare string.
export const getStaticPaths: GetStaticPaths = () => {
  if (process.env.NODE_ENV === 'development') {
    return { fallback: 'blocking', paths: [] }
  }
  return { fallback: false, paths: [{ params: { puzzleId: ['__placeholder__'] } }] }
}

export const getStaticProps: GetStaticProps = () => ({ props: {} })

export default PuzzlePage
