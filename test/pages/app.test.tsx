import { render } from '@testing-library/react'
import { axe } from 'jest-axe'
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

// WHAT the viewport meta buys -- env(safe-area-inset-*) resolving to a real number, the docked
// keypad clearing the home indicator, the flowed padding staying off the notch -- is layout, and
// jsdom has none. This repo also forbids style assertions, so a test that claimed to check any of
// it could not fail. The compiled CSS from `next build` is the evidence for the utilities and a
// real iOS device is the evidence for the insets; what is genuinely assertable here is that the
// app declares the tag at all, so that is all this asserts.
describe('App', () => {
  const Page = (): React.ReactNode => <h1>A page</h1>

  it('asks iOS for the full display area, so the safe-area insets are not zero', () => {
    render(<App Component={Page} pageProps={{}} router={{} as never} />)

    // document.head, not the render container: React 19 hoists metadata elements out of the tree
    // they are written in and into the head by itself.
    expect(document.head.querySelector('meta[name="viewport"]')).toHaveAttribute(
      'content',
      'width=device-width, initial-scale=1, viewport-fit=cover',
    )
  })

  it('renders the page it is given', () => {
    const { getByRole } = render(<App Component={Page} pageProps={{}} router={{} as never} />)

    expect(getByRole('heading', { level: 1, name: 'A page' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<App Component={Page} pageProps={{}} router={{} as never} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
