import { render } from '@testing-library/react'
import React from 'react'

import App from '@pages/_app'

// Page tests live under test/ rather than beside the page: next.config.js sets
// pageExtensions to ts and tsx, so anything named *.tsx inside src/pages is a route,
// and a test file there would be exported as one.

// next/head defers its children to a head manager that only exists inside a running Next
// app, so under jsdom the real component renders nothing anywhere and there would be
// nothing to look at. Rendered inline instead, which leaves the assertion below about the
// element _app declares -- delete the meta or change its content and this fails.
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// The prefetch runs on every page and reaches the network. Nothing here is about it.
jest.mock('@hooks/usePrefetch', () => ({ usePrefetch: jest.fn() }))

// The dictionary provider runs on every page and reaches the network, so it is replaced by a
// passthrough -- but a jest.fn() passthrough rather than an anonymous one, because a transparent
// stand-in is exactly the thing that hides the wiring it stands in for. _app.tsx is the FEATURE'S
// ONLY PRODUCTION MOUNT, and with a nameless mock the whole element could be deleted from _app with
// all 1617 tests green: in production `useDictionary()` would then fall back to the context default
// { status: 'absent', words: null }, every Phrazle shelf row would become a non-link reading "Needs
// setup", every deep link would read "Phrazle needs a one-time download", and the word list would
// never be fetched at all.
//
// The name is prefixed `mock` because jest.mock's factory is hoisted above every const in this file
// and only that prefix is allowed through the out-of-scope check. `clearMocks` clears its CALLS
// between tests and leaves the implementation alone, which is why the passthrough survives.
//
// THE FACTORY HANDS BACK A WRAPPER, never the spy itself, and that is a temporal-dead-zone fix
// rather than a style. The factory is evaluated the moment `@pages/_app` imports the module, which
// is before this file's own `const` has been initialized -- naming the spy there throws
// `ReferenceError: Cannot access 'mockDictionaryProvider' before initialization`. The wrapper reads
// it when React renders instead, which is long after.
const mockDictionaryProvider = jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>)
jest.mock('@components/dictionary-provider', () => ({
  DictionaryProvider: (props: { children: React.ReactNode }) => mockDictionaryProvider(props),
}))

// WHAT the viewport meta buys -- env(safe-area-inset-*) resolving to a real number, the docked
// keypad clearing the home indicator, the flowed padding staying off the notch -- is layout, and
// jsdom has none. This repo also forbids style assertions, so a test that claimed to check any of
// it could not fail. The compiled CSS from `next build` is the evidence for the utilities and a
// real iOS device is the evidence for the insets; what is genuinely assertable here is that the
// app declares the tag at all, so that is all this asserts.
//
// interactive-widget=resizes-content is the second thing this tag buys, and it is the one the
// writing bench depends on: without it Chrome leaves the layout viewport alone when the software
// keyboard opens, so the floor -- and the answer field that sits in it -- ends up behind the
// keyboard. Which of the two halves is load-bearing is not assertable here either; that the app
// asks for both is.
describe('App', () => {
  const Page = (): React.ReactNode => <h1>A page</h1>

  it('asks for the full display area, and for room when the keyboard opens', () => {
    render(<App Component={Page} pageProps={{}} router={{} as never} />)

    // document.head, not the render container: React 19 hoists metadata elements out of the tree
    // they are written in and into the head by itself.
    //
    // Two assertions rather than one pinned string, because the two keys are independent asks with
    // different beneficiaries -- and a pin names neither when it fails. Whichever one a future edit
    // drops, the failure says which.
    const content = document.head.querySelector('meta[name="viewport"]')?.getAttribute('content')

    expect(content).toContain('viewport-fit=cover')
    expect(content).toContain('interactive-widget=resizes-content')
  })

  // THE ONE PLACE THE DICTIONARY IS WIRED UP IN PRODUCTION. One provider per app open is what makes
  // the word list one fetch and one 51,852-entry Set however many surfaces read it, and _app is its
  // only mount site anywhere in src/ -- so this assertion is the whole of what stands between the
  // feature and being silently inert.
  //
  // Mounted ONCE, which is the half a bare "was called" would not say: two providers would mean two
  // fetches and two Sets, and every consumer reading whichever one sits nearer.
  //
  // REDDENS ON: deleting <DictionaryProvider> from _app.tsx and returning <Head> and <Component>
  // directly, which leaves every other test in this file green.
  it('puts one dictionary provider over the page', () => {
    render(<App Component={Page} pageProps={{}} router={{} as never} />)

    expect(mockDictionaryProvider).toHaveBeenCalledTimes(1)
  })

  // By role, and that is the point: _app wraps the page in an error boundary and a head, so
  // the page's own heading has to come back out of the accessibility tree exactly once, not
  // buried in an aria-hidden subtree and not doubled by anything the shell adds.
  it('renders the page it is given', () => {
    const { getByRole } = render(<App Component={Page} pageProps={{}} router={{} as never} />)

    expect(getByRole('heading', { level: 1, name: 'A page' })).toBeInTheDocument()
  })
})
