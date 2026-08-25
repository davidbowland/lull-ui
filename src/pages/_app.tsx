import '@fontsource-variable/source-serif-4'
import '@fontsource/baskervville'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import React, { useEffect } from 'react'

import '@assets/css/index.css'
import { DictionaryProvider } from '@components/dictionary-provider'
import { ErrorBoundary } from '@components/error-boundary'
import { useKeyboardInset } from '@hooks/useKeyboardInset'
import { usePrefetch } from '@hooks/usePrefetch'

export default function App({ Component, pageProps }: AppProps) {
  // Every page, not just the shelf. Opening any puzzle is what fills the device for the
  // next one, and this is the only caller -- without it the whole offline feature is
  // inert and a visitor gets exactly the pack they asked for.
  usePrefetch()

  // Publishes `--lull-kb`, which index.css subtracts from the bench's ceiling. Here rather than in
  // PuzzleFrame because the token is page geometry of the same kind as --lull-gutter-*, and a
  // per-surface mount would leave a stale inset behind on navigation.
  useKeyboardInset()

  useEffect(() => {
    // _document.tsx sets this class before first paint so there is no flash of the
    // wrong theme; this keeps it right when the system setting changes mid-session.
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const paint = (matches: boolean): void => void document.documentElement.classList.toggle('dark', matches)
    paint(query.matches)
    const onChange = (event: MediaQueryListEvent): void => paint(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in window.navigator)) return

    // Production only. `next dev` serves every /_next/ chunk from a stable, unhashed URL
    // marked no-store, but sw.js treats that whole prefix as immutable and answers it
    // cache-first forever -- an assumption that only holds for an exported build. The
    // first dev build a worker sees is then the one it keeps handing back, the webpack
    // runtime no longer matches the hash the HMR socket reports, and Next answers the
    // failed update with location.reload() -- served the same stale chunks, without end.
    //
    // Unregistering rather than merely skipping, because `npm run build && npx serve out`
    // puts a real worker on the same localhost origin as the dev server and it outlives
    // the build that installed it.
    if (process.env.NODE_ENV !== 'production') {
      window.navigator.serviceWorker.getRegistrations().then(
        (registrations) => registrations.forEach((registration) => registration.unregister()),
        (error: unknown) => console.error('service worker cleanup failed', { error }),
      )
      return
    }

    // Registration failing is not worth showing anyone: the site works without a worker,
    // it just cannot open with no connection.
    window.navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('service worker registration failed', { error })
    })
  }, [])

  return (
    <ErrorBoundary>
      {/* Here rather than _document.tsx: Next warns about a viewport meta in a custom document
          ("viewport meta tags should not be used in _document.js's <Head>"), because the document
          head is rendered once at build time and a page cannot amend it. _app is the documented
          home for it in the Pages Router.

          viewport-fit=cover is what makes env(safe-area-inset-*) resolve to anything. Without it
          iOS insets the layout viewport itself, every inset reads 0, and the docked cryptogram
          column's pb-[env(safe-area-inset-bottom)] reserves nothing -- so the bottom keypad row
          renders inside the home indicator strip and the system swallows taps there.

          It is page-wide and cannot be scoped to one puzzle type: /p/<id> is ONE exported document
          serving every type. That is why the horizontal padding on every top-level <main> is written
          as max(today's value, the inset) -- cover lets content reach the notch in landscape, and
          those maxes are what keep it off.

          interactive-widget=resizes-content is the other half, and it is what makes the floor a
          safe place for a text field. The default is resizes-visual: the software keyboard is
          drawn OVER a layout viewport that does not change, so 100dvh keeps its old value, the
          bench keeps its old height, and the floor stays pinned behind the keyboard. Under
          resizes-content the ICB shrinks to the space above the keyboard, the bench's flex column
          re-lays out, and the board band absorbs the loss.

          WHERE EXACTLY THE INSTRUMENT LANDS IS NOT SETTLED HERE, and the earlier claim that it sits
          on the keyboard's top edge was one measurement too confident. The floor adds
          env(safe-area-inset-bottom) on top of its own height, so it lands the system navigation
          bar's height above the keyboard unless the engine zeroes that inset once the ICB has
          shrunk clear of it. Nothing in this repo can answer that; the spec's device checklist asks
          it as a step.

          It manifests on exactly one bench, because the writing bench owns every <input> in the
          product -- the other three benches read keystrokes off a window-level handler and render
          no editable field. iOS Safari implements the key not at all, which is what
          useKeyboardInset in this same file is for. */}
      {/* INSIDE ErrorBoundary, not outside it. The boundary's whole job is to be the last thing
          standing when a render throws, and a provider above it would be a second thing that could
          throw with nothing to catch it.

          It is the SHELL'S, and one provider is what makes the word list one fetch and one Set per
          app open however many surfaces read it -- see the note on DictionaryProvider itself for
          what it owns and why. A board may never call its hook. */}
      <DictionaryProvider>
        <Head>
          <meta
            content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
            name="viewport"
          />
        </Head>
        <Component {...pageProps} />
      </DictionaryProvider>
    </ErrorBoundary>
  )
}
