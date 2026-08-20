import Head from 'next/head'
import React from 'react'

import { Shelf } from '@components/shelf'

const Index = (): React.ReactNode => (
  <>
    <Head>
      <title>Lull | dbowland.com</title>
      {/* One tagline, used four times: here, the manifest description, the og and
          twitter descriptions, and the og image. A product that describes itself
          differently in each place reads as four products. */}
      <meta content="A puzzle to pass the time" name="description" />
      <link href="https://lull.dbowland.com/" rel="canonical" />
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
    {/* The horizontal padding is max(1rem, inset) rather than px-4 because _app.tsx now ships
        viewport-fit=cover, which lets the page reach under a notch in landscape. The max floor is
        today's 16px, so nothing moves on a device with no physical inset; it grows only where one
        exists. The shelf is full-bleed rows against this padding, so it is the page that would
        lose a tap target to the notch. */}
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 py-10 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <div>
        <h1 className="text-3xl text-[var(--lull-ink)]">Lull</h1>
        <p className="text-[var(--lull-ink-muted)]">A puzzle to pass the time</p>
      </div>
      <Shelf />
    </main>
  </>
)

export default Index
