import type { GetStaticPaths, GetStaticProps } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import { PuzzleFrame } from '@components/puzzle-frame'

const PuzzlePage = (): React.ReactNode => {
  const router = useRouter()
  const [puzzleId, setPuzzleId] = useState<string | undefined>(undefined)

  // Read out of the address bar, not out of router.query. Every one of these pages is
  // the same exported document -- scripts/generate-dynamic-pages.js strips the
  // placeholder param out of __NEXT_DATA__ precisely so the router cannot answer with
  // it -- so the URL is the only place the id exists.
  useEffect(() => {
    const match = window.location.pathname.match(/\/p\/([^/]+)/)
    if (match) {
      // An id carries colons and is written into the URL encoded. Decoded whole and
      // passed along whole: past the date prefix it is opaque.
      setPuzzleId(decodeURIComponent(match[1]))
    }
  }, [router.asPath])

  return (
    <>
      <Head>
        <title>Lull</title>
        <meta content="A puzzle to pass the time" name="description" />
        {/* Dated puzzle pages are unbounded in number and dead within the week.
            Deliberately NOT disallowed in robots.txt: link preview crawlers honour it,
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
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-10">
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
export const getStaticPaths: GetStaticPaths = () => {
  if (process.env.NODE_ENV === 'development') {
    return { fallback: 'blocking', paths: [] }
  }
  return { fallback: false, paths: [{ params: { puzzleId: '__placeholder__' } }] }
}

export const getStaticProps: GetStaticProps = () => ({ props: {} })

export default PuzzlePage
