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
    {/* NO horizontal padding, and that is the same decision every band of a bench makes: the
        breadcrumb is a strip of the darker ground with a rule under it, and a page that padded it
        would stop that rule 16px short of each edge, which reads as a card rather than as a band.
        So the page carries only the measure, and everything inside it pays for its own inset out
        of --lull-gutter-*, which is max(16px, inset) -- _app.tsx ships viewport-fit=cover, so on a
        notched phone in landscape the content moves off the cutout and nothing moves anywhere else.

        No vertical padding and no title of its own. The shelf opens with the spine, which has to
        sit flush against the top of the column the way it does on every other surface, and the
        name of the product is the spine's first crumb -- a second "Lull" above it would be the
        same word twice on the one screen that already has a focal point. The date plate IS the
        title here, so the <h1> lives with the fact it names, inside the shelf, where the day is
        known. */}
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col">
      <Shelf />
    </main>
  </>
)

export default Index
