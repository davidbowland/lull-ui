import '@fontsource/space-grotesk'
import type { AppProps } from 'next/app'
import React, { useEffect } from 'react'

import '@assets/css/index.css'
import { ErrorBoundary } from '@components/error-boundary'
import { usePrefetch } from '@hooks/usePrefetch'

export default function App({ Component, pageProps }: AppProps) {
  // Every page, not just the shelf. Opening any puzzle is what fills the device for the
  // next one, and this is the only caller -- without it the whole offline feature is
  // inert and a visitor gets exactly the pack they asked for.
  usePrefetch()

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
      <Component {...pageProps} />
    </ErrorBoundary>
  )
}
